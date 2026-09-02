import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260903180500_dabbir_booking_trust_messaging_approvers_v2.sql'),'utf8');

test('team approval includes operational roles but excludes read-only roles',()=>{
  assert.match(sql,/m\.role in \('owner','admin','manager','employee','staff'\)/);
  assert.doesNotMatch(sql,/m\.role in \([^)]*viewer/i);
  assert.doesNotMatch(sql,/m\.role in \([^)]*agent/i);
});

test('pending booking does not suppress customer WhatsApp communication',()=>{
  assert.match(sql,/Trust rule: never silence the customer while approval\/deposit is pending/);
  assert.doesNotMatch(sql,/tg_op='INSERT'[\s\S]{0,1000}n\.channel='whatsapp'[\s\S]{0,500}set status='cancelled'/i);
});

test('previously cancelled pending-gate customer messages are restored',()=>{
  assert.match(sql,/set status='pending',updated_at=now\(\),last_error=null/);
  assert.match(sql,/n\.notification_type='booking_confirmation'/);
  assert.match(sql,/n\.notification_type in \('reminder_24h','reminder_2h'\) and n\.scheduled_for>now\(\)/);
});
