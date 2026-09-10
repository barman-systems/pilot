import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const imports = source => [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
test('Meta transport cannot depend on business, database, provider selection or HTTP route modules', () => {
  const source = read('api/_whatsapp-message-transport.js');
  assert.deepEqual(imports(source), []);
  assert.doesNotMatch(source, /\b(?:serviceRpc|supabaseRpc|supabaseRest|process\.env)\b/);
});
test('conversation orchestration depends only on its semantic and domain contracts', () => {
  const allowed = new Set(['./_dabbir-semantic-engine.js', './_dabbir-cognitive-dialogue.js', './_dabbir-goal-queue.js', './_dabbir-activity-intelligence.js', './_dabbir-brain-contract.js', './_dabbir-context-resolver.js']);
  const source = read('api/_dabbir-understanding-orchestrator.js');
  for (const dependency of imports(source)) assert.ok(allowed.has(dependency), `unreviewed Brain dependency ${dependency}`);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bserviceRpc\s*\(|\bprocess\.env\b/);
});
test('worker and recovery route through the same dispatch owner', () => {
  for (const file of ['api/dabbir-whatsapp-ai-worker.js', 'api/dabbir-whatsapp-ai-cron.js']) {
    const dependencies = imports(read(file));
    assert.ok(dependencies.includes('./_dabbir-whatsapp-dispatch.js'), file);
    assert.equal(dependencies.includes('./_dabbir-whatsapp-service-menu.js'), false, file);
    assert.equal(dependencies.includes('./_dabbir-whatsapp-ai-core.js'), false, file);
  }
  const dependencies = imports(read('api/_dabbir-whatsapp-dispatch.js'));
  assert.deepEqual(dependencies.sort(), ['./_dabbir-whatsapp-ai-core.js', './_whatsapp-live-core.js'].sort());
});
test('new API modules cannot create another direct Meta messages sender', () => {
  // Explicit migration inventory. Each exception must disappear only after its
  // callers move and exact-SHA Production proof is retained.
  const allowed = new Set(['api/_whatsapp-message-transport.js', 'api/_dabbir-whatsapp-catalog.js', 'api/_dabbir-whatsapp-flows.js', 'api/_dabbir-whatsapp-service-menu.js']);
  function visit(directory) {
    for (const entry of readdirSync(new URL('../' + directory, import.meta.url), { withFileTypes: true })) {
      const file = directory + '/' + entry.name;
      if (entry.isDirectory()) { visit(file); continue; }
      if (!file.endsWith('.js')) continue;
      const source = read(file);
      if (/graph\.facebook\.com\/[^\n]+\/messages/.test(source)) assert.ok(allowed.has(file), `unreviewed outbound authority ${file}`);
    }
  }
  visit('api');
});
