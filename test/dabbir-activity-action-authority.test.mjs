import test from 'node:test';
import assert from 'node:assert/strict';
import {understandConversation,semanticPlannerContext} from '../api/_dabbir-semantic-engine.js';
import {activityActionAuthority} from '../api/_dabbir-activity-intelligence.js';
import {context,offered,appointments,now,ids} from './fixtures/understanding/cases.mjs';

function run(c,body){return understandConversation({context:{...c,batch_messages:[{body}]},now});}
test('the same request selects availability only if the service contract permits it',()=>{
 const c=context();const permitted=run(c,'أبي غسيل كامل بكرة الساعة 5 مساء');
 assert.equal(permitted.decision.action,'CHECK_AVAILABILITY');
 c.activity_profile.services[0].supported_actions=['PRICING','HANDOFF'];
 const denied=run(c,'أبي غسيل كامل بكرة الساعة 5 مساء');
 assert.equal(denied.decision.action,'HANDOFF');assert.equal(denied.decision.reasonCode,'ACTIVITY_ACTION_NOT_SUPPORTED');
 assert.deepEqual(semanticPlannerContext(c,denied.state).activity.supported_actions,['PRICING','HANDOFF']);
});
test('an already presented slot cannot override a service action restriction',()=>{
 const c=context({pending_state:offered});
 c.activity_profile.services[0].supported_actions=['CHECK_AVAILABILITY','HANDOFF'];
 const r=run(c,'الثاني');assert.equal(r.decision.action,'HANDOFF');assert.equal(r.state.operational_confidence,0);
});
test('missing and malformed action contracts fail closed',()=>{
 for(const value of [undefined,null,'CREATE_BOOKING',{},['CHECK_AVAILABILITY',{}]]){
  const c=context({pending_state:offered});c.activity_profile.services[0].supported_actions=value;
  assert.equal(run(c,'الثاني').decision.reasonCode,'ACTIVITY_ACTION_CONTRACT_INVALID');
 }
});
test('cancellation resolves the booked service, ignoring a different selected service',()=>{
 const c=context({upcoming_appointments:[appointments[0]]});
 c.activity_profile.services[0].supported_actions=['CHECK_AVAILABILITY'];
 const r=run(c,'cancel it');assert.equal(r.decision.action,'HANDOFF');assert.equal(r.decision.reasonCode,'ACTIVITY_ACTION_NOT_SUPPORTED');
});
test('an allowed action in a foreign profile or service never authorizes this business',()=>{
 const c=context();const r=run(c,'أبي غسيل كامل بكرة الساعة 5 مساء');
 c.activity_profile.services[0].business_id=ids.other;
 assert.equal(activityActionAuthority(c,r.state,'CHECK_AVAILABILITY').allowed,false);
 c.activity_profile.business_id=ids.other;
 assert.equal(activityActionAuthority(c,r.state,'CHECK_AVAILABILITY').reason,'ACTIVITY_PROFILE_UNVERIFIED');
});
