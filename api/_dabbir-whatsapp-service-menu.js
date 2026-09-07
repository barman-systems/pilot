import { createHash } from 'node:crypto';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import {
  finalizeOutboundReply,
  markOutboundResult,
  sendMetaText,
  serviceRpc,
} from './_whatsapp-live-core.js';
import { loadConversationConnectionWithServiceKey } from './_whatsapp-service-connection.js';
import { processClaimedWhatsAppAiBatch } from './_dabbir-whatsapp-ai-core.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARABIC=/[\u0600-\u06ff]/;
const MENU_REQUEST=/(?:الخدمات|خدماتكم|شو\s+(?:عندكم|تقدمون)|وش\s+(?:عندكم|تقدمون)|ايش\s+(?:عندكم|تقدمون)|ماذا\s+تقدمون|قائمة\s+الخدمات|services|service menu|what do you offer)/i;
const PRICE_REQUEST=/(?:بكم|كم\s+(?:السعر|سعرها|سعره)|السعر|price|how much)/i;
const PERMANENT_SERVICE_FAILURES=new Set(['AI_PENDING_ACTION_INVALID','AI_CONVERSATION_NOT_FOUND','WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH','WHATSAPP_TENANT_NOT_LINKED','WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED','WHATSAPP_MENU_CONTEXT_INCOMPLETE']);
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const one=v=>Array.isArray(v)?v[0]??null:v??null;
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const safeUuid=v=>UUID.test(clean(v,80))?clean(v,80):null;
const langOf=text=>ARABIC.test(String(text||''))?'ar':'en';
const norm=value=>clean(value,220).toLocaleLowerCase().normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const serviceName=s=>clean(s?.name_ar||s?.name||s?.name_en,180);
const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{maximumFractionDigits:2}):null;

function latestText(context){
  return arr(context?.batch_messages).map(x=>clean(x?.body,1500)).filter(Boolean).join('\n').slice(0,2500);
}
function serviceBySelection(context,text){
  const wanted=norm(text);if(!wanted)return null;
  const services=arr(context?.services);
  const exact=services.find(s=>norm(serviceName(s))===wanted);if(exact)return exact;
  const prefix=services.filter(s=>norm(serviceName(s)).slice(0,24)===wanted.slice(0,24));
  if(prefix.length===1)return prefix[0];
  const mentioned=services.filter(s=>{const n=norm(serviceName(s));return n&&wanted.includes(n)});
  return mentioned.length===1?mentioned[0]:null;
}
function serviceDetails(service,context,lang){
  const name=serviceName(service);
  const duration=Number(service?.duration_minutes||0);
  const price=money(service?.price);
  const currency=clean(context?.business?.currency_code,12)||'AED';
  if(lang==='ar'){
    const parts=[name];
    if(duration>0)parts.push(`المدة: ${duration} دقيقة`);
    if(price!==null)parts.push(`السعر: ${price} ${currency}`);
    return `${parts.join('\n')}\n\nمتى يناسبك الموعد؟`;
  }
  const parts=[name];
  if(duration>0)parts.push(`Duration: ${duration} minutes`);
  if(price!==null)parts.push(`Price: ${price} ${currency}`);
  return `${parts.join('\n')}\n\nWhat time works for you?`;
}
function localParts(timezone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return {year:Number(get('year')),month:Number(get('month')),day:Number(get('day')),hour:Number(get('hour')),minute:Number(get('minute'))};
}
function parseRequestedLocal(text,timezone){
  const source=String(text||'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const today=/(?:اليوم|today)/i.test(source),tomorrow=/(?:باجر|بكره|بكرة|غدا|غداً|tomorrow)/i.test(source);
  const m=source.match(/(?:الساع(?:ة|ه)?\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*(ص|م|am|pm)?/i);
  if(!m||(!today&&!tomorrow))return null;
  let hour=Number(m[1]),minute=Number(m[2]||0);const marker=String(m[3]||'').toLowerCase();
  if((marker==='م'||marker==='pm')&&hour<12)hour+=12;if((marker==='ص'||marker==='am')&&hour===12)hour=0;
  const p=localParts(timezone);const d=new Date(Date.UTC(p.year,p.month-1,p.day+(tomorrow?1:0),12,0,0));
  const y=d.getUTCFullYear(),mo=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0');
  if(today&&!marker&&(hour<p.hour||(hour===p.hour&&minute<=p.minute)))return null;
  return `${y}-${mo}-${da}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
}
function slotText(slots,lang,timezone){
  const locale=lang==='ar'?'ar-AE':'en-AE';
  const lines=arr(slots).slice(0,3).map((s,i)=>{
    let when=clean(s?.local_start||s?.starts_at,80);
    try{when=new Intl.DateTimeFormat(locale,{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(s.starts_at));}catch{}
    return `${i+1}) ${when}`;
  });
  if(!lines.length)return lang==='ar'?'لا يوجد موعد متاح قريب من الوقت المطلوب. ارسل وقتًا آخر.':'No nearby time is available. Send another time.';
  return lang==='ar'?`الأوقات المتاحة:\n${lines.join('\n')}\nاختر رقم الموعد.`:`Available times:\n${lines.join('\n')}\nReply with the slot number.`;
}

async function reserve(claim,context,body,purpose){
  return one(await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{
    p_business_id:context.business.id,
    p_conversation_id:context.conversation.id,
    p_idempotency_key:`wa-menu:${claim.batch_id}:${claim.attempt_count}:${purpose}`,
    p_payload_hash:hash(body),
    p_body:clean(body,4000),
  }));
}
function key(){return clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192)}
async function connectionFor(context){
  const k=key();if(!k)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const c=await loadConversationConnectionWithServiceKey(k,context.business.id,context.conversation.id);
  if(!c||c.status!=='connected')throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'),{code:'WHATSAPP_TENANT_NOT_LINKED'});
  return c;
}
async function finalizeReservation(reservation,providerMessageId){
  try{return await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId});}
  catch(error){await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','WHATSAPP_MENU_FINALIZE_UNCERTAIN');error.ambiguous=true;throw error;}
}
async function sendReservedText(claim,context,body,purpose){
  const reservation=await reserve(claim,context,body,purpose);if(!reservation?.reservation_id)throw new Error('WHATSAPP_MENU_RESERVATION_UNVERIFIED');
  if(reservation.should_send!==true)return {deduplicated:true};
  const connection=await connectionFor(context);
  try{const sent=await sendMetaText({connection,businessId:context.business.id,recipient:reservation.recipient_handle,body});return finalizeReservation(reservation,sent.providerMessageId);}
  catch(error){await markOutboundResult(reservation.reservation_id,error?.ambiguous?'AMBIGUOUS':'FAILED',clean(error?.code||error?.message,160));throw error;}
}
async function sendServiceMenu(claim,context,lang){
  const services=arr(context?.services).filter(s=>safeUuid(s?.id)&&serviceName(s)).slice(0,10);
  if(!services.length)return sendReservedText(claim,context,lang==='ar'?'لا توجد خدمات مفعلة حاليًا.':'There are no active services right now.','service-empty');
  const body=lang==='ar'?'اختر الخدمة التي تريدها من القائمة.':'Choose a service from the list.';
  const reservation=await reserve(claim,context,body,'service-list');if(!reservation?.reservation_id)throw new Error('WHATSAPP_MENU_RESERVATION_UNVERIFIED');
  if(reservation.should_send!==true)return {deduplicated:true};
  const connection=await connectionFor(context);
  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  const token=openAccessToken(connection,platform,context.business.id);
  const phoneNumberId=clean(connection?.phone_number_id,160);
  if(!token||!phoneNumberId)throw Object.assign(new Error('WHATSAPP_MENU_CONTEXT_INCOMPLETE'),{code:'WHATSAPP_MENU_CONTEXT_INCOMPLETE'});
  const rows=services.map(s=>({id:`service:${s.id}`,title:serviceName(s).slice(0,24),description:lang==='ar'?'اضغط لعرض المدة والسعر':'Tap for duration and price'}));
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,{
      method:'POST',cache:'no-store',signal:controller.signal,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:clean(reservation.recipient_handle,160),type:'interactive',interactive:{type:'list',body:{text:body},action:{button:lang==='ar'?'عرض الخدمات':'View services',sections:[{title:lang==='ar'?'الخدمات':'Services',rows}]}}}),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=Object.assign(new Error('META_WHATSAPP_SERVICE_MENU_FAILED'),{providerStatus:response.status,providerCode:payload?.error?.code||null,ambiguous:response.status>=500,definitive:response.status>=400&&response.status<500});throw error;}
    const providerMessageId=clean(payload?.messages?.[0]?.id,320);if(!providerMessageId)throw Object.assign(new Error('META_WHATSAPP_SERVICE_MENU_WITHOUT_ID'),{ambiguous:true});
    return finalizeReservation(reservation,providerMessageId);
  }catch(error){await markOutboundResult(reservation.reservation_id,error?.ambiguous?'AMBIGUOUS':'FAILED',clean(error?.code||error?.message,160));throw error;}
  finally{clearTimeout(timeout);}
}
async function setState(context,action,payload={},ttl=900){return serviceRpc('dabbir_whatsapp_ai_set_state',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_pending_action:action,p_payload:payload,p_ttl_seconds:ttl});}
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
  const context=await serviceRpc('dabbir_whatsapp_ai_context',{p_batch_id:claim.batch_id,p_lock_token:claim.lock_token});
  if(!context?.business?.id||!context?.conversation?.id)return null;
  const text=latestText(context),lang=langOf(text),services=arr(context?.services);
  if(MENU_REQUEST.test(text)){
    await sendServiceMenu(claim,context,lang);await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'SERVICE_MENU'};
  }
  const selected=serviceBySelection(context,text);
  if(selected){
    await setState(context,'service_selected',{service_id:selected.id,service_name:serviceName(selected),duration_minutes:selected.duration_minutes,price:selected.price},900);
    await sendReservedText(claim,context,serviceDetails(selected,context,lang),'service-details');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'SERVICE_DETAILS'};
  }
  const pending=context?.pending_state;
  if(pending?.pending_action==='service_selected'&&safeUuid(pending?.payload?.service_id)){
    const selectedService=services.find(s=>s.id===pending.payload.service_id)||pending.payload;
    if(PRICE_REQUEST.test(text)){
      await sendReservedText(claim,context,serviceDetails(selectedService,context,lang),'service-price');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'SERVICE_DETAILS'};
    }
    const timezone=clean(context?.business?.timezone,80)||'Asia/Dubai';const requested=parseRequestedLocal(text,timezone);
    if(requested){
      const av=await serviceRpc('dabbir_whatsapp_ai_check_availability',{p_business_id:context.business.id,p_conversation_id:context.conversation.id,p_service_id:pending.payload.service_id,p_worker_id:null,p_requested_local:requested});
      const slots=arr(av?.slots).slice(0,3);
      await setState(context,'choose_slot',{mode:'booking',slots},900);
      await sendReservedText(claim,context,slotText(slots,lang,timezone),'service-slots');await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'CHECK_AVAILABILITY',slots:slots.length};
    }
  }
  return null;
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