import { timingSafeEqual } from 'node:crypto';
import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
import { syncBusinessCalendars } from './_calendar-sync-core.js';

const EXPECTED_SCHEDULE='* * * * *';
const clean=(value,max=500)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function serviceKey(){
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('RESILIENCE_STORAGE_NOT_CONFIGURED'),{status:503});
  return key;
}
function sameSecret(left,right){const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
export function cronAuthMode(req,env=process.env){
  const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);
  if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;
  return clean(env.VERCEL_ENV,32)==='production'&&clean(req.headers?.['user-agent'],120).toLowerCase()==='vercel-cron/1.0'&&clean(req.headers?.['x-vercel-cron-schedule'],120)===EXPECTED_SCHEDULE?'vercel_schedule':null;
}
async function rpc(key,name,params={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),
    headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json'}),
    body:JSON.stringify(params),
  });
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}
  if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.code||`${name.toUpperCase()}_FAILED`),{status:response.status});
  return payload;
}
async function finalize(key,job,{success,retryable=false,error=null,correlation=null}){
  return rpc(key,'dabbir_finalize_integration_job',{
    p_job_id:job.job_id,p_lock_token:job.lock_token,p_success:success,p_retryable:retryable,
    p_error:error,p_provider_correlation_id:correlation,
  });
}
function groupByBusiness(items){
  const groups=new Map();
  for(const item of items||[]){const id=String(item.business_id||'');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item)}
  return groups;
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  let key;try{key=serviceKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
  try{
    const claimed=await rpc(key,'dabbir_claim_integration_jobs',{p_limit:50});
    const jobs=Array.isArray(claimed)?claimed:[];
    const groups=groupByBusiness(jobs);
    const results=[];
    for(const [businessId,businessJobs] of groups){
      if(!businessJobs.every(job=>job.destination==='calendar_sync')){
        for(const job of businessJobs){const state=await finalize(key,job,{success:false,retryable:false,error:'UNSUPPORTED_OUTBOX_DESTINATION'});results.push({job_id:job.job_id,state})}
        continue;
      }
      try{
        const sync=await syncBusinessCalendars(req,businessId);
        const failures=(sync||[]).filter(item=>item.ok===false);
        if(failures.length){
          const retryable=failures.some(item=>item.retryable===true);
          const error=clean(failures.map(item=>`${item.provider||'calendar'}:${item.error||'failed'}`).join('|'),500);
          for(const job of businessJobs){const state=await finalize(key,job,{success:false,retryable,error});results.push({job_id:job.job_id,state,retryable})}
        }else{
          const correlation=`calendar:${businessId}:${Date.now()}`;
          for(const job of businessJobs){const state=await finalize(key,job,{success:true,correlation});results.push({job_id:job.job_id,state})}
        }
      }catch(error){
        const code=clean(error?.message||'CALENDAR_RETRY_WORKER_FAILED',300);
        const retryable=error?.retryable===true||Number(error?.code||error?.status||0)>=500;
        for(const job of businessJobs){const state=await finalize(key,job,{success:false,retryable,error:code}).catch(()=>null);results.push({job_id:job.job_id,state:state||'finalize_failed',retryable})}
      }
    }
    const cleanup=await rpc(key,'dabbir_cleanup_resilience_state',{}).catch(()=>null);
    let recovery=null;
    if(new Date().getUTCMinutes()===0){
      recovery=await rpc(key,'dabbir_owner_recovery_maintenance_v1',{}).catch(error=>({ok:false,error:clean(error?.message||'RECOVERY_DRY_RUN_FAILED',200)}));
    }
    const summary={ok:true,claimed:jobs.length,businesses:groups.size,succeeded:results.filter(x=>x.state==='succeeded').length,retry:results.filter(x=>x.state==='retry').length,dead:results.filter(x=>x.state==='dead').length,cleanup,recovery};
    console.info('dabbir_resilience_worker',{auth_mode:authMode,...summary});
    return json(res,200,summary);
  }catch(error){
    const code=clean(error?.message||'RESILIENCE_WORKER_FAILED',240);console.error('dabbir_resilience_worker_failed',{error:code});return json(res,500,{ok:false,error:code});
  }
}
