import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const authUi = await readFile(new URL('api/auth-session-stability-ui.js', root), 'utf8');
const fastRuntime = await readFile(new URL('api/dabbir-runtime-fast.js', root), 'utf8');
const ownership = JSON.parse(await readFile(new URL('config/dabbir-architecture-ownership.json', root), 'utf8'));

test('final auth UI authority owns authenticated browser workspace bootstrap', () => {
  assert.equal(ownership.authorities.auth_session_gate, 'api/auth-session-stability-ui.js');
  assert.equal(ownership.shell.final_ui_authority, '/api/auth-session-stability-ui');
  assert.match(authUi, /const verifiedRuntimeReadEndpoint='\/api\/dabbir-runtime-fast'/);
  assert.match(authUi, /boot=async function\(\)/);
  assert.match(authUi, /loadRuntime=async function\(businessId,conversationId\)/);
  assert.match(authUi, /await api\(verifiedRuntimeReadEndpoint,\{credentials:'same-origin'\}\)/);
  assert.match(authUi, /fast_workspace_bootstrap:true/);
});

test('browser workspace reads no longer call the legacy runtime from the final auth authority', () => {
  const bootStart = authUi.indexOf('boot=async function()');
  const formStart = authUi.indexOf("const baseShowGate=showGate");
  assert.ok(bootStart >= 0 && formStart > bootStart);
  const bootstrapBlock = authUi.slice(bootStart, formStart);
  assert.doesNotMatch(bootstrapBlock, /api\('\/api\/dabbir-runtime(?:\?|')/);
  assert.match(bootstrapBlock, /verifiedRuntimeReadEndpoint/);
});

test('fast runtime preserves mutation semantics by delegating every non-GET request', () => {
  assert.match(fastRuntime, /if \(req\.method === 'GET'\)/);
  assert.match(fastRuntime, /return dabbirRuntimeHandler\(req, res\);/);
});
