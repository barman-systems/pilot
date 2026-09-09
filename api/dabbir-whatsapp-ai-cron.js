import { json } from './_auth-core.js';
import { cronAuthMode } from './salon-reminders-cron.js';
import { processWhatsAppRecoveryWithServiceMenu } from './_dabbir-whatsapp-service-menu.js';
import { recoverWhatsAppAiProviderFailovers } from './_dabbir-whatsapp-ai-provider-failover.js';
import { processWhatsAppVoiceRecovery } from './_dabbir-whatsapp-voice.js';
import { processCoexistenceBootstrap } from './_whatsapp-coexistence.js';
import { processWhatsAppFlowProvisioning } from './_dabbir-whatsapp-flows.js';
import { serviceRpc } from './_whatsapp-live-core.js';

const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const countValue=value=>{
  if(Number.isFinite(Number(value)))return Number(value);
  if(Array.isArray(value)&&value.length&&Number.isFinite(Number(value[0])))return Number(value[0]);
  return 0;
};
const whatsappFlowsEnabled=()=>clean(process.env.DABBIR_WHATSAPP_FLOWS_ENABLED,16)==='1';

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  try{
    let voice={processed:0,results:[]},voiceRecoveryError=null;
    try{voice=await processWhatsAppVoiceRecovery({limit:6});}
    catch(error){
      voiceRecoveryError=clean(error?.code||error?.message||'VOICE_RECOVERY_FAILED');
      console.error('dabbir_whatsapp_voice_recovery_failed',{error:voiceRecoveryError});
    }
    let coexistence={processed:0,requested:0,notApplicable:0,retry:0,results:[]},coexistenceError=null;
    try{coexistence=await processCoexistenceBootstrap({limit:4});}
    catch(error){
      coexistenceError=clean(error?.code||error?.message||'COEXISTENCE_BOOTSTRAP_FAILED');
      console.error('dabbir_whatsapp_coexistence_bootstrap_failed',{error:coexistenceError});
    }
    const flowProvisionEnabled=whatsappFlowsEnabled();
    let flows={processed:0,published:0,validation_failed:0,failed:0},flowProvisionError=null;
    if(flowProvisionEnabled){
      try{flows=await processWhatsAppFlowProvisioning({limit:2});}
      catch(error){
        flowProvisionError=clean(error?.code||error?.message||'WHATSAPP_FLOW_PROVISION_FAILED');
        console.error('dabbir_whatsapp_flow_provisioning_failed',{error:flowProvisionError});
      }
    }
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
    console.info('dabbir_whatsapp_ai_recovery',{
      auth_mode:authMode,voice_processed:voice.processed,voice_recovery_ok:voiceRecoveryError===null,
      coexistence_processed:coexistence.processed,coexistence_requested:coexistence.requested,coexistence_ok:coexistenceError===null,
      flow_provision_enabled:flowProvisionEnabled,flow_provision_processed:flows.processed,flow_published:flows.published,flow_validation_failed:flows.validation_failed,flow_failed:flows.failed,flow_provision_ok:flowProvisionError===null,
      processed:result.processed,provider_failovers:failover.processed,
      followup_candidates:followupCandidates,followup_capture_ok:followupCaptureError===null,
    });
    return json(res,200,{
      ok:true,voice_processed:voice.processed,voice_recovery_ok:voiceRecoveryError===null,
      coexistence_processed:coexistence.processed,coexistence_requested:coexistence.requested,coexistence_not_applicable:coexistence.notApplicable,coexistence_retry:coexistence.retry,coexistence_ok:coexistenceError===null,
      flow_provision_enabled:flowProvisionEnabled,flow_provision_processed:flows.processed,flow_published:flows.published,flow_validation_failed:flows.validation_failed,flow_failed:flows.failed,flow_provision_ok:flowProvisionError===null,
      processed:result.processed,provider_failovers:failover.processed,
      followup_candidates:followupCandidates,followup_capture_ok:followupCaptureError===null,
    });
  }catch(error){
    const code=clean(error?.code||error?.message||'AI_RECOVERY_FAILED');
    console.error('dabbir_whatsapp_ai_recovery_failed',{error:code});
    return json(res,500,{ok:false,error:code});
  }
}