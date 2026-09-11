import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exchangeEmbeddedCode, resolveEmbeddedPlatformConfig } from '../api/_whatsapp-embedded-core.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

function withEnv(values, fn) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('Meta App ID discovery sends the legacy access token only in Authorization header', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init = {}) => {
    seen.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: '123456789012345' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await withEnv({
      DABBIR_META_APP_ID: null,
      DABBIR_WHATSAPP_APP_ID: null,
      PILOT_META_APP_ID: null,
      PILOT_WHATSAPP_APP_ID: null,
      META_APP_ID: null,
      FACEBOOK_APP_ID: null,
      DABBIR_WHATSAPP_ACCESS_TOKEN: 'EA-test-legacy-token-never-in-url',
      DABBIR_WHATSAPP_APP_SECRET: 'meta-app-secret-test',
      DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID: '1234567890',
    }, async () => {
      const config = await resolveEmbeddedPlatformConfig();
      assert.equal(config.appId, '123456789012345');
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(seen.length, 1);
  const request = seen[0];
  const url = new URL(request.url);
  assert.equal(url.pathname.endsWith('/app'), true);
  assert.equal(url.searchParams.get('fields'), 'id');
  assert.equal(url.searchParams.has('access_token'), false);
  assert.doesNotMatch(request.url, /EA-test-legacy-token-never-in-url/);
  assert.equal(request.init.headers.authorization, 'Bearer EA-test-legacy-token-never-in-url');
  assert.equal(request.init.cache, 'no-store');
});

test('Meta OAuth exchange posts app secret and code in form body, never URL', async () => {
  const originalFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (input, init = {}) => {
    seen = { url: String(input), init };
    return new Response(JSON.stringify({ access_token: 'EA-result-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await exchangeEmbeddedCode({
      ready: true,
      graphVersion: 'v26.0',
      appId: '123456789012345',
      appSecret: 'meta-app-secret-never-in-url',
    }, 'oauth-code-never-in-url');
    assert.equal(result.accessToken, 'EA-result-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(seen);
  assert.equal(new URL(seen.url).search, '');
  assert.doesNotMatch(seen.url, /meta-app-secret-never-in-url|oauth-code-never-in-url/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['content-type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(seen.init.body);
  assert.equal(form.get('client_secret'), 'meta-app-secret-never-in-url');
  assert.equal(form.get('code'), 'oauth-code-never-in-url');
  assert.equal(form.get('client_id'), '123456789012345');
  assert.equal(seen.init.cache, 'no-store');
});

test('all WhatsApp Embedded Meta credential exchange paths keep secrets out of URL construction', async () => {
  const core = await read('api/_whatsapp-embedded-core.js');
  const complete = await read('api/dabbir-whatsapp-embedded-complete.js');

  assert.doesNotMatch(core, /searchParams\.set\(['"]access_token['"]/);
  assert.doesNotMatch(core, /searchParams\.set\(['"]client_secret['"]/);
  assert.doesNotMatch(complete, /searchParams\.set\(['"]access_token['"]/);
  assert.doesNotMatch(complete, /searchParams\.set\(['"]client_secret['"]/);

  assert.match(core, /authorization:\s*`Bearer \$\{token\}`/);
  assert.match(core, /form\.set\('client_secret', config\.appSecret\)/);
  assert.match(core, /'content-type': 'application\/x-www-form-urlencoded'/);
  assert.match(complete, /form\.set\('client_secret', platform\.appSecret\)/);
  assert.match(complete, /form\.set\('redirect_uri', redirectUri\)/);
  assert.match(complete, /method: 'POST'/);
  assert.match(complete, /'content-type': 'application\/x-www-form-urlencoded'/);
});
