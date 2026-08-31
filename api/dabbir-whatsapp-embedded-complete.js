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

function requestPageRedirectUri(req) {
  const header = name => {
    const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
    return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  };
  const originHeader = header('origin');
  let requestOrigin = '';
  if (originHeader) {
    try { requestOrigin = new URL(originHeader).origin; } catch { requestOrigin = ''; }
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
    } catch {}
  }
  throw Object.assign(new Error('META_OAUTH_REDIRECT_URI_REQUIRED'), { status: 400 });
}

function oauthRedirectUriFromRequest(req) {
  return requestPageRedirectUri(req);
}

function normalizedHost(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return String(url.hostname || '').toLowerCase();
  } catch { return ''; }
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

function isRedirectMismatchError(error) {
  const message = String(error?.message || '').toLowerCase();
  return Number(error?.providerSubcode || 0) === 36008
    || message.includes('redirect_uri is identical')
    || message.includes('redirect_uri is not identical')
    || message.includes('redirect_uri');
}

async function graphJson(platform, path, token, { params = {}, timeoutMs = 8000 } = {}) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw metaProviderError(payload, response, 'META_GRAPH_REQUEST_FAILED');
    return payload;
  } finally { clearTimeout(timeout); }
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
    if (!response.ok || payload?.success === false) throw metaProviderError(payload, response, 'META_APP_DOMAIN_UPDATE_FAILED');
    return payload;
  } finally { clearTimeout(timeout); }
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
  if (!platform?.ready) throw Object.assign(new Error('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED'), { status: 503 });
  if (!redirectUri) throw Object.assign(new Error('META_OAUTH_REDIRECT_URI_REQUIRED'), { status: 400 });
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/oauth/access_token`);
  url.searchParams.set('client_id', platform.appId);
  url.searchParams.set('client_secret', platform.appSecret);
  url.searchParams.set('code', String(code));
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('redirect_uri', redirectUri);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) throw metaProviderError(payload, response, 'META_CODE_EXCHANGE_FAILED');
    return { accessToken: String(payload.access_token), expiresIn: Number(payload.expires_in || 0) || null };
  } finally { clearTimeout(timeout); }
}

function sdkRedirectCandidates(requestRedirectUri) {
  const values = [String(requestRedirectUri || '').trim()];
  try { values.push(`${new URL(String(requestRedirectUri || '')).origin}/`); } catch {}
  values.push(
    'https://www.facebook.com/connect/login_success.html',
    'https://www.facebook.com/connect/login_success.html?display=popup',
  );
  return [...new Set(values.filter(Boolean))];
}

async function exchangeEmbeddedCodeWithDomainRepair(platform, code, redirectUri) {
  const appHost = normalizedHost(redirectUri);
  let domainRepairAttempted = false;
  let domainRepairChanged = false;
  let lastRedirectError = null;
  let lastAppDomainError = null;
  for (const candidate of sdkRedirectCandidates(redirectUri)) {
    try {
      return {
        exchange: await exchangeEmbeddedCodeWithRedirect(platform, code, candidate),
        domainRepairAttempted,
        domainRepairChanged,
        redirectFallbackUsed: candidate !== redirectUri,
      };
    } catch (error) {
      const candidateIsAppDomain = normalizedHost(candidate) === appHost;
      if (isMetaAppDomainError(error)) {
        if (!candidateIsAppDomain) { lastAppDomainError = error; continue; }
        domainRepairAttempted = true;
        const repair = await ensureMetaAppDomain(platform, redirectUri);
        domainRepairChanged = domainRepairChanged || Boolean(repair.changed);
        try {
          return {
            exchange: await exchangeEmbeddedCodeWithRedirect(platform, code, candidate),
            domainRepairAttempted,
            domainRepairChanged,
            redirectFallbackUsed: candidate !== redirectUri,
          };
        } catch (retryError) {
          if (isRedirectMismatchError(retryError)) { lastRedirectError = retryError; continue; }
          if (isMetaAppDomainError(retryError)) { lastAppDomainError = retryError; continue; }
          throw retryError;
        }
      }
      if (isRedirectMismatchError(error)) { lastRedirectError = error; continue; }
      throw error;
    }
  }
  try {
    return {
      exchange: await exchangeEmbeddedCode(platform, code),
      domainRepairAttempted,
      domainRepairChanged,
      redirectFallbackUsed: true,
    };
  } catch (error) {
    if (isRedirectMismatchError(error) && lastRedirectError) throw lastRedirectError;
    if (lastAppDomainError && isMetaAppDomainError(error)) throw lastAppDomainError;
    throw error;
  }
}

function idsFromRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => cleanId(row?.id)).filter(Boolean);
}

function granularTargetIds(granularScopes, scopeName) {
  return [...new Set((Array.isArray(granularScopes) ? granularScopes : [])
    .filter(item => String(item?.scope || '') === scopeName)
    .flatMap(item => Array.isArray(item?.target_ids) ? item.target_ids : [])
    .map(cleanId)
    .filter(Boolean))];
}

function businessIdFromActor(payload) {
  const direct = cleanId(payload?.business?.id || payload?.business);
  return direct || '';
}

async function listBusinessWabas(platform, token, seedBusinessIds = []) {
  let businessIds = [...new Set((Array.isArray(seedBusinessIds) ? seedBusinessIds : []).map(cleanId).filter(Boolean))];

  if (!businessIds.length) {
    try {
      const actor = await graphJson(platform, 'me', token, { params: { fields: 'id,business' } });
      const actorBusinessId = businessIdFromActor(actor);
      if (actorBusinessId) businessIds.push(actorBusinessId);
    } catch (error) {
      console.warn('dabbir_whatsapp_actor_business_discovery_failed', {
        provider_status: error?.providerStatus || null,
        provider_code: error?.providerCode || null,
        provider_message: String(error?.message || '').slice(0, 180),
      });
    }
  }

  if (!businessIds.length) {
    try {
      const payload = await graphJson(platform, 'me/businesses', token, { params: { fields: 'id,name', limit: 100 } });
      businessIds = (Array.isArray(payload?.data) ? payload.data : []).map(row => cleanId(row?.id)).filter(Boolean);
    } catch (error) {
      console.warn('dabbir_whatsapp_business_discovery_failed', {
        provider_status: error?.providerStatus || null,
        provider_code: error?.providerCode || null,
        provider_message: String(error?.message || '').slice(0, 180),
      });
    }
  }

  businessIds = [...new Set(businessIds)].slice(0, 30);
  if (!businessIds.length) return [];

  const results = await Promise.allSettled(businessIds.flatMap(businessId => [
    graphJson(platform, `${encodeURIComponent(businessId)}/owned_whatsapp_business_accounts`, token, { params: { fields: 'id,name', limit: 100 } }),
    graphJson(platform, `${encodeURIComponent(businessId)}/client_whatsapp_business_accounts`, token, { params: { fields: 'id,name', limit: 100 } }),
  ]));
  const ids = [];
  const failures = [];
  for (const result of results) {
    if (result.status === 'fulfilled') ids.push(...idsFromRows(result.value?.data));
    else failures.push(result.reason);
  }
  if (!ids.length && failures.length) {
    const firstFailure = failures[0];
    console.warn('dabbir_whatsapp_waba_edge_discovery_failed', {
      business_count: businessIds.length,
      failed_edges: failures.length,
      provider_status: firstFailure?.providerStatus || null,
      provider_code: firstFailure?.providerCode || null,
      provider_message: String(firstFailure?.message || '').slice(0, 180),
    });
  }
  return [...new Set(ids)];
}

async function phoneRowsForWaba(platform, token, wabaId) {
  const payload = await graphJson(platform, `${encodeURIComponent(wabaId)}/phone_numbers`, token, {
    params: { fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type', limit: 100 },
  });
  return Array.isArray(payload?.data) ? payload.data : [];
}

function isCoexistencePhone(row) {
  return row?.is_on_biz_app === true && String(row?.platform_type || '').toUpperCase() === 'CLOUD_API';
}

async function narrowWabasByCoexistencePhone(platform, token, wabaIds) {
  const results = await Promise.allSettled(wabaIds.map(async wabaId => ({
    wabaId,
    phones: await phoneRowsForWaba(platform, token, wabaId),
  })));
  return results
    .filter(result => result.status === 'fulfilled' && result.value.phones.some(isCoexistencePhone))
    .map(result => result.value.wabaId);
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
  const payload = await graphJson(platform, 'debug_token', authorizationToken, {
    params: { input_token: String(token) },
  });
  if (payload?.data?.is_valid === false) {
    throw Object.assign(new Error('META_WABA_DISCOVERY_FAILED'), { status: 502 });
  }
  const granularScopes = Array.isArray(payload?.data?.granular_scopes) ? payload.data.granular_scopes : [];
  const uniqueWabas = granularTargetIds(granularScopes, 'whatsapp_business_management');
  if (uniqueWabas.length === 1) return uniqueWabas[0];
  if (uniqueWabas.length > 1) {
    throw Object.assign(new Error('META_WABA_RESOLUTION_REQUIRED'), { status: 409 });
  }

  const businessTargetIds = granularTargetIds(granularScopes, 'business_management');
  const scopes = new Set((Array.isArray(payload?.data?.scopes) ? payload.data.scopes : []).map(value => String(value || '')));
  const granularNames = new Set(granularScopes.map(item => String(item?.scope || '')));
  const regressionShape = scopes.has('whatsapp_business_management')
    || scopes.has('business_management')
    || granularNames.has('business_management');
  if (!regressionShape) throw Object.assign(new Error('META_WABA_DISCOVERY_EMPTY'), { status: 409 });

  console.info('dabbir_whatsapp_debug_scope_shape', {
    whatsapp_target_count: uniqueWabas.length,
    business_target_count: businessTargetIds.length,
    scope_count: scopes.size,
    granular_scope_names: [...granularNames].slice(0, 12),
  });

  const graphWabas = await listBusinessWabas(platform, token, businessTargetIds);
  if (graphWabas.length === 1) return graphWabas[0];
  if (graphWabas.length > 1 && options.onboardingMode === 'whatsapp_business_app_onboarding') {
    const coexistenceWabas = await narrowWabasByCoexistencePhone(platform, token, graphWabas);
    if (coexistenceWabas.length === 1) return coexistenceWabas[0];
  }
  if (graphWabas.length > 1) throw Object.assign(new Error('META_WABA_RESOLUTION_REQUIRED'), { status: 409 });
  throw Object.assign(new Error('META_WABA_DISCOVERY_EMPTY'), { status: 409 });
}

async function resolveCoexistencePhoneNumberId(platform, token, wabaId) {
  const phones = await phoneRowsForWaba(platform, token, wabaId);
  const coexistence = phones.filter(isCoexistencePhone);
  if (coexistence.length === 1) return cleanId(coexistence[0]?.id);
  if (phones.length === 1) return cleanId(phones[0]?.id);
  throw Object.assign(new Error('META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED'), { status: 409 });
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

    if (!wabaId) wabaId = await discoverWabaIdFromAccessToken(platform, exchanged.accessToken, { onboardingMode });
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
      meta_sdk_redirect_fallback_used: Boolean(exchangeResult.redirectFallbackUsed),
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.warn('dabbir_whatsapp_embedded_complete_failed', {
      error: String(error?.message || 'WHATSAPP_EMBEDDED_SIGNUP_FAILED').slice(0, 180),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      provider_subcode: error?.providerSubcode || null,
    });
    return json(res, status, {
      ok: false,
      error: String(error?.message || 'WHATSAPP_EMBEDDED_SIGNUP_FAILED').slice(0, 300),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      provider_subcode: error?.providerSubcode || null,
    });
  }
}
