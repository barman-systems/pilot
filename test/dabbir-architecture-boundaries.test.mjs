import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const imports = source => [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
test('Meta transport cannot depend on business, database, provider selection or HTTP route modules', () => {
  const source = read('api/_whatsapp-message-transport.js');
  assert.deepEqual(imports(source), []);
  assert.doesNotMatch(source, /\b(?:serviceRpc|supabaseRpc|supabaseRest|process\.env)\b/);
});
test('conversation orchestration facade delegates to one compatibility core and one Brain response boundary', () => {
  const facade = read('api/_dabbir-understanding-orchestrator.js');
  assert.deepEqual(imports(facade).sort(), ['./_dabbir-conversation-brain-response.js','./_dabbir-understanding-orchestrator-core.js'].sort());
  assert.doesNotMatch(facade, /\bdabbir_semantic_execute_v2\b|\bdabbir_semantic_commit_v2\b|\bprocess\.env\b/);

  const allowed = new Set(['./_dabbir-semantic-engine.js', './_dabbir-cognitive-dialogue.js', './_dabbir-goal-queue.js', './_dabbir-activity-intelligence.js', './_dabbir-brain-contract.js', './_dabbir-context-resolver.js']);
  const core = read('api/_dabbir-understanding-orchestrator-core.js');
  for (const dependency of imports(core)) assert.ok(allowed.has(dependency), `unreviewed compatibility-core dependency ${dependency}`);
  assert.doesNotMatch(core, /\bfetch\s*\(|\bserviceRpc\s*\(|\bprocess\.env\b/);
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
  const allowed = new Set(['api/_whatsapp-message-transport.js']);
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

test('claimed WhatsApp worker cannot regain a parallel booking executor or retired dispatcher', () => {
  const source = read('api/_dabbir-whatsapp-ai-core.js');
  assert.doesNotMatch(source, /dabbir_whatsapp_ai_(?:create|cancel|reschedule)_booking/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+processWhatsAppAi(?:DispatchToken|Recovery)/);
  assert.equal(existsSync(new URL('../api/_dabbir-whatsapp-service-menu.js', import.meta.url)), false);
});