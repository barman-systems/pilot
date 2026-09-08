import { createHash } from 'node:crypto';
import {
  finalizeOutboundReply,
  markOutboundResult,
  sendMetaText,
  serviceRpc,
} from './_whatsapp-live-core.js';
import { loadConversationConnectionWithServiceKey } from './_whatsapp-service-connection.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_FAILURE=/^(?:gateway_|gemini_|groq_|cloudflare_|ai_planner_unavailable|ai_planner_contract_invalid|empty_ai_response)/i;
const TERMINAL_SUCCESS=new Set(['PROVIDER_ACCEPTED','SENT','DELIVERED','READ']);
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const one=value=>Array.isArray(value)?value[0]??null:value??null;
const hash=value=>createHash('sha256').update(String(value)).digest('hex');

export function isWhatsAppAiProviderFailure(error){
  return PROVIDER_FAILURE.test(clean(error,240));
}

export function providerContinuityMessage(language='en'){
  return clean(language,16).toLowerCase().startsWith('ar')
    ? 'صار خلل مؤقت في المعالجة. أرسل طلبك مرة ثانية وأنا أكمل معك.'
    : 'There was a temporary processing issue. Send your request again and I will continue with you.';
}

async function reserveContinuityMessage(result,body){
  const row=one(await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{
    p_business_id:result.business_id,
    p_conversation_id:result.conversation_id,
    p_idempotency_key:`wa-ai-provider-failover:${result.batch_id}`,
    p_payload_hash:hash(body),
    p_body:body,
  }));
  if(!row?.reservation_id)throw Object.assign(new Error('AI_PROVIDER_FAILOVER_RESERVATION_UNVERIFIED'),{code:'AI_PROVIDER_FAILOVER_RESERVATION_UNVERIFIED'});
  return row;
}

function replayDelivery(reservation){
  const state=clean(reservation?.reservation_state,40).toUpperCase();
  const providerMessageId=clean(reservation?.provider_message_id,320)||null;
  if(TERMINAL_SUCCESS.has(state)&&providerMessageId)return {delivered:true,deduplicated:true,provider_message_id:providerMessageId,state};
  if(state==='AMBIGUOUS')throw Object.assign(new Error('AI_PROVIDER_CONTINUITY_OUTBOUND_AMBIGUOUS'),{code:'AI_PROVIDER_CONTINUITY_OUTBOUND_AMBIGUOUS',ambiguous:true});
  if(state==='FAILED')throw Object.assign(new Error('AI_PROVIDER_CONTINUITY_OUTBOUND_FAILED'),{code:'AI_PROVIDER_CONTINUITY_OUTBOUND_FAILED',definitive:true});
  throw Object.assign(new Error(`AI_PROVIDER_CONTINUITY_RESERVATION_${state||'UNVERIFIED'}`),{code:`AI_PROVIDER_CONTINUITY_RESERVATION_${state||'UNVERIFIED'}`,ambiguous:true});
}

async function deliverContinuityMessage(result){
  const body=providerContinuityMessage(result.customer_language);
  const reservation=await reserveContinuityMessage(result,body);
  if(reservation.should_send!==true)return replayDelivery(reservation);

  const serviceKey=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!serviceKey)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const connection=await loadConversationConnectionWithServiceKey(serviceKey,result.business_id,result.conversation_id);
  if(!connection||connection.status!=='connected')throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'),{code:'WHATSAPP_TENANT_NOT_LINKED'});

  try{
    const sent=await sendMetaText({
      connection,
      businessId:result.business_id,
      recipient:reservation.recipient_handle,
      body,
    });
    try{
      await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId:sent.providerMessageId});
      return {delivered:true,deduplicated:false,provider_message_id:sent.providerMessageId,state:'PROVIDER_ACCEPTED'};
    }catch(error){
      await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','AI_PROVIDER_CONTINUITY_FINALIZE_UNCERTAIN');
      error.ambiguous=true;
      throw error;
    }
  }catch(error){
    if(error?.ambiguous!==true){
      await markOutboundResult(reservation.reservation_id,'FAILED',clean(error?.code||error?.message||'AI_PROVIDER_CONTINUITY_SEND_FAILED',160)).catch(()=>null);
    }
    throw error;
  }
}

async function completeDegraded(result,delivery){
  const completed=one(await serviceRpc('dabbir_whatsapp_ai_provider_degraded_complete',{
    p_dispatch_token:result.dispatch_token,
    p_provider_message_id:delivery.provider_message_id,
  }));
  if(completed?.processed!==true)throw Object.assign(new Error('AI_PROVIDER_CONTINUITY_COMPLETION_UNVERIFIED'),{code:'AI_PROVIDER_CONTINUITY_COMPLETION_UNVERIFIED'});
  return completed;
}

async function hardHandoff(result,error){
  const reason=error?.ambiguous===true?'AMBIGUOUS_PROVIDER_CONTINUITY_OUTBOUND':'PROVIDER_CONTINUITY_DELIVERY_FAILED';
  return one(await serviceRpc('dabbir_whatsapp_ai_provider_degraded_handoff',{
    p_dispatch_token:result.dispatch_token,
    p_reason:reason,
  }).catch(()=>null));
}

export async function failoverWhatsAppAiProvider(dispatchToken,errorCode){
  const token=clean(dispatchToken,80),code=clean(errorCode,240);
  if(!UUID.test(token)||!isWhatsAppAiProviderFailure(code))return {handled:false,state:'NOT_ELIGIBLE'};

  const result=one(await serviceRpc('dabbir_whatsapp_ai_provider_failover',{
    p_dispatch_token:token,
    p_error:code,
  }));
  if(!result?.handled||!UUID.test(clean(result?.batch_id,80))||!UUID.test(clean(result?.business_id,80))||!UUID.test(clean(result?.conversation_id,80))){
    return {handled:false,state:clean(result?.state,60)||'NOT_HANDLED'};
  }
  result.dispatch_token=token;

  try{
    const delivery=await deliverContinuityMessage(result);
    await completeDegraded(result,delivery);
    return {handled:true,state:'PROCESSED',degraded:true,delivery};
  }catch(error){
    const handoff=await hardHandoff(result,error);
    return {handled:true,state:handoff?.state==='HUMAN_REQUIRED'?'HUMAN_REQUIRED':'RETRY',degraded:true,delivery:{delivered:false,error:clean(error?.code||error?.message,160)}};
  }
}

export async function recoverWhatsAppAiProviderFailovers({limit=12}={}){
  const rows=await serviceRpc('dabbir_whatsapp_ai_provider_failover_candidates',{p_limit:Math.max(1,Math.min(25,Number(limit)||12))}).catch(()=>[]);
  const results=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const token=clean(row?.dispatch_token,80);
    if(!UUID.test(token))continue;
    results.push(await failoverWhatsAppAiProvider(token,'AI_PLANNER_UNAVAILABLE').catch(error=>({handled:false,state:'FAILOVER_ERROR',error:clean(error?.code||error?.message,160)})));
  }
  return {processed:results.length,results};
}
