import { json } from './_auth-core.js';
import { cronAuthMode } from './salon-reminders-cron.js';
import { processWhatsAppAiRecovery } from './_dabbir-whatsapp-ai-core.js';

const clean=(v,max=160)=>String(v??'').trim().slice(0,max);

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  try{
    const result=await processWhatsAppAiRecovery({limit:12});
    console.info('dabbir_whatsapp_ai_recovery',{auth_mode:authMode,processed:result.processed});
    return json(res,200,{ok:true,processed:result.processed});
  }catch(error){
    const code=clean(error?.code||error?.message||'AI_RECOVERY_FAILED');
    console.error('dabbir_whatsapp_ai_recovery_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}
