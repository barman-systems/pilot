import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateMigrationSql,validateMigrationFile} from '../scripts/dabbir-migration-contract.mjs';

const root=path.resolve(import.meta.dirname,'..');
const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
const deploy=fs.readFileSync(path.join(root,'scripts/dabbir-migration-deploy.sh'),'utf8');
const must=(text,pattern,message)=>assert.match(text,pattern,message);

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
  ]) assert.throws(()=>validateMigrationSql(sql),new RegExp(code));
});

test('psql meta commands are denied in migration source',()=>{
  assert.throws(()=>validateMigrationSql('select 1;\n\\! id\n'),/PSQL_META_COMMAND_DENIED/);
  assert.throws(()=>validateMigrationSql('select 1;\n  \\i evil.sql\n'),/PSQL_META_COMMAND_DENIED/);
});

test('canonical migration deploy runs only as a dependent job inside the already-registered DABBIR CI workflow',()=>{
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/dabbir-migration-deploy.yml')),false,'standalone migration workflow must stay retired');
  must(ci,/migration-deploy:\n\s+name: DABBIR Migration Deploy/);
  must(ci,/needs: test/);
  must(ci,/if: github\.event_name == 'push' && github\.repository == 'barman-systems\/pilot' && github\.ref == 'refs\/heads\/main'/);
  must(ci,/environment: production/);
  must(ci,/run: bash scripts\/dabbir-migration-deploy\.sh/);
});

test('manual CI dispatch and non-main pushes cannot enter migration deploy authority',()=>{
  must(ci,/workflow_dispatch:/);
  must(ci,/if: github\.event_name == 'push'/);
  assert.doesNotMatch(deploy,/workflow_dispatch|repository_dispatch|read\s+-p/i);
  assert.doesNotMatch(deploy,/INPUT_|GITHUB_EVENT_PATH.*inputs/i);
});

test('Production DB credential remains confined to recovery proof and registered DABBIR CI',()=>{
  const dir=path.join(root,'.github/workflows');
  const users=fs.readdirSync(dir)
    .filter(name=>/\.ya?ml$/.test(name))
    .filter(name=>fs.readFileSync(path.join(dir,name),'utf8').includes('secrets.SUPABASE_DB_URL'))
    .sort();
  assert.deepEqual(users,['ci.yml','dabbir-recovery-proof.yml']);
  assert.equal((ci.match(/secrets\.SUPABASE_DB_URL/g)||[]).length,1,'CI may reference the Production DB secret exactly once');
  const job=ci.slice(ci.indexOf('  migration-deploy:'));
  must(job,/SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
});

test('deploy script proves merged PR, fresh base and exact candidate gates before database normalization',()=>{
  for(const marker of ['MERGED_PR_PROVENANCE_REQUIRED','SQUASH_MERGE_REQUIRED','MERGE_BASE_FRESHNESS_MISMATCH','REQUIRED_TEST_STATUS_MISSING','REQUIRED_VERCEL_STATUS_MISSING']) must(deploy,new RegExp(marker));
  must(deploy,/require_run 'DABBIR CI'/);
  must(deploy,/require_run 'DABBIR Security Gate'/);
  const proof=deploy.indexOf('MERGED_PR_PROVENANCE_REQUIRED');
  const manifest=deploy.indexOf(': > migration-manifest.tsv');
  const credential=deploy.indexOf('echo "::add-mask::$SUPABASE_DB_URL"');
  assert.ok(proof>=0&&manifest>proof&&credential>manifest,'database credential cannot be normalized before source and manifest proof');
});

test('post-cutover migration history is append-only and full Git manifest is reconciled',()=>{
  must(deploy,/IMMUTABLE_MIGRATION_HISTORY/);
  must(deploy,/find supabase\/migrations -maxdepth 1 -type f -name '\*\.sql'/);
  must(deploy,/POST_CUTOVER_MANIFEST_TOO_LARGE/);
  must(deploy,/ATTESTED_REPLAY/);
  must(deploy,/APPLIED \$version \$name/);
});

test('each migration is applied atomically under advisory lock with exact source provenance',()=>{
  must(deploy,/pg_advisory_xact_lock\(hashtextextended/);
  must(deploy,/--single-transaction/);
  must(deploy,/MIGRATION_VERSION_RACE/);
  must(deploy,/insert into supabase_migrations\.schema_migrations/);
  must(deploy,/array\[convert_from\(decode\('\$\{source_b64\}'/);
  must(deploy,/dabbir-ci-migrator:\$\{GITHUB_ACTOR\}:\$\{GITHUB_SHA\}:run:\$\{GITHUB_RUN_ID\}/);
  must(deploy,/dabbir-ci-v1:\$\{GITHUB_REPOSITORY\}:\$\{version\}:\$\{sha256\}:\$\{blob\}/);
});

test('post-deploy drift hashes actual stored SQL and rejects unattributed rows',()=>{
  must(deploy,/extensions\.digest\(convert_to\(statements\[1\],'UTF8'\),'sha256'\)/);
  must(deploy,/'blob '\|\|octet_length\(convert_to\(statements\[1\],'UTF8'\)\)/);
  must(deploy,/'sha1'/);
  must(deploy,/UNATTESTED_OR_DRIFTED_MIGRATION_VERSION/);
  must(deploy,/DABBIR_MIGRATION_DRIFT_DETECTED/);
  must(deploy,/UNATTESTED_CREATED_BY/);
});

test('deployer has no Supabase management token, service-role key or arbitrary migration API escape',()=>{
  assert.doesNotMatch(deploy,/SUPABASE_ACCESS_TOKEN|SUPABASE_MANAGEMENT_TOKEN|SUPABASE_SERVICE_ROLE_KEY|service_role|apply_migration/i);
});
