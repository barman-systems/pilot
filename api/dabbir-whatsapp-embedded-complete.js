import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
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

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function existingMetaDebugToken() {
  return firstEnv(
    'DABBIR_WHATSAPP_ACCESS_TOKEN',
    'PILOT_WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
  );
}

function metaProviderError(payload, response, fallback) {
  const error = new Error(String(payload?.error?.message || fallback).slice(0, 300));
  error.status = 502;
  error.providerStatus = response?.status || null;
  error.providerCode = payload?.error?.code || null;
  error.providerSubcode = payload?.error?.error_subcode || null;
  return error;
}

function oauthRedirectUriFromRequest(req) {
  const header = name => {
    const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
    return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  };

  const originHeader = header('origin');
  let requestOrigin = '';
  if (originHeader) {
    try {
      requestOrigin = new URL(originHeader).origin;
    } catch {
      requestOrigin = '';
    }
  }

  const candidates = [header('referer'), requestOrigin ? `${requestOrigin}/` : ''];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) continue;
      if (requestOrigin && url.origin !== requestOrigin) continue;
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      // Try the next trusted request-derived candidate.
    }
  }

  throw Object.assign(new Error('META_OAUTH_REDIRECT_URI_REQUIRED'), { status: 400 });
}

function normalizedHost(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return String(url.hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

function productionMetaRepairHost(redirectUri) {
  const redirectHost = normalizedHost(redirectUri);
  const configuredHost = normalizedHost(firstEnv(
    'DABBIR_META_APP_DOMAIN',
    'DABBIR_PUBLIC_HOST',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ));
  const vercelProduction = String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production';
  if (!redirectHost || !configuredHost || redirectHost !== configuredHost || !vercelProduction) {
    throw Object.assign(new Error('META_APP_DOMAIN_REPAIR_NOT_ALLOWED'), { status: 409 });
  }
  return redirectHost;
}

function isMetaAppDomainError(error) {
  const message = String(error?.message || '').toLowerCase();
  return Number(error?.providerCode || 0) === 191
    || message.includes("domain of this url isn't included")
    || message.includes('app domains field');
}

async function readMetaAppDomains(platform) {
  const appAccessToken = `${String(platform?.appId || '')}|${String(platform?.appSecret || '')}`;
  if (!platform?.appId || !platform?.appSecret) {
    throw Object.assign(new Error('META_APP_DOMAIN_REPAIR_CONFIGURATION_MISSING'), { status: 503 });
  }
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(platform.appId)}`);
  url.searchParams.set('fields', 'app_domains');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${appAccessToken}`, accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw metaProviderError(payload, response, 'META_APP_DOMAIN_READ_FAILED');
    const domains = Array.isArray(payload?.app_domains)
      ? payload.app_domains.map(normalizedHost).filter(Boolean)
      : [];
    return [...new Set(domains)];
  } finally {
    clearTimeout(timeout);
  }
}

async function writeMetaAppDomains(platform, domains) {
  const appAccessToken = `${String(platform?.appId || '')}|${String(platform?.appSecret || '')}`;
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(platform.appId)}`);
  const body = new URLSearchParams();
  body.set('app_domains', JSON.stringify(domains));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appAccessToken}`,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw metaProviderError(payload, response, 'META_APP_DOMAIN_UPDATE_FAILED');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureMetaAppDomain(platform, redirectUri) {
  const host = productionMetaRepairHost(redirectUri);
  const existing = await readMetaAppDomains(platform);
  if (existing.includes(host)) return { changed: false, host };
  const next = [...new Set([...existing, host])];
  await writeMetaAppDomains(platform, next);
  const verified = await readMetaAppDomains(platform);
  if (!verified.includes(host)) {
    throw Object.assign(new Error('META_APP_DOMAIN_UPDATE_UNVERIFIED'), { status: 502 });
  }
  return { changed: true, host };
}

async function exchangeEmbeddedCodeWithRedirect(platform, code, redirectUri) {
  if (!platform?.ready) {
    throw Object.assign(new Error('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED'), { status: 503 });
  }
  if (!redirectUri) {
    throw Object.assign(new Error('META_OAUTH_REDIRECT_URI_REQUIRED'), { status: 400 });
  }

  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/oauth/access_token`);
  url.searchParams.set('client_id', platform.appId);
  url.searchParams.set('client_secret', platform.appSecret);
  url.searchParams.set('code', String(code));
  url.searchParams.set('redirect_uri', redirectUri);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      throw metaProviderError(payload, response, 'META_CODE_EXCHANGE_FAILED');
    }
    return {
      accessToken: String(payload.access_token),
      expiresIn: Number(payload.expires_in || 0) || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function exchangeEmbeddedCodeWithDomainRepair(platform, code, redirectUri) {
  try {
    return {
      exchange: await exchangeEmbeddedCodeWithRedirect(platform, code, redirectUri),
      domainRepairAttempted: false,
      domainRepairChanged: false,
    };
  } catch (error) {
    if (!isMetaAppDomainError(error)) throw error;
    const repair = await ensureMetaAppDomain(platform, redirectUri);
    return {
      exchange: await exchangeEmbeddedCodeWithRedirect(platform, code, redirectUri),
      domainRepairAttempted: true,
      domainRepairChanged: Boolean(repair.changed),
    };
  }
}

export async function discoverWabaIdFromAccessToken(platform, token, options = {}) {
  const appAccessToken = `${String(platform?.appId || '')}|${String(platform?.appSecret || '')}`;
  if (!platform?.appId || !platform?.appSecret || !token) {
    throw Object.assign(new Error('META_WABA_DISCOVERY_CONFIGURATION_MISSING'), { status: 503 });
  }
  const authorizationToken = String(options.authorizationToken || existingMetaDebugToken() || appAccessToken).trim();
  if (!authorizationToken) {
    throw Object.assign(new Error('META_WABA_DISCOVERY_CONFIGURATION_MISSING'), { status: 503 });
  }

  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/debug_token`);
  url.searchParams.set('input_token', String(token));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${authorizationToken}`, accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.data?.is_valid === false) {
      throw metaProviderError(payload, response, 'META_WABA_DISCOVERY_FAILED');
    }

    const granularScopes = Array.isArray(payload?.data?.granular_scopes) ? payload.data.granular_scopes : [];
    const targetIds = granularScopes
      .filter(item => String(item?.scope || '') === 'whatsapp_business_management')
      .flatMap(item => Array.isArray(item?.target_ids) ? item.target_ids : [])
      .map(cleanId)
      .filter(Boolean);
    const uniqueWabas = [...new Set(targetIds)];

    if (uniqueWabas.length === 1) return uniqueWabas[0];
    if (uniqueWabas.length > 1) {
      throw Object.assign(new Error('META_WABA_RESOLUTION_REQUIRED'), { status: 409 });
    }
    throw Object.assign(new Error('META_WABA_DISCOVERY_EMPTY'), { status: 409 });
  } finally {
    clearTimeout(timeout);
  }
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
    if (!response.ok) throw metaProviderError(payload, response, 'META_PHONE_RESOLUTION_FAILED');

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
    let wabaId = cleanId(body?.waba_id);
    let phoneNumberId = cleanId(body?.phone_number_id);
    const onboardingMode = String(body?.onboarding_mode || '').trim();

    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!code || code.length > 4096) return json(res, 400, { ok: false, error: 'META_AUTHORIZATION_CODE_REQUIRED' });

    const owner = await ownerContext(req, businessId);
    const platform = applyDabbirMetaPublicIdentifiers(await resolveEmbeddedPlatformConfig());
    if (!platform.ready) return json(res, 503, { ok: false, error: 'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED' });

    const redirectUri = oauthRedirectUriFromRequest(req);
    const exchangeResult = await exchangeEmbeddedCodeWithDomainRepair(platform, code, redirectUri);
    const exchanged = exchangeResult.exchange;
    if (!wabaId) {
      wabaId = await discoverWabaIdFromAccessToken(platform, exchanged.accessToken);
    }
    if (!wabaId) return json(res, 400, { ok: false, error: 'META_EMBEDDED_SIGNUP_WABA_REQUIRED' });

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
      waba_source: cleanId(body?.waba_id) ? 'embedded_session' : 'debug_token',
      meta_app_domain_repair_attempted: Boolean(exchangeResult.domainRepairAttempted),
      meta_app_domain_repaired: Boolean(exchangeResult.domainRepairChanged),
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, status, {
      ok: false,
      error: String(error?.message || 'WHATSAPP_EMBEDDED_SIGNUP_FAILED').slice(0, 300),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      provider_subcode: error?.providerSubcode || null,
    });
  }
}