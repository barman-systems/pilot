// Canonical dispatch/recovery owner. Claims and fallback contracts are preserved.
import { serviceRpc } from './_whatsapp-live-core.js';
import { processClaimedWhatsAppAiBatch } from './_dabbir-whatsapp-ai-core.js';

const PERMANENT_SERVICE_FAILURES=new Set([
  'AI_PENDING_ACTION_INVALID',
  'AI_CONVERSATION_NOT_FOUND',
  'AI_CONVERSATION_BRANCH_INACTIVE',
  'AI_BLOCKED_BY_HUMAN_TAKEOVER',
  'BUSINESS_PROFILE_UNVERIFIED',
  'ACTION_SERVICE_NOT_AVAILABLE',
  'ACTION_SERVICE_NOT_AVAILABLE_IN_BRANCH',
  'ACTION_WORKER_NOT_AVAILABLE',
  'ACTION_WORKER_NOT_AVAILABLE_IN_BRANCH',
  'ACTION_WORKER_SERVICE_MISMATCH',
  'DABBIR_SERVICE_NOT_AVAILABLE_IN_BRANCH',
  'DABBIR_WORKER_NOT_ASSIGNED_TO_BRANCH',
  'WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH',
  'WHATSAPP_TENANT_NOT_LINKED',
  'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED',
  'WHATSAPP_MENU_CONTEXT_INCOMPLETE',
  'WHATSAPP_CATALOG_SEND_CONTEXT_INCOMPLETE',
]);
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

async function finish(claim,outcome,error=null){return serviceRpc('dabbir_whatsapp_ai_finish_batch',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_outcome:outcome,p_error:error});}
async function serviceHandoff(claim,code,reason){
  try{
    const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
    if(context?.business?.id&&context?.conversation?.id)await serviceRpc('dabbir_whatsapp_ai_handoff',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_route_class:'SUPPORT',p_reason:clean(reason,500),p_summary:clean(code,1200)});
  }catch{}
  await finish(claim,'HUMAN_REQUIRED',code).catch(()=>null);
  return {state:'HUMAN_REQUIRED',error:code};
}
async function handleServiceFailure(claim,error,label){
  const code=clean(error?.code||error?.message||label||'SERVICE_MENU_FAILED',200);
  if(Number(error?.providerStatus)===429){await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code};}
  if(error?.ambiguous===true)return serviceHandoff(claim,`AMBIGUOUS_OUTBOUND:${code}`,'Ambiguous service-menu delivery requires human review');
  if(error?.definitive===true||Number(error?.providerStatus)>=400&&Number(error?.providerStatus)<500)return serviceHandoff(claim,code,'Service-menu delivery failed definitively');
  if(PERMANENT_SERVICE_FAILURES.has(code))return serviceHandoff(claim,code,'Permanent service-menu contract failure');
  if(Number(claim?.attempt_count||0)>=5)return serviceHandoff(claim,code,'Service-menu processing exhausted safe retry attempts');
  await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code};
}

async function tryServiceFlow(claim){
  // V2 owns catalog, time, clarification and mutation routing in one pipeline.
  return processClaimedWhatsAppAiBatch(claim);
}


export async function processWhatsAppDispatchWithServiceMenu(dispatchToken){
  let claim=await serviceRpc('dabbir_whatsapp_ai_claim_dispatch',{p_dispatch_token:dispatchToken});
  if(claim?.state==='WAIT'){
    const delay=Math.min(1500,Math.max(0,new Date(claim.ready_at).getTime()-Date.now()+30));if(delay>0)await new Promise(r=>setTimeout(r,delay));
    claim=await serviceRpc('dabbir_whatsapp_ai_claim_dispatch',{p_dispatch_token:dispatchToken});
  }
  if(claim?.state!=='CLAIMED')return {claimed:false,state:clean(claim?.state,40)||'NOOP'};
  try{const handled=await tryServiceFlow(claim);if(handled)return {claimed:true,...handled};}
  catch(error){return {claimed:true,...await handleServiceFailure(claim,error,'SERVICE_MENU_FAILED')}}
  return {claimed:true,...await processClaimedWhatsAppAiBatch(claim)};
}

export async function processWhatsAppRecoveryWithServiceMenu({limit=12}={}){
  const results=[];
  for(let i=0;i<Math.max(1,Math.min(25,Number(limit)||12));i+=1){
    const claim=await serviceRpc('dabbir_whatsapp_ai_claim_next',{});if(claim?.state==='EMPTY')break;if(claim?.state!=='CLAIMED'){results.push({state:claim?.state||'NOOP'});continue;}
    try{const handled=await tryServiceFlow(claim);results.push(handled||await processClaimedWhatsAppAiBatch(claim));}
    catch(error){results.push(await handleServiceFailure(claim,error,'SERVICE_MENU_RECOVERY_FAILED'));}
  }
  return {processed:results.length,results};
}
