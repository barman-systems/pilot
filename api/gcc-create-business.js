import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';

const BUSINESS_TYPES = new Set(['store','laundry','car_wash','clinic','creator','salon','real_estate','services','other']);
const GCC = Object.freeze({
  AE:{currency_code:'AED',timezone:'Asia/Dubai',phone_country_prefix:'+971',region:'AE'},
  SA:{currency_code:'SAR',timezone:'Asia/Riyadh',phone_country_prefix:'+966',region:'SA'},
  KW:{currency_code:'KWD',timezone:'Asia/Kuwait',phone_country_prefix:'+965',region:'KW'},
  QA:{currency_code:'QAR',timezone:'Asia/Qatar',phone_country_prefix:'+974',region:'QA'},
  BH:{currency_code:'BHD',timezone:'Asia/Bahrain',phone_country_prefix:'+973',region:'BH'},
  OM:{currency_code:'OMR',timezone:'Asia/Muscat',phone_country_prefix:'+968',region:'OM'},
});

function clean(value,max=120){return String(value??'').trim().slice(0,max)}
function country(value){const code=clean(value,2).toUpperCase();return GCC[code]?code:null}
function language(value){return String(value||'').toLowerCase().startsWith('en')?'en':'ar'}

async function read(response,fallback){
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=Number(response.status||500);
    error.detail=data?.code||data?.message||null;
    throw error;
  }
  return data;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});

  try{
    const accessToken=accessTokenFromRequest(req);
    if(!accessToken)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
    const user=await getVerifiedUser(accessToken).catch(()=>null);
    if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

    const body=await readJsonBody(req,8192);
    const name=clean(body?.name,120);
    const businessType=clean(body?.business_type,40).toLowerCase();
    const countryCode=country(body?.country_code);
    const lang=language(body?.locale);

    if(!name)return json(res,400,{ok:false,error:'BUSINESS_NAME_REQUIRED'});
    if(!BUSINESS_TYPES.has(businessType))return json(res,400,{ok:false,error:'UNSUPPORTED_BUSINESS_TYPE'});
    if(!countryCode)return json(res,400,{ok:false,error:'UNSUPPORTED_GCC_COUNTRY'});

    const locale=`${lang}-${GCC[countryCode].region}`;
    const created=await read(await supabaseRpc('dabbir_create_business',accessToken,{
      p_name:name,
      p_business_type:businessType,
      p_locale:locale,
      p_country_code:countryCode,
    }),'BUSINESS_CREATE_FAILED');
    const businessId=Array.isArray(created)?created[0]?.business_id:created?.business_id;
    if(!businessId)return json(res,502,{ok:false,error:'BUSINESS_CREATE_UNVERIFIED'});

    const rows=await read(await supabaseRest(
      `dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,country_code,currency_code,timezone,phone_country_prefix,vat_status,default_vat_rate,created_at,updated_at&id=eq.${encodeURIComponent(businessId)}&limit=1`,
      accessToken,
    ),'BUSINESS_PROFILE_VERIFY_FAILED');
    const business=Array.isArray(rows)?rows[0]:null;
    if(!business?.id||business.country_code!==countryCode||business.currency_code!==GCC[countryCode].currency_code){
      return json(res,502,{ok:false,error:'BUSINESS_COUNTRY_PROFILE_UNVERIFIED',business_id:businessId});
    }

    return json(res,200,{
      ok:true,
      action:'create_business',
      state:'VERIFIED_PERSISTED',
      business_id:businessId,
      verified_persisted:true,
      business,
      country_profile:{
        country_code:business.country_code,
        currency_code:business.currency_code,
        timezone:business.timezone,
        phone_country_prefix:business.phone_country_prefix,
        vat_status:business.vat_status,
        default_vat_rate:business.default_vat_rate,
      },
      truth:{state:'VERIFIED',source:'SUPABASE_RETURN_AND_READBACK',entity:'business',entity_id:businessId,verified_at:new Date().toISOString()},
    });
  }catch(error){
    return json(res,Number(error?.status||500),{ok:false,error:error?.message||'GCC_BUSINESS_CREATE_FAILED',detail:error?.detail||null});
  }
}
