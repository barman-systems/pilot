import crypto from 'node:crypto';
import { json } from './_auth-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';
import {
  resolveEmbeddedPlatformConfig,
  sealAccessToken,
  verifyEmbeddedAssets,
} from './_whatsapp-embedded-core.js';

const EXPECTED_TEST_WABA_ID='1510889861054603';
const EXPECTED_TEST_PHONE_NUMBER_ID='1324337064094613';
const TOKEN_RE=/^[A-Za-z0-9_-]{32,160}$/;

function clean(value,max=4096){return String(value??'').trim().slice(0,max)}
function firstEnv(...names){for(const name of names){const value=clean(process.env[name],8192);if(value)return value}return ''}
function hash(value){return crypto.createHash('sha256').update(String(value)).digest('hex')}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(clean(process.env.VERCEL_ENV,32)!=='production')return json(res,409,{ok:false,error:'PRODUCTION_REQUIRED'});

  const token=clean(req.query?.token,200);
  if(!TOKEN_RE.test(token))return json(res,403,{ok:false,error:'BOOTSTRAP_TOKEN_REQUIRED'});

  const wabaId=firstEnv('DABBIR_WHATSAPP_WABA_ID','PILOT_WHATSAPP_WABA_ID');
  const phoneNumberId=firstEnv('DABBIR_WHATSAPP_PHONE_NUMBER_ID','PILOT_WHATSAPP_PHONE_NUMBER_ID');
  const accessToken=firstEnv('DABBIR_WHATSAPP_ACCESS_TOKEN','PILOT_WHATSAPP_ACCESS_TOKEN','WHATSAPP_ACCESS_TOKEN','META_WHATSAPP_ACCESS_TOKEN');
  if(wabaId!==EXPECTED_TEST_WABA_ID||phoneNumberId!==EXPECTED_TEST_PHONE_NUMBER_ID){
    return json(res,409,{ok:false,error:'META_TEST_ASSET_MISMATCH'});
  }
  if(!accessToken)return json(res,503,{ok:false,error:'META_TEST_ACCESS_TOKEN_MISSING'});

  const tokenHash=hash(token);
  try{
    const claimPayload=await serviceRpc('dabbir_whatsapp_test_bootstrap_claim',{
      p_token_hash:tokenHash,
      p_platform_phone_number_id:phoneNumberId,
    });
    const claim=Array.isArray(claimPayload)?claimPayload[0]:claimPayload;
    if(!claim?.business_id)return json(res,403,{ok:false,error:'BOOTSTRAP_SESSION_NOT_FOUND'});

    const platform=await resolveEmbeddedPlatformConfig();
    if(!platform?.ready)return json(res,503,{ok:false,error:'META_PLATFORM_NOT_READY'});

    const verified=await verifyEmbeddedAssets(platform,accessToken,wabaId,phoneNumberId);
    const sealed=sealAccessToken(accessToken,platform,claim.business_id);
    const storedPayload=await serviceRpc('dabbir_whatsapp_test_bootstrap_store',{
      p_token_hash:tokenHash,
      p_platform_phone_number_id:phoneNumberId,
      p_meta_app_id:platform.appId,
      p_waba_id:wabaId,
      p_display_phone_number:verified.displayPhoneNumber||null,
      p_verified_name:verified.verifiedName||null,
      p_access_token_ciphertext:sealed.access_token_ciphertext,
      p_access_token_iv:sealed.access_token_iv,
      p_access_token_tag:sealed.access_token_tag,
      p_token_key_version:sealed.token_key_version,
      p_last_provider_status:Number(verified.providerStatus||200),
    });
    const stored=Array.isArray(storedPayload)?storedPayload[0]:storedPayload;
    if(!stored?.connection_id||stored?.status!=='connected')return json(res,502,{ok:false,error:'TEST_CONNECTION_STORE_UNVERIFIED'});

    return json(res,200,{
      ok:true,
      state:'META_TEST_NUMBER_CONNECTED',
      business_id:stored.business_id,
      branch_id:stored.branch_id,
      phone_number_id:stored.phone_number_id,
      webhook_subscription_verified:true,
      token_exposed:false,
    });
  }catch(error){
    console.error('dabbir_whatsapp_test_bootstrap_failed',{
      error:clean(error?.code||error?.message||'BOOTSTRAP_FAILED',160),
      provider_status:error?.providerStatus||null,
      provider_code:error?.providerCode||null,
    });
    return json(res,Number(error?.status||502),{
      ok:false,
      error:clean(error?.code||error?.message||'BOOTSTRAP_FAILED',160),
      provider_status:error?.providerStatus||null,
      provider_code:error?.providerCode||null,
    });
  }
}
