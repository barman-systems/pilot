import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { json } from './_auth-core.js';
import { adminRpc, notifyTelegram, serviceRoleKey, telegramRoute } from './_barman-executive-core.js';

const AUDIENCE='barman-executive-orchestrator';
const EXPECTED_REPO='barman-systems/pilot';
const EXPECTED_REF='refs/heads/main';
const EXPECTED_WORKFLOW=`${EXPECTED_REPO}/.github/workflows/barman-orchestrator.yml@${EXPECTED_REF}`;
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
    && audienceIncludes(payload?.aud)
    && payload?.repository===EXPECTED_REPO
    && payload?.ref===EXPECTED_REF
    && payload?.workflow_ref===EXPECTED_WORKFLOW
    && ['schedule','workflow_dispatch'].includes(String(payload?.event_name||''))
    && Number(payload?.exp||0)>now-5
    && Number(payload?.nbf||0)<=now+30;
}
export function validateOrchestratorClaims(payload,now=Math.floor(Date.now()/1000)){return claimAllowed(payload,now)}

export function classifyAtomicKind(value){
  const text=clean(value,1600);
  if(/(?:otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي)/i.test(text))return 'OWNER_GATE';
  const repoChange=/(?:أصلح|اصلح|إصلاح|اصلاح|طوّر|طور|تطوير|عدّل|عدل|تعديل|غيّر|غير|تغيير|أضف|اضف|إضافة|اضافة|احذف|حذف|برمج|نفذ.*(?:كود|واجهة|لوحة)|fix|develop|implement|refactor|update[ ]+(?:code|ui|dashboard)|change[ ]+(?:code|ui|dashboard))/i.test(text);
  const dataQuestion=/(?:^| )(?:كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many|نشاط|activity)(?: |$)/i.test(text);
  if(dataQuestion&&!repoChange)return 'DATA_QUERY';
  if(repoChange)return 'REPO_CHANGE';
  if(/(?:أرسل|ارسل|تواصل|اتصل|راسل|اشتر|شراء|ادفع|انشر في|send|contact|purchase|pay|publish to)/i.test(text))return 'EXTERNAL_ACTION';
  return 'REVIEW_REQUIRED';
}

export function deterministicDataSummary(snapshot={}){
  const businesses=Number(snapshot?.businesses?.total||0);
  const customers=Number(snapshot?.customers?.total||0);
  const newCustomers=Number(snapshot?.customers?.new_24h||0);
  const appointments=Number(snapshot?.appointments?.total||0);
  const appointments24=Number(snapshot?.appointments?.created_24h||0);
  const orders=Number(snapshot?.orders?.total||0);
  const orders24=Number(snapshot?.orders?.created_24h||0);
  return `قراءة حية من DABBIR Mumbai: ${businesses} منشآت، ${customers} عملاء (${newCustomers} خلال 24 ساعة)، ${appointments} حجوزات (${appointments24} أُنشئت خلال 24 ساعة)، و${orders} طلبات (${orders24} خلال 24 ساعة).`;
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
  const ok=verifySignature('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),decodePart(parts[2]));
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
async function brain(system,user,maxTokens=2200){
  const credential=await gatewayCredential();
  if(!credential)throw Object.assign(new Error('AI_GATEWAY_CREDENTIAL_MISSING'),{status:503});
  const model=clean(process.env.BARMAN_ORCHESTRATOR_MODEL||process.env.BARMAN_TOOL_AGENT_MODEL||process.env.BARMAN_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const response=await fetch(GATEWAY_ENDPOINT,{method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}],temperature:0.03,max_tokens:maxTokens,stream:false}),signal:AbortSignal.timeout(45000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(`AI_GATEWAY_HTTP_${response.status}`),{status:502});
  const parsed=parseJsonContent(payload);
  if(!parsed)throw Object.assign(new Error('AI_GATEWAY_INVALID_JSON'),{status:502});
  return {model,payload:parsed};
}

async function buildPlan(command){
  const system=[
    'You are the planning brain inside BARMAN Executive OS for DABBIR.',
    'Turn the owner mission into 2-8 atomic executable tasks. Each task must have one verifiable outcome.',
    'Do not invent credentials or owner approvals. Never put OTP, KYC, money transfer, legal signature, destructive production deletion, or account ownership changes into an autonomous task.',
    'Prefer investigation/read tasks before code-change tasks when the root cause is unknown.',
    'Use kind DATA_QUERY for read-only business/system facts, REPO_CHANGE for source changes, EXTERNAL_ACTION only for a real connected external action, REVIEW_REQUIRED when no safe executor exists.',
    'Return JSON only: {"summary":"...","tasks":[{"title":"...","command_text":"...","kind":"DATA_QUERY|REPO_CHANGE|EXTERNAL_ACTION|REVIEW_REQUIRED","risk_level":"LOW|MEDIUM|HIGH|CRITICAL"}]}.',
    'Task command_text must be concrete enough for an executor to act without guessing and must include the required test/evidence expectation when it is a source change.'
  ].join('\n');
  const result=await brain(system,{command:clean(command,4000),project:'DABBIR',canonical_database:'fphpoysqdsceniwduxjq'},2600);
  const tasks=Array.isArray(result.payload?.tasks)?result.payload.tasks.slice(0,8).map((task,index)=>{
    const commandText=clean(task?.command_text,1600);
    let kind=clean(task?.kind,40).toUpperCase();
    const inferred=classifyAtomicKind(commandText);
    if(kind==='OWNER_GATE'||inferred==='OWNER_GATE')throw Object.assign(new Error('PLAN_REQUIRES_OWNER_GATE'),{status:409});
    if(!['DATA_QUERY','REPO_CHANGE','EXTERNAL_ACTION','REVIEW_REQUIRED'].includes(kind))kind=inferred==='OWNER_GATE'?'REVIEW_REQUIRED':inferred;
    let risk=clean(task?.risk_level,20).toUpperCase();if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(risk))risk='MEDIUM';
    return {title:clean(task?.title,240)||`Task ${index+1}`,command_text:commandText,kind,risk_level:risk};
  }).filter(task=>task.command_text.length>=4):[];
  if(tasks.length<2)throw Object.assign(new Error('PLAN_TASKS_INSUFFICIENT'),{status:502});
  return {model:result.model,summary:clean(result.payload?.summary,1000),tasks};
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
      const lane=['planner','read_only'].includes(clean(body.lane,40))?clean(body.lane,40):null;
      if(!lane)return json(res,400,{ok:false,error:'LANE_INVALID'});
      const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:`github-orchestrator:${lane}:${clean(claims.run_id,80)||'run'}`,p_lane:lane,p_lease_seconds:900});
      return json(res,200,{ok:true,...claim});
    }
    if(phase==='read_data'){
      const commandId=uuid(body.command_id),runId=uuid(body.run_id),actionId=uuid(body.action_id);
      if(!commandId||!runId||!actionId)return json(res,400,{ok:false,error:'EXECUTION_IDS_INVALID'});
      const snapshot=await adminRpc(key,'barman_executive_read_snapshot_v1',{});
      const summary=deterministicDataSummary(snapshot);
      const evidence=[{type:'query',reference:'public.barman_executive_read_snapshot_v1',verified:true,details:{produced_by:'postgresql',verified_by:'barman-read-only-orchestrator',verification_method:'DATABASE_SNAPSHOT',snapshot}}];
      const finalized=await adminRpc(key,'barman_executive_finalize_v1',{p_command_id:commandId,p_run_id:runId,p_action_id:actionId,p_outcome:'DONE',p_summary:summary,p_evidence:evidence,p_error:null});
      const route=await telegramRoute(key,commandId).catch(()=>null);
      const notification=await notifyTelegram(route,`${summary}\n\nالحالة: DONE — BARMAN read-only executor.`).catch(error=>({sent:false,reason:clean(error?.message||error,200)}));
      return json(res,200,{ok:true,summary,snapshot,finalized,notification});
    }
    if(phase==='plan'){
      const commandId=uuid(body.command_id),runId=uuid(body.run_id),actionId=uuid(body.action_id);
      if(!commandId||!runId||!actionId)return json(res,400,{ok:false,error:'EXECUTION_IDS_INVALID'});
      const plan=await buildPlan(body.command);
      const delegated=await adminRpc(key,'barman_executive_decompose_v1',{p_command_id:commandId,p_run_id:runId,p_action_id:actionId,p_tasks:plan.tasks});
      const summary=`تم تفكيك المهمة إلى ${plan.tasks.length} مهام تنفيذية قابلة للتحقق. ${plan.summary}`.trim();
      const route=await telegramRoute(key,commandId).catch(()=>null);
      const notification=await notifyTelegram(route,`${summary}\n\nالحالة: WAITING — BARMAN planner.`).catch(error=>({sent:false,reason:clean(error?.message||error,200)}));
      return json(res,200,{ok:true,summary,model:plan.model,tasks:plan.tasks,delegated,notification});
    }
    return json(res,400,{ok:false,error:'PHASE_INVALID'});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('barman_orchestrator_broker_failed',{status,error:clean(error?.message||error,500)});
    return json(res,status,{ok:false,error:clean(error?.message||error,220)});
  }
}
