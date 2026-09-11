import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const automation=fs.readFileSync(new URL('../api/_barman-executive-automation.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260911170739_barman_ceo_runtime_semantic_route_v1.sql',import.meta.url),'utf8');

test('existing runtime health worker is selected by semantic understanding, not keyword lane inference',()=>{
  assert.match(automation,/RUNTIME_CHECK/);
  assert.match(automation,/Return RUNTIME_CHECK for a live DABBIR health\/status check/);
  assert.match(migration,/RUNTIME_CHECK/);
  assert.match(migration,/when 'RUNTIME_CHECK' then 'runtime'/);
  assert.doesNotMatch(migration,/char_length\(c\.command_text\)/);
  assert.doesNotMatch(migration,/~\*/);
});
