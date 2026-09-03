import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { json } from './_auth-core.js';
import { adminRpc, notifyTelegram, serviceRoleKey, telegramRoute } from './_barman-executive-core.js';

const AUDIENCE='barman-executive-tool-agent';
const EXPECTED_REPO='barman-systems/pilot';
const EXPECTED_REF='refs/heads/main';
const EXPECTED_WORKFLOW=`${EXPECTED_REPO}/.github/workflows/barman-tool-agent.yml@${EXPECTED_REF}`;
const GITHUB_ISSUER='https://token.actions.githubusercontent.com';
const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='minimax/minimax-m3-free';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

function decodePart(value){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  return Buffer.from(normalized,'base64');
}
function audienceIncludes(aud){return Array.isArray(aud)?aud.includes(AUDIENCE):aud===AUDIENCE}
function claimAllowed(payload,now=Math.floor(Date.now()/1000)){
  return payload?.iss===GITHUB_ISSUER
    &&audienceIncludes(payload?.aud)
    &&payload?.repository===EXPECTED_REPO
    &&payload?.ref===EXPECTED_REF
    &&payload?.workflow_ref===EXPECTED_WORKFLOW
    &&['schedule','workflow_dispatch','push'].includes(String(payload?.event_name||''))
    &&Number(payload?.exp||0)>now-5
    &&Number(payload?.nbf||0)<=now+30;
}
export function validateToolAgentClaims(payload,now=Math.floor(Date.now()/1000)){return claimAllowed(payload,now)}

export function routeToolAgentCommand(value){
  const raw=String(value??'').slice(0,4000);
  const lineBreak=String.fromCharCode(10),slash=String.fromCharCode(92);
  const normalized=raw.split(slash+slash+'n').join(lineBreak).split(slash+'n').join(lineBreak);
  const lines=normalized.split(lineBreak).map(x=>clean(x,1200)).filter(Boolean);
  const text=lines.join(' ').trim();
  if(!text)return {route:'REVIEW_REQUIRED',reason:'EMPTY_COMMAND'};
  const goals=lines.filter(x=>{const marker=x.split(' ')[0];return /^[0-9]+[.)]$/.test(marker)||marker==='-'||marker==='•'}).length;
  if(/(?:otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي)/i.test(text))
    return {route:'OWNER_GATE',reason:'OWNER_ONLY_AUTHORITY'};
  if(goals>=2)return {route:'MULTI_STEP',reason:'COMPOUND_COMMAND_REQUIRES_PLAN'};
  const repoChange=/(?:أصلح|اصلح|إصلاح|اصلاح|طوّر|طور|تطوير|عدّل|عدل|تعديل|غيّر|غير|تغيير|أضف|اضف|إضافة|اضافة|احذف|حذف|برمج|نفذ.*(?:كود|واجهة|لوحة)|fix|develop|implement|refactor|update[ ]+(?:code|ui|dashboard)|change[ ]+(?:code|ui|dashboard))/i.test(text);
  const dataQuestion=/(?:^| )(?:كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many)(?: |$)/i.test(text);
  if(dataQuestion&&!repoChange)return {route:'DATA_QUERY',reason:'READ_ONLY_DATA_REQUEST'};
  if(repoChange)return {route:'REPO_CHANGE',reason:'SOURCE_CHANGE_REQUEST'};
  if(/(?:أرسل|ارسل|تواصل|اتصل|راسل|اشتر|شراء|ادفع|انشر في|send|contact|purchase|pay|publish to)/i.test(text))
    return {route:'EXTERNAL_ACTION',reason:'NON_REPOSITORY_ACTION'};
  return {route:'REVIEW_REQUIRED',reason:'NO_SAFE_EXECUTION_CLASS'};
}

async function verifyGithubOidc(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw Object.assign(new Error('OIDC_TOKEN_INVALID'),{status:401});
  let header,payload;
  try{header=JSON.parse(decodePart(parts[0]).toString('utf8'));payload=JSON.parse(decodePart(parts[1]).toString('utf8'))}catch{throw Object.assign(new Error('OIDC_TOKEN_INVALID'),{status:401})}
  if(header?.alg!=='RS256'||!header?.kid)throw Object.assign(new Error('OIDC_ALG_DENIED'),{status:401});
  const configResponse=await fetch(`${GITHUB_ISSUER}/.well-known/openid-configuration`,{cache:'force-cache',signal:AbortSignal.timeout(8000)});
  const config=await configResponse.json();
  const jwksResponse=await fetch(config.jwks_uri,{cache:'force-cache',signal:AbortSignal.timeout(8000)});
  const jwks=await jwksResponse.json();
  const jwk=Array.isArray(jwks?.keys)?jwks.keys.find(key=>key.kid===header.kid):null;
  if(!jwk)throw Object.assign(new Error('OIDC_KEY_UNKNOWN'),{status:401});
  const signature=decodePart(parts[2]);
  const ok=verifySignature('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),signature);
  if(!ok||!claimAllowed(payload))throw Object.assign(new Error('OIDC_SOURCE_DENIED'),{status:403});
  return payload;
}

async function gatewayCredential(){
  if(process.env.AI_GATEWAY_API_KEY)return String(process.env.AI_GATEWAY_API_KEY);
  if(process.env.VERCEL_OIDC_TOKEN)return String(process.env.VERCEL_OIDC_TOKEN);
  try{return String(await getVercelOidcToken()||'')}catch{return ''}
}
function parseJsonContent(payload){
  let value=String(payload?.choices?.[0]?.message?.content||'').trim();
  value=value.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(value)}catch{return null}
}
async function brain(system,user,maxTokens){
  const credential=await gatewayCredential();
  if(!credential)throw Object.assign(new Error('AI_GATEWAY_CREDENTIAL_MISSING'),{status:503});
  const model=clean(process.env.BARMAN_TOOL_AGENT_MODEL||process.env.BARMAN_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const response=await fetch(GATEWAY_ENDPOINT,{
    method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
    body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}],temperature:0.05,max_tokens:maxTokens,stream:false}),
    signal:AbortSignal.timeout(45000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(`AI_GATEWAY_HTTP_${response.status}`),{status:502});
  const parsed=parseJsonContent(payload);
  if(!parsed)throw Object.assign(new Error('AI_GATEWAY_INVALID_JSON'),{status:502});
  return {model,payload:parsed};
}

function safeContext(files){
  return Array.isArray(files)?files.slice(0,12).map(file=>({path:clean(file?.path,300),content:String(file?.content||'').slice(0,24000)})).filter(file=>file.path):[];
}

async function discover(command,paths){
  const safePaths=Array.isArray(paths)?paths.map(x=>clean(x,300)).filter(Boolean).slice(0,3000):[];
  const system=[
    'You are the repository discovery brain for BARMAN Executive OS.',
    'Map the Arabic or English owner command to the most likely files in the DABBIR repository.',
    'Do not execute anything. Do not request secrets. Do not select governance/security files unless the owner command explicitly concerns those systems.',
    'Return JSON only: {"summary":"...","search_terms":["..."],"file_hints":["exact/path"]}.',
    'Use 3-8 concise English search terms and at most 8 exact file paths from the supplied path list.'
  ].join('\n');
  const result=await brain(system,{command:clean(command,4000),paths:safePaths},1200);
  const p=result.payload;
  return {model:result.model,summary:clean(p?.summary,800),search_terms:Array.isArray(p?.search_terms)?p.search_terms.map(x=>clean(x,80)).filter(Boolean).slice(0,8):[],file_hints:Array.isArray(p?.file_hints)?p.file_hints.map(x=>clean(x,300)).filter(x=>safePaths.includes(x)).slice(0,8):[]};
}

async function proposePatch(command,files,previousPatch='',applyError=''){
  const context=safeContext(files);
  const system=[
    'You are the code-editing brain for BARMAN Executive OS working on DABBIR.',
    'Produce the smallest correct source change that satisfies the owner command.',
    'You may edit only existing files supplied in context.',
    'You are explicitly authorized to create NEW files under test/ and NEW SQL migration files under supabase/migrations/. A new allowed path does NOT need to already appear in the supplied context.',
    'For a low-risk regression-test request, infer a safe filename, test framework, imports, and conventions from neighboring supplied files and package.json. Never ask the owner to name the test file or reconfirm this already-granted permission.',
    'Never edit .github/, .env files, secrets, branch-protection/auth governance, api/barman-tool-agent-broker.js, scripts/barman-tool-agent.mjs, or vercel.json.',
    'Preserve tenant isolation and Mumbai-only production. Do not weaken tests or authentication to make a test pass.',
    'If apply_error starts with AI_PATCH_EMPTY_AUTORECOVERY, the previous refusal was not sufficient by itself: use the expanded context and the standing new-file permission, then either produce the safe patch or block only for a concrete technical/security reason that cannot be resolved from the supplied files.',
    'Return JSON only: {"summary":"...","patch":"<unified diff>"}. The patch must be a valid git unified diff applicable to the exact supplied content.',
    'If the request still cannot be safely completed, return {"summary":"BLOCKED: <specific non-owner-resolvable reason>","patch":""}.'
  ].join('\n');
  const result=await brain(system,{command:clean(command,4000),files:context,previous_patch:String(previousPatch||'').slice(0,30000),apply_error:clean(applyError,1600)},7000);
  return {model:result.model,summary:clean(result.payload?.summary,1200),patch:String(result.payload?.patch||'').trim().slice(0,80000)};
}

async function proposeStructuredFiles(command,files,failureReason=''){
  const context=safeContext(files);
  const system=[
    'You are the structured file-edit recovery brain for BARMAN Executive OS.',
    'The unified-diff channel failed syntactically. Do not return a patch and do not ask the owner for formatting help.',
    'Return JSON only: {"summary":"...","files":[{"path":"...","mode":"create|replace","content":"complete UTF-8 file content"}]}.',
    'Use at most 4 files and make the smallest correct change.',
    'mode=create is allowed ONLY for new files under test/ or new .sql files under supabase/migrations/.',
    'mode=replace is allowed ONLY for existing files present in the supplied context; content must be the complete replacement file.',
    'Never target .github/, .env files, secrets, branch-protection/auth governance, api/barman-tool-agent-broker.js, scripts/barman-tool-agent.mjs, or vercel.json.',
    'For a regression-test-only request, prefer creating one focused test file and do not change production behavior.',
    'Preserve existing tests and security boundaries. Never weaken a test to make it pass.',
    'If no safe structured edit exists, return {"summary":"BLOCKED: <specific technical reason>","files":[]}.'
  ].join('\n');
  const result=await brain(system,{command:clean(command,4000),files:context,failure_reason:clean(failureReason,1800)},7000);
  const raw=Array.isArray(result.payload?.files)?result.payload.files:[];
  const proposed=raw.slice(0,4).map(item=>({
    path:clean(item?.path,300),
    mode:['create','replace'].includes(String(item?.mode||'').toLowerCase())?String(item.mode).toLowerCase():'',
    content:String(item?.content??'').slice(0,60000),
  })).filter(item=>item.path&&item.mode&&item.content);
  return {model:result.model,summary:clean(result.payload?.summary,1200),files:proposed};
}

function uuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):null}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  try{
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer '))return json(res,401,{ok:false,error:'OIDC_REQUIRED'});
    const claims=await verifyGithubOidc(auth.slice(7));
    let key;try{key=serviceRoleKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const phase=clean(body.phase,40);
    if(phase==='claim'){
      const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:`github-tool-agent:${clean(claims.run_id,80)||'run'}`,p_lane:'tool_agent',p_lease_seconds:3600});
      return json(res,200,{ok:true,...claim});
    }
    if(phase==='route')return json(res,200,{ok:true,...routeToolAgentCommand(body.command)});
    if(phase==='discover')return json(res,200,{ok:true,...await discover(body.command,body.paths)});
    if(phase==='patch')return json(res,200,{ok:true,...await proposePatch(body.command,body.files,body.previous_patch,body.apply_error)});
    if(phase==='files')return json(res,200,{ok:true,...await proposeStructuredFiles(body.command,body.files,body.failure_reason)});
    if(phase==='finalize'){
      const commandId=uuid(body.command_id),runId=uuid(body.run_id),actionId=uuid(body.action_id);
      if(!commandId||!runId||!actionId)return json(res,400,{ok:false,error:'EXECUTION_IDS_INVALID'});
      const outcome=['DONE','BLOCKED','RETRY'].includes(String(body.outcome||'').toUpperCase())?String(body.outcome).toUpperCase():null;
      if(!outcome)return json(res,400,{ok:false,error:'OUTCOME_INVALID'});
      const evidence=Array.isArray(body.evidence)?body.evidence.slice(0,12):[];
      const summary=clean(body.summary,4000),errorText=clean(body.error,2000)||null;
      const finalized=await adminRpc(key,'barman_executive_finalize_v1',{p_command_id:commandId,p_run_id:runId,p_action_id:actionId,p_outcome:outcome,p_summary:summary,p_evidence:evidence,p_error:errorText});
      const route=await telegramRoute(key,commandId).catch(()=>null);
      const notification=await notifyTelegram(route,`${summary}\n\nالحالة: ${outcome} — BARMAN tool-agent.`).catch(error=>({sent:false,reason:clean(error?.message||error,200)}));
      return json(res,200,{ok:true,finalized,notification});
    }
    return json(res,400,{ok:false,error:'PHASE_INVALID'});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('barman_tool_agent_broker_failed',{status,error:clean(error?.message||error,500)});
    return json(res,status,{ok:false,error:clean(error?.message||error,200)});
  }
}
