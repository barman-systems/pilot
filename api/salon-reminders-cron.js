import { json, supabaseRpc } from './_auth-core.js';
import { loadBusinessConnection } from './_whatsapp-embedded-core.js';
import { sendMetaTemplate } from './_whatsapp-live-core.js';

const clean=(value,max=500)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const serviceKey=()=>clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);

async function readRpc(response,fallback){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.code||fallback),{status:response.status});
  return payload;
}
async function rpc(key,name,params){return readRpc(await supabaseRpc(name,key,params),`${name.toUpperCase()}_FAILED`)}

function datePart(item){
  if(!item.starts_at)return item.template_language==='en'?'the agreed time':'الموعد المتفق عليه';
  const locale=item.template_language==='en'?'en-AE':'ar-AE';
  try{return new Intl.DateTimeFormat(locale,{timeZone:item.timezone||'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(item.starts_at))}
  catch{return new Date(item.starts_at).toISOString()}
}
function templateParameters(item){
  const service=item.template_language==='en'?(item.service_name_en||item.service_name_ar):(item.service_name_ar||item.service_name_en);
  return [
    clean(item.business_name||'DABBIR',120),
    clean(service||'-',120),
    clean(item.worker_name||'-',120),
    clean(datePart(item),160),
  ];
}
async function finalize(key,item,status,providerMessageId=null,error=null){
  return rpc(key,'dabbir_finalize_workflow_notification',{
    p_notification_id:item.notification_id,
    p_status:status,
    p_provider_message_id:providerMessageId,
    p_error:error,
  });
}
async function deliver(key,item){
  try{
    const connection=await loadBusinessConnection(key,item.business_id);
    if(!connection||connection.status!=='connected'){
      await finalize(key,item,'failed',null,'WHATSAPP_TENANT_NOT_LINKED');
      return {id:item.notification_id,status:'failed',error:'WHATSAPP_TENANT_NOT_LINKED'};
    }
    const sent=await sendMetaTemplate({
      connection,
      businessId:item.business_id,
      recipient:item.phone_e164,
      templateName:item.template_name,
      language:item.template_language,
      parameters:templateParameters(item),
    });
    await finalize(key,item,'sent',sent.providerMessageId,null);
    return {id:item.notification_id,status:'sent'};
  }catch(error){
    const code=clean(error?.message||'SALON_REMINDER_FAILED',160);
    const status=error?.ambiguous===true?'ambiguous':'failed';
    await finalize(key,item,status,null,code).catch(()=>null);
    return {id:item.notification_id,status,error:code};
  }
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const secret=clean(process.env.CRON_SECRET,4096);
  if(!secret||clean(req.headers?.authorization,8192)!==`Bearer ${secret}`)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  const key=serviceKey();
  if(!key)return json(res,503,{ok:false,error:'SUPABASE_SERVICE_ROLE_REQUIRED'});
  try{
    const claimed=await rpc(key,'dabbir_claim_workflow_notifications',{p_limit:25});
    const results=[];
    for(const item of Array.isArray(claimed)?claimed:[])results.push(await deliver(key,item));
    return json(res,200,{ok:true,claimed:results.length,sent:results.filter(x=>x.status==='sent').length,failed:results.filter(x=>x.status==='failed').length,ambiguous:results.filter(x=>x.status==='ambiguous').length,results});
  }catch(error){
    const code=clean(error?.message||'SALON_REMINDER_CRON_FAILED',160);
    console.error('dabbir_salon_reminder_cron_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}
