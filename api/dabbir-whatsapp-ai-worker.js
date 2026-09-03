import { json, readJsonBody } from './_auth-core.js';
import { processWhatsAppAiDispatchToken } from './_dabbir-whatsapp-ai-core.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  let body;try{body=await readJsonBody(req,2048)}catch{return json(res,202,{ok:true,accepted:false})}
  const token=clean(body?.dispatch_token,80);
  if(!UUID.test(token))return json(res,202,{ok:true,accepted:false});
  try{
    const result=await processWhatsAppAiDispatchToken(token);
    console.info('dabbir_whatsapp_ai_dispatch',{claimed:result?.claimed===true,state:clean(result?.state,40)||'NOOP'});
    return json(res,202,{ok:true,accepted:true});
  }catch(error){
    console.error('dabbir_whatsapp_ai_dispatch_failed',{error:clean(error?.code||error?.message||'AI_DISPATCH_FAILED',160)});
    return json(res,202,{ok:true,accepted:true});
  }
}
