import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  supabaseAuth,
  supabaseRest,
  supabaseRpc,
} from '../_auth-core.js';
import { openAccessToken, resolveEmbeddedPlatformConfig } from '../_whatsapp-embedded-core.js';
import { requireNativeBearer } from './_native-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_ID_RE=/^[0-9]{5,40}$/;
const CONNECTION_SELECT='id,business_id,branch_id,status,meta_app_id,waba_id,phone_number_id,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version';

function clean(value,max=300){return String(value??'').trim().slice(0,max)}
function safeUuid(value){const text=clean(value,80);return UUID_RE.test(text)?text:null}
function safeMetaId(value){const text=clean(value,80);return META_ID_RE.test(text)?text:null}

async function readRows(response,code){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error(code),{status:Number(response.status||502),detail:clean(payload?.message||payload?.error,240)});
  if(!Array.isArray(payload))throw Object.assign(new Error(`${code}_MALFORMED`),{status:502});
  return payload;
}

function inFilter(values){
  const safe=[...new Set((Array.isArray(values)?values:[]).map(safeUuid).filter(Boolean))];
  return safe.length?`in.(${safe.join(',')})`:null;
}

async function loadOwnedConnections(token,businessIds){
  const filter=inFilter(businessIds);
  if(!filter)return [];
  const response=await supabaseRest(
    `dabbir_whatsapp_connections?select=${CONNECTION_SELECT}&business_id=${filter}&order=business_id.asc,branch_id.asc`,
    token,
  );
  const rows=await readRows(response,'WHATSAPP_ACCOUNT_OFFBOARDING_READ_FAILED');
  const allowed=new Set(businessIds.map(String));
  for(const row of rows){
    if(!safeUuid(row?.id)||!allowed.has(String(row?.business_id||''))||!safeMetaId(row?.waba_id)||!safeMetaId(row?.phone_number_id)){
      throw Object.assign(new Error('WHATSAPP_ACCOUNT_OFFBOARDING_SCOPE_MISMATCH'),{status:502});
    }
  }
  return rows;
}

async function freezeConnections(token,rows){
  if(!rows.length)return;
  const filter=inFilter(rows.map(row=>row.id));
  const response=await supabaseRest(
    `dabbir_whatsapp_connections?select=id,business_id,status&id=${filter}`,
    token,
    {
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify({status:'disconnected',last_error:'ACCOUNT_DELETE_OFFBOARDING'}),
    },
  );
  const frozen=await readRows(response,'WHATSAPP_ACCOUNT_OFFBOARDING_FREEZE_FAILED');
  const expected=new Set(rows.map(row=>String(row.id)));
  if(frozen.length!==expected.size||frozen.some(row=>!expected.has(String(row?.id||''))||row?.status!=='disconnected')){
    throw Object.assign(new Error('WHATSAPP_ACCOUNT_OFFBOARDING_FREEZE_UNVERIFIED'),{status:502});
  }
}

async function deleteConnections(token,rows){
  if(!rows.length)return;
  const filter=inFilter(rows.map(row=>row.id));
  const response=await supabaseRest(
    `dabbir_whatsapp_connections?select=id,business_id,waba_id,phone_number_id&id=${filter}`,
    token,
    {method:'DELETE',headers:{prefer:'return=representation'}},
  );
  const deleted=await readRows(response,'WHATSAPP_ACCOUNT_OFFBOARDING_LOCAL_DELETE_FAILED');
  const expected=new Set(rows.map(row=>String(row.id)));
  if(deleted.length!==expected.size||deleted.some(row=>!expected.has(String(row?.id||'')))){
    throw Object.assign(new Error('WHATSAPP_ACCOUNT_OFFBOARDING_LOCAL_DELETE_UNVERIFIED'),{status:502});
  }
}

function metaError(payload,response,code){
  return Object.assign(new Error(code),{
    status:502,
    providerStatus:Number(response?.status||0)||null,
    providerCode:payload?.error?.code??null,
    providerSubcode:payload?.error?.error_subcode??null,
    providerMessage:clean(payload?.error?.message,240)||null,
  });
}

async function metaRequest(platform,path,token,{method='GET'}={}){
  const url=new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${String(path).replace(/^\//,'')}`);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10_000);
  try{
    const response=await fetch(url,{
      method,
      cache:'no-store',
      signal:controller.signal,
      headers:{authorization:`Bearer ${token}`,accept:'application/json'},
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw metaError(payload,response,'META_WHATSAPP_OFFBOARDING_REQUEST_FAILED');
    return {payload,status:response.status};
  }catch(error){
    if(error?.name==='AbortError')throw Object.assign(new Error('META_WHATSAPP_OFFBOARDING_TIMEOUT'),{status:504});
    throw error;
  }finally{clearTimeout(timeout)}
}

function subscribedAppIds(payload){
  return new Set((Array.isArray(payload?.data)?payload.data:[]).map(row=>safeMetaId(row?.id)).filter(Boolean));
}

async function unsubscribeWabaVerified(platform,token,wabaId){
  const waba=safeMetaId(wabaId);
  const appId=safeMetaId(platform?.appId);
  if(!waba||!appId)throw Object.assign(new Error('META_WHATSAPP_OFFBOARDING_CONTEXT_INCOMPLETE'),{status:503});

  const before=await metaRequest(platform,`${encodeURIComponent(waba)}/subscribed_apps`,token);
  if(!subscribedAppIds(before.payload).has(appId)){
    return {verified:true,alreadyUnsubscribed:true,providerStatus:before.status};
  }

  const removed=await metaRequest(platform,`${encodeURIComponent(waba)}/subscribed_apps`,token,{method:'DELETE'});
  if(removed.payload?.success!==true){
    throw Object.assign(new Error('META_WHATSAPP_OFFBOARDING_DELETE_UNVERIFIED'),{status:502});
  }

  const after=await metaRequest(platform,`${encodeURIComponent(waba)}/subscribed_apps`,token);
  if(subscribedAppIds(after.payload).has(appId)){
    throw Object.assign(new Error('META_WHATSAPP_OFFBOARDING_STILL_SUBSCRIBED'),{status:502});
  }
  return {verified:true,alreadyUnsubscribed:false,providerStatus:after.status};
}

async function offboardWhatsApp(token,businessIds){
  const connections=await loadOwnedConnections(token,businessIds);
  if(!connections.length)return {connections:0,wabas:0};

  // Freeze first. All normal DABBIR outbound reservation/load paths require a
  // connected row, so no new sends can start while Meta offboarding is running.
  await freezeConnections(token,connections);

  const platform=await resolveEmbeddedPlatformConfig();
  if(!safeMetaId(platform?.appId)||!platform?.encryptionSecret){
    throw Object.assign(new Error('META_WHATSAPP_OFFBOARDING_PLATFORM_NOT_CONFIGURED'),{status:503});
  }

  const byWaba=new Map();
  for(const row of connections){
    const key=String(row.waba_id);
    if(!byWaba.has(key))byWaba.set(key,[]);
    byWaba.get(key).push(row);
  }

  for(const [wabaId,rows] of byWaba){
    let verified=false;
    let lastError=null;
    // Multi-branch connections may carry equivalent granular tokens. Try each
    // tenant-scoped credential before declaring the WABA impossible to offboard.
    for(const row of rows){
      try{
        const access=openAccessToken(row,platform,row.business_id);
        await unsubscribeWabaVerified(platform,access,wabaId);
        verified=true;
        break;
      }catch(error){lastError=error}
    }
    if(!verified)throw lastError||Object.assign(new Error('META_WHATSAPP_OFFBOARDING_UNVERIFIED'),{status:502});
  }

  // Only after every WABA is remotely verified as unsubscribed do we remove the
  // encrypted credentials. The database business-delete guard then allows account
  // deletion to continue without any cascade ever being responsible for secrets.
  await deleteConnections(token,connections);
  return {connections:connections.length,wabas:byWaba.size};
}

function rpcDetail(payload){return String(payload?.message||payload?.error||payload?.code||'').toUpperCase()}
function accountBlocker(res,payload){
  const detail=rpcDetail(payload);
  if(detail.includes('LEGAL_HOLD'))return json(res,409,{ok:false,error:'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD'});
  if(detail.includes('PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF'))return json(res,409,{ok:false,error:'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF'});
  if(detail.includes('DABBIR_ACCOUNT_ALREADY_DELETED'))return json(res,409,{ok:false,error:'DABBIR_ACCOUNT_ALREADY_DELETED'});
  return null;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireNativeBearer(req,res))return;

  try{
    const token=accessTokenFromRequest(req);
    const user=token?await getVerifiedUser(token):null;
    if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

    const body=await readJsonBody(req,4096);
    if(body?.confirmation!=='DELETE_DABBIR_ACCOUNT'){
      return json(res,400,{ok:false,error:'ACCOUNT_DELETE_CONFIRMATION_REQUIRED'});
    }

    // Check all database-level blockers before making an irreversible Meta change.
    const preflightResponse=await supabaseRpc('dabbir_account_delete_preflight',token,{});
    const preflight=await readRpcJson(preflightResponse);
    if(!preflightResponse.ok||preflight?.ok!==true){
      const blocked=accountBlocker(res,preflight);
      if(blocked)return blocked;
      return json(res,503,{ok:false,error:'ACCOUNT_DELETE_PREFLIGHT_FAILED'});
    }
    const businessIds=(Array.isArray(preflight?.owned_business_ids)?preflight.owned_business_ids:[]).map(safeUuid).filter(Boolean);

    let whatsapp={connections:0,wabas:0};
    try{
      whatsapp=await offboardWhatsApp(token,businessIds);
    }catch(error){
      console.warn('dabbir_account_delete_whatsapp_offboarding_failed',{
        error:clean(error?.message,160)||'WHATSAPP_ACCOUNT_OFFBOARDING_FAILED',
        provider_status:error?.providerStatus||null,
        provider_code:error?.providerCode||null,
        provider_subcode:error?.providerSubcode||null,
      });
      return json(res,[409,502,503,504].includes(Number(error?.status))?Number(error.status):503,{
        ok:false,
        error:'WHATSAPP_ACCOUNT_OFFBOARDING_FAILED',
        retryable:true,
        whatsapp_frozen:true,
      });
    }

    const response=await supabaseRpc('dabbir_delete_current_user_account',token,{
      p_confirmation:'DELETE_DABBIR_ACCOUNT',
    });
    const payload=await readRpcJson(response);
    if(!response.ok||payload?.deleted!==true){
      const blocked=accountBlocker(res,payload);
      if(blocked)return blocked;
      const detail=rpcDetail(payload);
      if(detail.includes('WHATSAPP_OFFBOARDING_REQUIRED'))return json(res,503,{ok:false,error:'WHATSAPP_ACCOUNT_OFFBOARDING_UNVERIFIED'});
      return json(res,503,{ok:false,error:'ACCOUNT_DELETE_FAILED'});
    }

    // Prevent the DABBIR signup trigger from recreating the DABBIR-specific
    // account registry row on a later auth metadata update. Other product metadata
    // and the global Supabase identity are left intact.
    await supabaseAuth('/auth/v1/user',{
      method:'PUT',
      headers:{authorization:`Bearer ${token}`},
      body:JSON.stringify({data:{product:null}}),
    }).catch(()=>null);

    // Revoke the current Supabase session after the product deletion completed.
    await supabaseAuth('/auth/v1/logout',{
      method:'POST',
      headers:{authorization:`Bearer ${token}`},
      body:'{}',
    }).catch(()=>null);

    return json(res,200,{ok:true,...payload,whatsapp_offboarded:true,whatsapp_connections_removed:whatsapp.connections,whatsapp_wabas_unsubscribed:whatsapp.wabas});
  }catch(error){
    const status=Number(error?.code||error?.status||500);
    return json(res,status===400||status===413?status:503,{ok:false,error:error?.message==='INVALID_JSON'?'INVALID_JSON':'ACCOUNT_DELETE_UNAVAILABLE'});
  }
}
