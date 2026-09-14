import { timingSafeEqual } from 'node:crypto';
import { json } from './_auth-core.js';
import { runAiProviderRecovery } from './_ai-provider-recovery.js';

const clean=(value,max=400)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function sameSecret(left,right){const a=Buffer.from(String(left||''));const b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
export function cronAuthMode(req,env=process.env){const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;return null}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const mode=cronAuthMode(req);
  if(!mode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  try{
    const result=await runAiProviderRecovery();
    console.info('dabbir_ai_provider_recovery',{state:result.state,configured_targets:result.configured_targets,network_probes:result.network_probes,skipped:result.skipped,succeeded:result.succeeded,failed:result.failed,auth_mode:mode});
    return json(res,200,{ok:true,...result});
  }catch(error){
    const code=clean(error?.code||error?.message||error,160)||'AI_PROVIDER_RECOVERY_FAILED';
    console.error('dabbir_ai_provider_recovery_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}
