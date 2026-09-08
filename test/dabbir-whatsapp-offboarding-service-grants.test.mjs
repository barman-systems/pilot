import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260908075600_dabbir_whatsapp_offboarding_service_grants_v1.sql','utf8');

test('offboarding receipt is writable only by service role',()=>{
  assert.match(sql,/grant usage on schema dabbir_private to service_role/i);
  assert.match(sql,/grant insert on table dabbir_private\.whatsapp_offboarding_receipts to service_role/i);
  assert.match(sql,/revoke all on table dabbir_private\.whatsapp_offboarding_receipts from public, anon, authenticated/i);
  assert.doesNotMatch(sql,/grant\s+(select|update|delete).*authenticated/i);
});
