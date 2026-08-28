import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerContext } from './_whatsapp-embedded-core.js';
import {
  createOwnerSandboxSession,
  sandboxServerCapability,
  verifySandboxSender,
} from './_whatsapp-sandbox-core.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeBusinessId(value) {
  const id = String(value || '').trim();
  return UUID_RE.test(id) ? id : null;
}

function queryValue(req, name) {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function unavailablePayload(sender = null) {
  const capability = sandboxServerCapability();
  return {
    ok: true,
    available: false,
    mode: 'OWNER_SANDBOX',
    ownership: 'DABBIR_OWNED_TEST_NUMBER',
    reason: sender?.reason || (capability.configured ? 'WHATSAPP_SANDBOX_SENDER_UNVERIFIED' : 'WHATSAPP_SANDBOX_PLATFORM_NOT_CONFIGURED'),
    phone_number_configured: capability.phone_number_configured,
    access_token_configured: capability.access_token_configured,
    tenant_whatsapp_connected: false,
    operational: false,
    secrets_exposed: false,
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  }
  if (req.method === 'POST' && !requireSameOrigin(req)) {
    return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });
  }

  try {
    let body = null;
    if (req.method === 'POST') body = await readJsonBody(req, 8 * 1024);
    const businessId = safeBusinessId(req.method === 'GET' ? queryValue(req, 'business_id') : body?.business_id);
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });

    await ownerContext(req, businessId);

    if (req.method === 'GET') {
      const sender = await verifySandboxSender();
      if (!sender.ok) return json(res, 200, unavailablePayload(sender));
      return json(res, 200, {
        ok: true,
        available: true,
        mode: 'OWNER_SANDBOX',
        ownership: 'DABBIR_OWNED_TEST_NUMBER',
        display_phone_number: sender.display_phone_number,
        verified_name: sender.verified_name,
        tenant_whatsapp_connected: false,
        operational: false,
        production_upgrade: 'META_EMBEDDED_SIGNUP_REQUIRED_FOR_OWN_NUMBER',
        secrets_exposed: false,
      });
    }

    const session = await createOwnerSandboxSession({ businessId, ttlMinutes: 20 });
    return json(res, 201, {
      ok: true,
      available: true,
      mode: session.mode,
      ownership: 'DABBIR_OWNED_TEST_NUMBER',
      whatsapp_url: session.whatsappUrl,
      display_phone_number: session.displayPhoneNumber,
      verified_name: session.verifiedName,
      expires_at: session.expiresAt,
      expires_in_minutes: 20,
      tenant_whatsapp_connected: false,
      operational: false,
      production_upgrade: 'META_EMBEDDED_SIGNUP_REQUIRED_FOR_OWN_NUMBER',
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 413, 429, 502, 503, 504].includes(status) ? status : 500;
    return json(res, safeStatus, {
      ok: false,
      available: false,
      mode: 'OWNER_SANDBOX',
      error: String(error?.code || error?.message || 'WHATSAPP_SANDBOX_REQUEST_FAILED').slice(0, 160),
      tenant_whatsapp_connected: false,
      operational: false,
      secrets_exposed: false,
    });
  }
}
