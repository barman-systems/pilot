import { accessTokenFromRequest, getVerifiedUser, json } from './_auth-core.js';

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

  return {
    verifyToken,
    appSecret,
    accessToken,
    phoneNumberId,
    wabaId,
    graphVersion,
    webhookConfigured,
    outboundConfigured,
    configured,
  };
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

export async function verifyMetaAuthorization(config = getWhatsAppConfig()) {
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      attempted: false,
      authorized: false,
      reason: 'META_READ_CREDENTIALS_NOT_CONFIGURED',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}`);
    url.searchParams.set('fields', 'display_phone_number,verified_name');
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${config.accessToken}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        attempted: true,
        authorized: false,
        reason: 'META_AUTHORIZATION_CHECK_FAILED',
        provider_status: response.status,
      };
    }
    return {
      attempted: true,
      authorized: true,
      reason: null,
      provider_status: response.status,
      phone: {
        display_phone_number: payload?.display_phone_number || null,
        verified_name: payload?.verified_name || null,
      },
    };
  } catch (error) {
    return {
      attempted: true,
      authorized: false,
      reason: error?.name === 'AbortError' ? 'META_AUTHORIZATION_CHECK_TIMEOUT' : 'META_AUTHORIZATION_CHECK_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  const config = getWhatsAppConfig();
  const base = publicConfig(config);
  const meta = await verifyMetaAuthorization(config);
  const metaAuthorized = Boolean(meta.authorized);
  const state = metaAuthorized ? 'META_AUTHORIZED' : base.state;

  return json(res, 200, {
    ok: true,
    channel: 'whatsapp',
    ...base,
    connected: metaAuthorized || base.connected,
    state,
    meta_authorized: metaAuthorized,
    meta_check_attempted: Boolean(meta.attempted),
    meta_check_reason: meta.reason || null,
    provider_status: meta.provider_status || null,
    phone: metaAuthorized ? meta.phone : null,
    operational: false,
    operational_reason: 'LIVE_MESSAGE_PATH_NOT_YET_VERIFIED',
    checked_at: new Date().toISOString(),
  });
}
