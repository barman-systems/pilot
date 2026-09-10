import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {unseenSpec} from '../test/fixtures/understanding/unseen-spec.mjs';
import {activityContext} from '../test/fixtures/understanding/activity.mjs';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';

const id=(n)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids={business:id(1),customer:id(2),conversation:id(3),branch:id(4),first:id(5),second:id(6),worker1:id(7),worker2:id(8),appointment1:id(9),appointment2:id(10)};
const catalogs={salon:[['قص شعر','Haircut',65],['صبغة','Colour',150]],services:[['استشارة','Consultation',80],['جلسة مطولة','Extended session',160]],clinic:[['متابعة','Follow up',100],['فحص إداري','Administrative check',150]],laundry:[['كوي','Ironing',20],['التنظيف الجاف','Dry cleaning',40]],car_wash:[['غسيل كامل','Full wash',50],['تلميع','Polishing',120]]};
const mutations=new Set(['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const tools=new Set([...mutations,'CHECK_AVAILABILITY','HANDOFF']);
export function materialize(spec){
 const [caseId,type,turns,expected,options={}]=spec;
 const now=`2026-09-${options.startDay||10}T08:00:00Z`;
 const rows=catalogs[type]||[];
 const c=activityContext({business:{id:ids.business,business_type:type,timezone:'Asia/Dubai',currency_code:'AED'},customer:{id:ids.customer},conversation:{id:options.newConversation?id(30):ids.conversation,branch_id:ids.branch,state:options.human?'human_active':'ai_active',newer_customer_message_exists:options.newer===true},services:rows.map(([name_ar,name_en,price],i)=>({id:i?ids.second:ids.first,business_id:ids.business,branch_id:ids.branch,name_ar,name_en,price,duration_minutes:i?60:30})),workers:[{id:ids.worker1,display_name:'محمد'},{id:ids.worker2,display_name:'سالم'}],branches:[{id:ids.branch,name:'المدينة'}],verified_memory:[],operational_history:[],upcoming_appointments:[]});
 const appt={id:ids.appointment1,business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.first,worker_id:ids.worker1,status:'confirmed',starts_at:'2026-09-12T10:00:00Z',simulated:false};
 if(options.appointments)c.upcoming_appointments=[{...appt,...(options.appointments==='foreign'?{customer_id:id(99)}:{})},...(options.appointments==='two'?[{...appt,id:ids.appointment2}]:[])];
 if(options.history){
  const h={...appt,status:'completed',starts_at:options.history==='last_week'?'2026-09-03T10:00:00Z':'2026-09-09T10:00:00Z'};
  if(options.history==='other_customer')h.customer_id=id(99);
  if(options.history==='other_branch')h.branch_id=id(99);
  if(options.history==='cancelled')h.status='cancelled';
  if(options.history==='removed')h.service_id=id(99);
  c.operational_history=[h,...(options.history==='ambiguous'?[{...h,id:ids.appointment2,service_id:ids.second}]:[])];
 }
 const memory=(key,value,status='verified')=>({id:id(40+c.verified_memory.length),business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,memory_key:key,value,source:'DATABASE_FACT',status,confidence:1,last_confirmed_at:'2026-09-09T10:00:00Z',expires_at:'2026-12-01T10:00:00Z',version:1});
 if(options.memory)c.verified_memory.push(memory('last_verified_service',{id:ids.first},options.memory==='revoked'?'revoked':'verified'));
 if(options.memoryWorker)c.verified_memory.push(memory('preferred_worker',{id:options.memoryWorker==='removed'?id(99):ids.worker2}));
 if(options.memoryVehicle)c.verified_memory.push(memory('vehicle',{value:options.memoryVehicle}));
 if(options.offer){
  const services=c.services.map(s=>({id:s.id,label:s.name_ar}));
  const slots=[17,18,19].map(h=>({service_id:ids.first,worker_id:ids.worker1,starts_at:`2026-09-11T${h-4}:00:00Z`,timezone:'Asia/Dubai'}));
  c.pending_state={pending_action:options.offer==='services'?'choose_service':'choose_slot',payload:{activity_contract_version:'test-v1',mode:'booking',services,slots,presented:options.offer!=='unverified',provider_message_id:options.offer==='unverified'?null:'fixture-offer'},expires_at:options.offer==='expired'?'2026-09-01T00:00:00Z':'2026-09-10T08:15:00Z'};
 }
 const mapped=Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,['service','worker','appointment'].includes(k)&&['first','second'].includes(v)?k==='worker'?ids[v==='first'?'worker1':'worker2']:k==='appointment'?ids[v==='first'?'appointment1':'appointment2']:ids[v]:v]));
 return {id:caseId,activity:type,reference_time:now,input_history:turns.slice(0,-1),current_message:turns.at(-1),customer_state:{...c.customer,verified_memory:c.verified_memory},business_state:c,expected_goal:mapped.goal??null,expected_entities:Object.fromEntries(Object.entries(mapped).filter(([k])=>!['goal','action','field'].includes(k))),expected_state_change:mapped,expected_tool:tools.has(mapped.action)?mapped.action:null,must_not_ask:Object.keys(mapped).filter(k=>['service','worker','date','time','vehicle'].includes(k)&&mapped[k]!==null),must_not_do:['cross_tenant_read','unconfirmed_mutation','invented_execution'],acceptable_result:mapped,options};
}
const value=(s,d,k)=>({goal:s.goal,action:d.action,field:s.clarification_entity,part:s.entities.time?.part??null,mode:s.entities.delivery_mode?.value??null}[k]??s.entities[k]?.value??null);
export function evaluateUnseen(reduce=understandConversation){
 const cases=unseenSpec.map(materialize),results=[];
 for(const item of cases){
  let state=null,decision;const trace=[];
  for(const [i,body] of [...item.input_history,item.current_message].entries()){
   const context={...structuredClone(item.business_state),batch_messages:[{body}],history:[]};
   const r=reduce({context,previous:state,now:new Date(Date.parse(item.reference_time)+i*(item.options.gapHours?item.options.gapHours*3600000:1000))});
   state=JSON.parse(JSON.stringify(r.state));decision=r.decision;
   trace.push({goal:state.goal,action:decision.action,field:state.clarification_entity,reason:decision.reasonCode});
  }
  const checks=Object.entries(item.expected_state_change).map(([k,want])=>({field:k,expected:want,actual:value(state,decision,k),pass:JSON.stringify(want)===JSON.stringify(value(state,decision,k))}));
  const repeated=decision.action==='CLARIFY'&&item.must_not_ask.includes(state.clarification_entity);
  results.push({id:item.id,activity:item.activity,pass:checks.every(x=>x.pass)&&!repeated,checks,repeated_question:repeated,mutation:mutations.has(decision.action),trace});
 }
 const metric=(rows)=>({correct:rows.filter(x=>x.pass).length,total:rows.length,percent:rows.length?Number((100*rows.filter(x=>x.pass).length/rows.length).toFixed(2)):null});
 const checks=results.flatMap(r=>r.checks);
 const entities=['service','worker','vehicle','location','slot','appointment','date','time','part','mode','price'];
 return {schema_version:1,spec_sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../test/fixtures/understanding/unseen-spec.mjs',import.meta.url))).digest('hex'),scope:'Deterministic brain boundary with JSON state round trips. No live model, SQL persistence or Meta delivery is claimed.',cases:cases.length,passed:results.filter(r=>r.pass).length,metrics:{goal_understanding:metric(checks.filter(c=>c.field==='goal')),entity_resolution:metric(checks.filter(c=>entities.includes(c.field))),reference_resolution:metric(results.filter(r=>/^(reference|history)\//.test(r.id)).flatMap(r=>r.checks.filter(c=>entities.includes(c.field)))),context_carryover:metric(results.filter(r=>/^(carry|history|complex)\//.test(r.id)).flatMap(r=>r.checks.filter(c=>entities.includes(c.field)))),next_action:metric(checks.filter(c=>c.field==='action')),tool_selection:metric(checks.filter(c=>c.field==='action'&&tools.has(c.expected))),unnecessary_question:{count:results.filter(r=>r.repeated_question).length,total:results.length},hallucinated_action_rate:null,state_persistence_accuracy:null},results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=evaluateUnseen();
 if(process.env.DABBIR_UNSEEN_REPORT)fs.writeFileSync(process.env.DABBIR_UNSEEN_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,results:report.results.filter(r=>!r.pass).map(r=>({id:r.id,failures:r.checks.filter(c=>!c.pass),repeated:r.repeated_question}))},null,2));
 if(process.argv.includes('--gate')&&report.passed!==report.cases)process.exitCode=1;
}
