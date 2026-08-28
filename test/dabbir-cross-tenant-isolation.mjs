import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('PRODUCTION_ORIGIN_REQUIRED');
const PROJECT_REF = String(process.env.SUPABASE_PROJECT_REF || 'spohjzrsymsmzsseygtw').trim();
const QA_CONTROL_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const OIDC_AUDIENCE = 'dabbir-ai-qa';
const REPORT_PATH = process.env.ISOLATION_REPORT_PATH || 'dabbir-cross-tenant-isolation-report.json';
const RUN_BASE = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const RUN_A = `${RUN_BASE}-a`;
const RUN_B = `${RUN_BASE}-b`;
const LABEL_A = `DABBIR AI QA ${RUN_A}`;
const LABEL_B = `DABBIR AI QA ${RUN_B}`;

const report = {
  test: 'DABBIR_CROSS_TENANT_AND_WHATSAPP_ISOLATION_V1',
  started_at: new Date().toISOString(),
  completed_at: null,
  verdict: 'RUNNING',
  required_failures: 0,
  checks: [],
  cleanup: [],
};

let oidcToken = null;
let qaA = null;
let qaB = null;
let businessA = null;
let businessB = null;

function assert(condition, message = 'ASSERTION_FAILED') {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message || error || 'UNKNOWN_ERROR').replace(/eyJ[A-Za-z0-9._-]{30,}/g, '[JWT_REDACTED]').slice(0, 400);
}

async function parseResponse(response) {
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { response, status: response.status, ok: response.ok, json, text };
}

async function rawFetch(url, options = {}) {
  try {
    return await parseResponse(await fetch(url, { redirect: 'follow', ...options }));
  } catch (error) {
    return { response: null, status: 0, ok: false, json: null, text: safeError(error) };
  }
}

async function check(name, fn) {
  const started = Date.now();
  const row = { name, status: 'RUNNING', duration_ms: null, http_status: null, detail: null };
  report.checks.push(row);
  try {
    const result = await fn();
    row.status = 'PASS';
    row.duration_ms = Date.now() - started;
    row.http_status = result?.status ?? null;
    row.detail = result?.detail || null;
    console.log(`PASS ${name} (${row.duration_ms}ms)${row.detail ? ` — ${row.detail}` : ''}`);
    return result;
  } catch (error) {
    row.status = 'FAIL';
    row.duration_ms = Date.now() - started;
    row.detail = safeError(error);
    report.required_failures += 1;
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

  async request(path, { method = 'GET', body } = {}) {
    const upper = String(method).toUpperCase();
    const headers = { accept: 'application/json' };
    if (!['GET', 'HEAD'].includes(upper)) headers.origin = ORIGIN;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    const result = await rawFetch(`${ORIGIN}${path}`, {
      method: upper,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.captureCookies(result.response);
    return result;
  }
}

const sessionA = new Session('owner-a');
const sessionB = new Session('owner-b');

async function getGitHubOidcToken() {
  if (oidcToken) return oidcToken;
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '').trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();
  assert(requestUrl && requestToken, 'GITHUB_ACTIONS_OIDC_CONTEXT_REQUIRED');
  const separator = requestUrl.includes('?') ? '&' : '?';
  const result = await rawFetch(`${requestUrl}${separator}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
  });
  assert(result.ok && result.json?.value, `GITHUB_OIDC_ISSUE_FAILED_${result.status}`);
  oidcToken = String(result.json.value);
  return oidcToken;
}

async function qaControl(action, runId, body = {}) {
  const result = await rawFetch(QA_CONTROL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await getGitHubOidcToken()}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action, run_id: runId, ...body }),
  });
  assert(result.ok && result.json?.ok, `QA_CONTROL_${action}_FAILED_${result.status}`);
  return result;
}

async function login(session, identity) {
  const result = await session.request('/api/auth/login', {
    method: 'POST',
    body: { email: identity.email, password: identity.password },
  });
  assert(result.ok && result.json?.ok, `LOGIN_FAILED_${session.label}_${result.status}`);
  return result;
}

async function createBusiness(session, label) {
  const result = await session.request('/api/dabbir-runtime-fast', {
    method: 'POST',
    body: { action: 'create_business', name: label, business_type: 'store', locale: 'ar-AE' },
  });
  assert(result.ok && result.json?.business_id, `BUSINESS_CREATE_FAILED_${session.label}_${result.status}`);
  return String(result.json.business_id);
}

async function runtime(session, businessId) {
  return session.request(`/api/dabbir-runtime-fast?business_id=${encodeURIComponent(businessId)}&summary=1`);
}

async function whatsappStatus(session, businessId) {
  return session.request(`/api/dabbir-whatsapp-status?business_id=${encodeURIComponent(businessId)}`);
}

async function cleanup(label, runId, identitySet, businessId) {
  if (!identitySet && !businessId) return;
  try {
    const result = await qaControl('dabbir_ai_qa_cleanup', runId, {
      business_id: businessId || undefined,
      owner_user_id: identitySet?.owner?.id || undefined,
      employee_user_id: identitySet?.employee?.id || undefined,
    });
    report.cleanup.push({ item: label, status: 'PASS', http_status: result.status });
  } catch (error) {
    report.cleanup.push({ item: label, status: 'FAIL', detail: safeError(error) });
    report.required_failures += 1;
  }
}

try {
  await check('01_create_two_disposable_identity_sets', async () => {
    const [a, b] = await Promise.all([
      qaControl('dabbir_ai_qa_bootstrap', RUN_A),
      qaControl('dabbir_ai_qa_bootstrap', RUN_B),
    ]);
    qaA = a.json?.identities;
    qaB = b.json?.identities;
    assert(qaA?.owner?.id && qaA?.employee?.id, 'QA_A_IDENTITIES_MISSING');
    assert(qaB?.owner?.id && qaB?.employee?.id, 'QA_B_IDENTITIES_MISSING');
    return { status: 200, detail: 'Two independent disposable QA identity sets created with distinct run scopes.' };
  });

  await check('02_login_two_independent_owners', async () => {
    const [a, b] = await Promise.all([
      login(sessionA, qaA.owner),
      login(sessionB, qaB.owner),
    ]);
    return { status: Math.max(a.status, b.status), detail: 'Owner A and Owner B authenticated in separate cookie jars.' };
  });

  await check('03_create_two_isolated_tenants', async () => {
    [businessA, businessB] = await Promise.all([
      createBusiness(sessionA, LABEL_A),
      createBusiness(sessionB, LABEL_B),
    ]);
    assert(businessA && businessB && businessA !== businessB, 'TENANT_IDS_NOT_DISTINCT');
    return { status: 200, detail: 'Two distinct disposable businesses created under different owners.' };
  });

  await check('04_each_owner_can_read_only_own_runtime', async () => {
    const [a, b] = await Promise.all([runtime(sessionA, businessA), runtime(sessionB, businessB)]);
    assert(a.ok && a.json?.business?.id === businessA, `OWNER_A_OWN_RUNTIME_FAILED_${a.status}`);
    assert(b.ok && b.json?.business?.id === businessB, `OWNER_B_OWN_RUNTIME_FAILED_${b.status}`);
    return { status: 200, detail: 'Each owner resolves their own tenant normally.' };
  });

  await check('05_owner_a_cannot_read_tenant_b_runtime', async () => {
    const result = await runtime(sessionA, businessB);
    assert(result.status === 200 && result.json?.ok === true, `CROSS_RUNTIME_A_TO_B_UNEXPECTED_STATUS_${result.status}`);
    assert(result.json?.data_truth?.state === 'NO_TENANT_SELECTED', 'CROSS_RUNTIME_A_TO_B_NOT_NEUTRALIZED');
    assert(result.json?.business == null, 'CROSS_RUNTIME_A_TO_B_BUSINESS_LEAK');
    assert(!(result.json?.memberships || []).some(item => String(item?.business_id) === businessB), 'CROSS_RUNTIME_A_TO_B_MEMBERSHIP_LEAK');
    return { status: result.status, detail: 'Foreign business id is neutralized to NO_TENANT_SELECTED with no Tenant B business or membership data.' };
  });

  await check('06_owner_b_cannot_read_tenant_a_runtime', async () => {
    const result = await runtime(sessionB, businessA);
    assert(result.status === 200 && result.json?.ok === true, `CROSS_RUNTIME_B_TO_A_UNEXPECTED_STATUS_${result.status}`);
    assert(result.json?.data_truth?.state === 'NO_TENANT_SELECTED', 'CROSS_RUNTIME_B_TO_A_NOT_NEUTRALIZED');
    assert(result.json?.business == null, 'CROSS_RUNTIME_B_TO_A_BUSINESS_LEAK');
    assert(!(result.json?.memberships || []).some(item => String(item?.business_id) === businessA), 'CROSS_RUNTIME_B_TO_A_MEMBERSHIP_LEAK');
    return { status: result.status, detail: 'Reverse foreign tenant read is neutralized with no Tenant A data leakage.' };
  });

  await check('07_own_whatsapp_status_is_tenant_scoped', async () => {
    const [a, b] = await Promise.all([whatsappStatus(sessionA, businessA), whatsappStatus(sessionB, businessB)]);
    assert(a.status === 200 && a.json?.ok === true, `OWNER_A_WHATSAPP_STATUS_FAILED_${a.status}`);
    assert(b.status === 200 && b.json?.ok === true, `OWNER_B_WHATSAPP_STATUS_FAILED_${b.status}`);
    return { status: 200, detail: 'Each owner can resolve only their own tenant WhatsApp state; no global identity is inherited.' };
  });

  await check('08_owner_a_whatsapp_tenant_b_denied', async () => {
    const result = await whatsappStatus(sessionA, businessB);
    assert(result.status === 403, `WHATSAPP_A_TO_B_NOT_DENIED_${result.status}`);
    assert(String(result.json?.error || '') === 'BUSINESS_ACCESS_REQUIRED', `WHATSAPP_A_TO_B_WRONG_ERROR_${result.json?.error}`);
    assert(result.json?.waba_id == null && result.json?.phone_number_id == null && result.json?.phone == null, 'WHATSAPP_A_TO_B_METADATA_LEAK');
    return { status: result.status, detail: 'Owner A is denied before Tenant B WhatsApp connection metadata can be loaded.' };
  });

  await check('09_owner_b_whatsapp_tenant_a_denied', async () => {
    const result = await whatsappStatus(sessionB, businessA);
    assert(result.status === 403, `WHATSAPP_B_TO_A_NOT_DENIED_${result.status}`);
    assert(String(result.json?.error || '') === 'BUSINESS_ACCESS_REQUIRED', `WHATSAPP_B_TO_A_WRONG_ERROR_${result.json?.error}`);
    assert(result.json?.waba_id == null && result.json?.phone_number_id == null && result.json?.phone == null, 'WHATSAPP_B_TO_A_METADATA_LEAK');
    return { status: result.status, detail: 'Reverse WhatsApp cross-tenant access is denied without WABA/phone leakage.' };
  });
} catch (error) {
  report.required_failures += 1;
  console.error(`FATAL ${safeError(error)}`);
} finally {
  await cleanup('tenant_b_and_identities', RUN_B, qaB, businessB);
  await cleanup('tenant_a_and_identities', RUN_A, qaA, businessA);
  report.completed_at = new Date().toISOString();
  report.verdict = report.required_failures === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`DABBIR CROSS-TENANT ISOLATION: ${report.verdict}`);
  console.log(`ISOLATION_CHECKS=${report.checks.length} REQUIRED_FAILURES=${report.required_failures}`);
}

if (report.required_failures > 0) process.exitCode = 1;
