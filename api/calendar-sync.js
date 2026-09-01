import { accessTokenFromRequest, json, readJsonBody, requireSameOrigin, supabaseRest } from './_auth-core.js';
import { calendarError, requireCalendarMember, safeBusinessId } from './_calendar-core.js';
import { syncBusinessCalendars } from './_calendar-sync-core.js';

function code(error){const value=Number(error?.code||500);return [400,401,403,404,409,429,502,503].includes(value)?value:500}
function calendarStorageConfigured(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  return Boolean(key&&!key.startsWith('sb_publishable_'));
}
function calendarTokenSecurityConfigured(){
  return String(process.env.DABBIR_CALENDAR_TOKEN_KEY||'').trim().length>=24;
}
async function userRestJson(path,accessToken,fallback){
  const response=await supabaseRest(path,accessToken);
  if(!response.ok){
    const status=Number(response.status||500);
    throw calendarError(fallback,[400,401,403,404,409,429,503].includes(status)?status:502);
  }
  return response.json();
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const businessId=safeBusinessId(req.query?.business_id);
      const ctx=await requireCalendarMember(req,businessId);
      const busy=await userRestJson(
        `dabbir_calendar_busy_blocks?select=id,connection_id,provider_event_id,starts_at,ends_at,summary,provider_updated_at&business_id=eq.${encodeURIComponent(businessId)}&order=starts_at.asc&limit=500`,
        ctx.accessToken||accessTokenFromRequest(req),
        'CALENDAR_BUSY_LOOKUP_FAILED',
      );
      return json(res,200,{ok:true,business_id:businessId,busy_blocks:Array.isArray(busy)?busy:[]});
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);const businessId=safeBusinessId(body.business_id);await requireCalendarMember(req,businessId,{manage:true});
      if(!calendarStorageConfigured()){
        return json(res,200,{ok:true,business_id:businessId,skipped:true,reason:'CALENDAR_STORAGE_NOT_CONFIGURED',results:[]});
      }
      if(!calendarTokenSecurityConfigured()){
        return json(res,200,{ok:true,business_id:businessId,skipped:true,reason:'CALENDAR_SECURITY_NOT_CONFIGURED',results:[]});
      }
      const results=await syncBusinessCalendars(req,businessId);
      return json(res,200,{ok:true,business_id:businessId,results});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=code(error);
    if(status>=500)console.error('dabbir_calendar_sync_failed',{error:String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160),code:status});
    else if(status===429)console.warn('dabbir_calendar_sync_rate_limited',{error:String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160),code:status});
    return json(res,status,{ok:false,error:String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160),detail:error?.detail||undefined});
  }
}
