import { createHash, randomBytes } from 'node:crypto';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_ID=/^[0-9]{5,40}$/;
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const arr=v=>Array.isArray(v)?v:[];
const one=v=>Array.isArray(v)?v[0]??null:v??null;
const safeUuid=v=>UUID.test(clean(v,80))?clean(v,80):null;

// One terminal screen deliberately keeps phase-one scope to booking details only.
// No payment, invoice, bank, tax, payroll or accounting field is collected.
export const BOOKING_FLOW_JSON=JSON.stringify({
  version:'7.3',
  screens:[{
    id:'BOOKING',title:'الحجز / Booking',terminal:true,
    data:{
      services:{type:'array',items:{type:'object',properties:{id:{type:'string'},title:{type:'string'}}},__example__:[{id:'00000000-0000-4000-8000-000000000000',title:'Service'}]},
    },
    layout:{type:'SingleColumnLayout',children:[{
      type:'Form',name:'booking',children:[
        {type:'TextHeading',text:'أكمل طلب الحجز / Complete your booking request'},
        {type:'Dropdown',label:'الخدمة / Service',name:'service_id',required:true,'data-source':'${data.services}'},
        {type:'TextInput',label:'التاريخ المناسب / Preferred date',name:'preferred_date',required:true},
        {type:'TextInput',label:'الوقت المناسب / Preferred time',name:'preferred_time',required:true},
        {type:'Footer',label:'إرسال الطلب / Send request','on-click-action':{name:'complete',payload:{
          dabbir_kind:'booking_v1',service_id:'${form.service_id}',preferred_date:'${form.preferred_date}',preferred_time:'${form.preferred_time}'
        }}},
      ]
    }]}
  }]
});
export const BOOKING_FLOW_SCHEMA_HASH=hash(BOOKING_FLOW_JSON);
const FLOW_NAME=`dabbir_booking_v1_${BOOKING_FLOW_SCHEMA_HASH.slice(0,10)}`;

function serviceKey(){return clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192)}
async function serviceRows(path){
  const key=serviceKey();if(!key||!SUPABASE_URL)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{cache:'no-store',headers:supabaseKeyHeaders(key,{accept:'application/json'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(new Error('WHATSAPP_FLOW_DATA_READ_FAILED'),{code:'WHATSAPP_FLOW_DATA_READ_FAILED',providerStatus:response.status});
  const payload=await response.json().catch(()=>[]);return Array.isArray(payload)?payload:[];
}

function providerError(code,response,payload={}){
  const error=Object.assign(new Error(code),{
    code,providerStatus:Number(response?.status||0)||null,providerCode:payload?.error?.code||null,
    definitive:Number(response?.status)>=400&&Number(response?.status)<500,
    ambiguous:Number(response?.status)>=500,
  });
  return error;
}
async function metaJson(platform,token,path,{method='GET',body=null,form=null,query=null}={}){
  const url=new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${String(path).replace(/^\//,'')}`);
  for(const [k,v] of Object.entries(query||{}))if(v!=null&&v!=='')url.searchParams.set(k,String(v));
  const headers={authorization:`Bearer ${token}`,accept:'application/json'};let payloadBody;
  if(form){payloadBody=form;}
  else if(body!=null){headers['content-type']='application/json';payloadBody=JSON.stringify(body);}
  let response;
  try{response=await fetch(url,{method,headers,body:payloadBody,cache:'no-store',signal:AbortSignal.timeout(12000)});}
  catch(error){const e=Object.assign(new Error('META_WHATSAPP_FLOW_NETWORK_FAILED'),{code:'META_WHATSAPP_FLOW_NETWORK_FAILED',ambiguous:true});throw e;}
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw providerError('META_WHATSAPP_FLOW_REQUEST_FAILED',response,payload);
  return {payload,status:response.status};
}

async function listProvisionCandidates(limit){
  const max=Math.max(1,Math.min(10,Number(limit)||3));
  const select='id,business_id,branch_id,status,waba_id,phone_number_id,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,updated_at';
  const connections=await serviceRows(`dabbir_whatsapp_connections?select=${encodeURIComponent(select)}&status=eq.connected&branch_id=not.is.null&order=updated_at.asc&limit=${max}`);
  if(!connections.length)return [];
  const ids=connections.map(x=>x.id).filter(Boolean).join(',');
  const flows=ids?await serviceRows(`dabbir_whatsapp_flows?select=id,connection_id,meta_flow_id,status,schema_hash,next_retry_at,provision_attempts&connection_id=in.(${encodeURIComponent(ids)})&flow_kind=eq.booking&schema_hash=eq.${BOOKING_FLOW_SCHEMA_HASH}`):[];
  const byConnection=new Map(flows.map(f=>[String(f.connection_id),f]));const now=Date.now();
  return connections.map(connection=>({connection,flow:byConnection.get(String(connection.id))||null})).filter(({flow})=>{
    if(flow?.status==='published'||flow?.status==='validation_failed'||flow?.status==='retired')return false;
    if(flow?.next_retry_at&&new Date(flow.next_retry_at).getTime()>now)return false;
    return true;
  });
}
async function recordProvision(connectionId,{metaFlowId=null,status='error',validationErrors=[],providerStatus=null,error=null,nextRetryAt=null}={}){
  return serviceRpc('dabbir_whatsapp_upsert_flow_provision',{
    p_connection_id:connectionId,p_schema_hash:BOOKING_FLOW_SCHEMA_HASH,p_flow_name:FLOW_NAME,p_meta_flow_id:metaFlowId,
    p_status:status,p_validation_errors:arr(validationErrors).slice(0,20).map(item=>({error:clean(item?.error,80),error_type:clean(item?.error_type,80),message:clean(item?.message,240)})),
    p_provider_status:providerStatus,p_error:clean(error,300)||null,p_next_retry_at:nextRetryAt,
  });
}
function retryAt(attempts=0){return new Date(Date.now()+Math.min(24*60,Math.max(15,15*2**Math.min(6,Number(attempts)||0)))*60000).toISOString()}

async function createMetaFlow(platform,token,wabaId){
  if(!META_ID.test(String(wabaId||'')))throw Object.assign(new Error('WHATSAPP_FLOW_WABA_INVALID'),{code:'WHATSAPP_FLOW_WABA_INVALID'});
  const form=new FormData();form.append('name',FLOW_NAME);form.append('categories',JSON.stringify(['APPOINTMENT_BOOKING']));
  const result=await metaJson(platform,token,`${wabaId}/flows`,{method:'POST',form});
  const id=clean(result.payload?.id,40);if(!META_ID.test(id))throw Object.assign(new Error('META_WHATSAPP_FLOW_CREATE_UNVERIFIED'),{code:'META_WHATSAPP_FLOW_CREATE_UNVERIFIED',ambiguous:true});
  return {id,status:result.status};
}
async function uploadFlowJson(platform,token,metaFlowId){
  const form=new FormData();
  form.append('file',new Blob([BOOKING_FLOW_JSON],{type:'application/json'}),'flow.json');
  form.append('name','flow.json');form.append('asset_type','FLOW_JSON');
  const result=await metaJson(platform,token,`${metaFlowId}/assets`,{method:'POST',form});
  const errors=arr(result.payload?.validation_errors);
  return {ok:result.payload?.success===true&&errors.length===0,errors,status:result.status};
}
async function publishMetaFlow(platform,token,metaFlowId){
  const published=await metaJson(platform,token,`${metaFlowId}/publish`,{method:'POST'});
  if(published.payload?.success!==true)throw Object.assign(new Error('META_WHATSAPP_FLOW_PUBLISH_UNVERIFIED'),{code:'META_WHATSAPP_FLOW_PUBLISH_UNVERIFIED',ambiguous:true});
  const verified=await metaJson(platform,token,metaFlowId,{query:{fields:'id,name,status,validation_errors,json_version,health_status'}});
  if(String(verified.payload?.status||'').toUpperCase()!=='PUBLISHED'||arr(verified.payload?.validation_errors).length)throw Object.assign(new Error('META_WHATSAPP_FLOW_PUBLISH_STATUS_UNVERIFIED'),{code:'META_WHATSAPP_FLOW_PUBLISH_STATUS_UNVERIFIED',ambiguous:true});
  return {status:verified.status};
}

export async function processWhatsAppFlowProvisioning({limit=3}={}){
  const candidates=await listProvisionCandidates(limit);if(!candidates.length)return {processed:0,published:0,validation_failed:0,failed:0};
  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  if(!platform.appSecret||!platform.encryptionSecret)throw Object.assign(new Error('WHATSAPP_PLATFORM_SECRET_NOT_CONFIGURED'),{code:'WHATSAPP_PLATFORM_SECRET_NOT_CONFIGURED'});
  let published=0,validationFailed=0,failed=0;
  for(const {connection,flow} of candidates){
    let metaFlowId=clean(flow?.meta_flow_id,40)||null;
    try{
      const token=openAccessToken(connection,platform,connection.business_id);if(!token)throw new Error('WHATSAPP_FLOW_ACCESS_TOKEN_UNAVAILABLE');
      if(!metaFlowId){const created=await createMetaFlow(platform,token,connection.waba_id);metaFlowId=created.id;await recordProvision(connection.id,{metaFlowId,status:'draft',providerStatus:created.status});}
      const upload=await uploadFlowJson(platform,token,metaFlowId);
      if(!upload.ok){validationFailed+=1;await recordProvision(connection.id,{metaFlowId,status:'validation_failed',validationErrors:upload.errors,providerStatus:upload.status,error:'META_FLOW_JSON_VALIDATION_FAILED'});continue;}
      await recordProvision(connection.id,{metaFlowId,status:'validated',providerStatus:upload.status});
      const verified=await publishMetaFlow(platform,token,metaFlowId);await recordProvision(connection.id,{metaFlowId,status:'published',providerStatus:verified.status});published+=1;
    }catch(error){
      failed+=1;const attempts=Number(flow?.provision_attempts||0);await recordProvision(connection.id,{metaFlowId,status:'error',providerStatus:error?.providerStatus||null,error:clean(error?.code||error?.message||'WHATSAPP_FLOW_PROVISION_FAILED',300),nextRetryAt:retryAt(attempts)}).catch(()=>null);
      console.error('dabbir_whatsapp_flow_provision_failed',{error:clean(error?.code||error?.message,160),provider_status:error?.providerStatus||null,provider_code:error?.providerCode||null});
    }
  }
  return {processed:candidates.length,published,validation_failed:validationFailed,failed};
}

export async function getPublishedBookingFlow({businessId,connectionId}){
  if(!safeUuid(businessId)||!safeUuid(connectionId))return null;
  return serviceRpc('dabbir_whatsapp_get_published_booking_flow',{p_business_id:businessId,p_connection_id:connectionId,p_schema_hash:BOOKING_FLOW_SCHEMA_HASH});
}
function serviceOptions(services,lang){
  return arr(services).map(service=>({id:safeUuid(service?.id),title:clean(lang==='ar'?(service?.name_ar||service?.name||service?.name_en):(service?.name_en||service?.name||service?.name_ar),80)})).filter(x=>x.id&&x.title).slice(0,10);
}
export async function sendMetaBookingFlow({context,connection,recipient,lang='ar',flow=null}){
  const businessId=safeUuid(context?.business?.id),conversationId=safeUuid(context?.conversation?.id),connectionId=safeUuid(connection?.id);
  const localFlow=flow||await getPublishedBookingFlow({businessId,connectionId});
  if(!localFlow?.id||!META_ID.test(String(localFlow?.meta_flow_id||'')))throw Object.assign(new Error('WHATSAPP_BOOKING_FLOW_NOT_READY'),{code:'WHATSAPP_BOOKING_FLOW_NOT_READY',flowFallbackSafe:true,definitive:true});
  const services=serviceOptions(context?.services,lang);if(!services.length)throw Object.assign(new Error('WHATSAPP_BOOKING_FLOW_NO_SERVICES'),{code:'WHATSAPP_BOOKING_FLOW_NO_SERVICES',flowFallbackSafe:true,definitive:true});
  const tokenPlain=randomBytes(24).toString('base64url');const tokenHash=hash(tokenPlain);
  const session=one(await serviceRpc('dabbir_whatsapp_create_booking_flow_session',{
    p_business_id:businessId,p_conversation_id:conversationId,p_connection_id:connectionId,p_flow_id:localFlow.id,p_token_hash:tokenHash,p_ttl_seconds:1800,
  }));
  if(!session?.session_id||!session?.recipient_handle)throw Object.assign(new Error('WHATSAPP_BOOKING_FLOW_SESSION_UNVERIFIED'),{code:'WHATSAPP_BOOKING_FLOW_SESSION_UNVERIFIED'});
  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());const accessToken=openAccessToken(connection,platform,businessId);const phone=clean(connection?.phone_number_id,160);const to=clean(recipient||session.recipient_handle,160).replace(/[^0-9]/g,'');
  if(!accessToken||!phone||!to)throw Object.assign(new Error('WHATSAPP_BOOKING_FLOW_SEND_CONTEXT_INCOMPLETE'),{code:'WHATSAPP_BOOKING_FLOW_SEND_CONTEXT_INCOMPLETE'});
  const interactive={type:'flow',header:{type:'text',text:lang==='ar'?'طلب حجز':'Booking request'},body:{text:lang==='ar'?'اختر الخدمة والوقت، ثم نكمل التفاصيل المطلوبة هنا.':'Choose the service and time; we will collect any remaining details here.'},footer:{text:lang==='ar'?'يمكنك متابعة المحادثة هنا في أي وقت.':'You can continue this chat at any time.'},action:{name:'flow',parameters:{flow_message_version:'3',flow_action:'navigate',flow_token:tokenPlain,flow_id:String(localFlow.meta_flow_id),flow_cta:lang==='ar'?'إكمال الحجز':'Complete booking',flow_action_payload:{screen:'BOOKING',data:{services}}}}};
  let response;
  try{
    response=await fetch(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(phone)}/messages`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'interactive',interactive})});
  }catch{
    await serviceRpc('dabbir_whatsapp_mark_booking_flow_delivery',{p_session_id:session.session_id,p_state:'ambiguous',p_provider_message_id:null,p_error:'META_WHATSAPP_FLOW_SEND_NETWORK'}).catch(()=>null);
    throw Object.assign(new Error('META_WHATSAPP_FLOW_SEND_NETWORK'),{code:'META_WHATSAPP_FLOW_SEND_NETWORK',ambiguous:true});
  }
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    await serviceRpc('dabbir_whatsapp_mark_booking_flow_delivery',{p_session_id:session.session_id,p_state:response.status>=500?'ambiguous':'failed',p_provider_message_id:null,p_error:'META_WHATSAPP_FLOW_SEND_FAILED'}).catch(()=>null);
    const error=providerError('META_WHATSAPP_FLOW_SEND_FAILED',response,payload);if(error.definitive)error.flowFallbackSafe=true;throw error;
  }
  const providerMessageId=clean(payload?.messages?.[0]?.id,320);if(!providerMessageId){await serviceRpc('dabbir_whatsapp_mark_booking_flow_delivery',{p_session_id:session.session_id,p_state:'ambiguous',p_provider_message_id:null,p_error:'META_WHATSAPP_FLOW_SEND_WITHOUT_ID'}).catch(()=>null);throw Object.assign(new Error('META_WHATSAPP_FLOW_SEND_WITHOUT_ID'),{code:'META_WHATSAPP_FLOW_SEND_WITHOUT_ID',ambiguous:true});}
  await serviceRpc('dabbir_whatsapp_mark_booking_flow_delivery',{p_session_id:session.session_id,p_state:'sent',p_provider_message_id:providerMessageId,p_error:null});
  return {providerMessageId,providerStatus:response.status,sessionId:session.session_id};
}

export function parseBookingFlowReply(message={}){
  const nfm=message?.interactive?.type==='nfm_reply'?message.interactive.nfm_reply:null;if(!nfm)return null;
  const raw=String(nfm?.response_json||'');if(!raw||raw.length>12000)return {valid:false,reason:'FLOW_RESPONSE_MISSING'};
  let data;try{data=JSON.parse(raw)}catch{return {valid:false,reason:'FLOW_RESPONSE_INVALID_JSON'}}
  if(!data||typeof data!=='object'||Array.isArray(data))return {valid:false,reason:'FLOW_RESPONSE_INVALID_OBJECT'};
  const flowToken=clean(data.flow_token,240),serviceId=safeUuid(data.service_id),location=clean(data.location,500),preferredDate=clean(data.preferred_date,80),preferredTime=clean(data.preferred_time,80),kind=clean(data.dabbir_kind,40);
  if(kind!=='booking_v1'||flowToken.length<16||!serviceId||!preferredDate||!preferredTime)return {valid:false,reason:'FLOW_RESPONSE_REQUIRED_FIELD_MISSING'};
  return {valid:true,kind,flowToken,serviceId,location,preferredDate,preferredTime};
}
export async function persistBookingFlowReply(event){
  const reply=event?.flowReply;if(!reply?.valid)throw Object.assign(new Error('WHATSAPP_FLOW_REPLY_INVALID'),{code:'WHATSAPP_FLOW_REPLY_INVALID',status:400});
  const row=one(await serviceRpc('dabbir_whatsapp_consume_booking_flow_reply',{
    p_phone_number_id:clean(event.phoneNumberId,160),p_provider_message_id:clean(event.messageId,320),p_sender_handle:clean(event.from,160),p_token_hash:hash(reply.flowToken),p_service_id:reply.serviceId,
    p_location:reply.location,p_preferred_date:reply.preferredDate,p_preferred_time:reply.preferredTime,p_occurred_at:event.timestamp?new Date(Number(event.timestamp)*1000).toISOString():new Date().toISOString(),
  }));
  if(!row?.message_id||!row?.conversation_id)throw Object.assign(new Error('WHATSAPP_FLOW_REPLY_PERSISTENCE_UNVERIFIED'),{code:'WHATSAPP_FLOW_REPLY_PERSISTENCE_UNVERIFIED'});
  return {persisted:true,duplicate:row.duplicate===true,messageId:row.message_id,conversationId:row.conversation_id};
}