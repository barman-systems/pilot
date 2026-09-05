import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const broker=read('supabase/functions/dabbir-owner-broker/index.ts');
const migration=read('supabase/migrations/20260905204500_dabbir_owner_incident_read_scope_v1.sql');

test('incident read RPC enforces business scope and stays server-only',()=>{
  assert.match(migration,/dabbir_platform_incident_read_scoped_v1/);
  assert.match(migration,/platform_assert_business_scope\(p_actor,p_business_id\)/);
  assert.match(migration,/platform_scope_allows_business\(p_actor,i\.business_id\)/);
  assert.match(migration,/revoke all on function public\.dabbir_platform_incident_read_scoped_v1\(uuid,uuid,text,uuid,integer\) from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.dabbir_platform_incident_read_scoped_v1\(uuid,uuid,text,uuid,integer\) to service_role/);
});

test('owner broker reads incidents only through scoped RPC',()=>{
  assert.match(broker,/dabbir_platform_incident_read_scoped_v1/);
  assert.doesNotMatch(broker,/sb\(`\/rest\/v1\/dabbir_platform_owner_incidents/);
  assert.doesNotMatch(broker,/sb\(`\/rest\/v1\/dabbir_platform_owner_incident_events/);
});