import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMetaText, sendMetaTemplate } from '../api/_whatsapp-live-core.js';
import { embeddedPlatformConfig, sealAccessToken } from '../api/_whatsapp-embedded-core.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const originalFetch = global.fetch;
const envNames = ['SUPABASE_SERVICE_ROLE_KEY', 'DABBIR_WHATSAPP_APP_SECRET', 'DABBIR_INTEGRATION_ENCRYPTION_KEY'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let connection;
test.beforeEach(() => {
  for (const name of envNames) process.env[name] = 'transport-fixture-only';
  connection = { phone_number_id: '123456789', ...sealAccessToken('fixture-meta-token', embeddedPlatformConfig(), businessId) };
});
test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
const modes = [
  { name: 'text', send: extra => sendMetaText({ connection, businessId, recipient: '  +971 5000  ', body: '  مرحبا\nHello  ', ...extra }),
    failed: 'META_WHATSAPP_SEND_FAILED', missing: 'META_WHATSAPP_SEND_ACCEPTED_WITHOUT_ID', timeout: 'META_WHATSAPP_SEND_TIMEOUT_AMBIGUOUS',
    payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '+971 5000', type: 'text', text: { preview_url: false, body: 'مرحبا\nHello' } } },
  { name: 'template', send: extra => sendMetaTemplate({ connection, businessId, recipient: '  +971 5000  ', templateName: 'booking_reminder', language: 'en', parameters: ['  Ali  ', '10:00'], ...extra }),
    failed: 'META_WHATSAPP_TEMPLATE_SEND_FAILED', missing: 'META_WHATSAPP_TEMPLATE_ACCEPTED_WITHOUT_ID', timeout: 'META_WHATSAPP_TEMPLATE_TIMEOUT_AMBIGUOUS',
    payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '9715000', type: 'template', template: { name: 'booking_reminder', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ali' }, { type: 'text', text: '10:00' }] }] } } },
];
for (const mode of modes) {
  test(`${mode.name}: keeps exact wire contract and reports acceptance without claiming delivery`, async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ messages: [{ id: ' wamid.fixture ' }] }), { status: 200 }); };
    assert.deepEqual(await mode.send(), { providerMessageId: 'wamid.fixture', providerStatus: 200 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://graph.facebook.com/${embeddedPlatformConfig().graphVersion}/123456789/messages`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.cache, 'no-store');
    assert.equal(calls[0].init.headers.authorization, 'Bearer fixture-meta-token');
    assert.deepEqual(JSON.parse(calls[0].init.body), mode.payload);
  });
  for (const status of [400, 401, 403, 429, 500, 503]) {
    test(`${mode.name}: HTTP ${status} keeps definitive/ambiguous contract without retry`, async () => {
      let calls = 0;
      global.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { code: 131000, message: 'private-provider-detail' } }), { status }); };
      await assert.rejects(mode.send(), error => {
        assert.equal(error.message, mode.failed);
        assert.equal(error.status, status >= 500 ? 502 : 409);
        assert.equal(error.providerStatus, status);
        assert.equal(error.providerCode, 131000);
        assert.equal(error.ambiguous, status >= 500);
        assert.equal(error.definitive, status >= 400 && status < 500);
        assert.equal(JSON.stringify(error).includes('private-provider-detail'), false);
        return true;
      });
      assert.equal(calls, 1);
    });
  }
  for (const body of ['{}', '{"messages":[]}', 'not JSON']) {
    test(`${mode.name}: accepted response ${body} without receipt remains ambiguous`, async () => {
      let calls = 0;
      global.fetch = async () => { calls++; return new Response(body, { status: 200 }); };
      await assert.rejects(mode.send(), e => e.message === mode.missing && e.status === 502 && e.ambiguous === true);
      assert.equal(calls, 1);
    });
  }
  test(`${mode.name}: network failure remains ambiguous and is never retried`, async () => {
    let calls = 0;
    global.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
    await assert.rejects(mode.send(), e => e instanceof TypeError && e.ambiguous === true);
    assert.equal(calls, 1);
  });
  test(`${mode.name}: the ten-second deadline aborts once and preserves ambiguous outcome`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let signal, calls = 0;
    global.fetch = async (_url, init) => { calls++; signal = init.signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })); };
    const pending = assert.rejects(mode.send(), e => e.message === mode.timeout && e.status === 502 && e.ambiguous === true);
    t.mock.timers.tick(9999);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    await pending;
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
  });
  test(`${mode.name}: invalid local context fails before the transport`, async () => {
    let calls = 0; global.fetch = async () => { calls++; throw new Error('unexpected transport'); };
    await assert.rejects(mode.send({ recipient: '' }));
    assert.equal(calls, 0);
  });
}
test('text still requires service data capability before sending', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let calls = 0; global.fetch = async () => { calls++; };
  await assert.rejects(modes[0].send(), e => e.message === 'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED');
  assert.equal(calls, 0);
});
test('template still permits an already authorized OIDC worker without a local service key', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.template' }] }));
  assert.equal((await modes[1].send()).providerMessageId, 'wamid.template');
});
