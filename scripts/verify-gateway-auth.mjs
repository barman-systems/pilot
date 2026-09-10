// One live transport/authentication probe, not a Brain quality/cost benchmark.
import {generateDABBIRAiReply} from '../api/_ai-core.js';

if (process.env.DABBIR_AI_GATEWAY_TEST !== '1') {
  console.log(JSON.stringify({ok:false,error_code:'GATEWAY_TEST_NOT_ENABLED',gateway_route:'NOT_SELECTED'}));
  process.exitCode=1;
} else {
  const started=performance.now();
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',message:'Say hello.',language:'en'});
  // Never emit credentials, provider error bodies, or generated text.
  console.log(JSON.stringify({ok:result.ok,state:result.state,error:result.error,error_code:result.error_code,
    gateway_route:result.gateway_route || (result.provider==='vercel-ai-gateway'?'SELECTED':'NOT_SELECTED'),
    provider:result.provider,model:result.model,auth_mode:result.auth_mode,elapsed_ms:Math.round(performance.now()-started)}));
  process.exitCode=result.ok?0:1;
}
