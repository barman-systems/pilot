import { applyActivityRequirements, normalizeDeliveryMode, validLocation, detectRequirementLoop, activityActionAuthority } from './_dabbir-activity-intelligence.js';
import { wantsServiceMenu } from './_dabbir-whatsapp-understanding.js';
// Pure semantic reducer. Provider output is a proposal, never execution authority.
export const SEMANTIC_VERSION = 2;
export const TRUST = Object.freeze({ PROVIDER_VERIFIED: 100, DATABASE_FACT: 95, OWNER_POLICY: 95,
  VERIFIED_BUSINESS_KNOWLEDGE: 90, CUSTOMER_CORRECTION: 85, CUSTOMER_CONFIRMED: 85,
  CUSTOMER_STATED: 80, CUSTOMER_MEMORY: 75, AI_INFERENCE: 0 });
export const BUDGET = Object.freeze({ maxModelCalls: 1, maxSteps: 8, timeoutMs: 25000, maxContextChars: 10000 });
const arr = v => Array.isArray(v) ? v : [];
const clean = (v, n = 180) => String(v ?? '').trim().slice(0,n);
export function normalizeSemanticText(v = '') {
  return clean(v,4000).normalize('NFKD').replace(/[\u064b-\u065f\u0670ـ]/g,'')
    .replace(/[٠-٩]/g, n => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه')
    .toLowerCase().replace(/[^\p{L}\p{N}:\-]+/gu,' ').replace(/\s+/g,' ').trim();
}
const nameOf = s => clean(s?.name_ar || s?.name || s?.name_en || s?.display_name);
const valueOf = (s,k) => s.entities[k]?.status === 'active' ? s.entities[k].value : null;
const supported = f => f?.status === 'active' && f?.value != null && f.confidence >= .9 && TRUST[f.source] > 0;
const localDate = (now,tz) => new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const addDays = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const includesName = (text,name) => name && (' '+text+' ').includes(' '+normalizeSemanticText(name)+' ');
function scoped(rows,c) { return arr(rows).filter(x => (!x.business_id || x.business_id===c.business.id) && (!x.branch_id || x.branch_id===c.conversation.branch_id)); }
function scopeValid(c) { return !!(c.business?.id && c.conversation?.id && c.customer?.id && c.conversation?.branch_id && c.business?.timezone); }
function validCoordinates(lat,lng) { return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180; }

function fact(s,key,value,source,confidence,now,extra={}) {
  const old=s.entities[key];
  if(old && JSON.stringify(old.value)!==JSON.stringify(value) && old.status==='active') {
    s.user_corrections.push({entity:key,previous:{...old,status:'superseded'},superseded_at:now});
    s.user_corrections=s.user_corrections.slice(-16);
  }
  s.entities[key]={value,source,confidence,status:value==null?'unresolved':'active',updated_at:now,...extra};
}
function invalidate(s,key,now) { if(s.entities[key]) fact(s,key,null,'CUSTOMER_CORRECTION',0,now); }
function freshState(c,now) {
  return {version:2,revision:0,scope:{business_id:c.business?.id,conversation_id:c.conversation?.id,customer_id:c.customer?.id,branch_id:c.conversation?.branch_id},
    goal:'UNKNOWN',intent:'SUPPORT',sub_intent:null,entities:{},pending_action:null,missing_fields:[],unresolved_references:[],user_corrections:[],
    business_constraints:[],owner_policies:[],last_confirmed_facts:{},last_verified_action:null,last_verified_outcome:null,
    language:'ar',dialect:'unknown',overall_confidence:0,created_at:now,updated_at:now,expires_at:new Date(Date.parse(now)+86400000).toISOString()};
}

// Resolve ordinals only inside the currently presented, verified list. Negated options
// are removed before resolution; two affirmative options require clarification.
export function resolveOrdinal(raw) {
  let t=normalizeSemanticText(raw);
  t=t.replace(/(?:لا\s+)?(?:مو|مب)\s+(?:هذا|هذي)\s+/g,' ');
  t=t.replace(/(?:لا|مب|مو|مش|not|dont|don't)\s+(?:(?:تلغي|تلغ|cancel|هذا|هذي|the)\s+)*(?:الاول|اول|الثاني|ثاني|الثالث|ثالث|first|second|third|[123])(?=\s|$)/g,' ');
  const matches=[...t.matchAll(/(?:^|\s)(?:the\s+)?(الاول|اول|الثاني|ثاني|الثالث|ثالث|first|second|third|[123])(?=\s|$)/g)];
  const ids=[...new Set(matches.map(m=>/^(الاول|اول|first|1)$/.test(m[1])?0:/^(الثاني|ثاني|second|2)$/.test(m[1])?1:2))];
  return {index:ids.length===1?ids[0]:null,ambiguous:ids.length>1,mentioned:matches.length>0};
}

function parseDate(t,today) {
  // Only the last positive correction is active, including GCC double negation.
  t=t.split(/(?:لا قصدي|قصدي|i mean|actually|instead)/).at(-1).trim();
  if(/(?:عقب باجر|بعد باجر|بعد بكره|بعد غد|day after tomorrow)/.test(t))return addDays(today,2);
  if(/(?:^|\s)(?:باجر|باكر|بكره|غدا|tomorrow)(?:\s|$)/.test(t) && !/(?:مب|مو|not)\s+(?:باجر|tomorrow)\s*$/.test(t))return addDays(today,1);
  if(/(?:^|\s)(?:اليوم|اباليوم|باليوم|today)(?:\s|$)/.test(t))return today;
  const m=t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if(m && !Number.isNaN(Date.parse(m[1])) && new Date(m[1]).toISOString().slice(0,10)===m[1])return m[1];
  return null;
}
const CLOCK_WORDS={واحد:1,وحده:1,اثنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10,five:5,six:6,seven:7,eight:8};
function parseTime(raw,s) {
  let t=normalizeSemanticText(raw),corrected=/(?:لا قصدي|قصدي|i mean|actually|instead)/.test(t);
  if(corrected)t=t.split(/(?:لا قصدي|قصدي|i mean|actually|instead)/).at(-1).trim();
  const broad=/(?:عقب|بعد|ع)\s*(?:المغرب|العصر)|(?:after|around)\s+(?:sunset|maghrib|asr)/.test(t);
  const clockContext=/(?:الساعه|الساع|at\s|:|\b[ap]m\b)/.test(t)||corrected||/^\d{1,2}(?:\s|$)/.test(t);
  if(clockContext)for(const [w,n] of Object.entries(CLOCK_WORDS))t=t.replace(new RegExp('(^|\\s)'+w+'(?=\\s|$)','g'),'$1'+n);
  const clock=t.match(/(?:الساعه\s*|الساع\s*|at\s+|^)([01]?\d|2[0-3])(?::([0-5]\d))?(?:\s*(am|pm|ص|م))?(?=\s|$)/)
    || t.match(/(?:^|\s)(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm|ص|م|الصبح|صباحا|صباح|مساء|المسا|morning|evening)(?=\s|$)/);
  let period=/(?:مساء|المسا|المغرب|الليل|العصر|evening|afternoon|night|\bpm\b)/.test(t)?'pm':/(?:صباح|الصبح|الفجر|morning|\bam\b)/.test(t)?'am':null;
  if(broad && !clock)return {value:null,confidence:.55,part:t.includes('مغرب')||/sunset|maghrib/.test(t)?'after_maghrib':'after_asr'};
  if(!clock) {
    if(period && s.entities.time?.hour!=null && !broad) {
      const hour=s.entities.time.hour%12+(period==='pm'?12:0);
      return {value:String(hour).padStart(2,'0')+':'+String(s.entities.time.minute||0).padStart(2,'0'),confidence:.99,period,hour:s.entities.time.hour,minute:s.entities.time.minute||0};
    }
    if(period||/الظهر|الليل|الصبح/.test(t))return {value:null,confidence:.55,part:period||'daypart',...(period?{period,period_explicit:true}:{})};
    return null;
  }
  const h=Number(clock[1]),minute=Number(clock[2]||0);
  if(clock[3] && /^(am|pm|ص|م)$/.test(clock[3]))period=/^(pm|م)$/.test(clock[3])?'pm':'am';
  // An explicit 24-hour clock already states its day period. Keep that fact
  // when the customer later corrects only the hour within the same session.
  if(!period&&(h>=13||h===0))period=h>=12?'pm':'am';
  // Reuse only a period explicitly stated by the same customer in this semantic session.
  if(!period && s.entities.time?.period_explicit && ['CUSTOMER_STATED','CUSTOMER_CORRECTION','CUSTOMER_CONFIRMED'].includes(s.entities.time.source))period=s.entities.time.period;
  else if(!period && corrected && s.entities.time?.period)period=s.entities.time.period;
  if(!period && h<13 && h!==0)return {value:null,confidence:.55,hour:h,minute,part:'am_pm'};
  const hh=period?h%12+(period==='pm'?12:0):h;
  return {value:String(hh).padStart(2,'0')+':'+String(minute).padStart(2,'0'),confidence:.99,period,hour:h,minute};
}
function parseVehicleClass(raw) {
  const t=normalizeSemanticText(raw);
  if(/(?:^|\s)(?:ستيشن|station|suv|4x4|دفع رباعي|جيب)(?:\s|$)/.test(t))return {value:'station',label:'ستيشن/SUV'};
  if(/(?:^|\s)(?:صالون|saloon|sedan)(?:\s|$)/.test(t))return {value:'saloon',label:'صالون'};
  return null;
}

function resolveCatalog(s,c,text,now,source) {
  const services=scoped(c.services,c),workers=scoped(c.workers,c);
  const aliases=arr(c.approved_aliases).filter(k=>k.status==='OWNER_APPROVED' && k.business_id===c.business.id && k.entity_type==='service' && includesName(text,k.alias));
  let matched=services.filter(x=>[x.name,x.name_ar,x.name_en].some(n=>includesName(text,n)));
  if(!matched.length && aliases.length===1) { matched=services.filter(x=>x.id===aliases[0].target_id); source='OWNER_POLICY';s.policy_dependencies=[{id:aliases[0].id,version:aliases[0].version}]; }
  if(!matched.length && /غسيل|اغسل|غسل|\bwash\b/.test(text))matched=services.filter(x=>/غسيل|غسل|wash/i.test(nameOf(x)+' '+(x.name_en||'')));
  if(matched.length===1) {
    if(source!=='OWNER_POLICY')s.policy_dependencies=[];
    if(valueOf(s,'service')!==matched[0].id) { invalidate(s,'slot',now); invalidate(s,'worker',now); }
    fact(s,'service',matched[0].id,source,.98,now,{label:nameOf(matched[0]),grounded_by:'DATABASE_FACT'});
    fact(s,'price',matched[0].price,'DATABASE_FACT',1,now);
  } else if(matched.length>1) { fact(s,'service',null,'CUSTOMER_STATED',.5,now,{candidates:matched.slice(0,3).map(x=>({id:x.id,label:nameOf(x)}))}); }
  const ws=workers.filter(x=>includesName(text,x.display_name));
  if(ws.length===1)fact(s,'worker',ws[0].id,source,.98,now,{label:nameOf(ws[0]),grounded_by:'DATABASE_FACT'});
  else if(ws.length>1)fact(s,'worker',null,source,.5,now);
}
function reuseMemory(s,c,t,now) {
  if(!/(?:نفس|اللي قبل|المرة اللي طافت|same|last time)/.test(t))return;
  const onlyVehicle=/سيار|vehicle|car\b/.test(t),onlyWorker=/عامل|موظف|worker|staff/.test(t),onlyLocation=/مكان|موقع|location|place|address/.test(t),onlyService=/خدم|service/.test(t);
  const allowed=onlyVehicle?['vehicle']:onlyWorker?['worker']:onlyLocation?['location']:onlyService?['service']:['service','worker','vehicle','location'];
  let used=0;
  for(const m of arr(c.verified_memory)) {
    if(!m.id || m.branch_id!==c.conversation.branch_id || !m.expires_at || (m.service_id && valueOf(s,'service') && m.service_id!==valueOf(s,'service')) || m.business_id!==c.business.id || m.customer_id!==c.customer.id || m.status!=='verified' || !['DATABASE_FACT','CUSTOMER_CONFIRMED','OWNER_POLICY','PROVIDER_VERIFIED'].includes(m.source) || m.confidence<.9 || !m.last_confirmed_at || (m.expires_at && Date.parse(m.expires_at)<=Date.parse(now)))continue;
    const k=m.memory_key.replace(/^last_verified_|^preferred_|^known_|^usual_/,'');
    if(!allowed.includes(k))continue;
    let val=m.value?.id??m.value?.value;
    if(k==='service'&&!scoped(c.services,c).some(x=>x.id===val))continue;
    if(k==='worker'&&!scoped(c.workers,c).some(x=>x.id===val))continue;
    if(k==='vehicle') {
      val=clean(m.value?.vehicle_type??m.value?.value,40).toLowerCase();
      if(!['saloon','station'].includes(val))continue;
    }
    if(k==='location') {
      const point=m.value?.value||m.value;const lat=point?.lat,lng=point?.lng;
      if(!validCoordinates(lat,lng))continue;
      val={lat,lng,...(clean(point?.label,180)?{label:clean(point.label,180)}:{})};
    }
    if(val!=null){fact(s,k,val,'CUSTOMER_MEMORY',Math.min(.96,Number(m.confidence)),now,{memory_id:m.id,memory_version:m.version});used++;}
  }
  if(!used)s.unresolved_references.push(onlyVehicle?'vehicle':onlyWorker?'worker':'verified_history');
}

export function understandConversation({context:c,previous=null,now=new Date(),proposal=null,proposalEvidence=null}) {
  const stamp=now.toISOString();
  const fresh=freshState(c,stamp);
  const same=previous && Object.keys(fresh.scope).every(k=>previous.scope?.[k]===fresh.scope[k]) && previous.version===2 && Date.parse(previous.expires_at)>now.getTime();
  const completed=previous?.last_verified_action?.at && Date.parse(previous.last_verified_action.at)>=Date.parse(previous.updated_at);
  const s=same&&!completed?structuredClone(previous):{...fresh,last_verified_action:same?previous?.last_verified_action||null:null,last_verified_outcome:same?previous?.last_verified_outcome||null:null};
  s.updated_at=stamp;s.revision=(previous?.revision||0)+1;s.missing_fields=[];s.unresolved_references=[];s.pending_action=null;s.sub_intent=null;
  // Read-only intents describe one customer turn. They must not leak into the
  // next message and turn a grounded service detail into another catalog menu.
  if(s.goal==='UNKNOWN'&&['SERVICE_DISCOVERY','PRICING'].includes(s.intent))s.intent='SUPPORT';
  delete s.entities.slot; // Confirmation authorizes exactly this customer turn.
  s.ontology=c.business?.business_type||'services';
  s.business_constraints=[];
  s.owner_policies=arr(c.approved_aliases).map(x=>({id:x.id,version:x.version})).slice(0,20);
  const turns=arr(c.batch_messages).slice(-12).flatMap(x=>clean(x.body,1500).split(/(?=لا قصدي|i mean)/i).map(body=>({body,id:x.id,catalog_service_id:x.catalog_service_id,language_body:clean(x.language_body??x.body,1500)})));
  const texts=turns.map(x=>x.body);
  const all=normalizeSemanticText(texts.join(' '));
  const languageText=turns.map(x=>x.language_body).join(' ');
  s.language=/[\u0600-\u06ff]/.test(languageText)?'ar':/[a-z]/i.test(languageText)?'en':s.language;
  s.dialect=/ابا|ابي|ابغي|باجر|عقب|طرش|دز|هيه|شو|ماشي/.test(all)?'GCC':s.dialect;
  s.audio_confidence=c.voice?.audio_confidence??null;
  s.transcription_confidence=c.voice?.transcription_confidence??null;
  const route=(action,reason,reply=null)=>{
    const authority=activityActionAuthority(c,s,action);
    if(!authority.allowed){action='HANDOFF';reason=authority.reason;reply=null;s.pending_action='HANDOFF';s.operational_confidence=0;}
    return {state:s,decision:{action,intent:s.intent,confidence:s.overall_confidence,riskLevel:['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(action)?'MEDIUM':'LOW',missingFields:s.missing_fields,reasonCode:reason,reply}};
  };
  const refuse=/انس(?:ى)?\s+تعليمات|ignore\s+(?:all\s+|previous\s+)?instructions|باقي العملاء|عملاء نشاط اخر|other (?:customers|tenants)|system prompt|api.?key|access.?token/.test(all);
  if(!scopeValid(c)){s.overall_confidence=0;return route('HANDOFF','TENANT_SCOPE_UNVERIFIED');}
  if(c.conversation.newer_customer_message_exists){s.overall_confidence=0;return route('SUPERSEDED','NEWER_CUSTOMER_MESSAGE');}
  if(c.catalog_error)return route('HANDOFF',c.catalog_error);
  if(['human_active','action_required'].includes(c.conversation.state)||c.human_takeover){return route('HANDOFF','HUMAN_TAKEOVER_ACTIVE');}
  if(refuse){s.intent='UNSUPPORTED';s.overall_confidence=1;return route('REPLY','UNTRUSTED_INSTRUCTION',s.language==='ar'?'أقدر أساعدك بخدمات هذا النشاط ومواعيدك فقط.':'I can help with this business and your own appointments only.');}
  if(/لا\s*(?:تحجز|تسوي حجز)|(?:dont|do not)\s+book/.test(all)){s.goal='UNKNOWN';s.intent='SUPPORT';s.pending_action='CLARIFY';s.unresolved_references=['booking_confirmation'];return route('CLARIFY','BOOKING_NEGATED',s.language==='ar'?'ما حجزت. هل تريد اختيار وقت آخر؟':'I have not booked. Would you like to choose another time?');}
  if(/(?:ابا|ابي|ابغي|اريد|اكلم|كلم|حولني|مع)\s*(?:اكلم\s*)?(?:المدير|المالك|موظف|انسان|شخص)|\b(?:human|manager|speak to staff|talk to the owner)\b/.test(all)){s.goal='HUMAN_ASSISTANCE';s.intent='HUMAN_ASSISTANCE';s.overall_confidence=1;return route('HANDOFF','CUSTOMER_REQUESTED_HUMAN');}
  let today;try{today=localDate(now,c.business.timezone);}catch{return route('HANDOFF','TIMEZONE_UNVERIFIED');}
  // Catalog and branch facts are revalidated on every turn, including remembered values.
  if(valueOf(s,'service')&&!scoped(c.services,c).some(x=>x.id===valueOf(s,'service')))invalidate(s,'service',stamp);
  if(valueOf(s,'worker')&&!scoped(c.workers,c).some(x=>x.id===valueOf(s,'worker')))invalidate(s,'worker',stamp);
  fact(s,'branch',c.conversation.branch_id,'DATABASE_FACT',1,stamp);
  for(const turn of turns) {
    const raw=turn.body;
    const catalogService=scoped(c.services,c).find(x=>x.id===turn.catalog_service_id);
    if(catalogService){invalidate(s,'slot',stamp);fact(s,'service',catalogService.id,'CUSTOMER_STATED',.99,stamp,{label:nameOf(catalogService),grounded_by:'DATABASE_FACT'});fact(s,'price',catalogService.price,'DATABASE_FACT',1,stamp);s.goal='BOOK_SERVICE';s.intent='BOOKING';s.intent_confirmed=true;s.policy_dependencies=[];}
    const t=normalizeSemanticText(raw),correction=/لا قصدي|قصدي|مو هذا|مب هذا|i mean|actually|instead/.test(t)||c.cognitive_message_role==='CORRECTION',source=correction?'CUSTOMER_CORRECTION':'CUSTOMER_STATED';
    const positive=t.replace(/(?:لا|مب|مو|not|dont|don't)\s+(?:تلغي|تلغ|cancel)(?:\s+(?:الاول|الثاني|the first|the second))?/g,' ');
    const cancel=/(?:^|\s)(?:الغ|الغيه|الغي|الغاء|تلغي|cancel)(?:\s|$)/.test(positive);
    const draftCorrection=c.cognitive_active&&s.goal==='BOOK_SERVICE'&&!s.last_verified_action&&!/موعدي|حجزي|reschedule|my (?:appointment|booking)/.test(positive);
    const reschedule=!draftCorrection&&/غير(?:ه|ي)?|بدل(?:ه|ي)?|تعديل|اجل|reschedule|change (?:it|my|the) (?:appointment|booking|time)/.test(positive);
    const booking=/(?:ابا|ابي|ابغي|ابغى|اريد|احجز|حجز|book\b|booking|same .*tomorrow)/.test(t);
    // Share the existing production classifier. Separate phrase lists here caused
    // ordinary GCC catalog questions to fall through to the model and handoff.
    const discovery=wantsServiceMenu(raw);
    const durationQuestion=/(?:كم الوقت|كم وقت|كم ياخذ|كم تاخذ|كم تاخذون|كم يستغرق|المده|مده|how long|duration|how much time|how many minutes)/.test(t);
    const pricing=/بكم|كم السعر|كم سعر|how much|price|pricing/.test(t);
    if(/فرع|\bbranch\b/.test(t)) {
      const named=arr(c.branches).filter(b=>includesName(t,b.name));
      const genericBranch=/^(?:في الفرع|بالفرع|at (?:the )?branch)$/.test(t);
      if(!genericBranch && (named.length!==1 || named[0].id!==c.conversation.branch_id))s.unresolved_references.push('branch');
    }
    if(cancel){s.goal='CANCEL_BOOKING';s.intent='CANCEL_BOOKING';s.intent_confirmed=true;}
    else if(reschedule){s.goal='RESCHEDULE_BOOKING';s.intent='RESCHEDULE_BOOKING';s.intent_confirmed=true;}
    else if(durationQuestion&&s.goal==='UNKNOWN'){s.intent='SUPPORT';s.sub_intent='SERVICE_DURATION';}
    else if(pricing)s.intent='PRICING';
    else if(discovery)s.intent='SERVICE_DISCOVERY';
    else if(booking){s.goal='BOOK_SERVICE';s.intent='BOOKING';s.intent_confirmed=true;}
    else if(s.goal==='BOOK_SERVICE' && !/^(?:شكرا|thanks|thank you)$/.test(t))s.intent='BOOKING';
    resolveCatalog(s,c,t,stamp,source);reuseMemory(s,c,t,stamp);
    const contract=arr(c.activity_profile?.services).find(x=>x.service_id===valueOf(s,'service'));
    const allowedEntities=Object.keys(contract?.entity_definitions||{});
    if(allowedEntities.includes('vehicle')) {
      const vehicle=parseVehicleClass(raw);
      if(vehicle)fact(s,'vehicle',vehicle.value,source,.99,stamp,{label:vehicle.label,grounded_by:'CUSTOMER_STATED'});
    }
    const receipt=arr(c.location_receipts).find(x=>x.message_id===turn.id && x.business_id===c.business.id && x.conversation_id===c.conversation.id);
    if(receipt && validLocation(receipt.value))fact(s,'location',receipt.value,'PROVIDER_VERIFIED',1,stamp,{receipt_id:receipt.message_id,grounded_by:'SIGNED_WHATSAPP_LOCATION'});
    const modeText=t.split(/(?:لا قصدي|قصدي|i mean|actually|instead)/).at(-1);
    const explicitMode=/(?:في الفرع|عندكم|at (?:the )?branch|at your (?:shop|salon))/.test(modeText)?'AT_BUSINESS':/(?:عند البيت|تعال عندي|عندي بالبيت|home visit|at my home)/.test(modeText)?'AT_CUSTOMER':/(?:اونلاين|عن بعد|online|remote)/.test(modeText)?'REMOTE':null;
    if(explicitMode && contract) {
      const matching=arr(contract.delivery_modes).filter(m=>m===explicitMode || (explicitMode==='AT_CUSTOMER' && m==='MOBILE'));
      if(matching.length===1)fact(s,'delivery_mode',matching[0],source,.99,stamp,{service_id:valueOf(s,'service')});
      else {fact(s,'delivery_mode',explicitMode,'AI_INFERENCE',.5,stamp,{service_id:valueOf(s,'service')});s.unresolved_references.push('delivery_mode');}
    }
    if(previous?.clarification_entity==='property_details' && raw.trim().length>=2 && raw.length<=300)fact(s,'property_details',raw.trim(),source,.99,stamp);
    if(/^(?:هيه|نعم|تمام|ماشي|yes|yeah|ok|okay|correct)$/.test(t)) {
      if(previous?.clarification_entity==='intent_confirmation')s.intent_confirmed=true;
      const confirmedKey=previous?.clarification_entity;
      if(['delivery_mode','vehicle','property_details','date','time'].includes(confirmedKey) && s.entities[confirmedKey]?.source==='AI_INFERENCE')fact(s,confirmedKey,s.entities[confirmedKey].value,'CUSTOMER_CONFIRMED',.99,stamp,{...(confirmedKey==='delivery_mode'?{service_id:valueOf(s,'service')}:{})});
      if(previous?.clarification_entity==='service' && s.entities.service?.source==='AI_INFERENCE' && scoped(c.services,c).some(x=>x.id===s.entities.service.value))fact(s,'service',s.entities.service.value,'CUSTOMER_CONFIRMED',.99,stamp,{label:s.entities.service.label,grounded_by:'DATABASE_FACT'});
    }
    if(valueOf(s,'service') && s.entities.service?.updated_at===stamp && s.goal==='UNKNOWN' && s.intent==='SUPPORT' && s.sub_intent!=='SERVICE_DURATION' && !c.cognitive_read_question){s.goal='BOOK_SERVICE';s.intent='BOOKING';}
    const bareDateChoice=previous?.clarification_entity==='date' && /^[123]$/.test(t) && (!c.pending_state?.pending_action || c.pending_state.pending_action==='none');
    // A numeric service-menu answer is never a clock. If the presentation was
    // not verified it remains unresolved, but it cannot poison the time entity.
    const isBareChoice=/^[123]$/.test(t) && ['choose_slot','choose_service'].includes(c.pending_state?.pending_action);
    const d=parseDate(t,today),time=(isBareChoice||bareDateChoice)?null:parseTime(raw,s);
    if(d){if(d!==valueOf(s,'date'))invalidate(s,'slot',stamp);fact(s,'date',d,source,.99,stamp);}
    if(time){invalidate(s,'slot',stamp);fact(s,'time',time.value,source,time.confidence,stamp,time);}
    if(bareDateChoice)s.unresolved_references.push('date_input');
    if(/(?:مب|مو|not)\s+(?:باجر|tomorrow)\s*$/.test(t))invalidate(s,'date',stamp);
    if(/(?:لا تلغي|لا تلغ|dont cancel|do not cancel|don't cancel)\s*(?:الموعد|it)?$/.test(t)){s.intent='SUPPORT';s.goal='UNKNOWN';invalidate(s,'appointment',stamp);}
    const ordinal=bareDateChoice?{index:null,ambiguous:false,mentioned:false}:resolveOrdinal(raw),slots=arr(c.pending_state?.payload?.slots);
    const pendingLive=c.pending_state?.payload?.presented===true && c.pending_state?.expires_at && Date.parse(c.pending_state.expires_at)>now.getTime();
    const referenceQuestion=ordinal.index!=null && /[?؟]|(?:^|\s)(?:متى|كم|هل|when|what|price|does|is)(?:\s|$)/i.test(raw);
    if(ordinal.ambiguous)s.unresolved_references.push('multiple_options');
    if(referenceQuestion && pendingLive && c.pending_state?.pending_action==='choose_slot')s.unresolved_references.push('slot_confirmation');
    if(['CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(s.intent) && !(s.intent==='RESCHEDULE_BOOKING' && pendingLive && c.pending_state?.pending_action==='choose_slot' && ordinal.index!=null && !d && !time)) {
      const appointments=scoped(c.upcoming_appointments,c);
      // Ordinals refer only to appointments actually presented, with a stable id order.
      const offered=arr(c.pending_state?.payload?.appointments);
      let appt=pendingLive && c.pending_state?.pending_action==='choose_appointment' && ordinal.index!=null?appointments.find(x=>x.id===offered[ordinal.index]?.id):null;
      if(!ordinal.mentioned && !ordinal.ambiguous && appointments.length===1)appt=appointments[0];
      if(appt)fact(s,'appointment',appt.id,'CUSTOMER_CONFIRMED',1,stamp,{grounded_by:'DATABASE_FACT'});
      else if(ordinal.mentioned || !valueOf(s,'appointment')){invalidate(s,'appointment',stamp);s.unresolved_references.push('appointment');}
    } else if(ordinal.index!=null && !ordinal.ambiguous && !referenceQuestion && !['PRICING','SERVICE_DISCOVERY'].includes(s.intent) && !d && !time && pendingLive && c.pending_state?.pending_action==='choose_slot' && slots[ordinal.index]) {
      const slot=slots[ordinal.index];
      if(scoped(c.services,c).some(x=>x.id===slot.service_id) && (!slot.worker_id||scoped(c.workers,c).some(x=>x.id===slot.worker_id))) {
        fact(s,'slot',ordinal.index,'CUSTOMER_CONFIRMED',1,stamp,{starts_at:slot.starts_at});
        fact(s,'service',slot.service_id,'DATABASE_FACT',1,stamp);
        s.intent=c.pending_state.payload.mode==='reschedule'?'RESCHEDULE_BOOKING':'BOOKING';s.goal=s.intent==='BOOKING'?'BOOK_SERVICE':'RESCHEDULE_BOOKING';
        if(c.pending_state.payload.mode==='reschedule')fact(s,'appointment',c.pending_state.payload.appointment_id,'CUSTOMER_CONFIRMED',1,stamp);
      }
    } else if(ordinal.mentioned && !['CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(s.intent))s.unresolved_references.push('offered_option');
  }
  if(valueOf(s,'date') && valueOf(s,'date')<today)invalidate(s,'date',stamp);
  if(s.goal==='UNKNOWN'&&s.sub_intent==='SERVICE_DURATION'&&supported(s.entities.service)){
    const service=scoped(c.services,c).find(x=>x.id===valueOf(s,'service'));
    const minutes=Number(service?.duration_minutes);
    delete s.entities.time;s.missing_fields=[];s.unresolved_references=[];
    s.overall_confidence=.99;s.semantic_confidence=.99;s.operational_confidence=Math.min(.99,c.voice?Number(c.voice.transcription_confidence)||0:1);
    s.last_confirmed_facts=Object.fromEntries(Object.entries(s.entities).filter(([,f])=>supported(f)).map(([k,f])=>[k,{value:f.value,source:f.source,confidence:f.confidence}]));
    if(Number.isFinite(minutes)&&minutes>0){const n=Math.max(1,Math.trunc(minutes));return route('REPLY','DATABASE_SERVICE_DURATION',s.language==='ar'?`${nameOf(service)} مدته ${n} دقيقة.`:`${nameOf(service)} takes ${n} minutes.`);}
    return route('REPLY','SERVICE_DURATION_UNVERIFIED',s.language==='ar'?'مدة هذه الخدمة غير متحققة حاليًا.':'This service duration is not verified right now.');
  }
  if(c.voice && (c.voice.clarification_required || !(Number(c.voice.transcription_confidence)>=.85))) {s.unresolved_references.push('voice_transcript');}
  if(proposal) {
    // Unknown model assertions remain explicitly untrusted, with no ids or raw text persisted.
    s.sub_intent=clean(proposal.intent,60)||null;
    s.planner_proposal={action:clean(proposal.action,40),source:'AI_INFERENCE',confidence:Math.min(.89,Math.max(0,Number(proposal.confidence)||0))};
    if(proposal.riskLevel==='HIGH')return route('HANDOFF','HIGH_RISK_INTERPRETATION');
    // A model may select a read-only intent, never supply the catalog or prices.
    // All returned facts still come from the branch-scoped database snapshot.
    if(s.goal==='UNKNOWN' && Number(proposal.confidence)>=.8 && ['SERVICE_DISCOVERY','PRICING'].includes(proposal.intent))s.intent=proposal.intent;
    const knowledge=arr(c.knowledge).find(k=>k.key===proposal.knowledgeKey && k.source==='owner_approved' && Number(k.confidence)>=.95);
    if(knowledge && s.goal==='UNKNOWN') {
      const answer=typeof knowledge.value==='object'?(s.language==='en'?knowledge.value.answer_en||knowledge.value.answer_ar:knowledge.value.answer_ar||knowledge.value.answer_en):null;
      if(typeof answer==='string'&&answer.trim()){s.overall_confidence=.98;s.semantic_confidence=.98;s.operational_confidence=.98;return route('REPLY','VERIFIED_BUSINESS_KNOWLEDGE',answer.slice(0,1400));}
    }
    if(s.goal==='UNKNOWN' && ['BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(proposal.intent)) {
      s.intent=proposal.intent;s.goal=proposal.intent==='BOOKING'?'BOOK_SERVICE':proposal.intent;s.intent_confirmed=false;
    }
    const rawEvidence=(proposalEvidence || turns).map(x=>x.language_body||x.body).join(' ');
    for(const item of arr(proposal.entities).slice(0,8)) {
      const key=clean(item?.entity,40),evidence=clean(item?.evidence,300);
      if(!['delivery_mode','vehicle','property_details','date','time'].includes(key) || !evidence || !rawEvidence.includes(evidence) || Number(item.confidence)<.9)continue;
      const existing=s.entities[key];
      if(supported(existing) && !item.correction)continue;
      let value=item.value, grounded=false;
      if(key==='delivery_mode') {
        value=normalizeDeliveryMode(value);
        const contract=arr(c.activity_profile?.services).find(x=>x.service_id===valueOf(s,'service'));
        if(!arr(contract?.delivery_modes).includes(value))continue;
      }
      if(key==='vehicle') {
        if(!['saloon','station'].includes(value))continue;
        grounded=parseVehicleClass(evidence)?.value===value;
      }
      if(key==='property_details'){if(typeof value!=='string'||value.length>300)continue;grounded=value===evidence;}
      if(key==='date'){if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))continue;grounded=parseDate(normalizeSemanticText(evidence),today)===value;}
      if(key==='time'){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))continue;grounded=parseTime(evidence,s)?.value===value;}
      fact(s,key,value,grounded?(item.correction?'CUSTOMER_CORRECTION':'CUSTOMER_STATED'):'AI_INFERENCE',grounded?.99:.5,stamp,{...(key==='delivery_mode'?{service_id:valueOf(s,'service')}:{})});
    }
    const candidates=scoped(c.services,c).filter(x=>[x.name,x.name_ar,x.name_en].some(n=>n&&normalizeSemanticText(n)===normalizeSemanticText(proposal.serviceName)));
    if(!supported(s.entities.service)&&candidates.length===1)fact(s,'service',candidates[0].id,'AI_INFERENCE',.5,stamp,{label:nameOf(candidates[0])});
  }
  s.unresolved_references=[...new Set(s.unresolved_references)];
  let selected=supported(s.entities.slot) && arr(c.pending_state?.payload?.slots)[valueOf(s,'slot')];
  if(s.intent==='BOOKING'||s.intent==='RESCHEDULE_BOOKING') {
    if(s.intent==='RESCHEDULE_BOOKING') {
      const appointment=arr(c.upcoming_appointments).find(a=>a.id===valueOf(s,'appointment')&&(!a.business_id||a.business_id===c.business.id)&&a.branch_id===c.conversation.branch_id);
      if(appointment && scoped(c.services,c).some(service=>service.id===appointment.service_id))fact(s,'service',appointment.service_id,'DATABASE_FACT',1,stamp);
    }
    let requirements=applyActivityRequirements(s,c,now);
    if(selected && c.pending_state?.payload?.activity_contract_version!==s.activity_contract_version){
      const at=new Date(selected.starts_at);
      if(Number.isFinite(at.getTime())){fact(s,'date',localDate(at,c.business.timezone),'CUSTOMER_CONFIRMED',1,stamp);fact(s,'time',new Intl.DateTimeFormat('en-GB',{timeZone:c.business.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at),'CUSTOMER_CONFIRMED',1,stamp);}
      delete s.entities.slot;selected=null;s.slot_stale=true;requirements=applyActivityRequirements(s,c,now);
    }
    s.missing_fields=requirements.missing;
    if(s.intent==='RESCHEDULE_BOOKING'&&!supported(s.entities.appointment))s.missing_fields.unshift('appointment');
    if(requirements.blocked.length) {
      s.pending_action='HANDOFF';s.operational_confidence=0;s.semantic_confidence=s.overall_confidence;
      return route('HANDOFF',requirements.blocked[0]);
    }
    if(s.entities.worker && !supported(s.entities.worker))s.missing_fields.push('worker');
  } else if(s.intent==='CANCEL_BOOKING')s.missing_fields=supported(s.entities.appointment)?[]:['appointment'];
  if(s.intent_confirmed===false)s.missing_fields.unshift('intent_confirmation');
  s.missing_fields=[...new Set(s.missing_fields)];
  s.overall_confidence=s.missing_fields.length||s.unresolved_references.length?.55:.98;
  s.semantic_confidence=s.overall_confidence;
  s.operational_confidence=Math.min(s.overall_confidence,c.voice?Number(c.voice.transcription_confidence)||0:1);
  s.last_confirmed_facts=Object.fromEntries(Object.entries(s.entities).filter(([,f])=>supported(f)).map(([k,f])=>[k,{value:f.value,source:f.source,confidence:f.confidence}]));
  if(s.unresolved_references.length||s.missing_fields.length){s.pending_action='CLARIFY';s.clarification_entity=s.missing_fields[0]||s.unresolved_references[0];if(detectRequirementLoop(s,previous,c.cognitive_message_role)){s.pending_action='HANDOFF';return route('HANDOFF','REPEATED_REQUIREMENT_EXTRACTION_FAILURE');}return route('CLARIFY','MISSING_OR_AMBIGUOUS_FACT',clarification(s,c));}
  if(s.intent==='CANCEL_BOOKING'){s.pending_action='CANCEL_BOOKING';return route('CANCEL_BOOKING','EXACT_APPOINTMENT_CONFIRMED');}
  if(selected){s.pending_action=s.intent==='RESCHEDULE_BOOKING'?'RESCHEDULE_BOOKING':'CREATE_BOOKING';return route(s.pending_action,'VERIFIED_SLOT_SELECTION');}
  if(['BOOKING','RESCHEDULE_BOOKING'].includes(s.intent)){s.pending_action='CHECK_AVAILABILITY';return route('CHECK_AVAILABILITY','REQUIRED_ENTITIES_GROUNDED');}
  if(s.intent==='PRICING')return route('PRICING','DATABASE_PRICE');
  if(s.intent==='SERVICE_DISCOVERY')return route('SERVICE_MENU','DATABASE_CATALOG');
  return route('REPLY','NO_OPERATIONAL_AUTHORITY',s.language==='ar'?'أقدر أساعدك بالخدمات والأسعار والحجز أو تعديل موعدك. شو تحتاج؟':'I can help with services, prices, bookings or changing your appointment. What do you need?');
}

export function clarification(s,c,{acknowledge=true}={}) {
  const en=s.language==='en',ref=s.unresolved_references[0],key=s.missing_fields[0];
  if(['date','time'].includes(key)&&s.entities[key]?.source==='AI_INFERENCE')return en?`Please confirm ${s.entities[key].value}?`:`للتأكيد، تقصد ${s.entities[key].value}؟`;
  if(key==='intent_confirmation')return s.intent==='CANCEL_BOOKING'?(en?'Do you want to cancel an appointment?':'تقصد تبا تلغي موعد؟'):s.intent==='RESCHEDULE_BOOKING'?(en?'Do you want to change an appointment?':'تقصد تبا تعدل موعد؟'):(en?'Do you want to book a service?':'تقصد تبا تحجز خدمة؟');
  if(ref==='branch')return en?'Which branch do you mean? This conversation is linked to one branch.':'أي فرع تقصد؟ هذه المحادثة مرتبطة بفرع محدد.';
  if(ref==='voice_transcript')return en?'Please confirm the unclear detail in a short text message.':'ممكن تكتب التفصيل غير الواضح في الصوت؟';
  if(ref==='verified_history')return en?'Which service did you use last time?':'أي خدمة تقصد من آخر مرة؟';
  if(ref==='vehicle')return en?'Which vehicle do you mean?':'أي سيارة تقصد؟';
  if(ref==='slot_confirmation')return en?'Do you want to book that time?':'تبا تحجز هذا الوقت؟';
  if(ref==='multiple_options'||ref==='offered_option')return en?'Which one option do you mean?':'أي خيار واحد تقصد؟';
  if(ref==='date_input')return en?'Do you mean today, tomorrow, or a specific date?':'تقصد اليوم أو باجر، أو اكتب التاريخ؟';
  if(key==='appointment'||ref==='appointment')return en?'Which appointment do you mean?':'أي موعد تقصد؟';
  if(key==='service') {if(s.entities.service?.source==='AI_INFERENCE'&&s.entities.service.label)return en?`Do you mean ${s.entities.service.label}?`:`تقصد ${s.entities.service.label}؟`;const names=arr(s.entities.service?.candidates).map(x=>x.label).slice(0,2);return names.length===2?(en?`Do you mean ${names[0]} or ${names[1]}?`:`تقصد ${names[0]} أو ${names[1]}؟`):(en?'Which service would you like?':'أي خدمة تبا؟');}
  if(key==='date')return en?'Which day works for you?':'أي يوم يناسبك؟';
  if(key==='time') {
    const f=s.entities.time;
    if(f?.part==='after_maghrib')return en?'What exact time after sunset works for you?':'أي ساعة تناسبك بعد المغرب؟';
    if(f?.part==='after_asr')return en?'What exact time in the afternoon works for you?':'أي ساعة تناسبك بعد العصر؟';
    if(f?.part==='am_pm')return en?`Do you mean ${f.hour} AM or PM?`:`تقصد الساعة ${f.hour} صباحًا أو مساءً؟`;
    return en?'What time works for you?':'أي وقت يناسبك؟';
  }
  if(key==='worker')return en?'Which staff member would you prefer?':'أي موظف تفضل؟';
  if(key==='delivery_mode'||ref==='delivery_mode') {const modes=arr(s.activity_requirements?.contract?.delivery_modes);return en?'Where would you like this service: '+modes.join(' / ')+'?':'وين تبا الخدمة: '+modes.map(m=>({AT_BUSINESS:'في الفرع',AT_CUSTOMER:'عندك',MOBILE:'عندك',REMOTE:'عن بعد',PICKUP:'استلام',DELIVERY:'توصيل'}[m]||m)).join(' / ')+'؟';}
  if(['location','vehicle','property_details'].includes(key)) {
    const f=s.entities[key];if(f?.source==='AI_INFERENCE')return en?'Please confirm: '+String(f.value)+'?':'للتأكيد، تقصد '+String(f.value)+'؟';
    const definition=s.activity_requirements?.contract?.entity_definitions?.[key];
    const question=definition?.[en?'question_en':'question_ar']||(en?'Please provide '+key:'ما تفاصيل '+key+'؟');
    // Compose acknowledgement only from grounded facts; the question itself
    // stays bound to the resolver's next entity, never a provider's invented one.
    const service=scoped(c.services,c).find(x=>x.id===valueOf(s,'service'));
    const known=[service?nameOf(service):null,supported(s.entities.date)?valueOf(s,'date'):null,supported(s.entities.time)?(en?'at ':'الساعة ')+valueOf(s,'time'):null].filter(Boolean);
    return acknowledge&&known.length?(en?'Got it: ':'تمام، ')+known.join('، ')+'. '+question:question;
  }
  return en?'Which detail should I use?':'أي تفصيل تقصد؟';
}

export function semanticPlannerContext(c,s) {
  // Internal identifiers and full DB rows never enter the provider context.
  return {language:s.language,goal:s.goal,intent:s.intent,missing_fields:s.missing_fields,
    activity:{type:s.service_type,delivery_mode:s.delivery_mode,required:s.required_entities||[],optional:s.optional_entities||[],supported_actions:s.supported_actions||[],diagnosis_allowed:false},
    entities:Object.fromEntries(Object.entries(s.entities).map(([k,f])=>[k,{value:['date','time','price'].includes(k)?f.value:f.label||null,source:f.source,confidence:f.confidence}])),
    services:arr(c.services).slice(0,12).map(x=>({name:nameOf(x),price:x.price,duration_minutes:x.duration_minutes})),
    knowledge:arr(c.knowledge).filter(k=>k.source==='owner_approved'&&Number(k.confidence)>=.95).slice(0,8).map(k=>({key:clean(k.key,80),answer:clean(k.value?.answer_ar||k.value?.answer_en,400)})),
    business:{type:c.business.business_type,timezone:c.business.timezone,currency:c.business.currency_code},
  };
}
