import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGoalDrivenConversationPlan} from '../api/_dabbir-goal-driven-planner.js';

const fact=(value,source='CUSTOMER_STATED',confidence=.99)=>({value,source,confidence,status:'active'});
const baseState=(extra={})=>({
  language:'ar',goal:'BOOK_SERVICE',intent:'BOOKING',service_type:'car_wash',
  entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1)},
  missing_fields:['vehicle','location','date','time'],unresolved_references:[],invalid_fields:[],
  clarification_entity:'vehicle',requirement_loop:{key:'vehicle',count:1},
  activity_requirements:{contract:{service_id:'svc',delivery_modes:['MOBILE']}},
  cognition:{pending_field:'vehicle',pending_question:{field:'vehicle',text:'أي سيارة؟',presentation:'PROVIDER_ACCEPTED'},next_action:'CLARIFY'},
  ...extra,
});
const context=(body='ابا اغسل السيارة',created_at='2026-09-10T12:31:44Z')=>({business:{business_type:'car_wash',timezone:'Asia/Dubai'},batch_messages:[{body,created_at}]});
const result=state=>({state,decision:{action:'CLARIFY',intent:'BOOKING',confidence:.9,riskLevel:'LOW',missingFields:[...state.missing_fields],reasonCode:'MISSING_OR_AMBIGUOUS_FACT',reply:'legacy prompt'}});
const plan=(state,previous=null,proposal=null,body,created_at)=>applyGoalDrivenConversationPlan({args:{context:context(body,created_at),previous,proposal},result:result(state)});

test('single database-authorized delivery mode is never exposed as a customer question',()=>{
  const state=baseState({missing_fields:['delivery_mode','vehicle','location','date','time'],clarification_entity:'delivery_mode',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),delivery_mode:fact('AT_BUSINESS','AI_INFERENCE',.5)},
    cognition:{pending_field:null,next_action:'CLARIFY'}});
  const r=plan(state);
  assert.notEqual(r.state.clarification_entity,'delivery_mode');
  assert.equal(r.state.entities.delivery_mode.value,'MOBILE');
  assert.equal(r.state.entities.delivery_mode.source,'DATABASE_FACT');
  assert.match(r.decision.reply,/سيارة/);
  assert.equal(r.decision.action,'CLARIFY');
});

test('real WhatsApp phrase grounds single mobile mode and immediate time without asking either again',()=>{
  const state=baseState({
    missing_fields:['delivery_mode','vehicle','location','date','time'],invalid_fields:['delivery_mode'],clarification_entity:'delivery_mode',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),delivery_mode:fact('AT_BUSINESS','AI_INFERENCE',.5),date:fact('2026-09-10','AI_INFERENCE',.5),time:fact('16:31','AI_INFERENCE',.5)},
    cognition:{pending_field:'delivery_mode',inferred_facts:['delivery_mode','date','time'],unverified_facts:['delivery_mode','date','time'],next_action:'CLARIFY'}
  });
  const r=plan(state,null,{action:'CHECK_AVAILABILITY',confidence:.89},'اذا فاضي الحين تعال غسل السياره','2026-09-10T12:31:44Z');
  assert.equal(r.state.entities.delivery_mode.value,'MOBILE');
  assert.equal(r.state.entities.delivery_mode.source,'DATABASE_FACT');
  assert.equal(r.state.entities.date.value,'2026-09-10');
  assert.equal(r.state.entities.date.source,'CUSTOMER_STATED');
  assert.equal(r.state.entities.time.value,'16:31');
  assert.equal(r.state.entities.time.source,'CUSTOMER_STATED');
  assert.ok(!r.state.missing_fields.includes('delivery_mode'));
  assert.ok(!r.state.missing_fields.includes('date'));
  assert.ok(!r.state.missing_fields.includes('time'));
  assert.notEqual(r.state.clarification_entity,'delivery_mode');
  assert.doesNotMatch(r.decision.reply,/وين تبا الخدمة|أي يوم|أي وقت|اليوم والوقت/);
});

test('bare الحين answers scheduling with the business-local message time instead of asking which day',()=>{
  const previous=baseState({clarification_entity:'date',cognition:{pending_field:'date',pending_question:{field:'date',fields:['date','time'],text:'متى يناسبك؟ اذكر اليوم والوقت اللي تفضله.',presentation:'PROVIDER_ACCEPTED'}}});
  const state=baseState({missing_fields:['vehicle','location','date','time'],clarification_entity:'date',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),delivery_mode:fact('MOBILE','CUSTOMER_CONFIRMED',.99),date:fact('2026-09-10','AI_INFERENCE',.5),time:fact('16:32','AI_INFERENCE',.5)},
    cognition:{pending_field:'date',inferred_facts:['date','time'],unverified_facts:['date','time'],next_action:'CLARIFY'}});
  const r=plan(state,previous,{action:'CHECK_AVAILABILITY',confidence:.89},'الحين','2026-09-10T12:32:21Z');
  assert.equal(r.state.entities.date.value,'2026-09-10');
  assert.equal(r.state.entities.date.source,'CUSTOMER_STATED');
  assert.equal(r.state.entities.time.value,'16:32');
  assert.equal(r.state.entities.time.source,'CUSTOMER_STATED');
  assert.ok(!r.state.missing_fields.includes('date'));
  assert.ok(!r.state.missing_fields.includes('time'));
  assert.doesNotMatch(r.decision.reply,/أي يوم|أي وقت|اليوم والوقت/);
});

test('negated immediate time is never silently grounded',()=>{
  const state=baseState({missing_fields:['date','time'],clarification_entity:'date',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),date:fact('2026-09-10','AI_INFERENCE',.5),time:fact('16:32','AI_INFERENCE',.5)},
    cognition:{pending_field:'date',next_action:'CLARIFY'}});
  const r=plan(state,null,null,'مب الحين');
  assert.equal(r.state.entities.date.source,'AI_INFERENCE');
  assert.equal(r.state.entities.time.source,'AI_INFERENCE');
});

test('an actually pending unanswered field stays coherent instead of jumping around the form',()=>{
  const previous=baseState({clarification_entity:'location',cognition:{pending_field:'location',pending_question:{field:'location',text:'وين موقع الخدمة؟',presentation:'PROVIDER_ACCEPTED'}}});
  const state=baseState({clarification_entity:'vehicle',cognition:{pending_field:'vehicle'}});
  const r=plan(state,previous,{dialogue:{message_role:'CONTINUATION'}});
  assert.equal(r.state.clarification_entity,'location');
  assert.match(r.decision.reply,/موقع/);
});

test('fresh date and time planning can become one natural scheduling question',()=>{
  const state=baseState({missing_fields:['date','time'],clarification_entity:null,cognition:{pending_field:null}});
  const r=plan(state);
  assert.equal(r.state.clarification_entity,'date');
  assert.deepEqual(r.state.cognition.pending_question.fields,['date','time']);
  assert.match(r.decision.reply,/اليوم والوقت/);
});

test('an existing targeted clarification keeps its grounded wording',()=>{
  const state=baseState({missing_fields:['time'],clarification_entity:'time',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),time:{value:null,source:'CUSTOMER_STATED',confidence:.55,status:'active',part:'after_maghrib'}},
    cognition:{pending_field:null}});
  const input={state,decision:{action:'CLARIFY',intent:'BOOKING',confidence:.9,riskLevel:'LOW',missingFields:['time'],reasonCode:'MISSING_OR_AMBIGUOUS_FACT',reply:'أي ساعة تناسبك بعد المغرب؟'}};
  const r=applyGoalDrivenConversationPlan({args:{context:context('عقب المغرب'),previous:null,proposal:null},result:input});
  assert.equal(r.state.clarification_entity,'time');
  assert.equal(r.decision.reply,'أي ساعة تناسبك بعد المغرب؟');
  assert.equal(r.decision.reasonCode,'MISSING_OR_AMBIGUOUS_FACT');
});

test('a partially understood answer is completed before asking a different requirement',()=>{
  const state=baseState({missing_fields:['vehicle','time'],clarification_entity:'vehicle',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),time:{value:null,source:'CUSTOMER_STATED',confidence:.55,status:'active',hour:5,part:'am_pm'}},
    cognition:{pending_field:null}});
  const r=plan(state,null,null,'الساعة خمس');
  assert.equal(r.state.clarification_entity,'time');
  assert.match(r.decision.reply,/وقت/);
});

test('verified facts are validation inputs and are never re-asked even if a stale missing list contains them',()=>{
  const state=baseState({missing_fields:['vehicle','date'],
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),vehicle:fact('station','CUSTOMER_CONFIRMED',.99)},
    cognition:{pending_field:null}});
  const r=plan(state);
  assert.equal(r.state.clarification_entity,'date');
  assert.doesNotMatch(r.decision.reply,/سيارة/);
});

test('safety and handoff decisions are never converted into conversational freedom',()=>{
  const state=baseState();
  const input={state,decision:{action:'HANDOFF',intent:'HUMAN_ASSISTANCE',confidence:.5,riskLevel:'HIGH',missingFields:state.missing_fields,reasonCode:'HIGH_RISK_ESCALATION'}};
  const r=applyGoalDrivenConversationPlan({args:{context:context(),previous:null,proposal:null},result:input});
  assert.equal(r.decision.action,'HANDOFF');
  assert.equal(r.decision.reasonCode,'HIGH_RISK_ESCALATION');
});

test('planner changes conversation strategy only; it never upgrades a clarification to mutation authority',()=>{
  const state=baseState({missing_fields:['vehicle','location','date','time'],cognition:{pending_field:null}});
  const r=plan(state,null,{action:'CREATE_BOOKING',intent:'BOOKING',confidence:.99,dialogue:{message_role:'NEW_REQUEST'}});
  assert.equal(r.decision.action,'CLARIFY');
  assert.equal(r.state.cognition.planner.source,'MODEL_SEMANTICS_PLUS_BUSINESS_STATE');
  assert.ok(r.state.missing_fields.length>0);
});
