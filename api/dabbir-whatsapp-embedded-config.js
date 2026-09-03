import { singleQueryValue } from './_request-query.js';
import { accessTokenFromRequest, getVerifiedUser, json } from './_auth-core.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { ownerContext, resolveEmbeddedPlatformConfig } from './_whatsapp-embedded-core.js';
import {
  loadBusinessBranchConnection,
  loadPrimaryBusinessConnection,
} from './_whatsapp-branch-connection.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

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
  const branchRaw=String(singleQueryValue(req,'branch_id')||'').trim();
  const branchId=branchRaw?safeId(branchRaw):null;
  if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
  if(branchRaw&&!branchId)return json(res,400,{ok:false,error:'VALID_BRANCH_REQUIRED'});

  try {
    await ownerContext(req, businessId);
    const connection = branchId
      ? await loadBusinessBranchConnection(accessToken,businessId,branchId)
      : await loadPrimaryBusinessConnection(accessToken,businessId);
    return json(res, 200, {
      ok: true,
      auth_required: false,
      platform_ready: platform.ready,
      platform_readiness: platformReadiness,
      app_id: platform.ready ? platform.appId : null,
      config_id: platform.ready ? platform.configId : null,
      graph_version: platform.graphVersion,
      sdk_locale: 'en_US',
      branch_id: connection?.branch_id || branchId || null,
      connection_id: connection?.id || null,
      connected: Boolean(connection && connection.status !== 'disconnected'),
      connection: connection ? {
        id: connection.id,
        branch_id: connection.branch_id,
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
