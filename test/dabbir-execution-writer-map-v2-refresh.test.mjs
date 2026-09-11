import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson = relative => JSON.parse(readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8'));
const map = readJson('docs/architecture/execution-writer-map-v2-refresh.json');
const writers = new Map(map.writers.map(row => [row.id, row]));

const writerIds = [
  'api.branch_operations.create_appointment',
  'api.dabbir_runtime.create_appointment',
  'api.adaptive_appointment.create',
];

test('current source refresh records the exact repository SHA and remains evidence-only', () => {
  assert.equal(map.source_main_sha, '556a656dae925399a63c68de81f82790ac7f5d92');
  assert.equal(map.status, 'SOURCE_REFRESH_PARTIALLY_VERIFIED');
  assert.equal(map.production_validation.status, 'NOT_REFRESHED_IN_THIS_SLICE');
  assert.equal(map.production_validation.release_evidence_verified, false);
  assert.equal(map.safety_invariants.evidence_only, true);
  assert.equal(map.safety_invariants.unproven_writer_deletion_allowed, false);
  assert.equal(map.safety_invariants.new_execution_ddl_before_live_lineage_preflight_allowed, false);
});

test('BOOK remains multi-writer and includes the runtime direct PostgREST writer', () => {
  assert.equal(map.operation_summary.BOOK, 'MULTIPLE_ACTIVE_WRITERS');
  for (const id of writerIds) {
    assert.ok(writers.has(id), id);
    assert.equal(writers.get(id).operation, 'BOOK');
    assert.equal(writers.get(id).classification, 'AUTHORITY');
    assert.equal(writers.get(id).deletion_allowed, false);
  }
  assert.equal(writers.get('api.dabbir_runtime.create_appointment').write_mode, 'direct_postgrest_insert');
  assert.equal(writers.get('api.dabbir_runtime.create_appointment').idempotency, 'NONE_IN_HANDLER');
});

test('caller graph records runtime delegation and keeps production reachability claims bounded', () => {
  const runtime = map.caller_graph.nodes.find(row => row.writer_id === 'api.dabbir_runtime.create_appointment');
  assert.ok(runtime);
  assert.ok(runtime.callers_or_delegators.some(row => row.path === 'api/dabbir-runtime-fast.js:10' && row.confidence === 'HIGH'));
  assert.ok(runtime.callers_or_delegators.some(row => row.path === 'api/mobile/runtime.js:2' && row.confidence === 'HIGH'));
  assert.ok(runtime.unknowns.length > 0);
  const branch = map.caller_graph.nodes.find(row => row.writer_id === 'api.branch_operations.create_appointment');
  assert.ok(branch.unknowns.some(text => /Production\/browser callers/.test(text)));
});

test('adaptive appointment is recorded as a reference adapter, not preselected as the domain owner', () => {
  assert.equal(writers.get('api.adaptive_appointment.create').convergence_status, 'REFERENCE_ADAPTER; NOT YET DOMAIN OWNER');
  assert.match(map.next_step.phase, /CALLER_GRAPH/);
});
