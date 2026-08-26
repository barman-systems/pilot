import { json, readJsonBody, requireSameOrigin, supabaseAuth } from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstForwarded(value = '') {
  return String(value || '').split(',')[0].trim();
}

function isLoopbackHost(host = '') {
  const hostname = String(host || '').toLowerCase().split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
}

export function requestPublicOrigin(req, env = process.env) {
  const host = firstForwarded(req?.headers?.['x-forwarded-host'] || req?.headers?.host).toLowerCase();
  const forwardedProto = firstForwarded(req?.headers?.['x-forwarded-proto']).toLowerCase();
  const production = String(env.NODE_ENV || '').toLowerCase() === 'production' || Boolean(env.VERCEL);

  if (!host) return null;
  if (production && isLoopbackHost(host)) return null;

  const protocol = forwardedProto || (production ? 'https' : 'http');
  if (production && protocol !== 'https') return null;
  if (protocol !== 'https' && protocol !== 'http') return null;

  try {
    const origin = new URL(`${protocol}://${host}`).origin;
    if (production && !origin.startsWith('https://')) return null;
    return origin;
  } catch {
    return null;
  }
}

export function buildRecoveryRedirect(req, env = process.env) {
  const origin = requestPublicOrigin(req, env);
  if (!origin) return null;
  return new URL('/?password_recovery=1', `${origin}/`).toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();

    if (!emailPattern.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: 'INVALID_RECOVERY_INPUT' });
    }

    // Use the exact public origin that the customer is currently using. This
    // removes localhost and legacy deployment-name coupling from the runtime and
    // makes a future DABBIR custom domain work without a code change.
    const recoveryRedirect = buildRecoveryRedirect(req);
    if (!recoveryRedirect) {
      console.error('dabbir_password_recovery_public_origin_invalid');
      return json(res, 503, { ok: false, error: 'RECOVERY_CONFIGURATION_ERROR' });
    }

    const upstream = await supabaseAuth(`/auth/v1/recover?redirect_to=${encodeURIComponent(recoveryRedirect)}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => null);

    // Do not reveal whether an account exists. Preserve enumeration resistance.
    if (upstream && !upstream.ok) {
      console.warn('dabbir_password_recovery_upstream_rejected', { status: upstream.status });
    }

    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'DABBIR_PUBLIC_ORIGIN',
    });
  } catch (error) {
    if (error?.code === 413) return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
    if (error?.code === 400) return json(res, 400, { ok: false, error: 'INVALID_JSON' });
    return json(res, 200, {
      ok: true,
      accepted: true,
      message: 'RECOVERY_EMAIL_IF_ACCOUNT_EXISTS',
      redirect_target: 'DABBIR_PUBLIC_ORIGIN',
    });
  }
}
