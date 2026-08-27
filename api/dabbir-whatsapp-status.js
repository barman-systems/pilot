import { singleQueryValue } from './_request-query.js';
import { accessTokenFromRequest, getVerifiedUser, json } from './_auth-core.js';
import {
  embeddedPlatformConfig,
  loadBusinessConnection,
  ownerContext,
  verifyStoredConnection,
} from './_whatsapp-embedded-core.js';

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

async function embeddedStatus(req, accessToken, businessId) {
  await ownerContext(req, businessId);
  const row = await loadBusinessConnection(accessToken, businessId);
  if (!row || row.status === 'disconnected') return null;
  const platform = embeddedPlatformConfig();
  const subscriptionRecorded = Number(row.last_provider_status || 0) >= 200 && Number(row.last_provider_status || 0) < 300;
  try {
    const verified = await verifyStoredConnection(platform, row);
    const authorized = Boolean(verified.authorized);
    return {
      ok: true,
      channel: 'whatsapp',
      source: 'embedded_signup',
      configured: true,
      connected: authorized,
      webhook_configured: authorized && subscriptionRecorded,
      outbound_configured: authorized,
      phone_number_configured: true,
      waba_configured: true,
      state: authorized ? 'META_AUTHORIZED' : 'AUTHORIZATION_INVALID',
      meta_authorized: authorized,
      meta_check_attempted: true,
      meta_check_reason: authorized ? null : 'META_AUTHORIZATION_CHECK_FAILED',
      provider_status: verified.providerStatus || null,
      phone: authorized ? {
        display_phone_number: verified.displayPhoneNumber,
        verified_name: verified.verifiedName,
      } : null,
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
      connected: false,
      webhook_configured: false,
      outbound_configured: false,
      phone_number_configured: true,
      waba_configured: true,
      state: 'AUTHORIZATION_INVALID',
      meta_authorized: false,
      meta_check_attempted: true,
      meta_check_reason: String(error?.message || 'META_AUTHORIZATION_CHECK_UNAVAILABLE').slice(0, 200),
      provider_status: error?.providerStatus || null,
      phone: null,
      waba_id: row.waba_id,
      phone_number_id: row.phone_number_id,
      connected_at: row.connected_at,
      operational: false,
      operational_reason: 'WHATSAPP_AUTHORIZATION_INVALID',
      checked_at: new Date().toISOString(),
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  // Customer-facing WhatsApp state is always business-scoped. Inferring a
  // business or falling back to server/global credentials caused the wrong
  // phone number to appear in newly-created accounts, so ambiguity is rejected.
  const businessId = String(singleQueryValue(req, 'business_id') || '').trim();
  if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

  try {
    const tenant = await embeddedStatus(req, accessToken, businessId);
    return json(res, 200, tenant || tenantUnconfiguredStatus());
  } catch (error) {
    return json(res, Number(error?.status || error?.code || 500), { ok: false, error: error?.message || 'REQUEST_FAILED' });
  }
}
