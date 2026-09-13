import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCHMARK_ROOT = 'test/fixtures/conversation-failure';
const VERSION = /^v[1-9]\d*(?:\.[1-9]\d*)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAILURE_CLASSES = new Set([
  'INTENT_UNDERSTANDING', 'CONTEXT_TRACKING', 'STALE_STATE',
  'MISSING_KNOWLEDGE', 'WRONG_RETRIEVAL', 'UNNECESSARY_CLARIFICATION',
  'EXECUTION_FAILURE', 'WRONG_BOOKING', 'UNNECESSARY_HANDOFF', 'RESPONSE_QUALITY',
]);
const FROZEN_MESSAGE = 'FROZEN_BENCHMARK_ORACLE_CHANGED\n'
  + 'The expected behavior, scoring rubric, or hard-fail rules of a frozen benchmark case changed.\n'
  + 'Do not update the existing v1 oracle in place.\n'
  + 'Create a new benchmark version and document the reason for the change.';

const object = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

export function canonicalize(value) {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => {
      requireValue(Object.hasOwn(value, index), 'BENCHMARK_UNSUPPORTED_VALUE');
      return canonicalize(value[index]);
    });
  }
  if (object(value)) {
    requireValue(Object.getOwnPropertySymbols(value).length === 0, 'BENCHMARK_UNSUPPORTED_VALUE');
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), 'BENCHMARK_NON_FINITE_NUMBER');
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  throw new Error('BENCHMARK_UNSUPPORTED_VALUE');
}

export function benchmarkOraclePayload(caseSpec) {
  requireValue(object(caseSpec) && object(caseSpec.expected) && object(caseSpec.rubric)
    && Array.isArray(caseSpec.hard_fail_rules), 'BENCHMARK_ORACLE_INVALID');
  return canonicalize({
    expected: caseSpec.expected,
    rubric: caseSpec.rubric,
    hard_fail_rules: caseSpec.hard_fail_rules,
  });
}

export function benchmarkOracleHash(caseSpec) {
  const canonical = JSON.stringify(benchmarkOraclePayload(caseSpec));
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function exactKeys(value, required, optional = []) {
  requireValue(object(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key)),
  'BENCHMARK_SCHEMA_INVALID');
}

function validateCase(spec) {
  exactKeys(spec, ['case_id', 'expected', 'rubric', 'hard_fail_rules'],
    ['baseline', 'results', 'timestamps', 'model', 'provider', 'token_cost', 'cost', 'notes']);
  const expected = spec.expected;
  requireValue(nonempty(expected.intent) && nonempty(expected.behavior_summary)
    && ['should_use_knowledge', 'should_execute', 'should_handoff']
      .every(key => typeof expected[key] === 'boolean')
    && Number.isSafeInteger(expected.max_clarification_count)
    && expected.max_clarification_count >= 0, 'BENCHMARK_EXPECTED_INVALID');
  const criteria = Object.values(spec.rubric);
  requireValue(criteria.length > 0, 'BENCHMARK_RUBRIC_INVALID');
  for (const criterion of criteria) {
    exactKeys(criterion, ['weight', 'check']);
    requireValue(Number.isFinite(criterion.weight) && criterion.weight >= 0
      && criterion.weight <= 100 && nonempty(criterion.check), 'BENCHMARK_RUBRIC_INVALID');
  }
  requireValue(criteria.reduce((sum, criterion) => sum + criterion.weight, 0) === 100,
    'BENCHMARK_RUBRIC_TOTAL_INVALID');
  requireValue(spec.hard_fail_rules.length > 0 && spec.hard_fail_rules.every(nonempty)
    && new Set(spec.hard_fail_rules).size === spec.hard_fail_rules.length,
  'BENCHMARK_HARD_FAIL_RULES_INVALID');
}

function parse(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('BENCHMARK_JSON_INVALID'); }
}

// Paths are relative to BENCHMARK_ROOT. Resolve files by case_id, not filename:
// the contract deliberately names the synthetic fixture sample-contract-case.json.
export function verifyBenchmarkFiles(files) {
  const versions = new Map();
  for (const filename of [...files.keys()].sort()) {
    const [version] = filename.split('/');
    requireValue(VERSION.test(version)
      && /^(v[^/]+)\/(manifest\.json|cases\/[a-zA-Z0-9._-]+\.json)$/.test(filename),
    'BENCHMARK_FILE_UNEXPECTED');
    versions.set(version, null);
  }
  requireValue(versions.has('v1'), 'BENCHMARK_V1_MISSING');
  for (const version of versions.keys()) {
    requireValue(files.has(`${version}/manifest.json`), 'BENCHMARK_MANIFEST_MISSING');
    const manifest = parse(files.get(`${version}/manifest.json`));
    exactKeys(manifest, ['benchmark', 'version', 'frozen_at', 'hash_contract', 'cases'],
      ['supersedes', 'change_reason']);
    requireValue(manifest.benchmark === 'conversation_failure' && manifest.version === version
      && manifest.hash_contract === 'oracle-v1', 'BENCHMARK_CONTRACT_INVALID');
    requireValue(typeof manifest.frozen_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(manifest.frozen_at)
      && Number.isFinite(Date.parse(manifest.frozen_at))
      && new Date(manifest.frozen_at).toISOString().slice(0, 10) === manifest.frozen_at,
    'BENCHMARK_FROZEN_DATE_INVALID');
    if (version === 'v1') {
      requireValue(!Object.hasOwn(manifest, 'supersedes') && !Object.hasOwn(manifest, 'change_reason'),
        'BENCHMARK_VERSION_LINEAGE_INVALID');
    } else {
      requireValue(VERSION.test(manifest.supersedes) && versions.has(manifest.supersedes)
        && manifest.supersedes !== version && nonempty(manifest.change_reason),
      'BENCHMARK_VERSION_LINEAGE_INVALID');
    }
    requireValue(Array.isArray(manifest.cases) && manifest.cases.length > 0, 'BENCHMARK_CASES_INVALID');
    const caseIds = new Set();
    const evalIds = new Set();
    for (const entry of manifest.cases) {
      exactKeys(entry, ['case_id', 'eval_case_id', 'failure_class', 'oracle_hash']);
      requireValue(typeof entry.case_id === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(entry.case_id),
        'BENCHMARK_CASE_ID_INVALID');
      requireValue(!caseIds.has(entry.case_id), 'BENCHMARK_DUPLICATE_CASE_ID');
      caseIds.add(entry.case_id);
      requireValue(typeof entry.eval_case_id === 'string' && UUID.test(entry.eval_case_id),
        'BENCHMARK_EVAL_CASE_UUID_INVALID');
      const evalId = entry.eval_case_id.toLowerCase();
      requireValue(!evalIds.has(evalId), 'BENCHMARK_DUPLICATE_EVAL_CASE_ID');
      evalIds.add(evalId);
      requireValue(FAILURE_CLASSES.has(entry.failure_class), 'BENCHMARK_FAILURE_CLASS_INVALID');
      requireValue(typeof entry.oracle_hash === 'string' && /^sha256:[0-9a-f]{64}$/.test(entry.oracle_hash),
        'BENCHMARK_ORACLE_HASH_INVALID');
    }
    const specs = new Map();
    for (const [filename, text] of files) {
      if (!filename.startsWith(`${version}/cases/`)) continue;
      const spec = parse(text);
      requireValue(object(spec) && caseIds.has(spec.case_id), 'BENCHMARK_CASE_NOT_IN_MANIFEST');
      requireValue(!specs.has(spec.case_id), 'BENCHMARK_DUPLICATE_CASE_FILE');
      specs.set(spec.case_id, spec);
    }
    for (const entry of manifest.cases) {
      requireValue(specs.has(entry.case_id), 'BENCHMARK_CASE_FILE_MISSING');
      const spec = specs.get(entry.case_id);
      requireValue(benchmarkOracleHash(spec) === entry.oracle_hash, FROZEN_MESSAGE);
      validateCase(spec);
    }
    versions.set(version, manifest);
  }
  for (const [version, manifest] of versions) {
    const visited = new Set([version]);
    let ancestor = manifest.supersedes;
    while (ancestor) {
      requireValue(!visited.has(ancestor), 'BENCHMARK_VERSION_LINEAGE_INVALID');
      visited.add(ancestor);
      ancestor = versions.get(ancestor).supersedes;
    }
  }
  return versions;
}

function diskFiles(root) {
  const files = new Map();
  function visit(directory, prefix = '') {
    requireValue(fs.lstatSync(directory).isDirectory(), 'BENCHMARK_DIRECTORY_INVALID');
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = `${prefix}${name}`;
      const stat = fs.lstatSync(absolute);
      requireValue(!stat.isSymbolicLink(), 'BENCHMARK_SYMLINK_FORBIDDEN');
      if (stat.isDirectory()) visit(absolute, `${relative}/`);
      else {
        requireValue(stat.isFile(), 'BENCHMARK_FILE_INVALID');
        files.set(relative, fs.readFileSync(absolute, 'utf8'));
      }
    }
  }
  requireValue(fs.existsSync(root), 'BENCHMARK_ROOT_MISSING');
  visit(root);
  return files;
}

function git(repoRoot, ...args) {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('BENCHMARK_GIT_REFERENCE_UNAVAILABLE'); }
}

function referenceForRun(repoRoot, env) {
  if (env.GITHUB_ACTIONS !== 'true') return git(repoRoot, 'rev-parse', '--verify', 'HEAD^{commit}').trim();
  requireValue(nonempty(env.GITHUB_EVENT_PATH), 'BENCHMARK_CI_EVENT_REQUIRED');
  const event = parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  let ref;
  if (env.GITHUB_EVENT_NAME === 'pull_request') ref = event.pull_request?.base?.sha;
  else if (env.GITHUB_EVENT_NAME === 'push') ref = event.before;
  else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    ref = git(repoRoot, 'rev-parse', '--verify', 'HEAD^').trim();
  }
  requireValue(typeof ref === 'string' && /^[0-9a-f]{40}$/.test(ref) && !/^0+$/.test(ref),
    'BENCHMARK_CI_REFERENCE_REQUIRED');
  git(repoRoot, 'cat-file', '-e', `${ref}^{commit}`);
  return ref;
}

export function verifyFrozenBenchmark({ repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), env = process.env } = {}) {
  const versions = verifyBenchmarkFiles(diskFiles(path.join(repoRoot, BENCHMARK_ROOT)));
  const ref = referenceForRun(repoRoot, env);
  const previousFiles = new Map();
  const filenames = git(repoRoot, 'ls-tree', '-r', '--name-only', ref, '--', BENCHMARK_ROOT)
    .split('\n').filter(Boolean);
  for (const filename of filenames) {
    previousFiles.set(filename.slice(BENCHMARK_ROOT.length + 1), git(repoRoot, 'show', `${ref}:${filename}`));
  }
  // An independent Git reference prevents editing the oracle AND its hash,
  // or removing a case AND its manifest entry, in the same change.
  if (previousFiles.size) {
    const previous = verifyBenchmarkFiles(previousFiles);
    for (const [version, manifest] of previous) {
      requireValue(versions.has(version)
        && JSON.stringify(canonicalize(versions.get(version))) === JSON.stringify(canonicalize(manifest)),
      FROZEN_MESSAGE);
    }
  }
  return { versions: [...versions.keys()].sort(), cases: [...versions.values()].reduce((sum, manifest) => sum + manifest.cases.length, 0), reference: ref };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyFrozenBenchmark();
    console.log(`FROZEN_BENCHMARK_MANIFEST_PASS versions=${result.versions.join(',')} cases=${result.cases} reference=${result.reference}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
