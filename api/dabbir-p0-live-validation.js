import { getWhatsAppConfig, verifyMetaAuthorization } from './dabbir-whatsapp-status.js';

const TEST_BRANCH = 'feat/dabbir-market-reality-killer-job';
const TEST_PROJECT_REF = 'krjqfgkqksyknryolhdz';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  return res.end(JSON.stringify(payload));
}

function previewOnly() {
  return process.env.VERCEL_ENV === 'preview'
    && String(process.env.VERCEL_GIT_COMMIT_REF || '') === TEST_BRANCH;
}

function databaseTarget() {
  const urls = [process.env.SUPABASE_URL, process.env.SUPABASE_DATA_URL]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (!urls.length) return 'unconfigured';
  if (urls.every(value => value.includes(`${TEST_PROJECT_REF}.supabase.co`))) return 'p0_test_branch';
  return 'non_test_database_blocked';
}

function maskedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : null;
}

export default async function handler(req, res) {
  if (!previewOnly()) return json(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  const config = getWhatsAppConfig();
  const database = databaseTarget();
  const authorization = await verifyMetaAuthorization(config);
  return json(res, 200, {
    ok: true,
    scope: 'DABBIR_P0_TEST_ONLY',
    database_target: database,
    database_safe_for_test_execution: database === 'p0_test_branch',
    whatsapp: {
      webhook_configured: config.webhookConfigured,
      outbound_configured: config.outboundConfigured,
      waba_configured: Boolean(config.wabaId),
      authorized: authorization.authorized === true,
      authorization_attempted: authorization.attempted === true,
      authorization_reason: authorization.reason || null,
      provider_status: authorization.provider_status || null,
      phone_suffix: maskedPhone(authorization.phone?.display_phone_number),
      test_recipient_configured: Boolean(String(process.env.DABBIR_WHATSAPP_TEST_RECIPIENT || '').trim()),
      graph_version: config.graphVersion,
    },
    live_execution_allowed: database === 'p0_test_branch'
      && config.webhookConfigured
      && config.outboundConfigured
      && authorization.authorized === true
      && Boolean(String(process.env.DABBIR_WHATSAPP_TEST_RECIPIENT || '').trim()),
    secrets_exposed: false,
    checked_at: new Date().toISOString(),
  });
}
