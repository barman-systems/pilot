import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,'supabase','migrations',name),'utf8');

const extensions=read('20260909040933_activate_dabbir_platform_extensions_v1.sql');
const realtime=read('20260909041004_activate_dabbir_realtime_core_v1.sql');
const pgauditHardening=read('20260909041418_harden_pgaudit_schema_v1.sql');

test('platform extensions include the intended server capabilities with scoped audit logging',()=>{
  for(const extension of ['vector','pgtap','postgis','pgaudit']){
    assert.match(extensions,new RegExp(`create extension if not exists ${extension}\\b`,'i'));
  }
  assert.match(extensions,/alter role authenticator set pgaudit\.log to 'write'/i);
  assert.doesNotMatch(extensions,/pgaudit\.log\s+to\s+'all'/i);
});

test('PGAudit is moved out of public and its internal hooks are not client executable',()=>{
  assert.match(pgauditHardening,/alter extension pgaudit set schema extensions/i);
  for(const fn of ['pgaudit_ddl_command_end','pgaudit_sql_drop']){
    assert.match(pgauditHardening,new RegExp(`revoke execute on function extensions\\.${fn}\\(\\) from public, anon, authenticated`,'i'));
  }
});

test('Realtime publication is limited to RLS-protected operational surfaces',()=>{
  for(const table of ['dabbir_conversations','dabbir_appointments','dabbir_handoffs','dabbir_workflow_notifications']){
    assert.match(realtime,new RegExp(`public\\.${table}\\b`,'i'));
  }
  for(const forbidden of ['credentials','otp','audit','event_ledger','outbound_reservations','integration_outbox']){
    assert.doesNotMatch(realtime,new RegExp(forbidden,'i'));
  }
});
