import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoverWabaIdFromAccessToken } from '../api/dabbir-whatsapp-embedded-complete.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const platform = {
  appId: '123456789012345',
  appSecret: 'unit-test-app-secret',
  graphVersion: 'v23.0',
};
const debugAuthorizationToken = 'unit-test-system-user-token';

test('server discovers exactly one shared WABA from Meta debug_token granular scopes', async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = null;
  let seenAuthorization = null;
  try {
    globalThis.fetch = async (url, options = {}) => {
      seenUrl = new URL(String(url));
      seenAuthorization = options?.headers?.authorization || null;
      return new Response(JSON.stringify({
        data: {
          is_valid: true,
          granular_scopes: [
            { scope: 'public_profile', target_ids: [] },
            { scope: 'whatsapp_business_management', target_ids: ['998877665544332'] },
          ],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const wabaId = await discoverWabaIdFromAccessToken(
      platform,
      'oauth-user-token',
      { authorizationToken: debugAuthorizationToken },
    );
    assert.equal(wabaId, '998877665544332');
    assert.equal(seenUrl.pathname, '/v23.0/debug_token');
    assert.equal(seenUrl.searchParams.get('input_token'), 'oauth-user-token');
    assert.equal(seenAuthorization, 'Bearer unit-test-system-user-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('server refuses to guess when Meta shares multiple WABAs', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        is_valid: true,
        granular_scopes: [
          { scope: 'whatsapp_business_management', target_ids: ['11111111111', '22222222222'] },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    await assert.rejects(
      () => discoverWabaIdFromAccessToken(
        platform,
        'oauth-user-token',
        { authorizationToken: debugAuthorizationToken },
      ),
      error => error?.message === 'META_WABA_RESOLUTION_REQUIRED' && error?.status === 409,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('iPhone Embedded Signup falls back to the server shortly after authorization code returns', async () => {
  const ui = await read('api/dabbir-whatsapp-embedded-ui.js');
  const endpoint = await read('api/dabbir-whatsapp-embedded-complete.js');

  assert.match(ui, /POST_LOGIN_SESSION_GRACE_MS=5000/);
  assert.match(ui, /session_server_fallback/);
  assert.match(ui, /Promise\.race\(\[/);
  assert.match(ui, /await completeSignup\(code,session\)/);
  assert.doesNotMatch(ui, /if\(!session\?\.waba_id\) throw new Error\('META_EMBEDDED_SIGNUP_SESSION_MISSING'\)/);

  assert.match(endpoint, /discoverWabaIdFromAccessToken/);
  assert.match(endpoint, /debug_token/);
  assert.match(endpoint, /granular_scopes/);
  assert.match(endpoint, /whatsapp_business_management/);
  assert.match(endpoint, /DABBIR_WHATSAPP_ACCESS_TOKEN/);
  assert.match(endpoint, /authorizationToken \|\| existingMetaDebugToken\(\) \|\| appAccessToken/);
  assert.match(endpoint, /waba_source: cleanId\(body\?\.waba_id\) \? 'embedded_session' : 'debug_token'/);
});
