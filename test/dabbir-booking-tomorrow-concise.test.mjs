import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { deterministicPlan, validate } from '../api/ai-business-operator.js';

const aiCore=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');

test('Arabic tomorrow exact booking is deterministic and valid',()=>{
  const command='عليا تريد حجز غسيل السيارة غدا الساعة 9 صباحاً';
  const plan=deterministicPlan(command);
  assert.equal(plan.tool,'book_available_appointment');
  assert.deepEqual(plan.args,{customer_name:'عليا',day:'tomorrow',period:'exact',exact_time:'09:00',duration_minutes:30});
  assert.deepEqual(validate(plan),{action:'book_available_appointment',customer_name:'عليا',day:'tomorrow',period:'exact',exact_time:'09:00',duration_minutes:30});
});

test('Arabic customer prefix and tomorrow synonyms are accepted',()=>{
  for(const command of ['العميل علي يبا يغسل غداً الساعة 9 ص','عميل سالم يريد حجز بكره الساعه 10 صباحا']){
    const plan=deterministicPlan(command);
    assert.equal(plan.tool,'book_available_appointment');
    assert.equal(plan.args.day,'tomorrow');
    assert.equal(plan.args.period,'exact');
  }
});

test('routine AI replies are deliberately low-token and hide internal details',()=>{
  assert.match(aiCore,/Hard limit: 25 words/);
  assert.match(aiCore,/max_tokens: 60/);
  assert.match(aiCore,/Never include internal IDs, UUIDs, diagnostics/);
  assert.match(aiCore,/history\.slice\(-4\)/);
});
