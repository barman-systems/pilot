import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, '../db/dabbir_safe_followup_autonomy_v1.sql'), 'utf8');

function must(pattern, message) {
  assert.match(sql, pattern, message);
}

function mustNot(pattern, message) {
  assert.doesNotMatch(sql, pattern, message);
}

test('safe follow-up v1 is explicitly internal-only', () => {
  must(/followup\.capture_internal/g, 'internal follow-up action key must be explicit');
  must(/'LOW'/, 'the only seeded autonomous policy must be LOW risk');
  must(/'scope','internal_state_only'/, 'policy scope must be internal state only');
  must(/'external_side_effects',false/g, 'external side effects must be declared false');
  mustNot(/net\.http|http_request|http_post|send_whatsapp|send_sms|send_email/i, 'v1 must not contain an external-send transport');
});

test('safe follow-up v1 fails closed before automation', () => {
  must(/new\.sender_type <> 'customer'/, 'only customer messages may trigger capture');
  must(/coalesce\(new\.simulated,false\)/, 'simulated traffic must be rejected');
  must(/v_business_name like 'DABBIR AI QA %'/, 'QA businesses must be excluded from real outcomes');
  must(/p\.action_key = 'followup\.capture_internal'/, 'exact tenant policy must be present');
  must(/v_policy\.active is not true/, 'inactive policy must stop automation');
  must(/v_policy\.risk_class <> 'LOW'/, 'non-LOW policy must stop automation');
  must(/v_policy\.auto_execute is not true/, 'auto-execute must be explicitly enabled');
  must(/v_policy\.requires_owner_approval is true/, 'approval-required policy must not auto-execute');
  must(/v_policy\.requires_identity_verification is true/, 'identity-required policy must not auto-execute');
});

test('explicit intent detection rejects obvious do-not-contact instructions', () => {
  must(/do not call\|dont call\|stop calling\|stop contacting/, 'English negative-contact phrases must fail closed');
  must(/لا\[\[:space:\]\]\+/, 'Arabic negative-contact form must be checked');
  must(/follow\[ -\]\?up\|call me\|contact me\|reach out\|remind me/, 'explicit English follow-up intents must be recognized');
  must(/كلمني\|كلموني\|اتصل بي\|اتصلوا بي\|تواصل معي/, 'explicit Arabic follow-up intents must be recognized');
});

test('capture is idempotent per persisted source message', () => {
  must(/dabbir_followups_source_message_unique/, 'source-message unique index must exist');
  must(/metadata->>'source_message_id'/, 'deduplication must be based on source message id');
  must(/exception when unique_violation/, 'replayed trigger attempts must exit without duplicate follow-up');
});

test('verified outcome is written only after follow-up persistence', () => {
  const followupInsert = sql.indexOf('insert into public.dabbir_followups');
  const outcomeInsert = sql.indexOf('insert into public.dabbir_operation_outcomes');
  assert.ok(followupInsert >= 0, 'follow-up insert must exist');
  assert.ok(outcomeInsert > followupInsert, 'outcome must be written after the follow-up is persisted');
  must(/'VERIFIED_SUCCESS'/, 'successful internal persistence must be recorded as VERIFIED_SUCCESS');
  must(/'safe_eligible',[\s\S]*true/i, 'outcome contract must mark the operation safe-eligible');
  must(/'manual_seconds_measurement','UNMEASURED'/, 'time-saving estimate must not be fabricated before field calibration');
});

test('security definer helpers are private and pin an empty search path', () => {
  const definerCount = (sql.match(/security definer/g) || []).length;
  const pinnedCount = (sql.match(/set search_path = ''/g) || []).length;
  assert.equal(definerCount, 2, 'only the two trigger-only writers should use SECURITY DEFINER');
  assert.ok(pinnedCount >= definerCount, 'every SECURITY DEFINER helper must pin an empty search_path');
  must(/revoke all on function dabbir_private\.seed_safe_followup_policy\(\) from public, anon, authenticated/, 'seed trigger helper must not be directly executable by app roles');
  must(/revoke all on function dabbir_private\.capture_safe_internal_followup\(\) from public, anon, authenticated/, 'capture trigger helper must not be directly executable by app roles');
});

test('tomorrow is the only v1 temporal promise turned into a due time', () => {
  must(/tomorrow\|باجر\|بكره\|بكرة\|غدا\|غداً/, 'tomorrow variants must be explicit');
  must(/time '09:00'/, 'internal scheduling default must be deterministic');
  must(/else null/, 'ambiguous timing must remain unset instead of being guessed');
});
