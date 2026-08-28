import { json, readJsonBody, requireSameOrigin } from '../../_auth-core.js';
import { captureMobileConnectCode } from '../_whatsapp-connect-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });
  try {
    const body = await readJsonBody(req, 12 * 1024);
    const row = await captureMobileConnectCode({
      state: String(body?.state || '').trim(),
      code: String(body?.code || '').trim(),
      wabaId: body?.waba_id,
      phoneNumberId: body?.phone_number_id,
    });
    return json(res, 200, {
      ok: true,
      captured: true,
      status: row.status,
      secrets_exposed: false,
    });
  } catch (error) {
    return json(res, Number(error?.status || error?.code || 500), {
      ok: false,
      error: String(error?.message || 'WHATSAPP_MOBILE_CAPTURE_FAILED').slice(0, 300),
    });
  }
}
