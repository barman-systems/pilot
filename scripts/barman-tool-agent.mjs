import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO=process.env.GITHUB_REPOSITORY||'barman-systems/pilot';
const GITHUB_API='https://api.github.com';
const BROKER='https://dabbir.bmalman.com/api/barman-tool-agent-broker';
const AUDIENCE='barman-executive-tool-agent';
const TOKEN=String(process.env.GITHUB_TOKEN||'');
const RUN_ID=String(process.env.GITHUB_RUN_ID||Date.now());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

function sh(file,args=[],options={}){
  return execFileSync(file,args,{encoding:'utf8',stdio:options.stdio||['ignore','pipe','pipe'],...options}).trim();
}
function git(args,options={}){return sh('git',args,options)}
function changedFiles(){return git(['diff','--name-only','HEAD']).split('\n').map(x=>x.trim()).filter(Boolean)}
function forbiddenPath(path){
  return path.startsWith('.github/')
    ||/(^|\/)\.env(?:\.|$)/.test(path)
    ||path==='api/barman-tool-agent-broker.js'
    ||path==='scripts/barman-tool-agent.mjs'
    ||path==='vercel.json';
}
function patchTouchesForbidden(patch){
  const paths=[...String(patch||'').matchAll(/^(?:---|\+\+\+) (?:a\/|b\/)?([^\n]+)$/gm)].map(m=>m[1]).filter(x=>x!=='/dev/null');
  return paths.some(forbiddenPath);
}

async function oidc(){
  const url=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const requestToken=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!url||!requestToken)throw new Error('GITHUB_OIDC_UNAVAILABLE');
  const sep=url.includes('?')?'&':'?';
  const response=await fetch(`${url}${sep}audience=${encodeURIComponent(AUDIENCE)}`,{headers:{authorization:`bearer ${requestToken}`},signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.value)throw new Error(`GITHUB_OIDC_HTTP_${response.status}`);
  return payload.value;
}
async function broker(body){
  const response=await fetch(BROKER,{method:'POST',headers:{authorization:`Bearer ${await oidc()}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.ok!==true)throw new Error(`BROKER_${response.status}_${clean(payload?.error||'FAILED',200)}`);
  return payload;
}
async function gh(path,{method='GET',body}={}){
  if(!TOKEN)throw new Error('GITHUB_TOKEN_MISSING');
  const response=await fetch(`${GITHUB_API}/repos/${REPO}${path}`,{
    method,headers:{authorization:`Bearer ${TOKEN}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),
  });
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok)throw Object.assign(new Error(`GITHUB_${response.status}_${clean(payload?.message||text,300)}`),{status:response.status,payload});
  return payload;
}
async function dispatch(workflow,ref,inputs={}){
  await gh(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',body:{ref,inputs}});
}
async function waitWorkflow(workflow,branch,event,headSha,timeoutMs){
  const started=Date.now();let seen=null;
  while(Date.now()-started<timeoutMs){
    const runs=await gh(`/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(branch)}&event=${encodeURIComponent(event)}&per_page=20`);
    const candidates=Array.isArray(runs?.workflow_runs)?runs.workflow_runs:[];
    seen=candidates.find(run=>String(run.head_sha||'')===headSha)||seen;
    if(seen?.status==='completed'){
      if(seen.conclusion!=='success')throw new Error(`${workflow}_FAILED_${seen.conclusion||'unknown'}_${seen.html_url||''}`);
      return seen;
    }
    await sleep(10000);
  }
  throw new Error(`${workflow}_TIMEOUT_${seen?.html_url||''}`);
}
async function waitProduction(commitSha,timeoutMs=900000){
  const started=Date.now();let last=null;
  while(Date.now()-started<timeoutMs){
    try{
      const response=await fetch(`https://dabbir.bmalman.com/api/release-evidence?t=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>null);last=payload;
      if(response.ok&&payload?.ok===true&&String(payload?.environment||'').toLowerCase()==='production'&&String(payload?.commit_sha||'').toLowerCase()===commitSha.toLowerCase())return payload;
    }catch{}
    await sleep(10000);
  }
  throw new Error(`PRODUCTION_EXACT_SHA_TIMEOUT_${clean(last?.commit_sha||'none',80)}`);
}

function repositoryPaths(){return git(['ls-files','-z']).split('\0').filter(Boolean)}
function grepFiles(term){
  if(!term)return [];
  const r=spawnSync('git',['grep','-Il','--fixed-strings','-e',term,'--',':(exclude).github'],{encoding:'utf8'});
  if(![0,1].includes(r.status))return [];
  return String(r.stdout||'').split('\n').map(x=>x.trim()).filter(Boolean);
}
function buildContext(discovery,allPaths){
  const selected=[];const add=path=>{if(!path||selected.includes(path)||!allPaths.includes(path)||forbiddenPath(path))return;try{const stat=fs.statSync(path);if(!stat.isFile()||stat.size>24000)return;const content=fs.readFileSync(path,'utf8');if(content.includes('\0'))return;selected.push(path)}catch{}};
  for(const hint of discovery.file_hints||[])add(hint);
  for(const term of discovery.search_terms||[])for(const path of grepFiles(term))add(path);
  for(const hint of [...selected]){
    const base=hint.split('/').pop()?.replace(/\.[^.]+$/,'');
    if(!base)continue;
    for(const path of allPaths){if(selected.length>=8)break;if(path.startsWith('test/')&&path.toLowerCase().includes(base.toLowerCase()))add(path)}
  }
  return selected.slice(0,8).map(path=>({path,content:fs.readFileSync(path,'utf8')}));
}
function applyPatch(patch){
  const check=spawnSync('git',['apply','--check','--whitespace=error-all','-'],{input:patch,encoding:'utf8'});
  if(check.status!==0)return {ok:false,error:clean(check.stderr||check.stdout||'git apply --check failed',1200)};
  const apply=spawnSync('git',['apply','--whitespace=fix','-'],{input:patch,encoding:'utf8'});
  if(apply.status!==0)return {ok:false,error:clean(apply.stderr||apply.stdout||'git apply failed',1200)};
  return {ok:true};
}
function localTests(){
  sh('npm',['ci','--no-audit','--no-fund'],{stdio:'inherit'});
  sh('npm',['run','check:syntax'],{stdio:'inherit'});
  sh('npm',['test'],{stdio:'inherit'});
}

async function createPr(branch,title,body){
  return gh('/pulls',{method:'POST',body:{title,head:branch,base:'main',body,maintainer_can_modify:true}});
}
async function mergePr(number,headSha){
  return gh(`/pulls/${number}/merge`,{method:'PUT',body:{sha:headSha,merge_method:'squash'}});
}
async function refreshBranch(branch){
  git(['fetch','origin','main']);
  git(['checkout',branch]);
  sh('git',['merge','--no-edit','origin/main'],{stdio:'inherit'});
  git(['push','origin',branch]);
  return git(['rev-parse','HEAD']);
}

let execution=null;
async function finalize(outcome,summary,evidence=[],error=''){
  if(!execution)return null;
  try{return await broker({phase:'finalize',command_id:execution.commandId,run_id:execution.runId,action_id:execution.actionId,outcome,summary,evidence,error})}
  catch(finalizeError){console.error('FINALIZE_FAILED',finalizeError);return null}
}

try{
  const claim=await broker({phase:'claim'});
  if(claim.claimed!==true){console.log('No tool_agent command available.');process.exit(0)}
  const command=claim.command||{};
  execution={commandId:String(command.id||''),runId:String(claim.run_id||''),actionId:String(claim.action_id||'')};
  const commandText=String(command.command_text||'').trim();
  if(!commandText)throw new Error('EMPTY_COMMAND');
  console.log(`Claimed ${execution.commandId}: ${clean(commandText,300)}`);

  const routing=await broker({phase:'route',command:commandText});
  if(routing.route!=='REPO_CHANGE'){
    const labels={
      DATA_QUERY:'طلب بيانات يحتاج منفذ قراءة مخصص، ولن أحوله إلى تعديل كود.',
      EXTERNAL_ACTION:'هذا إجراء خارجي وليس تعديل مستودع، ولن أنفذه بعامل الكود.',
      OWNER_GATE:'هذا الإجراء يتطلب صلاحية المالك ولن يتجاوز BARMAN هذا الحد.',
      MULTI_STEP:'الأمر مركب ويحتاج تفكيك خطة قبل التنفيذ الآلي.',
      REVIEW_REQUIRED:'لم أجد مسار تنفيذ آمنًا لهذا الأمر.',
    };
    await finalize('BLOCKED',labels[routing.route]||labels.REVIEW_REQUIRED,[],`ROUTER_${routing.route}_${routing.reason||'UNKNOWN'}`);
    process.exit(0);
  }

  const allPaths=repositoryPaths();
  const discovery=await broker({phase:'discover',command:commandText,paths:allPaths.slice(0,3000)});
  let context=buildContext(discovery,allPaths);
  if(context.length===0){
    await finalize('BLOCKED','BARMAN لم يجد سياق ملفات آمنًا وكافيًا لتنفيذ الأمر تلقائيًا.',[],`DISCOVERY_EMPTY: ${discovery.summary||''}`);
    process.exit(0);
  }

  let proposal=await broker({phase:'patch',command:commandText,files:context});
  if(!proposal.patch){
    await finalize('BLOCKED',proposal.summary||'تعذر إنشاء تعديل آمن من السياق المتاح.',[], 'AI_PATCH_EMPTY');
    process.exit(0);
  }
  if(patchTouchesForbidden(proposal.patch))throw new Error('PATCH_TOUCHED_GOVERNANCE_FILE');
  let applied=applyPatch(proposal.patch);
  if(!applied.ok){
    proposal=await broker({phase:'patch',command:commandText,files:context,previous_patch:proposal.patch,apply_error:applied.error});
    if(!proposal.patch||patchTouchesForbidden(proposal.patch))throw new Error(`PATCH_REPAIR_DENIED_${applied.error}`);
    applied=applyPatch(proposal.patch);
    if(!applied.ok)throw new Error(`PATCH_APPLY_FAILED_${applied.error}`);
  }

  const changed=changedFiles();
  if(changed.length===0)throw new Error('PATCH_PRODUCED_NO_DIFF');
  if(changed.length>12||changed.some(forbiddenPath))throw new Error(`PATCH_SCOPE_DENIED_${changed.join(',')}`);
  localTests();

  const branch=`barman/exec-${execution.commandId.slice(0,8)}-${RUN_ID}`.replace(/[^a-zA-Z0-9_\/-]/g,'-').slice(0,120);
  git(['config','user.name','BARMAN Executive OS']);
  git(['config','user.email','barmanai@users.noreply.github.com']);
  git(['switch','-c',branch]);
  git(['add','--',...changed]);
  git(['commit','-m',`BARMAN: ${clean(proposal.summary||commandText,68)}`]);
  git(['push','-u','origin',branch]);
  let headSha=git(['rev-parse','HEAD']);
  const pr=await createPr(branch,`BARMAN: ${clean(proposal.summary||commandText,80)}`,`Automated execution for owner command \`${execution.commandId}\`.\n\nOwner goal: ${clean(commandText,1200)}\n\nSafety: generated patch passed local syntax + npm test before PR creation.`);
  const prUrl=String(pr.html_url||'');

  await dispatch('ci.yml',branch,{});
  let ciRun=await waitWorkflow('ci.yml',branch,'workflow_dispatch',headSha,900000);
  let merged;
  try{merged=await mergePr(pr.number,headSha)}catch(error){
    if(![405,409,422].includes(Number(error.status)))throw error;
    headSha=await refreshBranch(branch);
    localTests();
    await dispatch('ci.yml',branch,{});
    ciRun=await waitWorkflow('ci.yml',branch,'workflow_dispatch',headSha,900000);
    merged=await mergePr(pr.number,headSha);
  }
  if(merged?.merged!==true||!merged?.sha)throw new Error(`PR_NOT_MERGED_${clean(merged?.message||'',300)}`);
  const mergeSha=String(merged.sha);
  const release=await waitProduction(mergeSha,900000);

  await dispatch('dabbir-ai-customer-journey.yml','main',{run_capacity:false,production_capacity_ack:''});
  const journey=await waitWorkflow('dabbir-ai-customer-journey.yml','main','workflow_dispatch',mergeSha,1200000);
  const evidence=[
    {type:'artifact',reference:prUrl,verified:true,details:{pr_number:pr.number,changed_files:changed}},
    {type:'test',reference:String(ciRun.html_url||'DABBIR CI'),verified:true,details:{workflow:'DABBIR CI',head_sha:headSha}},
    {type:'commit',reference:mergeSha,verified:true,details:{repository:REPO}},
    {type:'deployment',reference:String(release?.deployment_id||'production'),verified:true,details:{commit_sha:release?.commit_sha,environment:release?.environment}},
    {type:'test',reference:String(journey.html_url||'Full Customer Journey'),verified:true,details:{workflow:'DABBIR AI Full Customer Journey',commit_sha:mergeSha}},
  ];
  const summary=`BARMAN نفّذ الأمر ودمج التغيير بعد CI ثم تحقق من Production وFull Customer Journey. PR #${pr.number}, commit ${mergeSha.slice(0,12)}.`;
  const result=await finalize('DONE',summary,evidence,'');
  console.log('DONE',JSON.stringify({command_id:execution.commandId,pr:prUrl,merge_sha:mergeSha,notification:result?.notification||null}));
}catch(error){
  const message=clean(error?.stack||error?.message||error,1800);
  console.error('BARMAN_TOOL_AGENT_FAILED',message);
  await finalize('RETRY','تعذر إكمال دورة التنفيذ الآلية؛ ستعاد المحاولة بعد معالجة السبب.',[],message);
  process.exitCode=1;
}
