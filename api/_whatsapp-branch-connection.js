import { supabaseRest } from './_auth-core.js';
import { withServerReadTimeout } from './_server-read-timeout.js';
import {
  embeddedPlatformConfig,
  openAccessToken,
  sealAccessToken,
  tokenNeedsRotation,
} from './_whatsapp-embedded-core.js';

const READ_TIMEOUT_MS=10_000;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const SELECT='id,business_id,branch_id,status,meta_app_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,token_expires_at,connected_at,last_verified_at,last_provider_status,last_error';

async function readRows(response,code,{max=1}={}){
  const text=await response.text();
  let rows=null;
  try{rows=text?JSON.parse(text):null}catch{rows=null}
  if(!response.ok)throw Object.assign(new Error(code),{status:Number(response.status||502)});
  if(!Array.isArray(rows)||rows.length>max)throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_RESPONSE_MALFORMED'),{status:502});
  return rows;
}

async function rotateExact(accessToken,row,config,options={}){
  if(!row||!tokenNeedsRotation(row,config)||!config.rotationReady)return row;
  const plaintext=openAccessToken(row,config,row.business_id);
  const sealed=sealAccessToken(plaintext,config,row.business_id);
  return withServerReadTimeout(async signal=>{
    const path=`dabbir_whatsapp_connections?id=eq.${encodeURIComponent(row.id)}&business_id=eq.${encodeURIComponent(row.business_id)}&select=${SELECT}`;
    const response=await supabaseRest(path,accessToken,{
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify(sealed),
      signal,
    });
    const rows=await readRows(response,'WHATSAPP_EXACT_CONNECTION_ROTATION_FAILED');
    const rotated=rows[0]||null;
    if(!rotated||rotated.id!==row.id||rotated.business_id!==row.business_id){
      throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_ROTATION_UNVERIFIED'),{status:502});
    }
    return rotated;
  },{
    label:'WHATSAPP_EXACT_CONNECTION_ROTATION',
    errorCode:'WHATSAPP_EXACT_CONNECTION_ROTATION_TIMEOUT',
    timeoutMs:options.timeoutMs??READ_TIMEOUT_MS,
  });
}

async function loadConnection(accessToken,business,filter,options={}){
  let row=await withServerReadTimeout(async signal=>{
    const path=`dabbir_whatsapp_connections?select=${SELECT}&business_id=eq.${encodeURIComponent(business)}&${filter}&limit=1`;
    const response=await supabaseRest(path,accessToken,{signal});
    const rows=await readRows(response,'WHATSAPP_EXACT_CONNECTION_READ_FAILED');
    return rows[0]||null;
  },{
    label:'WHATSAPP_EXACT_CONNECTION_READ',
    errorCode:'WHATSAPP_EXACT_CONNECTION_READ_TIMEOUT',
    timeoutMs:options.timeoutMs??READ_TIMEOUT_MS,
  });
  if(!row)return null;
  if(row.business_id!==business||!safeId(row.id)||!safeId(row.branch_id)){
    throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_SCOPE_MISMATCH'),{status:502});
  }
  row=await rotateExact(accessToken,row,embeddedPlatformConfig(),options);
  return row;
}

export async function loadExactBusinessConnection(accessToken,businessId,connectionId,options={}){
  const business=safeId(businessId),connection=safeId(connectionId);
  if(!business||!connection)throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_ID_REQUIRED'),{status:400});
  const row=await loadConnection(accessToken,business,`id=eq.${encodeURIComponent(connection)}`,options);
  if(row&&row.id!==connection)throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_SCOPE_MISMATCH'),{status:502});
  return row;
}

export async function loadBusinessBranchConnection(accessToken,businessId,branchId,options={}){
  const business=safeId(businessId),branch=safeId(branchId);
  if(!business||!branch)throw Object.assign(new Error('WHATSAPP_BRANCH_CONNECTION_ID_REQUIRED'),{status:400});
  const row=await loadConnection(accessToken,business,`branch_id=eq.${encodeURIComponent(branch)}`,options);
  if(row&&row.branch_id!==branch)throw Object.assign(new Error('WHATSAPP_BRANCH_CONNECTION_SCOPE_MISMATCH'),{status:502});
  return row;
}

export async function loadPrimaryBusinessConnection(accessToken,businessId,options={}){
  const business=safeId(businessId);
  if(!business)throw Object.assign(new Error('BUSINESS_ID_REQUIRED'),{status:400});
  const branch=await withServerReadTimeout(async signal=>{
    const path=`dabbir_business_branches?select=id,business_id,status,is_primary&business_id=eq.${encodeURIComponent(business)}&status=eq.active&is_primary=eq.true&limit=1`;
    const response=await supabaseRest(path,accessToken,{signal});
    const rows=await readRows(response,'WHATSAPP_PRIMARY_BRANCH_READ_FAILED');
    return rows[0]||null;
  },{
    label:'WHATSAPP_PRIMARY_BRANCH_READ',
    errorCode:'WHATSAPP_PRIMARY_BRANCH_READ_TIMEOUT',
    timeoutMs:options.timeoutMs??READ_TIMEOUT_MS,
  });
  if(!branch?.id||branch.business_id!==business)throw Object.assign(new Error('WHATSAPP_PRIMARY_BRANCH_REQUIRED'),{status:409});
  return loadBusinessBranchConnection(accessToken,business,branch.id,options);
}

export async function deleteExactBusinessConnection(accessToken,businessId,connectionId,options={}){
  const business=safeId(businessId),connection=safeId(connectionId);
  if(!business||!connection)throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_ID_REQUIRED'),{status:400});
  return withServerReadTimeout(async signal=>{
    const path=`dabbir_whatsapp_connections?id=eq.${encodeURIComponent(connection)}&business_id=eq.${encodeURIComponent(business)}&select=id,business_id,branch_id,waba_id,phone_number_id`;
    const response=await supabaseRest(path,accessToken,{method:'DELETE',headers:{prefer:'return=representation'},signal});
    const rows=await readRows(response,'WHATSAPP_EXACT_CONNECTION_DELETE_FAILED');
    const deleted=rows[0]||null;
    if(!deleted||deleted.id!==connection||deleted.business_id!==business){
      throw Object.assign(new Error('WHATSAPP_EXACT_CONNECTION_DELETE_UNVERIFIED'),{status:502});
    }
    return deleted;
  },{
    label:'WHATSAPP_EXACT_CONNECTION_DELETE',
    errorCode:'WHATSAPP_EXACT_CONNECTION_DELETE_TIMEOUT',
    timeoutMs:options.timeoutMs??READ_TIMEOUT_MS,
  });
}
