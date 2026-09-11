import { getVercelOidcToken } from '@vercel/oidc';

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='minimax/minimax-m3-free';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const ALLOWED_KINDS=new Set(['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED']);
const ALLOWED_RISKS=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
const EXECUTIVE_ROUTES=new Set(['RUNTIME_STATUS','REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE','MULTI_STEP']);

function ownerGate(text){
  return /(?:otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي|بيانات بطاقة|card details)/i.test(String(text||''));
}

export function classifyAutomationTask(text){
  const value=clean(text,1600);
  if(ownerGate(value))return {kind:'OWNER_GATE',risk_level:'CRITICAL'};
  const repo=/(?:أصلح|اصلح|إصلاح|اصلاح|طوّر|طور|تطوير|عدّل|عدل|تعديل|غيّر|غير|تغيير|أضف|اضف|إضافة|اضافة|احذف|حذف|برمج|نفذ.*(?:كود|واجهة|لوحة)|fix|develop|implement|refactor|update[ ]+(?:code|ui|dashboard)|change[ ]+(?:code|ui|dashboard))/i.test(value);
  const data=/(?:^| )(?:كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many|نشاط|activity|تقرير|report)(?: |$)/i.test(value);
  const external=/(?:أرسل|ارسل|تواصل|اتصل|راسل|انشر في|send|contact|publish to)/i.test(value);
  if(repo)return {kind:'REPO_CHANGE',risk_level:'MEDIUM'};
  if(data)return {kind:'DATA_QUERY',risk_level:'LOW'};
  if(external)return {kind:'EXTERNAL_ACTION',risk_level:'HIGH'};
  return {kind:'REVIEW_REQUIRED',risk_level:'MEDIUM'};
}

function routeFallback(text){
  const value=clean(text,4000);
  if(ownerGate(value))return {route:'OWNER_GATE',risk_level:'CRITICAL',reason:'OWNER_ONLY_AUTHORITY'};
  const lines=String(value).replace(/\\n/g,'\n').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const marked=lines.filter(x=>/^(?:\d+[.)]|[-•])\s+/.test(x));
  if(marked.length>=2)return {route:'MULTI_STEP',risk_level:'MEDIUM',reason:'COMPOUND_COMMAND_REQUIRES_PLAN'};
  if(/^(?:اعطني|أعطني|اريد|أريد|give me|show)?\s*(?:تقرير|الحالة|حاله|افحص|فحص|صحة|صحه|status|health)(?:\s+(?:دبر|dabbir))?\s*[؟?!.]*$/i.test(value))
    return {route:'RUNTIME_STATUS',risk_level:'LOW',reason:'LIVE_RUNTIME_STATUS_REQUEST'};
  const classified=classifyAutomationTask(value);
  return {route:classified.kind,risk_level:classified.risk_level,reason:`DETERMINISTIC_${classified.kind}`};
}

function requiredPhases(text,route){
  const value=String(text||'');
  const phases=[];
  if(/راجع|افحص|حلل|دقق|investigat|review|inspect|analy/i.test(value))phases.push('investigation');
  if(/سبب|جذر|root.?cause/i.test(value))phases.push('root_cause');
  if(/اثبت|أثبت|دليل|proof|evidence|تأكد|تاكد|verify/i.test(value))phases.push('proof');
  if(/أصلح|اصلح|fix|repair|طوّر|طور|develop|implement/i.test(value))phases.push('repair');
  if(route==='DATA_QUERY'||route==='RUNTIME_STATUS')phases.push('read_only');
  if(route==='EXTERNAL_ACTION')phases.push('external_action');
  if(route==='REPO_CHANGE')phases.push('verification');
  if(/قبل التأكد|قبل التاكد|acceptance|قبول/i.test(value))phases.push('acceptance_gate');
  return [...new Set(phases)].slice(0,8);
}

function fallbackUnderstanding(command,context={},error=''){
  const fallback=routeFallback(command);
  return {
    route:fallback.route,
    reason:fallback.reason,
    risk_level:fallback.risk_level,
    options:[fallback.route,'REVIEW_REQUIRED'],
    situation:{
      what_changed:clean(command,1200),
      why_it_matters:'The owner command must be mapped to one existing governed execution lane before any action is created.',
      affected_goal:clean(context?.goals?.[0]?.title||'DABBIR governed execution',240),
      severity:fallback.risk_level,
      known_facts:[fallback.reason],
      unknowns:error?[`semantic_understanding_unavailable:${clean(error,120)}`]:['semantic understanding unavailable'],
    },
    required_phases:requiredPhases(command,fallback.route),
    memory_refs_used:[],
    understanding_source:['OWNER_GATE','MULTI_STEP'].includes(fallback.route)?'HARD_SAFETY_OR_STRUCTURE_GATE':'DETERMINISTIC_FALLBACK',
  };
}

function taskFromText(text,index){
  const commandText=clean(String(text||'').replace(/^\s*(?:\d+[.)]|[-•])\s*/,'').trim(),1600);
  if(commandText.length<4)throw new Error('PLAN_TASK_TEXT_INVALID');
  const classified=classifyAutomationTask(commandText);
  if(classified.kind==='OWNER_GATE')throw new Error('PLAN_OWNER_GATE_REQUIRED');
  return {title:clean(commandText,180),command_text:commandText,kind:classified.kind,risk_level:classified.risk_level,sequence:index+1};
}

export function deterministicPlan(command){
  const normalized=String(command||'').replace(/\\n/g,'\n');
  const lines=normalized.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const marked=lines.filter(x=>/^(?:\d+[.)]|[-•])\s+/.test(x));
  if(marked.length<2)return null;
  const tasks=marked.slice(0,12).map((line,index)=>taskFromText(line,index));
  return {source:'DETERMINISTIC_LIST',tasks};
}

async function gatewayCredential(env=process.env){
  if(env.AI_GATEWAY_API_KEY)return String(env.AI_GATEWAY_API_KEY);
  if(env.VERCEL_OIDC_TOKEN)return String(env.VERCEL_OIDC_TOKEN);
  try{return String(await getVercelOidcToken()||'')}catch{return ''}
}

function parseJson(payload){
  let value=String(payload?.choices?.[0]?.message?.content||'').trim();
  value=value.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(value)}catch{return null}
}

export async function understandExecutiveCommand(command,context={},env=process.env){
  const fallback=fallbackUnderstanding(command,context);
  if(['OWNER_GATE','MULTI_STEP'].includes(fallback.route))return fallback;
  const credential=await gatewayCredential(env);
  if(!credential)return fallbackUnderstanding(command,context,'AI_GATEWAY_CREDENTIAL_MISSING');
  const model=clean(env.BARMAN_AI_GATEWAY_MODEL||env.DABBIR_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const schema={
    type:'object',
    properties:{
      route:{type:'string',enum:[...EXECUTIVE_ROUTES]},
      reason:{type:'string'},
      risk_level:{type:'string',enum:[...ALLOWED_RISKS]},
      options:{type:'array',minItems:2,maxItems:5,items:{type:'string'}},
      situation:{
        type:'object',
        properties:{
          what_changed:{type:'string'},why_it_matters:{type:'string'},affected_goal:{type:'string'},severity:{type:'string'},
          known_facts:{type:'array',items:{type:'string'},maxItems:8},unknowns:{type:'array',items:{type:'string'},maxItems:8},
        },
        required:['what_changed','why_it_matters','affected_goal','severity','known_facts','unknowns'],additionalProperties:false,
      },
      required_phases:{type:'array',maxItems:8,items:{type:'string',enum:['investigation','root_cause','proof','repair','verification','acceptance_gate','read_only','external_action']}},
      memory_refs_used:{type:'array',maxItems:5,items:{type:'integer'}},
    },
    required:['route','reason','risk_level','options','situation','required_phases','memory_refs_used'],additionalProperties:false,
  };
  const allowedMemoryIds=new Set((Array.isArray(context?.memories)?context.memories:[]).map(x=>Number(x?.id)).filter(Number.isInteger));
  const system=[
    'You are the semantic understanding step inside the existing BARMAN Executive OS. Do not execute anything.',
    'Understand the whole owner situation before choosing an existing execution route.',
    'Use RUNTIME_STATUS only for live system-health/status requests, REPO_CHANGE only when source mutation is required, DATA_QUERY for read-only business/data facts, EXTERNAL_ACTION for non-financial outside actions, MULTI_STEP for dependent multi-job objectives, REVIEW_REQUIRED when a safe existing executor is not established, and OWNER_GATE for legal/payment/KYC/OTP/card/binding owner-only authority.',
    'Preserve investigation, root-cause, proof, repair, verification and acceptance-gate requirements explicitly in required_phases; never collapse them into the route label.',
    'You may use only the supplied verified executive memories and only when materially similar. Put only memory IDs that actually changed or materially informed your reason in memory_refs_used.',
    'Choose an affected goal from the supplied active goals when applicable. Return JSON only.',
  ].join('\n');
  try{
    const response=await fetch(GATEWAY_ENDPOINT,{
      method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
      body:JSON.stringify({
        model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({owner_command:clean(command,4000),executive_context:context})}],
        temperature:0.05,max_tokens:1600,stream:false,
        response_format:{type:'json_schema',json_schema:{name:'barman_executive_understanding',description:'BARMAN situation understanding before route selection',schema}},
      }),
      signal:AbortSignal.timeout(25000),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`EXECUTIVE_UNDERSTANDING_HTTP_${response.status}`);
    const parsed=parseJson(payload);
    if(!parsed||!EXECUTIVE_ROUTES.has(String(parsed.route||'').toUpperCase()))throw new Error('EXECUTIVE_UNDERSTANDING_INVALID_JSON');
    if(ownerGate(command)&&String(parsed.route).toUpperCase()!=='OWNER_GATE')throw new Error('EXECUTIVE_UNDERSTANDING_OWNER_GATE_BYPASS');
    return {
      route:String(parsed.route).toUpperCase(),reason:clean(parsed.reason,1600),risk_level:ALLOWED_RISKS.has(String(parsed.risk_level).toUpperCase())?String(parsed.risk_level).toUpperCase():'MEDIUM',
      options:Array.isArray(parsed.options)?parsed.options.map(x=>clean(x,240)).filter(Boolean).slice(0,5):[],
      situation:parsed.situation||fallback.situation,
      required_phases:Array.isArray(parsed.required_phases)?parsed.required_phases.slice(0,8):requiredPhases(command,parsed.route),
      memory_refs_used:Array.isArray(parsed.memory_refs_used)?parsed.memory_refs_used.map(Number).filter(id=>Number.isInteger(id)&&allowedMemoryIds.has(id)).slice(0,5):[],
      understanding_source:'AI_GATEWAY',model,
    };
  }catch(error){return fallbackUnderstanding(command,context,error?.message||error)}
}

function validatedTasks(raw){
  if(!Array.isArray(raw)||raw.length<2||raw.length>12)throw new Error('PLAN_TASKS_INVALID');
  return raw.map((item,index)=>{
    const commandText=clean(item?.command_text,1600);
    if(commandText.length<4)throw new Error('PLAN_TASK_TEXT_INVALID');
    if(ownerGate(commandText)||String(item?.kind||'').toUpperCase()==='OWNER_GATE')throw new Error('PLAN_OWNER_GATE_REQUIRED');
    const inferred=classifyAutomationTask(commandText);
    const requestedKind=String(item?.kind||'').toUpperCase();
    const kind=ALLOWED_KINDS.has(requestedKind)?requestedKind:inferred.kind;
    const requestedRisk=String(item?.risk_level||'').toUpperCase();
    const riskLevel=ALLOWED_RISKS.has(requestedRisk)?requestedRisk:inferred.risk_level;
    return {title:clean(item?.title||commandText,180),command_text:commandText,kind,risk_level:riskLevel,sequence:index+1};
  });
}

export async function planExecutiveCommand(command,env=process.env){
  if(ownerGate(command))throw new Error('PLAN_OWNER_GATE_REQUIRED');
  const deterministic=deterministicPlan(command);
  if(deterministic)return deterministic;
  const credential=await gatewayCredential(env);
  if(!credential)throw new Error('PLANNER_GATEWAY_CREDENTIAL_MISSING');
  const model=clean(env.BARMAN_AI_GATEWAY_MODEL||env.DABBIR_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const schema={type:'object',properties:{tasks:{type:'array',minItems:2,maxItems:8,items:{type:'object',properties:{title:{type:'string'},command_text:{type:'string'},kind:{type:'string',enum:['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED']},risk_level:{type:'string',enum:['LOW','MEDIUM','HIGH','CRITICAL']}},required:['title','command_text','kind','risk_level'],additionalProperties:false}}},required:['tasks'],additionalProperties:false};
  const system=[
    'You are the planning engine for BARMAN Executive OS.',
    'Decompose one owner objective into 2-8 independently executable tasks in the correct dependency order.',
    'Use REPO_CHANGE for source-code changes, DATA_QUERY for read-only facts, EXTERNAL_ACTION for non-financial external actions, and REVIEW_REQUIRED only when a safe executor is not yet available.',
    'Never include payment, money transfer, KYC, OTP, legal signature, card data, secrets, or credential collection. Those are owner-only and must not be decomposed.',
    'Do not claim work is complete. Do not invent evidence. Return JSON only.',
  ].join('\n');
  const response=await fetch(GATEWAY_ENDPOINT,{
    method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
    body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({owner_objective:clean(command,4000)})}],temperature:0.05,max_tokens:1800,stream:false,response_format:{type:'json_schema',json_schema:{name:'barman_executive_plan',description:'BARMAN governed execution plan',schema}}}),
    signal:AbortSignal.timeout(20000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`PLANNER_GATEWAY_HTTP_${response.status}`);
  const parsed=parseJson(payload);
  if(!parsed)throw new Error('PLANNER_GATEWAY_INVALID_JSON');
  return {source:'AI_GATEWAY',model,tasks:validatedTasks(parsed.tasks)};
}

function number(value){return Number.isFinite(Number(value))?Number(value):0}
const REGISTERED_ACCOUNT_QUESTION=/(?:العملاء|المستخدم(?:ون|ين)|الحسابات?)\s+(?:ال)?مسجل(?:ون|ين|ة)?|(?:ال)?مسجل(?:ون|ين)\s+(?:في|بـ?)\s*(?:دبر|dabbir)|registered\s+(?:accounts?|users?|customers?)/i;
const BUSINESS_CUSTOMER_QUESTION=/(?:زبائن|عملاء)\s+(?:الأنشطة|الانشطة|النشاط|الأعمال|الاعمال|المتجر)|business\s+customers?/i;

export function readMetricForQuestion(command){
  const q=clean(command,4000).toLowerCase();
  if(REGISTERED_ACCOUNT_QUESTION.test(q))return 'REGISTERED_ACCOUNTS_TOTAL';
  if(BUSINESS_CUSTOMER_QUESTION.test(q))return 'CUSTOMERS_TOTAL';
  if(/مسجل|حساب|account|user/.test(q))return 'REGISTERED_ACCOUNTS_TOTAL';
  if(/زبائن|customers?/.test(q))return 'CUSTOMERS_TOTAL';
  if(/حجز|موعد|appointment|booking/.test(q))return 'APPOINTMENTS_TOTAL';
  if(/طلب|orders?/.test(q))return 'ORDERS_TOTAL';
  if(/عمل|business|tenant/.test(q))return 'BUSINESSES_TOTAL';
  return 'EXECUTIVE_SNAPSHOT';
}

export function readOnlyAnswer(command,snapshot){
  const accounts=number(snapshot?.registered_accounts?.total),businesses=number(snapshot?.businesses?.total),customers=number(snapshot?.customers?.total),appointments=number(snapshot?.appointments?.total),orders=number(snapshot?.orders?.total);
  let metric='EXECUTIVE_SNAPSHOT';
  let summary=`الحالة الحية: ${accounts} حسابات DABBIR مسجلة، ${businesses} أعمال، ${customers} زبائن داخل أعمال العملاء، ${appointments} حجوزات، و${orders} طلبات.`;
  let expected={registered_accounts_total:accounts,businesses_total:businesses,customers_total:customers,appointments_total:appointments,orders_total:orders};
  const requestedMetric=readMetricForQuestion(command);
  if(requestedMetric==='REGISTERED_ACCOUNTS_TOTAL'){metric='REGISTERED_ACCOUNTS_TOTAL';expected={registered_accounts_total:accounts};summary=`عدد الحسابات الفعلية المسجلة في DABBIR حاليًا: ${accounts}.`;}
  else if(requestedMetric==='CUSTOMERS_TOTAL'){metric='CUSTOMERS_TOTAL';expected={customers_total:customers};summary=`عدد زبائن الأنشطة المسجلين داخل DABBIR حاليًا: ${customers}.`;}
  else if(requestedMetric==='APPOINTMENTS_TOTAL'){metric='APPOINTMENTS_TOTAL';expected={appointments_total:appointments};summary=`إجمالي الحجوزات المسجلة حاليًا: ${appointments}.`;}
  else if(requestedMetric==='ORDERS_TOTAL'){metric='ORDERS_TOTAL';expected={orders_total:orders};summary=`إجمالي الطلبات المسجلة حاليًا: ${orders}.`;}
  else if(requestedMetric==='BUSINESSES_TOTAL'){metric='BUSINESSES_TOTAL';expected={businesses_total:businesses};summary=`إجمالي سجلات الأعمال في DABBIR حاليًا: ${businesses}.`;}
  return {metric,summary,expected};
}

export function snapshotMetrics(snapshot){
  return {registered_accounts_total:number(snapshot?.registered_accounts?.total),businesses_total:number(snapshot?.businesses?.total),customers_total:number(snapshot?.customers?.total),appointments_total:number(snapshot?.appointments?.total),orders_total:number(snapshot?.orders?.total)};
}
