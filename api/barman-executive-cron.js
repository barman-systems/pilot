import { timingSafeEqual } from 'node:crypto';
import { json } from './_auth-core.js';
import { adminRpc, notifyTelegram, observeDabbirLive, runtimeEvidence, serviceRoleKey, telegramRoute } from './_barman-executive-core.js';

const EXPECTED_SCHEDULE='*/5 * * * *';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function sameSecret(left,right){const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
export function cronAuthMode(req,env=process.env){
  const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);
  if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;
  return clean(env.VERCEL_ENV,32)==='production'&&clean(req.headers?.['user-agent'],120).toLowerCase()==='vercel-cron/1.0'&&clean(req.headers?.['x-vercel-cron-schedule'],120)===EXPECTED_SCHEDULE?'vercel_schedule':null;
}

function report(snapshot){
  const state=snapshot.healthy?'سليم':'يحتاج تدخل';
  return `نفّذ BARMAN فحصاً حياً لـ DABBIR. الحالة: ${state}. الموقع HTTP ${snapshot.site.status}، قاعدة البيانات ${snapshot.database.project_ref}، commit ${snapshot.commit_sha.slice(0,12)}، المنطقة ${snapshot.region}.`;
}

async function executeOne(key){
  const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:'vercel-runtime-worker',p_lane:'runtime',p_lease_seconds:300});
  if(claim?.claimed!==true)return {claimed:false};
  const command=claim.command||{},commandId=String(command.id||'');
  try{
    const snapshot=await observeDabbirLive();
    const evidence=runtimeEvidence(snapshot),summary=report(snapshot),outcome=snapshot.healthy?'DONE':'BLOCKED';
    await adminRpc(key,'barman_executive_finalize_v1',{
      p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_outcome:outcome,
      p_summary:summary,p_evidence:evidence,p_error:snapshot.healthy?null:'DABBIR_LIVE_HEALTH_CHECK_FAILED',
    });
    const route=await telegramRoute(key,commandId).catch(()=>null);
    await notifyTelegram(route,`${summary}\n\nالحالة: ${outcome} — تم تسجيل ACTION → ARTIFACT → TEST → EVIDENCE.`).catch(()=>null);
    return {claimed:true,command_id:commandId,outcome,evidence_count:evidence.length};
  }catch(error){
    const message=clean(error?.message||error,1000);
    await adminRpc(key,'barman_executive_finalize_v1',{
      p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_outcome:'RETRY',
      p_summary:'فشل تنفيذ الفحص الحي وسيعاد بعد معالجة السبب.',p_evidence:[],p_error:message,
    }).catch(()=>null);
    return {claimed:true,command_id:commandId,outcome:'RETRY',error:message};
  }
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  let key;try{key=serviceRoleKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
  const results=[];
  try{
    for(let i=0;i<3;i+=1){const result=await executeOne(key);if(!result.claimed)break;results.push(result)}
    const summary={ok:true,claimed:results.length,done:results.filter(x=>x.outcome==='DONE').length,blocked:results.filter(x=>x.outcome==='BLOCKED').length,retry:results.filter(x=>x.outcome==='RETRY').length,results};
    console.info('barman_executive_cron',{auth_mode:authMode,...summary});
    return json(res,200,summary);
  }catch(error){const message=clean(error?.message||error,500);console.error('barman_executive_cron_failed',{error:message});return json(res,500,{ok:false,error:message})}
}
