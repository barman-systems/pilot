import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/dabbir-architecture-audit.mjs', import.meta.url));
function audit(source) {
  const cwd = mkdtempSync(join(tmpdir(), 'dabbir-call-graph-'));
  try {
    mkdirSync(join(cwd, 'api'));
    writeFileSync(join(cwd, 'api/entry.js'), source);
    const git = args => execFileSync('git', args, { cwd, stdio:'pipe' });
    git(['init','-q']); git(['add','api/entry.js']);
    git(['-c','user.name=Architecture fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
    const output = join(cwd, 'map.json');
    const result = spawnSync(process.execPath, [script, 'working', output], { cwd, encoding:'utf8' });
    assert.equal(result.signal, null, result.stderr);
    return { status:result.status, map:JSON.parse(readFileSync(output, 'utf8')) };
  } finally { rmSync(cwd, { recursive:true, force:true }); }
}

test('caller proof follows parameter defaults and their transitive helpers before classifying dead code', () => {
  const { status, map } = audit(`
function credential() { return 'fixture'; }
function budgetRpc() { return credential(); }
function trulyUnused() { return null; }
export function claim({rpc = budgetRpc} = {}) { return rpc(); }
`);
  assert.equal(status, 0);
  const functions = map.modules[0].functions;
  assert.deepEqual(functions.filter(f => !f.reachable_from_export_or_initializer).map(f => f.name), ['trulyUnused']);
  for (const name of ['claim','budgetRpc','credential']) {
    assert.equal(functions.find(f => f.name === name).reachable_from_export_or_initializer, true, name);
  }
});

test('a self-import is a dependency violation and produces an explicit failing audit', () => {
  const { status, map } = audit("import './entry.js'; export function entry() { return true; }");
  assert.equal(status, 1);
  assert.deepEqual(map.cycles, [['api/entry.js']]);
});
