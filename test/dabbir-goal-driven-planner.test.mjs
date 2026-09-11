import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGoalDrivenConversationPlan} from '../api/_dabbir-goal-driven-planner.js';

const fact=(value,source='CUSTOMER_STATED',confidence=.99)=>({value,source,confidence,status:'active'});
const baseState=(extra={})=>({
  language:'ar',goal:'BOOK_SERVICE',intent:'BOOKING',service_type:'car_wash',
  entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1)},
  missing_fields:['vehicle','location','date','time'],unresolved_references:[],invalid_fields:[],
  clarification_entity:'vehicle',requirement_loop:{key:'vehicle',count:1},
  activity_requirements:{contract:{delivery_modes:['MOBILE']}},
  cognition:{pending_field:'vehicle',pending_question:{field:'vehicle',text:'أي سيارة؟',presentation:'PROVIDER_ACCEPTED'},next_action:'CLARIFY'},
  ...extra,
});
const context=(body='ابا اغسل السيارة')=>({business:{business_type:'car_wash'},batch_messages:[{body}]});
const result=state=>({state,decision:{action:'CLARIFY',intent:'BOOKING',confidence:.9,riskLevel:'LOW',missingFields:[...state.missing_fields],reasonCode:'MISSING_OR_AMBIGUOUS_FACT',reply:'legacy prompt'}});
const plan=(state,previous=null,proposal=null,body)=>applyGoalDrivenConversationPlan({args:{context:context(body),previous,proposal},result:result(state)});

test('single database-authorized delivery mode is never exposed as a customer question',()=>{
  const state=baseState({missing_fields:['delivery_mode','vehicle','location','date','time'],clarification_entity:'delivery_mode',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),delivery_mode:fact('AT_BUSINESS','AI_INFERENCE',.5)},
    cognition:{pending_field:null,next_action:'CLARIFY'}});
  const r=plan(state);
  assert.notEqual(r.state.clarification_entity,'delivery_mode');
  assert.match(r.decision.reply,/سيارة/);
  assert.equal(r.decision.action,'CLARIFY');
});

test('English grounded acknowledgement uses English punctuation at composition source',()=>{
  const state=baseState({language:'en',missing_fields:['vehicle'],clarification_entity:'vehicle',
    entities:{service:fact('svc'),branch:fact('branch','DATABASE_FACT',1),date:fact('2026-09-12'),time:fact('09:00')},cognition:{pending_field:'vehicle'}});
  const r=plan(state,null,null,'I want to book tomorrow at 9am');
  assert.doesNotMatch(r.decision.reply,/،/);
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
