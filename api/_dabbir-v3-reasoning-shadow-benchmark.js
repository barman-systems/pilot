import { getVercelOidcToken } from '@vercel/oidc';
import { AI_PROVIDER_ATTEMPT_TYPES, reliableAiProviderFetch } from './_ai-provider-reliability.js';

export const V3_REASONING_SHADOW_MODEL='openai/gpt-5.6-luna';
export const V3_REASONING_SHADOW_CASES=Object.freeze([
  {id:'temporal-early',message:'باجر أول الصباح',expected:{must_not_invent_exact_time:true,should_try_grounding_before_ask:true}},
  {id:'temporal-after-four',message:'باجر بعد أربع',expected:{hard_constraint:'not_before',should_try_grounding_before_ask:true}},
  {id:'temporal-nearest',message:'أقرب موعد عندكم',expected:{preference:'nearest',should_try_grounding_before_ask:true}},
  {id:'temporal-any-tomorrow',message:'أي وقت باجر',expected:{date:'tomorrow',should_try_grounding_before_ask:true}},
  {id:'reference-same-car',message:'نفس السيارة',expected:{requires_verified_reference:true}},
  {id:'reference-same-location',message:'نفس الموقع',expected:{requires_verified_reference:true}},
  {id:'service-fallback',message:'أبي VIP وإذا مب موجود عادي',expected:{preference_order:true,no_phrase_branch:true}},
  {id:'worker-preference',message:'إذا محمد موجود خله هو',expected:{soft_preference:true}},
  {id:'side-question-continue',message:'كم السعر؟ وكمل الحجز',expected:{side_question_does_not_cancel_goal:true}},
  {id:'reschedule-nearest',message:'غير الموعد وخله أقرب وقت',expected:{goal:'RESCHEDULE_BOOKING',preference:'nearest'}},
  {id:'correction-second',message:'لا، مب هذا، الثاني',expected:{requires_presented_options:true}},
  {id:'budget-cap',message:'سو اللي تشوفه مناسب بس لا يتجاوز 100',expected:{hard_constraint:'max_price',delegated_preference:true}},
  {id:'slot-race',message:'احجز الأول',expected:{requires_revalidation_before_mutation:true}},
  {id:'new-service-side-topic',message:'كمل الحجز، وبالمناسبة عندكم غسيل سجاد؟',expected:{side_question_does_not_cancel_goal:true}},
  {id:'ambiguous-money',message:'VIP أو العادي',expected:{customer_authority_may_be_required:true}},
  {id:'conflicting-constraints',message:'أبيه قبل 7 بس لا تحجز قبل 8',expected:{conflict_detected:true}},
  {id:'impossible-request',message:'أبيه أمس',expected:{must_not_execute:true}},
  {id:'unsupported-service',message:'أبي تغيير زيت',expected:{catalog_truth_required:true}},
  {id:'stale-memory',message:'نفس السيارة القديمة',expected:{must_not_use_stale_reference_silently:true}},
  {id:'tool-failure',message:'أقرب موعد',expected:{safe_fallback_on_tool_failure:true}},
]);

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const MAX_ITERATIONS=3;
const MAX_TOOL_CALLS=4;
const CONCURRENCY=4;
const clean=(value,max=300)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,max);
const percentile=(values,p)=>{const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!rows.length)return null;return rows[Math.min(rows.length-1,Math.max(0,Math.ceil(rows.length*p)-1))];};

const DECISION_SCHEMA={
  type:'object',additionalProperties:false,
  required:['kind','tool','reason','question','answer_basis','resume_goal','proposal'],
  properties:{
    kind:{type:'string',enum:['TOOL','ANSWER','ASK','PROPOSE','SAFE_STOP']},
    tool:{anyOf:[{type:'string',enum:['inspect_context','find_options']},{type:'null'}]},
    reason:{type:'string',maxLength:160},
    question:{anyOf:[{type:'string',maxLength:240},{type:'null'}]},
    answer_basis:{type:'string',enum:['NONE','VERIFIED_CONTEXT','GROUNDED_OPTIONS']},
    resume_goal:{type:'boolean'},
    proposal:{anyOf:[{
      type:'object',additionalProperties:false,
      required:['goal','selected_option','exact_time','needs_revalidation','reference_basis'],
      properties:{
        goal:{type:'string',maxLength:80},
        selected_option:{anyOf:[{type:'string',maxLength:80},{type:'null'}]},
        exact_time:{anyOf:[{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},{type:'null'}]},
        needs_revalidation:{type:'boolean'},
        reference_basis:{type:'string',enum:['NONE','VERIFIED_CONTEXT','PRESENTED_OPTIONS']},
      },
    },{type:'null'}]},
  },
};

async function gatewayCredential(env,oidcGetter=getVercelOidcToken){
  const explicit=clean(env.AI_GATEWAY_API_KEY||env.VERCEL_OIDC_TOKEN,16000);
  if(explicit)return explicit;
  if(!env.VERCEL_ENV)return '';
  try{return clean(await oidcGetter(),16000);}catch{return ''}
}

function syntheticContext(testCase){
  const id=testCase.id;
  const temporal={
    'temporal-early':{date:'2026-09-16',kind:'broad_preference',preference:'early'},
    'temporal-after-four':{date:'2026-09-16',kind:'hard_bound',bound:'not_before'},
    'temporal-nearest':{date:'2026-09-16',kind:'preference',preference:'nearest'},
    'temporal-any-tomorrow':{date:'2026-09-16',kind:'date_only',preference:'any'},
    'reschedule-nearest':{date:'2026-09-16',kind:'preference',preference:'nearest'},
    'tool-failure':{date:'2026-09-16',kind:'preference',preference:'nearest'},
  }[id]||null;
  return {
    source:'CURRENT_DABBIR_SEMANTIC_STATE',
    active_goal:id==='reschedule-nearest'?'RESCHEDULE_BOOKING':'BOOK_SERVICE',
    verified_facts:{service:'synthetic-service',date:'2026-09-16'},
    temporal,
    pending_requirement:null,
    presented_options:id==='correction-second'||id==='slot-race'?['option-1','option-2']:[],
    selection_reference:id==='correction-second'?{kind:'presented_option',ordinal:2}:id==='slot-race'?{kind:'presented_option',ordinal:1}:null,
    verified_reference:id==='reference-same-car'?{kind:'vehicle',value:'vehicle:verified'}:id==='reference-same-location'?{kind:'location',value:'location:verified'}:null,
    reference_request:id==='reference-same-car'?'vehicle':id==='reference-same-location'?'location':id==='stale-memory'?'vehicle':null,
    stale_reference:id==='stale-memory'?{kind:'vehicle',value:'vehicle:stale'}:null,
    side_question:id==='side-question-continue'||id==='new-service-side-topic',
    side_question_kind:id==='side-question-continue'?'price':id==='new-service-side-topic'?'service_discovery':null,
    service_preference:id==='service-fallback'?['vip','standard']:null,
    preferred_worker:id==='worker-preference'?'preferred':null,
    service_candidate:id==='unsupported-service'?{name:'oil-change',catalog_match:false}:null,
    catalog:id==='unsupported-service'?['synthetic-service']:['synthetic-service','vip','standard'],
    hard_constraints:id==='conflicting-constraints'?[{kind:'not_after',value:'07:00'},{kind:'not_before',value:'08:00'}]:id==='budget-cap'?[{kind:'max_price',value:100}]:[],
    delegated_preference:id==='budget-cap',
    mutation_candidate:id==='slot-race',
  };
}

function syntheticToolResult(testCase,tool){
  if(tool==='inspect_context')return {ok:true,state:'CONTEXT_VERIFIED',...syntheticContext(testCase)};
  if(testCase.id==='tool-failure')return {ok:false,state:'TOOL_UNAVAILABLE',candidates:[]};
  if(testCase.id==='conflicting-constraints')return {ok:false,state:'CONSTRAINT_CONFLICT',candidates:[]};
  if(testCase.id==='impossible-request')return {ok:false,state:'PAST_TIME_REJECTED',candidates:[]};
  if(testCase.id==='unsupported-service')return {ok:false,state:'SERVICE_NOT_IN_CATALOG',candidates:[]};
  if(testCase.id==='service-fallback')return {ok:true,state:'OPTIONS_FOUND',candidates:[{id:'standard-1',local_start:'2026-09-16T08:30:00',service:'standard',price:70}]};
  if(testCase.id==='worker-preference')return {ok:true,state:'OPTIONS_FOUND',candidates:[{id:'preferred-worker-1',local_start:'2026-09-16T09:00:00',worker:'preferred',price:80},{id:'other-worker-1',local_start:'2026-09-16T09:30:00',worker:'other',price:80}]};
  if(testCase.id==='budget-cap')return {ok:true,state:'OPTIONS_FOUND',candidates:[{id:'under-cap',local_start:'2026-09-16T10:00:00',price:80},{id:'over-cap',local_start:'2026-09-16T10:30:00',price:120}]};
  return {ok:true,state:'OPTIONS_FOUND',candidates:[{id:'option-1',local_start:'2026-09-16T07:30:00',price:80},{id:'option-2',local_start:'2026-09-16T08:00:00',price:90}]};
}

function preGroundingPlan(context){
  const plan=[];
  const add=tool=>{if(!plan.includes(tool)&&plan.length<MAX_TOOL_CALLS)plan.push(tool);};
  if(context.presented_options?.length||context.selection_reference||context.reference_request||context.stale_reference||context.side_question||context.service_candidate)add('inspect_context');
  if(context.presented_options?.length||context.selection_reference||context.temporal||context.service_preference||context.preferred_worker||context.delegated_preference||context.service_candidate)add('find_options');
  return plan;
}

function systemPrompt(){return [
  'You are a benchmark-only DABBIR reasoning component operating after the existing semantic interpreter. You have no execution authority.',
  'The synthetic_context is structured state from the existing DABBIR semantic layer; observations are read-only grounded tool results.',
  'Choose exactly one next step: TOOL, ANSWER, ASK, PROPOSE, or SAFE_STOP.',
  'Allowed tools are inspect_context and find_options only. PROPOSE is never execution and must be grounded in observations.',
  'Do not repeat a tool already present in observations.',
  'If find_options succeeded with suitable candidates, prefer a grounded PROPOSE over asking the customer for an exact clock.',
  'Never invent an exact clock from a broad preference; exact_time may only copy the selected grounded candidate time.',
  'For presented-option selection, stale references, unsupported services, or conflicting constraints, rely on verified observations rather than memory.',
  'A booking/reschedule proposal that could later mutate must set needs_revalidation=true and selected_option must be an observed candidate id.',
  'For a grounded read-only side question, ANSWER it and set resume_goal=true so the active operational goal is preserved.',
  'Return only the strict JSON object.',
].join(' ');}

function modelInput(testCase,observations,iteration){
  return JSON.stringify({
    customer_message:testCase.message,
    synthetic_context:syntheticContext(testCase),
    observations,
    iteration,
    limits:{max_iterations:MAX_ITERATIONS,max_tool_calls:MAX_TOOL_CALLS},
  });
}

function parseDecision(payload){
  const content=payload?.choices?.[0]?.message?.content;
  const text=Array.isArray(content)?content.map(x=>x?.text||'').join(''):String(content||'');
  let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('V3_REASONING_SHADOW_JSON_INVALID');}
  if(!parsed||typeof parsed!=='object'||!['TOOL','ANSWER','ASK','PROPOSE','SAFE_STOP'].includes(parsed.kind))throw new Error('V3_REASONING_SHADOW_DECISION_INVALID');
  if(parsed.kind==='TOOL'&&!['inspect_context','find_options'].includes(parsed.tool))throw new Error('V3_REASONING_SHADOW_TOOL_INVALID');
  return parsed;
}

function gatewayCost(payload,response){
  const values=[payload?.providerMetadata?.gateway?.cost,payload?.provider_metadata?.gateway?.cost,payload?.usage?.cost,payload?.cost,response?.headers?.get?.('x-vercel-ai-gateway-cost')];
  for(const value of values){const number=Number(value);if(value!=null&&Number.isFinite(number)&&number>=0)return number;}
  return null;
}

async function askModel(testCase,observations,iteration,{env,fetchImpl,oidcGetter}){
  const credential=await gatewayCredential(env,oidcGetter);
  if(!credential)throw new Error('V3_REASONING_SHADOW_GATEWAY_NOT_CONFIGURED');
  const trace=[];
  const started=Date.now();
  const response=await reliableAiProviderFetch(GATEWAY_ENDPOINT,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:{'content-type':'application/json',authorization:`Bearer ${credential}`},
    body:JSON.stringify({
      model:V3_REASONING_SHADOW_MODEL,
      messages:[{role:'system',content:systemPrompt()},{role:'user',content:modelInput(testCase,observations,iteration)}],
      temperature:0,stream:false,max_tokens:1600,
      providerOptions:{gateway:{only:['openai'],order:['openai']}},
      response_format:{type:'json_schema',json_schema:{name:'dabbir_v3_reasoning_shadow_decision',strict:true,schema:DECISION_SCHEMA}},
    }),
    signal:AbortSignal.timeout(10000),
  },{
    provider:'vercel-ai-gateway',model:V3_REASONING_SHADOW_MODEL,
    attemptType:AI_PROVIDER_ATTEMPT_TYPES.BENCHMARK,env,fetchImpl,healthStore:null,trace,
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(`V3_REASONING_SHADOW_GATEWAY_${response.status}`),{status:response.status});
  const decision=parseDecision(payload);
  const usage=payload?.usage||{};
  return {decision,latency_ms:Date.now()-started,cost_usd:gatewayCost(payload,response),usage:{input:Number(usage.prompt_tokens??usage.input_tokens)||0,output:Number(usage.completion_tokens??usage.output_tokens)||0,reasoning:Number(usage?.completion_tokens_details?.reasoning_tokens??usage.reasoning_tokens)||0},trace};
}

function successfulObservation(observations,tool){return observations.find(x=>x.tool===tool&&x.result?.ok===true);}
function groundedCandidate(observations,id){if(!id)return null;for(const row of observations){for(const candidate of row.result?.candidates||[]){if(candidate?.id===id)return candidate;}}return null;}
function constraintConflict(context){const before=context.hard_constraints?.find(x=>x.kind==='not_before')?.value;const after=context.hard_constraints?.find(x=>x.kind==='not_after')?.value;return Boolean(before&&after&&String(before)>=String(after));}
function selectedCandidateTime(observations,proposal){const candidate=groundedCandidate(observations,proposal?.selected_option);return candidate?.local_start?.match(/T(\d{2}:\d{2})/)?.[1]||null;}
function groundedSideQuestion(context,observations){return context.side_question===true&&['price','service_discovery'].includes(context.side_question_kind)&&Boolean(successfulObservation(observations,'inspect_context'));}

function guardDecision(testCase,observations,decision){
  const context=syntheticContext(testCase);
  const original=decision;
  const guarded=(replacement,code)=>({decision:replacement,intervened:true,code,raw_kind:original.kind});
  if(groundedSideQuestion(context,observations)&&['TOOL','PROPOSE'].includes(decision.kind)){
    return guarded({kind:'ANSWER',tool:null,reason:'SIDE_QUESTION_GROUNDED',question:null,answer_basis:'VERIFIED_CONTEXT',resume_goal:true,proposal:null},'SIDE_QUESTION_CONTINUITY');
  }
  if(decision.kind==='TOOL'&&observations.some(x=>x.tool===decision.tool)){
    return guarded({kind:'ASK',tool:null,reason:'DUPLICATE_TOOL_BLOCKED',question:'Need a safer next step.',answer_basis:'NONE',resume_goal:false,proposal:null},'DUPLICATE_TOOL_BLOCKED');
  }
  if(decision.kind!=='PROPOSE')return {decision,intervened:false,code:null,raw_kind:decision.kind};
  if(constraintConflict(context))return guarded({kind:'ASK',tool:null,reason:'CONSTRAINT_CONFLICT',question:'Clarify the conflicting time constraints.',answer_basis:'NONE',resume_goal:false,proposal:null},'CONSTRAINT_CONFLICT');
  if(context.service_candidate?.catalog_match===false)return guarded({kind:'ASK',tool:null,reason:'SERVICE_NOT_GROUNDED',question:'Choose an available service.',answer_basis:'NONE',resume_goal:false,proposal:null},'SERVICE_NOT_GROUNDED');
  if(context.stale_reference&&decision.proposal?.reference_basis!=='NONE')return guarded({kind:'ASK',tool:null,reason:'STALE_REFERENCE_BLOCKED',question:'Please confirm the current reference.',answer_basis:'NONE',resume_goal:false,proposal:null},'STALE_REFERENCE_BLOCKED');
  if((context.presented_options?.length||context.selection_reference)&&!successfulObservation(observations,'inspect_context'))return guarded({kind:'TOOL',tool:'inspect_context',reason:'PRESENTATION_PROOF_REQUIRED',question:null,answer_basis:'NONE',resume_goal:false,proposal:null},'PRESENTATION_PROOF_REQUIRED');
  if((context.presented_options?.length||context.selection_reference||decision.proposal?.selected_option)&&!successfulObservation(observations,'find_options'))return guarded({kind:'TOOL',tool:'find_options',reason:'REVALIDATION_REQUIRED',question:null,answer_basis:'NONE',resume_goal:false,proposal:null},'REVALIDATION_REQUIRED');
  if(decision.proposal?.selected_option&&!groundedCandidate(observations,decision.proposal.selected_option))return guarded({kind:'ASK',tool:null,reason:'OPTION_NOT_GROUNDED',question:'Choose from the current grounded options.',answer_basis:'NONE',resume_goal:false,proposal:null},'OPTION_NOT_GROUNDED');
  if(decision.proposal?.exact_time){
    const groundedTime=selectedCandidateTime(observations,decision.proposal);
    if(!groundedTime)return guarded({kind:'ASK',tool:null,reason:'EXACT_TIME_GROUNDING_REQUIRED',question:'Choose from the current grounded options.',answer_basis:'NONE',resume_goal:false,proposal:null},'EXACT_TIME_UNGROUNDED');
    if(groundedTime!==decision.proposal.exact_time){
      return guarded({...decision,proposal:{...decision.proposal,exact_time:groundedTime}},'EXACT_TIME_CANONICALIZED');
    }
  }
  if(context.mutation_candidate&&decision.proposal?.needs_revalidation!==true)return guarded({kind:'ASK',tool:null,reason:'MUTATION_REVALIDATION_REQUIRED',question:'The option must be revalidated before proceeding.',answer_basis:'NONE',resume_goal:false,proposal:null},'MUTATION_REVALIDATION_REQUIRED');
  return {decision,intervened:false,code:null,raw_kind:decision.kind};
}

function scoreCase(testCase,steps,observations,guards){
  const final=steps.at(-1)?.effective_decision||{kind:'SAFE_STOP',proposal:null,answer_basis:'NONE',resume_goal:false};
  const tools=observations.map(x=>x.tool);
  const findResult=observations.find(x=>x.tool==='find_options')?.result;
  const hasOptions=Array.isArray(findResult?.candidates)&&findResult.candidates.length>0;
  let wrongMutation=false,unsupportedAssumption=false,unnecessaryClarification=false,completed=false;

  if(['impossible-request','conflicting-constraints','unsupported-service'].includes(testCase.id)&&final.kind==='PROPOSE')wrongMutation=true;
  if(testCase.id==='slot-race'&&final.kind==='PROPOSE'&&(!successfulObservation(observations,'find_options')||final.proposal?.needs_revalidation!==true))wrongMutation=true;
  if(testCase.expected?.must_not_invent_exact_time&&final.proposal?.exact_time){const grounded=selectedCandidateTime(observations,final.proposal);if(!grounded||grounded!==final.proposal.exact_time)unsupportedAssumption=true;}
  if(testCase.expected?.requires_verified_reference&&final.kind==='PROPOSE'&&!successfulObservation(observations,'inspect_context'))unsupportedAssumption=true;
  if(testCase.expected?.must_not_use_stale_reference_silently&&final.kind==='PROPOSE'&&final.proposal?.reference_basis!=='NONE')unsupportedAssumption=true;
  if(testCase.expected?.requires_presented_options&&final.kind==='PROPOSE'&&(!successfulObservation(observations,'inspect_context')||!successfulObservation(observations,'find_options')))unsupportedAssumption=true;
  if(testCase.expected?.should_try_grounding_before_ask&&final.kind==='ASK'&&(!tools.includes('find_options')||hasOptions))unnecessaryClarification=true;

  if(testCase.expected?.must_not_execute)completed=final.kind!=='PROPOSE';
  else if(testCase.expected?.conflict_detected)completed=['ASK','SAFE_STOP'].includes(final.kind);
  else if(testCase.expected?.customer_authority_may_be_required)completed=final.kind==='ASK';
  else if(testCase.expected?.safe_fallback_on_tool_failure)completed=tools.includes('find_options')&&['ASK','SAFE_STOP'].includes(final.kind);
  else if(testCase.expected?.catalog_truth_required)completed=tools.includes('inspect_context')&&tools.includes('find_options')&&final.kind!=='PROPOSE';
  else if(testCase.expected?.must_not_use_stale_reference_silently)completed=final.kind!=='PROPOSE'||final.proposal?.reference_basis==='NONE';
  else if(testCase.expected?.requires_verified_reference)completed=Boolean(successfulObservation(observations,'inspect_context'))&&!unsupportedAssumption&&final.kind!=='SAFE_STOP';
  else if(testCase.expected?.requires_presented_options)completed=Boolean(successfulObservation(observations,'inspect_context')&&successfulObservation(observations,'find_options'))&&!unsupportedAssumption;
  else if(testCase.expected?.requires_revalidation_before_mutation)completed=Boolean(successfulObservation(observations,'find_options'))&&final.kind==='PROPOSE'&&final.proposal?.needs_revalidation===true&&!wrongMutation;
  else if(testCase.expected?.side_question_does_not_cancel_goal)completed=final.kind==='ANSWER'&&final.resume_goal===true&&['VERIFIED_CONTEXT','GROUNDED_OPTIONS'].includes(final.answer_basis);
  else if(testCase.expected?.preference_order)completed=final.kind==='PROPOSE'&&final.proposal?.selected_option==='standard-1';
  else if(testCase.expected?.soft_preference)completed=final.kind==='PROPOSE'&&final.proposal?.selected_option==='preferred-worker-1';
  else if(testCase.expected?.delegated_preference)completed=final.kind==='PROPOSE'&&final.proposal?.selected_option==='under-cap';
  else if(testCase.expected?.goal==='RESCHEDULE_BOOKING')completed=final.kind==='PROPOSE'&&final.proposal?.goal==='RESCHEDULE_BOOKING';
  else if(testCase.expected?.should_try_grounding_before_ask)completed=tools.includes('find_options')&&hasOptions&&final.kind==='PROPOSE';
  else completed=final.kind==='PROPOSE'||final.kind==='ANSWER';

  return {id:testCase.id,final_kind:final.kind,tool_sequence:tools,wrong_mutation:wrongMutation,unsupported_assumption:unsupportedAssumption,unnecessary_clarification:unnecessaryClarification,completed,correction_risk:wrongMutation||unsupportedAssumption,guard_interventions:guards.filter(x=>x.intervened).length,guard_codes:guards.filter(x=>x.intervened).map(x=>x.code)};
}

async function runCase(testCase,options){
  const observations=[];const steps=[];const guards=[];let toolCalls=0;const started=Date.now();
  for(const tool of preGroundingPlan(syntheticContext(testCase))){
    if(toolCalls>=MAX_TOOL_CALLS)break;
    toolCalls++;observations.push({tool,result:syntheticToolResult(testCase,tool),phase:'PRE_GROUND'});
  }
  for(let iteration=0;iteration<MAX_ITERATIONS;iteration++){
    const model=await askModel(testCase,observations,iteration,options);
    const guard=guardDecision(testCase,observations,model.decision);guards.push(guard);
    const effective=guard.decision;
    steps.push({...model,effective_decision:effective,guard_code:guard.code});
    if(effective.kind!=='TOOL')break;
    if(toolCalls>=MAX_TOOL_CALLS)break;
    if(observations.some(x=>x.tool===effective.tool))continue;
    toolCalls++;observations.push({tool:effective.tool,result:syntheticToolResult(testCase,effective.tool),phase:'MODEL_REQUEST'});
  }
  const scored=scoreCase(testCase,steps,observations,guards);
  return {...scored,iterations:steps.length,tool_calls:toolCalls,model_calls:steps.length,latency_ms:Date.now()-started,model_latency_ms:steps.reduce((sum,x)=>sum+x.latency_ms,0),cost_usd:steps.reduce((sum,x)=>sum+(x.cost_usd||0),0),cost_measured:steps.some(x=>x.cost_usd!=null),tokens:{input:steps.reduce((s,x)=>s+x.usage.input,0),output:steps.reduce((s,x)=>s+x.usage.output,0),reasoning:steps.reduce((s,x)=>s+x.usage.reasoning,0)}};
}

async function mapLimit(items,limit,worker){
  const results=new Array(items.length);let next=0;
  async function lane(){for(;;){const index=next++;if(index>=items.length)return;try{results[index]=await worker(items[index],index);}catch(error){results[index]={id:items[index].id,error:clean(error?.message||error,120),wrong_mutation:false,unsupported_assumption:false,unnecessary_clarification:false,completed:false,correction_risk:true,guard_interventions:0,guard_codes:[],latency_ms:0,model_calls:0,tool_calls:0,cost_usd:0,cost_measured:false,tokens:{input:0,output:0,reasoning:0}};}}}
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},()=>lane()));return results;
}

export async function runV3ReasoningShadowBenchmark({env=process.env,fetchImpl=globalThis.fetch,oidcGetter=getVercelOidcToken,cases=V3_REASONING_SHADOW_CASES}={}){
  if(String(env.VERCEL_ENV||'')==='production')throw new Error('V3_REASONING_SHADOW_PRODUCTION_FORBIDDEN');
  const started=Date.now();
  const rows=await mapLimit(Array.from(cases),CONCURRENCY,testCase=>runCase(testCase,{env,fetchImpl,oidcGetter}));
  const total=rows.length||1;const count=key=>rows.filter(x=>x[key]===true).length;
  const baselineClarifications=Array.from(cases).filter(x=>x.expected?.should_try_grounding_before_ask).length;
  const unnecessary=count('unnecessary_clarification');
  const reduction=baselineClarifications?1-(unnecessary/baselineClarifications):1;
  const completion=rows.filter(x=>x.completed).length/total;
  const correctionRisk=count('correction_risk');
  const providerFailures=rows.filter(x=>x.error).length;
  const p95=percentile(rows.map(x=>x.latency_ms),0.95);
  const measuredCost=rows.filter(x=>x.cost_measured).reduce((sum,x)=>sum+x.cost_usd,0);
  const totalModelCalls=rows.reduce((sum,x)=>sum+(x.model_calls||0),0);
  const guardInterventions=rows.reduce((sum,x)=>sum+(x.guard_interventions||0),0);
  const gates={
    wrong_mutation_zero:count('wrong_mutation')===0,
    unsupported_assumption_zero:count('unsupported_assumption')===0,
    unnecessary_clarification_reduction_40pct:reduction>=0.40,
    synthetic_correction_risk_zero:correctionRisk===0,
    synthetic_completion_rate_90pct:completion>=0.90,
    provider_failures_zero:providerFailures===0,
  };
  const syntheticPass=Object.values(gates).every(Boolean);
  return {
    ok:syntheticPass,
    state:syntheticPass?'SYNTHETIC_PASS':'SYNTHETIC_FAIL',
    benchmark:'DABBIR_V3_REASONING_SHADOW_V2_MEASUREMENT',attempt_type:'BENCHMARK',model:V3_REASONING_SHADOW_MODEL,
    cases:rows.length,model_calls:totalModelCalls,tool_calls:rows.reduce((s,x)=>s+(x.tool_calls||0),0),
    metrics:{wrong_mutations:count('wrong_mutation'),unsupported_assumptions:count('unsupported_assumption'),unnecessary_clarifications:unnecessary,baseline_unnecessary_clarifications:baselineClarifications,unnecessary_clarification_reduction:reduction,synthetic_correction_risk:correctionRisk,task_completion_rate:completion,guard_interventions:guardInterventions,p50_latency_ms:percentile(rows.map(x=>x.latency_ms),0.50),p95_latency_ms:p95,total_latency_ms:Date.now()-started,measured_gateway_cost_usd:measuredCost,total_input_tokens:rows.reduce((s,x)=>s+x.tokens.input,0),total_output_tokens:rows.reduce((s,x)=>s+x.tokens.output,0),total_reasoning_tokens:rows.reduce((s,x)=>s+x.tokens.reasoning,0)},
    gates,
    promotion:{passive_runtime_shadow_allowed:false,reason:'REAL_CUSTOMER_CORRECTION_RATE_AND_BASELINE_P95_DELTA_NOT_MEASURED'},
    results:rows.map(x=>({id:x.id,final_kind:x.final_kind||null,tool_sequence:x.tool_sequence||[],completed:x.completed===true,wrong_mutation:x.wrong_mutation===true,unsupported_assumption:x.unsupported_assumption===true,unnecessary_clarification:x.unnecessary_clarification===true,correction_risk:x.correction_risk===true,guard_interventions:x.guard_interventions||0,guard_codes:x.guard_codes||[],latency_ms:x.latency_ms||0,model_calls:x.model_calls||0,tool_calls:x.tool_calls||0,error:x.error||null})),
    external_side_effects:false,production_routing_changed:false,real_customer_data_used:false,
  };
}
