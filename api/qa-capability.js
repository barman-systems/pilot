import { json } from './_auth-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });

  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const calendarTokenKey = String(process.env.DABBIR_CALENDAR_TOKEN_KEY || '').trim();
  const calendarStateSecret = String(process.env.DABBIR_CALENDAR_STATE_SECRET || '').trim();
  const googleCalendarClientId = String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const googleCalendarClientSecret = String(process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  const microsoftCalendarClientId = String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_ID || '').trim();
  const microsoftCalendarClientSecret = String(process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_SECRET || '').trim();

  let supabaseProjectRef = null;
  try {
    const host = new URL(supabaseUrl).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    if (match) supabaseProjectRef = match[1];
  } catch {}

  const usableServiceRoleKey = Boolean(serviceRoleKey.length >= 24 && !serviceRoleKey.startsWith('sb_publishable_'));
  const calendarRootSecretConfigured = calendarTokenKey.length >= 24 || usableServiceRoleKey;
  const calendarStateConfigured = calendarStateSecret.length >= 24 || calendarRootSecretConfigured;
  const serverAdminConfigured = Boolean(
    serviceRoleKey ||
    String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim() ||
    String(process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  );

  return json(res, 200, {
    ok: true,
    service: 'dabbir-qa-capability',
    supabase_project_ref: supabaseProjectRef,
    server_admin_configured: serverAdminConfigured,
    calendar_storage_configured: usableServiceRoleKey,
    calendar_security_configured: calendarRootSecretConfigured && calendarStateConfigured,
    calendar_dedicated_secret_configured: calendarTokenKey.length >= 24,
    google_calendar_configured: Boolean(googleCalendarClientId && googleCalendarClientSecret),
    outlook_calendar_configured: Boolean(microsoftCalendarClientId && microsoftCalendarClientSecret),
    values_exposed: false,
  });
}
