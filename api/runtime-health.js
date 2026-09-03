import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
function key(){
  const value=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!value||value.startsWith('sb_publishable_'))throw Object.assign(new Error('HEALTH_STORAGE_NOT_CONFIGURED'),{status:503});
  return value;
}
async function snapshot(){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_resilience_health_snapshot`,{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(7000),
    headers:supabaseKeyHeaders(key(),{'content-type':'application/json',accept:'application/json'}),body:'{}',
  });
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||!body||typeof body!=='object')throw Object.assign(new Error('HEALTH_DATABASE_UNAVAILABLE'),{status:503});
  return body;
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  res.setHeader('cache-control','no-store');
  res.setHeader('x-dabbir-health-contract','resilience-v1');
  try{
    const health=await snapshot();
    const coreOk=health.core_ok===true;
    return json(res,coreOk?200:503,{
      ok:coreOk,
      state:String(health.state||'unknown'),
      core_ok:coreOk,
      booking_conflict_guard:health.booking_conflict_guard===true,
      recovery_guard:health.recovery_guard===true,
      queues:{
        notification_overdue:Number(health.notification_overdue||0),
        notification_stale:Number(health.notification_stale||0),
        notification_failed_or_ambiguous_1h:Number(health.notification_failed_or_ambiguous_1h||0),
        outbox_due:Number(health.outbox_due||0),
        outbox_stale:Number(health.outbox_stale||0),
        outbox_dead_24h:Number(health.outbox_dead_24h||0),
      },
      integrations:{
        calendar_connections_error:Number(health.calendar_connections_error||0),
        payment_processing_errors_1h:Number(health.payment_processing_errors_1h||0),
      },
      checked_at:health.checked_at||new Date().toISOString(),
    });
  }catch(error){
    console.error('dabbir_runtime_health_failed',{error:clean(error?.message||'HEALTH_FAILED',160)});
    return json(res,503,{ok:false,state:'critical',core_ok:false,error:'RUNTIME_HEALTH_UNAVAILABLE'});
  }
}
