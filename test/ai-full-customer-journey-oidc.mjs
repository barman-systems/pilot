import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('PRODUCTION_ORIGIN_REQUIRED');
const PROJECT_REF = String(process.env.SUPABASE_PROJECT_REF || 'spohjzrsymsmzsseygtw').trim();
const QA_CONTROL_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const OIDC_AUDIENCE = 'dabbir-ai-qa';
const REPORT_PATH = process.env.JOURNEY_REPORT_PATH || 'dabbir-ai-customer-journey-report.json';
const RUN_ID = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const RUN_LABEL = `DABBIR AI QA ${RUN_ID}`;

const report = {
  run_id: RUN_ID,
  journey: 'DABBIR_AI_FULL_CUSTOMER_JOURNEY',
  production_origin: ORIGIN,
  started_at: new Date().toISOString(),
  completed_at: null,
  verdict: 'RUNNING',
  required_failures: 0,
  steps: [],
  cleanup: [],
  artifacts: {},
};

let oidcToken = null;
let owner = null;
let employee = null;
let businessId = null;
let customerId = null;
let conversationId = null;
let browser = null;
let browserContext = null;

function redact(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/dabbir-qa-(owner|employee)-[^@\s]+@example\.com/g, '[QA_EMAIL]')
    .replace(/Dabbir-QA-[A-Za-z0-9_-]+![A-Za-z0-9]+/g, '[QA_PASSWORD]')
    .replace(/eyJ[A-Za-z0-9._-]{30,}/g, '[OIDC_REDACTED]');
}

function small(value, max = 500) {
  const text = redact(value == null ? '' : value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function assert(condition, message = 'ASSERTION_FAILED') {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseResponse(response) {
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { response, status: response.status, ok: response.ok, json, text };
}

async function rawFetch(url, options = {}, retry = true) {
  const attempts = retry ? 3 : 1;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', ...options });
      last = await parseResponse(response);
      if (![429, 502, 503, 504].includes(last.status) || attempt === attempts) return last;
    } catch (error) {
      last = { response: null, status: 0, ok: false, json: null, text: String(error?.message || error) };
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

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  captureCookies(response) {
    if (!response?.headers) return;
    const lines = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const line of lines) {
      const pair = String(line).split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
  }

  async request(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
    const upper = String(method).toUpperCase();
    const requestHeaders = { accept: 'application/json', ...headers };
    if (upper !== 'GET' && upper !== 'HEAD') requestHeaders.origin = ORIGIN;
    if (body !== undefined && !requestHeaders['content-type']) requestHeaders['content-type'] = 'application/json';
    if (this.cookies.size) requestHeaders.cookie = [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    const payload = body === undefined || typeof body === 'string' ? body : JSON.stringify(body);
    const result = await rawFetch(`${ORIGIN}${path}`, { method: upper, headers: requestHeaders, body: payload }, retry);
    this.captureCookies(result.response);
    return result;
  }
}

const ownerSession = new Session('owner');
const employeeSession = new Session('employee');

async function getGitHubOidcToken() {
  if (oidcToken) return oidcToken;
  if (process.env.GITHUB_OIDC_TOKEN) {
    oidcToken = String(process.env.GITHUB_OIDC_TOKEN);
    return oidcToken;
  }
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '').trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();
  assert(requestUrl && requestToken, 'GITHUB_ACTIONS_OIDC_CONTEXT_REQUIRED');
  const separator = requestUrl.includes('?') ? '&' : '?';
  const result = await rawFetch(`${requestUrl}${separator}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
  }, false);
  assert(result.ok && result.json?.value, `GITHUB_OIDC_ISSUE_FAILED_${result.status}:${small(result.text)}`);
  oidcToken = String(result.json.value);
  return oidcToken;
}

async function qaControl(action, body = {}) {
  const token = await getGitHubOidcToken();
  const result = await rawFetch(QA_CONTROL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action, run_id: RUN_ID, ...body }),
  }, false);
  assert(result.ok && result.json?.ok, `QA_CONTROL_${action}_FAILED_${result.status}:${small(result.text)}`);
  return result;
}

async function login(session, credentials) {
  assert(credentials?.email && credentials?.password, 'LOGIN_CREDENTIALS_MISSING');
  const result = await session.request('/api/auth/login', {
    method: 'POST',
    body: { email: credentials.email, password: credentials.password },
  });
  assert(result.ok && result.json?.ok, `LOGIN_FAILED_${result.status}:${small(result.text)}`);
  assert(session.cookies.size > 0, 'LOGIN_DID_NOT_SET_SESSION_COOKIE');
  return result;
}

async function runtime(session, business = null, conversation = null, summary = false) {
  const query = new URLSearchParams();
  if (business) query.set('business_id', business);
  if (conversation) query.set('conversation_id', conversation);
  if (summary) query.set('summary', '1');
  const suffix = query.size ? `?${query.toString()}` : '';
  return session.request(`/api/dabbir-runtime-fast${suffix}`);
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
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#authGate:not(.hidden)').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#authEmail').fill(owner.email);
  await page.locator('#authPassword').fill(owner.password);
  await page.locator('#authSubmit').click();
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible', timeout: 25_000 });
  assert((await page.locator('#workspaceName').textContent())?.includes(RUN_LABEL), 'BROWSER_WORKSPACE_NAME_MISMATCH');

  const logo = page.locator('.brand .logo').first();
  await logo.waitFor({ state: 'visible', timeout: 10_000 });
  const logoBg = await logo.evaluate(element => getComputedStyle(element).backgroundImage);
  assert(String(logoBg).includes('dabbir-approved-icon'), 'APPROVED_LOGO_NOT_RENDERED');

  await page.locator('[data-screen="conversations"]').first().click();
  await page.locator('#screen-conversations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_NOT_VISIBLE');

  const operations = page.locator('[data-screen="operations"]').first();
  await operations.waitFor({ state: 'visible', timeout: 15_000 });
  await operations.click();
  await page.locator('#screen-operations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#opsBody').textContent())?.includes('AI Journey Product'), 'BROWSER_PRODUCT_NOT_VISIBLE');

  await page.screenshot({ path: 'dabbir-ai-customer-journey-screenshot.png', fullPage: true });
  report.artifacts.screenshot = 'dabbir-ai-customer-journey-screenshot.png';
  assert(pageErrors.length === 0, `BROWSER_PAGE_ERRORS:${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `BROWSER_CONSOLE_ERRORS:${consoleErrors.slice(0, 5).join(' | ')}`);
  return { detail: 'WebKit mobile journey passed: login, approved logo, conversations, and operations.' };
}

async function runJourney() {
  const publicStep = await step('01_public_production_surface', async () => {
    const [home, icon] = await Promise.all([
      rawFetch(ORIGIN, { headers: { accept: 'text/html' } }),
      rawFetch(`${ORIGIN}/api/dabbir-approved-icon`, { headers: { accept: 'image/png' } }),
    ]);
    assert(home.ok && /DABBIR/i.test(home.text), `HOME_INVALID_${home.status}`);
    assert(icon.ok, `APPROVED_ICON_INVALID_${icon.status}`);
    return { status: home.status, detail: 'Production home and approved DABBIR icon are reachable.' };
  });
  if (!publicStep) throw new Error('FATAL_PUBLIC_SURFACE_FAILED');

  const oidc = await step('02_github_oidc_identity', async () => {
    await getGitHubOidcToken();
    return { detail: 'GitHub OIDC issued for the exact DABBIR journey workflow; no repository secret required.' };
  });
  if (!oidc) throw new Error('FATAL_OIDC_FAILED');

  const bootstrap = await step('03_create_disposable_owner_and_employee', async () => {
    const result = await qaControl('dabbir_ai_qa_bootstrap');
    owner = result.json?.identities?.owner;
    employee = result.json?.identities?.employee;
    assert(owner?.id && owner?.email && owner?.password, 'QA_OWNER_MISSING');
    assert(employee?.id && employee?.email && employee?.password, 'QA_EMPLOYEE_MISSING');
    return { status: result.status, detail: 'Two disposable, email-confirmed QA identities created through OIDC-scoped control.' };
  });
  if (!bootstrap) throw new Error('FATAL_QA_BOOTSTRAP_FAILED');

  const ownerLogin = await step('04_owner_real_login', async () => {
    const result = await login(ownerSession, owner);
    return { status: result.status, detail: 'Owner logged in through production auth.' };
  });
  if (!ownerLogin) throw new Error('FATAL_OWNER_LOGIN_FAILED');

  await step('05_owner_onboarding_state', async () => {
    const result = await runtime(ownerSession, null, null, true);
    assert(result.ok && result.json?.authenticated, `RUNTIME_AUTH_FAILED_${result.status}`);
    assert(result.json?.needs_onboarding === true, 'NEW_OWNER_SHOULD_NEED_ONBOARDING');
    return { status: result.status, detail: 'Fresh owner correctly requires onboarding.' };
  });

  const business = await step('06_create_real_qa_business', async () => {
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: { action: 'create_business', name: RUN_LABEL, business_type: 'store', locale: 'ar-AE' },
    });
    assert(result.ok && result.json?.ok && result.json?.business_id, `BUSINESS_CREATE_FAILED_${result.status}:${small(result.text)}`);
    businessId = result.json.business_id;
    const verify = await runtime(ownerSession, businessId, null, true);
    assert(verify.ok && verify.json?.business?.id === businessId, 'BUSINESS_NOT_PERSISTED');
    assert(String(verify.json?.membership?.role).toLowerCase() === 'owner', 'OWNER_MEMBERSHIP_MISSING');
    return { status: result.status, detail: 'Isolated QA business persisted with owner membership.' };
  });
  if (!business) throw new Error('FATAL_BUSINESS_CREATE_FAILED');

  let inviteToken = null;
  const invited = await step('07_owner_invites_employee_once', async () => {
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
    assert(result.ok && result.json?.ok && result.json?.invite_token, `INVITE_FAILED_${result.status}:${small(result.text)}`);
    inviteToken = result.json.invite_token;
    return { status: result.status, detail: 'One-time employee invitation created.' };
  });
  if (!invited) throw new Error('FATAL_EMPLOYEE_INVITE_FAILED');

  const employeeAccepted = await step('08_employee_real_login_and_acceptance', async () => {
    await login(employeeSession, employee);
    const accept = await employeeSession.request('/api/team/accept-invite', { method: 'POST', body: { token: inviteToken } });
    assert(accept.ok && accept.json?.ok && accept.json?.invitation_consumed === true, `INVITE_ACCEPT_FAILED_${accept.status}:${small(accept.text)}`);
    const verify = await runtime(employeeSession, businessId, null, true);
    assert(verify.ok && ['employee', 'staff'].includes(String(verify.json?.membership?.role).toLowerCase()), 'EMPLOYEE_MEMBERSHIP_NOT_ACTIVE');
    return { status: accept.status, detail: 'Employee accepted once and now has permanent membership.' };
  });
  if (!employeeAccepted) throw new Error('FATAL_EMPLOYEE_ACCEPTANCE_FAILED');

  let productId = null;
  await step('09_owner_creates_product_and_inventory', async () => {
    const sku = `QA-${RUN_ID}`.slice(0, 70);
    const create = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'create_product', business_id: businessId, sku, name: 'AI Journey Product', price_aed: 49.5, quantity: 8 },
    });
    assert(create.ok && create.json?.ok, `PRODUCT_CREATE_FAILED_${create.status}:${small(create.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    assert(listing.ok && listing.json?.ok, `OWNER_OPS_GET_FAILED_${listing.status}`);
    const product = (listing.json?.products || []).find(item => item.sku === sku);
    assert(product?.id && Number(product.quantity) === 8, 'CREATED_PRODUCT_OR_INVENTORY_MISMATCH');
    productId = product.id;
    return { status: create.status, detail: 'Product created with quantity 8.' };
  });

  await step('10_owner_updates_inventory_and_low_stock', async () => {
    assert(productId, 'PRODUCT_ID_REQUIRED');
    const update = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 3 },
    });
    assert(update.ok && update.json?.ok, `INVENTORY_UPDATE_FAILED_${update.status}:${small(update.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    const product = (listing.json?.products || []).find(item => item.id === productId);
    assert(Number(product?.quantity) === 3 && product?.low_stock === true, 'LOW_STOCK_NOT_REFLECTED');
    return { status: update.status, detail: 'Inventory changed to 3 and low-stock warning is active.' };
  });

  await step('11_employee_cannot_manage_inventory', async () => {
    const denied = await employeeSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 99 },
      retry: false,
    });
    assert(denied.status === 403, `EMPLOYEE_WRITE_WAS_NOT_DENIED_${denied.status}`);
    return { status: denied.status, detail: 'Employee owner-only inventory write correctly blocked.' };
  });

  const conversation = await step('12_start_customer_conversation', async () => {
    const result = await ownerSession.request('/api/start-conversation', {
      method: 'POST',
      body: { business_id: businessId, display_name: 'AI Journey Customer' },
    });
    assert(result.ok && result.json?.ok && result.json?.conversation?.id, `CONVERSATION_START_FAILED_${result.status}:${small(result.text)}`);
    conversationId = result.json.conversation.id;
    customerId = result.json.customer?.id;
    assert(customerId, 'CUSTOMER_ID_MISSING');
    return { status: result.status, detail: 'Real web customer and conversation persisted.' };
  });
  if (!conversation) throw new Error('FATAL_CONVERSATION_START_FAILED');

  await step('13_customer_to_ai_reply_loop', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'مرحبا، هل المنتج متوفر وما سعره؟' },
    });
    assert(result.ok && result.json?.ok, `CUSTOMER_CHAT_FAILED_${result.status}:${small(result.text)}`);
    assert(result.json?.customer_message?.sender_type === 'customer', 'CUSTOMER_MESSAGE_NOT_PERSISTED');
    assert(result.json?.ai_message?.sender_type === 'ai', 'AI_REPLY_MISSING');
    return { status: result.status, detail: `AI replied and persisted: ${small(result.json.ai_message.body, 120)}` };
  });

  await step('14_employee_takes_over_conversation', async () => {
    const takeover = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'takeover', business_id: businessId, conversation_id: conversationId },
    });
    assert(takeover.ok && takeover.json?.ok, `TAKEOVER_FAILED_${takeover.status}:${small(takeover.text)}`);
    const state = await runtime(employeeSession, businessId, conversationId, false);
    const current = (state.json?.conversations || []).find(item => item.id === conversationId);
    assert(current?.state === 'human_active', `TAKEOVER_STATE_INVALID_${current?.state}`);
    return { status: takeover.status, detail: 'Employee takeover switched conversation to human_active.' };
  });

  await step('15_customer_message_during_human_takeover_suppresses_ai', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'ممكن أحد من الفريق يرد علي؟' },
    });
    assert(result.ok && result.json?.ok, `HUMAN_ACTIVE_CUSTOMER_MESSAGE_FAILED_${result.status}:${small(result.text)}`);
    assert(result.json?.human_takeover === true && result.json?.ai_message == null, 'AI_WAS_NOT_SUPPRESSED_DURING_HUMAN_TAKEOVER');
    return { status: result.status, detail: 'Customer message persisted while AI correctly stayed silent.' };
  });

  await step('16_employee_human_reply_is_attributed', async () => {
    const result = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'human_message', business_id: businessId, conversation_id: conversationId, message: 'ياهلا، معك موظف الفريق. المنتج متوفر وسأتابع معك.' },
    });
    assert(result.ok && result.json?.ok, `HUMAN_REPLY_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(employeeSession, businessId, conversationId, false);
    const human = (state.json?.messages || []).filter(item => item.sender_type === 'human').at(-1);
    assert(human?.sender_type === 'human', 'HUMAN_REPLY_NOT_ATTRIBUTED');
    return { status: result.status, detail: 'Human reply persisted as sender_type=human.' };
  });

  await step('17_employee_returns_conversation_to_ai', async () => {
    const result = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'return_to_ai', business_id: businessId, conversation_id: conversationId },
    });
    assert(result.ok && result.json?.ok, `RETURN_TO_AI_FAILED_${result.status}:${small(result.text)}`);
    return { status: result.status, detail: 'Conversation returned to DABBIR AI.' };
  });

  await step('18_ai_resumes_after_human_return', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'تمام، كمل معي دبر.' },
    });
    assert(result.ok && result.json?.ok && result.json?.ai_message?.sender_type === 'ai', `AI_DID_NOT_RESUME_${result.status}:${small(result.text)}`);
    const state = await runtime(ownerSession, businessId, conversationId, false);
    const kinds = new Set((state.json?.messages || []).map(item => item.sender_type));
    assert(kinds.has('customer') && kinds.has('ai') && kinds.has('human'), 'MESSAGE_PARTICIPANT_TYPES_INCOMPLETE');
    return { status: result.status, detail: 'AI resumed; customer, AI, and human messages all remain attributed.' };
  });

  await step('19_create_future_appointment', async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: { action: 'create_appointment', business_id: businessId, customer_id: customerId, customer_name: 'AI Journey Customer', starts_at: startsAt },
    });
    assert(result.ok && result.json?.ok, `APPOINTMENT_CREATE_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(ownerSession, businessId, conversationId, false);
    assert((state.json?.appointments || []).some(item => item.customer_id === customerId), 'APPOINTMENT_NOT_VISIBLE');
    return { status: result.status, detail: 'Future appointment persisted.' };
  });

  await step('20_create_followup', async () => {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: { action: 'create_followup', business_id: businessId, conversation_id: conversationId, reason: 'ai_full_journey_followup', due_at: dueAt },
    });
    assert(result.ok && result.json?.ok, `FOLLOWUP_CREATE_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(ownerSession, businessId, conversationId, false);
    assert((state.json?.followups || []).some(item => item.conversation_id === conversationId), 'FOLLOWUP_NOT_VISIBLE');
    return { status: result.status, detail: 'Follow-up persisted for current conversation.' };
  });

  let orderId = null;
  await step('21_seed_isolated_order_fixture', async () => {
    const result = await qaControl('dabbir_ai_qa_seed_order', { business_id: businessId, customer_id: customerId });
    orderId = result.json?.order?.id;
    assert(orderId, 'QA_ORDER_ID_MISSING');
    return { status: result.status, detail: 'Order fixture created only inside the disposable QA business.' };
  });

  await step('22_owner_confirms_order_and_sales_metric', async () => {
    const result = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'update_order_status', business_id: businessId, order_id: orderId, status: 'confirmed' },
    });
    assert(result.ok && result.json?.ok, `ORDER_CONFIRM_FAILED_${result.status}:${small(result.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    const order = (listing.json?.orders || []).find(item => item.id === orderId);
    assert(order?.status === 'confirmed', 'ORDER_STATUS_NOT_CONFIRMED');
    assert(Number(listing.json?.metrics?.recognized_sales_aed) >= 125, 'RECOGNIZED_SALES_METRIC_MISSING');
    return { status: result.status, detail: 'Order confirmed and recognized sales includes AED 125.' };
  });

  await step('23_mobile_webkit_ui_customer_owner_journey', browserJourney);

  await step('24_employee_logout_and_session_revocation', async () => {
    const logout = await employeeSession.request('/api/auth/logout', { method: 'POST', body: {} });
    assert(logout.ok, `EMPLOYEE_LOGOUT_FAILED_${logout.status}`);
    const after = await runtime(employeeSession, businessId, null, true);
    assert(after.status === 401, `EMPLOYEE_SESSION_STILL_ACTIVE_${after.status}`);
    return { status: logout.status, detail: 'Employee logout invalidated production session.' };
  });

  await step('25_owner_logout_and_session_revocation', async () => {
    const logout = await ownerSession.request('/api/auth/logout', { method: 'POST', body: {} });
    assert(logout.ok, `OWNER_LOGOUT_FAILED_${logout.status}`);
    const after = await runtime(ownerSession, businessId, null, true);
    assert(after.status === 401, `OWNER_SESSION_STILL_ACTIVE_${after.status}`);
    return { status: logout.status, detail: 'Owner logout invalidated production session.' };
  });
}

let fatal = null;
try {
  await runJourney();
} catch (error) {
  fatal = error;
  report.required_failures += 1;
  report.steps.push({
    name: 'fatal_journey_abort',
    required: true,
    status: 'FAIL',
    duration_ms: 0,
    http_status: null,
    detail: small(error?.stack || error?.message || error),
  });
  console.error(`FATAL ${small(error?.message || error)}`);
} finally {
  if (browserContext) await browserContext.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});

  if (owner?.id || employee?.id || businessId) {
    try {
      const result = await qaControl('dabbir_ai_qa_cleanup', {
        business_id: businessId,
        owner_user_id: owner?.id || null,
        employee_user_id: employee?.id || null,
      });
      report.cleanup.push({ item: 'qa_scope', status: 'PASS', http_status: result.status, detail: 'Disposable QA business and auth users removed.' });
    } catch (error) {
      report.cleanup.push({ item: 'qa_scope', status: 'FAIL', detail: small(error?.message || error) });
      report.required_failures += 1;
    }
  }

  report.completed_at = new Date().toISOString();
  report.verdict = report.required_failures === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nDABBIR AI FULL CUSTOMER JOURNEY: ${report.verdict}`);
  console.log(`Report: ${REPORT_PATH}`);
}

if (report.required_failures > 0 || fatal) process.exitCode = 1;
