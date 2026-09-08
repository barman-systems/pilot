import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  supabaseRpc,
} from '../_auth-core.js';
import { requireNativeBearer } from './_native-core.js';

const detail=payload=>String(payload?.message||payload?.error||payload?.code||'').toUpperCase();

function blocked(res,payload){
  const value=detail(payload);
  if(value.includes('LEGAL_HOLD'))return json(res,409,{ok:false,error:'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD'});
  if(value.includes('PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF'))return json(res,409,{ok:false,error:'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF'});
  if(value.includes('DABBIR_ACCOUNT_ALREADY_DELETED'))return json(res,409,{ok:false,error:'DABBIR_ACCOUNT_ALREADY_DELETED'});
  return null;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireNativeBearer(req,res))return;

  try{
    const token=accessTokenFromRequest(req);
    const user=token?await getVerifiedUser(token):null;
    if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

    const body=await readJsonBody(req,2048);
    if(body?.confirmation!=='DELETE_DABBIR_ACCOUNT'){
      return json(res,400,{ok:false,error:'ACCOUNT_DELETE_CONFIRMATION_REQUIRED'});
    }

    // Check legal/admin/deleted blockers before freezing a live customer channel.
    const preflightResponse=await supabaseRpc('dabbir_account_delete_preflight',token,{});
    const preflight=await readRpcJson(preflightResponse);
    if(!preflightResponse.ok||preflight?.ok!==true){
      const response=blocked(res,preflight);
      if(response)return response;
      return json(res,503,{ok:false,error:'ACCOUNT_DELETE_PREFLIGHT_FAILED'});
    }

    if(preflight?.whatsapp_disconnect_required!==true){
      return json(res,200,{ok:true,ready:true,whatsapp_disconnect_required:false});
    }

    const beginResponse=await supabaseRpc('dabbir_begin_whatsapp_account_offboarding',token,{});
    const begin=await readRpcJson(beginResponse);
    if(!beginResponse.ok||begin?.ok!==true){
      const response=blocked(res,begin);
      if(response)return response;
      return json(res,503,{ok:false,error:'WHATSAPP_ACCOUNT_OFFBOARDING_FREEZE_FAILED'});
    }

    return json(res,409,{
      ok:false,
      ready:false,
      error:'WHATSAPP_BUSINESS_DISCONNECT_REQUIRED',
      action_required:'WHATSAPP_BUSINESS_PLATFORM_DISCONNECT',
      whatsapp_frozen:true,
      whatsapp_connection_count:Number(begin?.whatsapp_connection_count||0),
      whatsapp_waba_count:Number(begin?.whatsapp_waba_count||0),
      retry_after_partner_removed:true,
    });
  }catch(error){
    const status=Number(error?.status||500);
    return json(res,[400,409,413,502,503,504].includes(status)?status:503,{
      ok:false,
      error:error?.message==='INVALID_JSON'?'INVALID_JSON':'ACCOUNT_DELETE_PREFLIGHT_UNAVAILABLE',
    });
  }
}
