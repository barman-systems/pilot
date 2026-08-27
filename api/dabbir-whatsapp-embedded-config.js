import { singleQueryValue } from './_request-query.js';
import { accessTokenFromRequest, getVerifiedUser, json } from './_auth-core.js';
import { loadBusinessConnection, ownerContext, resolveEmbeddedPlatformConfig } from './_whatsapp-embedded-core.js';
import { DABBIR_PUBLIC_RUNTIME, isCanonicalProductionRequest, requestHost } from '../config/dabbir-public-runtime.js';

function readiness(platform, originReady) {
  return {
    app_id_configured: Boolean(platform.appId),
    app_secret_configured: Boolean(platform.appSecret),
    embedded_config_id_configured: Boolean(platform.configId),
    encryption_configured: Boolean(platform.encryptionSecret),
    canonical_origin_configured: Boolean(DABBIR_PUBLIC_RUNTIME.productionOrigin),
    canonical_origin_active: Boolean(originReady),
    app_id_source: platform.appIdSource || null,
    config_id_source: platform.configIdSource || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const platform = await resolveEmbeddedPlatformConfig();
  const originReady = isCanonicalProductionRequest(req);
  const platformReady = Boolean(platform.ready && originReady);
  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  const platformReadiness = readiness(platform, originReady);

  if (!user) {
    return json(res, 200, {
      ok: true,
      auth_required: true,
      platform_ready: platformReady,
      platform_readiness: platformReadiness,
      expected_origin: DABBIR_PUBLIC_RUNTIME.productionOrigin,
      request_host: requestHost(req),
      graph_version: platform.graphVersion,
      values_exposed: false,
    });
  }

  const businessId = String(singleQueryValue(req, 'business_id') || '').trim();
  if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

  try {
    await ownerContext(req, businessId);
    const connection = await loadBusinessConnection(accessToken, businessId);
    return json(res, 200, {
      ok: true,
      auth_required: false,
      platform_ready: platformReady,
      platform_readiness: platformReadiness,
      expected_origin: DABBIR_PUBLIC_RUNTIME.productionOrigin,
      request_host: requestHost(req),
      app_id: platformReady ? platform.appId : null,
      config_id: platformReady ? platform.configId : null,
      graph_version: platform.graphVersion,
      sdk_locale: 'en_US',
      connected: Boolean(connection && connection.status !== 'disconnected'),
      connection: connection ? {
        status: connection.status,
        waba_id: connection.waba_id,
        phone_number_id: connection.phone_number_id,
        display_phone_number: connection.display_phone_number,
        verified_name: connection.verified_name,
        connected_at: connection.connected_at,
        last_verified_at: connection.last_verified_at,
      } : null,
      secrets_exposed: false,
    });
  } catch (error) {
    return json(res, Number(error?.status || 500), { ok: false, error: error?.message || 'REQUEST_FAILED' });
  }
}
