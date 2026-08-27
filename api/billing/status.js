import { singleQueryValue } from '../_request-query.js';
import { json } from '../_auth-core.js';
import { getBillingAccount, publicBillingState, requireBillingOwner } from '../_billing-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  try {
    const context = await requireBillingOwner(req, singleQueryValue(req, 'business_id'));
    const account = await getBillingAccount(context.accessToken, context.businessId);
    return json(res, 200, { ok: true, billing: publicBillingState(account), livemode: false });
  } catch (error) {
    const status = Number(error?.code || 500);
    return json(res, [400, 401, 403, 503].includes(status) ? status : 500, { ok: false, error: String(error?.message || 'BILLING_STATUS_UNAVAILABLE') });
  }
}
