import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoverWabaIdFromAccessToken } from '../api/dabbir-whatsapp-embedded-complete.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const platform = {
  appId: '123456789012345',
  appSecret: 'unit-test-app-secret',
  graphVersion: 'v26.0',
};

const json = payload => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

test('server discovers exactly one shared WABA through authorized Graph business edges without putting token in URL', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url));
      seen.push({ url: parsed, authorization: options?.headers?.authorization || null });
      if (parsed.pathname === '/v26.0/me') return json({ id: '42', business: { id: '77777777777' } });
      if (parsed.pathname === '/v26.0/77777777777/owned_whatsapp_business_accounts') {
        return json({ data: [{ id: '998877665544332', name: 'Owned WABA' }] });
      }
      if (parsed.pathname === '/v26.0/77777777777/client_whatsapp_business_accounts') return json({ data: [] });
      throw new Error(`UNEXPECTED_GRAPH_PATH:${parsed.pathname}`);
    };

    const wabaId = await discoverWabaIdFromAccessToken(platform, 'oauth-user-token');
    assert.equal(wabaId, '998877665544332');
    assert.ok(seen.length >= 3);
    for (const request of seen) {
      assert.equal(request.authorization, 'Bearer oauth-user-token');
      assert.doesNotMatch(request.url.toString(), /oauth-user-token|input_token=|access_token=/);
    }
    assert.equal(seen.some(request => request.url.pathname.endsWith('/debug_token')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('server refuses to guess when authorized Graph edges expose multiple WABAs', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/v26.0/me') return json({ id: '42', business: { id: '77777777777' } });
      if (parsed.pathname === '/v26.0/77777777777/owned_whatsapp_business_accounts') {
        return json({ data: [{ id: '11111111111' }, { id: '22222222222' }] });
      }
      if (parsed.pathname === '/v26.0/77777777777/client_whatsapp_business_accounts') return json({ data: [] });
      throw new Error(`UNEXPECTED_GRAPH_PATH:${parsed.pathname}`);
    };

    await assert.rejects(
      () => discoverWabaIdFromAccessToken(platform, 'oauth-user-token'),
      error => error?.message === 'META_WABA_RESOLUTION_REQUIRED' && error?.status === 409,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('iPhone Embedded Signup refuses incomplete authorization and server fallback avoids debug_token query transport', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');

  assert.match(ui, /POST_LOGIN_SESSION_GRACE_MS=5000/);
  assert.match(ui, /session_missing/);
  assert.match(ui, /Promise\.race\(\[/);
  assert.match(ui, /await completeSignup\(code,session\)/);
  assert.match(ui, /if\(!session\?\.waba_id\)\{[\s\S]*META_EMBEDDED_SIGNUP_SESSION_MISSING/);

  assert.match(endpoint, /discoverWabaIdFromAccessToken/);
  assert.match(endpoint, /owned_whatsapp_business_accounts/);
  assert.match(endpoint, /client_whatsapp_business_accounts/);
  assert.doesNotMatch(endpoint, /debug_token/);
  assert.doesNotMatch(endpoint, /input_token/);
  assert.doesNotMatch(endpoint, /existingMetaDebugToken/);
  assert.match(endpoint, /waba_source: cleanId\(body\?\.waba_id\) \? 'embedded_session' : 'graph_edges'/);
});
