import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260903201100_dabbir_actions_gcc_profile_guard_v1.sql', import.meta.url), 'utf8');

const expected = [
  ["'AE'", "'AED'", "'Asia/Dubai'"],
  ["'SA'", "'SAR'", "'Asia/Riyadh'"],
  ["'KW'", "'KWD'", "'Asia/Kuwait'"],
  ["'QA'", "'QAR'", "'Asia/Qatar'"],
  ["'BH'", "'BHD'", "'Asia/Bahrain'"],
  ["'OM'", "'OMR'", "'Asia/Muscat'"],
];

test('WhatsApp AI enqueue recognizes every GCC country/currency/timezone tuple', () => {
  for (const tuple of expected) {
    for (const token of tuple) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('WhatsApp AI enqueue fails closed before action job creation on an unverified GCC profile', () => {
  const guard = migration.indexOf("raise exception 'BUSINESS_GCC_PROFILE_UNVERIFIED'");
  const enqueue = migration.indexOf('return public.dabbir_ai_enqueue_action_job');
  assert.ok(guard > 0);
  assert.ok(enqueue > guard);
  assert.match(migration, /coalesce\(v_profile_verified,false\) is not true/);
});

test('WhatsApp GCC guard does not invent a default country or currency', () => {
  assert.doesNotMatch(migration, /coalesce\(b\.currency_code,'AED'\)/i);
  assert.doesNotMatch(migration, /coalesce\(b\.timezone,'Asia\/Dubai'\)/i);
  assert.match(migration, /else false/);
});
