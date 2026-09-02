import fs from 'node:fs';

const DEFAULT_POLL_MS=15_000;
const DEFAULT_TIMEOUT_MS=45*60_000;

const clean=value=>String(value??'').trim();

export function classifyChangedPaths(paths=[]){
  let mobileCi=false;
  let maestro=false;
  for(const raw of paths){
    const path=clean(raw);
    if(!path)continue;
    if(
      path.startsWith('mobile/')||
      path.startsWith('api/mobile/')||
      path==='api/_apple-iap-core.js'||
      path.startsWith('api/apple/')||
      (/^supabase\/migrations\/.*dabbir_apple.*\.sql$/.test(path))||
      (/^supabase\/migrations\/.*dabbir_.*account_deletion.*\.sql$/.test(path))||
      path==='scripts/dabbir-app-store-preflight.mjs'||
      path==='test/dabbir-app-store-preflight.test.mjs'||
      ['privacy.html','terms.html','support.html','vercel.json','.github/workflows/dabbir-mobile-ci.yml'].includes(path)
    ) mobileCi=true;
    if(path.startsWith('mobile/')||path==='.github/workflows/dabbir-ios-maestro.yml')maestro=true;
  }
  return {mobileCi,maestro};
}

async function githubJson(url,token){
  const response=await fetch(url,{
    headers:{
      accept:'application/vnd.github+json',
      authorization:`Bearer ${token}`,
      'x-github-api-version':'2022-11-28',
    },
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw new Error(`GITHUB_API_${response.status}:${payload?.message||text.slice(0,160)}`);
  return payload;
}

async function pullRequestFiles({repository,number,token}){
  const out=[];
  for(let page=1;page<=10;page+=1){
    const rows=await githubJson(`https://api.github.com/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`,token);
    if(!Array.isArray(rows))throw new Error('GITHUB_PR_FILES_INVALID');
    out.push(...rows.map(row=>clean(row?.filename)).filter(Boolean));
    if(rows.length<100)break;
  }
  return out;
}

function matchingRun(runs,{workflowName,headSha,prNumber}){
  return (Array.isArray(runs)?runs:[])
    .filter(run=>clean(run?.name)===workflowName)
    .filter(run=>clean(run?.head_sha).toLowerCase()===headSha.toLowerCase())
    .filter(run=>Array.isArray(run?.pull_requests)&&run.pull_requests.some(pr=>Number(pr?.number)===Number(prNumber)))
    .sort((a,b)=>Number(b?.run_number||0)-Number(a?.run_number||0))[0]||null;
}

async function waitForWorkflow({repository,token,headRef,headSha,prNumber,workflowName,pollMs,timeoutMs}){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const data=await githubJson(`https://api.github.com/repos/${repository}/actions/runs?event=pull_request&branch=${encodeURIComponent(headRef)}&per_page=100`,token);
    const run=matchingRun(data?.workflow_runs,{workflowName,headSha,prNumber});
    if(!run){
      console.log(`DABBIR_REQUIRED_GATE_WAIT workflow=${workflowName} state=NOT_STARTED sha=${headSha}`);
    }else if(clean(run.status)==='completed'){
      const conclusion=clean(run.conclusion).toLowerCase();
      if(conclusion!=='success')throw new Error(`DABBIR_REQUIRED_GATE_FAILED:${workflowName}:${conclusion||'UNKNOWN'}:run=${run.id}`);
      console.log(`DABBIR_REQUIRED_GATE_PASS workflow=${workflowName} run=${run.id} sha=${headSha}`);
      return run;
    }else{
      console.log(`DABBIR_REQUIRED_GATE_WAIT workflow=${workflowName} state=${clean(run.status)||'UNKNOWN'} run=${run.id}`);
    }
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw new Error(`DABBIR_REQUIRED_GATE_TIMEOUT:${workflowName}:${headSha}`);
}

export async function run({env=process.env}={}){
  if(clean(env.GITHUB_EVENT_NAME)!=='pull_request'){
    console.log('DABBIR_REQUIRED_PR_GATES_SKIP reason=NOT_PULL_REQUEST');
    return {required:[]};
  }
  const token=clean(env.GITHUB_TOKEN);
  const repository=clean(env.GITHUB_REPOSITORY);
  const eventPath=clean(env.GITHUB_EVENT_PATH);
  if(!token||!repository||!eventPath)throw new Error('DABBIR_REQUIRED_GATE_ENV_MISSING');
  const event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
  const prNumber=Number(event?.pull_request?.number||event?.number||0);
  const headSha=clean(event?.pull_request?.head?.sha);
  const headRef=clean(event?.pull_request?.head?.ref);
  if(!prNumber||!headSha||!headRef)throw new Error('DABBIR_REQUIRED_GATE_PR_IDENTITY_MISSING');

  const paths=await pullRequestFiles({repository,number:prNumber,token});
  const classification=classifyChangedPaths(paths);
  const required=[];
  if(classification.mobileCi)required.push('DABBIR Mobile CI');
  if(classification.maestro)required.push('DABBIR iOS Maestro Smoke');
  if(required.length===0){
    console.log(`DABBIR_REQUIRED_PR_GATES_PASS sha=${headSha} required=none`);
    return {required,paths};
  }

  const pollMs=Math.max(1_000,Number(env.DABBIR_GATE_POLL_MS||DEFAULT_POLL_MS));
  const timeoutMs=Math.max(60_000,Number(env.DABBIR_GATE_TIMEOUT_MS||DEFAULT_TIMEOUT_MS));
  for(const workflowName of required){
    await waitForWorkflow({repository,token,headRef,headSha,prNumber,workflowName,pollMs,timeoutMs});
  }
  console.log(`DABBIR_REQUIRED_PR_GATES_PASS sha=${headSha} required=${required.join(',')}`);
  return {required,paths};
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  run().catch(error=>{console.error(error?.stack||error);process.exitCode=1});
}
