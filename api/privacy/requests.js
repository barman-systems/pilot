import {
  ACCESS_COOKIE,
  getVerifiedUser,
  json,
  parseCookies,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from '../_auth-core.js';
import { attachCorrelation, correlationId, logEvent } from '../_observability.js';

const REQUEST_TYPES = new Set(['BUSINESS_EXPORT','BUSINESS_DELETE','CUSTOMER_EXPORT','CUSTOMER_DELETE']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(res, status, body, cid) {
  attachCorrelation(res, cid);
  return json(res, status, { ...body, correlation_id: cid });
}

async function authenticatedContext(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const accessToken = cookies[ACCESS_COOKIE];
  const user = await getVerifiedUser(accessToken);
  return user ? { accessToken, user } : null;
}

export default async function handler(req, res) {
  const cid = correlationId(req);
  attachCorrelation(res, cid);

  if (!['GET','POST'].includes(req.method)) {
    return reply(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, cid);
  }
  if (req.method === 'POST' && !requireSameOrigin(req)) {
    return reply(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' }, cid);
  }

  try {
    const context = await authenticatedContext(req);
    if (!context) return reply(res, 401, { ok: false, error: 'AUTH_REQUIRED' }, cid);

    if (req.method === 'GET') {
      const response = await supabaseRest(
        'pilot_privacy_requests?select=id,business_id,customer_id,request_type,status,requested_at,completed_at&order=requested_at.desc&limit=100',
        context.accessToken,
      );
      if (!response.ok) {
        logEvent('warn', { correlation_id: cid, component: 'privacy', operation: 'list_requests', outcome: 'FAILED', failure_class: 'DATA', status: response.status });
        return reply(res, response.status === 401 || response.status === 403 ? 403 : 503, { ok: false, error: 'PRIVACY_REQUEST_LOOKUP_FAILED' }, cid);
      }
      return reply(res, 200, { ok: true, requests: await response.json() }, cid);
    }

    const body = await readJsonBody(req, 8192);
    const businessId = String(body.business_id || '').trim();
    const customerId = body.customer_id == null ? null : String(body.customer_id).trim();
    const requestType = String(body.request_type || '').trim().toUpperCase();
    const requestScope = body.request_scope && typeof body.request_scope === 'object' && !Array.isArray(body.request_scope)
      ? body.request_scope
      : {};

    if (!UUID.test(businessId) || !REQUEST_TYPES.has(requestType)) {
      return reply(res, 400, { ok: false, error: 'INVALID_PRIVACY_REQUEST' }, cid);
    }
    const isCustomerRequest = requestType.startsWith('CUSTOMER_');
    if ((isCustomerRequest && (!customerId || !UUID.test(customerId))) || (!isCustomerRequest && customerId !== null)) {
      return reply(res, 400, { ok: false, error: 'INVALID_PRIVACY_REQUEST_SCOPE' }, cid);
    }
    if (Buffer.byteLength(JSON.stringify(requestScope), 'utf8') > 8192) {
      return reply(res, 413, { ok: false, error: 'PRIVACY_REQUEST_SCOPE_TOO_LARGE' }, cid);
    }

    const payload = {
      business_id: businessId,
      customer_id: customerId,
      request_type: requestType,
      status: 'REQUESTED',
      requested_by: context.user.id,
      correlation_id: cid,
      request_scope: requestScope,
    };
    const response = await supabaseRest('pilot_privacy_requests?select=id,business_id,customer_id,request_type,status,requested_at', context.accessToken, {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logEvent('warn', { correlation_id: cid, component: 'privacy', operation: 'create_request', outcome: 'FAILED', failure_class: response.status === 401 || response.status === 403 ? 'AUTHORIZATION' : 'DATA', status: response.status, request_type: requestType });
      return reply(res, response.status === 401 || response.status === 403 ? 403 : 503, { ok: false, error: 'PRIVACY_REQUEST_REJECTED' }, cid);
    }
    const rows = await response.json();
    const created = Array.isArray(rows) ? rows[0] : null;
    logEvent('info', { correlation_id: cid, component: 'privacy', operation: 'create_request', outcome: 'VERIFIED_SUCCESS', request_type: requestType, persisted: true });
    return reply(res, 202, {
      ok: true,
      request: created,
      execution_state: 'REVIEW_REQUIRED',
      data_exported: false,
      data_deleted: false,
    }, cid);
  } catch (error) {
    const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : error?.code === 401 ? 401 : 503;
    return reply(res, status, { ok: false, error: error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'PRIVACY_SERVICE_UNAVAILABLE' }, cid);
  }
}
