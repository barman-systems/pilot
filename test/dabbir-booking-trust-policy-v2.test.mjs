import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260903095500_dabbir_autonomous_booking_confirmation_v1.sql'),'utf8');
const policy=fs.readFileSync(path.join(root,'docs/booking-trust-policy-v2.md'),'utf8');

test('policy makes owner notification-only in the normal booking path',()=>{
  assert.match(policy,/never wait for owner, admin, manager, employee, or staff approval/i);
  assert.match(policy,/owner\/team receives booking notifications only/i);
});

test('no-deposit WhatsApp and web booking confirms immediately',()=>{
  assert.match(policy,/If no deposit is configured, the booking is confirmed immediately/i);
  assert.match(migration,/new\.confirmation_gate := 'none';\s+new\.status := 'confirmed';/);
});

test('deposit may gate confirmation but never introduces human approval',()=>{
  assert.match(policy,/confirmation waits only for the deposit state, not a human decision/i);
  assert.match(migration,/new\.confirmation_gate := 'deposit'/);
  assert.doesNotMatch(migration,/new\.confirmation_gate\s*:=\s*'owner_approval'/);
});

test('obsolete approval tasks are cancelled without suppressing customer messaging',()=>{
  assert.match(migration,/n\.channel='internal'/);
  assert.match(migration,/owner_approval_required/);
  assert.doesNotMatch(migration,/channel='whatsapp'[\s\S]{0,500}owner_approval_required/i);
});
