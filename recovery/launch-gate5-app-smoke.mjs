import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const LOCAL_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const SERVICE_KEY = String(process.env.LOCAL_SUPABASE_SERVICE_KEY || '').trim();
const EVIDENCE_PATH = String(process.env.APP_SMOKE_EVIDENCE_PATH || 'recovery-evidence/application-smoke.json');

if (!LOCAL_URL.startsWith('http://127.0.0.1:')) throw new Error('LOCAL_SUPABASE_URL_REQUIRED');
if (!PUBLISHABLE_KEY) throw new Error('LOCAL_PUBLISHABLE_KEY_REQUIRED');
if (!SERVICE_KEY) throw new Error('LOCAL_SERVICE_KEY_REQUIRED');

const adminHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
};

const syntheticEmail = `recovery-smoke-${randomUUID()}@example.invalid`;
const syntheticPassword = `${randomBytes(24).toString('base64url')}Aa9!`;
let syntheticUserId = null;
let server = null;

async function admin(path, options = {}) {
  return fetch(`${LOCAL_URL}${path}`, {
    ...options,
    headers: { ...adminHeaders, ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
}

async function createSyntheticUser() {
  const response = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: syntheticEmail, password: syntheticPassword, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`LOCAL_AUTH_ADMIN_CREATE_HTTP_${response.status}`);
  const body = await response.json();
  syntheticUserId = String(body?.id || body?.user?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(syntheticUserId)) throw new Error('LOCAL_AUTH_ADMIN_CREATE_ID_MISSING');
}

async function deleteSyntheticUser() {
  if (!syntheticUserId) return;
  await admin(`/auth/v1/admin/users/${encodeURIComponent(syntheticUserId)}`, { method: 'DELETE' }).catch(() => null);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise(resolve => server?.close(() => resolve()));
}

let evidence = {
  verdict: 'FAIL',
  auth_login_http: null,
  auth_cookie_set: false,
  runtime_http: null,
  runtime_authenticated: false,
  runtime_needs_onboarding: false,
  external_side_effects_exercised: false,
  production_endpoint_contacted: false,
  synthetic_user_removed: false,
};

try {
  await createSyntheticUser();

  const [{ default: loginHandler }, { default: runtimeHandler }] = await Promise.all([
    import('../api/auth/login.js'),
    import('../api/dabbir-runtime-fast.js'),
  ]);

  server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (pathname === '/api/auth/login') return await loginHandler(req, res);
      if (pathname === '/api/dabbir-runtime-fast') return await runtimeHandler(req, res);
      res.statusCode = 404;
      res.end('not found');
    } catch {
      if (!res.headersSent) res.statusCode = 500;
      if (!res.writableEnded) res.end(JSON.stringify({ ok: false, error: 'SMOKE_HANDLER_FAILED' }));
    }
  });

  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-dabbir-client': 'web' },
    body: JSON.stringify({ email: syntheticEmail, password: syntheticPassword }),
    signal: AbortSignal.timeout(20000),
  });
  evidence.auth_login_http = login.status;
  const loginBody = await login.json().catch(() => ({}));
  const setCookie = login.headers.get('set-cookie') || '';
  const accessMatch = setCookie.match(/__Host-dabbir_access=([^;]+)/);
  evidence.auth_cookie_set = Boolean(accessMatch);
  if (login.status !== 200 || loginBody?.ok !== true || !accessMatch) {
    throw new Error(`APPLICATION_LOGIN_SMOKE_FAILED_${login.status}`);
  }

  const runtime = await fetch(`${origin}/api/dabbir-runtime-fast?summary=1`, {
    headers: {
      cookie: `__Host-dabbir_access=${accessMatch[1]}`,
      'x-dabbir-client': 'web',
    },
    signal: AbortSignal.timeout(20000),
  });
  evidence.runtime_http = runtime.status;
  const runtimeBody = await runtime.json().catch(() => ({}));
  evidence.runtime_authenticated = runtimeBody?.authenticated === true;
  evidence.runtime_needs_onboarding = runtimeBody?.needs_onboarding === true;

  if (runtime.status !== 200 || runtimeBody?.ok !== true || runtimeBody?.authenticated !== true || runtimeBody?.needs_onboarding !== true) {
    throw new Error(`APPLICATION_RUNTIME_SMOKE_FAILED_${runtime.status}`);
  }

  evidence.verdict = 'PASS';
} finally {
  await close(server).catch(() => null);
  await deleteSyntheticUser().catch(() => null);
  if (syntheticUserId) {
    const verifyDelete = await admin(`/auth/v1/admin/users/${encodeURIComponent(syntheticUserId)}`, { method: 'GET' }).catch(() => null);
    evidence.synthetic_user_removed = !verifyDelete || verifyDelete.status === 404;
  }
  if (evidence.verdict === 'PASS' && !evidence.synthetic_user_removed) evidence.verdict = 'FAIL';
  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(JSON.stringify(evidence));
}

if (evidence.verdict !== 'PASS') process.exit(1);
