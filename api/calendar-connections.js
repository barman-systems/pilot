import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import {
  calendarError,
  disconnectConnection,
  listConnections,
  providerConfig,
  requireCalendarMember,
  safeBusinessId,
} from './_calendar-core.js';

function statusCode(error){
  const code=Number(error?.code||500);
  return [400,401,403,404,409,429,502,503].includes(code)?code:500;
}

function calendarRuntimeReadiness(){
  const serviceRoleKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const tokenKey=String(process.env.DABBIR_CALENDAR_TOKEN_KEY||'').trim();
  const stateSecret=String(process.env.DABBIR_CALENDAR_STATE_SECRET||'').trim();
  const storageConfigured=serviceRoleKey.length>=24&&!serviceRoleKey.startsWith('sb_publishable_');
  const rootSecretConfigured=tokenKey.length>=24||storageConfigured;
  const stateSecretConfigured=stateSecret.length>=24||rootSecretConfigured;
  return {
    storageConfigured,
    securityReady:rootSecretConfigured&&stateSecretConfigured,
  };
}

function logCalendarFailure(error,status){
  const payload={
    error:String(error?.message||'CALENDAR_CONNECTIONS_FAILED').slice(0,160),
    code:status,
  };
  if(status>=500) console.error('dabbir_calendar_connections_failed',payload);
  else if(status===429) console.warn('dabbir_calendar_connections_rate_limited',payload);
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const businessId=safeBusinessId(singleQueryValue(req,'business_id'));
      await requireCalendarMember(req,businessId);
      const google=providerConfig('google',req),outlook=providerConfig('outlook',req);
      const {storageConfigured,securityReady}=calendarRuntimeReadiness();
      const connections=storageConfigured?await listConnections(businessId):[];
      return json(res,200,{
        ok:true,
        business_id:businessId,
        storage_configured:storageConfigured,
        connections,
        providers:{
          google:{configured:Boolean(storageConfigured&&google.configured&&securityReady)},
          outlook:{configured:Boolean(storageConfigured&&outlook.configured&&securityReady)},
        },
      });
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);
      const businessId=safeBusinessId(body.business_id);
      await requireCalendarMember(req,businessId,{manage:true});
      const action=String(body.action||'').toLowerCase();
      if(action!=='disconnect')throw calendarError('INVALID_CALENDAR_ACTION',400);
      const connection=await disconnectConnection(businessId,body.connection_id);
      return json(res,200,{ok:true,connection:{id:connection.id,status:connection.status,sync_enabled:connection.sync_enabled}});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=statusCode(error);
    logCalendarFailure(error,status);
    return json(res,status,{ok:false,error:String(error?.message||'CALENDAR_CONNECTIONS_FAILED').slice(0,160),detail:error?.detail||undefined});
  }
}
