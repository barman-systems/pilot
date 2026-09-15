import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateMigrationSql,validateMigrationFile} from '../scripts/dabbir-migration-contract.mjs';

const root=path.resolve(import.meta.dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/dabbir-migration-deploy.yml'),'utf8');
const must=(pattern,message)=>assert.match(workflow,pattern,message);

const cutover='20260915124900';
const episodeMigrations=[
  'supabase/migrations/20260915125000_dabbir_episode_correlation_schema_v1.sql',
  'supabase/migrations/20260915125050_dabbir_episode_funnel_retrobind_v1.sql',
  'supabase/migrations/20260915125100_dabbir_episode_outcome_projection_v1.sql',
];

test('the three pending episode migrations satisfy the canonical source contract',()=>{
  for(const relative of episodeMigrations){
    const result=validateMigrationFile(path.join(root,relative),{cutoverVersion:cutover});
    assert.ok(result.bytes>0,relative);
    assert.ok(result.statementCount>0,relative);
  }
});

test('migration lexer allows transactional PL/pgSQL bodies but rejects transaction escape hatches',()=>{
  assert.doesNotThrow(()=>validateMigrationSql(`create or replace function public.x() returns void language plpgsql as $$\nbegin\n  perform 1;\nend\n$$;`));
  for(const [sql,code] of [
    ['BEGIN; select 1; COMMIT;','TRANSACTION_CONTROL_DENIED'],
    ['create index concurrently x on t(id);','CONCURRENT_INDEX_DENIED'],
    ['VACUUM t;','VACUUM_DENIED'],
    ['COPY t FROM STDIN;','COPY_DENIED'],
    ['alter system set work_mem="1GB";','ALTER_SYSTEM_DENIED'],
    ['insert into supabase_migrations.schema_migrations(version) values (\'x\');','MIGRATION_HISTORY_MUTATION_DENIED'],
  ]){
    assert.throws(()=>validateMigrationSql(sql),new RegExp(code));
  }
});

test('psql meta commands are denied in migration source',()=>{
  assert.throws(()=>validateMigrationSql('select 1;\n\\! id\n'),/PSQL_META_COMMAND_DENIED/);
  assert.throws(()=>validateMigrationSql('select 1;\n  \\i evil.sql\n'),/PSQL_META_COMMAND_DENIED/);
});

test('migration deploy is push-to-main only and has no manual arbitrary-SQL entry point',()=>{
  must(/name: DABBIR Migration Deploy/);
  must(/push:\n\s+branches: \[main\]/);
  assert.doesNotMatch(workflow,/workflow_dispatch:/);
  must(/environment: production/);
  must(/SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|service_role|SUPABASE_SERVICE_ROLE_KEY|apply_migration/i);
});

test('workflow proves merged PR, fresh base and exact candidate gates before database access',()=>{
  must(/MERGED_PR_PROVENANCE_REQUIRED/);
  must(/SQUASH_MERGE_REQUIRED/);
  must(/MERGE_BASE_FRESHNESS_MISMATCH/);
  must(/latest_state test/);
  must(/latest_state Vercel/);
  must(/require_run 'DABBIR CI'/);
  must(/require_run 'DABBIR Security Gate'/);
  const proof=workflow.indexOf('Prove merged PR and exact-head gates');
  const credential=workflow.indexOf('Normalize existing Production database credential');
  assert.ok(proof>=0&&credential>proof,'source proof must precede Production credential use');
});

test('post-cutover migration history is add-only and unsafe source is rejected before execution',()=>{
  must(/IMMUTABLE_MIGRATION_HISTORY/);
  must(/DABBIR_MIGRATION_CUTOVER_VERSION: '20260915124900'/);
  must(/node scripts\/dabbir-migration-contract\.mjs/);
  must(/POST_CUTOVER_MANIFEST_TOO_LARGE/);
});

test('each migration is applied atomically under an advisory lock and records exact source provenance',()=>{
  must(/pg_advisory_xact_lock\(hashtextextended/);
  must(/--single-transaction/);
  must(/MIGRATION_VERSION_RACE/);
  must(/insert into supabase_migrations\.schema_migrations/);
  must(/array\[convert_from\(decode\('\$\{source_b64\}'/);
  must(/dabbir-ci-migrator:\$\{GITHUB_ACTOR\}:\$\{GITHUB_SHA\}:run:\$\{GITHUB_RUN_ID\}/);
  must(/dabbir-ci-v1:\$\{GITHUB_REPOSITORY\}:\$\{version\}:\$\{sha256\}:\$\{blob\}/);
});

test('post-deploy drift compares the stored SQL SHA-256 and Git blob SHA, not names alone',()=>{
  must(/extensions\.digest\(convert_to\(statements\[1\],'UTF8'\),'sha256'\)/);
  must(/'blob '\|\|octet_length\(convert_to\(statements\[1\],'UTF8'\)\)/);
  must(/'sha1'/);
  must(/UNATTESTED_OR_DRIFTED_MIGRATION_VERSION/);
  must(/DABBIR_MIGRATION_DRIFT_DETECTED/);
  must(/UNATTESTED_CREATED_BY/);
});

test('the deployer reconciles all post-cutover Git migrations so the first run can adopt already-merged #866 files',()=>{
  must(/find supabase\/migrations -maxdepth 1 -type f -name '\*\.sql'/);
  assert.doesNotMatch(workflow,/git diff[^\n]+\|[^\n]+apply/i);
  must(/ATTESTED_REPLAY/);
  must(/APPLIED \$version \$name/);
});
