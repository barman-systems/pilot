import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827185000_dabbir_evolution_service_only_policies_v1.sql', import.meta.url), 'utf8');

test('evolution control tables are explicitly denied to client roles', () => {
  for (const table of ['dabbir_evolution_objectives','dabbir_evolution_state']) {
    assert.match(migration, new RegExp(`alter table barman_control\\.${table} force row level security`, 'i'));
    assert.match(migration, new RegExp(`create policy ${table}_client_deny`, 'i'));
  }
  assert.match(migration, /for all to anon, authenticated\s+using \(false\)\s+with check \(false\)/i);
  assert.doesNotMatch(migration, /grant\s+/i);
});
