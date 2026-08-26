import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../api/pilot-runtime.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../api/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

test('production AI is reached only through authenticated tenant runtime', () => {
  assert.match(runtime, /accessTokenFromRequest/);
  assert.match(runtime, /getVerifiedUser/);
  assert.match(runtime, /getBusinessMemberships/);
  assert.match(runtime, /generatePilotAiReply/);
  assert.match(runtime, /pilot_business_knowledge/);
  assert.match(runtime, /simulated:\s*false/);
  assert.doesNotMatch(runtime, /synthetic_mode_required/);
});

test('unified conversation uses the real persisted PILOT runtime', () => {
  assert.match(html, /action:'send_message'/);
  assert.match(html, /\/api\/pilot-runtime/);
  assert.match(html, /await loadRuntime\(workspace\.business\.id,selectedConversationId\)/);
  assert.doesNotMatch(html, /synthetic:true/);
});

test('root route serves the authoritative operational PILOT interface unchanged', () => {
  const config = JSON.parse(vercel);
  assert.ok(config.rewrites.some(rule => rule.source === '/' && rule.destination === '/api/app'));
  assert.equal(config.functions['api/app.js'].includeFiles, 'index.html');
  assert.match(app, /x-pilot-interface/);
  assert.doesNotMatch(app, /source\.replace/);
  assert.doesNotMatch(app, /pilot-ai/);
});
