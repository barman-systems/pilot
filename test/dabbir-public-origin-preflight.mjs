import { DABBIR_PUBLIC_RUNTIME } from '../config/dabbir-public-runtime.js';

const origin = DABBIR_PUBLIC_RUNTIME.productionOrigin;
const attempts = Number(process.env.DABBIR_PUBLIC_PREFLIGHT_ATTEMPTS || 12);
const delayMs = Number(process.env.DABBIR_PUBLIC_PREFLIGHT_DELAY_MS || 5000);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function fail(message, detail = {}) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

async function inspect(url, label) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: label === 'config' ? 'application/json' : 'text/html,application/json' },
  });
  const location = response.headers.get('location') || '';
  if (response.status >= 300 && response.status < 400) {
    if (/vercel\.com\/sso-api|vercel-authentication|sso/i.test(location)) {
      fail('VERCEL_AUTH_PROTECTION_BLOCKS_PUBLIC_ORIGIN', { label, status: response.status, location });
    }
    fail('PUBLIC_ORIGIN_UNEXPECTED_REDIRECT', { label, status: response.status, location });
  }
  if ([401, 403].includes(response.status)) fail('PUBLIC_ORIGIN_AUTH_BLOCKED', { label, status: response.status });
  if (response.status !== 200) fail('PUBLIC_ORIGIN_NOT_READY', { label, status: response.status });
  return response;
}

let lastError = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const rootResponse = await inspect(`${origin}/`, 'root');
    const configResponse = await inspect(`${origin}/api/dabbir-whatsapp-embedded-config`, 'config');
    const config = await configResponse.json().catch(() => null);
    if (!config || config.ok !== true) fail('EMBEDDED_CONFIG_PREFLIGHT_INVALID_JSON');
    if (config.expected_origin && config.expected_origin !== origin) {
      fail('CANONICAL_ORIGIN_DRIFT', { expected: origin, observed: config.expected_origin });
    }
    if (config.platform_readiness?.canonical_origin_active !== true) {
      fail('CANONICAL_ORIGIN_NOT_ACTIVE', { request_host: config.request_host || null });
    }
    console.log(JSON.stringify({
      ok: true,
      origin,
      root_status: rootResponse.status,
      config_status: configResponse.status,
      auth_required: Boolean(config.auth_required),
      canonical_origin_active: true,
      attempt,
    }));
    process.exit(0);
  } catch (error) {
    lastError = error;
    const terminal = /VERCEL_AUTH_PROTECTION|PUBLIC_ORIGIN_AUTH_BLOCKED|CANONICAL_ORIGIN_DRIFT/.test(String(error?.message || ''));
    console.error(JSON.stringify({
      ok: false,
      attempt,
      error: String(error?.message || 'PUBLIC_PREFLIGHT_FAILED'),
      detail: error?.detail || null,
    }));
    if (terminal || attempt === attempts) break;
    await sleep(delayMs);
  }
}

console.error(`DABBIR public-origin preflight failed for ${origin}: ${String(lastError?.message || 'UNKNOWN')}`);
process.exit(1);
