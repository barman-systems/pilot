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
const GATEWAY_MAX_ATTEMPTS=2;
const GATEWAY_RETRYABLE=new Set([429,502,503,504]);
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

const DISCOVERY_SCHEMA={
  type:'object',
  properties:{
    summary:{type:'string'},
    search_terms:{type:'array',items:{type:'string'},maxItems:8},
    file_hints:{type:'array',items:{type:'string'},maxItems:8},
  },
  required:['summary','search_terms','file_hints'],
  additionalProperties:false,
};
const PATCH_SCHEMA={
  type:'object',
  properties:{
    summary:{type:'string'},
    patch:{type:'string'},
  },
  required:['summary','patch'],
  additionalProperties:false,
};
const ROUTE_SCHEMA={
  type:'object',
  properties:{
    route:{type:'string',enum:['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE','MULTI_STEP']},
    reason:{type:'string'},
    risk_level:{type:'string',enum:['LOW','MEDIUM','HIGH','CRITICAL']},
    options:{type:'array',minItems:2,maxItems:5,items:{type:'string'}},
    situation:{
      type:'object',
      properties:{
        what_changed:{type:'string'},
        why_it_matters:{type:'string'},
        affected_goal:{type:'string'},
        severity:{type:'string'},
        known_facts:{type:'array',items:{type:'string'},maxItems:8},
        unknowns:{type:'array',items:{type:'string'},maxItems:8},
      },
      required:['what_changed','why_it_matters','affected_goal','severity','known_facts','unknowns'],
      additionalProperties:false,
    },
    required_phases:{type:'array',maxItems:8,items:{type:'string',enum:['investigation','root_cause','proof','repair','verification','acceptance_gate','read_only','external_action']}},
    memory_refs_used:{type:'array',maxItems:5,items:{type:'integer'}},
  },
  required:['route','reason','risk_level','options','situation','required_phases','memory_refs_used'],
  additionalProperties:false,
};

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
function structuredOutput(name,schema){
  return {type:'json_schema',json_schema:{name,description:'BARMAN machine-readable tool-agent response',schema}};
}
function gatewayError(status){return Object.assign(new Error(`AI_GATEWAY_HTTP_${status}`),{status:502})}
async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function gatewayCompletion(credential,requestBody){
  let lastStatus=0;
  for(let attempt=1;attempt<=GATEWAY_MAX_ATTEMPTS;attempt+=1){
    const response=await fetch(GATEWAY_ENDPOINT,{
      method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
      body:JSON.stringify(requestBody),signal:AbortSignal.timeout(45000),
    });
    lastStatus=response.status;
    const text=await response.text();let payload=null;
    try{payload=text?JSON.parse(text):{}}catch{if(response.ok)throw Object.assign(new Error('AI_GATEWAY_RESPONSE_INVALID_JSON'),{status:502})}
    if(response.ok)return payload||{};
    if(!GATEWAY_RETRYABLE.has(response.status)||attempt===GATEWAY_MAX_ATTEMPTS)throw gatewayError(response.status);
    const retryAfter=Math.max(0,Math.min(2000,Number(response.headers.get('retry-after')||0)*1000));
    await sleep(retryAfter||300*attempt);
  }
  throw gatewayError(lastStatus||502);
}
async function brain(system,user,maxTokens,{name,schema}){
  const credential=await gatewayCredential();
  if(!credential)throw Object.assign(new Error('AI_GATEWAY_CREDENTIAL_MISSING'),{status:503});
  const model=clean(process.env.BARMAN_TOOL_AGENT_MODEL||process.env.BARMAN_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const payload=await gatewayCompletion(credential,{
    model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}],temperature:0.05,max_tokens:maxTokens,stream:false,
    response_format:structuredOutput(name,schema),
  });
  const parsed=parseJsonContent(payload);
  if(!parsed)throw Object.assign(new Error('AI_GATEWAY_STRUCTURED_OUTPUT_INVALID'),{status:502});
  return {model,payload:parsed};
}

function fallbackRisk(route){return route==='DATA_QUERY'?'LOW':route==='EXTERNAL_ACTION'?'HIGH':route==='OWNER_GATE'?'CRITICAL':'MEDIUM'}
function fallbackPhases(command,route){
  const text=String(command||'');
  const phases=[];
  if(/راجع|افحص|حلل|دقق|investigat|review|inspect|analy/i.test(text))phases.push('investigation');
  if(/سبب|جذر|root.?cause/i.test(text))phases.push('root_cause');
  if(/اثبت|أثبت|دليل|proof|evidence|تأكد|تاكد|verify/i.test(text))phases.push('proof');
  if(/أصلح|اصلح|fix|repair|طوّر|طور|develop|implement/i.test(text))phases.push('repair');
  if(route==='DATA_QUERY')phases.push('read_only');
  if(route==='EXTERNAL_ACTION')phases.push('external_action');
  if(!phases.includes('verification')&&route==='REPO_CHANGE')phases.push('verification');
  if(/قبل التأكد|قبل التاكد|acceptance|قبول/i.test(text))phases.push('acceptance_gate');
  return [...new Set(phases)].slice(0,8);
}
async function semanticRoute(command,executiveContext={}){
  const fallback=routeToolAgentCommand(command);
  if(['OWNER_GATE','MULTI_STEP'].includes(fallback.route)){
    return {
      ...fallback,risk_level:fallbackRisk(fallback.route),options:[fallback.route,'REVIEW_REQUIRED'],
      situation:{what_changed:clean(command,1200),why_it_matters:'Owner authority or compound-work boundary must be resolved before code execution.',affected_goal:'DABBIR governed execution',severity:fallbackRisk(fallback.route),known_facts:[fallback.reason],unknowns:['safe execution plan']},
      required_phases:fallbackPhases(command,fallback.route),memory_refs_used:[],understanding_source:'HARD_SAFETY_OR_STRUCTURE_GATE',
    };
  }
  const system=[
    'You are the semantic execution-routing step inside the existing BARMAN Executive OS tool agent.',
    'Understand the situation before selecting the execution surface. Do not execute or propose code here.',
    'Owner-only legal, payment, KYC, OTP, card data, or binding commitments must be OWNER_GATE.',
    'Use REPO_CHANGE only when repository mutation is actually required; DATA_QUERY for read-only facts; EXTERNAL_ACTION for non-financial outside actions; MULTI_STEP when one command contains multiple dependent jobs; REVIEW_REQUIRED when safe routing is not established.',
    'Represent investigation, root-cause, proof, repair, verification, and acceptance gates in required_phases when the owner asked for them. Never collapse those requirements into the label REPO_CHANGE.',
    'Verified executive memories may influence the reason only when materially similar. Put only actually used memory IDs in memory_refs_used.',
    'Return structured JSON only.',
  ].join('\n');
  try{
    const result=await brain(system,{command:clean(command,4000),executive_context:executiveContext},1400,{name:'barman_semantic_execution_route',schema:ROUTE_SCHEMA});
    const p=result.payload;
    return {
      route:p.route,reason:clean(p.reason,1600),risk_level:p.risk_level,
      options:Array.isArray(p.options)?p.options.slice(0,5):[],situation:p.situation||{},
      required_phases:Array.isArray(p.required_phases)?p.required_phases.slice(0,8):[],
      memory_refs_used:Array.isArray(p.memory_refs_used)?p.memory_refs_used.slice(0,5):[],
      understanding_source:'AI_GATEWAY',model:result.model,
    };
  }catch(error){
    return {
      ...fallback,risk_level:fallbackRisk(fallback.route),options:[fallback.route,'REVIEW_REQUIRED'],
      situation:{what_changed:clean(command,1200),why_it_matters:'Semantic routing provider was unavailable; preserve the deterministic fail-closed fallback.',affected_goal:'DABBIR governed execution',severity:fallbackRisk(fallback.route),known_facts:[fallback.reason],unknowns:['semantic interpretation unavailable']},
      required_phases:fallbackPhases(command,fallback.route),memory_refs_used:[],understanding_source:'DETERMINISTIC_FALLBACK',brain_error:clean(error?.message||error,200),
    };
  }
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
  const result=await brain(system,{command:clean(command,4000),paths:safePaths},1200,{name:'barman_repository_discovery',schema:DISCOVERY_SCHEMA});
  const p=result.payload;
  return {model:result.model,summary:clean(p?.summary,800),search_terms:Array.isArray(p?.search_terms)?p.search_terms.map(x=>clean(x,80)).filter(Boolean).slice(0,8):[],file_hints:Array.isArray(p?.file_hints)?p.file_hints.map(x=>clean(x,300)).filter(x=>safePaths.includes(x)).slice(0,8):[]};
}

async function proposePatch(command,files,previousPatch='',applyError=''){
  const context=Array.isArray(files)?files.slice(0,12).map(file=>({path:clean(file?.path,300),content:String(file?.content||'').slice(0,24000)})).filter(file=>file.path):[];
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
  const result=await brain(system,{command:clean(command,4000),files:context,previous_patch:String(previousPatch||'').slice(0,30000),apply_error:clean(applyError,1600)},7000,{name:'barman_source_patch',schema:PATCH_SCHEMA});
  return {model:result.model,summary:clean(result.payload?.summary,1200),patch:String(result.payload?.patch||'').trim().slice(0,80000)};
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
    const workerId=`github-tool-agent:${clean(claims.run_id,80)||'run'}`;
    if(phase==='claim'){
      const claim=await adminRpc(key,'barman_executive_claim_v1',{p_worker_id:workerId,p_lane:'tool_agent',p_lease_seconds:3600});
      return json(res,200,{ok:true,...claim});
    }
    if(phase==='route'){
      const context=await adminRpc(key,'barman_executive_context_for_worker_v1',{p_worker_id:workerId}).catch(()=>({ok:false,found:false,memories:[]}));
      const routed=await semanticRoute(body.command,context);
      const persisted=await adminRpc(key,'barman_executive_record_route_for_worker_v1',{p_worker_id:workerId,p_route:routed});
      return json(res,200,{ok:true,...routed,decision_id:persisted?.decision_id,semantic_memory_refs:persisted?.memory_refs||[]});
    }
    if(phase==='discover')return json(res,200,{ok:true,...await discover(body.command,body.paths)});
    if(phase==='patch')return json(res,200,{ok:true,...await proposePatch(body.command,body.files,body.previous_patch,body.apply_error)});
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
