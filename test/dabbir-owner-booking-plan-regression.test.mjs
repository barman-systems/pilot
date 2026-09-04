import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { deterministicPlan, validate } from '../api/ai-business-operator.js';

const source=fs.readFileSync(new URL('../api/ai-business-operator.js',import.meta.url),'utf8');

test('natural write commands use the single-tool mapper before autonomous fallback',()=>{
  assert.match(source,/await aiPlan\(message,language\)/);
  assert.match(source,/Tool selection only\. Server validates, asks for owner approval, and executes separately\./);
});

test('write intent cannot report completed when no executable plan exists',()=>{
  assert.match(source,/looksLikeWriteIntent/);
  assert.match(source,/NO_EXECUTABLE_PLAN/);
  assert.match(source,/planned\?\.state==='completed'.*planned\?\.executed/s);
  assert.match(source,/state:'failed'/);
});

test('exact deterministic booking still builds the executable appointment tool',()=>{
  const plan=deterministicPlan('سالم يريد حجز الساعة 9:30 ص');
  assert.equal(plan.tool,'book_available_appointment');
  assert.deepEqual(validate(plan),{
    action:'book_available_appointment',
    customer_name:'سالم',
    day:'today',
    period:'exact',
    exact_time:'09:30',
    duration_minutes:30
  });
});
