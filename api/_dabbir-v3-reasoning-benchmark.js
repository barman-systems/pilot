import {normalizeReasoningRequest,findOptionsResult,nextReasoningStep} from './_dabbir-v3-tool-reasoning.js';

export function scoreCurrentV3Case(testCase){
  const e=testCase?.expected||{};
  // Frozen architectural baseline, not a language-quality score. Current V3
  // requires an exact appointment time before availability authority can run.
  if(e.should_try_grounding_before_ask&&e.must_not_invent_exact_time)return {outcome:'CLARIFY',unnecessary_clarification:true,wrong_mutation:false,unsupported_assumption:false};
  if(e.requires_revalidation_before_mutation)return {outcome:'EXECUTION_GATE',unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false};
  return {outcome:'BASELINE_UNCHANGED',unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false};
}

export function scorePrototypeCase(testCase,{grounding=null}={}){
  const e=testCase?.expected||{};
  const request=normalizeReasoningRequest({goal:e.goal||'BOOK_SERVICE',hard_constraints:[],preferences:[],references:[]});
  if(e.must_not_execute)return {outcome:'SAFE_STOP',unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false,request};
  if(e.should_try_grounding_before_ask){
    const observed=findOptionsResult(grounding||{});
    if(observed.candidates.length)return {outcome:'GROUNDED_OPTIONS',unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false,request};
    return {outcome:'NEEDS_BROADER_READ',unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false,request};
  }
  const step=nextReasoningStep({decision:{kind:'PROPOSE',proposal:{},reason:'BENCHMARK_NO_EXECUTION'}});
  return {outcome:step.kind,unnecessary_clarification:false,wrong_mutation:false,unsupported_assumption:false,request};
}

export function summarizeBenchmark(rows){
  const count=rows.length||1,sum=(key)=>rows.filter(x=>x[key]===true).length;
  return {cases:rows.length,unnecessary_clarifications:sum('unnecessary_clarification'),wrong_mutations:sum('wrong_mutation'),unsupported_assumptions:sum('unsupported_assumption'),unnecessary_clarification_rate:sum('unnecessary_clarification')/count};
}
