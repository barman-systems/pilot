const REPO=process.env.GITHUB_REPOSITORY||'barman-systems/pilot';
const GITHUB_API='https://api.github.com';
const BROKER='https://dabbir.bmalman.com/api/barman-independent-verifier';
const AUDIENCE='barman-executive-independent-verifier';
const TOKEN=String(process.env.GITHUB_TOKEN||'');
const DABBIR_ORIGIN='https://dabbir.bmalman.com';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

class VerificationMismatch extends Error{}
class TransientVerificationError extends Error{}

async function oidc(){
  const url=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const requestToken=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!url||!requestToken)throw new TransientVerificationError('GITHUB_OIDC_UNAVAILABLE');
  const sep=url.includes('?')?'&':'?';
  const response=await fetch(`${url}${sep}audience=${encodeURIComponent(AUDIENCE)}`,{
    headers:{authorization:`bearer ${requestToken}`},signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.value)throw new TransientVerificationError(`GITHUB_OIDC_HTTP_${response.status}`);
  return payload.value;
}

async function broker(body){
  const response=await fetch(BROKER,{
    method:'POST',
    headers:{authorization:`Bearer ${await oidc()}`,'content-type':'application/json'},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(30000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.ok!==true)throw new TransientVerificationError(`BROKER_${response.status}_${clean(payload?.error||'FAILED',240)}`);
  return payload;
}

async function gh(path){
  if(!TOKEN)throw new TransientVerificationError('GITHUB_TOKEN_MISSING');
  const response=await fetch(`${GITHUB_API}/repos/${REPO}${path}`,{
    headers:{authorization:`Bearer ${TOKEN}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},
    cache:'no-store',signal:AbortSignal.timeout(20000),
  });
  const payload=await response.json().catch(()=>({}));
  if(response.status>=500||response.status===429)throw new TransientVerificationError(`GITHUB_${response.status}`);
  if(!response.ok)throw new VerificationMismatch(`GITHUB_${response.status}_${clean(payload?.message||'NOT_FOUND',200)}`);
  return payload;
}

async function publicJson(url){
  let response;
  try{response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})}
  catch(error){throw new TransientVerificationError(`PUBLIC_FETCH_${clean(error?.message||error,180)}`)}
  if(response.status>=500||response.status===429)throw new TransientVerificationError(`PUBLIC_HTTP_${response.status}`);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload)throw new VerificationMismatch(`PUBLIC_HTTP_${response.status}`);
  return payload;
}

async function publicStatus(url){
  let response;
  try{response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})}
  catch(error){throw new TransientVerificationError(`PUBLIC_FETCH_${clean(error?.message||error,180)}`)}
  if(response.status>=500||response.status===429)throw new TransientVerificationError(`PUBLIC_HTTP_${response.status}`);
  if(!response.ok)throw new VerificationMismatch(`PUBLIC_HTTP_${response.status}`);
  return response.status;
}

function assert(condition,message){if(!condition)throw new VerificationMismatch(message)}
function prNumber(reference){return /^https:\/\/github\.com\/barman-systems\/pilot\/pull\/(\d+)$/.exec(String(reference||''))?.[1]||''}
function runId(reference){return /^https:\/\/github\.com\/barman-systems\/pilot\/actions\/runs\/(\d+)(?:\/.*)?$/.exec(String(reference||''))?.[1]||''}
function sha(value){const v=String(value||'').toLowerCase();return /^[0-9a-f]{40}$/.test(v)?v:''}

async function verifyCommit(reference){
  const commitSha=sha(reference);
  assert(commitSha,'COMMIT_SHA_INVALID');
  const commit=await gh(`/commits/${commitSha}`);
  assert(String(commit?.sha||'').toLowerCase()===commitSha,'COMMIT_NOT_FOUND');
  const comparison=await gh(`/compare/${commitSha}...main`);
  assert(['ahead','identical'].includes(String(comparison?.status||'')),'COMMIT_NOT_ON_MAIN_ANCESTRY');
  return {type:'commit',sha:commitSha,status:comparison.status};
}

async function verifyEvidence(item,releaseCache){
  const type=String(item?.type||'');
  const reference=String(item?.reference||'');
  const details=item?.details&&typeof item.details==='object'&&!Array.isArray(item.details)?item.details:{};

  if(type==='artifact'){
    const number=prNumber(reference);
    assert(number,'PR_REFERENCE_DENIED');
    const pr=await gh(`/pulls/${number}`);
    assert(pr?.merged===true&&pr?.merged_at,'PR_NOT_MERGED');
    return {type,pr_number:Number(number),merge_sha:clean(pr?.merge_commit_sha,40)};
  }

  if(type==='test'){
    const id=runId(reference);
    assert(id,'WORKFLOW_REFERENCE_DENIED');
    const run=await gh(`/actions/runs/${id}`);
    assert(run?.status==='completed'&&run?.conclusion==='success','WORKFLOW_NOT_SUCCESSFUL');
    const expected=sha(details.head_sha||details.commit_sha);
    if(expected)assert(String(run?.head_sha||'').toLowerCase()===expected,'WORKFLOW_SHA_MISMATCH');
    return {type,run_id:Number(id),workflow:clean(run?.name,120),head_sha:clean(run?.head_sha,40)};
  }

  if(type==='commit')return verifyCommit(reference);

  if(type==='deployment'){
    const expected=sha(details.commit_sha);
    assert(expected,'DEPLOYMENT_SHA_INVALID');
    assert(String(details.environment||'').toLowerCase()==='production','DEPLOYMENT_ENVIRONMENT_INVALID');
    const release=releaseCache.value||(releaseCache.value=await publicJson(`${DABBIR_ORIGIN}/api/release-evidence?t=${Date.now()}`));
    assert(release?.ok===true&&String(release?.environment||'').toLowerCase()==='production','PRODUCTION_RELEASE_EVIDENCE_INVALID');
    const current=sha(release?.commit_sha);
    assert(current,'PRODUCTION_SHA_INVALID');
    if(current!==expected){
      const comparison=await gh(`/compare/${expected}...${current}`);
      assert(['ahead','identical'].includes(String(comparison?.status||'')),'PRODUCTION_NO_LONGER_DESCENDS_FROM_EXECUTOR_SHA');
    }
    return {type,expected_sha:expected,current_production_sha:current,deployment_id:clean(release?.deployment_id||reference,160)};
  }

  if(type==='url'){
    assert(reference===DABBIR_ORIGIN,'URL_REFERENCE_DENIED');
    const status=await publicStatus(reference);
    return {type,url:reference,status};
  }

  if(type==='query'){
    assert(reference==='dabbir-qa-capability','QUERY_REFERENCE_DENIED');
    const capability=await publicJson(`${DABBIR_ORIGIN}/api/qa-capability?t=${Date.now()}`);
    assert(capability?.ok===true,'QA_CAPABILITY_NOT_OK');
    assert(capability?.supabase_project_ref==='fphpoysqdsceniwduxjq','QA_DATABASE_PROJECT_MISMATCH');
    return {type,reference,project_ref:capability.supabase_project_ref};
  }

  throw new VerificationMismatch(`EVIDENCE_TYPE_UNSUPPORTED_${clean(type,80)}`);
}

let commandId='';
try{
  const claim=await broker({phase:'claim'});
  if(claim.claimed!==true){console.log('No command awaits independent verification.');process.exit(0)}
  const command=claim.command||{};
  commandId=String(command.id||'');
  const evidence=Array.isArray(command.evidence)?command.evidence:[];
  assert(commandId,'COMMAND_ID_MISSING');
  assert(evidence.length>0,'EXECUTOR_EVIDENCE_EMPTY');
  assert(!String(command.worker_id||'').startsWith('github-independent-verifier:'),'VERIFIER_EQUALS_EXECUTOR');

  const checks=[];
  const releaseCache={value:null};
  for(const item of evidence)checks.push(await verifyEvidence(item,releaseCache));

  const verified=await broker({
    phase:'verify',
    command_id:commandId,
    details:{
      verifier:'github-oidc-independent-verifier',
      executor_worker:clean(command.worker_id,120),
      execution_lane:clean(command.execution_lane,80),
      evidence_count:evidence.length,
      checks,
      verified_at:new Date().toISOString(),
    },
  });
  console.log('INDEPENDENT_VERIFICATION_PASSED',JSON.stringify({command_id:commandId,checks,verified:verified.verified||null}));
}catch(error){
  const message=clean(error?.message||error,1800);
  if(error instanceof VerificationMismatch&&commandId){
    try{
      await broker({phase:'fail',command_id:commandId,reason:message,details:{verifier:'github-oidc-independent-verifier',failed_at:new Date().toISOString()}});
      console.error('INDEPENDENT_VERIFICATION_FAILED',commandId,message);
    }catch(failError){
      console.error('INDEPENDENT_VERIFICATION_FAIL_CLOSE_ERROR',clean(failError?.message||failError,800));
    }
  }else{
    console.error('INDEPENDENT_VERIFICATION_TRANSIENT',message);
  }
  process.exitCode=1;
}
