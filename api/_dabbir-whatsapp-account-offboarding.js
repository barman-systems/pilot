import { supabaseRest } from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
const safeUuid=value=>{const text=clean(value,80);return UUID_RE.test(text)?text:null};

async function rows(response,code){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error(code),{status:Number(response.status||502)});
  if(!Array.isArray(payload))throw Object.assign(new Error(`${code}_MALFORMED`),{status:502});
  return payload;
}

function inFilter(values){
  const safe=[...new Set((Array.isArray(values)?values:[]).map(safeUuid).filter(Boolean))];
  return safe.length?`in.(${safe.join(',')})`:null;
}

export async function prepareWhatsAppAccountOffboarding(accessToken,businessIds){
  const filter=inFilter(businessIds);
  if(!filter)return {required:false,connections:0,wabas:0};

  const found=await rows(await supabaseRest(
    `dabbir_whatsapp_connections?select=id,business_id,status,waba_id&business_id=${filter}&order=business_id.asc,branch_id.asc`,
    accessToken,
  ),'WHATSAPP_ACCOUNT_OFFBOARDING_READ_FAILED');

  const allowed=new Set(businessIds.map(String));
  for(const row of found){
    if(!safeUuid(row?.id)||!allowed.has(String(row?.business_id||''))){
      throw Object.assign(new Error('WHATSAPP_ACCOUNT_OFFBOARDING_SCOPE_MISMATCH'),{status:502});
    }
  }
  if(!found.length)return {required:false,connections:0,wabas:0};

  const ids=inFilter(found.map(row=>row.id));
  const frozen=await rows(await supabaseRest(
    `dabbir_whatsapp_connections?select=id,business_id,status&id=${ids}`,
    accessToken,
    {
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify({
        status:'offboarding_pending',
        last_error:'ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED',
      }),
    },
  ),'WHATSAPP_ACCOUNT_OFFBOARDING_FREEZE_FAILED');

  const expected=new Set(found.map(row=>String(row.id)));
  if(frozen.length!==expected.size||frozen.some(row=>!expected.has(String(row?.id||''))||row?.status!=='offboarding_pending')){
    throw Object.assign(new Error('WHATSAPP_ACCOUNT_OFFBOARDING_FREEZE_UNVERIFIED'),{status:502});
  }

  return {
    required:true,
    connections:found.length,
    wabas:new Set(found.map(row=>String(row.waba_id||'')).filter(Boolean)).size,
  };
}
