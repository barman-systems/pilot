import { timingSafeEqual } from 'node:crypto';
import { json } from './_auth-core.js';
import { adminRpc, notifyTelegram, observeDabbirLive, runtimeEvidence, serviceRoleKey, telegramRoute } from './_barman-executive-core.js';
import { planExecutiveCommand, readOnlyAnswer } from './_barman-executive-automation.js';

const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function sameSecret(left,right){const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
export function cronAuthMode(req,env=process.env){
  const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);
  if(!secret)return null;
  return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;
}

function report(snapshot){
  const state=snapshot.healthy?'سليم':'يحتاج تدخل';
  return `نفّذ BARMAN فحصاً حياً لـ DABBIR. الحالة: ${state}. الموقع HTTP ${snapshot.site.status}، قاعدة البيانات ${snapshot.database.project_ref}، commit ${snapshot.commit_sha.slice(0,12)}، المنطقة ${snapshot.region}.`;
}

async function observeExecutiveReality(key){
  const snapshot=await observeDabbirLive();
  const evidence=runtimeEvidence(snapshot);
  const confidence=snapshot.healthy?1:0.7;
  const persisted=await adminRpc(key,'barman_executive_observe_v1',{
    p_observation:{
      source:'vercel-executive-cron',
      subject:'DABBIR production reality',
      observed_at:snapshot.observed_at,
      freshness:'FRESH',
      confidence,
      evidence_refs:evidence,
      snapshot,
    },
  });
  return {snapshot,persisted};
}

async function notify(key,commandId,text){
  const route=await telegramRoute(key,commandId).catch(()=>null);
  return notifyTelegram(route,text).catch(()=>null);
}

async function finalizeRetry(key,claim,error,prefix){
  const command=claim.command||{},commandId=String(command.id||''),message=clean(error?.message||error,1000);
  const attempts=Number(command.attempt_count||0);
  const permanent=/PLAN_OWNER_GATE_REQUIRED|PLAN_TASKS_INVALID|PLAN_TASK_TEXT_INVALID/.test(message);
  const outcome=permanent||attempts>=3?'BLOCKED':'RETRY';
  const summary=permanent
    ?'توقف BARMAN عند حد صلاحية أو خطة غير آمنة، ولم يتجاوز الحاجز.'
    :`${prefix} وسيعاد تلقائيًا ضمن حد المحاولات.`;
  await adminRpc(key,'barman_executive_finalize_v1',{
    p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_outcome:outcome,
    p_summary:summary,p_evidence:[],p_error:message,
  }).catch(()=>null);
  if(outcome==='BLOCKED')await notify(key,commandId,`${summary}\n\nالسبب: ${message}`).catch(()=>null);
  return {claimed:true,lane:String(command.execution_lane||''),command_id:commandId,outcome,error:message};
}

async function executeRuntime(key){
  const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:'vercel-runtime-worker',p_lane:'runtime',p_lease_seconds:300});
  if(claim?.claimed!==true)return {claimed:false,lane:'runtime',reason:claim?.reason||'NO_WORK'};
  const command=claim.command||{},commandId=String(command.id||'');
  try{
    const snapshot=await observeDabbirLive();
    const evidence=runtimeEvidence(snapshot),summary=report(snapshot),outcome=snapshot.healthy?'DONE':'BLOCKED';
    await adminRpc(key,'barman_executive_finalize_v1',{
      p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_outcome:outcome,
      p_summary:summary,p_evidence:evidence,p_error:snapshot.healthy?null:'DABBIR_LIVE_HEALTH_CHECK_FAILED',
    });
    await notify(key,commandId,`${summary}\n\nالحالة: ${outcome} — تم تسجيل ACTION → ARTIFACT → TEST → EVIDENCE.`);
    return {claimed:true,lane:'runtime',command_id:commandId,outcome,evidence_count:evidence.length,decision_id:claim.decision_id,goal_id:claim.goal_id};
  }catch(error){return finalizeRetry(key,claim,error,'فشل تنفيذ الفحص الحي')}
}

async function executePlanner(key){
  const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:'vercel-ceo-planner',p_lane:'planner',p_lease_seconds:300});
  if(claim?.claimed!==true)return {claimed:false,lane:'planner',reason:claim?.reason||'NO_WORK'};
  const command=claim.command||{},commandId=String(command.id||'');
  try{
    const plan=await planExecutiveCommand(command.command_text);
    const decomposed=await adminRpc(key,'barman_executive_decompose_v1',{
      p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_tasks:plan.tasks,
    });
    const count=Number(decomposed?.child_count||plan.tasks.length);
    const summary=`حوّل BARMAN الهدف إلى ${count} مهام تنفيذية مستقلة. التنفيذ سيستمر حسب نوع كل مهمة، ولن تعتبر المهمة مكتملة قبل التحقق.`;
    await notify(key,commandId,summary);
    return {claimed:true,lane:'planner',command_id:commandId,outcome:'PLANNED',child_count:count,planner:plan.source,decision_id:claim.decision_id,goal_id:claim.goal_id};
  }catch(error){return finalizeRetry(key,claim,error,'تعذر إنشاء خطة تنفيذ صالحة')}
}

async function executeReadOnly(key){
  const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:'vercel-read-only-worker',p_lane:'read_only',p_lease_seconds:180});
  if(claim?.claimed!==true)return {claimed:false,lane:'read_only',reason:claim?.reason||'NO_WORK'};
  const command=claim.command||{},commandId=String(command.id||'');
  try{
    const snapshot=await adminRpc(key,'barman_executive_read_snapshot_v1',{});
    const answer=readOnlyAnswer(command.command_text,snapshot||{});
    const evidence=[{
      type:'query',reference:'barman-executive-snapshot-v1',verified:true,
      details:{metric:answer.metric,expected:answer.expected,generated_at:snapshot?.generated_at||new Date().toISOString(),produced_by:'vercel-read-only-worker'},
    }];
    await adminRpc(key,'barman_executive_finalize_v1',{
      p_command_id:commandId,p_run_id:claim.run_id,p_action_id:claim.action_id,p_outcome:'DONE',
      p_summary:answer.summary,p_evidence:evidence,p_error:null,
    });
    await notify(key,commandId,`${answer.summary}\n\nتمت القراءة من المصدر التشغيلي، والتحقق المستقل سيعيد فحص الدليل.`);
    return {claimed:true,lane:'read_only',command_id:commandId,outcome:'DONE',metric:answer.metric,evidence_count:1,decision_id:claim.decision_id,goal_id:claim.goal_id};
  }catch(error){return finalizeRetry(key,claim,error,'فشل منفذ القراءة')}
}

export async function executeExecutiveCycle(key){
  const results=[];
  for(const worker of [executePlanner,executeReadOnly,executeRuntime]){
    const result=await worker(key);
    if(result.claimed)results.push(result);
  }
  return results;
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  let key;try{key=serviceRoleKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
  try{
    const reality=await observeExecutiveReality(key);
    const results=await executeExecutiveCycle(key);
    const summary={
      ok:true,
      reality:{
        health_check_id:reality.persisted?.health_check_id,
        observed_at:reality.persisted?.observed_at,
        freshness:reality.persisted?.freshness,
        confidence:reality.persisted?.confidence,
        production_commit:reality.snapshot?.commit_sha,
      },
      claimed:results.length,
      planned:results.filter(x=>x.outcome==='PLANNED').length,
      done:results.filter(x=>x.outcome==='DONE').length,
      blocked:results.filter(x=>x.outcome==='BLOCKED').length,
      retry:results.filter(x=>x.outcome==='RETRY').length,
      results,
    };
    console.info('barman_executive_cron',{auth_mode:authMode,...summary});
    return json(res,200,summary);
  }catch(error){const message=clean(error?.message||error,500);console.error('barman_executive_cron_failed',{error:message});return json(res,500,{ok:false,error:message})}
}
