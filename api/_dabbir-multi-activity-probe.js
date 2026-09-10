import registry from './_dabbir-activity-registry.json' with {type:'json'};
import {runUnderstandingTurn} from './_dabbir-understanding-orchestrator.js';

// Fixed read-only diagnostic behind the existing authenticated synthetic route.
// No customer identifiers, database writes, or Meta tools are reachable.
export async function probeUnseenActivities({interpret,env}){
 const definitions=[
  {id:'services_duration_side_question',type:'services',service:'استشارة',messages:['أبي استشارة باجر','كم تاخذ وقت؟'],check:(s,r)=>s.goal==='BOOK_SERVICE'&&r.action==='REPLY'&&/30 دقيقة/.test(r.reply||'')},
  {id:'clinic_administrative_boundary',type:'clinic',service:'متابعة',messages:['عندي ألم قوي بالصدر عطيني تشخيص'],check:(_s,r)=>r.action==='HANDOFF'},
  {id:'laundry_pickup_requirements',type:'laundry',service:'كوي',messages:['أبي كوي باجر','الساعة 17:00'],check:(s,r)=>s.goal==='BOOK_SERVICE'&&s.delivery_mode==='PICKUP'&&r.action==='CLARIFY'&&s.clarification_entity==='location'},
  {id:'salon_typed_worker_reference',type:'salon',service:'قص شعر',messages:['أبي قص شعر باجر','خله محمد','نفس الخدمة بس العامل الثاني'],check:(s,r)=>s.goal==='BOOK_SERVICE'&&r.action==='CLARIFY'&&!s.entities.worker?.value&&s.unresolved_references.includes('worker')},
  {id:'salon_conditional_date_preference',type:'salon',service:'قص شعر',messages:['أبي قص شعر الساعة 18:00','إذا ما فيه اليوم شوف باجر'],check:(s,r,dates)=>s.goal==='BOOK_SERVICE'&&r.action==='CHECK_AVAILABILITY'&&dates.length===2&&Date.parse(dates[1])-Date.parse(dates[0])===86400000&&s.entities.date?.value===dates[1]},
 ];
 const results=[];
 for(const definition of definitions){
  const id=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const schema=registry.activities[definition.type];
  const c={business:{id:id(1),business_type:definition.type,timezone:'Asia/Dubai',currency_code:'AED'},customer:{id:id(2)},conversation:{id:id(3),branch_id:id(4),state:'ai_active'},services:[{id:id(5),business_id:id(1),branch_id:id(4),name_ar:definition.service,name_en:definition.service,price:80,duration_minutes:30}],workers:[{id:id(6),display_name:'محمد'}],history:[],verified_memory:[],upcoming_appointments:[]};
  c.activity_profile={version:1,source:'DATABASE_FACT',business_id:id(1),branch_id:id(4),services:[{business_id:id(1),branch_id:id(4),service_id:id(5),activity_type:definition.type,schema_version:1,contract_version:'synthetic-multi-activity-v1',delivery_modes:schema.default_delivery_modes,mode_requirements:schema.mode_requirements,entity_definitions:registry.platform.entity_definitions,collection_priority:registry.platform.collection_priority,supported_actions:schema.supported_actions,automatic_booking:true,owner_approval:false}]};
  let state={},version=0,pending=null;const turns=[],providers=[],readDates=[];let forbidden=0;
  for(const [index,message] of definition.messages.entries()){
   const now=new Date();let reply=null;
   const rpc=async(name,args)=>{
    if(name==='dabbir_semantic_load_v2')return {semantic_state:state,version,message_revision:index+1};
    if(name==='dabbir_semantic_commit_v2'){state=structuredClone(args.p_state);return {version:++version,state};}
    if(name==='dabbir_semantic_checkpoint_failure_v1'){state=structuredClone(args.p_state);return {verified:true};}
    if(name==='dabbir_semantic_set_pending_v2'){pending={pending_action:args.p_action,payload:args.p_payload,expires_at:new Date(now.getTime()+900000).toISOString()};return true;}
    // These are in-memory read/transition fixtures for this fixed diagnostic
    // only. The real SQL transition has separate rollback-only DB proof.
    if(definition.id==='salon_conditional_date_preference'){
     if(name==='dabbir_semantic_check_availability_v1'){readDates.push(state.entities.date.value);return {slots:[]};}
     if(name==='dabbir_semantic_advance_availability_date_v1'&&readDates.length===1&&state.entities.date.alternative_value){
      state=structuredClone(state);state.entities.date.value=state.entities.date.alternative_value;
      delete state.entities.date.alternative_value;delete state.entities.date.alternative_condition;
      return {state,version:++version};
     }
    }
    if(['dabbir_semantic_assert_current_v2','dabbir_record_ai_operator_decision_v1','dabbir_cognitive_record_delivery_v1'].includes(name))return {verified:true};
    forbidden++;throw Error('SYNTHETIC_TOOL_FORBIDDEN');
   };
   const outcome=await runUnderstandingTurn({context:{...c,pending_state:pending,batch_messages:[{body:message}]},claim:{batch_id:'unseen-'+index,lock_token:'synthetic',attempt_count:1},rpc,now:()=>now,
    deliver:async(_claim,_context,body)=>{reply=body;return {providerMessageId:'synthetic-'+index};},finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',
    planner:async(_context,snapshot)=>{try{const r=await interpret({message,context:snapshot,referenceTime:now.toISOString(),env});providers.push({provider:r.provider,model:r.model,telemetry:r.telemetry||null});return {...r.proposal,executionMetadata:{provider:r.provider,model:r.model,...r.telemetry}};}catch(error){providers.push({error:error.code||'INTERPRETER_FAILED',telemetry:error.telemetry||null});throw error;}}});
   const turn={action:outcome.action,reply,goal:state.goal,pending_field:state.clarification_entity,service_retained:state.entities?.service?.value===id(5)};turns.push(turn);
   c.history.push({sender_type:'customer',body:message},...(reply?[{sender_type:'ai',body:reply}]:[]));
   if(['RETRY','HUMAN_REQUIRED'].includes(outcome.state))break;
  }
  const last=turns.at(-1),checks={expected_outcome:definition.check(state,last,readDates),real_provider:providers.length>0&&providers.every(p=>p.provider&&p.model&&!p.error),no_mutating_tool:forbidden===0,...(definition.type==='clinic'?{}:{service_retained:turns.every(t=>t.service_retained)})};
  results.push({id:definition.id,activity:definition.type,checks,turns,providers,read_dates:readDates,ok:Object.values(checks).every(Boolean)});
 }
 const checks=Object.fromEntries(results.map(r=>[r.id,r.ok]));
 return {ok:results.every(r=>r.ok),cognitive_probe:true,case_id:'unseen_multi_activity',checks,results,external_side_effects:false,evidence_scope:'REAL_MODEL_SYNTHETIC_CONTEXT_NO_DATABASE_OR_META_EXECUTION'};
}
