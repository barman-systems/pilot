import { json } from './_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  const serverAdminConfigured = Boolean(
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim() ||
    String(process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  );
  return json(res, 200, {
    ok: true,
    service: 'dabbir-qa-capability',
    server_admin_configured: serverAdminConfigured,
    values_exposed: false,
  });
}
