import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20260828053000_dabbir_redundant_index_cleanup_v1.sql';
const sql=fs.readFileSync(migrationPath,'utf8');

const redundant=[
  'public.dabbir_customer_management_business_customer_idx',
  'public.dabbir_procedure_steps_run_idx',
  'public.dabbir_whatsapp_connections_business_idx',
  'public.dabbir_whatsapp_connections_phone_idx',
];
const retained=[
  'dabbir_customer_management_business_id_customer_id_key',
  'dabbir_procedure_steps_run_id_step_index_key',
  'dabbir_whatsapp_connections_business_id_key',
  'dabbir_whatsapp_connections_phone_number_id_key',
];

test('cleanup drops only the four confirmed non-unique duplicate indexes',()=>{
  for(const name of redundant) assert.match(sql,new RegExp(`drop index if exists ${name.replaceAll('.','\\.')}`,'i'));
  assert.equal((sql.match(/drop index if exists/gi)||[]).length,redundant.length);
});

test('stronger unique counterparts are explicitly retained and never dropped',()=>{
  for(const name of retained){
    assert.match(sql,new RegExp(`Retained: ${name}`));
    assert.doesNotMatch(sql,new RegExp(`drop index if exists (?:public\\.)?${name}`,'i'));
  }
});

test('cleanup cannot mutate data, authorization, RLS, or functions',()=>{
  assert.doesNotMatch(sql,/\b(delete|update|insert|truncate|alter table)\b/i);
  assert.doesNotMatch(sql,/\b(grant|revoke)\b/i);
  assert.doesNotMatch(sql,/\b(enable|disable|force)\s+row\s+level\s+security\b/i);
  assert.doesNotMatch(sql,/create\s+(or\s+replace\s+)?function/i);
});
