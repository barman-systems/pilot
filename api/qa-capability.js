import { json } from './_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const calendarTokenKey = String(process.env.DABBIR_CALENDAR_TOKEN_KEY || '').trim();
  const calendarStateSecret = String(process.env.DABBIR_CALENDAR_STATE_SECRET || calendarTokenKey).trim();
  const googleCalendarClientId = String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const googleCalendarClientSecret = String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  const microsoftCalendarClientId = String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_ID || '').trim();
  const microsoftCalendarClientSecret = String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_SECRET || '').trim();

  const serverAdminConfigured = Boolean(
    serviceRoleKey ||
    String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim() ||
    String(process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  );

  return json(res, 200, {
    ok: true,
    service: 'dabbir-qa-capability',
    server_admin_configured: serverAdminConfigured,
    calendar_storage_configured: Boolean(serviceRoleKey && !serviceRoleKey.startsWith('sb_publishable_')),
    calendar_security_configured: calendarTokenKey.length >= 24 && calendarStateSecret.length >= 24,
    google_calendar_configured: Boolean(googleCalendarClientId && googleCalendarClientSecret),
    outlook_calendar_configured: Boolean(microsoftCalendarClientId && microsoftCalendarClientSecret),
    values_exposed: false,
  });
}
