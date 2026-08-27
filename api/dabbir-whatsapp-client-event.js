import { accessTokenFromRequest, getVerifiedUser, json, readJsonBody, requireSameOrigin } from './_auth-core.js';

function clean(value, max = 120) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  try {
    const body = await readJsonBody(req, 4096);
    const event = clean(body?.event, 48);
    const stage = clean(body?.stage, 48);
    const error = clean(body?.error, 160);
    const safe = {
      event: event || 'unknown',
      stage: stage || null,
      error: error || null,
      has_code: Boolean(body?.has_code),
      has_waba: Boolean(body?.has_waba),
      has_phone: Boolean(body?.has_phone),
    };
    console.info('[DABBIR_WHATSAPP_EMBEDDED_CLIENT]', JSON.stringify(safe));
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, Number(error?.code || 400), { ok: false, error: String(error?.message || 'INVALID_EVENT').slice(0, 120) });
  }
}
