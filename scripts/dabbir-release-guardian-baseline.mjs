const FAILURE_CONCLUSIONS=new Set(['failure','timed_out','cancelled','action_required','startup_failure']);

export function decideRollbackBaseline({failedRun,history}){
  const failedSha=String(failedRun?.head_sha||'');
  const failedWorkflow=String(failedRun?.name||'');
  const failedId=Number(failedRun?.id||0);
  const previous=(Array.isArray(history)?history:[]).find(run=>
    Number(run?.id||0)!==failedId &&
    String(run?.name||'')===failedWorkflow &&
    String(run?.head_branch||'')==='main' &&
    String(run?.event||'')==='push' &&
    String(run?.status||'')==='completed' &&
    String(run?.head_sha||'')!==failedSha
  );
  if(!previous)return {eligible:false,reason:'NO_DISTINCT_BASELINE'};
  const conclusion=String(previous?.conclusion||'');
  if(conclusion!=='success')return {eligible:false,reason:'BASELINE_NOT_GREEN',baseline_run_id:Number(previous.id),baseline_sha:String(previous.head_sha||''),baseline_conclusion:conclusion};
  return {eligible:true,reason:'NEW_REGRESSION_AFTER_GREEN_BASELINE',baseline_run_id:Number(previous.id),baseline_sha:String(previous.head_sha||''),baseline_conclusion:conclusion};
}

async function githubJson(path,token){
  const response=await fetch(`https://api.github.com${path}`,{
    headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'DABBIR-Release-Guardian'},
    signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`GITHUB_HTTP_${response.status}_${String(payload?.message||'FAILED').slice(0,160)}`);
  return payload;
}

async function main(){
  const repo=String(process.env.GITHUB_REPOSITORY||'');
  const token=String(process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'');
  const runId=Number(process.env.FAILED_RUN_ID||0);
  if(!repo||!token||!runId)throw new Error('GUARDIAN_BASELINE_INPUT_MISSING');
  const failedRun=await githubJson(`/repos/${repo}/actions/runs/${runId}`,token);
  const conclusion=String(failedRun?.conclusion||'');
  if(!FAILURE_CONCLUSIONS.has(conclusion))throw new Error(`GUARDIAN_FAILED_CONCLUSION_INVALID_${conclusion||'EMPTY'}`);
  const list=await githubJson(`/repos/${repo}/actions/runs?branch=main&event=push&status=completed&per_page=100`,token);
  const decision=decideRollbackBaseline({failedRun,history:list?.workflow_runs||[]});
  const output=String(process.env.GITHUB_OUTPUT||'');
  const lines=[
    `eligible=${decision.eligible?'true':'false'}`,
    `reason=${decision.reason}`,
    `baseline_run_id=${decision.baseline_run_id||''}`,
    `baseline_sha=${decision.baseline_sha||''}`,
    `baseline_conclusion=${decision.baseline_conclusion||''}`,
  ].join('\n')+'\n';
  if(output){const {appendFile}=await import('node:fs/promises');await appendFile(output,lines)}
  console.log(JSON.stringify({failed_run_id:runId,failed_workflow:failedRun?.name,failed_sha:failedRun?.head_sha,failed_conclusion:conclusion,...decision}));
}

if(import.meta.url===`file://${process.argv[1]}`){
  main().catch(error=>{console.error(String(error?.stack||error));process.exitCode=1});
}
