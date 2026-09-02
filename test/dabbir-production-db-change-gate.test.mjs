import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChangeSet, validateMigrationContent } from '../scripts/dabbir-production-db-change-gate.mjs';

const safeMigration=`alter table public.dabbir_orders add column if not exists external_ref text;\n`;

test('safe migration with regression test passes',()=>{
  const files=new Map([
    ['supabase/migrations/20260902160000_dabbir_external_ref.sql',safeMigration],
    ['test/dabbir-external-ref.test.mjs','export {};\n'],
  ]);
  const result=evaluateChangeSet([...files.keys()],{
    exists:file=>files.has(file),
    readFile:file=>files.get(file),
  });
  assert.equal(result.ok,true,result.errors.join('\n'));
});

test('db schema edits require a matching migration',()=>{
  const result=evaluateChangeSet(['db/schema.sql','test/schema.test.mjs'],{exists:()=>true,readFile:()=>''});
  assert.equal(result.ok,false);
  assert(result.errors.some(error=>error.startsWith('DB_SCHEMA_CHANGE_REQUIRES_MIGRATION:')));
});

test('migrations require a regression test in the same change set',()=>{
  const files=new Map([['supabase/migrations/20260902160000_dabbir_external_ref.sql',safeMigration]]);
  const result=evaluateChangeSet([...files.keys()],{exists:file=>files.has(file),readFile:file=>files.get(file)});
  assert.equal(result.ok,false);
  assert(result.errors.includes('MIGRATION_REQUIRES_REGRESSION_TEST'));
});

test('nested transaction control is forbidden in new migrations',()=>{
  const errors=validateMigrationContent('supabase/migrations/20260902160000_bad.sql','begin;\nselect 1;\ncommit;\n');
  assert(errors.some(error=>error.startsWith('MIGRATION_TRANSACTION_CONTROL_FORBIDDEN:')));
});

test('destructive migrations require an explicit reviewed marker',()=>{
  const path='supabase/migrations/20260902160000_drop_old.sql';
  assert(validateMigrationContent(path,'drop table public.old_data;\n').some(error=>error.startsWith('DESTRUCTIVE_MIGRATION_REVIEW_MARKER_REQUIRED:')));
  assert.equal(validateMigrationContent(path,'-- DABBIR-DESTRUCTIVE-MIGRATION-REVIEWED: BAR-999\ndrop table public.old_data;\n').length,0);
});

test('security definer migrations require fixed search_path and revoke',()=>{
  const path='supabase/migrations/20260902160000_rpc.sql';
  const unsafe='create function public.x() returns int language sql security definer as $$ select 1 $$;\n';
  const errors=validateMigrationContent(path,unsafe);
  assert(errors.some(error=>error.startsWith('SECURITY_DEFINER_SEARCH_PATH_REQUIRED:')));
  assert(errors.some(error=>error.startsWith('SECURITY_DEFINER_REVOKE_REQUIRED:')));
  const safe='create function public.x() returns int language sql security definer set search_path=pg_catalog,public as $$ select 1 $$;\nrevoke all on function public.x() from public,anon,authenticated;\n';
  assert.equal(validateMigrationContent(path,safe).length,0);
});

test('migration deletion is fail-closed',()=>{
  const result=evaluateChangeSet(['supabase/migrations/20260902160000_missing.sql','test/migration.test.mjs'],{exists:()=>false,readFile:()=>''});
  assert.equal(result.ok,false);
  assert(result.errors.some(error=>error.startsWith('MIGRATION_DELETE_OR_MISSING_FORBIDDEN:')));
});
