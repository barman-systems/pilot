import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
} from './_auth-core.js';
import { applySupabaseKeyHeaders } from './_supabase-key-auth.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_HOST_RE=/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i;
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');

export function calendarError(message,code=500){return Object.assign(new Error(message),{code})}
export function safeBusinessId(value){const id=String(value||'').trim();return UUID_RE.test(id)?id:null}
export function safeProvider(value){const provider=String(value||'').trim().toLowerCase();return ['google','outlook'].includes(provider)?provider:null}

export function requestOrigin(req){
  const rawHost=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(!SAFE_HOST_RE.test(rawHost))throw calendarError('INVALID_REQUEST_HOST',400);
  const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const local=rawHost==='localhost'||rawHost.startsWith('localhost:')||rawHost==='127.0.0.1'||rawHost.startsWith('127.0.0.1:');
  return `${local&&forwardedProto==='http'?'http':'https'}://${rawHost}`;
}

function serviceRoleKey(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key.startsWith('sb_publishable_'))throw calendarError('CALENDAR_STORAGE_NOT_CONFIGURED',503);
  return key;
}

async function parseJson(response,fallback='CALENDAR_REQUEST_FAILED'){
  const text=await response.text();let data=null;
  try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok){
    const error=calendarError(fallback,[400,401,403,404,409,429,503].includes(response.status)?response.status:502);
    error.detail=data?.message||data?.error||data?.code||null;
    throw error;
  }
  return data;
}

export async function serviceRest(path,options={}){
  const key=serviceRoleKey();
  const headers=new Headers(options.headers||{});
  applySupabaseKeyHeaders(headers,key);headers.set('accept','application/json');
  if(options.body!==undefined)headers.set('content-type','application/json');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers,cache:'no-store',signal:options.signal||AbortSignal.timeout(15000)});
  return parseJson(response,'CALENDAR_STORAGE_FAILED');
}

export async function requireCalendarMember(req,businessIdValue,{manage=false}={}){
  const businessId=safeBusinessId(businessIdValue);if(!businessId)throw calendarError('BUSINESS_ID_REQUIRED',400);
  const accessToken=accessTokenFromRequest(req);if(!accessToken)throw calendarError('AUTH_REQUIRED',401);
  const [user,memberships]=await Promise.all([getVerifiedUser(accessToken),getBusinessMemberships(accessToken)]);
  if(!user)throw calendarError('AUTH_REQUIRED',401);
  const membership=memberships.find(row=>row.business_id===businessId)||null;
  if(!membership)throw calendarError('BUSINESS_ACCESS_DENIED',403);
  if(manage&&!['owner','admin'].includes(String(membership.role||'').toLowerCase()))throw calendarError('CALENDAR_MANAGEMENT_REQUIRED',403);
  return {accessToken,user,membership,businessId};
}

export function providerConfig(providerValue,req){
  const provider=safeProvider(providerValue);if(!provider)throw calendarError('INVALID_CALENDAR_PROVIDER',400);
  const redirectUri=`${requestOrigin(req)}/api/calendar-oauth-callback`;
  if(provider==='google'){
    const clientId=String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_ID||'').trim();
    const clientSecret=String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_SECRET||'').trim();
    return {
      provider,clientId,clientSecret,redirectUri,configured:Boolean(clientId&&clientSecret),
      authUrl:'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl:'https://oauth2.googleapis.com/token',
      scopes:['openid','email','profile','https://www.googleapis.com/auth/calendar'],
    };
  }
  const clientId=String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_SECRET||'').trim();
  const tenant=String(process.env.DABBIR_MICROSOFT_CALENDAR_TENANT||'common').trim()||'common';
  return {
    provider,clientId,clientSecret,redirectUri,configured:Boolean(clientId&&clientSecret),tenant,
    authUrl:`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    tokenUrl:`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    scopes:['openid','profile','email','offline_access','Calendars.ReadWrite'],
  };
}

function calendarRootSecret(){
  const explicit=String(process.env.DABBIR_CALENDAR_TOKEN_KEY||'').trim();
  if(explicit.length>=24)return explicit;
  const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(service.length>=24&&!service.startsWith('sb_publishable_'))return service;
  throw calendarError('CALENDAR_SECURITY_NOT_CONFIGURED',503);
}
function stateSecret(){
  const explicit=String(process.env.DABBIR_CALENDAR_STATE_SECRET||'').trim();
  if(explicit.length>=24)return explicit;
  return crypto.createHmac('sha256',calendarRootSecret()).update('dabbir-calendar-oauth-state-v1').digest();
}
function b64(value){return Buffer.from(value).toString('base64url')}
function unb64(value){return Buffer.from(String(value||''),'base64url').toString('utf8')}
export function signOauthState(payload){
  const body=b64(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyOauthState(value){
  const [body,sig]=String(value||'').split('.');if(!body||!sig)throw calendarError('INVALID_CALENDAR_OAUTH_STATE',400);
  const expected=crypto.createHmac('sha256',stateSecret()).update(body).digest();
  let actual;try{actual=Buffer.from(sig,'base64url')}catch{throw calendarError('INVALID_CALENDAR_OAUTH_STATE',400)}
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw calendarError('INVALID_CALENDAR_OAUTH_STATE',400);
  let payload;try{payload=JSON.parse(unb64(body))}catch{throw calendarError('INVALID_CALENDAR_OAUTH_STATE',400)}
  if(Number(payload?.exp||0)<Date.now())throw calendarError('CALENDAR_OAUTH_STATE_EXPIRED',400);
  if(!safeBusinessId(payload?.business_id)||!safeProvider(payload?.provider)||!UUID_RE.test(String(payload?.user_id||'')))throw calendarError('INVALID_CALENDAR_OAUTH_STATE',400);
  return payload;
}

function tokenKey(){
  return crypto.createHmac('sha256',calendarRootSecret()).update('dabbir-calendar-token-encryption-v1').digest();
}
export function encryptTokenPayload(payload){
  const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};
}
export function decryptTokenPayload(row){
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(row.token_iv,'base64url'));
  decipher.setAuthTag(Buffer.from(row.token_tag,'base64url'));
  const plain=Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,'base64url')),decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function authorizationUrl(config,state){
  if(!config.configured)throw calendarError('CALENDAR_PROVIDER_NOT_CONFIGURED',503);
  const url=new URL(config.authUrl);
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('redirect_uri',config.redirectUri);
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',config.scopes.join(' '));
  url.searchParams.set('state',state);
  if(config.provider==='google'){
    url.searchParams.set('access_type','offline');
    url.searchParams.set('prompt','consent');
    url.searchParams.set('include_granted_scopes','true');
  }else{
    url.searchParams.set('response_mode','query');
    url.searchParams.set('prompt','select_account');
  }
  return url.toString();
}

export async function exchangeAuthorizationCode(config,code){
  if(!config.configured)throw calendarError('CALENDAR_PROVIDER_NOT_CONFIGURED',503);
  const params=new URLSearchParams({
    client_id:config.clientId,
    client_secret:config.clientSecret,
    code:String(code||''),
    redirect_uri:config.redirectUri,
    grant_type:'authorization_code',
  });
  if(config.provider==='outlook')params.set('scope',config.scopes.join(' '));
  const response=await fetch(config.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:params.toString(),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const token=await parseJson(response,'CALENDAR_TOKEN_EXCHANGE_FAILED');
  if(!token?.access_token)throw calendarError('CALENDAR_TOKEN_EXCHANGE_FAILED',502);
  return token;
}

export async function providerIdentity(providerValue,accessToken){
  const provider=safeProvider(providerValue);if(!provider)throw calendarError('INVALID_CALENDAR_PROVIDER',400);
  const url=provider==='google'?'https://openidconnect.googleapis.com/v1/userinfo':'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';
  const response=await fetch(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  const body=await parseJson(response,'CALENDAR_ACCOUNT_LOOKUP_FAILED');
  if(provider==='google')return {id:String(body?.sub||''),email:body?.email||null,displayName:body?.name||body?.email||null};
  return {id:String(body?.id||''),email:body?.mail||body?.userPrincipalName||null,displayName:body?.displayName||body?.mail||body?.userPrincipalName||null};
}

export async function saveCalendarConnection({businessId,userId,provider,identity,token}){
  if(!identity?.id)throw calendarError('CALENDAR_ACCOUNT_LOOKUP_FAILED',502);
  const now=new Date();
  const expiresIn=Math.max(60,Number(token.expires_in||3600));
  const tokenExpiresAt=new Date(now.getTime()+expiresIn*1000).toISOString();
  const connectionRows=await serviceRest(`dabbir_calendar_connections?on_conflict=business_id,provider,provider_account_id`,{
    method:'POST',
    headers:{prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      provider,
      provider_account_id:String(identity.id),
      provider_email:identity.email||null,
      provider_display_name:identity.displayName||identity.email||null,
      calendar_id:'primary',sync_direction:'two_way',sync_enabled:true,status:'active',last_error:null,
      created_by:userId,updated_at:now.toISOString(),
    }),
  });
  const connection=Array.isArray(connectionRows)?connectionRows[0]:null;
  if(!connection?.id)throw calendarError('CALENDAR_CONNECTION_SAVE_FAILED',502);
  const sealed=encryptTokenPayload(token);
  await serviceRest(`dabbir_calendar_credentials?on_conflict=connection_id`,{
    method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({connection_id:connection.id,token_ciphertext:sealed.ciphertext,token_iv:sealed.iv,token_tag:sealed.tag,token_expires_at:tokenExpiresAt,updated_at:now.toISOString()}),
  });
  return connection;
}

export async function listConnections(businessId){
  const rows=await serviceRest(`dabbir_calendar_connections?select=id,business_id,provider,provider_email,provider_display_name,calendar_id,sync_direction,sync_enabled,status,last_sync_at,last_error,updated_at&business_id=eq.${encodeURIComponent(businessId)}&order=provider.asc,updated_at.desc`);
  return Array.isArray(rows)?rows:[];
}

export async function disconnectConnection(businessId,connectionId){
  if(!UUID_RE.test(String(connectionId||'')))throw calendarError('INVALID_CALENDAR_CONNECTION',400);
  const rows=await serviceRest(`dabbir_calendar_connections?id=eq.${encodeURIComponent(connectionId)}&business_id=eq.${encodeURIComponent(businessId)}`,{
    method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({status:'disconnected',sync_enabled:false,updated_at:new Date().toISOString()}),
  });
  const row=Array.isArray(rows)?rows[0]:null;if(!row?.id)throw calendarError('CALENDAR_CONNECTION_NOT_FOUND',404);return row;
}
