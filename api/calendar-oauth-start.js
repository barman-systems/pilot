import { json } from './_auth-core.js';
import {
  authorizationUrl,
  calendarError,
  providerConfig,
  requireCalendarMember,
  safeBusinessId,
  safeProvider,
  signOauthState,
} from './_calendar-core.js';

function statusCode(error){const code=Number(error?.code||500);return [400,401,403,404,409,429,502,503].includes(code)?code:500}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
    const businessId=safeBusinessId(req.query?.business_id),provider=safeProvider(req.query?.provider);
    if(!provider)throw calendarError('INVALID_CALENDAR_PROVIDER',400);
    const ctx=await requireCalendarMember(req,businessId,{manage:true});
    const config=providerConfig(provider,req);
    if(!config.configured)throw calendarError('CALENDAR_PROVIDER_NOT_CONFIGURED',503);
    const state=signOauthState({business_id:businessId,provider,user_id:ctx.user.id,exp:Date.now()+10*60*1000,nonce:crypto.randomUUID?.()||String(Date.now())});
    const location=authorizationUrl(config,state);
    res.statusCode=302;res.setHeader('location',location);res.setHeader('cache-control','no-store');res.end();
  }catch(error){
    console.error('dabbir_calendar_oauth_start_failed',{error:String(error?.message||'CALENDAR_OAUTH_START_FAILED').slice(0,160),code:statusCode(error)});
    return json(res,statusCode(error),{ok:false,error:String(error?.message||'CALENDAR_OAUTH_START_FAILED').slice(0,160)});
  }
}
