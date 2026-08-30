import { json } from './_auth-core.js';
import {
  calendarError,
  exchangeAuthorizationCode,
  providerConfig,
  providerIdentity,
  requestOrigin,
  requireCalendarMember,
  saveCalendarConnection,
  verifyOauthState,
} from './_calendar-core.js';
import { syncBusinessCalendars } from './_calendar-sync-core.js';

function statusCode(error){const code=Number(error?.code||500);return [400,401,403,404,409,429,502,503].includes(code)?code:500}
function redirect(res,location){res.statusCode=302;res.setHeader('location',location);res.setHeader('cache-control','no-store');res.end()}

export default async function handler(req,res){
  const origin=(()=>{try{return requestOrigin(req)}catch{return null}})();
  try{
    if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
    const providerError=String(req.query?.error||'').trim();
    const state=verifyOauthState(req.query?.state);
    if(providerError)throw calendarError(`CALENDAR_PROVIDER_${providerError.toUpperCase().replace(/[^A-Z0-9_]/g,'_')}`,400);
    const code=String(req.query?.code||'').trim();if(!code)throw calendarError('CALENDAR_AUTHORIZATION_CODE_MISSING',400);
    const ctx=await requireCalendarMember(req,state.business_id,{manage:true});
    if(String(ctx.user.id)!==String(state.user_id))throw calendarError('CALENDAR_OAUTH_USER_MISMATCH',403);
    const config=providerConfig(state.provider,req);
    const token=await exchangeAuthorizationCode(config,code);
    const identity=await providerIdentity(state.provider,token.access_token);
    await saveCalendarConnection({businessId:state.business_id,userId:ctx.user.id,provider:state.provider,identity,token});
    await syncBusinessCalendars(req,state.business_id).catch(error=>console.error('dabbir_calendar_initial_sync_failed',{error:String(error?.message||error).slice(0,140)}));
    if(origin)return redirect(res,`${origin}/?calendar=connected&provider=${encodeURIComponent(state.provider)}`);
    return json(res,200,{ok:true,provider:state.provider});
  }catch(error){
    const code=String(error?.message||'CALENDAR_OAUTH_FAILED').slice(0,120);
    console.error('dabbir_calendar_oauth_callback_failed',{error:code,status:statusCode(error)});
    if(origin)return redirect(res,`${origin}/?calendar=error&code=${encodeURIComponent(code)}`);
    return json(res,statusCode(error),{ok:false,error:code});
  }
}
