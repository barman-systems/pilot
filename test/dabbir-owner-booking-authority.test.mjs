import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTool,deterministicWritePlan} from '../api/ai-business-operator.js';

test('owner AI booking cannot create a customer or appointment from a name and guessed service',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('DOWNSTREAM_CALL_FORBIDDEN');};
 try {
  for(const payload of [
   {action:'book_available_appointment',customer_name:'عليا',day:'tomorrow',period:'exact',exact_time:'09:00',duration_minutes:30},
   {action:'book_available_appointment',customer_name:'Ali',day:'today',period:'afternoon',idempotency_key:'previous-approved-plan'},
  ])await assert.rejects(executeTool('owner-token','10000000-0000-4000-8000-000000000001',payload),/OWNER_BOOKING_CONTEXT_REQUIRED/);
  assert.equal(calls,0);
 } finally {globalThis.fetch=original;}
});
test('Arabic and English booking proposals ask for context before issuing owner approval',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('DOWNSTREAM_CALL_FORBIDDEN');};
 try {
  for(const message of ['عليا تريد حجز بكره الساعة 9 ص','John wants a wash at 7 pm'])
   await assert.rejects(deterministicWritePlan({token:'owner-token',businessId:'10000000-0000-4000-8000-000000000001',message}),/OWNER_BOOKING_CONTEXT_REQUIRED/);
  assert.equal(calls,0);
 } finally {globalThis.fetch=original;}
});
