import { singleQueryValue } from './_request-query.js';
import { accessTokenFromRequest, getBusinessMemberships, getVerifiedUser, json } from './_auth-core.js';
import {
  embeddedPlatformConfig,
  loadBusinessConnection,
  ownerContext,
  verifyStoredConnection,
} from './_whatsapp-embedded-core.js';

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function getWhatsAppConfig() {
  const verifyToken = firstEnv('DABBIR_WHATSAPP_VERIFY_TOKEN', 'PILOT_WHATSAPP_VERIFY_TOKEN');
  const appSecret = firstEnv('DABBIR_WHATSAPP_APP_SECRET', 'PILOT_WHATSAPP_APP_SECRET');
  const accessToken = firstEnv(
    'DABBIR_WHATSAPP_ACCESS_TOKEN',
    'PILOT_WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
  );
  const phoneNumberId = firstEnv(
    'DABBIR_WHATSAPP_PHONE_NUMBER_ID',
    'PILOT_WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_PHONE_NUMBER_ID',
  );
  const wabaId = firstEnv(
    'DABBIR_WHATSAPP_BUSINESS_ACCOUNT_ID',
    'PILOT_WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WABA_ID',
  );
  const graphVersion = firstEnv('DABBIR_META_GRAPH_VERSION', 'PILOT_META_GRAPH_VERSION', 'META_GRAPH_VERSION') || 'v23.0';
  const webhookConfigured = Boolean(verifyToken && appSecret);
  const outboundConfigured = Boolean(accessToken && phoneNumberId);
  const configured = webhookConfigured || outboundConfigured;
  return { verifyToken, appSecret, accessToken, phoneNumberId, wabaId, graphVersion, webhookConfigured, outboundConfigured, configured };
}

function publicConfig(config) {
  let state = 'NOT_CONFIGURED';
  if (config.webhookConfigured && config.outboundConfigured) state = 'CONFIGURED_READY_FOR_VERIFICATION';
  else if (config.webhookConfigured) state = 'WEBHOOK_LINKED';
  else if (config.outboundConfigured) state = 'OUTBOUND_CONFIGURED';
  else if (config.configured) state = 'PARTIALLY_CONFIGURED';
  return {
    configured: config.configured,
    connected: config.webhookConfigured || config.outboundConfigured,
    webhook_configured: config.webhookConfigured,
    outbound_configured: config.outboundConfigured,
    phone_number_configured: Boolean(config.phoneNumberId),
    waba_configured: Boolean(config.wabaId),
    state,
  };
}

export function tenantUnconfiguredStatus(reason = 'TENANT_WHATSAPP_NOT_LINKED') {
  return {
    ok: true,
    channel: 'whatsapp',
    source: 'embedded_signup',
    configured: false,
    connected: false,
    webhook_configured: false,
    outbound_configured: false,
    phone_number_configured: false,
    waba_configured: false,
    state: 'NOT_CONFIGURED',
    meta_authorized: false,
    meta_check_attempted: false,
    meta_check_reason: reason,
    provider_status: null,
    phone: null,
    waba_id: null,
    phone_number_id: null,
    connected_at: null,
    operational: false,
    operational_reason: 'WHATSAPP_NOT_LINKED',
    checked_at: new Date().toISOString(),
  };
}

export async function verifyMetaAuthorization(config = getWhatsAppConfig()) {
  if (!config.accessToken || !config.phoneNumberId) return { attempted: false, authorized: false, reason: 'META_READ_CREDENTIALS_NOT_CONFIGURED' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}`);
    url.searchParams.set('fields', 'display_phone_number,verified_name');
    const response = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${config.accessToken}` }, cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { attempted: true, authorized: false, reason: 'META_AUTHORIZATION_CHECK_FAILED', provider_status: response.status };
    return {
      attempted: true,
      authorized: true,
      reason: null,
      provider_status: response.status,
      phone: { display_phone_number: payload?.display_phone_number || null, verified_name: payload?.verified_name || null },
    };
  } catch (error) {
    return { attempted: true, authorized: false, reason: error?.name === 'AbortError' ? 'META_AUTHORIZATION_CHECK_TIMEOUT' : 'META_AUTHORIZATION_CHECK_UNAVAILABLE' };
  } finally {
    clearTimeout(timeout);
  }
}

async function embeddedStatus(req, accessToken, businessId) {
  await ownerContext(req, businessId);
  const row = await loadBusinessConnection(accessToken, businessId);
  if (!row) return null;
  const platform = embeddedPlatformConfig();
  try {
    const verified = await verifyStoredConnection(platform, row);
    return {
      ok: true,
      channel: 'whatsapp',
      source: 'embedded_signup',
      configured: true,
      connected: Boolean(verified.authorized),
      webhook_configured: Boolean(firstEnv('DABBIR_WHATSAPP_VERIFY_TOKEN', 'PILOT_WHATSAPP_VERIFY_TOKEN') && platform.appSecret),
      outbound_configured: Boolean(verified.authorized),
      phone_number_configured: true,
      waba_configured: true,
      state: verified.authorized ? 'META_AUTHORIZED' : 'AUTHORIZATION_INVALID',
      meta_authorized: Boolean(verified.authorized),
      meta_check_attempted: true,
      meta_check_reason: verified.authorized ? null : 'META_AUTHORIZATION_CHECK_FAILED',
      provider_status: verified.providerStatus || null,
      phone: {
        display_phone_number: verified.displayPhoneNumber,
        verified_name: verified.verifiedName,
      },
      waba_id: row.waba_id,
      phone_number_id: row.phone_number_id,
      connected_at: row.connected_at,
      operational: false,
      operational_reason: 'LIVE_MESSAGE_PATH_NOT_YET_VERIFIED',
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: true,
      channel: 'whatsapp',
      source: 'embedded_signup',
      configured: true,
      connected: true,
      webhook_configured: Boolean(firstEnv('DABBIR_WHATSAPP_VERIFY_TOKEN', 'PILOT_WHATSAPP_VERIFY_TOKEN') && platform.appSecret),
      outbound_configured: true,
      phone_number_configured: true,
      waba_configured: true,
      state: 'CONNECTED_VERIFICATION_FAILED',
      meta_authorized: false,
      meta_check_attempted: true,
      meta_check_reason: String(error?.message || 'META_AUTHORIZATION_CHECK_UNAVAILABLE').slice(0, 200),
      provider_status: error?.providerStatus || null,
      phone: { display_phone_number: row.display_phone_number || null, verified_name: row.verified_name || null },
      waba_id: row.waba_id,
      phone_number_id: row.phone_number_id,
      connected_at: row.connected_at,
      operational: false,
      operational_reason: 'LIVE_MESSAGE_PATH_NOT_YET_VERIFIED',
      checked_at: new Date().toISOString(),
    };
  }
}

async function tenantStatus(req, accessToken, businessId) {
  const tenant = await embeddedStatus(req, accessToken, businessId);
  return tenant || tenantUnconfiguredStatus();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  const businessId = String(singleQueryValue(req, 'business_id') || '').trim();
  if (businessId) {
    try {
      return json(res, 200, await tenantStatus(req, accessToken, businessId));
    } catch (error) {
      return json(res, Number(error?.status || error?.code || 500), { ok: false, error: error?.message || 'REQUEST_FAILED' });
    }
  }

  // The authenticated DABBIR UI must never inherit a global/server WhatsApp
  // identity. When the caller omitted business_id, resolve the tenant only if
  // there is exactly one active membership; otherwise fail closed with a
  // tenant-unconfigured payload. This keeps old platform credentials usable for
  // webhook infrastructure without ever presenting that legacy number as the
  // current customer's WhatsApp number.
  try {
    const memberships = await getBusinessMemberships(accessToken);
    const businessIds = [...new Set((Array.isArray(memberships) ? memberships : [])
      .map(item => String(item?.business_id || '').trim())
      .filter(Boolean))];
    if (businessIds.length === 1) {
      return json(res, 200, await tenantStatus(req, accessToken, businessIds[0]));
    }
    return json(res, 200, tenantUnconfiguredStatus(businessIds.length > 1 ? 'BUSINESS_CONTEXT_REQUIRED' : 'TENANT_WHATSAPP_NOT_LINKED'));
  } catch (error) {
    return json(res, Number(error?.status || error?.code || 500), { ok: false, error: error?.message || 'REQUEST_FAILED' });
  }
}
