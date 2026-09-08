import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260908075400_dabbir_whatsapp_offboarding_fail_closed_v0.sql','utf8');

test('business deletion fails closed while any WhatsApp connection exists',()=>{
  assert.match(sql,/guard_business_delete_whatsapp_offboarding/);
  assert.match(sql,/DABBIR_WHATSAPP_OFFBOARDING_REQUIRED_BEFORE_BUSINESS_DELETE/);
  assert.match(sql,/before delete on public\.dabbir_businesses/i);
});

test('legacy account offboarding is converted to a non-sendable pending state',()=>{
  assert.match(sql,/offboarding_pending/);
  assert.match(sql,/ACCOUNT_DELETE_OFFBOARDING/);
  assert.match(sql,/ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED/);
  assert.match(sql,/new\.status := 'offboarding_pending'/);
  assert.match(sql,/before update of status,last_error on public\.dabbir_whatsapp_connections/i);
});
