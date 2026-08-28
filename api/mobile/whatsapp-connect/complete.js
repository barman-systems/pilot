import { json, readJsonBody } from '../../_auth-core.js';
import { ownerContext } from '../../_whatsapp-embedded-core.js';
import { requireNativeBearer } from '../_native-core.js';
import {
  beginMobileConnectCompletion,
  finishMobileConnectSession,
  readMobileConnectSession,
} from '../_whatsapp-connect-core.js';
import { completeNativeWhatsApp } from '../_whatsapp-native-complete.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;

  let reserved = null;
  try {
    const body = await readJsonBody(req, 4096);
    const state = String(body?.state || '').trim();
    const pending = await readMobileConnectSession(state, ['captured']);
    const owner = await ownerContext(req, pending.business_id);
    if (String(owner.user.id) !== String(pending.user_id)) {
      return json(res, 403, { ok: false, error: 'WHATSAPP_MOBILE_SESSION_OWNER_MISMATCH' });
    }

    reserved = await beginMobileConnectCompletion({ state, userId: owner.user.id });
    const result = await completeNativeWhatsApp({ owner, row: reserved.row, code: reserved.code });
    await finishMobileConnectSession(reserved.row.state_hash, 'consumed');
    return json(res, 200, result);
  } catch (error) {
    if (reserved?.row?.state_hash) {
      await finishMobileConnectSession(reserved.row.state_hash, 'failed', error?.message || 'WHATSAPP_MOBILE_COMPLETE_FAILED').catch(() => null);
    }
    return json(res, Number(error?.status || error?.code || 500), {
      ok: false,
      error: String(error?.message || 'WHATSAPP_MOBILE_COMPLETE_FAILED').slice(0, 300),
      provider_status: error?.providerStatus || null,
      provider_code: error?.providerCode || null,
      provider_subcode: error?.providerSubcode || null,
    });
  }
}
