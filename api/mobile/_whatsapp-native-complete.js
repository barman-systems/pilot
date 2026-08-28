import { applyDabbirMetaPublicIdentifiers } from '../_dabbir-meta-public-config.js';
import {
  resolveEmbeddedPlatformConfig,
  sealAccessToken,
  upsertBusinessConnection,
  verifyEmbeddedAssets,
} from '../_whatsapp-embedded-core.js';

function fail(message, status = 502, response = null, payload = null) {
  return Object.assign(new Error(String(payload?.error?.message || message).slice(0, 300)), {
    status,
    providerStatus: response?.status || null,
    providerCode: payload?.error?.code || null,
    providerSubcode: payload?.error?.error_subcode || null,
  });
}

function cleanId(value) {
  const text = String(value || '').trim();
  return /^[0-9]{5,40}$/.test(text) ? text : '';
}

async function graphJson(url, { method = 'GET', token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    let encodedBody;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      encodedBody = JSON.stringify(body);
    }
    const response = await fetch(url, { method, headers, body: encodedBody, cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw fail('META_REQUEST_FAILED', 502, response, payload);
    return { response, payload };
  } finally { clearTimeout(timeout); }
}

async function exchangeCode(platform, code, redirectUri) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/oauth/access_token`);
  url.searchParams.set('client_id', platform.appId);
  url.searchParams.set('client_secret', platform.appSecret);
  url.searchParams.set('code', String(code));
  url.searchParams.set('redirect_uri', String(redirectUri));
  const { response, payload } = await graphJson(url);
  if (!payload?.access_token) throw fail('META_CODE_EXCHANGE_FAILED', 502, response, payload);
  return { accessToken: String(payload.access_token), expiresIn: Number(payload.expires_in || 0) || null };
}

async function discoverWaba(platform, token) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/debug_token`);
  url.searchParams.set('input_token', String(token));
  const appAccessToken = `${platform.appId}|${platform.appSecret}`;
  const { payload } = await graphJson(url, { token: appAccessToken });
  if (payload?.data?.is_valid === false) throw fail('META_WABA_DISCOVERY_FAILED');
  const ids = [...new Set((Array.isArray(payload?.data?.granular_scopes) ? payload.data.granular_scopes : [])
    .filter(item => String(item?.scope || '') === 'whatsapp_business_management')
    .flatMap(item => Array.isArray(item?.target_ids) ? item.target_ids : [])
    .map(cleanId).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) throw fail('META_WABA_RESOLUTION_REQUIRED', 409);
  throw fail('META_WABA_DISCOVERY_EMPTY', 409);
}

async function resolvePhone(platform, token, wabaId) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(wabaId)}/phone_numbers`);
  url.searchParams.set('fields', 'id,display_phone_number,verified_name,is_on_biz_app,platform_type');
  url.searchParams.set('limit', '100');
  const { payload } = await graphJson(url, { token });
  const phones = Array.isArray(payload?.data) ? payload.data : [];
  const coexistence = phones.filter(item => item?.is_on_biz_app === true && String(item?.platform_type || '').toUpperCase() === 'CLOUD_API');
  if (coexistence.length === 1) return cleanId(coexistence[0]?.id);
  if (phones.length === 1) return cleanId(phones[0]?.id);
  throw fail('META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED', 409);
}

export async function completeNativeWhatsApp({ owner, row, code }) {
  const businessId = String(row?.business_id || '').trim();
  if (!businessId || !owner?.accessToken || !owner?.user?.id) throw fail('WHATSAPP_MOBILE_OWNER_CONTEXT_INVALID', 403);
  if (String(owner.user.id) !== String(row.user_id)) throw fail('WHATSAPP_MOBILE_SESSION_OWNER_MISMATCH', 403);

  const platform = applyDabbirMetaPublicIdentifiers(await resolveEmbeddedPlatformConfig());
  if (!platform?.ready) throw fail('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED', 503);
  const exchanged = await exchangeCode(platform, code, row.redirect_uri);
  let wabaId = cleanId(row.waba_id);
  let phoneNumberId = cleanId(row.phone_number_id);
  if (!wabaId) wabaId = await discoverWaba(platform, exchanged.accessToken);
  if (!wabaId) throw fail('META_EMBEDDED_SIGNUP_WABA_REQUIRED', 400);
  if (!phoneNumberId && String(row.onboarding_mode || '') === 'whatsapp_business_app_onboarding') {
    phoneNumberId = await resolvePhone(platform, exchanged.accessToken, wabaId);
  }
  if (!phoneNumberId) throw fail('META_EMBEDDED_SIGNUP_PHONE_REQUIRED', 400);

  const verified = await verifyEmbeddedAssets(platform, exchanged.accessToken, wabaId, phoneNumberId);
  const sealed = sealAccessToken(exchanged.accessToken, platform, businessId);
  const now = new Date();
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
    token_expires_at: exchanged.expiresIn ? new Date(now.getTime() + exchanged.expiresIn * 1000).toISOString() : null,
    connected_by: owner.user.id,
    connected_at: now.toISOString(),
    last_verified_at: now.toISOString(),
    last_provider_status: verified.providerStatus,
    last_error: null,
  });

  return {
    ok: true,
    connected: true,
    state: 'META_AUTHORIZED',
    meta_authorized: true,
    operational: false,
    operational_reason: 'LIVE_MESSAGE_PATH_NOT_YET_VERIFIED',
    onboarding_mode: row.onboarding_mode || 'whatsapp_business_app_onboarding',
    phone: { display_phone_number: verified.displayPhoneNumber, verified_name: verified.verifiedName },
    waba_id: stored?.waba_id || wabaId,
    phone_number_id: stored?.phone_number_id || phoneNumberId,
    connected_at: stored?.connected_at || now.toISOString(),
    secrets_exposed: false,
  };
}
