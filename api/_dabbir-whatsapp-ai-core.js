import { createHash } from 'node:crypto';
import { generateDABBIRAiReply } from './_ai-core.js';
import { serviceRpc, finalizeOutboundReply, markOutboundResult, sendMetaText } from './_whatsapp-live-core.js';
import { loadConversationConnectionWithServiceKey } from './_whatsapp-service-connection.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const ARABIC=/[\u0600-\u06ff]/;
const HUMAN_REQUEST=/(?:\b(?:human|agent|person|staff|manager|owner)\b|موظف(?:ة)?|شخص حقيقي|إنسان|انسان|بشر|المالك|المدير|أكلم أحد|اكلم احد|حوّلني|حولني)/i;
const CHOICE=[/(?:^|\s)(?:1|الأول|الاول|اول|أول|first)(?:\s|$)/i,/(?:^|\s)(?:2|الثاني|ثاني|second)(?:\s|$)/i,/(?:^|\s)(?:3|الثالث|ثالث|third)(?:\s|$)/i];
const PERMANENT_AI_FAILURES=new Set([
  'AI_CONTEXT_UNVERIFIED',
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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));
const hash=value=>createHash('sha256').update(String(value)).digest('hex');

function serviceKey(){return clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192)}
function language(text){return ARABIC.test(String(text||''))?'ar':'en'}
function norm(value){return clean(value,180).toLocaleLowerCase().normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function exactNamed(items,name,keys){const wanted=norm(name);if(!wanted)return null;return arr(items).find(item=>keys.some(key=>norm(item?.[key])===wanted))||null}
function choiceIndex(text){for(let i=0;i<CHOICE.length;i+=1)if(CHOICE[i].test(String(text||'')))return i;return null}
function latestText(context){return arr(context?.batch_messages).map(x=>clean(x?.body,1500)).filter(Boolean).join('\n').slice(0,2500)}
function safeUuid(value){const v=clean(value,80);return UUID.test(v)?v:null}
function looksLikePlannerEnvelope(value){
  const text=clean(value,1800).replace(/^```(?:json)?\s*/i,'').trim();
  return /^[\[{]/.test(text)&&/(?:["']?action["']?\s*:|["']?service_name["']?\s*:|["']?selected_slot_index["']?\s*:)/i.test(text);
}
function customerReply(value){const text=clean(value,1400);return looksLikePlannerEnvelope(text)?'':text}
function plannerHistory(context){
  return arr(context?.history).map(item=>{
    const sender=clean(item?.sender_type,30).toLowerCase();
    const body=clean(item?.body,600);
    if(!body||!['customer','ai','human'].includes(sender))return null;
    if(sender==='ai'&&looksLikePlannerEnvelope(body))return null;
    return {sender_type:sender,body,created_at:item?.created_at||null};
  }).filter(Boolean).slice(-8);
}
function localNow(timezone){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  }catch{return new Date().toISOString()}
}
function parseDecision(raw){
  const text=clean(raw,3500).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a<0||b<=a)return null;
  try{
    const x=JSON.parse(text.slice(a,b+1));if(!x||typeof x!=='object'||Array.isArray(x))return null;
    const action=clean(x.action,40).toUpperCase();
    if(!['REPLY','CHECK_AVAILABILITY','CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HANDOFF'].includes(action))return null;
    return {
      action,reply:customerReply(x.reply),serviceName:clean(x.service_name,180)||null,workerName:clean(x.worker_name,180)||null,
      requestedLocal:LOCAL_ISO.test(clean(x.requested_local,40))?clean(x.requested_local,40):null,
      slotIndex:Number.isInteger(Number(x.selected_slot_index))?Number(x.selected_slot_index)-1:null,
      appointmentIndex:Number.isInteger(Number(x.appointment_index))?Number(x.appointment_index)-1:null,
      reuseLast:x.reuse_last===true,routeClass:clean(x.route_class,40).toUpperCase()||'SUPPORT',
    };
  }catch{return null}
}
function compactContext(context,recent){
  return JSON.stringify({
    business:{name:clean(context?.business?.name,160),type:clean(context?.business?.business_type,80),country_code:clean(context?.business?.country_code,12),currency_code:clean(context?.business?.currency_code,12),timezone:clean(context?.business?.timezone,80),current_local_time:localNow(context?.business?.timezone)},
    customer:{name:clean(context?.customer?.display_name,120)},
    conversation_history:plannerHistory(context),
    services:arr(context?.services).slice(0,12).map(x=>({name:clean(x.name_ar||x.name||x.name_en,140),price:x.price,duration_minutes:x.duration_minutes})),
    workers:arr(context?.workers).slice(0,10).map(x=>({name:clean(x.display_name,120),job_title:clean(x.job_title,100)})),
    upcoming:arr(context?.upcoming_appointments).slice(0,6).map(x=>({starts_at:x.starts_at,status:x.status,service_id:x.service_id,worker_id:x.worker_id,confirmation_gate:x.confirmation_gate})),
    recent:arr(recent).slice(0,5).map(x=>({service_name:clean(x.service_name,140),worker_name:clean(x.worker_name,120),starts_at:x.starts_at,status:x.status,service_id:x.service_id,worker_id:x.worker_id})),
    pending:context?.pending_state||null,
    knowledge:arr(context?.knowledge).slice(0,6).map(x=>({key:clean(x.key,100),type:clean(x.type,60),value:clean(x.value,260)})),
  });
}
async function decide(context,recent){
  const text=latestText(context),lang=language(text),tz=clean(context?.business?.timezone,80);
  const prompt=[
    'You are the DABBIR WhatsApp receptionist action planner for a GCC business. Return ONLY one minified JSON object.',
    'Allowed actions: REPLY, CHECK_AVAILABILITY, CREATE_BOOKING, CANCEL_BOOKING, RESCHEDULE_BOOKING, HANDOFF.',
    'Schema: {"action":"...","reply":"...","service_name":null,"worker_name":null,"requested_local":null,"selected_slot_index":null,"appointment_index":null,"reuse_last":false,"route_class":"SUPPORT"}',
    'Never invent a service, worker, price, policy, appointment, availability, or booking result. Use VERIFIED CONTEXT only.',
    'Use conversation_history and pending state for short follow-ups such as price questions, "same as before", "I told you", or a time sent after choosing a service.',
    'service_name and worker_name must exactly match a name in VERIFIED CONTEXT when supplied.',
    `Business timezone is ${tz}; current local time is ${localNow(tz)}. Convert clear relative dates to requested_local YYYY-MM-DDTHH:MM:SS.`,
    'If date/time is genuinely ambiguous, use REPLY and ask only the missing detail. Do not guess a broad daypart.',
    'For a new booking request with enough service/time detail use CHECK_AVAILABILITY. Do not use CREATE_BOOKING unless the user is confirming a slot already present in pending state.',
    'If the user says same as last time, set reuse_last=true and use CHECK_AVAILABILITY; do not invent past details.',
    'For cancellation choose CANCEL_BOOKING and appointment_index from upcoming appointments. If ambiguous, REPLY and ask which appointment.',
    'For rescheduling choose RESCHEDULE_BOOKING with appointment_index and requested_local. If ambiguous, ask the shortest question.',
    'If the user asks for a human, use HANDOFF. For normal FAQ use REPLY grounded only in verified context.',
    `CUSTOMER_MESSAGE=${JSON.stringify(text)}`,
  ].join('\n');
  const ai=await generateDABBIRAiReply({project:'dabbir_businesses',message:prompt,language:lang,businessContext:compactContext(context,recent),history:[]});
  if(!ai?.ok||!clean(ai?.reply))throw Object.assign(new Error(clean(ai?.error,160)||'AI_PLANNER_UNAVAILABLE'),{code:clean(ai?.error,160)||'AI_PLANNER_UNAVAILABLE'});
  const decision=parseDecision(ai.reply);
  if(!decision)throw Object.assign(new Error('AI_PLANNER_CONTRACT_INVALID'),{code:'AI_PLANNER_CONTRACT_INVALID'});
  return decision;
}
function fmtWhen(value,timezone,lang){
  try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return clean(value,80)}
}
function slotsText(slots,lang){
  const lines=arr(slots).slice(0,3).map((s,i)=>`${i+1}) ${fmtWhen(s.starts_at,s.timezone,lang)}${s.worker_name?(lang==='ar'?` مع ${s.worker_name}`:` with ${s.worker_name}`):''}`);
  if(!lines.length)return lang==='ar'?'لا يوجد وقت متاح قريب من طلبك. أعطني وقتًا آخر يناسبك.':'No nearby slot is available. Send me another time that works for you.';
  return lang==='ar'?`المتاح:\n${lines.join('\n')}\nاختر الوقت المناسب.`:`Available:\n${lines.join('\n')}\nChoose the time that works for you.`;
}
function bookingText(result,lang){
  const timezone=clean(result?.timezone,80);if(!timezone)throw Object.assign(new Error('BOOKING_TIMEZONE_UNVERIFIED'),{code:'BOOKING_TIMEZONE_UNVERIFIED'});
  const when=fmtWhen(result?.starts_at,timezone,lang),service=clean(result?.service_name,160),worker=clean(result?.worker_name,120);
  if(result?.confirmation_gate==='deposit'&&result?.status!=='confirmed'){
    const amount=Number(result?.deposit_required_amount||0),currency=clean(result?.deposit_currency_code||result?.currency_code,8);
    return lang==='ar'?`تم تسجيل موعدك ✅ ${service?`${service} — `:''}${when}${worker?` مع ${worker}`:''}. يحتاج عربون ${amount} ${currency} للتأكيد.`:`Your appointment is recorded ✅ ${service?`${service} — `:''}${when}${worker?` with ${worker}`:''}. A ${amount} ${currency} deposit is required to confirm it.`;
  }
  return lang==='ar'?`تم تأكيد حجزك ✅ ${service?`${service} — `:''}${when}${worker?` مع ${worker}`:''}.`:`Your booking is confirmed ✅ ${service?`${service} — `:''}${when}${worker?` with ${worker}`:''}.`;
}
function resultState(result){return result?.confirmation_gate==='deposit'&&result?.status!=='confirmed'?'deposit_pending':'confirmed'}
async function setState(context,action,payload={},ttl=900){return serviceRpc('dabbir_whatsapp_ai_set_state',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_pending_action:action,p_payload:payload,p_ttl_seconds:ttl})}
async function handoff(context,reason,summary,route='SUPPORT'){return serviceRpc('dabbir_whatsapp_ai_handoff',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_route_class:route,p_reason:clean(reason,500),p_summary:clean(summary,1200)})}
async function recentBookings(context){return serviceRpc('dabbir_whatsapp_ai_customer_recent_bookings',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_limit:5}).catch(()=>[])}

async function reserveReply(claim,context,body,purpose){
  const text=clean(body,4000),key=`wa-ai:${claim.batch_id}:attempt:${claim.attempt_count}:${clean(purpose,24)}`;
  const row=one(await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_idempotency_key:key,p_payload_hash:hash(text),p_body:text}));
  if(!row?.reservation_id)throw Object.assign(new Error('AI_OUTBOUND_RESERVATION_UNVERIFIED'),{code:'AI_OUTBOUND_RESERVATION_UNVERIFIED'});
  return row;
}
async function deliver(claim,context,body,purpose='reply'){
  const reservation=await reserveReply(claim,context,body,purpose);
  if(reservation.should_send!==true)return {deduplicated:true,state:clean(reservation.reservation_state,40),providerMessageId:clean(reservation.provider_message_id,320)||null};
  const key=serviceKey();if(!key)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const connection=await loadConversationConnectionWithServiceKey(key,context.business.id,context.conversation.id);
  if(!connection||connection.status!=='connected')throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'),{code:'WHATSAPP_TENANT_NOT_LINKED'});
  try{
    const sent=await sendMetaText({connection,businessId:context.business.id,recipient:reservation.recipient_handle,body});
    try{return {...await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId:sent.providerMessageId}),providerMessageId:sent.providerMessageId}}
    catch(error){await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','WHATSAPP_OUTBOUND_FINALIZE_UNCERTAIN');error.ambiguous=true;throw error}
  }catch(error){
    if(error?.ambiguous===true)await markOutboundResult(reservation.reservation_id,'AMBIGUOUS',clean(error?.code||error?.message,160));
    else await markOutboundResult(reservation.reservation_id,'FAILED',clean(error?.code||error?.message,160));
    throw error;
  }
}
async function finish(claim,outcome,error=null){return serviceRpc('dabbir_whatsapp_ai_finish_batch',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token,p_outcome:outcome,p_error:error})}
async function availability(context,{serviceId=null,workerId=null,requestedLocal=null}={}){return serviceRpc('dabbir_whatsapp_ai_check_availability',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_service_id:serviceId,p_worker_id:workerId,p_requested_local:requestedLocal})}
function resolveService(context,name){return exactNamed(context?.services,name,['name','name_ar','name_en'])}
function resolveWorker(context,name){return exactNamed(context?.workers,name,['display_name'])}
function pendingSlots(context){return arr(context?.pending_state?.payload?.slots).slice(0,3)}

async function executeSelectedSlot(claim,context,index,lang){
  const pending=context?.pending_state||{},payload=pending?.payload||{},slots=pendingSlots(context),slot=slots[index];
  if(pending?.pending_action!=='choose_slot'||!slot?.starts_at||!safeUuid(slot?.service_id))return null;
  if(payload.mode==='reschedule'&&safeUuid(payload.appointment_id)){
    const result=await serviceRpc('dabbir_whatsapp_ai_reschedule_booking',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_appointment_id:payload.appointment_id,p_new_starts_at:slot.starts_at,p_operation_key:`reschedule:${claim.batch_id}:${payload.appointment_id}:${index}`});
    await setState(context,'none',{});
    const text=lang==='ar'?`تم تعديل الموعد ✅ إلى ${fmtWhen(result.starts_at,slot.timezone,lang)}.`:`Appointment updated ✅ to ${fmtWhen(result.starts_at,slot.timezone,lang)}.`;
    await deliver(claim,context,text,'reschedule');return {action:'RESCHEDULE_BOOKING',result};
  }
  const result=await serviceRpc('dabbir_whatsapp_ai_create_booking',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_service_id:slot.service_id,p_worker_id:safeUuid(slot.worker_id),p_starts_at:slot.starts_at,p_operation_key:`booking:${claim.batch_id}:${index}:${hash(slot.starts_at).slice(0,18)}`,p_notes:'Booked by DABBIR AI from verified WhatsApp conversation.'});
  await setState(context,'none',{});
  await deliver(claim,context,bookingText({...result,timezone:slot.timezone},lang),'booking');
  return {action:'CREATE_BOOKING',result,state:resultState(result)};
}

async function processClaim(claim){
  const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  if(!context?.business?.id||!context?.conversation?.id)throw Object.assign(new Error('AI_CONTEXT_UNVERIFIED'),{code:'AI_CONTEXT_UNVERIFIED'});
  const text=latestText(context),lang=language(text);
  if(context?.conversation?.newer_customer_message_exists===true){await finish(claim,'CANCELLED','SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE');return {state:'CANCELLED',reason:'newer_message'}}
  if(context?.conversation?.state==='human_active'||context?.conversation?.state==='action_required'){await finish(claim,'HUMAN_REQUIRED','HUMAN_TAKEOVER_ACTIVE');return {state:'HUMAN_REQUIRED'}}
  if(HUMAN_REQUEST.test(text)){
    const h=await handoff(context,'Customer requested human assistance',text,'SUPPORT');
    const reply=lang==='ar'?'تمام، حوّلت المحادثة للفريق ليتابع معك شخص.':'Done — I handed the conversation to the team for a person to continue.';
    await deliver(claim,context,reply,'handoff').catch(()=>null);await finish(claim,'HUMAN_REQUIRED','CUSTOMER_REQUESTED_HUMAN');return {state:'HUMAN_REQUIRED',handoff:h};
  }

  const direct=choiceIndex(text);
  if(direct!==null&&pendingSlots(context)[direct]){
    try{const done=await executeSelectedSlot(claim,context,direct,lang);if(done){await finish(claim,'PROCESSED');return {state:'PROCESSED',...done}}}
    catch(error){if(String(error?.code||error?.message).includes('ACTION_SLOT_UNAVAILABLE')){await setState(context,'none',{});await deliver(claim,context,lang==='ar'?'هذا الوقت لم يعد متاحًا. أعطني الوقت الذي يناسبك وسأبحث من جديد.':'That slot is no longer available. Send me another time and I’ll check again.','slot-race');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'SLOT_RACE'}}throw error}
  }

  const recent=await recentBookings(context),decision=await decide(context,recent);
  if(decision.action==='HANDOFF'){
    const h=await handoff(context,'AI routed customer to human',text,decision.routeClass);await deliver(claim,context,decision.reply||(lang==='ar'?'حوّلت المحادثة للفريق ليتابع معك شخص.':'I handed this to the team for a person to continue.'),'handoff').catch(()=>null);await finish(claim,'HUMAN_REQUIRED','AI_HANDOFF');return {state:'HUMAN_REQUIRED',handoff:h};
  }
  if(decision.action==='CANCEL_BOOKING'){
    const upcoming=arr(context?.upcoming_appointments);let idx=decision.appointmentIndex;if(idx===null&&upcoming.length===1)idx=0;
    if(idx===null||!upcoming[idx]?.id){await deliver(claim,context,decision.reply||(lang==='ar'?'أي موعد تريد إلغاءه؟':'Which appointment would you like to cancel?'),'clarify-cancel');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'}}
    const result=await serviceRpc('dabbir_whatsapp_ai_cancel_booking',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_appointment_id:upcoming[idx].id,p_operation_key:`cancel:${claim.batch_id}:${upcoming[idx].id}`});
    await setState(context,'none',{});await deliver(claim,context,lang==='ar'?'تم إلغاء الموعد ✅.':'The appointment has been cancelled ✅.','cancel');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CANCEL_BOOKING',result};
  }
  if(decision.action==='RESCHEDULE_BOOKING'){
    const upcoming=arr(context?.upcoming_appointments);let idx=decision.appointmentIndex;if(idx===null&&upcoming.length===1)idx=0;
    if(idx===null||!upcoming[idx]?.id||!decision.requestedLocal){await deliver(claim,context,decision.reply||(lang==='ar'?'أي موعد تريد تعديله، وما الوقت الجديد؟':'Which appointment should I change, and what new time works for you?'),'clarify-reschedule');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'}}
    const current=upcoming[idx];const av=await availability(context,{serviceId:safeUuid(current.service_id),workerId:safeUuid(current.worker_id),requestedLocal:decision.requestedLocal});const slots=arr(av?.slots).slice(0,3);
    await setState(context,'choose_slot',{mode:'reschedule',appointment_id:current.id,slots},900);await deliver(claim,context,slotsText(slots,lang),'reschedule-slots');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY'};
  }
  if(decision.action==='CHECK_AVAILABILITY'){
    let service=resolveService(context,decision.serviceName),worker=resolveWorker(context,decision.workerName);
    if(decision.reuseLast&&arr(recent).length){const last=recent[0];service=arr(context.services).find(x=>x.id===last.service_id)||service;worker=arr(context.workers).find(x=>x.id===last.worker_id)||worker}
    const av=await availability(context,{serviceId:safeUuid(service?.id),workerId:safeUuid(worker?.id),requestedLocal:decision.requestedLocal});
    if(av?.state==='NEED_SERVICE'){const names=arr(av.services).map(x=>x.name).filter(Boolean).slice(0,8).join(lang==='ar'?'، ':', ');await deliver(claim,context,decision.reply||(lang==='ar'?`أي خدمة تريد؟${names?` المتاح: ${names}`:''}`:`Which service would you like?${names?` Available: ${names}`:''}`),'need-service');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'}}
    if(av?.state==='NEED_TIME'){await deliver(claim,context,decision.reply||(lang==='ar'?'ما اليوم والوقت الذي يناسبك؟':'What day and time works for you?'),'need-time');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'}}
    const slots=arr(av?.slots).slice(0,3);await setState(context,'choose_slot',{mode:'booking',slots},900);await deliver(claim,context,slotsText(slots,lang),'availability');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY',slots:slots.length};
  }
  if(decision.action==='CREATE_BOOKING'){
    const index=decision.slotIndex;if(index!==null&&pendingSlots(context)[index]){const done=await executeSelectedSlot(claim,context,index,lang);if(done){await finish(claim,'PROCESSED');return {state:'PROCESSED',...done}}}
    await deliver(claim,context,lang==='ar'?'اختر أحد الأوقات التي عرضتها لك لأثبت الحجز.':'Choose one of the times I offered and I’ll book it.','confirm-slot');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'};
  }
  await deliver(claim,context,decision.reply||(lang==='ar'?'كيف أقدر أساعدك؟':'How can I help?'),'reply');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'REPLY'};
}

async function requireHumanForFailure(claim,code,reason){
  try{const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});await handoff(context,reason,code,'SUPPORT')}catch{}
  await finish(claim,'HUMAN_REQUIRED',code).catch(()=>null);return {state:'HUMAN_REQUIRED',error:code};
}
async function handleFailure(claim,error){
  const code=clean(error?.code||error?.message||'AI_BATCH_FAILED',240);
  if(error?.ambiguous===true){return requireHumanForFailure(claim,`AMBIGUOUS_OUTBOUND:${code}`,'Ambiguous WhatsApp delivery requires human review')}
  if(Number(error?.providerStatus)===429){await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code}}
  if(error?.definitive===true||Number(error?.providerStatus)>=400&&Number(error?.providerStatus)<500){return requireHumanForFailure(claim,code,'WhatsApp delivery failed and needs human review')}
  if(PERMANENT_AI_FAILURES.has(code)){return requireHumanForFailure(claim,code,'Permanent AI or routing contract failure requires human review')}
  if(code==='AI_PLANNER_CONTRACT_INVALID'&&Number(claim?.attempt_count||0)>=2){return requireHumanForFailure(claim,code,'AI planner returned an invalid action contract repeatedly')}
  if(Number(claim?.attempt_count||0)>=5){return requireHumanForFailure(claim,code,'AI processing exhausted safe retry attempts')}
  await finish(claim,'RETRY',code).catch(()=>null);return {state:'RETRY',error:code};
}
export async function processClaimedWhatsAppAiBatch(claim){try{return await processClaim(claim)}catch(error){return handleFailure(claim,error)}}

export async function processWhatsAppAiDispatchToken(dispatchToken){
  let claim=await serviceRpc('dabbir_whatsapp_ai_claim_dispatch',{p_dispatch_token:dispatchToken});
  if(claim?.state==='WAIT'){
    const delay=Math.min(1500,Math.max(0,new Date(claim.ready_at).getTime()-Date.now()+30));if(delay>0)await sleep(delay);claim=await serviceRpc('dabbir_whatsapp_ai_claim_dispatch',{p_dispatch_token:dispatchToken});
  }
  if(claim?.state!=='CLAIMED')return {claimed:false,state:clean(claim?.state,40)||'NOOP'};
  return {claimed:true,...await processClaimedWhatsAppAiBatch(claim)};
}
export async function processWhatsAppAiRecovery({limit=10}={}){
  const results=[];for(let i=0;i<Math.max(1,Math.min(25,Number(limit)||10));i+=1){const claim=await serviceRpc('dabbir_whatsapp_ai_claim_next',{});if(claim?.state==='EMPTY')break;if(claim?.state!=='CLAIMED'){results.push({state:claim?.state||'NOOP'});continue}results.push(await processClaimedWhatsAppAiBatch(claim))}
  return {processed:results.length,results};
}