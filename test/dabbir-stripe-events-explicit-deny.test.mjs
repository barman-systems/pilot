import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827181400_dabbir_stripe_events_explicit_deny_v2.sql', import.meta.url), 'utf8');

test('Stripe event ledger has an explicit fail-closed client policy', () => {
  assert.match(migration, /create policy dabbir_stripe_events_explicit_deny/i);
  assert.match(migration, /for all\s+to anon, authenticated/i);
  assert.match(migration, /using \(false\)/i);
  assert.match(migration, /with check \(false\)/i);
  assert.doesNotMatch(migration, /to service_role/i);
});
