import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';
import { normalizeMarketCode } from './_market-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

async function read(response,fallback){
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!response.ok){const error=new Error(fallback);error.status=Number(response.status||500);error.detail=data?.code||data?.message||null;throw error}
  return data;
}

function queryBusinessId(req){
  try{
    const url=new URL(String(req.url||'/'),'https://dabbir.invalid');
    const values=url.searchParams.getAll('business_id');
    return values.length===1?safeId(values[0]):null;
  }catch{return null}
}

async function context(req,res,businessId){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const membership=(memberships||[]).find(row=>row.business_id===businessId&&row.status==='active');
  if(!membership){json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});return null}
  return {token,user,membership};
}

async function loadProfile(token,businessId){
  const rows=await read(await supabaseRest(
    `dabbir_businesses?select=id,country_code,currency_code,timezone,phone_country_prefix,vat_status,default_vat_rate,locale,updated_at&id=eq.${encodeURIComponent(businessId)}&limit=1`,
    token,
  ),'MARKET_PROFILE_LOOKUP_FAILED');
  return Array.isArray(rows)?rows[0]||null:null;
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  try{
    if(req.method==='GET'){
      const businessId=queryBusinessId(req);
      if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
      const ctx=await context(req,res,businessId);if(!ctx)return;
      const profile=await loadProfile(ctx.token,businessId);
      if(!profile)return json(res,404,{ok:false,error:'BUSINESS_NOT_FOUND'});
      return json(res,200,{ok:true,profile});
    }

    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req,4096);
    const businessId=safeId(body?.business_id);
    const countryCode=normalizeMarketCode(body?.country_code);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    if(!countryCode)return json(res,400,{ok:false,error:'UNSUPPORTED_MARKET'});
    const ctx=await context(req,res,businessId);if(!ctx)return;
    const canManage=ctx.membership.role==='owner'||(Array.isArray(ctx.membership.permissions)&&ctx.membership.permissions.includes('manage_business'));
    if(!canManage)return json(res,403,{ok:false,error:'BUSINESS_MANAGE_PERMISSION_REQUIRED'});

    await read(await supabaseRpc('dabbir_set_business_country',ctx.token,{p_business_id:businessId,p_country_code:countryCode}),'MARKET_PROFILE_UPDATE_FAILED');
    const profile=await loadProfile(ctx.token,businessId);
    if(!profile||profile.country_code!==countryCode)return json(res,502,{ok:false,error:'MARKET_PROFILE_UPDATE_UNVERIFIED'});
    return json(res,200,{ok:true,state:'VERIFIED_PERSISTED',profile});
  }catch(error){
    return json(res,Number(error?.status||500),{ok:false,error:error?.message||'MARKET_PROFILE_FAILED',detail:error?.detail||null});
  }
}
