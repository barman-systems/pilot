import crypto from 'node:crypto';
import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
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
function logFailure(error,status){
  const payload={error:String(error?.message||'CALENDAR_OAUTH_START_FAILED').slice(0,160),code:status};
  if(status>=500)console.error('dabbir_calendar_oauth_start_failed',payload);
  else if(status===429)console.warn('dabbir_calendar_oauth_start_rate_limited',payload);
  else console.info('dabbir_calendar_oauth_start_rejected',payload);
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
    const businessId=safeBusinessId(singleQueryValue(req,'business_id')),provider=safeProvider(singleQueryValue(req,'provider'));
    if(!provider)throw calendarError('INVALID_CALENDAR_PROVIDER',400);
    const ctx=await requireCalendarMember(req,businessId,{manage:true});
    const config=providerConfig(provider,req);
    if(!config.configured)throw calendarError('CALENDAR_PROVIDER_NOT_CONFIGURED',503);
    const state=signOauthState({business_id:businessId,provider,user_id:ctx.user.id,exp:Date.now()+10*60*1000,nonce:crypto.randomUUID()});
    const location=authorizationUrl(config,state);
    res.statusCode=302;res.setHeader('location',location);res.setHeader('cache-control','no-store');res.end();
  }catch(error){
    const status=statusCode(error);
    logFailure(error,status);
    return json(res,status,{ok:false,error:String(error?.message||'CALENDAR_OAUTH_START_FAILED').slice(0,160)});
  }
}
