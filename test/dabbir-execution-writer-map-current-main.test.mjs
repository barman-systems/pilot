import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson=relative=>JSON.parse(readFileSync(fileURLToPath(new URL('../'+relative,import.meta.url)),'utf8'));
const validation=readJson('docs/architecture/execution-writer-map-v1-validation.json');
const repair=readJson('docs/architecture/execution-lineage-repair-v1.json');

test('execution writer map was revalidated against Production without writer-surface drift',()=>{
  assert.equal(validation.validated_main_sha,'12319b8dead2067833de81d868bebfe1de5ece73');
  assert.equal(validation.validated_production_sha,validation.validated_main_sha);
  assert.equal(validation.production_release_evidence_verified,true);
  assert.equal(validation.compare.execution_writer_surface_changed,false);
  assert.equal(validation.verdict,'WRITER_MAP_REVALIDATED_NO_EXECUTION_SURFACE_DRIFT');
});

test('later verified lineage repair supersedes the validation snapshot migration blocker',()=>{
  assert.equal(validation.database_lineage.state,'DEFINITION_PRESENT_HISTORY_MISSING');
  assert.ok(repair.supersedes_lineage_state_in.includes('docs/architecture/execution-writer-map-v1-validation.json'));
  assert.equal(repair.status,'VERIFIED');
  assert.equal(repair.canonical_repository_migration.version,'20260911184500');
  assert.equal(repair.post_repair_history.version,'20260911184500');
  assert.equal(repair.post_repair_history.statement_md5,'7174ce8a2b77b8d54d76451d60cc1b0f');
  assert.equal(repair.execution_ddl_gate.current_state,'LINEAGE_BLOCKER_CLOSED');
  assert.equal(repair.execution_ddl_gate.new_execution_ddl_allowed_by_lineage_only,true);
});

test('lineage repair preserved privileged function identity and least-privilege grants',()=>{
  for(const [name,md5] of Object.entries({
    'public.barman_executive_claim_v1':'2ceabc16c01018442776b31c9df98fe1',
    'public.barman_executive_verify_command_v1':'b56d82421ea0bd2eb7d91fa72bccb91b',
    'public.barman_executive_rollup_v1':'dc8a561908808bd4dcad75b455c4b09e',
    'public.barman_executive_self_diagnostic_v1':'3f494bae01084b97d4dc7ca74469ba60',
  })){
    const row=repair.pre_and_post_function_evidence[name];
    assert.equal(row.definition_md5,md5,name);
    assert.equal(row.search_path,'pg_catalog, public, dabbir_private, pg_temp',name);
    assert.equal(row.acl,'postgres=X/postgres,service_role=X/postgres',name);
  }
  assert.equal(repair.repair.function_bodies_changed,false);
  assert.equal(repair.repair.authorization_changed,false);
  assert.equal(repair.repair.rls_changed,false);
});
