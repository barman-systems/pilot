import fs from 'node:fs';

const API='https://api.github.com';
const CONFIG_URL=new URL('../dabbir-release-closure.json',import.meta.url);
const clean=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];

export function validateReleaseClosureConfig(input){
  const config=input&&typeof input==='object'?input:null;
  if(!config)throw new Error('RELEASE_CLOSURE_CONFIG_INVALID');
  if(Number(config.version)!==1)throw new Error('RELEASE_CLOSURE_CONFIG_VERSION_INVALID');
  if(typeof config.active!=='boolean')throw new Error('RELEASE_CLOSURE_ACTIVE_INVALID');
  if(!Number.isInteger(Number(config.closure_issue))||Number(config.closure_issue)<=0)throw new Error('RELEASE_CLOSURE_ISSUE_INVALID');
  const control=clean(config.control_head_ref);
  if(config.active&&!control)throw new Error('RELEASE_CLOSURE_CONTROL_REF_REQUIRED');
  const exact=arr(config.allowed_head_refs).map(clean).filter(Boolean);
  const prefixes=arr(config.allowed_head_prefixes).map(clean).filter(Boolean);
  if(exact.some(ref=>ref==='main'||ref.includes('*')))throw new Error('RELEASE_CLOSURE_ALLOWED_REF_UNSAFE');
  if(prefixes.some(prefix=>!prefix||prefix==='/'||prefix==='main'))throw new Error('RELEASE_CLOSURE_ALLOWED_PREFIX_UNSAFE');
  return {
    ...config,
    control_head_ref:control,
    control_title_prefix:clean(config.control_title_prefix),
    control_allowed_paths:arr(config.control_allowed_paths).map(clean).filter(Boolean),
    allowed_head_refs:exact,
    allowed_head_prefixes:prefixes,
    guardian_title_prefix:clean(config.guardian_title_prefix),
  };
}

export function evaluateReleaseClosure({config:rawConfig,pr,files=[]}={}){
  const config=validateReleaseClosureConfig(rawConfig);
  if(config.active!==true)return {allowed:true,reason:'RELEASE_CLOSURE_INACTIVE'};
  if(!pr||typeof pr!=='object')return {allowed:false,reason:'RELEASE_CLOSURE_PR_MISSING'};

  const number=Number(pr.number||0);
  const baseRef=clean(pr?.base?.ref);
  const baseRepo=clean(pr?.base?.repo?.full_name);
  const headRef=clean(pr?.head?.ref);
  const headRepo=clean(pr?.head?.repo?.full_name);
  const title=clean(pr?.title);
  if(!number||!headRef)return {allowed:false,reason:'RELEASE_CLOSURE_PR_IDENTITY_INCOMPLETE'};
  if(baseRef!=='main')return {allowed:false,reason:'RELEASE_CLOSURE_BASE_NOT_MAIN',number,headRef};
  if(!baseRepo||headRepo!==baseRepo)return {allowed:false,reason:'RELEASE_CLOSURE_FORK_DENIED',number,headRef};

  if(headRef===config.control_head_ref){
    if(!config.control_title_prefix||!title.startsWith(config.control_title_prefix)){
      return {allowed:false,reason:'RELEASE_CLOSURE_CONTROL_TITLE_DENIED',number,headRef};
    }
    const allowedPaths=new Set(config.control_allowed_paths);
    const changed=arr(files).map(clean).filter(Boolean);
    if(!changed.length)return {allowed:false,reason:'RELEASE_CLOSURE_CONTROL_FILES_REQUIRED',number,headRef};
    const denied=changed.filter(path=>!allowedPaths.has(path));
    if(denied.length)return {allowed:false,reason:'RELEASE_CLOSURE_CONTROL_PATH_DENIED',number,headRef,deniedPaths:denied};
    return {allowed:true,reason:'RELEASE_CLOSURE_CONTROL_ALLOWED',number,headRef};
  }

  if(config.allowed_head_refs.includes(headRef)){
    return {allowed:true,reason:'RELEASE_CLOSURE_LANE_ALLOWED',number,headRef};
  }

  for(const prefix of config.allowed_head_prefixes){
    if(!headRef.startsWith(prefix))continue;
    if(prefix==='guardian/revert-'&&config.guardian_title_prefix&&!title.startsWith(config.guardian_title_prefix)){
      return {allowed:false,reason:'RELEASE_CLOSURE_GUARDIAN_TITLE_DENIED',number,headRef};
    }
    return {allowed:true,reason:'RELEASE_CLOSURE_PREFIX_ALLOWED',number,headRef};
  }

  return {allowed:false,reason:'RELEASE_CLOSURE_HEAD_REF_DENIED',number,headRef};
}

function readConfig(){
  return validateReleaseClosureConfig(JSON.parse(fs.readFileSync(CONFIG_URL,'utf8')));
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
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok){
    const error=Object.assign(new Error(`GITHUB_${response.status}_${clean(payload?.message||text).slice(0,200)}`),{status:response.status});
    throw error;
  }
  return payload;
}

async function getPullRequest(repository,number,token){
  return githubJson(repository,`/pulls/${Number(number)}`,token);
}

async function getPullRequestFiles(repository,number,token){
  const out=[];
  for(let page=1;page<=10;page+=1){
    const rows=await githubJson(repository,`/pulls/${Number(number)}/files?per_page=100&page=${page}`,token);
    if(!Array.isArray(rows))throw new Error('RELEASE_CLOSURE_FILES_INVALID');
    out.push(...rows.map(row=>clean(row?.filename)).filter(Boolean));
    if(rows.length<100)break;
  }
  return out;
}

async function cancelBranchRuns(repository,headRef,token,currentRunId){
  const data=await githubJson(repository,`/actions/runs?branch=${encodeURIComponent(headRef)}&per_page=100`,token);
  let cancelled=0;
  for(const run of arr(data?.workflow_runs)){
    if(String(run?.id||'')===String(currentRunId||''))continue;
    if(!['queued','in_progress','waiting','pending','requested'].includes(clean(run?.status)))continue;
    try{
      await githubJson(repository,`/actions/runs/${run.id}/cancel`,token,{method:'POST'});
      cancelled+=1;
    }catch(error){
      if(Number(error?.status)!==409)console.warn(`RELEASE_CLOSURE_CANCEL_WARN run=${run?.id} error=${clean(error?.message)}`);
    }
  }
  return cancelled;
}

async function closeUnauthorized({repository,token,pr,decision,currentRunId}){
  const number=Number(pr?.number||decision?.number||0);
  const headRef=clean(pr?.head?.ref||decision?.headRef);
  if(!number)throw new Error('RELEASE_CLOSURE_CLOSE_PR_NUMBER_MISSING');
  const cancelled=headRef?await cancelBranchRuns(repository,headRef,token,currentRunId).catch(()=>0):0;
  if(clean(pr?.state)!=='closed'){
    await githubJson(repository,`/pulls/${number}`,token,{method:'PATCH',body:{state:'closed'}});
  }
  console.log(`DABBIR_RELEASE_CLOSURE_AUTO_CLOSED pr=${number} head=${headRef||'unknown'} reason=${decision.reason} cancelled_runs=${cancelled}`);
  return {number,headRef,reason:decision.reason,cancelled};
}

async function evaluatePr({repository,token,config,pr,currentRunId,close=true}){
  let files=[];
  if(clean(pr?.head?.ref)===config.control_head_ref)files=await getPullRequestFiles(repository,pr.number,token);
  const decision=evaluateReleaseClosure({config,pr,files});
  if(decision.allowed){
    console.log(`DABBIR_RELEASE_CLOSURE_ALLOW pr=${pr.number} head=${clean(pr?.head?.ref)} reason=${decision.reason}`);
    return decision;
  }
  if(close){
    const closed=await closeUnauthorized({repository,token,pr,decision,currentRunId});
    return {...decision,closed:true,cancelled:closed.cancelled};
  }
  return decision;
}

async function sweepOpenPullRequests({repository,token,config,currentRunId}){
  let inspected=0,closed=0;
  for(let page=1;page<=10;page+=1){
    const rows=await githubJson(repository,`/pulls?state=open&per_page=100&page=${page}`,token);
    if(!Array.isArray(rows))throw new Error('RELEASE_CLOSURE_OPEN_PRS_INVALID');
    for(const pr of rows){
      inspected+=1;
      const decision=await evaluatePr({repository,token,config,pr,currentRunId,close:true});
      if(!decision.allowed)closed+=1;
    }
    if(rows.length<100)break;
  }
  console.log(`DABBIR_RELEASE_CLOSURE_SWEEP inspected=${inspected} auto_closed=${closed}`);
  return {inspected,closed};
}

export async function runReleaseClosureGuard({env=process.env}={}){
  const config=readConfig();
  if(config.active!==true){console.log('DABBIR_RELEASE_CLOSURE_INACTIVE');return {active:false};}
  const repository=clean(env.GITHUB_REPOSITORY);
  const token=clean(env.GITHUB_TOKEN);
  const eventName=clean(env.GITHUB_EVENT_NAME);
  const eventPath=clean(env.GITHUB_EVENT_PATH);
  const currentRunId=clean(env.GITHUB_RUN_ID);
  if(!repository||!token||!eventName)throw new Error('RELEASE_CLOSURE_ENV_MISSING');

  if(eventName==='push'||eventName==='workflow_run'){
    return sweepOpenPullRequests({repository,token,config,currentRunId});
  }
  if(!['pull_request_target','workflow_dispatch'].includes(eventName))throw new Error(`RELEASE_CLOSURE_EVENT_DENIED:${eventName}`);

  let pr=null;
  if(eventPath){
    const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
    pr=event?.pull_request||null;
  }
  const number=Number(env.RELEASE_CLOSURE_PR_NUMBER||env.BARMAN_PREMERGE_PR_NUMBER||pr?.number||0);
  if(!pr&&number)pr=await getPullRequest(repository,number,token);
  if(!pr)throw new Error('RELEASE_CLOSURE_PR_MISSING');

  const decision=await evaluatePr({repository,token,config,pr,currentRunId,close:true});
  if(!decision.allowed&&decision.closed!==true){
    throw new Error(`${decision.reason}:pr=${pr.number}:head=${clean(pr?.head?.ref)}`);
  }
  return decision;
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  runReleaseClosureGuard().catch(error=>{console.error(error?.stack||error);process.exitCode=1});
}
