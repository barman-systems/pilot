import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260914184800_dabbir_qwen37_canary_capability_v1.sql',import.meta.url),'utf8');

test('Qwen3.7 capability migration is fail-closed and cannot activate real traffic',()=>{
  assert.match(migration,/['"]ai\.semantic\.qwen37_canary['"]/);
  assert.match(migration,/['"]QWEN37_SEMANTIC_INTERPRETER['"]/);
  assert.match(migration,/['"]alibaba\/qwen3\.7-flash['"]/);
  assert.match(migration,/['"]SEMANTIC_INTERPRETER_ONLY['"]/);
  assert.match(migration,/['"]runtime_control['"]/);
  const normalized=migration.replace(/\s+/g,' ');
  assert.match(normalized,/false, false, false, true,/);
  assert.match(normalized,/['"]rollout_percent['"],\s*0/);
  assert.match(normalized,/['"]max_percent['"],\s*1/);
  assert.match(normalized,/['"]control_version['"],\s*1/);
  assert.match(normalized,/on conflict \(capability_key\) do nothing/i);
  assert.doesNotMatch(migration,/\benabled\s*=\s*true\b/i);
  assert.doesNotMatch(migration,/['"]rollout_percent['"],\s*[2-9]/);
});

test('Qwen3.7 capability migration introduces no DDL or privilege expansion',()=>{
  assert.doesNotMatch(migration,/\b(create|alter|drop|grant|revoke|security\s+definer)\b/i);
  assert.match(migration,/^insert into public\.dabbir_capability_registry/m);
});
