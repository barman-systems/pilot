import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  supabaseAuth,
  supabaseRpc,
} from '../_auth-core.js';
import { appleIdentitySubject, revokeAppleAuthorizationForDeletion } from '../_apple-signin-core.js';
import { requireNativeBearer } from './_native-core.js';

function deletionBlocker(payload) {
  const detail = String(payload?.message || payload?.error || '').toUpperCase();
  if (detail.includes('LEGAL_HOLD')) return 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD';
  if (detail.includes('PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF')) return 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF';
  if (detail.includes('DABBIR_ACCOUNT_ALREADY_DELETED')) return 'DABBIR_ACCOUNT_ALREADY_DELETED';
  return null;
}

async function fullAuthUser(token) {
  const response = await supabaseAuth('/auth/v1/user', {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;

  try {
    const token = accessTokenFromRequest(req);
    const user = token ? await getVerifiedUser(token) : null;
    if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const body = await readJsonBody(req, 8192);
    if (body?.confirmation !== 'DELETE_DABBIR_ACCOUNT') {
      return json(res, 400, { ok: false, error: 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED' });
    }

    // Run deterministic DABBIR blockers before revoking an external Apple grant.
    // This prevents a legal hold or required platform-admin handoff from leaving
    // the user with a revoked Apple grant while the DABBIR account remains active.
    const preflightResponse = await supabaseRpc('dabbir_delete_current_user_account_preflight', token, {
      p_confirmation: 'DELETE_DABBIR_ACCOUNT',
    });
    const preflight = await readRpcJson(preflightResponse);
    if (!preflightResponse.ok || preflight?.allowed !== true) {
      const blocker = deletionBlocker(preflight);
      return json(res, blocker ? 409 : 503, { ok: false, error: blocker || 'ACCOUNT_DELETE_PREFLIGHT_FAILED' });
    }

    const authUser = await fullAuthUser(token);
    if (!authUser || String(authUser.id || '') !== String(user.id)) {
      return json(res, 503, { ok: false, error: 'ACCOUNT_DELETE_AUTH_IDENTITY_UNAVAILABLE' });
    }

    const appleSubject = appleIdentitySubject(authUser);
    if (appleSubject) {
      const authorizationCode = String(body?.apple_authorization_code || '').trim();
      if (!authorizationCode) {
        return json(res, 409, { ok: false, error: 'APPLE_REAUTH_REQUIRED' });
      }
      try {
        await revokeAppleAuthorizationForDeletion(authorizationCode, appleSubject);
      } catch (error) {
        const status = Number(error?.code || 503);
        const safeStatus = [403, 409, 503].includes(status) ? status : 503;
        return json(res, safeStatus, { ok: false, error: String(error?.message || 'APPLE_TOKEN_REVOCATION_FAILED') });
      }
    }

    const response = await supabaseRpc('dabbir_delete_current_user_account', token, {
      p_confirmation: 'DELETE_DABBIR_ACCOUNT',
    });
    const payload = await readRpcJson(response);
    if (!response.ok || payload?.deleted !== true) {
      const blocker = deletionBlocker(payload);
      return json(res, blocker ? 409 : 503, { ok: false, error: blocker || 'ACCOUNT_DELETE_FAILED' });
    }

    // Prevent the DABBIR signup trigger from recreating the DABBIR-specific
    // account registry row on a later auth metadata update. Other product metadata
    // and the global Supabase identity are left intact.
    await supabaseAuth('/auth/v1/user', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: { product: null } }),
    }).catch(() => null);

    // Revoke the current Supabase session after the product deletion completed.
    await supabaseAuth('/auth/v1/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: '{}',
    }).catch(() => null);

    return json(res, 200, {
      ok: true,
      ...payload,
      apple_sign_in_authorization_revoked: Boolean(appleSubject),
    });
  } catch (error) {
    const status = Number(error?.code || error?.status || 500);
    return json(res, status === 400 || status === 413 ? status : 503, {
      ok: false,
      error: error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'ACCOUNT_DELETE_UNAVAILABLE',
    });
  }
}
