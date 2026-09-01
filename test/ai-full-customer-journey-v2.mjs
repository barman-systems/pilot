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
  journey: 'DABBIR_AI_FULL_CUSTOMER_JOURNEY_V2_MFA',
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
let productId = null;
let orderId = null;
let browser = null;
let browserContext = null;
let mfaFactorId = null;
let mfaSecret = null;

function redact(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text
    .replace(/dabbir-qa-(owner|employee)-[^@\s]+@example\.com/gi, '[QA_EMAIL]')
    .replace(/Dabbir-QA-[A-Za-z0-9_!\-]+/g, '[QA_PASSWORD]')
    .replace(/eyJ[A-Za-z0-9._-]{30,}/g, '[JWT_REDACTED]');
}

function small(value, max = 520) {
  const text = redact(value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function assert(condition, message = 'ASSERTION_FAILED') {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(secret || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  assert(normalized.length >= 16, 'TOTP_SECRET_INVALID');
  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    assert(value >= 0, 'TOTP_SECRET_INVALID');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timeMs = Date.now()) {
  const counter = BigInt(Math.floor(timeMs / 1000 / 30));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) >>> 0;
  return String(binary % 1_000_000).padStart(6, '0');
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
      last = await parseResponse(await fetch(url, { redirect: 'follow', ...options }));
      if (![429, 502, 503, 504].includes(last.status) || attempt === attempts) return last;
    } catch (error) {
      last = { response: null, status: 0, ok: false, json: null, text: String(error?.message || error) };
      if (attempt === attempts) return last;
    }
    await sleep(600 * attempt);
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
    const rows = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const row of rows) {
      const pair = String(row).split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value) this.cookies.set(key, value); else this.cookies.delete(key);
    }
  }

  accessToken() {
    const raw = this.cookies.get('__Host-dabbir_access') || '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  aal() {
    return decodeJwtPayload(this.accessToken())?.aal || null;
  }

  async request(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
    const upper = String(method).toUpperCase();
    const requestHeaders = { accept: 'application/json', ...headers };
    if (!['GET', 'HEAD'].includes(upper)) requestHeaders.origin = ORIGIN;
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
  const result = await rawFetch(QA_CONTROL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await getGitHubOidcToken()}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action, run_id: RUN_ID, ...body }),
  }, false);
  assert(result.ok && result.json?.ok, `QA_CONTROL_${action}_FAILED_${result.status}:${small(result.text)}`);
  return result;
}

async function login(session, identity) {
  const result = await session.request('/api/auth/login', {
    method: 'POST',
    body: { email: identity.email, password: identity.password },
  });
  assert(result.ok && result.json?.ok, `LOGIN_FAILED_${result.status}:${small(result.text)}`);
  assert(session.accessToken(), 'LOGIN_SESSION_COOKIE_MISSING');
  return result;
}

async function runtime(session, business = null, conversation = null, summary = false) {
  const query = new URLSearchParams();
  if (business) query.set('business_id', business);
  if (conversation) query.set('conversation_id', conversation);
  if (summary) query.set('summary', '1');
  return session.request(`/api/dabbir-runtime-fast${query.size ? `?${query}` : ''}`);
}

async function waitForMfaEnrollment(session) {
  let last = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    last = await session.request('/api/auth/mfa-enroll', { method: 'POST', body: {}, retry: false });
    if (last.status !== 404) return last;
    console.log(`WAIT mfa-enroll deployment (${attempt}/30)`);
    await sleep(4000);
  }
  return last;
}

async function verifyTotp(session, factorId, secret) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const code = totp(secret);
    last = await session.request('/api/auth/mfa-verify', {
      method: 'POST',
      body: { factor_id: factorId, code },
      retry: false,
    });
    if (last.ok) return last;
    if (last.status !== 400 || !['MFA_VERIFY_FAILED', 'MFA_CHALLENGE_FAILED'].includes(String(last.json?.error || ''))) return last;
    await sleep(1200);
  }
  return last;
}

async function browserJourney() {
  assert(mfaSecret, 'BROWSER_MFA_SECRET_REQUIRED');
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

  await page.locator('#mfaContinuation:not(.hidden)').waitFor({ state: 'visible', timeout: 20_000 });
  assert(await page.locator('body').getAttribute('data-dabbir-auth-stage') === 'mfa_required', 'BROWSER_MFA_STAGE_NOT_REQUIRED');
  const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (secondsRemaining <= 4) await sleep((secondsRemaining + 1) * 1000);
  await page.locator('#mfaCode').fill(totp(mfaSecret));
  await page.locator('#mfaSubmit').click();

  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible', timeout: 25_000 });
  await page.waitForFunction(() => document.body.dataset.dabbirAuthStage === 'workspace_ready', null, { timeout: 10_000 });
  // The unauthenticated bootstrap intentionally receives one 401 to reveal the login gate.
  // From this point onward, every page/console error is unexpected and remains fatal.
  pageErrors.length = 0;
  consoleErrors.length = 0;
  assert((await page.locator('#workspaceName').textContent())?.includes(RUN_LABEL), 'BROWSER_WORKSPACE_MISMATCH');

  const logo = page.locator('#appShell:not(.hidden) .brand .logo').first();
  await logo.waitFor({ state: 'visible', timeout: 10_000 });
  assert(String(await logo.evaluate(el => getComputedStyle(el).backgroundImage)).includes('dabbir-app-icon'), 'BROWSER_APPROVED_LOGO_MISSING');

  await page.locator('#bottomNav [data-screen="conversations"]').click();
  await page.locator('#screen-conversations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_MISSING');

  const mobileMenuState = await page.locator('#menuBtn').evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      pointer_events: style.pointerEvents,
      position: style.position,
      opacity: style.opacity,
      disabled: element.disabled,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      top_visible: document.elementFromPoint(Math.max(0, rect.left + 4), Math.max(0, rect.top + 4))?.id || null,
    };
  });
  console.log(`DABBIR_MOBILE_MENU_STATE=${JSON.stringify(mobileMenuState)}`);
  assert(mobileMenuState.display !== 'none' && mobileMenuState.visibility !== 'hidden' && mobileMenuState.width >= 40 && mobileMenuState.height >= 40, `BROWSER_MOBILE_MENU_NOT_ACTIONABLE_${JSON.stringify(mobileMenuState)}`);
  // WebKit can keep its locator actionability probe pending despite the element
  // being measured as visible, enabled, unobscured, and touch-sized above.
  // Click the confirmed centre point through the device input channel; the
  // following assertion proves the real menu handler opens the owner navigation.
  await page.mouse.click(mobileMenuState.left + (mobileMenuState.width / 2), mobileMenuState.top + (mobileMenuState.height / 2));
  await page.locator('#side.open').waitFor({ state: 'visible', timeout: 10_000 });
  const openedSidebarState = await page.evaluate(() => {
    const side = document.querySelector('#side.open');
    const nav = document.querySelector('#side.open [data-screen="operations"]');
    const sideRect = side?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    return {
      transform: side ? getComputedStyle(side).transform : null,
      transition: side ? getComputedStyle(side).transition : null,
      side_left: sideRect ? Math.round(sideRect.left) : null,
      side_right: sideRect ? Math.round(sideRect.right) : null,
      nav_left: navRect ? Math.round(navRect.left) : null,
      nav_right: navRect ? Math.round(navRect.right) : null,
      viewport_width: window.innerWidth,
    };
  });
  console.log(`DABBIR_MOBILE_OPEN_SIDEBAR_STATE=${JSON.stringify(openedSidebarState)}`);
  assert(openedSidebarState.nav_left !== null && openedSidebarState.nav_left >= 0 && openedSidebarState.nav_right <= openedSidebarState.viewport_width, `BROWSER_SIDEBAR_NOT_REACHABLE_${JSON.stringify(openedSidebarState)}`);
  const visibleOperationsNav = page.locator('#side.open [data-screen="operations"]:visible');
  const visibleOperationsCount = await visibleOperationsNav.count();
  assert(visibleOperationsCount === 1, `BROWSER_VISIBLE_OPERATIONS_NAV_COUNT_${visibleOperationsCount}`);
  const operationsNavState = await page.evaluate(() => {
    const element = document.querySelector('#side.open [data-screen="operations"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      centre_hits_target: hit === element || element.contains(hit),
    };
  });
  console.log(`DABBIR_MOBILE_OPERATIONS_NAV_STATE=${JSON.stringify(operationsNavState)}`);
  assert(operationsNavState && operationsNavState.display !== 'none' && operationsNavState.visibility !== 'hidden' && operationsNavState.width >= 40 && operationsNavState.height >= 40 && operationsNavState.centre_hits_target, `BROWSER_OPERATIONS_NAV_NOT_ACTIONABLE_${JSON.stringify(operationsNavState)}`);
  // Verify the DOM event and immediate state transition atomically. This avoids
  // a WebKit locator round-trip observing a transiently replaced sidebar node.
  const operationsTransition = await page.evaluate(() => {
    const target = document.querySelector('#side.open [data-screen="operations"]');
    target?.click();
    const screen = document.querySelector('#screen-operations');
    return {
      target_found: Boolean(target),
      active: screen?.classList.contains('active') === true,
      side_open: document.querySelector('#side')?.classList.contains('open') === true,
    };
  });
  console.log(`DABBIR_MOBILE_OPERATIONS_TRANSITION=${JSON.stringify(operationsTransition)}`);
  assert(operationsTransition.target_found && operationsTransition.active && !operationsTransition.side_open, `BROWSER_OPERATIONS_TRANSITION_FAILED_${JSON.stringify(operationsTransition)}`);
  let operationsText = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    operationsText = await page.evaluate(() => String(document.querySelector('#opsBody')?.textContent || ''));
    if (operationsText.includes('AI Journey Product')) break;
    await page.waitForTimeout(500);
  }
  assert(operationsText.includes('AI Journey Product'), 'BROWSER_PRODUCT_MISSING');

  await page.screenshot({ path: 'dabbir-ai-customer-journey-screenshot.png', fullPage: true });
  report.artifacts.screenshot = 'dabbir-ai-customer-journey-screenshot.png';
  assert(pageErrors.length === 0, `BROWSER_PAGE_ERRORS:${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `BROWSER_CONSOLE_ERRORS:${consoleErrors.slice(0, 5).join(' | ')}`);
  return { detail: 'WebKit iPhone-size journey completed password + TOTP MFA, then rendered owner workspace, conversation, product, and approved DABBIR identity.' };
}

async function runJourney() {
  const publicSurface = await step('01_public_production_surface', async () => {
    const [home, icon] = await Promise.all([
      rawFetch(ORIGIN, { headers: { accept: 'text/html' } }),
      rawFetch(`${ORIGIN}/api/dabbir-approved-icon`, { headers: { accept: 'image/png' } }),
    ]);
    assert(home.ok && /DABBIR/i.test(home.text), `HOME_INVALID_${home.status}`);
    assert(icon.ok, `ICON_INVALID_${icon.status}`);
    return { status: home.status, detail: 'Production DABBIR home and approved icon are reachable.' };
  });
  if (!publicSurface) throw new Error('FATAL_PUBLIC_SURFACE_FAILED');

  const oidc = await step('02_github_oidc_identity', async () => {
    await getGitHubOidcToken();
    return { detail: 'GitHub issued a short-lived OIDC identity for the exact QA workflow.' };
  });
  if (!oidc) throw new Error('FATAL_OIDC_FAILED');

  const bootstrap = await step('03_create_disposable_owner_and_employee', async () => {
    const result = await qaControl('dabbir_ai_qa_bootstrap');
    owner = result.json?.identities?.owner;
    employee = result.json?.identities?.employee;
    assert(owner?.id && owner?.email && owner?.password, 'QA_OWNER_MISSING');
    assert(employee?.id && employee?.email && employee?.password, 'QA_EMPLOYEE_MISSING');
    return { status: result.status, detail: 'Two disposable email-confirmed QA identities created.' };
  });
  if (!bootstrap) throw new Error('FATAL_QA_BOOTSTRAP_FAILED');

  const ownerLogin = await step('04_owner_real_login', async () => {
    const result = await login(ownerSession, owner);
    assert(ownerSession.aal() === 'aal1', `EXPECTED_INITIAL_AAL1_GOT_${ownerSession.aal()}`);
    return { status: result.status, detail: 'Owner logged in through production auth at AAL1.' };
  });
  if (!ownerLogin) throw new Error('FATAL_OWNER_LOGIN_FAILED');

  await step('05_fresh_owner_onboarding_state', async () => {
    const result = await runtime(ownerSession, null, null, true);
    assert(result.ok && result.json?.authenticated === true, `RUNTIME_AUTH_FAILED_${result.status}`);
    assert(result.json?.needs_onboarding === true, 'NEW_OWNER_SHOULD_NEED_ONBOARDING');
    return { status: result.status, detail: 'Fresh owner correctly requires onboarding.' };
  });

  const business = await step('06_create_isolated_business', async () => {
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: { action: 'create_business', name: RUN_LABEL, business_type: 'store', locale: 'ar-AE' },
    });
    assert(result.ok && result.json?.business_id, `BUSINESS_CREATE_FAILED_${result.status}:${small(result.text)}`);
    businessId = result.json.business_id;
    const verify = await runtime(ownerSession, businessId, null, true);
    assert(verify.ok && verify.json?.business?.id === businessId, 'BUSINESS_NOT_PERSISTED');
    assert(String(verify.json?.membership?.role).toLowerCase() === 'owner', 'OWNER_MEMBERSHIP_MISSING');
    return { status: result.status, detail: 'QA business persisted with owner membership.' };
  });
  if (!business) throw new Error('FATAL_BUSINESS_CREATE_FAILED');

  const enrolled = await step('07_owner_enrolls_totp_mfa', async () => {
    const result = await waitForMfaEnrollment(ownerSession);
    assert(result?.ok && result.json?.ok, `MFA_ENROLL_FAILED_${result?.status}:${small(result?.text)}`);
    mfaFactorId = result.json.factor_id;
    mfaSecret = result.json?.totp?.secret;
    assert(mfaFactorId && mfaSecret, 'MFA_FACTOR_OR_SECRET_MISSING');
    return { status: result.status, detail: 'Owner enrolled a real TOTP factor; secret is intentionally omitted from evidence.' };
  });
  if (!enrolled) throw new Error('FATAL_MFA_ENROLL_FAILED');

  const elevated = await step('08_owner_verifies_totp_and_reaches_aal2', async () => {
    const result = await verifyTotp(ownerSession, mfaFactorId, mfaSecret);
    assert(result?.ok && result.json?.ok && result.json?.aal === 'aal2', `MFA_VERIFY_FAILED_${result?.status}:${small(result?.text)}`);
    assert(ownerSession.aal() === 'aal2', `SESSION_NOT_AAL2_${ownerSession.aal()}`);
    return { status: result.status, detail: 'TOTP challenge verified and owner session JWT is AAL2.' };
  });
  if (!elevated) throw new Error('FATAL_MFA_ELEVATION_FAILED');

  let inviteToken = null;
  const invited = await step('09_owner_invites_employee_once', async () => {
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
    return { status: result.status, detail: 'AAL2 owner created a one-time employee invitation.' };
  });
  if (!invited) throw new Error('FATAL_EMPLOYEE_INVITE_FAILED');

  const employeeAccepted = await step('10_employee_login_accepts_invite_once', async () => {
    await login(employeeSession, employee);
    const accept = await employeeSession.request('/api/team/accept-invite', { method: 'POST', body: { token: inviteToken } });
    assert(accept.ok && accept.json?.invitation_consumed === true, `INVITE_ACCEPT_FAILED_${accept.status}:${small(accept.text)}`);
    const verify = await runtime(employeeSession, businessId, null, true);
    assert(verify.ok && String(verify.json?.membership?.role).toLowerCase() === 'employee', 'EMPLOYEE_MEMBERSHIP_NOT_ACTIVE');
    return { status: accept.status, detail: 'Employee accepted once and now has permanent membership.' };
  });
  if (!employeeAccepted) throw new Error('FATAL_EMPLOYEE_ACCEPTANCE_FAILED');

  await step('11_owner_creates_product_and_inventory', async () => {
    const sku = `QA-${RUN_ID}`.slice(0, 70);
    const create = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'create_product', business_id: businessId, sku, name: 'AI Journey Product', price_aed: 49.5, quantity: 8 },
    });
    assert(create.ok && create.json?.ok, `PRODUCT_CREATE_FAILED_${create.status}:${small(create.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    const product = (listing.json?.products || []).find(item => item.sku === sku);
    assert(product?.id && Number(product.quantity) === 8, 'PRODUCT_OR_INVENTORY_MISMATCH');
    productId = product.id;
    return { status: create.status, detail: 'Product created with quantity 8.' };
  });

  await step('12_low_stock_updates_immediately', async () => {
    assert(productId, 'PRODUCT_ID_REQUIRED');
    const update = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 3 },
    });
    assert(update.ok, `INVENTORY_UPDATE_FAILED_${update.status}:${small(update.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    const product = (listing.json?.products || []).find(item => item.id === productId);
    assert(Number(product?.quantity) === 3 && product?.low_stock === true, 'LOW_STOCK_STATE_WRONG');
    return { status: update.status, detail: 'Inventory changed to 3 and low-stock state became true.' };
  });

  await step('13_employee_owner_operation_denied', async () => {
    const denied = await employeeSession.request('/api/owner-operations', {
      method: 'POST',
      retry: false,
      body: { action: 'set_inventory', business_id: businessId, product_id: productId, quantity: 99 },
    });
    assert(denied.status === 403, `EMPLOYEE_WRITE_NOT_DENIED_${denied.status}`);
    return { status: denied.status, detail: 'Employee cannot mutate owner-only inventory.' };
  });

  const conversation = await step('14_customer_conversation_created', async () => {
    const result = await ownerSession.request('/api/start-conversation', {
      method: 'POST',
      body: { business_id: businessId, display_name: 'AI Journey Customer' },
    });
    assert(result.ok && result.json?.conversation?.id && result.json?.customer?.id, `CONVERSATION_CREATE_FAILED_${result.status}:${small(result.text)}`);
    conversationId = result.json.conversation.id;
    customerId = result.json.customer.id;
    return { status: result.status, detail: 'Web customer and conversation persisted.' };
  });
  if (!conversation) throw new Error('FATAL_CONVERSATION_CREATE_FAILED');

  await step('15_customer_message_gets_ai_reply', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'مرحبا، هل المنتج متوفر وما سعره؟' },
    });
    assert(result.ok && result.json?.customer_message?.sender_type === 'customer', `CUSTOMER_MESSAGE_FAILED_${result.status}:${small(result.text)}`);
    assert(result.json?.ai_message?.sender_type === 'ai', 'AI_REPLY_MISSING');
    return { status: result.status, detail: `AI reply persisted: ${small(result.json.ai_message.body, 120)}` };
  });

  await step('16_employee_human_takeover', async () => {
    const result = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'takeover', business_id: businessId, conversation_id: conversationId },
    });
    assert(result.ok, `TAKEOVER_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(employeeSession, businessId, conversationId, false);
    const current = (state.json?.conversations || []).find(item => item.id === conversationId);
    assert(current?.state === 'human_active', `TAKEOVER_STATE_${current?.state}`);
    return { status: result.status, detail: 'Employee takeover moved conversation to human_active.' };
  });

  await step('17_ai_silent_during_human_takeover', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'ممكن أحد من الفريق يرد علي؟' },
    });
    assert(result.ok && result.json?.human_takeover === true && result.json?.ai_message == null, `AI_NOT_SUPPRESSED_${result.status}:${small(result.text)}`);
    return { status: result.status, detail: 'Customer message persisted while AI stayed silent during human ownership.' };
  });

  await step('18_employee_human_reply_persists', async () => {
    const result = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'human_message', business_id: businessId, conversation_id: conversationId, message: 'ياهلا، معك موظف الفريق. المنتج متوفر وسأتابع معك.' },
    });
    assert(result.ok, `HUMAN_REPLY_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(employeeSession, businessId, conversationId, false);
    assert((state.json?.messages || []).some(item => item.sender_type === 'human'), 'HUMAN_REPLY_NOT_PERSISTED');
    return { status: result.status, detail: 'Human response persisted with human attribution.' };
  });

  await step('19_return_conversation_to_ai', async () => {
    const result = await employeeSession.request('/api/chat-control', {
      method: 'POST',
      body: { action: 'return_to_ai', business_id: businessId, conversation_id: conversationId },
    });
    assert(result.ok, `RETURN_TO_AI_FAILED_${result.status}:${small(result.text)}`);
    return { status: result.status, detail: 'Employee explicitly returned conversation to AI.' };
  });

  await step('20_ai_resumes_after_return', async () => {
    const result = await ownerSession.request('/api/chat-customer', {
      method: 'POST',
      body: { business_id: businessId, conversation_id: conversationId, message: 'تمام، كمل معي دبر.' },
    });
    assert(result.ok && result.json?.ai_message?.sender_type === 'ai', `AI_RESUME_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(ownerSession, businessId, conversationId, false);
    const senders = new Set((state.json?.messages || []).map(item => item.sender_type));
    assert(['customer', 'ai', 'human'].every(kind => senders.has(kind)), 'CHAT_HISTORY_INCOMPLETE');
    return { status: result.status, detail: 'AI resumed and customer/AI/human history remains intact.' };
  });

  await step('21_store_appointment_guard_enforced', async () => {
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: {
        action: 'create_appointment',
        business_id: businessId,
        customer_id: customerId,
        customer_name: 'AI Journey Customer',
        starts_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      },
      retry: false,
    });
    assert(result.status === 400, `STORE_APPOINTMENT_SHOULD_BE_REJECTED_${result.status}:${small(result.text)}`);
    assert(result.json?.ok === false && result.json?.error === 'APPOINTMENT_CREATE_FAILED', `STORE_APPOINTMENT_REJECTION_WRONG:${small(result.text)}`);
    assert(result.json?.external_side_effects === false, 'STORE_APPOINTMENT_REJECTION_SIDE_EFFECT_UNCLEAR');
    const state = await runtime(ownerSession, businessId, conversationId, false);
    assert(!(state.json?.appointments || []).some(item => item.customer_id === customerId), 'STORE_APPOINTMENT_UNEXPECTEDLY_PERSISTED');
    return { status: result.status, detail: 'Store appointment was intentionally rejected; the activity-type rule is enforced without persistence.' };
  });

  await step('22_followup_persists', async () => {
    const result = await ownerSession.request('/api/dabbir-runtime-fast', {
      method: 'POST',
      body: {
        action: 'create_followup',
        business_id: businessId,
        conversation_id: conversationId,
        reason: 'ai_full_journey_followup',
        due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      },
    });
    assert(result.ok && result.json?.ok, `FOLLOWUP_FAILED_${result.status}:${small(result.text)}`);
    const state = await runtime(ownerSession, businessId, conversationId, false);
    assert((state.json?.followups || []).some(item => item.conversation_id === conversationId), 'FOLLOWUP_NOT_VISIBLE');
    return { status: result.status, detail: 'Follow-up persisted for current customer conversation.' };
  });

  await step('23_seed_order_inside_isolated_qa_tenant', async () => {
    const result = await qaControl('dabbir_ai_qa_seed_order', { business_id: businessId, customer_id: customerId });
    orderId = result.json?.order?.id;
    assert(orderId, 'QA_ORDER_ID_MISSING');
    return { status: result.status, detail: 'OIDC QA control created one real isolated order fixture at AED 125.' };
  });

  await step('24_owner_confirms_order_and_sales_metric', async () => {
    const update = await ownerSession.request('/api/owner-operations', {
      method: 'POST',
      body: { action: 'update_order_status', business_id: businessId, order_id: orderId, status: 'confirmed' },
    });
    assert(update.ok, `ORDER_CONFIRM_FAILED_${update.status}:${small(update.text)}`);
    const listing = await ownerSession.request(`/api/owner-operations?business_id=${encodeURIComponent(businessId)}`);
    const order = (listing.json?.orders || []).find(item => item.id === orderId);
    assert(order?.status === 'confirmed', 'ORDER_NOT_CONFIRMED');
    assert(Number(listing.json?.metrics?.recognized_sales_aed) >= 125, 'RECOGNIZED_SALES_METRIC_MISSING');
    return { status: update.status, detail: 'Order confirmed and recognized-sales metric includes AED 125.' };
  });

  await step('24b_authenticated_translation_fallback', async () => {
    const original = 'مرحبا، المنتج متوفر اليوم';
    const result = await ownerSession.request('/api/translate', {
      method: 'POST',
      body: {
        business_id: businessId,
        targetLanguage: 'en',
        messages: [{ id: 'qa-translation', text: original }],
      },
    });
    const translated = String(result.json?.translations?.[0]?.text || '').trim();
    assert(result.ok && result.json?.ok, `TRANSLATION_FAILED_${result.status}:${small(result.text)}`);
    assert(result.json?.service === 'dabbir-translation', 'TRANSLATION_SERVICE_IDENTITY_WRONG');
    assert(result.json?.original_preserved === true, 'TRANSLATION_ORIGINAL_PRESERVATION_MISSING');
    assert(translated && translated !== original && /[A-Za-z]/.test(translated), 'TRANSLATION_OUTPUT_INVALID');
    return {
      status: result.status,
      detail: `Authenticated translation succeeded via ${result.json?.model || 'unknown-model'}${result.json?.fallback_used ? ' fallback' : ''}.`,
    };
  });

  await step('25_mobile_webkit_owner_journey', browserJourney);

  await step('26_employee_logout_invalidates_session', async () => {
    const logout = await employeeSession.request('/api/auth/logout', { method: 'POST', body: {} });
    assert(logout.ok, `EMPLOYEE_LOGOUT_FAILED_${logout.status}`);
    const after = await runtime(employeeSession, businessId, null, true);
    assert(after.status === 401, `EMPLOYEE_SESSION_STILL_ACTIVE_${after.status}`);
    return { status: logout.status, detail: 'Employee session is invalid after logout.' };
  });

  await step('27_owner_logout_invalidates_session', async () => {
    const logout = await ownerSession.request('/api/auth/logout', { method: 'POST', body: {} });
    assert(logout.ok, `OWNER_LOGOUT_FAILED_${logout.status}`);
    const after = await runtime(ownerSession, businessId, null, true);
    assert(after.status === 401, `OWNER_SESSION_STILL_ACTIVE_${after.status}`);
    return { status: logout.status, detail: 'Owner session is invalid after logout.' };
  });
}

try {
  await runJourney();
} catch (error) {
  report.required_failures += 1;
  console.error(`FATAL ${small(error?.stack || error?.message || error)}`);
} finally {
  if (browserContext) await browserContext.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});

  if (owner?.id || employee?.id || businessId) {
    try {
      const result = await qaControl('dabbir_ai_qa_cleanup', {
        business_id: businessId || undefined,
        owner_user_id: owner?.id || undefined,
        employee_user_id: employee?.id || undefined,
      });
      report.cleanup.push({ item: 'qa_tenant_and_auth_users', status: 'PASS', http_status: result.status, detail: 'QA business data and disposable identities deleted.' });
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