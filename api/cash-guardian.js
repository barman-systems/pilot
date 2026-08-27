import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { loadCashGuardianSnapshot } from './_cash-guardian.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

function membershipFor(memberships,businessId){
  return (memberships||[]).find(item=>item.business_id===businessId)||null;
}

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

function normalizeThreshold(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=1000000000?Math.round(number*100)/100:undefined;
}

export default async function handler(req,res){
  const token=accessTokenFromRequest(req);
  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  let memberships;
  try{memberships=await getBusinessMemberships(token)}
  catch{return json(res,503,{ok:false,error:'AUTH_VERIFICATION_UNAVAILABLE'})}

  if(req.method==='GET'){
    const businessId=safeId(singleQueryValue(req,'business_id'));
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const membership=membershipFor(memberships,businessId);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(membership.role!=='owner')return json(res,403,{ok:false,error:'OWNER_REQUIRED'});
    try{
      const snapshot=await loadCashGuardianSnapshot({token,businessId});
      return json(res,200,{ok:true,business_id:businessId,...snapshot});
    }catch(error){
      const status=Number(error?.status||500);
      return json(res,status===401?401:status===403?403:503,{ok:false,error:'CASH_GUARDIAN_LOOKUP_FAILED'});
    }
  }

  if(req.method!=='PUT')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, PUT'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});

  try{
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const membership=membershipFor(memberships,businessId);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(membership.role!=='owner')return json(res,403,{ok:false,error:'OWNER_REQUIRED'});

    const horizonDays=Number(body.horizon_days??14);
    if(!Number.isInteger(horizonDays)||horizonDays<1||horizonDays>30){
      return json(res,400,{ok:false,error:'INVALID_HORIZON'});
    }
    const threshold=normalizeThreshold(body.buffer_threshold_aed);
    if(threshold===undefined)return json(res,400,{ok:false,error:'INVALID_BUFFER_THRESHOLD'});

    const response=await supabaseRest('dabbir_cash_guardian_settings?on_conflict=business_id',token,{
      method:'POST',
      headers:{prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify({
        business_id:businessId,
        horizon_days:horizonDays,
        buffer_threshold_aed:threshold,
        updated_by:user.id,
        updated_at:new Date().toISOString(),
      }),
    });
    const rows=await readData(response,'CASH_SETTINGS_UPDATE_FAILED');
    const row=Array.isArray(rows)?rows[0]||null:null;
    if(!row)return json(res,502,{ok:false,error:'CASH_SETTINGS_UPDATE_UNVERIFIED'});

    const snapshot=await loadCashGuardianSnapshot({token,businessId});
    return json(res,200,{ok:true,business_id:businessId,settings:row,snapshot,verified_persisted:true});
  }catch(error){
    if(error?.message==='INVALID_JSON')return json(res,400,{ok:false,error:'INVALID_JSON'});
    if(error?.message==='PAYLOAD_TOO_LARGE')return json(res,413,{ok:false,error:'PAYLOAD_TOO_LARGE'});
    const status=Number(error?.status||500);
    return json(res,[401,403,409].includes(status)?status:503,{ok:false,error:'CASH_SETTINGS_UPDATE_FAILED'});
  }
}
