import { QWEN37_CANARY_MODEL, QWEN37_CANARY_MAX_PERCENT, loadQwen37CanaryControl } from './_dabbir-qwen37-canary.js';

function json(res,status,body){
  return res.status(status).setHeader('cache-control','no-store').json(body);
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  const control=await loadQwen37CanaryControl({env:process.env});
  return json(res,200,{
    ok:true,
    enabled:control.enabled===true,
    percent:Number(control.percent)||0,
    max_percent:QWEN37_CANARY_MAX_PERCENT,
    model:QWEN37_CANARY_MODEL,
    scope:'SEMANTIC_INTERPRETER_ONLY',
    control_authority:'SUPABASE_CAPABILITY_REGISTRY',
    control_state:String(control.source||'CAPABILITY_CONTROL_OFF').slice(0,80),
    deterministic_execution_authority:'DABBIR',
  });
}
