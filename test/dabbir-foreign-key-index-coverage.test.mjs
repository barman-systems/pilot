import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('foreign-key coverage migration indexes only missing valid FK prefixes',()=>{
  const sql=read('supabase/migrations/20260909062623_cover_unindexed_foreign_keys_v1.sql');
  assert.match(sql,/con\.contype='f'/i);
  assert.match(sql,/n\.nspname in \('public','dabbir_private'\)/i);
  assert.match(sql,/i\.indisvalid/i);
  assert.match(sql,/i\.indisready/i);
  assert.match(sql,/array_agg\(k order by ord\)/i);
  assert.match(sql,/ord<=array_length\(con\.conkey,1\)/i);
  assert.match(sql,/create index if not exists/i);
  assert.doesNotMatch(sql,/drop index|drop constraint|disable row level security/i);
});

test('advisor baseline fails closed from zero unindexed foreign keys',()=>{
  const baseline=JSON.parse(read('config/supabase-advisor-baseline.json'));
  assert.ok(baseline.policy.monitored_info_lints.includes('unindexed_foreign_keys'));
  assert.equal(baseline.performance.unindexed_foreign_keys.count,0);
  assert.equal(baseline.security.rls_enabled_no_policy.count,0);
});
