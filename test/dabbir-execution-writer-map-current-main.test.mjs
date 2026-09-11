import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const validation=JSON.parse(readFileSync(fileURLToPath(new URL('../docs/architecture/execution-writer-map-v1-validation.json',import.meta.url)),'utf8'));

test('execution writer map was revalidated against the current Production main without writer-surface drift',()=>{
  assert.equal(validation.validated_main_sha,'12319b8dead2067833de81d868bebfe1de5ece73');
  assert.equal(validation.validated_production_sha,validation.validated_main_sha);
  assert.equal(validation.production_release_evidence_verified,true);
  assert.equal(validation.compare.ahead_by,1);
  assert.deepEqual(validation.compare.changed_files,[
    'api/_barman-executive-automation.js',
    'test/barman-ceo-semantic-json-retry.test.mjs',
  ]);
  assert.equal(validation.compare.execution_writer_surface_changed,false);
  assert.equal(validation.verdict,'WRITER_MAP_REVALIDATED_NO_EXECUTION_SURFACE_DRIFT');
});

test('execution DDL remains blocked by the live migration-history mismatch',()=>{
  assert.equal(validation.database_lineage.migration_history_version_present,false);
  assert.equal(validation.database_lineage.missing_version,'20260911184500');
  assert.equal(validation.database_lineage.strict_function_definitions_present_live,true);
  assert.equal(validation.database_lineage.state,'DEFINITION_PRESENT_HISTORY_MISSING');
  assert.equal(validation.new_execution_ddl_authorized,false);
});
