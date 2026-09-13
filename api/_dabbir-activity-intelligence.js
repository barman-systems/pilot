// Operational requirements are supplied by the versioned database registry.
// A provider can propose facts; it cannot edit this contract or authorize a tool.
const arr = v => Array.isArray(v) ? v : [];
const uniq = v => [...new Set(v)];
const OPERATIONAL_ACTIONS = new Set(['CHECK_AVAILABILITY','CREATE_BOOKING','RESCHEDULE_BOOKING','CANCEL_BOOKING']);
// The service contract is authority. A model proposal and a registry label are not.
export function activityActionAuthority(context,state,action) {
  if(!OPERATIONAL_ACTIONS.has(action))return {allowed:true};
  const profile=context?.activity_profile,scope=state?.scope;
  if(!scope || profile?.source!=='DATABASE_FACT' || profile.version!==1 ||
    profile.business_id!==context.business?.id || profile.branch_id!==context.conversation?.branch_id ||
    scope.business_id!==profile.business_id || scope.branch_id!==profile.branch_id ||
    scope.customer_id!==context.customer?.id || scope.conversation_id!==context.conversation?.id)
    return {allowed:false,reason:'ACTIVITY_PROFILE_UNVERIFIED'};
  const appointment=arr(context.upcoming_appointments).find(a=>a.id===state.entities?.appointment?.value &&
    a.business_id===profile.business_id && a.branch_id===profile.branch_id && (!a.customer_id||a.customer_id===scope.customer_id));
  const serviceId=['CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(action)?appointment?.service_id:state.entities?.service?.value;
  const contract=arr(profile.services).find(s=>s.service_id===serviceId && s.business_id===profile.business_id && s.branch_id===profile.branch_id);
  if(!contract)return {allowed:false,reason:'ACTIVITY_SERVICE_CONTEXT_UNVERIFIED'};
  if(!Array.isArray(contract.supported_actions) || !contract.supported_actions.every(a=>typeof a==='string'))
    return {allowed:false,reason:'ACTIVITY_ACTION_CONTRACT_INVALID'};
  if(!contract.supported_actions.includes(action))return {allowed:false,reason:'ACTIVITY_ACTION_NOT_SUPPORTED'};
  return {allowed:true,service_id:serviceId,activity_type:contract.activity_type,contract_version:contract.contract_version};
}
export const DELIVERY_MODES = Object.freeze(['AT_BUSINESS','AT_CUSTOMER','MOBILE','REMOTE','PICKUP','DELIVERY','HYBRID']);
export const FACT_SOURCES = Object.freeze(['DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED']);
export const normalizeDeliveryMode = v => ({AT_BRANCH:'AT_BUSINESS',HOME:'AT_CUSTOMER'}[String(v||'').toUpperCase()] || String(v||'').toUpperCase());
export function validLocation(value) {
  return value && typeof value.lat === 'number' && typeof value.lng === 'number' && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat)<=90 && Math.abs(value.lng)<=180;
}
export function verifiedOperationalFact(f) {
  return f?.status === 'active' && f.value != null && f.value !== '' && Number(f.confidence)>=.9 && FACT_SOURCES.includes(f.source);
}
export function serviceAreaCheck(location, area) {
  if (!area) return {status:'NOT_CONFIGURED',provider:'registry_v1'};
  if (!validLocation(location)) return {status:'LOCATION_INVALID',provider:'registry_v1'};
  if (area.type !== 'CIRCLE' || !validLocation(area.center) || !(area.radius_km>0 && area.radius_km<=500)) return {status:'UNVERIFIED',provider:'registry_v1'};
  const rad = n=>n*Math.PI/180;
  const a = Math.sin(rad(location.lat-area.center.lat)/2)**2 + Math.cos(rad(location.lat))*Math.cos(rad(area.center.lat))*Math.sin(rad(location.lng-area.center.lng)/2)**2;
  const distance = 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
  return {status:distance<=area.radius_km?'AVAILABLE':'OUTSIDE_AREA',provider:'registry_v1'};
}
export function resolveOperationalRequirements({business,service,delivery_mode,current_state,profile,now=new Date()}) {
  const state=current_state||{}, entities=state.entities||{};
  const result={required:[],optional:[],already_satisfied:[],missing:[],invalid:[],needs_confirmation:[],blocked:[],reasons:[],service_area:null};
  const block=code=>{result.blocked.push(code);result.reasons.push(code);};
  if (!profile || profile.business_id!==business?.id || profile.branch_id!==state.scope?.branch_id || profile.source!=='DATABASE_FACT' || profile.version!==1) {block('ACTIVITY_PROFILE_UNVERIFIED');return result;}
  const contract=arr(profile.services).find(x=>x.service_id===service?.id);
  if (!contract) {result.required=['service'];result.missing=['service'];return result;}
  if(contract.business_id!==business.id || contract.branch_id!==state.scope.branch_id) {block('ACTIVITY_SERVICE_SCOPE_MISMATCH');return result;}
  if(contract.configuration_status==='UNCONFIGURED') {block('ACTIVITY_TYPE_UNCONFIGURED');return result;}
  result.contract=contract;
  const mode=normalizeDeliveryMode(delivery_mode);
  if(!DELIVERY_MODES.includes(mode) || mode==='HYBRID' || !arr(contract.delivery_modes).includes(mode)) {
    // Confirmed provenance cannot make an unsupported business mode valid.
    // Keep that distinction explicit so the quality gate can ask to correct it.
    result.required=['delivery_mode'];result.missing=['delivery_mode'];
    if(delivery_mode!=null)result.invalid=['delivery_mode'];
    return result;
  }
  const rules=contract.mode_requirements?.[mode];
  if(!rules || !Array.isArray(rules.required) || !Array.isArray(contract.collection_priority)) {block('ACTIVITY_CONTRACT_INVALID');return result;}
  const mandatory=['service','branch','delivery_mode',...(['MOBILE','AT_CUSTOMER','PICKUP','DELIVERY'].includes(mode)?['location']:[])];
  const selected=verifiedOperationalFact(entities.slot);
  result.required=uniq([...mandatory,...rules.required,...(selected?['slot']:['date','time'])]);
  // A selected, presented slot supplies date/time; it never supplies domain facts.
  if(selected) result.required=result.required.filter(k=>!['date','time'].includes(k));
  result.optional=arr(rules.optional).filter(k=>!result.required.includes(k));
  const priority=contract.collection_priority;
  result.required.sort((a,b)=>(priority.indexOf(a)<0?100:priority.indexOf(a))-(priority.indexOf(b)<0?100:priority.indexOf(b)));
  for(const key of result.required) {
    const f=entities[key];
    if(!verifiedOperationalFact(f)) {
      result.missing.push(key);
      if(f?.value!=null && (f.source==='AI_INFERENCE'||f.confidence<.9)) result.needs_confirmation.push(key);
      continue;
    }
    let valid=true;
    if(key==='location') valid=validLocation(f.value) && (f.source==='CUSTOMER_MEMORY' ? !!f.memory_id : !!f.receipt_id);
    if(key==='vehicle') valid=arr(contract.entity_definitions?.vehicle?.values).includes(f.value);
    if(key==='branch') valid=f.value===profile.branch_id;
    if(key==='service') valid=f.value===contract.service_id;
    if(key==='delivery_mode') valid=f.value===mode;
    if(key==='property_details') valid=typeof f.value==='string' && f.value.trim().length>=2 && f.value.length<=300;
    if(key==='worker') valid=arr(profile.workers).some(w=>w.id===f.value && arr(w.service_ids).includes(contract.service_id));
    if(f.source==='CUSTOMER_MEMORY') {
      const memory=arr(profile.verified_memory).find(m=>m.id===f.memory_id && m.version===f.memory_version);
      valid=valid && !!memory && memory.status==='verified' && memory.business_id===business.id && memory.customer_id===state.scope.customer_id && memory.branch_id===profile.branch_id && !memory.revoked_at && Date.parse(memory.expires_at)>now.getTime() && (!memory.service_id||memory.service_id===contract.service_id);
    }
    if(valid)result.already_satisfied.push(key);else result.invalid.push(key);
  }
  if(verifiedOperationalFact(entities.location) && result.required.includes('location')) {
    result.service_area=serviceAreaCheck(entities.location.value,contract.service_area);
    if(!['AVAILABLE','NOT_CONFIGURED'].includes(result.service_area.status))block('SERVICE_AREA_'+result.service_area.status);
  }
  if(contract.automatic_booking===false || contract.owner_approval===true)block('OWNER_APPROVAL_REQUIRED');
  result.missing=uniq([...result.missing,...result.invalid]);
  return result;
}
export function applyActivityRequirements(state,context,now=new Date()) {
  const profile=context.activity_profile;
  const service=arr(context.services).find(x=>x.id===state.entities?.service?.value);
  const contract=arr(profile?.services).find(x=>x.service_id===service?.id);
  const singleMode=arr(contract?.delivery_modes).length===1 && contract.delivery_modes[0]!=='HYBRID' ? contract.delivery_modes[0] : null;
  let mode=state.entities?.delivery_mode;
  if(mode?.service_id!==service?.id) {delete state.entities.delivery_mode;mode=null;}
  // A model guess that happens to equal the service's only database-authorized
  // delivery mode must not shadow the stronger contract fact. Explicit conflicts
  // remain unresolved so we never silently override what the customer asked for.
  const explicitModeConflict=arr(state.unresolved_references).includes('delivery_mode');
  if(singleMode && (!mode || (mode.source==='AI_INFERENCE' && mode.value===singleMode && !explicitModeConflict))) {
    mode=state.entities.delivery_mode={value:singleMode,source:'DATABASE_FACT',confidence:1,status:'active',service_id:service.id,updated_at:now.toISOString()};
  }
  const resolution=resolveOperationalRequirements({business:context.business,service,delivery_mode:mode?.value,current_state:state,profile,now});
  state.business_type=context.business?.business_type;
  state.activity_schema_version=contract?.schema_version||null;
  state.activity_contract_version=contract?.contract_version||null;
  state.activity_instance_id=contract?.activity_instance_id||null;
  state.supported_actions=arr(contract?.supported_actions).filter(a=>typeof a==='string'&&/^[A-Z_]{1,40}$/.test(a)).slice(0,12);
  state.service_id=service?.id||null;state.service_type=contract?.activity_type||null;
  state.delivery_mode=mode?.value||null;
  state.required_entities=resolution.required;state.optional_entities=resolution.optional;
  state.invalid_fields=resolution.invalid;state.confirmed_fields=resolution.already_satisfied;
  state.activity_requirements=resolution;
  // Preserve the existing compact field for metrics and existing clients.
  state.business_constraints=resolution.required.filter(x=>!['service','branch','delivery_mode','date','time','slot'].includes(x));
  return resolution;
}
export const REQUIREMENT_LOOP_IDLE_MS=30*60*1000;
export function detectRequirementLoop(state,previous,messageRole=null) {
  const key=state.clarification_entity;
  if(!key || state.pending_action!=='CLARIFY'){state.requirement_loop=null;return false;}
  // A social interruption ends the failed-answer episode, not the business goal.
  if(messageRole==='SOCIAL'){state.requirement_loop=null;return false;}
  const current=JSON.stringify(state.entities?.[key]||null),before=JSON.stringify(previous?.entities?.[key]||null);
  const progressed=Object.entries(state.entities||{}).some(([field,f])=>field!=='branch'&&verifiedOperationalFact(f)&&JSON.stringify(f.value)!==JSON.stringify(previous?.entities?.[field]?.value));
  const last=previous?.requirement_loop;
  const age=Date.parse(state.updated_at)-Date.parse(last?.updated_at||previous?.updated_at);
  const sameEpisode=Number.isFinite(age)&&age>=0&&age<=REQUIREMENT_LOOP_IDLE_MS&&
    previous?.pending_action==='CLARIFY'&&previous?.goal===state.goal&&
    previous?.entities?.service?.value===state.entities?.service?.value&&last?.key===key&&Number(last.count)>=1;
  const repeated=sameEpisode&&!progressed && previous?.clarification_entity===key && current===before;
  const references=state.context_resolution;
  const answeredOtherFact=(references?.resolved||[]).length>0&&!(references?.resolved||[]).some(r=>r.field===key)&&!(references?.unresolved||[]).includes(key);
  const nonAnswer=['SIDE_QUESTION','TOPIC_SWITCH'].includes(messageRole)||answeredOtherFact;
  // No failed answer occurred on a side question or an answer to another fact.
  // The next actual failed answer starts at one, even if clarification remains.
  if(nonAnswer){state.requirement_loop=null;return false;}
  const count=repeated?last.count+1:1;
  state.requirement_loop={key,count,updated_at:state.updated_at,revision:state.revision};
  return count>=3;
}
