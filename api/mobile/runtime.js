import { accessTokenFromRequest, getVerifiedUser, json, readJsonBody, supabaseRest, supabaseRpc } from '../_auth-core.js';
import { getMarketProfile, localeForMarket } from '../_market-core.js';
import runtimeHandler from '../dabbir-runtime-fast.js';
import { requireNativeBearer } from './_native-core.js';

const BUSINESS_TYPES=new Set(['store','laundry','car_wash','clinic','creator','salon','real_estate','services','other']);
const clean=(value,max=120)=>String(value??'').trim().slice(0,max);
const enc=value=>encodeURIComponent(String(value));

async function parse(response,fallback){
  const text=await response.text();let data=null;
  try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=data?.code||data?.message||null;throw error}
  return data;
}

async function exactCount(response,fallback){
  if(!response.ok)return parse(response,fallback);
  const range=String(response.headers.get('content-range')||'');
  const raw=range.includes('/')?range.slice(range.lastIndexOf('/')+1):'';
  const total=Number(raw);
  await response.text().catch(()=>{});
  if(!Number.isSafeInteger(total)||total<0)throw Object.assign(new Error(`${fallback}_UNVERIFIED`),{status:502});
  return total;
}

function verifiedProfile(business){
  const profile=getMarketProfile(business?.country_code);
  if(!profile||business?.currency_code!==profile.currency_code||business?.timezone!==profile.timezone||business?.phone_country_prefix!==profile.phone_country_prefix){
    throw Object.assign(new Error('BUSINESS_GCC_PROFILE_UNVERIFIED'),{status:502});
  }
  return profile;
}

function localDay(business,now=new Date()){
  const profile=verifiedProfile(business);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const dateKey=`${parts.year}-${parts.month}-${parts.day}`;
  const start=new Date(`${dateKey}T00:00:00${profile.offset}`);
  if(Number.isNaN(start.getTime()))throw Object.assign(new Error('BUSINESS_LOCAL_DAY_FAILED'),{status:502});
  return {dateKey,start:start.toISOString(),end:new Date(start.getTime()+86400000).toISOString()};
}

function captureFastRuntime(req){
  return new Promise((resolve,reject)=>{
    const headers=new Map();let settled=false;
    const proxy={
      statusCode:200,
      setHeader(name,value){headers.set(String(name).toLowerCase(),value);return proxy},
      getHeader(name){return headers.get(String(name).toLowerCase())},
      removeHeader(name){headers.delete(String(name).toLowerCase())},
      end(body=''){
        if(!settled){settled=true;resolve({statusCode:proxy.statusCode,headers,body:String(body??'')})}
        return proxy;
      },
    };
    Promise.resolve(runtimeHandler(req,proxy)).then(()=>{if(!settled)reject(new Error('FAST_RUNTIME_NO_RESPONSE'))}).catch(reject);
  });
}

function forwardCaptured(res,captured,payload=null){
  res.statusCode=Number(captured.statusCode||200);
  for(const [name,value] of captured.headers.entries()){
    if(name==='content-length'||name==='transfer-encoding')continue;
    res.setHeader(name,value);
  }
  res.setHeader('x-dabbir-mobile-gcc-authority','v2-market-registry');
  return res.end(payload==null?captured.body:JSON.stringify(payload));
}

async function enrichNativeGet(req,res,token){
  try{
    const captured=await captureFastRuntime(req);
    if(Number(captured.statusCode)!==200)return forwardCaptured(res,captured);
    let payload=null;
    try{payload=captured.body?JSON.parse(captured.body):null}catch{return forwardCaptured(res,captured)}
    const businessId=clean(payload?.business?.id,64);
    if(!businessId)return forwardCaptured(res,captured,payload);

    const rows=await parse(await supabaseRest(
      `dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,country_code,currency_code,timezone,phone_country_prefix,vat_status,default_vat_rate,created_at,updated_at&id=eq.${enc(businessId)}&limit=1`,
      token,
    ),'BUSINESS_PROFILE_LOOKUP_FAILED');
    const business=Array.isArray(rows)?rows[0]:null;
    if(!business?.id)return json(res,502,{ok:false,error:'BUSINESS_GCC_PROFILE_UNVERIFIED'});
    verifiedProfile(business);

    const day=localDay(business);
    const todayAppointments=await exactCount(await supabaseRest(
      `dabbir_appointments?select=id&business_id=eq.${enc(businessId)}&starts_at=gte.${enc(day.start)}&starts_at=lt.${enc(day.end)}&simulated=eq.false&limit=1`,
      token,
      {headers:{prefer:'count=exact'}},
    ),'TODAY_APPOINTMENTS_COUNT_FAILED');

    payload.business={...(payload.business||{}),...business};
    payload.business_profile={country_code:business.country_code,currency_code:business.currency_code,timezone:business.timezone,phone_country_prefix:business.phone_country_prefix,vat_status:business.vat_status,default_vat_rate:business.default_vat_rate};
    if(payload.verified_metrics&&typeof payload.verified_metrics==='object')payload.verified_metrics={...payload.verified_metrics,time_zone:business.timezone,date_key:day.dateKey,today_appointments:todayAppointments,country_code:business.country_code,currency_code:business.currency_code};
    payload.data_truth={...(payload.data_truth||{}),mobile_gcc_profile_verified:true,mobile_local_day_verified:true,mobile_market_registry_verified:true};
    payload.performance={...(payload.performance||{}),mobile_gcc_authority:true};
    return forwardCaptured(res,captured,payload);
  }catch(error){
    const status=[400,401,403,404,409,413,422,429,502,503,504].includes(Number(error?.status))?Number(error.status):500;
    return json(res,status,{ok:false,error:String(error?.message||'NATIVE_RUNTIME_GCC_ENRICH_FAILED').slice(0,120),detail:error?.detail||null});
  }
}

async function createNativeBusiness(req,res,token){
  try{
    const body=await readJsonBody(req,8192);
    if(clean(body?.action,60)!=='create_business')return json(res,400,{ok:false,error:'UNSUPPORTED_NATIVE_RUNTIME_ACTION'});
    const name=clean(body?.name,120);
    const businessType=clean(body?.business_type,40).toLowerCase();
    const countryCode=clean(body?.country_code||'AE',2).toUpperCase();
    const language=String(body?.locale||'ar').toLowerCase().startsWith('en')?'en':'ar';
    const profile=getMarketProfile(countryCode);
    if(!name)return json(res,400,{ok:false,error:'BUSINESS_NAME_REQUIRED'});
    if(!BUSINESS_TYPES.has(businessType))return json(res,400,{ok:false,error:'UNSUPPORTED_BUSINESS_TYPE'});
    if(!profile)return json(res,400,{ok:false,error:'UNSUPPORTED_GCC_COUNTRY'});
    const locale=localeForMarket(countryCode,language);
    if(!locale)return json(res,400,{ok:false,error:'UNSUPPORTED_GCC_COUNTRY'});
    const created=await parse(await supabaseRpc('dabbir_create_business',token,{
      p_name:name,p_business_type:businessType,p_locale:locale,p_country_code:countryCode,
    }),'BUSINESS_CREATE_FAILED');
    const businessId=Array.isArray(created)?created[0]?.business_id:created?.business_id;
    if(!businessId)return json(res,502,{ok:false,error:'BUSINESS_CREATE_UNVERIFIED'});
    const rows=await parse(await supabaseRest(
      `dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,country_code,currency_code,timezone,phone_country_prefix,vat_status,default_vat_rate,created_at,updated_at&id=eq.${enc(businessId)}&limit=1`,
      token,
    ),'BUSINESS_PROFILE_VERIFY_FAILED');
    const business=Array.isArray(rows)?rows[0]:null;
    if(!business?.id||business.country_code!==profile.country_code||business.currency_code!==profile.currency_code||business.timezone!==profile.timezone||business.phone_country_prefix!==profile.phone_country_prefix){
      return json(res,502,{ok:false,error:'BUSINESS_COUNTRY_PROFILE_UNVERIFIED',business_id:businessId});
    }
    return json(res,200,{ok:true,action:'create_business',state:'VERIFIED_PERSISTED',business_id:businessId,verified_persisted:true,business,country_profile:{country_code:business.country_code,currency_code:business.currency_code,timezone:business.timezone,phone_country_prefix:business.phone_country_prefix,vat_status:business.vat_status,default_vat_rate:business.default_vat_rate},truth:{state:'VERIFIED',source:'SUPABASE_RETURN_AND_READBACK',entity:'business',entity_id:businessId,verified_at:new Date().toISOString()}});
  }catch(error){
    const status=[400,401,403,404,409,413,422,429,502,503].includes(Number(error?.status))?Number(error.status):500;
    return json(res,status,{ok:false,error:String(error?.message||'NATIVE_BUSINESS_CREATE_FAILED').slice(0,120),detail:error?.detail||null});
  }
}

export default async function handler(req,res){
  if (!['GET', 'POST'].includes(req.method)) return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(!requireNativeBearer(req,res))return;

  const token=accessTokenFromRequest(req);
  const user=token?await getVerifiedUser(token).catch(()=>null):null;
  if(!user)return json(res,401,{ok:false,authenticated:false,error:'AUTH_REQUIRED'});

  if(req.method==='POST')return createNativeBusiness(req,res,token);
  return enrichNativeGet(req,res,token);
}
