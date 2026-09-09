import test from 'node:test';
import assert from 'node:assert/strict';
import {cognitiveTurnTransition,prepareCognitiveTurn,finalizeCognitiveTransition} from '../api/_dabbir-cognitive-transition.js';

const now=new Date('2026-09-09T16:00:00Z');
const ids={business:'10000000-0000-4000-8000-000000000001',conversation:'20000000-0000-4000-8000-000000000001',customer:'30000000-0000-4000-8000-000000000001',branch:'40000000-0000-4000-8000-000000000001'};
const context=body=>({business:{id:ids.business},conversation:{id:ids.conversation,branch_id:ids.branch},customer:{id:ids.customer},batch_messages:[{body}],pending_state:{pending_action:'none',payload:{}}});
const previous=extra=>({version:2,goal:'BOOK_SERVICE',intent:'BOOKING',updated_at:'2026-09-09T15:00:00Z',expires_at:'2026-09-09T17:00:00Z',scope:{business_id:ids.business,conversation_id:ids.conversation,customer_id:ids.customer,branch_id:ids.branch},cognition:{pending_field:'location'},...extra});
const proposal=(role,evidence,intent='SUPPORT',action='REPLY')=>({intent,action,confidence:.97,riskLevel:'LOW',entities:[],dialogue:{message_role:role,evidence,invalidated_fields:[]}});

test('pending-field answer inherits the active booking intent instead of becoming SUPPORT',()=>{
 const prepared=prepareCognitiveTurn({context:context('غياثي'),previous:previous(),now,proposal:proposal('ANSWER_TO_PENDING_QUESTION','غياثي')});
 assert.equal(prepared.args.proposal.intent,'BOOKING');
 assert.equal(prepared.transition.goal_operation,'UPDATE');
 assert.equal(prepared.transition.protected_goal,'BOOK_SERVICE');
 assert.equal(prepared.transition.reference_resolution,'PENDING_FIELD');
 assert.equal(prepared.transition.customer_meaning,'ANSWERS_PENDING_FIELD');
});

test('side service question pauses only the turn and keeps the read-only intent needed to answer it',()=>{
 const p=proposal('SIDE_QUESTION','كم ياخذ الغسيل','SERVICE_DISCOVERY','SERVICE_MENU');
 const prepared=prepareCognitiveTurn({context:context('غياثي، بس كم ياخذ الغسيل؟'),previous:previous(),now,proposal:p});
 assert.equal(prepared.args.proposal.intent,'SERVICE_DISCOVERY');
 assert.equal(prepared.transition.goal_operation,'PAUSE');
 assert.equal(prepared.transition.protected_goal,'BOOK_SERVICE');
 assert.equal(prepared.transition.response_strategy,'ANSWER_AND_RESUME');
 assert.equal(prepared.transition.customer_meaning,'SIDE_BUSINESS_QUESTION');
});

test('a side question mislabeled as a mutation cannot redirect the active journey',()=>{
 const p=proposal('SIDE_QUESTION','كم ياخذ الغسيل','RESCHEDULE_BOOKING','RESCHEDULE_BOOKING');
 const prepared=prepareCognitiveTurn({context:context('كم ياخذ الغسيل؟'),previous:previous(),now,proposal:p});
 assert.equal(prepared.args.proposal.intent,'SUPPORT');
 assert.equal(prepared.transition.goal_operation,'PAUSE');
 assert.equal(prepared.transition.protected_intent,'BOOKING');
});

test('correction updates facts inside the active goal instead of replacing the goal',()=>{
 const p=proposal('CORRECTION','لا، باجر','SUPPORT','REPLY');
 const prepared=prepareCognitiveTurn({context:context('لا، باجر'),previous:previous(),now,proposal:p});
 assert.equal(prepared.args.proposal.intent,'BOOKING');
 assert.equal(prepared.transition.goal_operation,'UPDATE');
 assert.equal(prepared.transition.response_strategy,'APPLY_CORRECTION_AND_CONTINUE');
});

test('unverified topic-switch labels cannot reset an active goal',()=>{
 const p=proposal('TOPIC_SWITCH','different topic','PRICING','PRICING');
 const prepared=prepareCognitiveTurn({context:context('كم السعر؟'),previous:previous(),now,proposal:p});
 assert.equal(prepared.args.proposal.intent,'BOOKING');
 assert.equal(prepared.transition.goal_operation,'KEEP');
 assert.equal(prepared.transition.replacement_evidence_verified,null);
});

test('explicit grounded abandonment may replace the active goal',()=>{
 const text='خلنا نترك الحجز ونتكلم عن الاسعار';
 const p=proposal('TOPIC_SWITCH',text,'PRICING','PRICING');
 const prepared=prepareCognitiveTurn({context:context(text),previous:previous(),now,proposal:p});
 assert.equal(prepared.args.proposal.intent,'PRICING');
 assert.equal(prepared.transition.goal_operation,'REPLACE');
 assert.equal(prepared.transition.protected_goal,null);
 assert.equal(prepared.transition.replacement_evidence_verified,true);
});

test('foreign conversation state is never protected or reused',()=>{
 const foreign=previous({scope:{business_id:ids.business,conversation_id:'foreign',customer_id:ids.customer,branch_id:ids.branch}});
 const p=proposal('ANSWER_TO_PENDING_QUESTION','غياثي','SUPPORT','REPLY');
 const transition=cognitiveTurnTransition({context:context('غياثي'),previous:foreign,now,proposal:p});
 assert.equal(transition.proposal.intent,'SUPPORT');
 assert.equal(transition.transition.protected_goal,null);
 assert.equal(transition.transition.active_before,false);
});

test('post-reducer strategy is deterministic and never requires another model call',()=>{
 const base=cognitiveTurnTransition({context:context('باجر'),previous:previous(),now,proposal:proposal('ANSWER_TO_PENDING_QUESTION','باجر')}).transition;
 const clarified=finalizeCognitiveTransition(base,{goal:'BOOK_SERVICE',clarification_entity:'time'},{action:'CLARIFY'});
 assert.equal(clarified.response_strategy,'ASK_NEXT_REQUIREMENT');
 assert.equal(clarified.next_pending_field,'time');
 const executable=finalizeCognitiveTransition(base,{goal:'BOOK_SERVICE'},{action:'CREATE_BOOKING'});
 assert.equal(executable.response_strategy,'EXECUTE_THEN_VERIFY');
});
