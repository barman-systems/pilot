import { json, readJsonBody } from './_auth-core.js';
import { processWhatsAppVoiceDispatchToken } from './_dabbir-whatsapp-voice-reliable.js';

const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  let body;try{body=await readJsonBody(req,2048)}catch{return json(res,202,{ok:true,accepted:false})}
  const token=clean(body?.dispatch_token,80);
  if(!UUID.test(token))return json(res,202,{ok:true,accepted:false});
  try{
    const result=await processWhatsAppVoiceDispatchToken(token);
    console.info('dabbir_whatsapp_voice_dispatch',{
      claimed:result?.claimed===true,
      state:clean(result?.state,40)||'NOOP',
      provider:clean(result?.provider,80)||null,
      model:clean(result?.model,160)||null,
      confidence:Number.isFinite(Number(result?.confidence))?Number(result.confidence):null,
    });
    return json(res,202,{ok:true,accepted:true});
  }catch(error){
    console.error('dabbir_whatsapp_voice_dispatch_failed',{error:clean(error?.code||error?.message||'VOICE_DISPATCH_FAILED',160)});
    return json(res,202,{ok:true,accepted:true});
  }
}