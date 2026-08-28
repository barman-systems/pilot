import { json } from '../../_auth-core.js';
import { applyDabbirMetaPublicIdentifiers } from '../../_dabbir-meta-public-config.js';
import { resolveEmbeddedPlatformConfig } from '../../_whatsapp-embedded-core.js';
import { readMobileConnectSession } from '../_whatsapp-connect-core.js';

function queryValue(req, name) {
  try {
    const url = new URL(req.url || '/', 'https://dabbir.invalid');
    return String(url.searchParams.get(name) || '').trim();
  } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const state = queryValue(req, 'state');
    await readMobileConnectSession(state, ['pending']);
    const platform = applyDabbirMetaPublicIdentifiers(await resolveEmbeddedPlatformConfig());
    if (!platform?.ready) return json(res, 503, { ok: false, error: 'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED' });
    return json(res, 200, {
      ok: true,
      app_id: platform.appId,
      config_id: platform.configId,
      graph_version: platform.graphVersion,
      sdk_locale: 'en_US',
      onboarding_mode: 'whatsapp_business_app_onboarding',
      secrets_exposed: false,
    });
  } catch (error) {
    return json(res, Number(error?.status || 500), { ok: false, error: String(error?.message || 'WHATSAPP_MOBILE_CONFIG_FAILED').slice(0, 300) });
  }
}
