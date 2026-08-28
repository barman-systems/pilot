import fs from 'node:fs';

const ORIGIN = String(process.env.PROTECTED_QA_ORIGIN || '').trim().replace(/\/$/, '');
const BYPASS = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const REPORT_PATH = process.env.PROTECTED_QA_REPORT_PATH || 'dabbir-protected-live-smoke-report.json';

if (!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('PROTECTED_QA_ORIGIN_REQUIRED');
if (!BYPASS) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET_REQUIRED');

const report = {
  journey: 'DABBIR_PROTECTED_LIVE_IPHONE_SMOKE',
  origin: ORIGIN,
  started_at: new Date().toISOString(),
  completed_at: null,
  verdict: 'RUNNING',
  steps: [],
  artifacts: {},
};

function assert(condition, message) {
  if (!condition) throw new Error(message || 'ASSERTION_FAILED');
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

function bypassHeaders(extra = {}) {
  return {
    'x-vercel-protection-bypass': BYPASS,
    'x-vercel-set-bypass-cookie': 'true',
    ...extra,
  };
}

async function fetchProtected(path, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(bypassHeaders())) headers.set(key, value);
  return fetch(`${ORIGIN}${path}`, { redirect: 'follow', ...init, headers });
}

let browser;
try {
  await step('01_protected_home_reachable', async () => {
    const response = await fetchProtected('/', { headers: { accept: 'text/html' } });
    const text = await response.text();
    assert(response.status === 200, `HOME_STATUS_${response.status}`);
    assert(/DABBIR/i.test(text), 'HOME_DABBIR_IDENTITY_MISSING');
    return 'Protected production home returned 200 with DABBIR identity.';
  });

  await step('02_runtime_auth_still_fails_closed', async () => {
    const response = await fetchProtected('/api/dabbir-runtime-fast?summary=1', { headers: { accept: 'application/json' } });
    const text = await response.text();
    assert(response.status === 401, `UNAUTH_RUNTIME_EXPECTED_401_GOT_${response.status}:${text.slice(0, 200)}`);
    return 'Vercel bypass does not bypass DABBIR authentication; unauthenticated runtime remains 401.';
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
      extraHTTPHeaders: bypassHeaders(),
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/401|AUTH_REQUIRED|Failed to load resource/i.test(text)) return;
      consoleErrors.push(text);
    });

    const response = await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert(response?.status() === 200, `BROWSER_HOME_STATUS_${response?.status()}`);
    await page.locator('#authGate:not(.hidden)').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('#authEmail').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#authPassword').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#authSubmit').waitFor({ state: 'visible', timeout: 10_000 });

    const authority = await page.evaluate(() => window.__dabbirUiAuthority || null);
    assert(authority?.version === 'owner-first-v4', `UI_AUTHORITY_INVALID_${JSON.stringify(authority)}`);

    const logo = page.locator('.brand .logo').first();
    await logo.waitFor({ state: 'visible', timeout: 10_000 });
    const logoBg = await logo.evaluate(element => getComputedStyle(element).backgroundImage);
    assert(String(logoBg).includes('dabbir-approved-icon'), 'APPROVED_LOGO_NOT_RENDERED');

    await page.screenshot({ path: 'dabbir-protected-live-smoke.png', fullPage: true });
    report.artifacts.screenshot = 'dabbir-protected-live-smoke.png';
    assert(pageErrors.length === 0, `PAGE_ERRORS:${pageErrors.join(' | ')}`);
    assert(consoleErrors.length === 0, `CONSOLE_ERRORS:${consoleErrors.slice(0, 8).join(' | ')}`);
    await context.close();
    return 'WebKit rendered the iPhone-size Arabic login gate, approved logo, and authoritative owner-first-v4 shell without page errors.';
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
