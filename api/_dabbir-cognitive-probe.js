// Fixed authenticated diagnostic. It invokes the production interpreter and
// orchestrator with synthetic context; no DB/customer tool is reachable.
import {runUnderstandingTurn} from './_dabbir-understanding-orchestrator.js';
import {interpretSemanticMessage} from './_dabbir-semantic-interpreter.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};

export async function probeCognitiveDialogue({interpret=interpretSemanticMessage}={}){
 const b='10000000-0000-4000-8000-000000000001',branch='20000000-0000-4000-8000-000000000001',service='30000000-0000-4000-8000-000000000001';
 const c={business:{id:b,business_type:'car_wash',timezone:'Asia/Dubai',currency_code:'AED'},conversation:{id:'40000000-0000-4000-8000-000000000001',branch_id:branch,state:'ai_active'},customer:{id:'50000000-0000-4000-8000-000000000001'},
  services:[{id:service,business_id:b,branch_id:branch,name_ar:'خارجي',name_en:'Exterior',price:40},{id:'30000000-0000-4000-8000-000000000002',business_id:b,branch_id:branch,name_ar:'VIP',name_en:'VIP',price:100}],workers:[],history:[],knowledge:[],verified_memory:[],approved_aliases:[],upcoming_appointments:[]};
 c.activity_profile={version:1,source:'DATABASE_FACT',business_id:b,branch_id:branch,workers:[],services:c.services.map(s=>({business_id:b,branch_id:branch,service_id:s.id,activity_type:'car_wash',schema_version:1,contract_version:'synthetic-cognitive-v1',delivery_modes:['MOBILE'],mode_requirements:registry.activities.car_wash.mode_requirements,collection_priority:registry.platform.collection_priority,entity_definitions:registry.platform.entity_definitions,supported_actions:registry.activities.car_wash.supported_actions,automatic_booking:true,owner_approval:false}))};
 let state={},version=0,pending=null;const results=[],providers=[];let forbiddenCalls=0;
 for(const [index,message] of ['شو خدماتكم','أبا غسيل خارجي','ستيشن'].entries()){
  const now=new Date(Date.now()+index*1000),claim={batch_id:'synthetic-'+index,lock_token:'synthetic',attempt_count:1};let reply=null;
  const rpc=async(name,a)=>{
   if(name==='dabbir_semantic_load_v2')return {semantic_state:state,version,message_revision:index+1};
   if(name==='dabbir_semantic_commit_v2'){state=structuredClone(a.p_state);return {version:++version,state,replay:false};}
   if(name==='dabbir_semantic_set_pending_v2'){pending={pending_action:a.p_action,payload:a.p_payload,expires_at:new Date(now.getTime()+900000).toISOString()};return true;}
   if(['dabbir_semantic_assert_current_v2','dabbir_record_ai_operator_decision_v1','dabbir_cognitive_record_delivery_v1'].includes(name))return {verified:true};
   forbiddenCalls++;throw new Error('SYNTHETIC_TOOL_FORBIDDEN');
  };
  const result=await runUnderstandingTurn({claim,context:{...c,pending_state:pending,batch_messages:[{body:message,created_at:now.toISOString()}]},rpc,now:()=>now,
   deliver:async(_claim,_c,body)=>{reply=body;return {providerMessageId:'synthetic-receipt-'+index};},finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',
   planner:async(_c,snapshot)=>{const start=Date.now();const r=await interpret({message,context:snapshot,referenceTime:now.toISOString()});providers.push({provider:r.provider,model:r.model,latency_ms:Date.now()-start});return r.proposal;}});
  results.push({action:result.action,goal:state.goal,pending_field:state.cognition?.pending_field||null,service_preserved:state.entities?.service?.value===service,vehicle:state.entities?.vehicle?.value||null,reply});
  c.history.push({sender_type:'customer',body:message},{sender_type:'ai',body:reply||''});
 }
 const last=results.at(-1),checks={catalog:results[0].action==='SERVICE_MENU',vehicle_question:results[1].pending_field==='vehicle',goal_retained:last.goal==='BOOK_SERVICE',service_retained:last.service_preserved,vehicle_resolved:last.vehicle==='station',next_required_field:last.pending_field==='location',no_generic_reply:!/(?:أقدر أساعدك بالخدمات|شو تحتاج|What do you need)/i.test(last.reply||''),no_execution:forbiddenCalls===0,real_provider:providers.length>0&&providers.every(x=>x.provider&&x.model)};
 const ok=Object.values(checks).every(Boolean);
 return {ok,state:ok?'SUCCESS':'FAILED',cognitive_probe:true,case_id:'exterior_station_continuity',checks,turns:results,providers,external_side_effects:false,evidence_scope:'REAL_MODEL_SYNTHETIC_ORCHESTRATOR_NO_DATABASE_OR_WHATSAPP_DELIVERY'};
}
