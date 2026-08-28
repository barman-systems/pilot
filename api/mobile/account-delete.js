import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  supabaseAuth,
  supabaseRpc,
} from '../_auth-core.js';
import { requireNativeBearer } from './_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;

  try {
    const token = accessTokenFromRequest(req);
    const user = token ? await getVerifiedUser(token) : null;
    if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

    const body = await readJsonBody(req, 4096);
    if (body?.confirmation !== 'DELETE_DABBIR_ACCOUNT') {
      return json(res, 400, { ok: false, error: 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED' });
    }

    const response = await supabaseRpc('dabbir_delete_current_user_account', token, {
      p_confirmation: 'DELETE_DABBIR_ACCOUNT',
    });
    const payload = await readRpcJson(response);
    if (!response.ok || payload?.deleted !== true) {
      const detail = String(payload?.message || payload?.error || '').toUpperCase();
      if (detail.includes('LEGAL_HOLD')) return json(res, 409, { ok: false, error: 'ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD' });
      if (detail.includes('PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF')) return json(res, 409, { ok: false, error: 'PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF' });
      return json(res, 503, { ok: false, error: 'ACCOUNT_DELETE_FAILED' });
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

    return json(res, 200, { ok: true, ...payload });
  } catch (error) {
    const status = Number(error?.code || error?.status || 500);
    return json(res, status === 400 || status === 413 ? status : 503, { ok: false, error: error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'ACCOUNT_DELETE_UNAVAILABLE' });
  }
}
