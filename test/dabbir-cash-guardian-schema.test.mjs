import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('financial evidence keeps business scope when linked customer or conversation is deleted',()=>{
  const fix=fs.readFileSync('supabase/migrations/20260827131010_dabbir_cash_guardian_fk_delete_targets.sql','utf8');
  assert.match(fix,/foreign key \(business_id,customer_id\)[\s\S]*on delete set null \(customer_id\)/i);
  assert.match(fix,/foreign key \(business_id,conversation_id\)[\s\S]*on delete set null \(conversation_id\)/i);
  assert.doesNotMatch(fix,/on delete set null\s*;/i);
});
