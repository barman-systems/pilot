import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BENCHMARK_ROOT, canonicalize, benchmarkOraclePayload, benchmarkOracleHash,
  verifyBenchmarkFiles, verifyFrozenBenchmark,
} from '../scripts/dabbir-conversation-benchmark-manifest.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const script = 'scripts/dabbir-conversation-benchmark-manifest.mjs';
const manifestFile = 'v1/manifest.json';
const caseFile = 'v1/cases/sample-contract-case.json';
const sample = JSON.parse(fs.readFileSync(path.join(repoRoot, BENCHMARK_ROOT, caseFile), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, BENCHMARK_ROOT, manifestFile), 'utf8'));
const goldenHash = 'sha256:66314d89a1bd6db9670b25a52c30d89d04d37369046a17f7baea55a432100ad8';
const encode = value => `${JSON.stringify(value, null, 2)}\n`;
const copy = value => structuredClone(value);
const fixtures = () => new Map([[manifestFile, encode(manifest)], [caseFile, encode(sample)]]);
function change(files, filename, mutate) {
  const value = JSON.parse(files.get(filename));
  mutate(value);
  files.set(filename, encode(value));
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])]));
  }
  return value;
}

test('identical oracle has a stable pinned SHA256 hash', () => {
  assert.equal(benchmarkOracleHash(sample), goldenHash);
  assert.equal(benchmarkOracleHash(copy(sample)), goldenHash);
  assert.equal(manifest.cases[0].oracle_hash, goldenHash);
  assert.deepEqual(Object.keys(benchmarkOraclePayload(sample)), ['expected', 'hard_fail_rules', 'rubric']);
  assert.equal(verifyBenchmarkFiles(fixtures()).size, 1);
});

test('recursive object key reorder and JSON whitespace preserve the oracle', () => {
  const files = fixtures();
  files.set(caseFile, JSON.stringify(reverseKeys(sample)));
  files.set(manifestFile, JSON.stringify(reverseKeys(manifest)));
  assert.equal(benchmarkOracleHash(reverseKeys(sample)), goldenHash);
  assert.equal(verifyBenchmarkFiles(files).size, 1);
});

test('mutable baseline, results, timestamps, model, provider, cost and notes stay outside oracle', () => {
  const spec = { ...copy(sample), baseline: { score: 20 }, results: { score: 91 },
    timestamps: { ran_at: '2026-09-14' }, model: 'synthetic-model', provider: 'synthetic-provider',
    token_cost: 2, cost: 0.01, notes: 'Synthetic non-normative run note.' };
  assert.equal(benchmarkOracleHash(spec), goldenHash);
  spec.baseline.score = 100;
  spec.results = { score: 0, hard_failures: ['wrong_booking'] };
  assert.equal(benchmarkOracleHash(spec), goldenHash);
  const files = fixtures();
  files.set(caseFile, encode(spec));
  verifyBenchmarkFiles(files);
});

const tampering = [
  ['expected intent', spec => { spec.expected.intent = 'CANCEL_SERVICE'; }],
  ['expected behavior summary', spec => { spec.expected.behavior_summary += ' Ignore stale state.'; }],
  ['expected execution decision', spec => { spec.expected.should_execute = false; }],
  ['rubric weight', spec => { spec.rubric.intent_correct.weight = 20; }],
  ['rubric weights still totaling 100', spec => { spec.rubric.intent_correct.weight -= 5; spec.rubric.handoff_correct.weight += 5; }],
  ['rubric check name', spec => { spec.rubric.intent_correct.check = 'always_pass'; }],
  ['hard-fail deletion', spec => { spec.hard_fail_rules.pop(); }],
  ['hard-fail addition', spec => { spec.hard_fail_rules.push('new_rule'); }],
  ['hard-fail array order', spec => { spec.hard_fail_rules.reverse(); }],
];
for (const [label, mutate] of tampering) {
  test(`tamper fails closed: ${label}`, () => {
    const spec = copy(sample);
    mutate(spec);
    assert.notEqual(benchmarkOracleHash(spec), goldenHash);
    const files = fixtures();
    files.set(caseFile, encode(spec));
    assert.throws(() => verifyBenchmarkFiles(files), /FROZEN_BENCHMARK_ORACLE_CHANGED/);
  });
}

test('UTF-8 text is hashed without Unicode normalization or whitespace trimming', () => {
  const a = copy(sample), b = copy(sample), c = copy(sample);
  a.expected.behavior_summary = 'حجز é';
  b.expected.behavior_summary = 'حجز e\u0301';
  c.expected.behavior_summary = 'حجز é ';
  assert.notEqual(benchmarkOracleHash(a), benchmarkOracleHash(b));
  assert.notEqual(benchmarkOracleHash(a), benchmarkOracleHash(c));
});

for (const value of [NaN, Infinity, -Infinity]) {
  test(`reject non-finite number ${String(value)}`, () => {
    const spec = copy(sample);
    spec.expected.max_clarification_count = value;
    assert.throws(() => benchmarkOracleHash(spec), /BENCHMARK_NON_FINITE_NUMBER/);
  });
}
for (const [label, value] of [
  ['undefined', undefined], ['function', () => {}], ['bigint', 1n], ['symbol', Symbol('x')],
  ['Date', new Date(0)], ['sparse array', Array(1)],
]) {
  test(`reject unsupported oracle value: ${label}`, () => {
    const spec = copy(sample);
    spec.expected.extra = value;
    assert.throws(() => benchmarkOracleHash(spec), /BENCHMARK_UNSUPPORTED_VALUE/);
  });
}
test('null and arrays cannot masquerade as expected or rubric objects', () => {
  for (const key of ['expected', 'rubric']) {
    for (const value of [null, [], 'text']) {
      assert.throws(() => benchmarkOracleHash({ ...sample, [key]: value }), /BENCHMARK_ORACLE_INVALID/);
    }
  }
  assert.deepEqual(canonicalize({ z: null, a: [true, false, 1, 'x'] }), { a: [true, false, 1, 'x'], z: null });
});

const invalidFiles = [
  ['case absent from manifest', files => files.set('v1/cases/extra.json', encode({ ...sample, case_id: 'cfv1-002' })), /CASE_NOT_IN_MANIFEST/],
  ['manifest entry missing case', files => files.delete(caseFile), /CASE_FILE_MISSING/],
  ['case ID mismatch', files => change(files, caseFile, spec => { spec.case_id = 'cfv1-999'; }), /CASE_NOT_IN_MANIFEST/],
  ['duplicate case ID', files => change(files, manifestFile, m => m.cases.push(copy(m.cases[0]))), /DUPLICATE_CASE_ID/],
  ['duplicate eval case ID', files => change(files, manifestFile, m => m.cases.push({ ...m.cases[0], case_id: 'cfv1-002' })), /DUPLICATE_EVAL_CASE_ID/],
  ['duplicate UUID differing only in hex case', files => change(files, manifestFile, m => {
    m.cases[0].eval_case_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    m.cases.push({ ...m.cases[0], case_id: 'cfv1-002', eval_case_id: m.cases[0].eval_case_id.toUpperCase() });
  }), /DUPLICATE_EVAL_CASE_ID/],
  ['duplicate case files', files => files.set('v1/cases/duplicate.json', encode(sample)), /DUPLICATE_CASE_FILE/],
  ['malformed UUID', files => change(files, manifestFile, m => { m.cases[0].eval_case_id = 'not-a-uuid'; }), /UUID_INVALID/],
  ['unknown failure class', files => change(files, manifestFile, m => { m.cases[0].failure_class = 'NOT_APPROVED'; }), /FAILURE_CLASS_INVALID/],
  ['wrong benchmark', files => change(files, manifestFile, m => { m.benchmark = 'other'; }), /CONTRACT_INVALID/],
  ['wrong version', files => change(files, manifestFile, m => { m.version = 'v2'; }), /CONTRACT_INVALID/],
  ['wrong hash contract', files => change(files, manifestFile, m => { m.hash_contract = 'oracle-v2'; }), /CONTRACT_INVALID/],
  ['invalid hash format', files => change(files, manifestFile, m => { m.cases[0].oracle_hash = 'sha256:abc'; }), /HASH_INVALID/],
  ['missing manifest', files => files.delete(manifestFile), /MANIFEST_MISSING/],
  ['invalid JSON', files => files.set(caseFile, '{'), /JSON_INVALID/],
  ['overflow JSON number', files => files.set(caseFile, encode(sample).replace('"max_clarification_count": 0', '"max_clarification_count": 1e999')), /NON_FINITE_NUMBER/],
  ['unexpected nested case file', files => files.set('v1/cases/nested/extra.json', encode(sample)), /FILE_UNEXPECTED/],
  ['unknown file extension', files => files.set('v1/cases/untracked.txt', 'synthetic'), /FILE_UNEXPECTED/],
  ['invalid calendar date', files => change(files, manifestFile, m => { m.frozen_at = '2026-02-30'; }), /FROZEN_DATE_INVALID/],
];
for (const [label, mutate, error] of invalidFiles) {
  test(`invalid manifest/files fail closed: ${label}`, () => {
    const files = fixtures();
    mutate(files);
    assert.throws(() => verifyBenchmarkFiles(files), error);
  });
}
for (const key of ['conversation_id', 'customer_id', 'conversation_text', 'source_message_text',
  'baseline_score', 'model_output', 'rag_content', 'production_secrets']) {
  test(`manifest rejects forbidden field ${key} at root and entry`, () => {
    for (const entry of [false, true]) {
      const files = fixtures();
      change(files, manifestFile, m => { (entry ? m.cases[0] : m)[key] = 'synthetic'; });
      assert.throws(() => verifyBenchmarkFiles(files), /SCHEMA_INVALID/);
    }
  });
}

function writeFiles(root, files) {
  for (const [filename, text] of files) {
    const absolute = path.join(root, BENCHMARK_ROOT, filename);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
  }
}
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function tempRepo(t, freeze = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dabbir-oracle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Benchmark Test');
  git(root, 'config', 'user.email', 'benchmark@example.invalid');
  fs.writeFileSync(path.join(root, 'anchor.txt'), 'Synthetic repository anchor.\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Initial synthetic repository');
  const initial = git(root, 'rev-parse', 'HEAD');
  writeFiles(root, fixtures());
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(repoRoot, script), path.join(root, script));
  if (freeze) {
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'Freeze synthetic v1');
  }
  return { root, initial, frozen: git(root, 'rev-parse', 'HEAD') };
}
function ciEnv(root, eventName, event) {
  const eventPath = path.join(root, 'event.json');
  fs.writeFileSync(eventPath, encode(event));
  return { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath };
}

test('CLI runs deterministically without credentials from an unrelated working directory', t => {
  const { root } = tempRepo(t);
  const args = [path.join(root, script)];
  const options = { cwd: os.tmpdir(), env: { PATH: process.env.PATH }, encoding: 'utf8' };
  const first = spawnSync(process.execPath, args, options);
  const second = spawnSync(process.execPath, args, options);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /FROZEN_BENCHMARK_MANIFEST_PASS versions=v1 cases=1/);
});

test('first freeze bootstraps only against a valid Git reference with no benchmark yet', t => {
  const { root, initial } = tempRepo(t, false);
  const env = ciEnv(root, 'pull_request', { pull_request: { base: { sha: initial } } });
  assert.equal(verifyFrozenBenchmark({ repoRoot: root, env }).reference, initial);
});

test('editing oracle and recomputing manifest hash together cannot re-freeze v1', t => {
  const { root } = tempRepo(t);
  const files = fixtures();
  change(files, caseFile, spec => { spec.expected.intent = 'CANCEL_SERVICE'; });
  change(files, manifestFile, m => { m.cases[0].oracle_hash = benchmarkOracleHash(JSON.parse(files.get(caseFile))); });
  // Self-consistency alone would incorrectly pass this attack.
  verifyBenchmarkFiles(files);
  writeFiles(root, files);
  const result = spawnSync(process.execPath, [path.join(root, script)], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FROZEN_BENCHMARK_ORACLE_CHANGED/);
});

test('replacing a case and its manifest entry together cannot erase the frozen case', t => {
  const { root } = tempRepo(t);
  const files = fixtures();
  change(files, caseFile, spec => { spec.case_id = 'cfv1-002'; });
  change(files, manifestFile, m => { m.cases[0].case_id = 'cfv1-002'; m.cases[0].eval_case_id = '00000000-0000-4000-8000-000000000002'; });
  writeFiles(root, files);
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: {} }), /FROZEN_BENCHMARK_ORACLE_CHANGED/);
});

test('mutable run data and object formatting can evolve after freeze', t => {
  const { root } = tempRepo(t);
  const files = fixtures();
  change(files, caseFile, spec => { spec.baseline = { score: 20 }; spec.results = { score: 95 }; spec.notes = 'Synthetic result only.'; });
  files.set(manifestFile, JSON.stringify(reverseKeys(manifest)));
  writeFiles(root, files);
  assert.equal(verifyFrozenBenchmark({ repoRoot: root, env: {} }).cases, 1);
});

function nextVersionFiles() {
  const files = fixtures();
  const next = copy(manifest), spec = copy(sample);
  next.version = 'v1.1';
  next.supersedes = 'v1';
  next.change_reason = 'Synthetic oracle correction to test explicit versioning.';
  spec.expected.should_execute = false;
  next.cases[0].oracle_hash = benchmarkOracleHash(spec);
  files.set('v1.1/manifest.json', encode(next));
  files.set('v1.1/cases/sample-contract-case.json', encode(spec));
  return files;
}
test('new version with supersedes/reason is allowed while preserving v1', t => {
  const { root } = tempRepo(t);
  writeFiles(root, nextVersionFiles());
  assert.deepEqual(verifyFrozenBenchmark({ repoRoot: root, env: {} }).versions, ['v1', 'v1.1']);
});
test('new version cannot omit supersedes or change_reason', () => {
  for (const key of ['supersedes', 'change_reason']) {
    const files = nextVersionFiles();
    change(files, 'v1.1/manifest.json', m => { delete m[key]; });
    assert.throws(() => verifyBenchmarkFiles(files), /VERSION_LINEAGE_INVALID/);
  }
});
test('removing a previously frozen later version fails even if v1 still matches', t => {
  const { root } = tempRepo(t);
  writeFiles(root, nextVersionFiles());
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Freeze synthetic v1.1');
  fs.rmSync(path.join(root, BENCHMARK_ROOT, 'v1.1'), { recursive: true });
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: {} }), /FROZEN_BENCHMARK_ORACLE_CHANGED/);
});
test('removing the entire benchmark fails closed', t => {
  const { root } = tempRepo(t);
  fs.rmSync(path.join(root, BENCHMARK_ROOT), { recursive: true });
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: {} }), /ROOT_MISSING/);
});
test('symlink case file is rejected', t => {
  const { root } = tempRepo(t);
  const target = path.join(root, 'synthetic-case.json');
  fs.writeFileSync(target, encode(sample));
  const filename = path.join(root, BENCHMARK_ROOT, caseFile);
  fs.unlinkSync(filename);
  fs.symlinkSync(target, filename);
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: {} }), /SYMLINK_FORBIDDEN/);
});
for (const eventName of ['pull_request', 'push', 'workflow_dispatch']) {
  test(`CI ${eventName} detects an already committed oracle/hash rewrite`, t => {
    const { root, frozen } = tempRepo(t);
    const files = fixtures();
    change(files, caseFile, spec => { spec.hard_fail_rules.pop(); });
    change(files, manifestFile, m => { m.cases[0].oracle_hash = benchmarkOracleHash(JSON.parse(files.get(caseFile))); });
    writeFiles(root, files);
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'Attempt prohibited oracle rewrite');
    const env = ciEnv(root, eventName, { before: frozen, pull_request: { base: { sha: frozen } } });
    assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env }), /FROZEN_BENCHMARK_ORACLE_CHANGED/);
  });
}
test('CI fails closed on missing metadata, unsupported events or unavailable reference', t => {
  const { root } = tempRepo(t);
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: { GITHUB_ACTIONS: 'true' } }), /CI_EVENT_REQUIRED/);
  for (const sha of [undefined, '0'.repeat(40), 'HEAD']) {
    const env = ciEnv(root, 'pull_request', { pull_request: { base: { sha } } });
    assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env }), /CI_REFERENCE_REQUIRED/);
  }
  const missingRef = ciEnv(root, 'push', { before: 'a'.repeat(40) });
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: missingRef }), /GIT_REFERENCE_UNAVAILABLE/);
  const unknownEvent = ciEnv(root, 'unknown', {});
  assert.throws(() => verifyFrozenBenchmark({ repoRoot: root, env: unknownEvent }), /CI_REFERENCE_REQUIRED/);
});
