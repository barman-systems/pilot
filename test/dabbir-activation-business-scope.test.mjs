import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import activationUi from '../api/customer-activation-ui.js';

const readyProfile = { ok: true, facts: { about_business: 'Test business', business_hours: 'Sunday 09:00-17:00', contact_phone: 'test-phone' } };
const readyWhatsApp = { ok: true, operational: true, state: 'OPERATIONAL', connected: true };
const emptyProfile = { ok: true, facts: {} };
const disconnectedWhatsApp = { ok: true, operational: false, state: 'NOT_CONNECTED' };

function business(id) {
  return { business: { id, business_type: 'services' }, ai: { configured: true }, verified_metrics: { state: 'VERIFIED_EXACT_COUNTS', active_chats: 1, customers: 1, ai_messages: 1 } };
}

function uiHarness(language = 'ar') {
  let script = '';
  activationUi({ method: 'GET' }, { setHeader() {}, end(value) { script = value; } });
  let panel;
  const retry = {};
  const calls = [];
  const dashboard = { querySelector: () => null, prepend(node) { panel = node; } };
  const context = vm.createContext({
    window: { __dabbirUxFoundationV1: true },
    workspace: business('A'),
    document: {
      documentElement: { lang: language }, head: { append() {} },
      createElement: () => ({ dataset: {}, innerHTML: '', querySelectorAll: () => [] }),
      querySelector: selector => {
        if (selector === '#screen-dashboard') return dashboard;
        if (selector === '#dabbirActivation') return panel || null;
        if (selector === '#daRetry' && panel?.innerHTML.includes('id="daRetry"')) return retry;
        return null;
      },
    },
    renderDashboard() {},
    renderAll() {},
    fetch: (url, options) => new Promise(resolve => { calls.push({ url, options, resolve }); }),
    setTimeout: () => 1,
  });
  vm.runInContext(script, context);
  return {
    calls,
    refresh: () => context.window.__dabbirCustomerActivation.refresh(),
    switchTo: id => { context.workspace = id ? business(id) : null; },
    render: () => context.renderDashboard(),
    retry: () => retry.onclick(),
    get html() { return panel?.innerHTML || ''; },
    complete(start, profile = readyProfile, whatsapp = readyWhatsApp, status = 200) {
      for (const [offset, body] of [[0, profile], [1, whatsapp]]) {
        calls[start + offset].resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
      }
    },
  };
}

test('switching activities immediately hides old setup state and ignores its delayed response', async () => {
  const ui = uiHarness();
  const oldRequest = ui.refresh();
  assert.equal(ui.calls.length, 2);
  ui.switchTo('B');
  const currentRequest = ui.refresh();
  assert.equal(ui.calls.length, 4, 'B must load even while A is pending');
  assert.match(ui.html, /يتحقق من التجهيز/);
  assert.equal(ui.html.includes('100%'), false);
  assert.ok(ui.calls.slice(2).every(call => call.url.endsWith('business_id=B')));
  ui.complete(2, emptyProfile, disconnectedWhatsApp);
  await currentRequest;
  assert.match(ui.html, /أكمل معلومات نشاطك/);
  assert.equal(ui.html.includes('100%'), false);
  const currentHtml = ui.html;
  ui.complete(0);
  await oldRequest;
  assert.equal(ui.html, currentHtml, 'late A completion cannot replace B setup');
});

test('returning to the same activity does not accept an obsolete earlier request', async () => {
  const ui = uiHarness();
  const firstA = ui.refresh();
  ui.switchTo('B');
  const requestB = ui.refresh();
  ui.switchTo('A');
  const latestA = ui.refresh();
  ui.complete(4, emptyProfile, disconnectedWhatsApp);
  await latestA;
  const currentHtml = ui.html;
  ui.complete(0);
  ui.complete(2);
  await Promise.all([firstA, requestB]);
  assert.equal(ui.html, currentHtml);
  assert.equal(ui.html.includes('100%'), false);
});

for (const language of ['ar', 'en']) {
  test(`${language}: an unavailable setup read is recoverable and never presented as incomplete configuration`, async () => {
    const ui = uiHarness(language);
    const request = ui.refresh();
    ui.complete(0, { ok: false, error: 'private profile diagnostic' }, { ok: false, error: 'private WhatsApp diagnostic' }, 503);
    await request;
    assert.match(ui.html, language === 'ar' ? /تعذر التحقق من إعداد هذا النشاط/ : /could not verify this business/);
    assert.equal(ui.html.includes('private'), false);
    assert.equal(ui.html.includes('daProgress'), false);
    assert.equal(ui.html.includes('daNextAction'), false);
    const retry = ui.retry();
    assert.equal(ui.calls.length, 4);
    ui.complete(2);
    await retry;
    assert.match(ui.html, language === 'ar' ? /اكتمل الإعداد الأساسي/ : /Basic setup is complete/);
    assert.match(ui.html, /100%/);
  });
}

test('an error from the previous activity cannot replace a successful current setup', async () => {
  const ui = uiHarness();
  const requestA = ui.refresh();
  ui.switchTo('B');
  const requestB = ui.refresh();
  ui.complete(2);
  await requestB;
  const currentHtml = ui.html;
  ui.complete(0, { ok: false }, { ok: false }, 503);
  await requestA;
  assert.equal(ui.html, currentHtml);
  assert.match(ui.html, /100%/);
});

test('logout clears the activation panel and rejects an in-flight previous account response', async () => {
  const ui = uiHarness();
  const request = ui.refresh();
  ui.switchTo(null);
  await ui.refresh();
  assert.equal(ui.html, '');
  ui.complete(0);
  await request;
  assert.equal(ui.html, '');
});

test('a connected WhatsApp number without operational proof never completes setup', async () => {
  const ui = uiHarness();
  const request = ui.refresh();
  ui.complete(0, readyProfile, { ok: true, connected: true, state: 'META_AUTHORIZED', operational: false });
  await request;
  assert.match(ui.html, /تحقق من تشغيل واتساب/);
  assert.equal(ui.html.includes('100%'), false);
  assert.equal(ui.html.includes('اكتمل الإعداد الأساسي'), false);
});

test('a render after an activity switch clears previously loaded setup before fresh data arrives', async () => {
  const ui = uiHarness();
  const request = ui.refresh();
  ui.complete(0);
  await request;
  assert.match(ui.html, /100%/);
  ui.switchTo('B');
  ui.render();
  assert.match(ui.html, /يتحقق من التجهيز/);
  assert.equal(ui.html.includes('100%'), false);
  assert.equal(ui.calls.length, 4);
  ui.complete(2);
  await new Promise(setImmediate);
});
