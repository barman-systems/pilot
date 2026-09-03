import crypto from 'node:crypto';
import {
  calendarError,
  decryptTokenPayload,
  encryptTokenPayload,
  providerConfig,
  serviceRest,
} from './_calendar-core.js';

const SYNC_PAST_DAYS=30;
const SYNC_FUTURE_DAYS=180;
const DEFAULT_DURATION_MS=60*60*1000;

function enc(value){return encodeURIComponent(String(value))}
function iso(value){const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString()}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function eventCancelled(provider,event){return provider==='google'?String(event?.status||'').toLowerCase()==='cancelled':Boolean(event?.isCancelled)}
function outlookIso(value){const raw=String(value||'').trim();if(!raw)return null;return /(?:z|[+\-]\d\d:\d\d)$/i.test(raw)?raw:`${raw}Z`}
function googleEventId(appointmentId){return `dabbir${crypto.createHash('sha256').update(String(appointmentId)).digest('hex').slice(0,40)}`}
function retryableProviderStatus(status){return status===408||status===425||status===429||status>=500}

async function providerJson(url,options={},fallback='CALENDAR_PROVIDER_REQUEST_FAILED'){
  let response;
  try{response=await fetch(url,{...options,cache:'no-store',signal:options.signal||AbortSignal.timeout(15000)})}
  catch(error){const out=calendarError(fallback,503);out.retryable=true;out.providerStatus=0;out.detail=String(error?.name||'NETWORK_FAILURE');throw out}
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok){
    const error=calendarError(fallback,[400,401,403,404,409,429,503].includes(response.status)?response.status:502);
    error.detail=data?.error?.message||data?.error_description||data?.message||null;
    error.providerStatus=response.status;
    error.retryable=retryableProviderStatus(response.status);
    throw error;
  }
  return data;
}

async function refreshAccessToken(req,connection,credential){
  const provider=connection.provider,config=providerConfig(provider,req);
  if(!config.configured)throw calendarError('CALENDAR_PROVIDER_NOT_CONFIGURED',503);
  const current=decryptTokenPayload(credential);
  const expiresAt=new Date(credential.token_expires_at||0).getTime();
  if(current?.access_token&&expiresAt>Date.now()+120000)return current.access_token;
  if(!current?.refresh_token)throw calendarError('CALENDAR_REFRESH_TOKEN_MISSING',409);
  const params=new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:current.refresh_token,grant_type:'refresh_token'});
  if(provider==='outlook')params.set('scope',config.scopes.join(' '));
  const refreshed=await providerJson(config.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:params.toString()},'CALENDAR_TOKEN_REFRESH_FAILED');
  if(!refreshed?.access_token)throw calendarError('CALENDAR_TOKEN_REFRESH_FAILED',502);
  const merged={...current,...refreshed,refresh_token:refreshed.refresh_token||current.refresh_token};
  const sealed=encryptTokenPayload(merged),nextExpiry=new Date(Date.now()+Math.max(60,Number(refreshed.expires_in||3600))*1000).toISOString();
  await serviceRest(`dabbir_calendar_credentials?connection_id=eq.${enc(connection.id)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({token_ciphertext:sealed.ciphertext,token_iv:sealed.iv,token_tag:sealed.tag,token_expires_at:nextExpiry,updated_at:new Date().toISOString()})});
  return merged.access_token;
}

async function listGoogleEvents(accessToken,start,end){
  let url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&showDeleted=true&maxResults=2500&timeMin=${enc(start)}&timeMax=${enc(end)}`;const out=[];
  for(let i=0;i<10&&url;i++){
    const body=await providerJson(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'}},'GOOGLE_CALENDAR_LIST_FAILED');
    out.push(...(body?.items||[]));
    url=body?.nextPageToken?`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&showDeleted=true&maxResults=2500&timeMin=${enc(start)}&timeMax=${enc(end)}&pageToken=${enc(body.nextPageToken)}`:null;
  }
  return out;
}

async function listOutlookEvents(accessToken,start,end){
  let url=`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${enc(start)}&endDateTime=${enc(end)}&$top=1000&$select=id,subject,start,end,isCancelled,lastModifiedDateTime,bodyPreview`;const out=[];
  for(let i=0;i<10&&url;i++){
    const body=await providerJson(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json',prefer:'outlook.timezone="UTC"'}},'OUTLOOK_CALENDAR_LIST_FAILED');
    out.push(...(body?.value||[]));url=body?.['@odata.nextLink']||null;
  }
  return out;
}

async function listProviderEvents(provider,accessToken,start,end){return provider==='google'?listGoogleEvents(accessToken,start,end):listOutlookEvents(accessToken,start,end)}

function eventTimes(provider,event){
  if(provider==='google'){
    const start=iso(event?.start?.dateTime||event?.start?.date),end=iso(event?.end?.dateTime||event?.end?.date);
    return {start,end};
  }
  return {start:iso(outlookIso(event?.start?.dateTime)),end:iso(outlookIso(event?.end?.dateTime))};
}

function providerEventPayload(provider,appointment,title){
  const start=iso(appointment.starts_at),end=iso(appointment.ends_at||new Date(new Date(start).getTime()+DEFAULT_DURATION_MS));
  if(provider==='google')return {summary:title,description:`DABBIR appointment ${appointment.id}`,start:{dateTime:start},end:{dateTime:end},extendedProperties:{private:{dabbir_appointment_id:appointment.id}}};
  const graphStart=start.replace(/Z$/,''),graphEnd=end.replace(/Z$/,'');
  return {subject:title,body:{contentType:'text',content:`DABBIR_APPOINTMENT_ID:${appointment.id}`},start:{dateTime:graphStart,timeZone:'UTC'},end:{dateTime:graphEnd,timeZone:'UTC'},transactionId:appointment.id.replace(/-/g,'').slice(0,32)};
}

async function getGoogleEvent(accessToken,eventId){
  return providerJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(eventId)}`,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'}},'GOOGLE_CALENDAR_GET_FAILED');
}

async function createProviderEvent(provider,accessToken,payload,appointmentId){
  const url=provider==='google'?'https://www.googleapis.com/calendar/v3/calendars/primary/events':'https://graph.microsoft.com/v1.0/me/events';
  const body=provider==='google'?{id:googleEventId(appointmentId),...payload}:payload;
  try{
    return await providerJson(url,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)},provider==='google'?'GOOGLE_CALENDAR_CREATE_FAILED':'OUTLOOK_CALENDAR_CREATE_FAILED');
  }catch(error){
    // A timed-out/duplicated Google create is reconciled by deterministic event id.
    if(provider==='google'&&Number(error?.providerStatus||error?.code)===409)return getGoogleEvent(accessToken,googleEventId(appointmentId));
    throw error;
  }
}

async function updateProviderEvent(provider,accessToken,eventId,payload){
  const url=provider==='google'?`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(eventId)}`:`https://graph.microsoft.com/v1.0/me/events/${enc(eventId)}`;
  return providerJson(url,{method:'PATCH',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)},provider==='google'?'GOOGLE_CALENDAR_UPDATE_FAILED':'OUTLOOK_CALENDAR_UPDATE_FAILED');
}

async function deleteProviderEvent(provider,accessToken,eventId){
  const url=provider==='google'?`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(eventId)}`:`https://graph.microsoft.com/v1.0/me/events/${enc(eventId)}`;
  let response;
  try{response=await fetch(url,{method:'DELETE',headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)})}
  catch(error){const out=calendarError(provider==='google'?'GOOGLE_CALENDAR_DELETE_FAILED':'OUTLOOK_CALENDAR_DELETE_FAILED',503);out.retryable=true;out.detail=String(error?.name||'NETWORK_FAILURE');throw out}
  if(response.ok||response.status===404||response.status===410)return true;
  const text=await response.text().catch(()=>null);const error=calendarError(provider==='google'?'GOOGLE_CALENDAR_DELETE_FAILED':'OUTLOOK_CALENDAR_DELETE_FAILED',[400,401,403,409,429,503].includes(response.status)?response.status:502);error.detail=String(text||'').slice(0,240);error.providerStatus=response.status;error.retryable=retryableProviderStatus(response.status);throw error;
}

async function upsertLink(connectionId,appointmentId,event,syncHash){
  const times=eventTimes(String(event.__provider||''),event);
  await serviceRest('dabbir_calendar_event_links?on_conflict=connection_id,appointment_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({connection_id:connectionId,appointment_id:appointmentId,provider_event_id:String(event.id),provider_etag:event.etag||event['@odata.etag']||null,sync_hash:syncHash,last_provider_start:times.start||null,last_synced_at:new Date().toISOString()})});
}

export async function syncCalendarConnection(req,connection){
  const provider=connection.provider,businessId=connection.business_id;
  const credentialRows=await serviceRest(`dabbir_calendar_credentials?select=connection_id,token_ciphertext,token_iv,token_tag,token_expires_at&connection_id=eq.${enc(connection.id)}&limit=1`);
  const credential=credentialRows?.[0];if(!credential)throw calendarError('CALENDAR_CREDENTIALS_NOT_FOUND',409);
  const accessToken=await refreshAccessToken(req,connection,credential);
  const now=Date.now(),start=new Date(now-SYNC_PAST_DAYS*86400000).toISOString(),end=new Date(now+SYNC_FUTURE_DAYS*86400000).toISOString();
  const [appointments,customers,links,events]=await Promise.all([
    serviceRest(`dabbir_appointments?select=id,customer_id,starts_at,ends_at,status&business_id=eq.${enc(businessId)}&starts_at=gte.${enc(start)}&starts_at=lt.${enc(end)}&order=starts_at.asc&limit=1000`),
    serviceRest(`dabbir_customers?select=id,display_name&business_id=eq.${enc(businessId)}&limit=1000`),
    serviceRest(`dabbir_calendar_event_links?select=connection_id,appointment_id,provider_event_id,provider_etag,sync_hash,last_provider_start,last_synced_at&connection_id=eq.${enc(connection.id)}&limit=2000`),
    listProviderEvents(provider,accessToken,start,end),
  ]);
  const appts=Array.isArray(appointments)?appointments:[],customerMap=new Map((customers||[]).map(c=>[c.id,c.display_name||'Customer']));
  const linkMap=new Map((links||[]).map(l=>[l.appointment_id,l])),eventMap=new Map((events||[]).map(e=>[String(e.id),e]));
  const apptMap=new Map(appts.map(a=>[a.id,a]));let imported=0,pushed=0,providerUpdates=0,cancelled=0;

  for(const link of links||[]){
    const appointment=apptMap.get(link.appointment_id),event=eventMap.get(String(link.provider_event_id));if(!appointment||!event)continue;
    if(eventCancelled(provider,event)){
      if(appointment.status!=='cancelled'){
        await serviceRest(`dabbir_appointments?id=eq.${enc(appointment.id)}&business_id=eq.${enc(businessId)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({status:'cancelled'})});
        appointment.status='cancelled';cancelled++;
      }
      continue;
    }
    const times=eventTimes(provider,event);if(!times.start)continue;
    const externalMs=new Date(times.start).getTime(),internalMs=new Date(appointment.starts_at).getTime();
    if(Math.abs(externalMs-internalMs)>60000&& !['cancelled','completed'].includes(appointment.status)){
      await serviceRest(`dabbir_appointments?id=eq.${enc(appointment.id)}&business_id=eq.${enc(businessId)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({starts_at:times.start,status:'rescheduled'})});
      appointment.starts_at=times.start;appointment.status='rescheduled';providerUpdates++;
    }
  }

  for(const appointment of appts){
    let link=linkMap.get(appointment.id),event=link?eventMap.get(String(link.provider_event_id)):null;
    if(appointment.status==='cancelled'){
      if(link&&event&&!eventCancelled(provider,event))await deleteProviderEvent(provider,accessToken,link.provider_event_id).catch(error=>{if(error?.code!==404)throw error});
      continue;
    }
    const title=String(customerMap.get(appointment.customer_id)||'Customer').slice(0,160),payload=providerEventPayload(provider,appointment,title),syncHash=hash({start:appointment.starts_at,end:appointment.ends_at,status:appointment.status,title});
    if(!link||!event){
      event=await createProviderEvent(provider,accessToken,payload,appointment.id);event.__provider=provider;
      await upsertLink(connection.id,appointment.id,event,syncHash);link={connection_id:connection.id,appointment_id:appointment.id,provider_event_id:event.id,sync_hash:syncHash};linkMap.set(appointment.id,link);eventMap.set(String(event.id),event);pushed++;continue;
    }
    if(link.sync_hash!==syncHash){
      event=await updateProviderEvent(provider,accessToken,link.provider_event_id,payload);event.__provider=provider;
      await upsertLink(connection.id,appointment.id,event,syncHash);link.sync_hash=syncHash;eventMap.set(String(event.id),event);pushed++;
    }
  }

  const mappedProviderIds=new Set([...linkMap.values()].map(l=>String(l.provider_event_id)));
  await serviceRest(`dabbir_calendar_busy_blocks?connection_id=eq.${enc(connection.id)}&starts_at=gte.${enc(start)}&starts_at=lt.${enc(end)}`,{method:'DELETE',headers:{prefer:'return=minimal'}});
  for(const event of events||[]){
    if(mappedProviderIds.has(String(event.id))||eventCancelled(provider,event))continue;
    const times=eventTimes(provider,event);if(!times.start||!times.end||new Date(times.end)<=new Date(times.start))continue;
    const summary=String(provider==='google'?event.summary||'Busy':event.subject||'Busy').slice(0,240);
    await serviceRest('dabbir_calendar_busy_blocks?on_conflict=connection_id,provider_event_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({business_id:businessId,connection_id:connection.id,provider_event_id:String(event.id),starts_at:times.start,ends_at:times.end,summary,provider_updated_at:iso(event.updated||event.lastModifiedDateTime),updated_at:new Date().toISOString()})});
    imported++;
  }

  const syncedAt=new Date().toISOString();
  await serviceRest(`dabbir_calendar_connections?id=eq.${enc(connection.id)}&business_id=eq.${enc(businessId)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({status:'active',last_sync_at:syncedAt,last_error:null,updated_at:syncedAt})});
  return {connection_id:connection.id,provider,pushed,provider_updates:providerUpdates,cancelled,imported_busy:imported,last_sync_at:syncedAt};
}

export async function syncBusinessCalendars(req,businessId){
  const rows=await serviceRest(`dabbir_calendar_connections?select=id,business_id,provider,status,sync_enabled,sync_direction,provider_email&business_id=eq.${enc(businessId)}&status=in.(active,error)&sync_enabled=eq.true&order=provider.asc`);
  const results=[];
  for(const connection of rows||[]){
    try{results.push({ok:true,...await syncCalendarConnection(req,connection)})}
    catch(error){
      const message=String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160);
      const code=Number(error?.providerStatus||error?.code||500);
      const retryable=error?.retryable===true||retryableProviderStatus(code);
      await serviceRest(`dabbir_calendar_connections?id=eq.${enc(connection.id)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({status:'error',last_error:message,updated_at:new Date().toISOString()})}).catch(()=>null);
      results.push({ok:false,connection_id:connection.id,provider:connection.provider,error:message,code,retryable});
    }
  }
  return results;
}
