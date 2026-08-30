import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { requireCalendarMember, safeBusinessId, serviceRest } from './_calendar-core.js';
import { syncBusinessCalendars } from './_calendar-sync-core.js';

function code(error){const value=Number(error?.code||500);return [400,401,403,404,409,429,502,503].includes(value)?value:500}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const businessId=safeBusinessId(req.query?.business_id);await requireCalendarMember(req,businessId);
      const busy=await serviceRest(`dabbir_calendar_busy_blocks?select=id,connection_id,provider_event_id,starts_at,ends_at,summary,provider_updated_at&business_id=eq.${encodeURIComponent(businessId)}&order=starts_at.asc&limit=500`);
      return json(res,200,{ok:true,business_id:businessId,busy_blocks:Array.isArray(busy)?busy:[]});
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);const businessId=safeBusinessId(body.business_id);await requireCalendarMember(req,businessId,{manage:true});
      const results=await syncBusinessCalendars(req,businessId);
      return json(res,200,{ok:true,business_id:businessId,results});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    console.error('dabbir_calendar_sync_failed',{error:String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160),code:code(error)});
    return json(res,code(error),{ok:false,error:String(error?.message||'CALENDAR_SYNC_FAILED').slice(0,160),detail:error?.detail||undefined});
  }
}
