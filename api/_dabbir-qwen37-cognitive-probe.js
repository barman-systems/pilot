import {probeCognitiveDialogue} from './_dabbir-cognitive-probe.js';
import {interpretSemanticMessage} from './_dabbir-semantic-interpreter.js';

export const QWEN37_CANDIDATE_MODEL='alibaba/qwen3.7-flash';
export const QWEN37_CANDIDATE_PROVIDER='vercel-ai-gateway';
const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';

const clean=value=>String(value??'').trim();

export function qwen37EvaluationEnvironment(env=process.env){
 const selected={DABBIR_AI_GATEWAY_MODEL:QWEN37_CANDIDATE_MODEL};
 for(const key of ['VERCEL_ENV','AI_GATEWAY_API_KEY','VERCEL_OIDC_TOKEN'])if(clean(env[key]))selected[key]=env[key];
 const configured=Boolean(selected.AI_GATEWAY_API_KEY||selected.VERCEL_OIDC_TOKEN||selected.VERCEL_ENV);
 if(!configured)throw new Error('QWEN37_GATEWAY_NOT_CONFIGURED');
 return selected;
}

export function qwen37CandidateMatches(providers=[]){
 return Array.isArray(providers)&&providers.length>0&&providers.every(row=>
  !row?.error&&row?.provider===QWEN37_CANDIDATE_PROVIDER&&row?.model===QWEN37_CANDIDATE_MODEL
 );
}

export function qwen37StrictFetch(fetchImpl=fetch){
 if(typeof fetchImpl!=='function')throw new Error('QWEN37_FETCH_REQUIRED');
 return async(url,options={})=>{
  if(String(url)!==GATEWAY_ENDPOINT)return fetchImpl(url,options);
  let body;
  try{body=JSON.parse(String(options?.body||''));}catch{throw new Error('QWEN37_GATEWAY_BODY_INVALID');}
  if(body?.model!==QWEN37_CANDIDATE_MODEL){
   const error=new Error('QWEN37_CANDIDATE_FALLBACK_BLOCKED');
   error.code='QWEN37_CANDIDATE_FALLBACK_BLOCKED';
   throw error;
  }
  body.providerOptions={
   ...(body.providerOptions||{}),
   gateway:{...(body.providerOptions?.gateway||{}),only:['alibaba'],order:['alibaba']},
  };
  return fetchImpl(url,{...options,body:JSON.stringify(body)});
 };
}

export async function probeQwen37CognitiveDialogue({scenario='critical',env=process.env,fetchImpl=fetch}={}){
 const evaluationEnv=qwen37EvaluationEnvironment(env);
 const strictFetch=qwen37StrictFetch(fetchImpl);
 const interpret=args=>interpretSemanticMessage({...args,env:evaluationEnv,fetchImpl:strictFetch});
 const result=await probeCognitiveDialogue({interpret,provider:null,scenario,env:evaluationEnv});
 const exactCandidate=qwen37CandidateMatches(result.providers);
 const checks={...result.checks,exact_qwen37_candidate:exactCandidate};
 const ok=result.ok&&exactCandidate&&checks.no_execution===true&&result.external_side_effects===false;
 return {
  ...result,
  ok,
  state:ok?'SUCCESS':'FAILED',
  checks,
  requested_provider:'qwen37',
  expected_provider:QWEN37_CANDIDATE_PROVIDER,
  expected_model:QWEN37_CANDIDATE_MODEL,
  candidate_isolated:true,
 };
}
