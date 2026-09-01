import { getVercelOidcToken } from '@vercel/oidc';

const TARGET_REF = 'fphpoysqdsceniwduxjq';
const TARGET_URL = `https://${TARGET_REF}.supabase.co`;
const BROKER_URL = `${TARGET_URL}/functions/v1/dabbir-vercel-runtime-broker`;

function productionRuntimeRequired() {
  return process.env.VERCEL_ENV === 'production' && process.env.GITHUB_ACTIONS !== 'true';
}

function validPublishableKey(value) {
  return typeof value === 'string' && value.startsWith('sb_publishable_') && value.length >= 24;
}

function validServiceRoleKey(value) {
  return typeof value === 'string' && value.length >= 64 && !value.startsWith('sb_publishable_');
}

async function activateMumbaiRuntime() {
  if (!productionRuntimeRequired()) {
    return { active: false, targetRef: null };
  }

  const oidcToken = await getVercelOidcToken();
  if (!oidcToken) throw new Error('DABBIR_MUMBAI_VERCEL_OIDC_REQUIRED');

  const response = await fetch(BROKER_URL, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${oidcToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action: 'credential' }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error('DABBIR_MUMBAI_RUNTIME_BROKER_REJECTED');
  if (data.target_ref !== TARGET_REF || data.supabase_url !== TARGET_URL) {
    throw new Error('DABBIR_MUMBAI_RUNTIME_TARGET_MISMATCH');
  }
  if (!validPublishableKey(data.publishable_key) || !validServiceRoleKey(data.service_role_key)) {
    throw new Error('DABBIR_MUMBAI_RUNTIME_CREDENTIAL_INVALID');
  }

  // Override stale Vercel project variables only inside this server process.
  // Secrets are never logged or serialized by this module.
  process.env.SUPABASE_URL = TARGET_URL;
  process.env.SUPABASE_DATA_URL = TARGET_URL;
  process.env.SUPABASE_AUTH_URL = TARGET_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = data.publishable_key;
  process.env.SUPABASE_SERVICE_ROLE_KEY = data.service_role_key;
  process.env.DABBIR_SUPABASE_PROJECT_REF = TARGET_REF;

  return { active: true, targetRef: TARGET_REF };
}

export const DABBIR_SUPABASE_RUNTIME = await activateMumbaiRuntime();
export const DABBIR_MUMBAI_TARGET_REF = TARGET_REF;
export const DABBIR_MUMBAI_TARGET_URL = TARGET_URL;
