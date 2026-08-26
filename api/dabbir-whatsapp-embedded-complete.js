import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import {
  exchangeEmbeddedCode,
  ownerContext,
  resolveEmbeddedPlatformConfig,
  sealAccessToken,
  upsertBusinessConnection,
  verifyEmbeddedAssets,
} from './_whatsapp-embedded-core.js';

function cleanId(value) {
  const text = String(value || '').trim();
  return /^[0-9]{5,40}$/.test(text) ? text : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 16 * 1024);
    const businessId = String(body?.business_id || '').trim();
    const code = String(body?.code || '').trim();
    const wabaId = cleanId(body?.waba_id);
    const phoneNumberId = cleanId(body?.phone_number_id);
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!code || code.length > 4096) return json(res, 400, { ok: false, error: 'META_AUTHORIZATION_CODE_REQUIRED' });
    if (!wabaId || !phoneNumberId) return json(res, 400, { ok: false, error: 'META_EMBEDDED_SIGNUP_ASSETS_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const platform = await resolveEmbeddedPlatformConfig();
    if (!platform.ready) return json(res, 503, { ok: false, error: 'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED' });

    const exchanged = await exchangeEmbeddedCode(platform, code);
    const verified = await verifyEmbeddedAssets(platform, exchanged.accessToken, wabaId, phoneNumberId);
    const sealed = sealAccessToken(exchanged.accessToken, platform, businessId);
    const now = new Date();
    const tokenExpiresAt = exchanged.expiresIn
      ? new Date(now.getTime() + exchanged.expiresIn * 1000).toISOString()
      : null;

    const stored = await upsertBusinessConnection(owner.accessToken, {
      business_id: businessId,
      provider: 'meta',
      status: 'connected',
      meta_app_id: platform.appId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: verified.displayPhoneNumber,
      verified_name: verified.verifiedName,
      ...sealed,
      token_expires_at: tokenExpiresAt,
      connected_by: owner.user.id,
      connected_at: now.toISOString(),
      last_verified_at: now.toISOString(),
      last_provider_status: verified.providerStatus,
      last_error: null,
    });

    return json(res, 200, {
      ok: true,
      connected: true,
      channel: 'whatsapp',
      state: 'META_AUTHORIZED',
      meta_authorized: true,
      operational: false,
      operational_reason: 'LIVE_MESSAGE_PATH_NOT_YET_VERIFIED',
      phone: {
        display_phone_number: verified.displayPhoneNumber,
        verified_name: verified.verifiedName,
      },
      waba_id: stored?.waba_id || wabaId,
      phone_number_id: stored?.phone_number_id || phoneNumberId,
      connected_at: stored?.connected_at || now.toISOString(),
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, status, {
      ok: false,
      error: String(error?.message || 'WHATSAPP_EMBEDDED_SIGNUP_FAILED').slice(0, 300),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
    });
  }
}
