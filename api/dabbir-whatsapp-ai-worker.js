import { json, readJsonBody } from './_auth-core.js';
import { processWhatsAppDispatchWithServiceMenu } from './_dabbir-whatsapp-service-menu.js';
import { failoverWhatsAppAiProvider } from './_dabbir-whatsapp-ai-provider-failover.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  let body;try{body=await readJsonBody(req,2048)}catch{return json(res,202,{ok:true,accepted:false})}
  const token=clean(body?.dispatch_token,80);
  if(!UUID.test(token))return json(res,202,{ok:true,accepted:false});
  try{
    let result=await processWhatsAppDispatchWithServiceMenu(token);
    if(['RETRY','HUMAN_REQUIRED'].includes(result?.state)&&result?.error){
      const failover=await failoverWhatsAppAiProvider(token,result.error).catch(()=>({handled:false}));
      if(failover?.handled===true)result={...result,state:failover.state,provider_failover:true};
    }
    console.info('dabbir_whatsapp_ai_dispatch',{claimed:result?.claimed===true,state:clean(result?.state,40)||'NOOP',provider_failover:result?.provider_failover===true});
    return json(res,202,{ok:true,accepted:true});
  }catch(error){
    console.error('dabbir_whatsapp_ai_dispatch_failed',{error:clean(error?.code||error?.message||'AI_DISPATCH_FAILED',160)});
    return json(res,202,{ok:true,accepted:true});
  }
}
