import fs from 'node:fs';

const API='https://api.github.com';
const DEFAULT_POLL_MS=15_000;
const DEFAULT_TIMEOUT_MS=50*60_000;

export const STATUS_CONTEXT='BARMAN Independent Pre-Merge Gate';
export const REQUIRED_WORKFLOWS=Object.freeze(['DABBIR CI','DABBIR Security Gate']);

const clean=value=>String(value??'').trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function isProtectedTrustPath(path){
  const value=clean(path);
  if(!value)return false;
  if(value.startsWith('.github/'))return true;
  return new Set([
    'scripts/barman-independent-premerge-gate.mjs',
    'scripts/barman-tool-agent.mjs',
    'api/barman-tool-agent-broker.js',
    'scripts/dabbir-required-pr-gates.mjs',
    'scripts/dabbir-security-gate.mjs',
  ]).has(value);
}

export function validatePullRequestShape(pr,repository){
  if(!pr||typeof pr!=='object')throw new Error('PREMERGE_PR_MISSING');
  if(pr.draft===true)throw new Error('PREMERGE_DRAFT_BLOCKED');
  if(clean(pr?.base?.ref)!=='main')throw new Error('PREMERGE_BASE_NOT_MAIN');
  if(clean(pr?.base?.repo?.full_name)!==repository)throw new Error('PREMERGE_BASE_REPO_MISMATCH');
  if(clean(pr?.head?.repo?.full_name)!==repository)throw new Error('PREMERGE_FORK_DENIED');
  const number=Number(pr.number||0);
  const headSha=clean(pr?.head?.sha).toLowerCase();
  const baseSha=clean(pr?.base?.sha).toLowerCase();
  const headRef=clean(pr?.head?.ref);
  if(!number||!/^[0-9a-f]{40}$/.test(headSha)||!/^[0-9a-f]{40}$/.test(baseSha)||!headRef){
    throw new Error('PREMERGE_IDENTITY_INCOMPLETE');
  }
  return {number,headSha,baseSha,headRef};
}

async function githubJson(repository,path,token,{method='GET',body}={}){
  const response=await fetch(`${API}/repos/${repository}${path}`,{
    method,
    headers:{
      accept:'application/vnd.github+json',
      authorization:`Bearer ${token}`,
      'x-github-api-version':'2022-11-28',
      ...(body===undefined?{}:{'content-type':'application/json'}),
    },
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(30_000),
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok)throw new Error(`GITHUB_${response.status}_${clean(payload?.message||text).slice(0,240)}`);
  return payload;
}

async function setStatus({repository,token,sha,state,description,targetUrl}){
  return githubJson(repository,`/statuses/${sha}`,token,{
    method:'POST',
    body:{state,context:STATUS_CONTEXT,description:clean(description).slice(0,140),target_url:targetUrl},
  });
}

async function getPullRequest(repository,number,token){
  return githubJson(repository,`/pulls/${Number(number)}`,token);
}

async function getPullRequestFiles(repository,number,token){
  const out=[];
  for(let page=1;page<=10;page+=1){
    const rows=await githubJson(repository,`/pulls/${Number(number)}/files?per_page=100&page=${page}`,token);
    if(!Array.isArray(rows))throw new Error('PREMERGE_FILES_INVALID');
    out.push(...rows.map(row=>clean(row?.filename)).filter(Boolean));
    if(rows.length<100)break;
  }
  return out;
}

async function assertHeadContainsBase({repository,token,baseSha,headSha}){
  const result=await githubJson(repository,`/compare/${baseSha}...${headSha}`,token);
  const behind=Number(result?.behind_by??-1);
  if(!Number.isFinite(behind)||behind!==0){
    throw new Error(`PREMERGE_HEAD_BEHIND_BASE:${behind}`);
  }
  return result;
}

function matchingRun(runs,{workflowName,headSha,prNumber}){
  return (Array.isArray(runs)?runs:[])
    .filter(run=>clean(run?.name)===workflowName)
    .filter(run=>clean(run?.head_sha).toLowerCase()===headSha.toLowerCase())
    .filter(run=>Array.isArray(run?.pull_requests)&&run.pull_requests.some(pr=>Number(pr?.number)===Number(prNumber)))
    .sort((a,b)=>Number(b?.run_number||0)-Number(a?.run_number||0))[0]||null;
}

async function waitRequiredWorkflows({repository,token,headRef,headSha,prNumber,pollMs,timeoutMs}){
  const deadline=Date.now()+timeoutMs;
  const passed=new Map();
  while(Date.now()<deadline){
    const data=await githubJson(repository,`/actions/runs?event=pull_request&branch=${encodeURIComponent(headRef)}&per_page=100`,token);
    for(const workflowName of REQUIRED_WORKFLOWS){
      if(passed.has(workflowName))continue;
      const run=matchingRun(data?.workflow_runs,{workflowName,headSha,prNumber});
      if(!run){
        console.log(`BARMAN_PREMERGE_WAIT workflow=${workflowName} state=NOT_STARTED sha=${headSha}`);
        continue;
      }
      if(clean(run.status)==='completed'){
        const conclusion=clean(run.conclusion).toLowerCase();
        if(conclusion!=='success')throw new Error(`PREMERGE_REQUIRED_WORKFLOW_FAILED:${workflowName}:${conclusion||'UNKNOWN'}:run=${run.id}`);
        passed.set(workflowName,run);
        console.log(`BARMAN_PREMERGE_WORKFLOW_PASS workflow=${workflowName} run=${run.id} sha=${headSha}`);
      }else{
        console.log(`BARMAN_PREMERGE_WAIT workflow=${workflowName} state=${clean(run.status)||'UNKNOWN'} run=${run.id}`);
      }
    }
    if(passed.size===REQUIRED_WORKFLOWS.length)return passed;
    await sleep(pollMs);
  }
  throw new Error(`PREMERGE_REQUIRED_WORKFLOW_TIMEOUT:${headSha}`);
}

async function verifyPullRequest({repository,token,prNumber,targetUrl,pollMs,timeoutMs}){
  let statusIdentity=null;
  try{
    const initial=await getPullRequest(repository,prNumber,token);
    const identity=validatePullRequestShape(initial,repository);
    statusIdentity=identity;
    await setStatus({repository,token,sha:identity.headSha,state:'pending',description:'Independent pre-merge verification in progress',targetUrl});

    const files=await getPullRequestFiles(repository,identity.number,token);
    const protectedPaths=files.filter(isProtectedTrustPath);
    if(protectedPaths.length){
      throw new Error(`PREMERGE_TRUST_ROOT_CHANGE_REQUIRES_OWNER:${protectedPaths.join(',')}`);
    }

    await assertHeadContainsBase({repository,token,baseSha:identity.baseSha,headSha:identity.headSha});
    await waitRequiredWorkflows({repository,token,headRef:identity.headRef,headSha:identity.headSha,prNumber:identity.number,pollMs,timeoutMs});

    const finalPr=await getPullRequest(repository,identity.number,token);
    const finalIdentity=validatePullRequestShape(finalPr,repository);
    if(finalIdentity.headSha!==identity.headSha)throw new Error('PREMERGE_HEAD_CHANGED_DURING_VERIFY');
    if(finalIdentity.baseSha!==identity.baseSha)throw new Error('PREMERGE_BASE_CHANGED_DURING_VERIFY');
    await assertHeadContainsBase({repository,token,baseSha:finalIdentity.baseSha,headSha:finalIdentity.headSha});

    await setStatus({repository,token,sha:identity.headSha,state:'success',description:`Independent gate passed for exact head; base ${identity.baseSha.slice(0,7)}`,targetUrl});
    console.log(`BARMAN_INDEPENDENT_PREMERGE_PASS pr=${identity.number} head=${identity.headSha} base=${identity.baseSha}`);
    return {identity,files};
  }catch(error){
    if(statusIdentity?.headSha){
      try{
        await setStatus({repository,token,sha:statusIdentity.headSha,state:'failure',description:clean(error?.message||error).slice(0,120),targetUrl});
      }catch(statusError){
        console.error('PREMERGE_FAILURE_STATUS_WRITE_FAILED',statusError?.message||statusError);
      }
    }
    throw error;
  }
}

async function invalidateOpenPullRequests({repository,token,targetUrl}){
  let invalidated=0;
  for(let page=1;page<=10;page+=1){
    const rows=await githubJson(repository,`/pulls?state=open&per_page=100&page=${page}`,token);
    if(!Array.isArray(rows))throw new Error('PREMERGE_OPEN_PRS_INVALID');
    for(const pr of rows){
      if(clean(pr?.head?.repo?.full_name)!==repository)continue;
      const sha=clean(pr?.head?.sha).toLowerCase();
      if(!/^[0-9a-f]{40}$/.test(sha))continue;
      await setStatus({repository,token,sha,state:'pending',description:'main changed; update branch and re-run independent gate',targetUrl});
      invalidated+=1;
    }
    if(rows.length<100)break;
  }
  console.log(`BARMAN_PREMERGE_INVALIDATED_OPEN_PRS count=${invalidated}`);
  return invalidated;
}

export async function run({env=process.env}={}){
  const token=clean(env.GITHUB_TOKEN);
  const repository=clean(env.GITHUB_REPOSITORY);
  const eventName=clean(env.GITHUB_EVENT_NAME);
  const eventPath=clean(env.GITHUB_EVENT_PATH);
  const targetUrl=clean(env.BARMAN_PREMERGE_TARGET_URL||`${env.GITHUB_SERVER_URL||'https://github.com'}/${repository}/actions/runs/${env.GITHUB_RUN_ID||''}`);
  if(!token||!repository||!eventName)throw new Error('PREMERGE_ENV_MISSING');

  if(eventName==='push'){
    return invalidateOpenPullRequests({repository,token,targetUrl});
  }
  if(!['pull_request_target','workflow_dispatch'].includes(eventName))throw new Error(`PREMERGE_EVENT_DENIED:${eventName}`);
  if(!eventPath)throw new Error('PREMERGE_EVENT_PATH_MISSING');
  const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
  const prNumber=Number(env.BARMAN_PREMERGE_PR_NUMBER||event?.pull_request?.number||event?.inputs?.pr_number||0);
  if(!prNumber)throw new Error('PREMERGE_PR_NUMBER_MISSING');
  const pollMs=Math.max(1_000,Number(env.BARMAN_PREMERGE_POLL_MS||DEFAULT_POLL_MS));
  const timeoutMs=Math.max(60_000,Number(env.BARMAN_PREMERGE_TIMEOUT_MS||DEFAULT_TIMEOUT_MS));
  return verifyPullRequest({repository,token,prNumber,targetUrl,pollMs,timeoutMs});
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  run().catch(error=>{console.error(error?.stack||error);process.exitCode=1});
}
