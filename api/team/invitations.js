import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  requireSameOrigin,
  rpcErrorCode,
  supabaseRest,
  supabaseRpc,
} from '../_auth-core.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleSet = new Set(['admin', 'manager', 'employee', 'staff', 'viewer', 'agent']);
const permissionSet = new Set([
  'view_business','manage_business','manage_team','view_integrations','manage_integrations',
  'view_customers','edit_customers','view_conversations','reply_conversations',
  'view_appointments','manage_appointments','manage_automations','view_analytics',
  'manage_billing','export_data','view_services','manage_services','view_knowledge',
  'manage_knowledge','view_quality','manage_handoffs',
]);

function cleanPermissions(value) {
  if (!Array.isArray(value)) return [];
  const out = [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
  if (out.length > 32 || out.some(p => !permissionSet.has(p))) throw Object.assign(new Error('INVALID_PERMISSIONS'), { code: 400 });
  return out;
}

export default async function handler(req, res) {
  const accessToken = accessTokenFromRequest(req);
  const user = await getVerifiedUser(accessToken);
  if (!user) return json(res, 401, { ok: false, error: 'AUTH_REQUIRED' });

  if (req.method === 'GET') {
    const businessId = String(req.query?.business_id || '').trim();
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    const query = `dabbir_employee_invitations?business_id=eq.${encodeURIComponent(businessId)}&select=id,email,display_name,role,permissions,status,delivery_status,delivery_attempts,expires_at,accepted_at,created_at&order=created_at.desc`;
    const response = await supabaseRest(query, accessToken);
    if (!response.ok) return json(res, response.status === 403 ? 403 : 502, { ok: false, error: 'INVITATION_LIST_FAILED' });
    return json(res, 200, { ok: true, invitations: await response.json() });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req);
    const businessId = String(body.business_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const displayName = String(body.display_name || '').trim().slice(0, 120);
    const role = String(body.role || 'employee').trim().toLowerCase();
    const permissions = cleanPermissions(body.permissions);
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if (!emailPattern.test(email) || email.length > 254) return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
    if (!roleSet.has(role)) return json(res, 400, { ok: false, error: 'INVALID_ROLE' });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const response = await supabaseRpc('dabbir_create_employee_invitation', accessToken, {
      p_business_id: businessId,
      p_email: email,
      p_display_name: displayName || null,
      p_role: role,
      p_permissions: permissions,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    const payload = await readRpcJson(response);
    if (!response.ok) {
      const code = rpcErrorCode(payload, 'INVITATION_CREATE_FAILED');
      const status = ['TEAM_MANAGEMENT_REQUIRED','PERMISSION_GRANT_NOT_ALLOWED'].includes(code) ? 403 :
        ['INVITATION_ALREADY_PENDING','EMPLOYEE_ALREADY_MEMBER'].includes(code) ? 409 : 400;
      return json(res, status, { ok: false, error: code });
    }
    const invitation = Array.isArray(payload) ? payload[0] : payload;
    return json(res, 201, {
      ok: true,
      invitation,
      invite_token: token,
      invite_path: `/team.html?invite=${encodeURIComponent(token)}`,
      delivery: { status: 'prepared', provider_required: true },
    });
  } catch (error) {
    return json(res, error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500, {
      ok: false,
      error: error?.message === 'INVALID_PERMISSIONS' ? 'INVALID_PERMISSIONS' : error?.message === 'INVALID_JSON' ? 'INVALID_JSON' : error?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVITATION_UNAVAILABLE',
    });
  }
}
