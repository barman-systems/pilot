const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);

export const V3_REASONING_LIMITS=Object.freeze({max_iterations_per_turn:3,max_tool_calls_per_turn:4});

export function normalizeReasoningRequest(input={}){
  const hard=arr(input.hard_constraints).filter(x=>x&&typeof x==='object').slice(0,12);
  const preferences=arr(input.preferences).filter(x=>x&&typeof x==='object').slice(0,12);
  const references=arr(input.references).filter(x=>x&&typeof x==='object').slice(0,8);
  return {goal:clean(input.goal,80)||'UNKNOWN',hard_constraints:hard,preferences,references};
}

export function candidateFacts(candidate){
  if(!candidate||typeof candidate!=='object')return {};
  const allowed=['id','starts_at','ends_at','local_start','service_id','service_name','worker_id','worker_name','price','currency_code','timezone','branch_id'];
  return Object.fromEntries(allowed.filter(k=>candidate[k]!=null).map(k=>[k,candidate[k]]));
}

export function findOptionsResult(raw={}){
  const candidates=arr(raw.candidates||raw.slots).slice(0,12).map(candidateFacts);
  return {candidates,conflicts:arr(raw.conflicts).slice(0,12),alternatives:arr(raw.alternatives).slice(0,12),grounded:true};
}

export function nextReasoningStep({iteration=0,toolCalls=0,decision=null}={}){
  if(iteration>=V3_REASONING_LIMITS.max_iterations_per_turn||toolCalls>=V3_REASONING_LIMITS.max_tool_calls_per_turn)return {kind:'SAFE_FALLBACK',reason:'TURN_BUDGET_EXHAUSTED'};
  if(!decision||typeof decision!=='object')return {kind:'SAFE_FALLBACK',reason:'DECISION_MISSING'};
  if(decision.kind==='TOOL'&&['inspect_context','find_options'].includes(decision.tool))return {kind:'TOOL',tool:decision.tool,args:decision.args&&typeof decision.args==='object'?decision.args:{}};
  if(decision.kind==='ASK')return {kind:'ASK',reason:clean(decision.reason,160)||'CUSTOMER_AUTHORITY_REQUIRED',question:clean(decision.question,500)};
  if(decision.kind==='PROPOSE')return {kind:'PROPOSE',proposal:decision.proposal&&typeof decision.proposal==='object'?decision.proposal:{},reason:clean(decision.reason,160)||'GROUNDED_PROPOSAL'};
  return {kind:'SAFE_FALLBACK',reason:'DECISION_INVALID'};
}

export function reasoningPrototypeEnabled(env=process.env){return String(env.DABBIR_V3_TOOL_REASONING_PROTOTYPE||'0').trim()==='1';}
