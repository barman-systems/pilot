import { json } from './_auth-core.js';
import { cronAuthMode } from './salon-reminders-cron.js';
import { processWhatsAppRecoveryWithServiceMenu } from './_dabbir-whatsapp-service-menu.js';
import { recoverWhatsAppAiProviderFailovers } from './_dabbir-whatsapp-ai-provider-failover.js';
import { serviceRpc } from './_whatsapp-live-core.js';

const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const countValue=value=>{
  if(Number.isFinite(Number(value)))return Number(value);
  if(Array.isArray(value)&&value.length&&Number.isFinite(Number(value[0])))return Number(value[0]);
  return 0;
};

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  try{
    const result=await processWhatsAppRecoveryWithServiceMenu({limit:12});
    const failover=await recoverWhatsAppAiProviderFailovers({limit:12});
    let followupCandidates=0,followupCaptureError=null;
    try{
      const captured=await serviceRpc('dabbir_capture_abandoned_booking_followups_v1',{p_limit:25});
      followupCandidates=countValue(captured);
    }catch(error){
      followupCaptureError=clean(error?.code||error?.message||'FOLLOWUP_CAPTURE_FAILED');
      console.error('dabbir_whatsapp_ai_followup_capture_failed',{error:followupCaptureError});
    }
    console.info('dabbir_whatsapp_ai_recovery',{auth_mode:authMode,processed:result.processed,provider_failovers:failover.processed,followup_candidates:followupCandidates,followup_capture_ok:followupCaptureError===null});
    return json(res,200,{ok:true,processed:result.processed,provider_failovers:failover.processed,followup_candidates:followupCandidates,followup_capture_ok:followupCaptureError===null});
  }catch(error){
    const code=clean(error?.code||error?.message||'AI_RECOVERY_FAILED');
    console.error('dabbir_whatsapp_ai_recovery_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}