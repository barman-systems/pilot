import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const ROOT_FIX_VERSION = '20260909071518';
const ROOT_FIX_FILE = `${ROOT_FIX_VERSION}_dabbir_sql_special_form_qualification_root_fix_v1.sql`;
const rootFix = fs.readFileSync(path.join(MIGRATIONS_DIR, ROOT_FIX_FILE), 'utf8');
const invalidQualifiedSpecialForm = /\bpg_catalog\.(?:coalesce|nullif|trim)\s*\(/i;

function migrationVersion(file) {
  return file.match(/^(\d{14})_/)?.[1] || null;
}

test('authoritative SQL never schema-qualifies PostgreSQL special forms as functions', () => {
  const authoritative = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .filter(file => {
      const version = migrationVersion(file);
      return version && version >= ROOT_FIX_VERSION;
    });

  assert.ok(authoritative.includes(ROOT_FIX_FILE));
  for (const file of authoritative) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    assert.doesNotMatch(sql, invalidQualifiedSpecialForm, file);
  }
});

test('WhatsApp inbound replacement preserves fail-closed tenant and service-role boundaries', () => {
  assert.match(rootFix, /create or replace function public\.dabbir_whatsapp_persist_inbound\(/i);
  assert.match(rootFix, /language plpgsql\s+security definer\s+set search_path = ''/i);
  assert.match(rootFix, /coalesce\(\(select auth\.role\(\)\), ''\) <> 'service_role'/i);
  assert.match(rootFix, /WHATSAPP_TENANT_CONNECTION_NOT_FOUND/);
  assert.match(rootFix, /dabbir_whatsapp_event_ledger/);
  assert.match(rootFix, /dabbir_enqueue_message_batch/);
  assert.match(rootFix, /pg_catalog\.regexp_replace\(coalesce\(p_sender_handle, ''\)/i);
  assert.match(rootFix, /nullif\(pg_catalog\.btrim\(p_phone_number_id\), ''\)/i);
  assert.match(rootFix, /revoke all on function public\.dabbir_whatsapp_persist_inbound[\s\S]*from public, anon, authenticated;/i);
  assert.match(rootFix, /grant execute on function public\.dabbir_whatsapp_persist_inbound[\s\S]*to service_role;/i);
  assert.doesNotMatch(rootFix, invalidQualifiedSpecialForm);
});

test('car-wash public booking abuse guard remains active logic without the runtime-only qualification bug', () => {
  assert.match(rootFix, /create or replace function public\.dabbir_car_wash_public_booking_abuse_guard\(\)/i);
  assert.match(rootFix, /pg_catalog\.regexp_replace\(\s*coalesce\(new\.customer_phone, ''\)/i);
  assert.match(rootFix, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(rootFix, /BOOKING_RATE_LIMITED/);
  assert.match(rootFix, /interval '10 minutes'/);
  assert.match(rootFix, /interval '24 hours'/);
  assert.match(rootFix, /revoke all on function public\.dabbir_car_wash_public_booking_abuse_guard\(\)[\s\S]*from public, anon, authenticated;/i);
  assert.doesNotMatch(rootFix, invalidQualifiedSpecialForm);
});
