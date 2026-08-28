import { singleQueryValue } from './_request-query.js';
import { accessTokenFromRequest, getVerifiedUser, json } from './_auth-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { loadBusinessConnection, ownerContext, resolveEmbeddedPlatformConfig } from './_whatsapp-embedded-core.js';

function readiness(platform) {
  return {
    app_id_configured: Boolean(platform.appId),
    app_secret_configured: Boolean(platform.appSecret),
    embedded_config_id_configured: Boolean(platform.configId),
    encryption_configured: Boolean(platform.encryptionSecret),
    existing_whatsapp_token_available: Boolean(platform.legacyAccessTokenAvailable),
    app_id_source: platform.appIdSource || null,
    config_id_source: platform.configIdSource || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const platform = applyDabbirMetaPublicIdentifiers(await resolveEmbeddedPlatformConfig());
  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  const platformReadiness = readiness(platform);

  if (!user) {
    return json(res, 200, {
      ok: true,
      auth_required: true,
      platform_ready: platform.ready,
      platform_readiness: platformReadiness,
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
      platform_ready: platform.ready,
      platform_readiness: platformReadiness,
      app_id: platform.ready ? platform.appId : null,
      config_id: platform.ready ? platform.configId : null,
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
