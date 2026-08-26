import { accessTokenFromRequest, getVerifiedUser, json, readJsonBody, readRpcJson, requireSameOrigin, rpcErrorCode, supabaseRpc } from '../_auth-core.js';

const roles = new Set(['admin','manager','employee','staff','viewer','agent']);
const permissions = new Set(['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs']);

function normalizePermissions(value) {
  if (!Array.isArray(value)) return [];
  const result = [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
  if (result.length > 32 || result.some(v => !permissions.has(v))) throw Object.assign(new Error('INVALID_PERMISSIONS'), { code: 400 });
  return result;
}

function errorStatus(code) {
  if (['TEAM_MANAGEMENT_REQUIRED','PERMISSION_GRANT_NOT_ALLOWED','OWNER_IMMUTABLE'].includes(code)) return 403;
  if (code === 'MEMBERSHIP_NOT_FOUND') return 404;
  if (code === 'NEW_INVITATION_REQUIRED') return 409;
  return 400;
}

export default async function handler(req, res) {
  const token = accessTokenFromRequest(req);
  const actor = await getVerifiedUser(token);
  if (!actor) return json(res, 401, { ok:false, error:'AUTH_REQUIRED' });

  if (req.method === 'GET') {
    const businessId = String(req.query?.business_id || '').trim();
    if (!businessId) return json(res, 400, { ok:false, error:'BUSINESS_REQUIRED' });
    const response = await supabaseRpc('dabbir_list_team', token, { p_business_id: businessId });
    const payload = await readRpcJson(response);
    if (!response.ok) return json(res, 403, { ok:false, error:rpcErrorCode(payload, 'TEAM_LIST_FAILED') });
    return json(res, 200, { ok:true, members:Array.isArray(payload) ? payload : [] });
  }

  if (req.method !== 'PATCH') return json(res, 405, { ok:false, error:'METHOD_NOT_ALLOWED' }, { allow:'GET, PATCH' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok:false, error:'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const businessId = String(body.business_id || '').trim();
    const userId = String(body.user_id || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!businessId || !userId) return json(res, 400, { ok:false, error:!businessId ? 'BUSINESS_REQUIRED' : 'USER_REQUIRED' });
    if (userId === actor.id) return json(res, 403, { ok:false, error:'SELF_TEAM_MUTATION_BLOCKED' });

    if (action === 'update_access') {
      const role = String(body.role || '').trim().toLowerCase();
      if (!roles.has(role)) return json(res, 400, { ok:false, error:'INVALID_ROLE' });
      const memberPermissions = normalizePermissions(body.permissions);
      const response = await supabaseRpc('dabbir_update_employee_access', token, { p_business_id:businessId, p_user_id:userId, p_role:role, p_permissions:memberPermissions });
      const payload = await readRpcJson(response);
      if (!response.ok) {
        const code = rpcErrorCode(payload, 'MEMBERSHIP_UPDATE_FAILED');
        return json(res, errorStatus(code), { ok:false, error:code });
      }
      return json(res, 200, { ok:true, member:Array.isArray(payload) ? payload[0] : payload });
    }

    const nextStatus = action === 'suspend' ? 'suspended' : action === 'reactivate' ? 'active' : action === 'remove' ? 'removed' : null;
    if (!nextStatus) return json(res, 400, { ok:false, error:'INVALID_ACTION' });
    const response = await supabaseRpc('dabbir_set_employee_status', token, { p_business_id:businessId, p_user_id:userId, p_status:nextStatus });
    const payload = await readRpcJson(response);
    if (!response.ok) {
      const code = rpcErrorCode(payload, 'MEMBERSHIP_STATUS_FAILED');
      return json(res, errorStatus(code), { ok:false, error:code });
    }
    return json(res, 200, { ok:true, member:Array.isArray(payload) ? payload[0] : payload, company_access_active:nextStatus === 'active' });
  } catch (error) {
    const code = error?.message === 'INVALID_PERMISSIONS' ? 'INVALID_PERMISSIONS' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'TEAM_UPDATE_UNAVAILABLE';
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, { ok:false, error:code });
  }
}
