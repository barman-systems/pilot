import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import authUi from '../api/auth-session-stability-ui.js';

function uiHarness({ language = 'ar', mode = 'signup', respond } = {}) {
  let script = '';
  authUi({ method: 'GET' }, {
    setHeader() {},
    status() { return this; },
    send(body) { script = body; },
  });
  const form = {};
  const submit = { disabled: false };
  const message = { textContent: '' };
  const nodes = new Map([
    ['#authForm', form], ['#authSubmit', submit], ['#authMsg', message],
    ['#authEmail', { value: 'activation@example.invalid' }],
    ['#authPassword', { value: 'Falcon!47River' }],
    ['#authGate:not(.hidden)', {}],
  ]);
  const calls = [];
  const gates = [];
  let bootCount = 0;
  const body = { dataset: {} };
  const context = vm.createContext({
    window: {},
    document: {
      documentElement: { lang: language }, body,
      head: { appendChild() {} },
      createElement: () => ({ dataset: {}, textContent: '' }),
      querySelector: selector => nodes.get(selector) || null,
    },
    authMode: mode,
    showGate: name => gates.push(name),
    T: () => ({ verification: 'NEUTRAL_VERIFICATION_GUIDANCE', invalid: 'INVALID_INPUT_GUIDANCE' }),
    api: async (url, options) => { calls.push(url); return respond(url, options); },
    boot: async () => { bootCount++; },
    setTimeout, clearTimeout,
  });
  vm.runInContext(script, context);
  return {
    submit: () => form.onsubmit({ preventDefault() {} }),
    get message() { return message.textContent; },
    get disabled() { return submit.disabled; },
    get bootCount() { return bootCount; },
    get stage() { return body.dataset.dabbirAuthStage; },
    calls, gates,
  };
}

for (const language of ['ar', 'en']) {
  test(`${language}: a failed response with verification_required never becomes email success`, async () => {
    const ui = uiHarness({ language, respond: async () => ({ r: { ok: false, status: 503 }, j: { ok: false, verification_required: true, retryable: true, error: 'private diagnostic' } }) });
    await ui.submit();
    assert.match(ui.message, language === 'ar' ? /تعذر تأكيد طلب التسجيل/ : /could not confirm your signup/);
    assert.equal(ui.message.includes('private diagnostic'), false);
    assert.equal(ui.message.includes('NEUTRAL_VERIFICATION_GUIDANCE'), false);
    assert.equal(ui.disabled, false);
    assert.equal(ui.bootCount, 0);
    assert.equal(ui.stage, 'signed_out');
    assert.deepEqual(ui.calls, ['/api/auth/signup']);
    assert.deepEqual(ui.gates, []);
  });

  test(`${language}: rate limiting tells the owner to wait without changing gates`, async () => {
    const ui = uiHarness({ language, respond: async () => ({ r: { ok: false, status: 429 }, j: { ok: false, error: 'AUTH_RATE_LIMITED', retryable: true } }) });
    await ui.submit();
    assert.match(ui.message, language === 'ar' ? /طلبات كثيرة.*انتظر/ : /Too many requests.*Wait/);
    assert.equal(ui.disabled, false);
    assert.equal(ui.bootCount, 0);
    assert.deepEqual(ui.calls, ['/api/auth/signup']);
    assert.deepEqual(ui.gates, []);
  });

  test(`${language}: an unavailable login service does not blame the entered credentials`, async () => {
    const ui = uiHarness({ language, mode: 'login', respond: async () => ({ r: { ok: false, status: 503 }, j: { ok: false, retryable: true } }) });
    await ui.submit();
    assert.match(ui.message, language === 'ar' ? /خدمة الدخول غير متاحة مؤقتًا/ : /Sign-in is temporarily unavailable/);
    assert.equal(ui.disabled, false);
    assert.equal(ui.bootCount, 0);
    assert.deepEqual(ui.calls, ['/api/auth/login']);
  });
}

test('only a successful verification response shows the neutral email instructions', async () => {
  const ui = uiHarness({ respond: async () => ({ r: { ok: true, status: 202 }, j: { ok: true, authenticated: false, verification_required: true } }) });
  await ui.submit();
  assert.equal(ui.message, 'NEUTRAL_VERIFICATION_GUIDANCE');
  assert.equal(ui.bootCount, 0);
  assert.equal(ui.disabled, false);
  assert.deepEqual(ui.calls, ['/api/auth/signup']);
});

test('repeated submission while signup is pending sends only one request', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const ui = uiHarness({ respond: async () => pending });
  const first = ui.submit();
  assert.equal(ui.disabled, true);
  await ui.submit();
  assert.deepEqual(ui.calls, ['/api/auth/signup']);
  finish({ r: { ok: true, status: 202 }, j: { ok: true, verification_required: true } });
  await first;
  assert.equal(ui.disabled, false);
  assert.equal(ui.message, 'NEUTRAL_VERIFICATION_GUIDANCE');
});

test('an immediate session still proves cookie readiness and MFA before opening the workspace', async () => {
  const ui = uiHarness({ respond: async url => {
    if (url === '/api/auth/signup') return { r: { ok: true }, j: { ok: true, authenticated: true, verification_required: false } };
    if (url === '/api/auth/session') return { r: { ok: true }, j: { authenticated: true } };
    if (url === '/api/auth/mfa-status') return { r: { ok: true }, j: { ok: true, authenticated: true, mfa_required: false } };
    assert.fail(`unexpected request ${url}`);
  } });
  await ui.submit();
  assert.deepEqual(ui.calls, ['/api/auth/signup', '/api/auth/session', '/api/auth/mfa-status']);
  assert.equal(ui.bootCount, 1);
  assert.equal(ui.disabled, false);
  assert.equal(ui.stage, 'session_verified');
});
