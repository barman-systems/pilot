import { requireSameOrigin } from './_auth-core.js';
import { runV3ReasoningShadowBenchmark } from './_dabbir-v3-reasoning-shadow-benchmark.js';

const BENCHMARK_SCOPE='v3-reasoning-shadow-v1';
const BENCHMARK_BRANCH='feat/v3-reasoning-shadow-benchmark-v1';
const json=(res,status,body)=>res.status(status).setHeader('cache-control','no-store').json(body);

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(process.env.VERCEL_ENV!=='preview')return json(res,403,{ok:false,error:'PREVIEW_BENCHMARK_ONLY'});
  if(String(process.env.VERCEL_GIT_COMMIT_REF||'')!==BENCHMARK_BRANCH)return json(res,403,{ok:false,error:'BENCHMARK_BRANCH_MISMATCH'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  if(String(req.headers?.['x-dabbir-benchmark-scope']||'')!==BENCHMARK_SCOPE)return json(res,403,{ok:false,error:'BENCHMARK_SCOPE_REQUIRED'});
  if(req.body?.synthetic!==true)return json(res,403,{ok:false,error:'SYNTHETIC_MODE_REQUIRED'});
  try{
    const result=await runV3ReasoningShadowBenchmark();
    return json(res,result.ok?200:422,{...result,service:'dabbir-v3-reasoning-shadow-benchmark',access_boundary:'VERCEL_PROTECTED_PREVIEW_PLUS_SAME_ORIGIN_SYNTHETIC_SCOPE',timestamp:new Date().toISOString()});
  }catch(error){
    const code=String(error?.message||'V3_REASONING_SHADOW_FAILED');
    const safe=/^V3_REASONING_SHADOW_[A-Z0-9_]+$/.test(code)?code:'V3_REASONING_SHADOW_FAILED';
    return json(res,safe.endsWith('NOT_CONFIGURED')?503:400,{ok:false,error:safe});
  }
}
