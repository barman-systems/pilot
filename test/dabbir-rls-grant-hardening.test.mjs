import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827180100_dabbir_rls_grant_hardening_v1.sql', import.meta.url), 'utf8');

test('DABBIR tasks and WhatsApp connection tables use FORCE RLS', () => {
  assert.match(migration, /alter table public\.dabbir_tasks force row level security/i);
  assert.match(migration, /alter table public\.dabbir_whatsapp_connections force row level security/i);
});

test('anonymous access is fully revoked and authenticated grants are least privilege', () => {
  assert.match(migration, /revoke all on table public\.dabbir_tasks from public, anon, authenticated/i);
  assert.match(migration, /grant select, update on table public\.dabbir_tasks to authenticated/i);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_connections from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.dabbir_whatsapp_connections to authenticated/i);
  assert.doesNotMatch(migration, /grant .*truncate/i);
  assert.doesNotMatch(migration, /grant .*trigger/i);
  assert.doesNotMatch(migration, /grant .*references/i);
});

test('public task RPC is authenticated-only and trigger function is not directly executable by clients', () => {
  assert.match(migration, /revoke execute on function public\.dabbir_set_task_status\(uuid, uuid, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.dabbir_set_task_status\(uuid, uuid, text\) to authenticated/i);
  assert.match(migration, /revoke execute on function public\.dabbir_validate_procedure_run_transition\(\) from public, anon, authenticated/i);
});
