import { interpretSemanticMessage } from './_dabbir-semantic-interpreter.js';
import { retrieveDabbirKnowledge } from './_dabbir-knowledge-rag.js';
import { runUnderstandingTurn } from './_dabbir-understanding-orchestrator.js';
import { catalogMenuForContext, resolveCatalogService, sendMetaCatalogProducts } from './_dabbir-whatsapp-catalog.js';
import { getPublishedBookingFlow, sendMetaBookingFlow } from './_dabbir-whatsapp-flows.js';
import { createHash } from 'node:crypto';
import { serviceRpc, finalizeOutboundReply, markOutboundResult, sendMetaText } from './_whatsapp-live-core.js';
import { loadConversationConnectionWithServiceKey } from './_whatsapp-service-connection.js';

const PERMANENT_AI_FAILURES=new Set([
  'AI_CONTEXT_UNVERIFIED',
  'SEMANTIC_TENANT_SCOPE_INVALID',
  'SEMANTIC_STATE_SCOPE_INVALID',
  'SEMANTIC_MUTATION_BLOCKED',
  'SEMANTIC_OUTCOME_NOT_VERIFIED',
  'SEMANTIC_BUDGET_EXCEEDED',
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
  'CUSTOMER_APPOINTMENT_NOT_FOUND_IN_BRANCH',
  'DABBIR_SERVICE_NOT_AVAILABLE_IN_BRANCH',
  'DABBIR_WORKER_NOT_ASSIGNED_TO_BRANCH',
  'BOOKING_TIMEZONE_UNVERIFIED',
  'WHATSAPP_CONNECTION_AMBIGUOUS_BRANCH',
  'WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH',
  'WHATSAPP_TENANT_NOT_LINKED',
  'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED',
]);
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const one=v=>Array.isArray(v)?v[0]??null:v??null;
const hash=value=>createHash('sha256').update(String(value)).digest('hex');

function serviceKey(){return clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192)}
function latestText(context){return arr(context?.batch_messages).map(x=>clean(x?.body,1500)).filter(Boolean).join('\n').slice(0,2500)}
function fmtWhen(value,timezone,lang){
  try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return clean(value,80)}
}
function slotsText(slots,lang){
  const lines=arr(slots).slice(0,3).map((s,i)=>`${i+1}) ${fmtWhen(s.starts_at,s.timezone,lang)}${s.worker_name?(lang==='ar'?` مع ${s.worker_name}`:` with ${s.worker_name}`):''}`);
  if(!lines.length)return lang==='ar'?'لا يوجد وقت متاح قريب من طلبك. أعطني وقتًا آخر يناسبك.':'No nearby slot is available. Send me another time that works for you.';
  return lang==='ar'?`المتاح:\n${lines.join('\n')}\nاختر الوقت المناسب.`:`Available:\n${lines.join('\n')}\nChoose the time that works for you.`;
}
export function bookingText(result,lang){
  const timezone=clean(result?.timezone,80);if(!timezone)throw Object.assign(new Error('BOOKING_TIMEZONE_UNVERIFIED'),{code:'BOOKING_TIMEZONE_UNVERIFIED'});
  const when=fmtWhen(result?.starts_at,timezone,lang),service=clean(result?.service_name,160),worker=clean(result?.worker_name,120);
  if(result?.confirmation_gate==='deposit'&&result?.status!=='confirmed'){
    const amount=Number(result?.deposit_required_amount||0),currency=clean(result?.deposit_currency_code||result?.currency_code,8);
    return lang==='ar'?`تم تسجيل موعدك ✅ ${service?`${service} — `:''}${when}${worker?` مع ${worker}`:''}. يحتاج عربون ${amount} ${currency} للتأكيد.`:`Your appointment is recorded ✅ ${service?`${service} — `:''}${when}${worker?` with ${worker}`:''}. A ${amount} ${currency} deposit is required to confirm it.`;
  }
  if(result?.status!=='confirmed')return lang==='ar'?`تم تسجيل طلب حجزك ${service?`${service} — `:''}${when}. بانتظار التأكيد.`:`Your booking request is recorded ${service?`${service} — `:''}${when}. Confirmation is pending.`;
  return lang==='ar'?`تم تأكيد حجزك ✅ ${service?`${service} — `:''}${when}${worker?` مع ${worker}`:''}.`:`Your booking is confirmed ✅ ${service?`${service} — `:''}${when}${worker?` with ${worker}`:''}.`;
}
async function handoff(context,reason,summary,route='SUPPORT'){return serviceRpc('dabbir_whatsapp_ai_handoff',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_route_class:route,p_reason:clean(reason,500),p_summary:clean(summary,1200)})}

async function reserveReply(claim,context,body,purpose){
  const text=clean(body,4000),key=claim.semantic_version?`wa-understanding:${claim.batch_id}:${clean(purpose,24)}`:`wa-ai:${claim.batch_id}:attempt:${claim.attempt_count}:${clean(purpose,24)}`;
  const row=one(claim.semantic_version?await serviceRpc('dabbir_semantic_reserve_outbound_v2',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_version:claim.semantic_version,p_key:key,p_hash:hash(text),p_body:text}):await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_idempotency_key:key,p_payload_hash:hash(text),p_body:text}));
  if(!row?.reservation_id)throw Object.assign(new Error('AI_OUTBOUND_RESERVATION_UNVERIFIED'),{code:'AI_OUTBOUND_RESERVATION_UNVERIFIED'});
  return row;
}
async function deliver(claim,context,body,purpose='reply',transport=null){
  const reservation=await reserveReply(claim,context,body,purpose);
  if(reservation.should_send!==true){
    if(claim.semantic_version&&!reservation.provider_message_id)throw Object.assign(new Error('SEMANTIC_OUTBOUND_UNCERTAIN'),{code:'SEMANTIC_OUTBOUND_UNCERTAIN',ambiguous:true});
    return {deduplicated:true,state:clean(reservation.reservation_state,40),providerMessageId:clean(reservation.provider_message_id,320)||null};
  }
  const key=serviceKey();if(!key)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const connection=await loadConversationConnectionWithServiceKey(key,context.business.id,context.conversation.id);
  if(!connection||connection.status!=='connected')throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'),{code:'WHATSAPP_TENANT_NOT_LINKED'});
  try{
    const sent=transport?await transport(connection,reservation.recipient_handle):await sendMetaText({connection,businessId:context.business.id,recipient:reservation.recipient_handle,body});
    try{return {...await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId:sent.providerMessageId}),providerMessageId:sent.providerMessageId}}
    catch(error){await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','WHATSAPP_OUTBOUND_FINALIZE_UNCERTAIN');error.ambiguous=true;throw error}
  }catch(error){
    if(error?.ambiguous===true)await markOutboundResult(reservation.reservation_id,'AMBIGUOUS',clean(error?.code||error?.message,160));
    else await markOutboundResult(reservation.reservation_id,'FAILED',Number(error?.providerStatus)===429?'META_HTTP_429':clean(error?.code||error?.message,160));
    throw error;
  }
}
async function finish(claim,outcome,error=null){return serviceRpc('dabbir_whatsapp_ai_finish_batch',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_outcome:outcome,p_error:error})}


async function processClaim(claim){
  const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  if(!context?.business?.id||!context?.conversation?.id)throw Object.assign(new Error('AI_CONTEXT_UNVERIFIED'),{code:'AI_CONTEXT_UNVERIFIED'});
  return runUnderstandingTurn({claim,context,rpc:serviceRpc,deliver,finish,handoff,bookingText,slotsText,resolveProduct:resolveCatalogService,cognitiveMode:'policy',
    deliverMenu:async(guarded,c,lang)=>{
      const connection=await loadConversationConnectionWithServiceKey(serviceKey(),c.business.id,c.conversation.id);
      const flow=await getPublishedBookingFlow({businessId:c.business.id,connectionId:connection.id});
      if(flow?.id){
        try{
          return await deliver(guarded,c,lang==='ar'?'أكمل طلب الحجز في نموذج واحد.':'Complete your booking request in one form.','booking-flow',(conn,recipient)=>sendMetaBookingFlow({context:c,connection:conn,recipient,lang,flow}));
        }catch(error){
          if(error?.ambiguous===true||Number(error?.providerStatus)===429)throw error;
          const safeFallback=error?.flowFallbackSafe===true||(error?.definitive===true&&Number(error?.providerStatus)>=400&&Number(error?.providerStatus)<500);
          if(!safeFallback)throw error;
        }
      }
      const menu=await catalogMenuForContext({context:c,connection,allowSync:false});
      if(!menu?.items?.length)return null;
      try{return await deliver(guarded,c,lang==='ar'?'اختر الخدمة التي تريدها من الكتالوج.':'Choose the service you want from the catalog.','catalog-products',(conn,recipient)=>sendMetaCatalogProducts({connection:conn,businessId:c.business.id,recipient,catalogId:menu.catalogId,items:menu.items,lang}));}
      catch(error){if(error?.ambiguous!==true&&error?.definitive===true&&Number(error?.providerStatus)!==429)return null;throw error;}
    },
    planner:async(c,safeContext)=>{
      const message=latestText(c);
      const retrieved=await retrieveDabbirKnowledge({businessId:c.business.id,query:message,rpc:serviceRpc,env:process.env,fetchImpl:fetch,limit:5});
      const result=await interpretSemanticMessage({message,context:{...safeContext,retrieved_business_knowledge:retrieved},
        referenceTime:c.batch?.last_message_at||c.batch_messages?.at(-1)?.created_at,
        meteringContext:{business:{id:c.business.id},conversation:{id:c.conversation.id},batch_message_created_at:c.batch?.last_message_at}});
      return {...result.proposal,executionMetadata:{provider:result.provider,model:result.model,...result.telemetry}};
    }});
}

async function requireHumanForFailure(claim,code,reason){
  try{const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});await handoff(context,reason,code,'SUPPORT')}catch{}
  await finish(claim,'HUMAN_REQUIRED',code).catch(()=>null);return {state:'HUMAN_REQUIRED',error:code};
}
async function handleFailure(claim,error){
  const code=clean(error?.code||error?.message||'AI_BATCH_FAILED',240);
  if(code==='SEMANTIC_SUPERSEDED'||code==='SEMANTIC_VERSION_CONFLICT'){await finish(claim,'CANCELLED',code).catch(()=>null);return {state:'CANCELLED',error:code};}
  if(error?.ambiguous===true){return requireHumanForFailure(claim,`AMBIGUOUS_OUTBOUND:${code}`,'Ambiguous WhatsApp delivery requires human review')}
  if(Number(error?.providerStatus)===429){await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code}}
  if(error?.definitive===true||Number(error?.providerStatus)>=400&&Number(error?.providerStatus)<500){return requireHumanForFailure(claim,code,'WhatsApp delivery failed and needs human review')}
  if(PERMANENT_AI_FAILURES.has(code)){return requireHumanForFailure(claim,code,'Permanent AI or routing contract failure requires human review')}
  if(code==='AI_PLANNER_CONTRACT_INVALID'&&Number(claim?.attempt_count||0)>=2){return requireHumanForFailure(claim,code,'AI planner returned an invalid action contract repeatedly')}
  if(Number(claim?.attempt_count||0)>=5){return requireHumanForFailure(claim,code,'AI processing exhausted safe retry attempts')}
  await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code};
}
export async function processClaimedWhatsAppAiBatch(claim){try{return await processClaim(claim)}catch(error){return handleFailure(claim,error)}}
