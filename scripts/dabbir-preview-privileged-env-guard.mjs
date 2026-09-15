import { pathToFileURL } from 'node:url';

const PREVIEW_FORBIDDEN = Object.freeze([
  'SUPABASE_SERVICE_ROLE_KEY',
]);

function clean(value, max = 80) {
  return String(value ?? '').trim().slice(0, max);
}

export function previewPrivilegedEnvFindings(env = process.env) {
  const environment = clean(env.VERCEL_ENV, 40).toLowerCase();
  if (environment !== 'preview') return [];

  return PREVIEW_FORBIDDEN
    .filter((key) => String(env[key] ?? '').trim().length > 0)
    .map((key) => ({ key, environment: 'preview' }));
}

export function enforcePreviewPrivilegedEnvBoundary(env = process.env) {
  const findings = previewPrivilegedEnvFindings(env);
  if (!findings.length) return { ok: true, findings: [] };

  const keys = findings.map(({ key }) => key).sort();
  const error = new Error(`DABBIR_PREVIEW_PRIVILEGED_ENV_BLOCKED:${keys.join(',')}`);
  error.code = 'DABBIR_PREVIEW_PRIVILEGED_ENV_BLOCKED';
  error.keys = keys;
  throw error;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    enforcePreviewPrivilegedEnvBoundary(process.env);
    console.log('DABBIR_PREVIEW_PRIVILEGED_ENV=PASS');
  } catch (error) {
    const keys = Array.isArray(error?.keys) ? error.keys.join(',') : 'UNKNOWN';
    console.error(`DABBIR_PREVIEW_PRIVILEGED_ENV=BLOCKED keys=${keys}`);
    process.exit(42);
  }
}
