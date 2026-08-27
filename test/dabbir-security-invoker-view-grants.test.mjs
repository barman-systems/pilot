import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827183000_dabbir_security_invoker_view_grants_v1.sql', import.meta.url), 'utf8');
const outcomes = await readFile(new URL('../db/dabbir_phase2_operational_outcomes_v3.sql', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../db/dabbir_phase2_privacy_lifecycle_v4.sql', import.meta.url), 'utf8');

test('security-invoker read models expose SELECT only', () => {
  for (const view of ['dabbir_business_outcomes','dabbir_patient_data_gate']) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${view} from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant select on table public\\.${view} to authenticated`, 'i'));
  }
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|truncate|references|trigger)/i);
});

test('source definitions keep both views security invoker and read-only', () => {
  assert.match(outcomes, /create or replace view public\.dabbir_business_outcomes\s+with \(security_invoker=true\)/i);
  assert.match(outcomes, /grant select on public\.dabbir_business_outcomes to authenticated/i);
  assert.match(privacy, /create or replace view public\.dabbir_patient_data_gate\s+with \(security_invoker=true\)/i);
  assert.match(privacy, /grant select on public\.dabbir_patient_data_gate to authenticated/i);
});
