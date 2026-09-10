import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sendMetaCatalogProducts } from '../api/_dabbir-whatsapp-catalog.js';
import { sendMetaBookingFlow } from '../api/_dabbir-whatsapp-flows.js';
import { embeddedPlatformConfig, sealAccessToken } from '../api/_whatsapp-embedded-core.js';

const id = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const businessId = id('1'), conversationId = id('2'), connectionId = id('3'), serviceId = id('4');
const originalFetch = global.fetch;
const envNames = ['SUPABASE_SERVICE_ROLE_KEY', 'DABBIR_WHATSAPP_APP_SECRET', 'DABBIR_INTEGRATION_ENCRYPTION_KEY'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let connection;
test.beforeEach(() => {
  for (const name of envNames) process.env[name] = 'interactive-fixture-only';
  connection = { id: connectionId, phone_number_id: '123456789', ...sealAccessToken('fixture-token', embeddedPlatformConfig(), businessId) };
});
test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
const catalog = extra => sendMetaCatalogProducts({ connection, businessId, recipient: '+971 5000', catalogId: '987654321', items: [{ product_retailer_id: 'car-wash' }], ...extra });
const flow = () => sendMetaBookingFlow({ connection, recipient: '+971 5000', lang: 'ar',
  context: { business: { id: businessId }, conversation: { id: conversationId }, services: [{ id: serviceId, name_ar: 'غسيل' }] },
  flow: { id: 'local-flow-fixture', meta_flow_id: '876543210' } });
function fixture(metaResponse) {
  const calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url: String(url), body });
    if (String(url).includes('/rpc/dabbir_whatsapp_create_booking_flow_session')) return Response.json({ session_id: 'session-fixture', recipient_handle: '9715000' });
    if (String(url).includes('/rpc/dabbir_whatsapp_mark_booking_flow_delivery')) return Response.json({});
    assert.match(String(url), /^https:\/\/graph\.facebook\.com\/[^/]+\/123456789\/messages$/);
    assert.equal(init.method, 'POST'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.authorization, 'Bearer fixture-token');
    return metaResponse();
  };
  return calls;
}
test('catalog retains the normalized product payload and acceptance receipt', async () => {
  const calls = fixture(() => Response.json({ messages: [{ id: 'wamid.catalog' }] }));
  assert.deepEqual(await catalog(), { providerMessageId: 'wamid.catalog', providerStatus: 200, productCount: 1 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '9715000', type: 'interactive', interactive: { type: 'product', body: { text: 'هذه الخدمة متاحة من كتالوج النشاط.' }, action: { catalog_id: '987654321', product_retailer_id: 'car-wash' } } });
});
test('Flow keeps a tenant-bound durable session before send and marks sent only after receipt', async () => {
  const calls = fixture(() => Response.json({ messages: [{ id: 'wamid.flow' }] }));
  assert.deepEqual(await flow(), { providerMessageId: 'wamid.flow', providerStatus: 200, sessionId: 'session-fixture' });
  assert.equal(calls.length, 3);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['p_business_id','p_conversation_id','p_connection_id','p_flow_id','p_token_hash','p_ttl_seconds'].sort());
  assert.equal(calls[0].body.p_business_id, businessId); assert.equal(calls[0].body.p_conversation_id, conversationId); assert.equal(calls[0].body.p_connection_id, connectionId);
  const payload = calls[1].body;
  assert.equal(payload.to, '9715000'); assert.equal(payload.interactive.type, 'flow');
  const parameters = payload.interactive.action.parameters;
  assert.equal(createHash('sha256').update(parameters.flow_token).digest('hex'), calls[0].body.p_token_hash);
  assert.equal(parameters.flow_id, '876543210');
  assert.deepEqual(parameters.flow_action_payload.data.services, [{ id: serviceId, title: 'غسيل' }]);
  assert.deepEqual(calls[2].body, { p_session_id: 'session-fixture', p_state: 'sent', p_provider_message_id: 'wamid.flow', p_error: null });
});
for (const status of [400, 429, 500, 503]) {
  test(`catalog HTTP ${status} preserves its diagnostic and fallback contract`, async () => {
    const calls = fixture(() => Response.json({ error: { code: 131000, error_subcode: 9, message: 'bounded diagnostic' } }, { status }));
    await assert.rejects(catalog(), e => e.code === 'META_WHATSAPP_CATALOG_SEND_FAILED' && e.providerStatus === status && e.providerCode === 131000 && e.providerSubcode === 9 && e.providerMessage === 'bounded diagnostic' && e.ambiguous === (status >= 500) && e.definitive === (status < 500));
    assert.equal(calls.length, 1);
  });
  test(`Flow HTTP ${status} preserves durable failed/ambiguous state and safe fallback`, async () => {
    const calls = fixture(() => Response.json({ error: { code: 131000 } }, { status }));
    await assert.rejects(flow(), e => e.code === 'META_WHATSAPP_FLOW_SEND_FAILED' && e.providerStatus === status && e.ambiguous === (status >= 500) && e.definitive === (status < 500) && (e.flowFallbackSafe === true) === (status < 500));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].body, { p_session_id: 'session-fixture', p_state: status >= 500 ? 'ambiguous' : 'failed', p_provider_message_id: null, p_error: 'META_WHATSAPP_FLOW_SEND_FAILED' });
  });
}
for (const [name, response] of [['missing receipt', () => Response.json({})], ['invalid JSON', () => new Response('invalid')], ['network failure', () => { throw new TypeError('network'); }], ['timeout', () => { throw new DOMException('deadline', 'AbortError'); }]]) {
  test(`catalog ${name} remains ambiguous and cannot retry`, async () => {
    const calls = fixture(response);
    await assert.rejects(catalog(), e => e.ambiguous === true);
    assert.equal(calls.length, 1);
  });
  test(`Flow ${name} records ambiguity without claiming sent or falling back`, async () => {
    const calls = fixture(response);
    await assert.rejects(flow(), e => e.ambiguous === true && e.flowFallbackSafe !== true);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].body.p_state, 'ambiguous');
    assert.equal(calls[2].body.p_provider_message_id, null);
  });
}
test('invalid catalog context never reaches provider transport', async () => {
  const calls = fixture(() => { throw new Error('unexpected send'); });
  await assert.rejects(catalog({ catalogId: 'invalid' }), e => e.code === 'WHATSAPP_CATALOG_SEND_CONTEXT_INCOMPLETE');
  assert.equal(calls.length, 0);
});
