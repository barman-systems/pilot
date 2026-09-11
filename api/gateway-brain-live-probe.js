import { interpretSemanticMessage } from './_dabbir-semantic-interpreter.js';
import { understandConversation } from './_dabbir-semantic-engine.js';
import { getDABBIRAiConfig } from './_ai-core.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};

const BUSINESS='10000000-0000-4000-8000-000000000101';
const BRANCH='20000000-0000-4000-8000-000000000101';
const CONVERSATION='30000000-0000-4000-8000-000000000101';
const CUSTOMER='40000000-0000-4000-8000-000000000101';
const SERVICE='50000000-0000-4000-8000-000000000101';

function makeContext(message, serviceName, createdAt){
  const schema=registry.activities.car_wash;
  return {
    business:{id:BUSINESS,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},
    conversation:{id:CONVERSATION,branch_id:BRANCH,state:'ai_active'},
    customer:{id:CUSTOMER},
    services:[{id:SERVICE,business_id:BUSINESS,branch_id:BRANCH,name:serviceName,price:50}],
    workers:[],
    batch_messages:[{body:message,language_body:message,created_at:createdAt}],
    activity_profile:{version:1,source:'DATABASE_FACT',business_id:BUSINESS,branch_id:BRANCH,workers:[],verified_memory:[],services:[{
      business_id:BUSINESS,branch_id:BRANCH,service_id:SERVICE,activity_type:'car_wash',schema_version:1,
      contract_version:'gateway-live-probe-v1',delivery_modes:['MOBILE'],mode_requirements:schema.mode_requirements,
      collection_priority:registry.platform.collection_priority,entity_definitions:registry.platform.entity_definitions,
      supported_actions:schema.supported_actions,automatic_booking:true,owner_approval:false
    }]}
  };
}

async function runCase(id,message,serviceName,createdAt){
  const context=makeContext(message,serviceName,createdAt);
  const started=performance.now();
  const interpreted=await interpretSemanticMessage({message,context,referenceTime:createdAt});
  const brain=understandConversation({context,now:new Date(createdAt),proposal:interpreted.proposal});
  const elapsedMs=Math.round(performance.now()-started);
  return {
    id,message,reply:brain.decision?.reply??null,action:brain.decision?.action??null,intent:brain.decision?.intent??null,
    provider:interpreted.provider,model:interpreted.model,elapsed_ms:elapsedMs,
    provider_latency_ms:interpreted.telemetry?.latency_ms??null,
    request_count:interpreted.telemetry?.request_count??null,
    actual_cost_usd:interpreted.telemetry?.actual_cost_usd??null
  };
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(process.env.VERCEL_ENV==='production'||process.env.DABBIR_AI_GATEWAY_TEST!=='1')return res.status(404).json({ok:false,error:'preview_probe_disabled'});
  const cfg=getDABBIRAiConfig();
  const cases=[];
  try{
    cases.push(await runCase('ar','أبا أحجز غسيل كامل باجر الساعة 9 الصبح','غسيل كامل','2026-09-11T01:30:00Z'));
    cases.push(await runCase('en','I want to book a Full wash tomorrow at 9am','Full wash','2026-09-11T01:30:00Z'));
    return res.status(200).json({ok:true,provider:cfg.provider,model:cfg.model,auth_mode:cfg.auth_mode,cases});
  }catch(error){
    return res.status(502).json({ok:false,provider:cfg.provider,model:cfg.model,auth_mode:cfg.auth_mode,error:String(error?.code||error?.message||'probe_failed'),cases});
  }
}
