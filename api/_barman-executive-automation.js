import { getVercelOidcToken } from '@vercel/oidc';

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='minimax/minimax-m3-free';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const ALLOWED_KINDS=new Set(['REPO_CHANGE','DATA_QUERY','EXTERNAL_ACTION','REVIEW_REQUIRED']);
const ALLOWED_RISKS=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);

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

function number(value){return Number.isFinite(Number(value))?Number(value):0}

export function readOnlyAnswer(command,snapshot){
  const q=clean(command,4000).toLowerCase();
  const accounts=number(snapshot?.registered_accounts?.total);
  const businesses=number(snapshot?.businesses?.total);
  const customers=number(snapshot?.customers?.total);
  const appointments=number(snapshot?.appointments?.total);
  const orders=number(snapshot?.orders?.total);
  let metric='EXECUTIVE_SNAPSHOT';
  let summary=`الحالة الحية: ${accounts} حسابات DABBIR مسجلة، ${businesses} أعمال، ${customers} زبائن داخل أعمال العملاء، ${appointments} حجوزات، و${orders} طلبات.`;
  let expected={registered_accounts_total:accounts,businesses_total:businesses,customers_total:customers,appointments_total:appointments,orders_total:orders};
  if(/مسجل|حساب|account|user/.test(q)){
    metric='REGISTERED_ACCOUNTS_TOTAL';expected={registered_accounts_total:accounts};
    summary=`عدد الحسابات الفعلية المسجلة في DABBIR حاليًا: ${accounts}.`;
  }else if(/زبائن|customers?/.test(q)){
    metric='CUSTOMERS_TOTAL';expected={customers_total:customers};
    summary=`عدد زبائن الأنشطة المسجلين داخل DABBIR حاليًا: ${customers}.`;
  }else if(/حجز|موعد|appointment|booking/.test(q)){
    metric='APPOINTMENTS_TOTAL';expected={appointments_total:appointments};
    summary=`إجمالي الحجوزات المسجلة حاليًا: ${appointments}.`;
  }else if(/طلب|orders?/.test(q)){
    metric='ORDERS_TOTAL';expected={orders_total:orders};
    summary=`إجمالي الطلبات المسجلة حاليًا: ${orders}.`;
  }else if(/عمل|business|tenant/.test(q)){
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
