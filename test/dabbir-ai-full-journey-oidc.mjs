import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('PRODUCTION_ORIGIN_REQUIRED');
const PROJECT_REF = String(process.env.SUPABASE_PROJECT_REF || 'spohjzrsymsmzsseygtw').trim();
const BROKER = `https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const OIDC_AUDIENCE = 'dabbir-ai-qa';
const REPORT_PATH = process.env.JOURNEY_REPORT_PATH || 'dabbir-ai-customer-journey-report.json';
const RUN_ID = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const RUN_LABEL = `DABBIR AI QA ${RUN_ID}`;

const report = {
  run_id: RUN_ID,
  journey: 'DABBIR_AI_FULL_CUSTOMER_JOURNEY_OIDC',
  production_origin: ORIGIN,
  started_at: new Date().toISOString(),
  completed_at: null,
  verdict: 'RUNNING',
  required_failures: 0,
  steps: [],
  cleanup: [],
  artifacts: {},
};

let owner = null;
let employee = null;
let businessId = null;
let customerId = null;
let conversationId = null;
let browser = null;
let browserContext = null;
let oidcCache = { token: null, at: 0 };

function redact(value) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[JWT_REDACTED]')
    .replace(/dabbir-qa-[^@\s]+@example\.com/gi, '[QA_EMAIL]')
    .replace(/Dabbir-QA-[A-Za-z0-9_!\-]+/g, '[QA_PASSWORD]');
}

function small(value, max = 500) {
  const text = redact(value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function assert(condition, message = 'ASSERTION_FAILED') {
  if (!condition) throw new Error(message);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function parsedFetch(url, options = {}, retry = true) {
  const attempts = retry ? 3 : 1;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', ...options });
      const text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      last = { response, status: response.status, ok: response.ok, text, json };
      if (![429, 502, 503, 504].includes(response.status) || attempt === attempts) return last;
    } catch (error) {
      last = { response: null, status: 0, ok: false, text: String(error?.message || error), json: null };
      if (attempt === attempts) return last;
    }
    await sleep(500 * attempt);
  }
  return last;
}

async function step(name, fn, { required = true } = {}) {
  const started = Date.now();
  const row = { name, required, status: 'RUNNING', duration_ms: null, http_status: null, detail: null };
  report.steps.push(row);
  try {
    const result = await fn();
    row.status = 'PASS';
    row.duration_ms = Date.now() - started;
    if (result?.status != null) row.http_status = result.status;
    if (result?.detail != null) row.detail = small(result.detail);
    console.log(`PASS ${name} (${row.duration_ms}ms)${row.detail ? ` — ${row.detail}` : ''}`);
    return result;
  } catch (error) {
    row.status = 'FAIL';
    row.duration_ms = Date.now() - started;
    row.detail = small(error?.stack || error?.message || error);
    if (required) report.required_failures += 1;
    console.error(`FAIL ${name} (${row.duration_ms}ms) — ${row.detail}`);
    return null;
  }
}

async function githubOidc() {
  const now = Date.now();
  if (oidcCache.token && now - oidcCache.at < 120_000) return oidcCache.token;
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '').trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();
  assert(requestUrl && requestToken, 'GITHUB_ACTIONS_OIDC_ENV_REQUIRED');
  const joiner = requestUrl.includes('?') ? '&' : '?';
  const result = await parsedFetch(`${requestUrl}${joiner}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
  }, false);
  assert(result.ok && result.json?.value, `GITHUB_OIDC_MINT_FAILED_${result.status}:${small(result.text)}`);
  oidcCache = { token: result.json.value, at: now };
  return oidcCache.token;
}

async function broker(action, payload = {}, retry = true) {
  const token = await githubOidc();
  let result = await parsedFetch(BROKER, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action, run_id: RUN_ID, ...payload }),
  }, retry);
  if (result.status === 401) {
    oidcCache = { token: null, at: 0 };
    const fresh = await githubOidc();
    result = await parsedFetch(BROKER, {
      method: 'POST',
      headers: { authorization: `Bearer ${fresh}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ action, run_id: RUN_ID, ...payload }),
    }, false);
  }
  assert(result.ok && result.json?.ok, `QA_BROKER_${action}_FAILED_${result.status}:${small(result.text)}`);
  return result;
}

class Session {
  constructor(label) { this.label = label; this.cookies = new Map(); }
  capture(response) {
    if (!response?.headers) return;
    const rows = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const row of rows) {
      const pair = String(row).split(';', 1)[0];
      const i = pair.indexOf('=');
      if (i <= 0) continue;
      const key = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value) this.cookies.set(key, value); else this.cookies.delete(key);
    }
  }
  async request(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
    const upper = method.toUpperCase();
    const requestHeaders = { accept: 'application/json', ...headers };
    if (!['GET', 'HEAD'].includes(upper)) requestHeaders.origin = ORIGIN;
    if (body !== undefined && !requestHeaders['content-type']) requestHeaders['content-type'] = 'application/json';
    if (this.cookies.size) requestHeaders.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const result = await parsedFetch(`${ORIGIN}${path}`, {
      method: upper,
      headers: requestHeaders,
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    }, retry);
    this.capture(result.response);
    return result;
  }
}

const ownerSession = new Session('owner');
const employeeSession = new Session('employee');

async function login(session, credentials) {
  const result = await session.request('/api/auth/login', { method: 'POST', body: { email: credentials.email, password: credentials.password } });
  assert(result.ok && result.json?.ok, `LOGIN_FAILED_${result.status}:${small(result.text)}`);
  assert(session.cookies.size > 0, 'LOGIN_COOKIE_MISSING');
  return result;
}

async function runtime(session, business = null, conversation = null, summary = false) {
  const q = new URLSearchParams();
  if (business) q.set('business_id', business);
  if (conversation) q.set('conversation_id', conversation);
  if (summary) q.set('summary', '1');
  return session.request(`/api/dabbir-runtime-fast${q.size ? `?${q}` : ''}`);
}

async function browserJourney() {
  const { webkit } = await import('playwright');
  browser = await webkit.launch({ headless: true });
  browserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'ar-AE',
    timezoneId: 'Asia/Dubai',
  });
  const page = await browserContext.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#authGate:not(.hidden)').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#authEmail').fill(owner.email);
  await page.locator('#authPassword').fill(owner.password);
  await page.locator('#authSubmit').click();
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible', timeout: 25_000 });
  assert((await page.locator('#workspaceName').textContent())?.includes(RUN_LABEL), 'BROWSER_WORKSPACE_MISMATCH');

  const logo = page.locator('.brand .logo').first();
  await logo.waitFor({ state: 'visible', timeout: 10_000 });
  assert(String(await logo.evaluate(el => getComputedStyle(el).backgroundImage)).includes('dabbir-app-icon'), 'BROWSER_LOGO_MISMATCH');

  await page.locator('[data-screen="conversations"]').first().click();
  await page.locator('#screen-conversations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_MISSING');

  await page.locator('[data-screen="operations"]').first().click();
  await page.locator('#screen-operations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#opsBody').textContent())?.includes('AI Journey Product'), 'BROWSER_PRODUCT_MISSING');

  await page.screenshot({ path: 'dabbir-ai-customer-journey-screenshot.png', fullPage: true });
  report.artifacts.screenshot = 'dabbir-ai-customer-journey-screenshot.png';
  assert(pageErrors.length === 0, `BROWSER_PAGE_ERRORS:${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `BROWSER_CONSOLE_ERRORS:${consoleErrors.slice(0, 5).join(' | ')}`);
  return { detail: 'WebKit iPhone-size owner journey rendered workspace, conversation, product, and approved identity.' };
}

async function main() {
  let inviteToken = null;
  let productId = null;
  let orderId = null;

  try {
    await step('01_public_production_surface', async () => {
      const [home, icon] = await Promise.all([
        parsedFetch(ORIGIN, { headers: { accept: 'text/html' } }),
        parsedFetch(`${ORIGIN}/api/dabbir-approved-icon`, { headers: { accept: 'image/png' } }),
      ]);
      assert(home.ok && /DABBIR/i.test(home.text), `HOME_INVALID_${home.status}`);
      assert(icon.ok, `ICON_INVALID_${icon.status}`);
      return { status: home.status, detail: 'Production DABBIR home and approved icon reachable.' };
    });

    await step('02_github_oidc_authorized_qa_channel', async () => {
      const result = await githubOidc();
      assert(result && result.split('.').length === 3, 'OIDC_TOKEN_INVALID');
      return { detail: 'GitHub issued short-lived OIDC identity; no persistent admin secret is stored in Actions.' };
    });

    await step('03_create_disposable_owner_and_employee', async () => {
      const result = await broker('dabbir_ai_qa_bootstrap');
      owner = result.json?.identities?.owner;
      employee = result.json?.identities?.employee;
      assert(owner?.id && owner?.email && owner?.password, 'OWNER_QA_IDENTITY_MISSING');
      assert(employee?.id && employee?.email && employee?.password, 'EMPLOYEE_QA_IDENTITY_MISSING');
      return { status: result.status, detail: 'Supabase QA broker created two email-confirmed disposable identities.' };
    });

    await step('04_owner_real_login', async () => {
      const result = await login(ownerSession, owner);
      return { status: result.status, detail: 'Owner logged in through production auth endpoint.' };
    });

    await step('05_fresh_owner_requires_onboarding', async () => {
      const result = await runtime(ownerSession, null, null, true);
      assert(result.ok && result.json?.authenticated === true, `RUNTIME_AUTH_FAILED_${result.status}`);
      assert(result.json?.needs_onboarding === true, 'FRESH_OWNER_ONBOARDING_STATE_INVALID');
      return { status: result.status, detail: 'Fresh owner has no tenant and is routed to onboarding.' };
    });

    await step('06_create_isolated_business', async () => {
      const create = await ownerSession.request('/api/dabbir-runtime-fast', {
        method: 'POST',
        body: { action: 'create_business', name: RUN_LABEL, business_type: 'store', locale: 'ar-AE' },
      });
      assert(create.ok && create.json?.business_id, `BUSINESS_CREATE_FAILED_${create.status}:${small(create.text)}`);
      businessId = create.json.business_id;
      const verify = await runtime(ownerSession, businessId, null, true);
      assert(verify.ok && verify.json?.business?.id === businessId, 'BUSINESS_PERSISTENCE_FAILED');
      assert(String(verify.json?.membership?.role).toLowerCase() === 'owner', 'OWNER_MEMBERSHIP_MISSING');
      return { status: create.status, detail: 'Disposable QA business created with owner membership.' };
    });

    await step('07_owner_invites_employee_once', async () => {
      const result = await ownerSession.request('/api/team/invitations', {
        method: 'POST',
        body: {
          business_id: businessId,
          email: employee.email,
          display_name: 'AI QA Employee',
          role: 'employee',
          permissions: ['view_business', 'view_conversations', 'reply_conversations', 'manage_handoffs', 'view_customers'],
        },
      });
      assert(result.ok && result.json?.invite_token, `INVITE_FAILED_${result.status}:${small(result.text)}`);
      inviteToken = result.json.invite_token;
      return { status: result.status, detail: 'Owner created one-time employee invitation.' };
    });

    await step('08_employee_login_accepts_invite_once', async () => {
      await login(employeeSession, employee);
      const accept = await employeeSession.request('/api/team/accept-invite', { method: 'POST', body: { token: inviteToken } });
      assert(accept.ok && accept.json?.invitation_consumed === true, `INVITE_ACCEPT_FAILED_${accept.status}:${small(accept.text)}`);
      const state = await runtime(employeeSession, businessId, null, true);
      const membership = (state.json?.memberships || []).find(row => row.business_id === businessId);
      assert(membership && String(membership.status || 'active').toLowerCase() === 'active', 'EMPLOYEE_MEMBERSHIP_NOT_ACTIVE');
      return { status: accept.status, detail: 'Employee accepted invitation and received permanent membership.' };
    });

    await step('09_owner_creates_product_inventory', async () => {
      const sku = `QA-${RUN_ID}`;
      const create = await ownerSession.request('/api/owner-operations', {
        method: 'POST',
        body: { action: 'create_product', business_id: businessId, sku, name: 'AI Journey Product', price_aed: 49.5, quantity: 8 },
      });
      assert(create.ok && create.json?.ok, `PRODUCT_CREATE_FAILED_${create.status}:${small(create.text)}`);
      const list = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
      const product = (list.json?.products || []).find(row => row.sku === sku);
      assert(product?.id && Number(product.quantity) === 8, 'PRODUCT_OR_INVENTORY_NOT_PERSISTED');
      productId = product.id;
      return { status: create.status, detail: 'Product and opening inventory persisted.' };
    });

    await step('10_low_stock_updates_immediately', async () => {
      const update = await ownerSession.request('/api/owner-operations', {
        method: 'POST',
        body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 3 },
      });
      assert(update.ok, `INVENTORY_UPDATE_FAILED_${update.status}:${small(update.text)}`);
      const list = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
      const product = (list.json?.products || []).find(row => row.id === productId);
      assert(Number(product?.quantity) === 3 && product?.low_stock === true, 'LOW_STOCK_STATE_WRONG');
      return { status: update.status, detail: 'Inventory moved to 3 and low-stock flag became true.' };
    });

    await step('11_employee_inventory_write_denied', async () => {
      const denied = await employeeSession.request('/api/owner-operations', {
        method: 'POST', retry: false,
        body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 99 },
      });
      assert(denied.status === 403, `EMPLOYEE_WRITE_NOT_DENIED_${denied.status}`);
      return { status: denied.status, detail: 'Employee cannot mutate owner-only inventory.' };
    });

    await step('12_customer_conversation_created', async () => {
      const result = await ownerSession.request('/api/start-conversation', {
        method: 'POST', body: { business_id: businessId, display_name: 'AI Journey Customer' },
      });
      assert(result.ok && result.json?.conversation?.id && result.json?.customer?.id, `CONVERSATION_CREATE_FAILED_${result.status}:${small(result.text)}`);
      conversationId = result.json.conversation.id;
      customerId = result.json.customer.id;
      return { status: result.status, detail: 'Web customer and conversation persisted.' };
    });

    await step('13_customer_message_gets_ai_reply', async () => {
      const result = await ownerSession.request('/api/chat-customer', {
        method: 'POST', body: { business_id: businessId, conversation_id: conversationId, message: 'مرحبا، هل المنتج متوفر وما سعره؟' },
      });
      assert(result.ok && result.json?.customer_message?.sender_type === 'customer', `CUSTOMER_MESSAGE_FAILED_${result.status}:${small(result.text)}`);
      assert(result.json?.ai_message?.sender_type === 'ai', 'AI_REPLY_MISSING');
      return { status: result.status, detail: `AI reply persisted: ${small(result.json.ai_message.body, 120)}` };
    });

    await step('14_employee_human_takeover', async () => {
      const result = await employeeSession.request('/api/chat-control', {
        method: 'POST', body: { action: 'takeover', business_id: businessId, conversation_id: conversationId },
      });
      assert(result.ok, `TAKEOVER_FAILED_${result.status}:${small(result.text)}`);
      const state = await runtime(employeeSession, businessId, conversationId, false);
      const conversation = (state.json?.conversations || []).find(row => row.id === conversationId);
      assert(conversation?.state === 'human_active', `TAKEOVER_STATE_${conversation?.state}`);
      return { status: result.status, detail: 'Employee takeover set human_active.' };
    });

    await step('15_ai_silent_during_human_takeover', async () => {
      const result = await ownerSession.request('/api/chat-customer', {
        method: 'POST', body: { business_id: businessId, conversation_id: conversationId, message: 'ممكن أحد من الفريق يرد علي؟' },
      });
      assert(result.ok && result.json?.human_takeover === true && result.json?.ai_message == null, `AI_NOT_SUPPRESSED_${result.status}:${small(result.text)}`);
      return { status: result.status, detail: 'Customer message persisted and AI stayed silent while human owned the chat.' };
    });

    await step('16_employee_human_reply_attributed', async () => {
      const result = await employeeSession.request('/api/chat-control', {
        method: 'POST', body: { action: 'human_message', business_id: businessId, conversation_id: conversationId, message: 'ياهلا، معك موظف الفريق. المنتج متوفر وسأتابع معك.' },
      });
      assert(result.ok, `HUMAN_REPLY_FAILED_${result.status}:${small(result.text)}`);
      const state = await runtime(employeeSession, businessId, conversationId, false);
      assert((state.json?.messages || []).some(row => row.sender_type === 'human'), 'HUMAN_REPLY_NOT_PERSISTED');
      return { status: result.status, detail: 'Human response persisted with human attribution.' };
    });

    await step('17_return_conversation_to_ai', async () => {
      const result = await employeeSession.request('/api/chat-control', {
        method: 'POST', body: { action: 'return_to_ai', business_id: businessId, conversation_id: conversationId },
      });
      assert(result.ok, `RETURN_TO_AI_FAILED_${result.status}:${small(result.text)}`);
      return { status: result.status, detail: 'Employee explicitly returned conversation to AI.' };
    });

    await step('18_ai_resumes_after_return', async () => {
      const result = await ownerSession.request('/api/chat-customer', {
        method: 'POST', body: { business_id: businessId, conversation_id: conversationId, message: 'تمام، كمل معي دبر.' },
      });
      assert(result.ok && result.json?.ai_message?.sender_type === 'ai', `AI_RESUME_FAILED_${result.status}:${small(result.text)}`);
      const state = await runtime(ownerSession, businessId, conversationId, false);
      const kinds = new Set((state.json?.messages || []).map(row => row.sender_type));
      assert(['customer', 'ai', 'human'].every(kind => kinds.has(kind)), 'CHAT_PARTICIPANTS_INCOMPLETE');
      return { status: result.status, detail: 'AI resumed and full customer/AI/human history remains.' };
    });

    await step('19_future_appointment_persists', async () => {
      const result = await ownerSession.request('/api/dabbir-runtime-fast', {
        method: 'POST',
        body: { action: 'create_appointment', business_id: businessId, customer_id: customerId, customer_name: 'AI Journey Customer', starts_at: new Date(Date.now() + 48 * 3600_000).toISOString() },
      });
      assert(result.ok && result.json?.ok, `APPOINTMENT_FAILED_${result.status}:${small(result.text)}`);
      const state = await runtime(ownerSession, businessId, conversationId, false);
      assert((state.json?.appointments || []).some(row => row.customer_id === customerId), 'APPOINTMENT_NOT_VISIBLE');
      return { status: result.status, detail: 'Future appointment persisted and is visible.' };
    });

    await step('20_followup_persists', async () => {
      const result = await ownerSession.request('/api/dabbir-runtime-fast', {
        method: 'POST',
        body: { action: 'create_followup', business_id: businessId, conversation_id: conversationId, reason: 'ai_full_journey_followup', due_at: new Date(Date.now() + 24 * 3600_000).toISOString() },
      });
      assert(result.ok && result.json?.ok, `FOLLOWUP_FAILED_${result.status}:${small(result.text)}`);
      const state = await runtime(ownerSession, businessId, conversationId, false);
      assert((state.json?.followups || []).some(row => row.conversation_id === conversationId), 'FOLLOWUP_NOT_VISIBLE');
      return { status: result.status, detail: 'Follow-up persisted for current customer conversation.' };
    });

    await step('21_seed_order_inside_qa_tenant', async () => {
      const result = await broker('dabbir_ai_qa_seed_order', { business_id: businessId, customer_id: customerId });
      orderId = result.json?.order?.id;
      assert(orderId, 'QA_ORDER_ID_MISSING');
      return { status: result.status, detail: 'Broker created a real, isolated order fixture only inside QA tenant.' };
    });

    await step('22_owner_confirms_order_sales_metric', async () => {
      const result = await ownerSession.request('/api/owner-operations', {
        method: 'POST', body: { action: 'update_order_status', business_id: businessId, order_id: orderId, status: 'confirmed' },
      });
      assert(result.ok && result.json?.ok, `ORDER_CONFIRM_FAILED_${result.status}:${small(result.text)}`);
      const list = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
      const order = (list.json?.orders || []).find(row => row.id === orderId);
      assert(order?.status === 'confirmed', 'ORDER_NOT_CONFIRMED');
      assert(Number(list.json?.metrics?.recognized_sales_aed) >= 125, 'SALES_METRIC_MISSING');
      return { status: result.status, detail: 'Order confirmed and recognized-sales metric reflects AED 125.' };
    });

    await step('23_mobile_webkit_owner_journey', browserJourney);

    await step('24_employee_logout_invalidates_session', async () => {
      const logout = await employeeSession.request('/api/auth/logout', { method: 'POST', body: {} });
      assert(logout.ok, `EMPLOYEE_LOGOUT_FAILED_${logout.status}`);
      const after = await runtime(employeeSession, businessId, null, true);
      assert(after.status === 401, `EMPLOYEE_SESSION_ACTIVE_${after.status}`);
      return { status: logout.status, detail: 'Employee session invalidated after logout.' };
    });

    await step('25_owner_logout_invalidates_session', async () => {
      const logout = await ownerSession.request('/api/auth/logout', { method: 'POST', body: {} });
      assert(logout.ok, `OWNER_LOGOUT_FAILED_${logout.status}`);
      const after = await runtime(ownerSession, businessId, null, true);
      assert(after.status === 401, `OWNER_SESSION_ACTIVE_${after.status}`);
      return { status: logout.status, detail: 'Owner session invalidated after logout.' };
    });
  } finally {
    if (browserContext) await browserContext.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});

    if (owner?.id || employee?.id || businessId) {
      try {
        const cleaned = await broker('dabbir_ai_qa_cleanup', {
          business_id: businessId || undefined,
          owner_user_id: owner?.id || undefined,
          employee_user_id: employee?.id || undefined,
        }, false);
        report.cleanup.push({ item: 'qa_tenant_and_auth_users', status: 'PASS', http_status: cleaned.status, detail: 'QA business data and disposable identities deleted.' });
      } catch (error) {
        report.cleanup.push({ item: 'qa_tenant_and_auth_users', status: 'FAIL', detail: small(error?.message || error) });
        report.required_failures += 1;
      }
    }

    report.completed_at = new Date().toISOString();
    report.verdict = report.required_failures === 0 ? 'PASS' : 'FAIL';
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nDABBIR AI FULL CUSTOMER JOURNEY: ${report.verdict}`);
    console.log(`Report: ${REPORT_PATH}`);
  }

  if (report.required_failures > 0) process.exitCode = 1;
}

await main();
