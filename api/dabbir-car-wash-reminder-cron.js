import { createHash } from 'node:crypto';
import { json } from './_auth-core.js';
import { loadBusinessConnectionWithServiceKey } from './_whatsapp-service-connection.js';
import { serviceRpc, finalizeOutboundReply, markOutboundResult, sendMetaTemplate } from './_whatsapp-live-core.js';
import { cronAuthMode } from './salon-reminders-cron.js';

const clean=(value,max=500)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const templateName=()=>clean(process.env.DABBIR_CAR_WASH_REMINDER_TEMPLATE,512);

function when(item){
  const locale=item.template_language==='en'?'en-AE':'ar-AE';
  try{return new Intl.DateTimeFormat(locale,{timeZone:item.timezone||'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(item.starts_at))}
  catch{return clean(item.starts_at,80)}
}
function copy(item){
  const language=item.template_language==='en'?'en':'ar';
  const service=clean(language==='en'?(item.offer_name_en||item.offer_name_ar):(item.offer_name_ar||item.offer_name_en),120)||'-';
  const worker=clean(item.worker_name,120)||'-';
  const date=when(item);
  const body=language==='en'
    ?`${clean(item.business_name,120)} reminder: ${service} with ${worker} at ${date}.`
    :`تذكير من ${clean(item.business_name,120)}: ${service} مع ${worker} في ${date}.`;
  return {language,service,worker,date,body,parameters:[clean(item.business_name,120),service,worker,date]};
}
async function finish(item,status,providerMessageId=null,error=null){
  return serviceRpc('dabbir_finish_car_wash_reminder',{p_job_id:item.job_id,p_lock_token:item.lock_token,p_status:status,p_provider_message_id:providerMessageId,p_error:error});
}
async function reserve(item,body){
  const key=`car-wash-reminder:${item.job_id}`;
  const result=await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{p_business_id:item.business_id,p_conversation_id:item.conversation_id,p_idempotency_key:key,p_payload_hash:hash(body),p_body:body});
  return Array.isArray(result)?result[0]:result;
}
async function processReminder(item){
  let reservation=null;
  try{
    const name=templateName();
    if(!name)throw Object.assign(new Error('CAR_WASH_REMINDER_TEMPLATE_NOT_CONFIGURED'),{definitive:true});
    const message=copy(item);
    reservation=await reserve(item,message.body);
    if(!reservation?.reservation_id)throw new Error('CAR_WASH_REMINDER_RESERVATION_UNVERIFIED');
    const state=clean(reservation.reservation_state,40).toUpperCase();
    let providerMessageId=clean(reservation.provider_message_id,320)||null;
    if(reservation.should_send===true){
      const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
      if(!key)throw new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED');
      const connection=await loadBusinessConnectionWithServiceKey(key,item.business_id);
      if(!connection||connection.status!=='connected')throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'),{definitive:true});
      const sent=await sendMetaTemplate({connection,businessId:item.business_id,recipient:reservation.recipient_handle,templateName:name,language:message.language,parameters:message.parameters});
      providerMessageId=sent.providerMessageId;
      try{await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId})}
      catch(error){error.ambiguous=true;await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','CAR_WASH_REMINDER_FINALIZE_UNCERTAIN');throw error}
    }else if(!['PROVIDER_ACCEPTED','SENT','DELIVERED','READ'].includes(state)||!providerMessageId){
      throw Object.assign(new Error(`CAR_WASH_REMINDER_${state||'UNVERIFIED'}`),{ambiguous:state==='SENDING'||state==='AMBIGUOUS',definitive:state==='FAILED'});
    }
    await serviceRpc('dabbir_car_wash_record_external_message',{p_business_id:item.business_id,p_job_id:item.job_id,p_purpose:'reminder',p_provider_message_id:providerMessageId,p_delivery_status:state||'accepted',p_operation_key:`car-wash-reminder:${item.job_id}`});
    await finish(item,'accepted',providerMessageId,null);
    return {job_id:item.job_id,status:'accepted',provider_message_id:providerMessageId};
  }catch(error){
    const code=clean(error?.code||error?.message||'CAR_WASH_REMINDER_FAILED',180);
    const retryable=Number(error?.providerStatus)===429&&error?.ambiguous!==true;
    const status=retryable?'retry':(error?.ambiguous===true?'ambiguous':'failed');
    if(reservation?.reservation_id)await markOutboundResult(reservation.reservation_id,status==='ambiguous'?'AMBIGUOUS':'FAILED',code);
    await finish(item,status,null,code).catch(()=>null);
    return {job_id:item.job_id,status,error:code};
  }
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);
  if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  try{
    const claimed=await serviceRpc('dabbir_claim_car_wash_reminders',{p_limit:25});
    const results=[];
    for(const item of Array.isArray(claimed)?claimed:[])results.push(await processReminder(item));
    const summary={ok:true,claimed:results.length,accepted:results.filter(x=>x.status==='accepted').length,retry:results.filter(x=>x.status==='retry').length,failed:results.filter(x=>x.status==='failed').length,ambiguous:results.filter(x=>x.status==='ambiguous').length,results};
    console.info('dabbir_car_wash_reminder_cron',{auth_mode:authMode,claimed:summary.claimed,accepted:summary.accepted,retry:summary.retry,failed:summary.failed,ambiguous:summary.ambiguous});
    return json(res,200,summary);
  }catch(error){
    const code=clean(error?.code||error?.message||'CAR_WASH_REMINDER_CRON_FAILED',180);
    console.error('dabbir_car_wash_reminder_cron_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}
