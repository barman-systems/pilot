import { accessTokenFromRequest, getVerifiedUser, json } from '../../_auth-core.js';
import { requireNativeBearer } from '../_native-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireNativeBearer(req, res)) return;
  const token = accessTokenFromRequest(req);
  const user = token ? await getVerifiedUser(token).catch(() => null) : null;
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  // Fail closed until App Store Connect issuer/key credentials and server-side
  // StoreKit transaction verification are provisioned. The client must never
  // grant paid entitlement from a local purchase callback alone.
  if (!process.env.APP_STORE_CONNECT_ISSUER_ID || !process.env.APP_STORE_CONNECT_KEY_ID || !process.env.APP_STORE_CONNECT_PRIVATE_KEY) {
    return json(res, 503, { ok: false, verified: false, error: 'APPLE_IAP_SERVER_VERIFICATION_NOT_CONFIGURED' });
  }

  return json(res, 501, { ok: false, verified: false, error: 'APPLE_IAP_SERVER_VERIFICATION_IMPLEMENTATION_REQUIRED' });
}
