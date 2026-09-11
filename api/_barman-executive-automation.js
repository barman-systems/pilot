import { getVercelOidcToken } from '@vercel/oidc';

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='minimax/minimax-m3-free';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const ALLOWED_KINDS=new Set(['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED']);
const ALLOWED_RISKS=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
const EXECUTIVE_ROUTES=new Set(['REPO_CHANGE','DATA_QUERY','RUNTIME_CHECK','MULTI_STEP','EXTERNAL_ACTION','REVIEW_REQUIRED','OWNER_GATE']);
const EXECUTIVE_SEVERITIES=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
const HEALTH_STATES=new Set(['HEALTHY','DEGRADED','UNKNOWN']);

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

function taskFromText(text,index){
  const commandText=clean(String(text||'').replace(/^\s*(?:\d+[.)]|[-•])\s*/,'').trim(),1600);
  if(commandText.length<4)throw new Error('PLAN_TASK_TEXT_INVALID');
  const classified=classifyAutomationTask(commandText);
  if(classified.kind==='OWNER_GATE')throw new Error('PLAN_OWNER_GATE_REQUIRED');
  return {
    title:clean(commandText,180),
    command_text:commandText,
    kind:classified.kind,
    risk_level:classified.risk_level,
    sequence:index+1,
  };
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

function list(value,max=12,itemMax=500){
  return Array.isArray(value)?value.map(item=>clean(item,itemMax)).filter(Boolean).slice(0,max):[];
}
function healthDomains(value={}){
  const result={};
  for(const key of ['infrastructure','runtime','product','customer','economic','strategic']){
    const state=String(value?.[key]||'UNKNOWN').toUpperCase();
    result[key]=HEALTH_STATES.has(state)?state:'UNKNOWN';
  }
  return result;
}
function safeReality(value={}){
  const confidence=Math.max(0,Math.min(1,Number(value?.confidence)||0));
  return {
    source:clean(value?.source||'UNAVAILABLE',160),
    observed_at:clean(value?.observed_at||'',80),
    freshness:clean(value?.freshness||'UNKNOWN',40).toUpperCase(),
    confidence,
    subject:clean(value?.subject||'DABBIR',160),
    evidence_refs:list(value?.evidence_refs,12,500),
    healthy:value?.healthy===true,
    commit_sha:clean(value?.commit_sha||'UNAVAILABLE',80),
  };
}
function failClosedUnderstanding(command,reality,reason,route='REVIEW_REQUIRED'){
  return {
    source:'FAIL_CLOSED',
    route,
    situation:{
      what_changed:clean(command,800),
      why_it_matters:'لا توجد دلالة كافية تسمح باختيار مسار تنفيذي مستقل بأمان.',
      affected_goal:'',
      severity:route==='OWNER_GATE'?'CRITICAL':'MEDIUM',
      known_facts:[],
      unknowns:[reason],
      freshness:reality.freshness,
      confidence:reality.confidence,
      evidence_refs:reality.evidence_refs,
      health_domains:healthDomains({}),
    },
    decision:{
      options:route==='OWNER_GATE'?['OWNER_REQUIRED','NO_EXECUTION']:['REVIEW_REQUIRED','NO_EXECUTION'],
      chosen_option:route==='OWNER_GATE'?'OWNER_REQUIRED':'REVIEW_REQUIRED',
      reason,
      risk:route==='OWNER_GATE'?'CRITICAL':'MEDIUM',
      expected_outcome:'لا تنفيذ مستقل قبل اكتمال الفهم أو صلاحية المالك.',
      rollback:'NO_MUTATION',
      owner_required:route==='OWNER_GATE',
      memory_refs:[],
    },
  };
}

export async function understandExecutiveSituation(command,context={},env=process.env){
  const commandText=clean(command,4000);
  const reality=safeReality(context?.reality||{});
  const goals=Array.isArray(context?.goals)?context.goals.slice(0,12).map(goal=>({id:clean(goal?.id,80),title:clean(goal?.title,240),objective:clean(goal?.objective,800),status:clean(goal?.status,40),priority:Number(goal?.priority)||4})).filter(goal=>goal.id):[];
  const memories=Array.isArray(context?.memory)?context.memory.slice(0,20).map(item=>({id:String(item?.id||''),memory_key:clean(item?.memory_key,180),confidence:Number(item?.confidence)||0,value:item?.value&&typeof item.value==='object'?item.value:{}})).filter(item=>item.id):[];
  if(!commandText)return failClosedUnderstanding('',reality,'EMPTY_COMMAND');
  if(ownerGate(commandText))return failClosedUnderstanding(commandText,reality,'OWNER_ONLY_AUTHORITY','OWNER_GATE');
  const credential=await gatewayCredential(env);
  if(!credential)return failClosedUnderstanding(commandText,reality,'SEMANTIC_GATEWAY_CREDENTIAL_MISSING');
  const model=clean(env.BARMAN_AI_GATEWAY_MODEL||env.DABBIR_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const schema={
    type:'object',
    properties:{
      route:{type:'string',enum:['REPO_CHANGE','DATA_QUERY','RUNTIME_CHECK','MULTI_STEP','EXTERNAL_ACTION','REVIEW_REQUIRED']},
      situation:{
        type:'object',
        properties:{
          what_changed:{type:'string'},why_it_matters:{type:'string'},affected_goal:{type:'string'},
          severity:{type:'string',enum:['LOW','MEDIUM','HIGH','CRITICAL']},
          known_facts:{type:'array',items:{type:'string'},maxItems:10},
          unknowns:{type:'array',items:{type:'string'},maxItems:10},
          evidence_refs:{type:'array',items:{type:'string'},maxItems:12},
          health_domains:{type:'object',properties:{
            infrastructure:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
            runtime:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
            product:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
            customer:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
            economic:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
            strategic:{type:'string',enum:['HEALTHY','DEGRADED','UNKNOWN']},
          },required:['infrastructure','runtime','product','customer','economic','strategic'],additionalProperties:false},
        },
        required:['what_changed','why_it_matters','affected_goal','severity','known_facts','unknowns','evidence_refs','health_domains'],additionalProperties:false,
      },
      decision:{
        type:'object',
        properties:{
          options:{type:'array',items:{type:'string'},minItems:2,maxItems:5},chosen_option:{type:'string'},reason:{type:'string'},
          risk:{type:'string',enum:['LOW','MEDIUM','HIGH','CRITICAL']},expected_outcome:{type:'string'},rollback:{type:'string'},owner_required:{type:'boolean'},
          memory_refs:{type:'array',items:{type:'string'},maxItems:8},
        },
        required:['options','chosen_option','reason','risk','expected_outcome','rollback','owner_required','memory_refs'],additionalProperties:false,
      },
    },
    required:['route','situation','decision'],additionalProperties:false,
  };
  const system=[
    'You are the existing BARMAN Executive OS reasoning stage for DABBIR. Do not invent a new architecture.',
    'Understand the current situation BEFORE execution routing. Keyword matching is not semantic understanding.',
    'Return RUNTIME_CHECK for a live DABBIR health/status check that requires the existing public runtime probes; DATA_QUERY for read-only database facts; REPO_CHANGE for one repository change; MULTI_STEP for objectives requiring multiple dependent actions; EXTERNAL_ACTION only for non-financial external actions; and REVIEW_REQUIRED when safe execution is not established.',
    'Owner-only OTP, KYC, legal signatures and payments are already hard-gated before you are called and must never be authorized here.',
    'Use only supplied facts. Unknown business/product/customer/economic state must remain UNKNOWN, never infer HEALTHY from green infrastructure.',
    'For incidents with multiple degraded business, customer, or economic signals, compare at least three distinct safe options before choosing one.',
    'affected_goal must be one supplied goal id or empty. memory_refs must contain only supplied memory ids.',
    'If a supplied memory is materially relevant, cite it in memory_refs and explain its effect in the decision reason. Never cite irrelevant memory.',
    'Choose the lowest-risk option that advances the affected goal and has an explicit rollback/containment path. Do not claim completion.',
  ].join('\n');
  const userContent=JSON.stringify({command:commandText,reality,goals,memory:memories});
  const requestUnderstanding=async retry=>{
    const correction=retry?'\nThe previous response was not valid JSON. Return exactly one JSON object matching the supplied schema. No markdown and no prose outside JSON. Preserve evidence discipline, owner boundaries, health-domain truth, and fail-closed safety.':'';
    const response=await fetch(GATEWAY_ENDPOINT,{
      method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
      body:JSON.stringify({
        model,
        messages:[{role:'system',content:system+correction},{role:'user',content:userContent}],
        temperature:retry?0:0.05,max_tokens:1800,stream:false,
        response_format:{type:'json_schema',json_schema:{name:'barman_executive_situation_decision',description:'Durable executive situation and decision',schema}},
      }),
      signal:AbortSignal.timeout(20000),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`EXECUTIVE_UNDERSTANDING_GATEWAY_HTTP_${response.status}`);
    return parseJson(payload);
  };
  try{
    let parsed=await requestUnderstanding(false);
    if(!parsed)parsed=await requestUnderstanding(true);
    if(!parsed)throw new Error('EXECUTIVE_UNDERSTANDING_INVALID_JSON');
    const route=String(parsed.route||'REVIEW_REQUIRED').toUpperCase();
    if(!EXECUTIVE_ROUTES.has(route)||route==='OWNER_GATE')throw new Error('EXECUTIVE_ROUTE_INVALID');
    const goalIds=new Set(goals.map(goal=>goal.id));
    const memoryIds=new Set(memories.map(item=>item.id));
    const situation={
      what_changed:clean(parsed.situation?.what_changed||commandText,1200),
      why_it_matters:clean(parsed.situation?.why_it_matters,1200),
      affected_goal:goalIds.has(clean(parsed.situation?.affected_goal,80))?clean(parsed.situation?.affected_goal,80):'',
      severity:EXECUTIVE_SEVERITIES.has(String(parsed.situation?.severity||'').toUpperCase())?String(parsed.situation.severity).toUpperCase():'MEDIUM',
      known_facts:list(parsed.situation?.known_facts,10,600),
      unknowns:list(parsed.situation?.unknowns,10,600),
      freshness:reality.freshness,
      confidence:reality.confidence,
      evidence_refs:[...new Set([...reality.evidence_refs,...list(parsed.situation?.evidence_refs,12,500)])].slice(0,12),
      health_domains:healthDomains(parsed.situation?.health_domains),
    };
    const memoryRefs=list(parsed.decision?.memory_refs,8,80).filter(id=>memoryIds.has(id));
    const decision={
      options:list(parsed.decision?.options,5,800),
      chosen_option:clean(parsed.decision?.chosen_option,1000),
      reason:clean(parsed.decision?.reason,1600),
      risk:ALLOWED_RISKS.has(String(parsed.decision?.risk||'').toUpperCase())?String(parsed.decision.risk).toUpperCase():situation.severity,
      expected_outcome:clean(parsed.decision?.expected_outcome,1200),
      rollback:clean(parsed.decision?.rollback,1200)||'NO_MUTATION',
      owner_required:parsed.decision?.owner_required===true,
      memory_refs:memoryRefs,
    };
    if(decision.options.length<2||!decision.chosen_option||!decision.reason)return failClosedUnderstanding(commandText,reality,'EXECUTIVE_DECISION_INCOMPLETE');
    return {source:'AI_GATEWAY',model,route,situation,decision};
  }catch(error){
    return {...failClosedUnderstanding(commandText,reality,clean(error?.message||error,240)),model};
  }
}

export async function planExecutiveCommand(command,env=process.env){
  if(ownerGate(command))throw new Error('PLAN_OWNER_GATE_REQUIRED');
  const deterministic=deterministicPlan(command);
  if(deterministic)return deterministic;
  const credential=await gatewayCredential(env);
  if(!credential)throw new Error('PLANNER_GATEWAY_CREDENTIAL_MISSING');
  const model=clean(env.BARMAN_AI_GATEWAY_MODEL||env.DABBIR_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const schema={
    type:'object',
    properties:{
      tasks:{type:'array',minItems:2,maxItems:8,items:{type:'object',properties:{title:{type:'string'},command_text:{type:'string'},kind:{type:'string',enum:['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED']},risk_level:{type:'string',enum:['LOW','MEDIUM','HIGH','CRITICAL']}},required:['title','command_text','kind','risk_level'],additionalProperties:false}},
    },
    required:['tasks'],additionalProperties:false,
  };
  const system=[
    'You are the planning engine for BARMAN Executive OS.',
    'Decompose one owner objective into 2-8 independently executable tasks in the correct dependency order.',
    'Use REPO_CHANGE for source-code changes, DATA_QUERY for read-only facts, EXTERNAL_ACTION for non-financial external actions, and REVIEW_REQUIRED only when a safe executor is not yet available.',
    'Never include payment, money transfer, KYC, OTP, legal signature, card data, secrets, or credential collection. Those are owner-only and must not be decomposed.',
    'Do not claim work is complete. Do not invent evidence. Return JSON only.',
  ].join('\n');
  const response=await fetch(GATEWAY_ENDPOINT,{
    method:'POST',
    headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
    body:JSON.stringify({
      model,
      messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({owner_objective:clean(command,4000)})}],
      temperature:0.05,
      max_tokens:1800,
      stream:false,
      response_format:{type:'json_schema',json_schema:{name:'barman_executive_plan',description:'BARMAN governed execution plan',schema}},
    }),
    signal:AbortSignal.timeout(20000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`PLANNER_GATEWAY_HTTP_${response.status}`);
  const parsed=parseJson(payload);
  if(!parsed)throw new Error('PLANNER_GATEWAY_INVALID_JSON');
  return {source:'AI_GATEWAY',model,tasks:validatedTasks(parsed.tasks)};
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
    return {
      title:clean(item?.title||commandText,180),
      command_text:commandText,
      kind,
      risk_level:riskLevel,
      sequence:index+1,
    };
  });
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
  const accounts=number(snapshot?.registered_accounts?.total);
  const businesses=number(snapshot?.businesses?.total);
  const customers=number(snapshot?.customers?.total);
  const appointments=number(snapshot?.appointments?.total);
  const orders=number(snapshot?.orders?.total);
  let metric='EXECUTIVE_SNAPSHOT';
  let summary=`الحالة الحية: ${accounts} حسابات DABBIR مسجلة، ${businesses} أعمال، ${customers} زبائن داخل أعمال العملاء، ${appointments} حجوزات، و${orders} طلبات.`;
  let expected={registered_accounts_total:accounts,businesses_total:businesses,customers_total:customers,appointments_total:appointments,orders_total:orders};
  const requestedMetric=readMetricForQuestion(command);
  if(requestedMetric==='REGISTERED_ACCOUNTS_TOTAL'){
    metric='REGISTERED_ACCOUNTS_TOTAL';expected={registered_accounts_total:accounts};
    summary=`عدد الحسابات الفعلية المسجلة في DABBIR حاليًا: ${accounts}.`;
  }else if(requestedMetric==='CUSTOMERS_TOTAL'){
    metric='CUSTOMERS_TOTAL';expected={customers_total:customers};
    summary=`عدد زبائن الأنشطة المسجلين داخل DABBIR حاليًا: ${customers}.`;
  }else if(requestedMetric==='APPOINTMENTS_TOTAL'){
    metric='APPOINTMENTS_TOTAL';expected={appointments_total:appointments};
    summary=`إجمالي الحجوزات المسجلة حاليًا: ${appointments}.`;
  }else if(requestedMetric==='ORDERS_TOTAL'){
    metric='ORDERS_TOTAL';expected={orders_total:orders};
    summary=`إجمالي الطلبات المسجلة حاليًا: ${orders}.`;
  }else if(requestedMetric==='BUSINESSES_TOTAL'){
    metric='BUSINESSES_TOTAL';expected={businesses_total:businesses};
    summary=`إجمالي سجلات الأعمال في DABBIR حاليًا: ${businesses}.`;
  }
  return {metric,summary,expected};
}

export function snapshotMetrics(snapshot){
  return {
    registered_accounts_total:number(snapshot?.registered_accounts?.total),
    businesses_total:number(snapshot?.businesses?.total),
    customers_total:number(snapshot?.customers?.total),
    appointments_total:number(snapshot?.appointments?.total),
    orders_total:number(snapshot?.orders?.total),
  };
}
