import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827184000_dabbir_unused_delete_grants_v1.sql', import.meta.url), 'utf8');

test('unused direct DELETE grants remain revoked', () => {
  assert.match(migration, /revoke delete on table public\.dabbir_businesses from authenticated/i);
  assert.match(migration, /revoke delete on table public\.dabbir_conversations from authenticated/i);
  assert.doesNotMatch(migration, /grant delete/i);
});
