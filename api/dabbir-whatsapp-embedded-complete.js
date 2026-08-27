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

async function resolveCoexistencePhoneNumberId(platform, token, wabaId) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(wabaId)}/phone_numbers`);
  url.searchParams.set('fields', 'id,display_phone_number,verified_name,is_on_biz_app,platform_type');
  url.searchParams.set('limit', '100');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(payload?.error?.message || 'META_PHONE_RESOLUTION_FAILED').slice(0, 300));
      error.status = 502;
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      throw error;
    }

    const phones = Array.isArray(payload?.data) ? payload.data : [];
    const coexistence = phones.filter(item => item?.is_on_biz_app === true && String(item?.platform_type || '').toUpperCase() === 'CLOUD_API');
    if (coexistence.length === 1) return cleanId(coexistence[0]?.id);
    if (phones.length === 1) return cleanId(phones[0]?.id);

    throw Object.assign(new Error('META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED'), { status: 409 });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 16 * 1024);
    const businessId = String(body?.business_id || '').trim();
    const code = String(body?.code || '').trim();
    const wabaId = cleanId(body?.waba_id);
    let phoneNumberId = cleanId(body?.phone_number_id);
    const onboardingMode = String(body?.onboarding_mode || '').trim();

    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!code || code.length > 4096) return json(res, 400, { ok: false, error: 'META_AUTHORIZATION_CODE_REQUIRED' });
    if (!wabaId) return json(res, 400, { ok: false, error: 'META_EMBEDDED_SIGNUP_WABA_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const platform = await resolveEmbeddedPlatformConfig();
    if (!platform.ready) return json(res, 503, { ok: false, error: 'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED' });

    const exchanged = await exchangeEmbeddedCode(platform, code);
    if (!phoneNumberId && onboardingMode === 'whatsapp_business_app_onboarding') {
      phoneNumberId = await resolveCoexistencePhoneNumberId(platform, exchanged.accessToken, wabaId);
    }
    if (!phoneNumberId) return json(res, 400, { ok: false, error: 'META_EMBEDDED_SIGNUP_PHONE_REQUIRED' });

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
      onboarding_mode: onboardingMode || 'standard',
      coexistence: onboardingMode === 'whatsapp_business_app_onboarding',
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
