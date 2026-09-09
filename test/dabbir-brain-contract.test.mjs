import test from 'node:test';import assert from 'node:assert/strict';
import {assertBrainDecision,verifiedAvailability,assertResponseGrounding} from '../api/_dabbir-brain-contract.js';
import {context,ids,now,slots} from './fixtures/understanding/cases.mjs';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {semanticContractViolation} from '../api/_dabbir-semantic-contract.js';
const c=context({batch_messages:[{body:'أبي غسيل كامل باجر الساعة 18:00'}]});
const {state,decision}=understandConversation({context:c,now});
test('validated decision cannot carry different tenant identifiers or ungrounded mutation',()=>{
 assert.equal(assertBrainDecision(state,decision,c),decision);
 assert.throws(()=>assertBrainDecision({...state,scope:{...state.scope,business_id:ids.other}},decision,c),/BRAIN_DECISION_CONTRACT_INVALID/);
 assert.throws(()=>assertBrainDecision(state,{...decision,confidence:NaN},c),/BRAIN_DECISION_CONTRACT_INVALID/);
 assert.throws(()=>assertBrainDecision(state,{...decision,action:'CREATE_BOOKING'},c),/BRAIN_MUTATION_NOT_AUTHORIZED/);
});
test('availability: missing/error/foreign/malformed result never becomes unavailable or a bookable offer',()=>{
 for(const bad of [null,{},true,{error:'timeout'},{slots:[{...slots[0],service_id:ids.other}]},{slots:[{...slots[0],worker_id:ids.other}]},{slots:[{...slots[0],starts_at:'invalid'}]}])assert.throws(()=>verifiedAvailability(bad,c,state),/SEMANTIC_AVAILABILITY_RESULT_INVALID/);
 assert.deepEqual(verifiedAvailability({slots:[]},c,state),[]);
 assert.deepEqual(verifiedAvailability({slots},c,state),slots);
});
for(const [text,action] of [['تم إلغاء الموعد ✅.','CANCEL_BOOKING'],['تم تعديل الموعد إلى الغد.','RESCHEDULE_BOOKING'],['تم حجز الموعد','CREATE_BOOKING'],['Your appointment has been cancelled','CANCEL_BOOKING']])test('response claim requires matching receipt: '+action+' '+text,()=>{
 assert.throws(()=>assertResponseGrounding(text),/BRAIN_UNVERIFIED_ACTION_LANGUAGE/);
 assert.throws(()=>assertResponseGrounding(text,{verified:true,action:'OTHER'}),/BRAIN_UNVERIFIED_ACTION_LANGUAGE/);
 assert.doesNotThrow(()=>assertResponseGrounding(text,{verified:true,action}));
});
test('future commitments cannot be invented by owner knowledge or generated prose',()=>{
 for(const text of ['بشيك التوفر','بعطي الفريق التفاصيل',"I'll book that for you",'I will notify the team'])assert.throws(()=>assertResponseGrounding(text),/BRAIN_UNPERSISTED_COMMITMENT/);
 assert.doesNotThrow(()=>assertResponseGrounding('لم يتم حجز الموعد. أي يوم يناسبك؟'));
});
test('model reference cannot contain identifiers or invalid fields',()=>{
 const p={action:'REPLY',intent:'SUPPORT',confidence:1,risk_level:'LOW',service_name:null,knowledge_key:null,entities:[]};
 for(const fields of [['business_id'],[],['service','worker','location','vehicle','service']])assert.equal(semanticContractViolation(JSON.stringify({...p,context_reference:{fields,evidence:'نفس',confidence:1}})),'CONTEXT_REFERENCE');
 assert.equal(semanticContractViolation(JSON.stringify({...p,context_reference:{fields:['service'],evidence:'نفس أمس',confidence:.95}})),null);
});
