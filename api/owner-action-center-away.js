import ownerActionCenter from './owner-action-center.js';
import { accessTokenFromRequest, json, supabaseRest } from './_auth-core.js';
import { cashGuardianActionCenterItem, loadCashGuardianSnapshot } from './_cash-guardian.js';
import { applyOwnerAwayEscalation, awayBrief, deriveOwnerAwayState } from './_owner-away-policy.js';

async function readJson(response){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error('OWNER_AWAY_LOOKUP_FAILED'),{status:response.status});
  return payload;
}

async function loadAwayMode(token,businessId){
  if(!token||!businessId)return {available:false,state:'UNAVAILABLE',active:false,scheduled:false,starts_at:null,ends_at:null,timezone:'Asia/Dubai'};
  try{
    const rows=await readJson(await supabaseRest(
      `dabbir_owner_modes?select=business_id,enabled,starts_at,ends_at,timezone,updated_at&business_id=eq.${businessId}&limit=1`,
      token,
    ));
    const row=Array.isArray(rows)?rows[0]||null:null;
    return deriveOwnerAwayState(row);
  }catch(error){
    return {available:false,state:'UNAVAILABLE',active:false,scheduled:false,starts_at:null,ends_at:null,timezone:'Asia/Dubai'};
  }
}

function capturedResponse(){
  const headers=new Map();
  let body='';
  const response={
    statusCode:200,
    setHeader(name,value){headers.set(String(name).toLowerCase(),value);return this},
    getHeader(name){return headers.get(String(name).toLowerCase())},
    status(code){this.statusCode=Number(code||200);return this},
    end(value=''){body=String(value??'');return this},
    send(value=''){body=String(value??'');return this},
  };
  return {response,headers,getBody:()=>body};
}

function forwardHeaders(res,headers){
  for(const [name,value] of headers.entries())res.setHeader(name,value);
}

function augmentWithCashGuardian(payload,snapshot){
  if(!payload?.ok||!Array.isArray(payload.items))return payload;
  if(!snapshot){
    return {
      ...payload,
      cash_guardian:{available:false,status:'UNAVAILABLE'},
      truth:{...(payload.truth||{}),cash_guardian_evidence_only:true,cash_guardian_money_movement:false},
    };
  }

  const item=cashGuardianActionCenterItem(snapshot);
  if(!item){
    return {
      ...payload,
      cash_guardian:{available:true,status:snapshot.status,sufficient_data:snapshot.sufficient_data},
      truth:{...(payload.truth||{}),cash_guardian_evidence_only:true,cash_guardian_money_movement:false},
    };
  }

  const items=[...payload.items,item]
    .sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||String(a.due_at||'').localeCompare(String(b.due_at||'')))
    .slice(0,3);
  const previousMetrics=payload.metrics||{};
  const cashUrgent=item.severity==='critical'?1:0;
  const cashWarning=item.severity==='warning'?1:0;
  const arPrefix=`حارس السيولة: ${item.title_ar}. `;
  const enPrefix=`Cash Guardian: ${item.title_en}. `;

  return {
    ...payload,
    status:(Number(previousMetrics.urgent)||0)+cashUrgent>0?'needs_attention':(Number(previousMetrics.warning)||0)+cashWarning>0?'watch':payload.status,
    metrics:{
      ...previousMetrics,
      urgent:(Number(previousMetrics.urgent)||0)+cashUrgent,
      warning:(Number(previousMetrics.warning)||0)+cashWarning,
      total:(Number(previousMetrics.total)||0)+1,
      cash_guardian_exceptions:1,
    },
    brief:{
      ar:arPrefix+String(payload.brief?.ar||''),
      en:enPrefix+String(payload.brief?.en||''),
    },
    items,
    cash_guardian:{available:true,status:snapshot.status,sufficient_data:snapshot.sufficient_data},
    truth:{...(payload.truth||{}),cash_guardian_evidence_only:true,cash_guardian_money_movement:false},
  };
}

function applyPolicy(payload,away){
  if(!payload?.ok||!Array.isArray(payload.items))return payload;
  const result=applyOwnerAwayEscalation(payload.items,away);
  if(!away.active){
    return {...payload,owner_away:away,deferred:{count:0}};
  }

  const visible=result.visible;
  const urgent=visible.filter(item=>item.severity==='critical').length;
  const warning=visible.filter(item=>item.severity==='warning').length;
  const previousMetrics=payload.metrics||{};
  return {
    ...payload,
    status:urgent>0?'needs_attention':warning>0?'watch':'clear',
    metrics:{
      ...previousMetrics,
      urgent,
      warning,
      total:visible.length,
      upcoming_24h:visible.filter(item=>item.type==='appointment'||item.type==='followup').length,
      low_stock:visible.filter(item=>item.type==='inventory').length,
      orders_needing_action:visible.filter(item=>item.type==='order').length,
    },
    brief:awayBrief(payload.brief,away,result.deferred_count),
    items:visible,
    owner_away:away,
    deferred:{count:result.deferred_count,noncritical_only:true},
    truth:{...(payload.truth||{}),owner_away_policy_applied:true,critical_items_never_suppressed:true},
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const capture=capturedResponse();
  await ownerActionCenter(req,capture.response);
  forwardHeaders(res,capture.headers);
  res.statusCode=capture.response.statusCode;

  let payload=null;
  try{payload=JSON.parse(capture.getBody()||'null')}catch{return res.end(capture.getBody())}
  if(res.statusCode!==200||!payload?.ok)return res.end(JSON.stringify(payload));

  const token=accessTokenFromRequest(req);
  let cashSnapshot=null;
  if(payload.role==='owner'){
    cashSnapshot=await loadCashGuardianSnapshot({token,businessId:payload.business_id}).catch(()=>null);
  }
  const cashAugmented=augmentWithCashGuardian(payload,cashSnapshot);
  const away=await loadAwayMode(token,payload.business_id);
  const next=applyPolicy(cashAugmented,away);
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-dabbir-cash-guardian',cashSnapshot?cashSnapshot.status.toLowerCase():'unavailable');
  res.setHeader('x-dabbir-owner-away-policy',away.active?'active':'inactive');
  return res.end(JSON.stringify(next));
}

export { applyPolicy, augmentWithCashGuardian };
