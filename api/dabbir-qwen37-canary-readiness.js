import { QWEN37_CANARY_MODEL, QWEN37_CANARY_MAX_PERCENT, qwen37CanaryDecision } from './_dabbir-qwen37-canary.js';

function json(res,status,body){
  return res.status(status).setHeader('cache-control','no-store').json(body);
}

export default function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  const decision=qwen37CanaryDecision({
    env:process.env,
    context:{business:{id:'readiness'},conversation:{id:'readiness'}},
  });
  return json(res,200,{
    ok:true,
    enabled:decision.enabled===true,
    percent:Number(decision.percent)||0,
    max_percent:QWEN37_CANARY_MAX_PERCENT,
    model:QWEN37_CANARY_MODEL,
    scope:'SEMANTIC_INTERPRETER_ONLY',
    deterministic_execution_authority:'DABBIR',
  });
}
