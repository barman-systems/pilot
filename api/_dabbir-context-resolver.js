// A reference names a source and fields, never a tenant or an execution target.
// Resolve against the trusted working context; a transcript is not authority.
const arr=v=>Array.isArray(v)?v:[];
const fields=['service','worker','vehicle','location'];
const sources=new Set(['DATABASE_FACT','CUSTOMER_CONFIRMED','CUSTOMER_STATED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','PROVIDER_VERIFIED']);
const active=f=>f?.status==='active'&&f.value!=null&&f.confidence>=.9&&sources.has(f.source);
const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase();
const day=(v,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const kind=m=>String(m?.memory_key||'').replace(/^last_verified_|^preferred_|^known_|^usual_/,'');
const scope=(row,c)=>row?.business_id===c.business?.id&&row.customer_id===c.customer?.id&&row.branch_id===c.conversation?.branch_id;
const catalog=(rows,c)=>arr(rows).filter(r=>(!r.business_id||r.business_id===c.business?.id)&&(!r.branch_id||r.branch_id===c.conversation?.branch_id));

// An explicit noun constrains an ordinal's target. A displayed slot list does
// not turn "the second car" into approval to book the second slot.
export function ordinalReferenceField(raw){
 const t=normalize(raw),matches=[];
 for(const [field,pattern] of [['vehicle',/سيار|\b(?:car|vehicle)s?\b/],['worker',/عامل|موظف|\b(?:worker|staff|employee)\b/],['service',/خدم|\bservice\b/],['branch',/فرع|\bbranch\b/],['appointment',/موعد|حجز|\b(?:appointment|booking|slot)\b/]])if(pattern.test(t))matches.push(field);
 return matches.length===1?matches[0]:matches.length?'multiple_options':null;
}

export function referenceRequest(raw,proposal=null){
 const t=normalize(raw);
 const reference=/(?:نفس|اللي قلت|قلت لك|اللي قبل|مثل اخر|مثل آخر|same|last time|told you|as before)/i.test(t);
 if(!reference)return null;
 // Explicit temporal anchors outrank a provider's proposed source category.
 const source=/امس|yesterday/.test(t)?'YESTERDAY':/(?:اخر مره|المره اللي طافت|اللي قبل|last time|last visit|as before)/.test(t)?'LAST_COMPLETED':'ACTIVE_OR_MEMORY';
 const requested=[];
 for(const [field,pattern] of [['vehicle',/سيار|vehicle|\bcar\b/],['worker',/عامل|موظف|worker|staff/],['location',/مكان|موقع|location|place|address/],['service',/خدم|service/]])if(pattern.test(t))requested.push(field);
 const p=proposal?.contextReference;
 if(!requested.length&&p&&p.confidence>=.9&&typeof p.evidence==='string'&&p.evidence.trim()&&String(raw).includes(p.evidence)&&arr(p.fields).every(k=>fields.includes(k)))requested.push(...p.fields);
 return {source,fields:[...new Set(requested.length?requested:fields)],explicitFields:requested.length>0};
}

function memoryValue(m,k,c){
 let value=m.value?.id??m.value?.value;
 if(k==='service'&&!catalog(c.services,c).some(r=>r.id===value))return null;
 if(k==='worker'&&!catalog(c.workers,c).some(r=>r.id===value))return null;
 if(k==='vehicle'){value=m.value?.vehicle_type??value;if(!['saloon','station'].includes(value))return null;}
 if(k==='location'){
  value=m.value?.value||m.value;
  if(!Number.isFinite(value?.lat)||!Number.isFinite(value?.lng)||Math.abs(value.lat)>90||Math.abs(value.lng)>180)return null;
  value={lat:value.lat,lng:value.lng,...(String(value.label||'').trim()?{label:String(value.label).trim().slice(0,180)}:{})};
 }
 return value??null;
}

export function resolveContextReferences({state,context:c,raw,now,proposal=null}){
 const request=referenceRequest(raw,proposal);
 if(!request)return null;
 const at=new Date(now),stamp=at.toISOString(),facts={},resolved=[],unresolved=[];
 const liveMemory=arr(c.verified_memory).filter(m=>m.id&&scope(m,c)&&m.status==='verified'&&['DATABASE_FACT','CUSTOMER_CONFIRMED','OWNER_POLICY','PROVIDER_VERIFIED'].includes(m.source)&&m.confidence>=.9&&m.last_confirmed_at&&Date.parse(m.last_confirmed_at)<=at.getTime()&&Date.parse(m.expires_at)>at.getTime());
 const history=arr(c.operational_history).filter(a=>a.id&&scope(a,c)&&a.status==='completed'&&a.simulated===false&&Date.parse(a.starts_at)<=at.getTime()&&Date.parse(a.starts_at)>at.getTime()-180*86400000);
 let historical=history;
 if(request.source==='YESTERDAY'){
  const yesterday=new Date(Date.parse(day(at,c.business.timezone)+'T12:00:00Z')-86400000).toISOString().slice(0,10);
  historical=history.filter(a=>day(a.starts_at,c.business.timezone)===yesterday);
 }else if(request.source==='LAST_COMPLETED'&&history.length){
  const latest=Math.max(...history.map(a=>Date.parse(a.starts_at)));
  historical=history.filter(a=>Date.parse(a.starts_at)===latest);
 }
 for(const k of request.fields){
  const current=state.entities?.[k];
  // Explicit facts in this turn always win; active references reuse the scoped
  // conversation fact before consulting any historical preference.
  if(active(current)&&(current.updated_at===stamp||request.source==='ACTIVE_OR_MEMORY')){
   resolved.push({field:k,source:'ACTIVE_STATE'});continue;
  }
  if(['YESTERDAY','LAST_COMPLETED'].includes(request.source)&&['service','worker'].includes(k)&&historical.length){
   const column=k==='service'?'service_id':'worker_id';
   const targetService=facts.service?.value||(active(state.entities?.service)?state.entities.service.value:null);
   const eligible=historical.filter(a=>(k!=='worker'||!targetService||a.service_id===targetService)&&catalog(k==='service'?c.services:c.workers,c).some(x=>x.id===a[column]));
   const values=[...new Set(eligible.map(a=>a[column]))];
   if(values.length===1&&eligible.length===historical.length){
    const row=eligible[0];facts[k]={value:values[0],source:'DATABASE_FACT',confidence:1,status:'active',updated_at:stamp,historical_appointment_id:row.id,grounded_by:'DATABASE_FACT'};
    resolved.push({field:k,source:request.source});continue;
   }
   if(request.explicitFields||k==='service')unresolved.push(k);
   continue;
  }
  // A last-seen preference cannot prove a visit happened yesterday.
  if(request.source==='YESTERDAY'){if(request.explicitFields||k==='service')unresolved.push(k);continue;}
  const serviceId=facts.service?.value||(active(state.entities?.service)?state.entities.service.value:null);
  const candidates=liveMemory.filter(m=>kind(m)===k&&(!m.service_id||!serviceId||m.service_id===serviceId)).map(m=>({m,value:memoryValue(m,k,c)})).filter(x=>x.value!=null);
  const distinct=[...new Set(candidates.map(x=>JSON.stringify(x.value)))];
  if(distinct.length===1){
   const {m,value}=candidates.sort((a,b)=>Date.parse(b.m.last_confirmed_at)-Date.parse(a.m.last_confirmed_at))[0];
   facts[k]={value,source:'CUSTOMER_MEMORY',confidence:Math.min(.96,m.confidence),status:'active',updated_at:stamp,memory_id:m.id,memory_version:m.version};
   resolved.push({field:k,source:'VERIFIED_MEMORY'});
  }else if(request.explicitFields||k==='service')unresolved.push(k);
 }
 return {request,facts,resolved,unresolved};
}
