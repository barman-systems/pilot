import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const COEXISTENCE_FIELDS=new Set(['history','smb_app_state_sync','smb_message_echoes']);
const DIGITS=v=>String(v||'').replace(/\D/g,'').slice(0,20);
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max);
const boundedProgress=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Math.round(Number(v)))):null;

function isoFromMeta(value){
  if(value==null||value==='')return new Date().toISOString();
  const n=Number(value);
  const d=Number.isFinite(n)&&n>0?new Date(n*1000):new Date(value);
  return Number.isFinite(d.getTime())?d.toISOString():new Date().toISOString();
}

function mediaText(message={}){
  const direct=message.text?.body||message.button?.text||message.interactive?.button_reply?.title||message.interactive?.list_reply?.title;
  if(clean(direct))return clean(direct);
  if(clean(message.image?.caption))return clean(message.image.caption);
  if(clean(message.video?.caption))return clean(message.video.caption);
  if(clean(message.document?.caption))return clean(message.document.caption);
  if(clean(message.document?.filename))return `[WhatsApp document: ${clean(message.document.filename,180)}]`;
  if(message.location?.latitude!=null&&message.location?.longitude!=null)return `[WhatsApp location ${Number(message.location.latitude).toFixed(6)},${Number(message.location.longitude).toFixed(6)}]`;
  if(message.audio)return '[WhatsApp audio]';
  if(message.image)return '[WhatsApp image]';
  if(message.video)return '[WhatsApp video]';
  if(message.document)return '[WhatsApp document]';
  if(message.sticker)return '[WhatsApp sticker]';
  if(message.contacts)return '[WhatsApp contact]';
  return `[WhatsApp ${clean(message.type,40)||'message'}]`;
}

function mutationFromMessage(message={},phoneNumberId){
  const edit=message.edit||message.edited_message||null;
  const revoke=message.revoke||message.revoked_message||null;
  if(edit){
    const original=clean(edit.original_message_id||edit.message_id||message.context?.id,320);
    if(!original)return null;
    return {type:'coexistence_mutation',sourceField:'smb_message_echoes',phoneNumberId,messageId:clean(message.id,320)||null,originalMessageId:original,mutationType:'edit',text:mediaText(edit.message||edit),timestamp:message.timestamp||edit.timestamp||null};
  }
  if(revoke){
    const original=clean(revoke.original_message_id||revoke.message_id||message.context?.id,320);
    if(!original)return null;
    return {type:'coexistence_mutation',sourceField:'smb_message_echoes',phoneNumberId,messageId:clean(message.id,320)||null,originalMessageId:original,mutationType:'revoke',text:'',timestamp:message.timestamp||revoke.timestamp||null};
  }
  if(String(message.type||'').toLowerCase()==='edit'||String(message.type||'').toLowerCase()==='revoke'){
    const original=clean(message.original_message_id||message.context?.id,320);
    if(!original)return null;
    return {type:'coexistence_mutation',sourceField:'smb_message_echoes',phoneNumberId,messageId:clean(message.id,320)||null,originalMessageId:original,mutationType:String(message.type).toLowerCase(),text:String(message.type).toLowerCase()==='edit'?mediaText(message.message||message):'',timestamp:message.timestamp||null};
  }
  return null;
}

function normalizedDirection(message,threadId,businessDisplay){
  const from=DIGITS(message?.from),to=DIGITS(message?.to||message?.recipient_id),thread=DIGITS(threadId),business=DIGITS(businessDisplay);
  if(thread&&from===thread)return {direction:'inbound',customerHandle:thread};
  if(thread&&to===thread)return {direction:'outbound',customerHandle:thread};
  if(business&&from===business&&to)return {direction:'outbound',customerHandle:to};
  if(business&&to===business&&from)return {direction:'inbound',customerHandle:from};
  return {direction:null,customerHandle:thread||null};
}

function historyBlocks(value){
  if(Array.isArray(value?.history))return value.history;
  if(Array.isArray(value?.history?.messages))return [{metadata:{progress:100},threads:[{id:null,messages:value.history.messages}]}];
  if(Array.isArray(value?.messages))return [{metadata:{progress:100},threads:[{id:null,messages:value.messages}]}];
  return [];
}

function echoMessages(value){
  for(const candidate of [value?.message_echoes,value?.messages,value?.echoes])if(Array.isArray(candidate))return candidate;
  return [];
}

export function extractCoexistenceEvents(change={}){
  const field=String(change?.field||'');
  if(!COEXISTENCE_FIELDS.has(field))return [];
  const value=change?.value||{};
  const phoneNumberId=clean(value.metadata?.phone_number_id||value.phone_number_id,160)||null;
  const displayPhoneNumber=clean(value.metadata?.display_phone_number||value.display_phone_number,80)||null;
  const events=[];

  if(field==='history'){
    const blocks=historyBlocks(value);
    for(const block of blocks){
      const meta=block?.metadata||{};
      const phase=clean(meta.phase,40)||null;
      const chunkOrder=Number.isFinite(Number(meta.chunk_order))?Number(meta.chunk_order):null;
      const progress=boundedProgress(meta.progress);
      const errors=Array.isArray(block?.errors)?block.errors:[];
      for(const error of errors){
        events.push({type:'coexistence_sync',sourceField:'history',syncKind:'history_event',state:'error',phoneNumberId,displayPhoneNumber,progress,phase,chunkOrder,errorCode:clean(error?.code||error?.error_code||'HISTORY_SYNC_ERROR',120),timestamp:error?.timestamp||value.timestamp||null});
      }
      const threads=Array.isArray(block?.threads)?block.threads:[];
      if(!threads.length&&Array.isArray(block?.messages))threads.push({id:null,messages:block.messages});
      for(const thread of threads){
        const threadId=DIGITS(thread?.id||thread?.wa_id||thread?.phone_number);
        const contactName=clean(thread?.name||thread?.contact_name||thread?.contact?.full_name,120)||null;
        for(const message of Array.isArray(thread?.messages)?thread.messages:[]){
          const mutation=mutationFromMessage(message,phoneNumberId);
          if(mutation){events.push(mutation);continue;}
          const route=normalizedDirection(message,threadId,displayPhoneNumber);
          if(!route.direction||!route.customerHandle){
            events.push({type:'coexistence_sync',sourceField:'history',syncKind:'history_event',state:'syncing',phoneNumberId,displayPhoneNumber,progress,phase,chunkOrder,errorCode:'HISTORY_MESSAGE_DIRECTION_UNRESOLVED',timestamp:message?.timestamp||null});
            continue;
          }
          const id=clean(message?.id,320);
          if(!id)continue;
          events.push({type:'history_message',sourceField:'history',messageId:id,phoneNumberId,displayPhoneNumber,customerHandle:route.customerHandle,contactName,direction:route.direction,from:DIGITS(message?.from)||null,to:DIGITS(message?.to)||null,messageType:clean(message?.type,40)||null,text:mediaText(message),timestamp:message?.timestamp||null,historyPhase:phase,historyChunkOrder:chunkOrder,historyProgress:progress});
        }
      }
      events.push({type:'coexistence_sync',sourceField:'history',syncKind:'history_event',state:errors.length?'error':(progress!=null&&progress>=100?'synced':'syncing'),phoneNumberId,displayPhoneNumber,progress,phase,chunkOrder,errorCode:errors.length?clean(errors[0]?.code||errors[0]?.error_code||'HISTORY_SYNC_ERROR',120):null,timestamp:value.timestamp||null});
    }
    return events;
  }

  if(field==='smb_message_echoes'){
    for(const message of echoMessages(value)){
      const mutation=mutationFromMessage(message,phoneNumberId);
      if(mutation){events.push(mutation);continue;}
      const customerHandle=DIGITS(message?.to||message?.recipient_id);
      const id=clean(message?.id,320);
      if(!id||!customerHandle)continue;
      events.push({type:'app_message_echo',sourceField:'smb_message_echoes',messageId:id,phoneNumberId,displayPhoneNumber,customerHandle,contactName:null,direction:'outbound',from:DIGITS(message?.from)||null,to:customerHandle,messageType:clean(message?.type,40)||null,text:mediaText(message),timestamp:message?.timestamp||null});
    }
    return events;
  }

  const stateRows=Array.isArray(value?.state_sync)?value.state_sync:(value?.contact?[{type:'contact',contact:value.contact,action:value.action,metadata:value.metadata}]:[]);
  for(const row of stateRows){
    if(String(row?.type||'contact').toLowerCase()!=='contact')continue;
    const contact=row?.contact||{};
    const handle=DIGITS(contact.phone_number||contact.wa_id||contact.phone);
    if(!handle)continue;
    events.push({type:'coexistence_contact',sourceField:'smb_app_state_sync',syncKind:'contacts_event',phoneNumberId,displayPhoneNumber,customerHandle:handle,contactName:clean(contact.full_name||[contact.first_name,contact.last_name].filter(Boolean).join(' '),120)||null,action:String(row?.action||'add').toLowerCase()==='remove'?'remove':'add',timestamp:row?.metadata?.timestamp||row?.timestamp||value.timestamp||null});
  }
  events.push({type:'coexistence_sync',sourceField:'smb_app_state_sync',syncKind:'contacts_event',state:'synced',phoneNumberId,displayPhoneNumber,progress:100,errorCode:null,timestamp:value.timestamp||null});
  return events;
}

export async function persistCoexistenceEvent(event){
  if(!event?.phoneNumberId)return {applied:false,reason:'PHONE_NUMBER_ID_MISSING'};
  if(event.type==='history_message'||event.type==='app_message_echo'){
    const payload=await serviceRpc('dabbir_whatsapp_persist_coexistence_message',{
      p_phone_number_id:clean(event.phoneNumberId,160),p_provider_message_id:clean(event.messageId,320),p_customer_handle:DIGITS(event.customerHandle),p_display_name:clean(event.contactName,120)||null,p_body:clean(event.text,4000)||'[WhatsApp message]',p_direction:event.direction,p_source_field:event.sourceField,p_occurred_at:isoFromMeta(event.timestamp),
    });
    const row=Array.isArray(payload)?payload[0]:payload;
    return {applied:Boolean(row?.message_id),duplicate:row?.duplicate===true,conversationId:row?.conversation_id||null,messageId:row?.message_id||null};
  }
  if(event.type==='coexistence_contact'){
    const result=await serviceRpc('dabbir_whatsapp_apply_coexistence_contact_sync',{
      p_phone_number_id:clean(event.phoneNumberId,160),p_customer_handle:DIGITS(event.customerHandle),p_display_name:clean(event.contactName,120)||null,p_action:event.action,p_occurred_at:isoFromMeta(event.timestamp),
    });
    return {applied:result?.applied!==false,duplicate:false};
  }
  if(event.type==='coexistence_mutation'){
    const result=await serviceRpc('dabbir_whatsapp_apply_coexistence_mutation',{
      p_phone_number_id:clean(event.phoneNumberId,160),p_original_provider_message_id:clean(event.originalMessageId,320),p_mutation_provider_message_id:clean(event.messageId,320)||null,p_mutation_type:event.mutationType,p_new_body:event.mutationType==='edit'?clean(event.text,4000):null,p_occurred_at:isoFromMeta(event.timestamp),
    });
    return {applied:result?.applied===true||result?.queued===true,duplicate:false,queued:result?.queued===true};
  }
  if(event.type==='coexistence_sync'){
    const state=event.state==='error'?'error':(event.state==='synced'?'synced':'syncing');
    await serviceRpc('dabbir_whatsapp_mark_coexistence_sync',{
      p_phone_number_id:clean(event.phoneNumberId,160),p_kind:event.syncKind||'history_event',p_state:state,p_request_id:null,p_progress:event.progress==null?null:boundedProgress(event.progress),p_error:clean(event.errorCode,300)||null,p_next_retry_at:null,
    });
    return {applied:true,duplicate:false};
  }
  return {applied:false,reason:'UNSUPPORTED_COEXISTENCE_EVENT'};
}

function serviceKey(){return clean(process.env.SUPABASE_SERVICE_ROLE_KEY,4096);}
async function listSyncCandidates(limit){
  const key=serviceKey();
  if(!key||!SUPABASE_URL)throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'),{code:'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'});
  const select='id,business_id,status,phone_number_id,waba_id,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,coexistence_mode,coexistence_sync_state,coexistence_sync_attempts,coexistence_next_retry_at,coexistence_history_requested_at,coexistence_contacts_requested_at';
  const url=`${SUPABASE_URL}/rest/v1/dabbir_whatsapp_connections?select=${encodeURIComponent(select)}&status=eq.connected&coexistence_sync_state=in.(not_requested,retry,requesting)&order=updated_at.asc&limit=${Math.max(1,Math.min(20,Number(limit)||4))}`;
  const response=await fetch(url,{cache:'no-store',headers:supabaseKeyHeaders(key,{accept:'application/json'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('COEXISTENCE_CANDIDATE_READ_FAILED');
  const rows=await response.json();
  const now=Date.now();
  return (Array.isArray(rows)?rows:[]).filter(row=>!row.coexistence_next_retry_at||new Date(row.coexistence_next_retry_at).getTime()<=now);
}

async function metaRequest(platform,token,path,{method='GET',body=null,query=null}={}){
  const url=new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${String(path).replace(/^\//,'')}`);
  for(const [k,v] of Object.entries(query||{}))if(v!=null&&v!=='')url.searchParams.set(k,String(v));
  const headers={authorization:`Bearer ${token}`,accept:'application/json'};
  let serialized;
  if(body!=null){headers['content-type']='application/json';serialized=JSON.stringify(body);}
  const response=await fetch(url,{method,headers,body:serialized,cache:'no-store',signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error('META_COEXISTENCE_REQUEST_FAILED');error.providerStatus=response.status;error.providerCode=payload?.error?.code||null;error.detail=clean(payload?.error?.message,180);throw error;}
  return payload;
}

function coexistenceMode(phone={}){
  const platform=String(phone?.platform_type||'').toUpperCase();
  if(phone?.is_on_biz_app===true&&platform==='CLOUD_API')return 'coexistence';
  if(phone?.is_on_biz_app===false&&platform)return 'standard';
  return 'unknown';
}

async function mark(phoneNumberId,kind,state,{requestId=null,error=null,nextRetryAt=null}={}){
  return serviceRpc('dabbir_whatsapp_mark_coexistence_sync',{p_phone_number_id:phoneNumberId,p_kind:kind,p_state:state,p_request_id:requestId,p_progress:null,p_error:error,p_next_retry_at:nextRetryAt});
}

export async function processCoexistenceBootstrap({limit=4}={}){
  const rows=await listSyncCandidates(limit);
  const platform=embeddedPlatformConfig();
  if(!platform.appSecret||!platform.encryptionSecret)throw new Error('WHATSAPP_PLATFORM_SECRET_NOT_CONFIGURED');
  const results=[];
  for(const row of rows){
    const phone=clean(row.phone_number_id,160);
    if(!phone)continue;
    try{
      const token=openAccessToken(row,platform,row.business_id);
      const info=await metaRequest(platform,token,phone,{query:{fields:'id,is_on_biz_app,platform_type'}});
      const mode=coexistenceMode(info);
      if(mode==='standard'){
        await mark(phone,'mode','standard');
        results.push({phone_number_id:phone,state:'not_applicable'});
        continue;
      }
      if(mode!=='coexistence')throw new Error('COEXISTENCE_PHONE_MODE_UNVERIFIED');
      await mark(phone,'mode','coexistence');
      let contactsRequested=Boolean(row.coexistence_contacts_requested_at);
      let historyRequested=Boolean(row.coexistence_history_requested_at);
      if(!contactsRequested){
        const payload=await metaRequest(platform,token,`${encodeURIComponent(phone)}/smb_app_data`,{method:'POST',body:{messaging_product:'whatsapp',sync_type:'smb_app_state_sync'}});
        await mark(phone,'contacts_request','requested',{requestId:clean(payload?.request_id||payload?.id,320)||null});
        contactsRequested=true;
      }
      if(!historyRequested){
        const payload=await metaRequest(platform,token,`${encodeURIComponent(phone)}/smb_app_data`,{method:'POST',body:{messaging_product:'whatsapp',sync_type:'history'}});
        await mark(phone,'history_request','requested',{requestId:clean(payload?.request_id||payload?.id,320)||null});
        historyRequested=true;
      }
      results.push({phone_number_id:phone,state:contactsRequested&&historyRequested?'requested':'partial'});
    }catch(error){
      const attempts=Math.max(0,Number(row.coexistence_sync_attempts||0));
      const delayMinutes=Math.min(360,5*(2**Math.min(6,attempts)));
      const nextRetryAt=new Date(Date.now()+delayMinutes*60000).toISOString();
      const code=clean(error?.detail||error?.code||error?.message||'COEXISTENCE_SYNC_FAILED',300);
      await mark(phone,'error','retry',{error:code,nextRetryAt}).catch(()=>null);
      results.push({phone_number_id:phone,state:'retry',error:code});
    }
  }
  return {processed:results.length,requested:results.filter(x=>x.state==='requested').length,notApplicable:results.filter(x=>x.state==='not_applicable').length,retry:results.filter(x=>x.state==='retry').length,results};
}
