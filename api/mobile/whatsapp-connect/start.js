import { json, readJsonBody } from '../../_auth-core.js';
import { ownerContext, resolveEmbeddedPlatformConfig } from '../../_whatsapp-embedded-core.js';
import { requireNativeBearer } from '../_native-core.js';
import { createMobileConnectSession, newMobileConnectState } from '../_whatsapp-connect-core.js';

function requestOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || /[\s/\\]/.test(host)) throw Object.assign(new Error('PUBLIC_HOST_REQUIRED'), { status: 503 });
  return `https://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;
  try {
    const body = await readJsonBody(req, 4096);
    const businessId = String(body?.business_id || '').trim();
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const platform = await resolveEmbeddedPlatformConfig();
    if (!platform?.ready) return json(res, 503, { ok: false, error: 'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED' });

    const state = newMobileConnectState();
    const origin = requestOrigin(req);
    const redirectUri = `${origin}/api/mobile/whatsapp-connect/page`;
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await createMobileConnectSession({ state, userId: owner.user.id, businessId, redirectUri, expiresAt });

    return json(res, 200, {
      ok: true,
      state,
      url: `${redirectUri}#state=${encodeURIComponent(state)}`,
      return_url: 'dabbir://whatsapp-connect',
      expires_at: new Date(expiresAt).toISOString(),
      secrets_exposed: false,
    });
  } catch (error) {
    return json(res, Number(error?.status || error?.code || 500), {
      ok: false,
      error: String(error?.message || 'WHATSAPP_MOBILE_START_FAILED').slice(0, 300),
    });
  }
}
