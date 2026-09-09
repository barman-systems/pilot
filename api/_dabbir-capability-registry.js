const EXECUTION_ACTIONS=new Set(['CREATE_BOOKING','RESCHEDULE_BOOKING','CANCEL_BOOKING']);
const clean=(value,max=180)=>String(value??'').trim().slice(0,max);

export async function resolveCapabilityShadow({rpc,intent,action,activityType=null}={}){
  if(typeof rpc!=='function')return {ok:false,state:'UNAVAILABLE',capabilities:[]};
  try{
    const payload=await rpc('dabbir_capability_resolve_v1',{p_intent:clean(intent,80).toUpperCase(),p_action:clean(action,100).toUpperCase(),p_activity_type:clean(activityType,100).toLowerCase()||null});
    const capabilities=Array.isArray(payload)?payload:[];
    return {ok:true,state:capabilities.length?'MATCHED':'NO_MATCH',capabilities:capabilities.slice(0,8)};
  }catch{return {ok:false,state:'UNAVAILABLE',capabilities:[]}}
}
export function capabilityShadowVerdict({decision,capabilities=[]}={}){
  const action=clean(decision?.action,100).toUpperCase(),mutation=EXECUTION_ACTIONS.has(action);
  const match=(Array.isArray(capabilities)?capabilities:[]).find(item=>clean(item?.tool_name,100).toUpperCase()===action)||null;
  if(!mutation)return {mode:'SHADOW',mutation:false,matched:Boolean(match),would_block:false};
  if(!match)return {mode:'SHADOW',mutation:true,matched:false,would_block:true,reason:'CAPABILITY_NOT_REGISTERED'};
  if(match.enabled!==true)return {mode:'SHADOW',mutation:true,matched:true,would_block:true,reason:'CAPABILITY_DISABLED'};
  return {mode:'SHADOW',mutation:true,matched:true,would_block:false,risk_level:match.risk_level,verification_mode:match.verification_mode};
}
