import fs from 'node:fs';

const ORIGIN = String(process.env.PROTECTED_QA_ORIGIN || '').trim().replace(/\/$/, '');
const BYPASS = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const TRUSTED_OIDC = String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const EXPECTED_PROJECT_ID = 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq';
const EXPECTED_REPOSITORY = 'barman-systems/pilot';
const REPORT_PATH = process.env.PROTECTED_QA_REPORT_PATH || 'dabbir-protected-live-smoke-report.json';
const RELEASE_WAIT_MS = Math.min(Math.max(Number(process.env.PROTECTED_QA_RELEASE_WAIT_MS || 180_000), 15_000), 300_000);

if (!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('PROTECTED_QA_ORIGIN_REQUIRED');
if (!BYPASS && !TRUSTED_OIDC) throw new Error('VERCEL_PROTECTED_ACCESS_REQUIRED');
if (!/^[a-f0-9]{40}$/i.test(EXPECTED_SHA)) throw new Error('EXPECTED_PRODUCTION_SHA_REQUIRED');

const report = {
  journey: 'DABBIR_PROTECTED_LIVE_IPHONE_SMOKE',
  origin: ORIGIN,
  expected_production_sha: EXPECTED_SHA,
  verified_production_sha: null,
  verified_deployment_id: null,
  protection_access: BYPASS ? 'automation_bypass' : 'trusted_oidc',
  started_at: new Date().toISOString(),
  completed_at: null,
  verdict: 'RUNNING',
  steps: [],
  artifacts: {},
};

function assert(condition, message) {
  if (!condition) throw new Error(message || 'ASSERTION_FAILED');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function step(name, fn) {
  const started = Date.now();
  const row = { name, status: 'RUNNING', duration_ms: null, detail: null };
  report.steps.push(row);
  try {
    const detail = await fn();
    row.status = 'PASS';
    row.duration_ms = Date.now() - started;
    row.detail = detail || null;
    console.log(`PASS ${name} (${row.duration_ms}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    row.status = 'FAIL';
    row.duration_ms = Date.now() - started;
    row.detail = String(error?.stack || error?.message || error).slice(0, 1200);
    console.error(`FAIL ${name} (${row.duration_ms}ms) — ${row.detail}`);
    throw error;
  }
}

function protectionHeaders(extra = {}) {
  const auth = BYPASS
    ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' }
    : { 'x-vercel-trusted-oidc-idp-token': TRUSTED_OIDC };
  return { ...auth, ...extra };
}

async function fetchProtected(path, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(protectionHeaders())) headers.set(key, value);
  return fetch(`${ORIGIN}${path}`, { redirect: 'follow', cache: 'no-store', ...init, headers });
}

async function waitForExactProductionSha() {
  const deadline = Date.now() + RELEASE_WAIT_MS;
  let last = 'NO_RESPONSE';
  while (Date.now() < deadline) {
    try {
      const response = await fetchProtected(`/api/release-evidence?t=${Date.now()}`, { headers: { accept: 'application/json' } });
      const text = await response.text();
      let body = {};
      try { body = JSON.parse(text); } catch {}
      const observed = String(body?.commit_sha || '').trim().toLowerCase();
      const environment = String(body?.environment || '').trim().toLowerCase();
      last = `HTTP_${response.status}:${observed || body?.error || text.slice(0, 120)}`;
      if (response.status === 200 && body?.ok === true && observed === EXPECTED_SHA) {
        assert(!environment || environment === 'production', `EXACT_SHA_NOT_PRODUCTION_${environment}`);
        assert(body?.project_id === EXPECTED_PROJECT_ID, `EXACT_PROJECT_ID_MISMATCH_${body?.project_id || 'missing'}`);
        assert(body?.git_provider === 'github', `EXACT_GIT_PROVIDER_MISMATCH_${body?.git_provider || 'missing'}`);
        assert(body?.repository === EXPECTED_REPOSITORY, `EXACT_REPOSITORY_MISMATCH_${body?.repository || 'missing'}`);
        report.verified_production_sha = observed;
        report.verified_deployment_id = body?.deployment_id || null;
        return body;
      }
    } catch (error) {
      last = String(error?.message || error).slice(0, 180);
    }
    await sleep(5_000);
  }
  throw new Error(`EXACT_PRODUCTION_SHA_NOT_READY_EXPECTED_${EXPECTED_SHA}_LAST_${last}`);
}

let browser;
try {
  await step('00_exact_production_sha', async () => {
    const evidence = await waitForExactProductionSha();
    return `Production release evidence matches ${EXPECTED_SHA}${evidence?.deployment_id ? ` on ${evidence.deployment_id}` : ''}, ${evidence.project_id}, ${evidence.repository}.`;
  });

  await step('01_protected_home_reachable', async () => {
    const response = await fetchProtected('/', { headers: { accept: 'text/html' } });
    const text = await response.text();
    assert(response.status === 200, `HOME_STATUS_${response.status}`);
    assert(/DABBIR/i.test(text), 'HOME_DABBIR_IDENTITY_MISSING');
    return `Exact protected production home returned 200 with DABBIR identity via ${BYPASS ? 'automation bypass' : 'trusted GitHub OIDC'}.`;
  });

  await step('02_runtime_auth_still_fails_closed', async () => {
    const response = await fetchProtected('/api/dabbir-runtime-fast?summary=1', { headers: { accept: 'application/json' } });
    const text = await response.text();
    assert(response.status === 401, `UNAUTH_RUNTIME_EXPECTED_401_GOT_${response.status}:${text.slice(0, 200)}`);
    return 'Vercel protection access does not bypass DABBIR authentication; unauthenticated runtime remains 401.';
  });

  await step('03_webkit_iphone_login_gate', async () => {
    const { webkit } = await import('playwright');
    browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'ar-AE',
      timezoneId: 'Asia/Dubai',
      extraHTTPHeaders: protectionHeaders(),
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/401|AUTH_REQUIRED|Failed to load resource/i.test(text)) return;
      consoleErrors.push(text);
    });

    const response = await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert(response?.status() === 200, `BROWSER_HOME_STATUS_${response?.status()}`);
    const authGate = page.locator('#authGate:not(.hidden)');
    await authGate.waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('#authEmail').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#authPassword').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#authSubmit').waitFor({ state: 'visible', timeout: 10_000 });

    await page.screenshot({ path: 'dabbir-protected-live-smoke.png', fullPage: true });
    report.artifacts.screenshot = 'dabbir-protected-live-smoke.png';

    const diagnostics = await page.evaluate(() => ({
      authority: window.__dabbirUiAuthority || null,
      inline_state: window.__dabbirOwnerFirstInlineState || null,
      init_error: window.__dabbirOwnerFirstInitError || null,
      owner_flag: window.__dabbirOwnerFirstUiV4 || null,
    }));
    if (diagnostics?.authority?.version !== 'owner-first-v4') {
      throw new Error(`UI_AUTHORITY_INVALID_${JSON.stringify(diagnostics)}_PAGE_ERRORS_${JSON.stringify(pageErrors.slice(0,8))}_CONSOLE_ERRORS_${JSON.stringify(consoleErrors.slice(0,8))}`);
    }
    assert(diagnostics?.inline_state?.stage === 'ready', `UI_INLINE_STATE_INVALID_${JSON.stringify(diagnostics)}`);

    const logo = authGate.locator('.authCard .brand .logo');
    assert(await logo.count() === 1, `AUTH_APPROVED_LOGO_COUNT_${await logo.count()}`);
    await logo.waitFor({ state: 'visible', timeout: 10_000 });
    const logoBg = await logo.evaluate(element => getComputedStyle(element).backgroundImage);
    assert(String(logoBg).includes('dabbir-app-icon'), 'AUTH_APPROVED_LOGO_NOT_RENDERED');

    assert(pageErrors.length === 0, `PAGE_ERRORS:${pageErrors.join(' | ')}`);
    assert(consoleErrors.length === 0, `CONSOLE_ERRORS:${consoleErrors.slice(0, 8).join(' | ')}`);
    await context.close();
    return `WebKit rendered the iPhone-size Arabic login gate on exact production SHA ${EXPECTED_SHA}, visible approved auth logo, and authoritative owner-first-v4 shell without page errors.`;
  });

  report.verdict = 'PASS';
} catch (error) {
  report.verdict = 'FAIL';
  report.error = String(error?.stack || error?.message || error).slice(0, 1600);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  report.completed_at = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`DABBIR_PROTECTED_LIVE_SMOKE_VERDICT=${report.verdict}`);
}
