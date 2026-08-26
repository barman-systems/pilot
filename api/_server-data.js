import crypto from 'node:crypto';

const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';

export function getServerConfig(env = process.env) {
  const serverKey = String(env.PILOT_SUPABASE_SERVER_KEY || '').trim();
  const identityKey = String(env.PILOT_IDENTITY_HMAC_KEY || '').trim();
  if (!serverKey) throw Object.assign(new Error('SERVER_CREDENTIAL_MISSING'), { code: 'SERVER_CREDENTIAL_MISSING' });
  if (!identityKey || identityKey.length < 32) throw Object.assign(new Error('IDENTITY_HMAC_KEY_MISSING'), { code: 'IDENTITY_HMAC_KEY_MISSING' });
  return { serverKey, identityKey };
}

export function hashProviderEvent(source, kind, externalId, state = '') {
  const canonical = [String(source || '').toLowerCase(), String(kind || '').toLowerCase(), String(externalId || ''), String(state || '').toLowerCase()].join(':');
  if (!externalId) throw Object.assign(new Error('EXTERNAL_EVENT_ID_REQUIRED'), { code: 'EXTERNAL_EVENT_ID_REQUIRED' });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function hashCustomerIdentity(rawIdentity, key) {
  const value = String(rawIdentity || '').trim();
  if (!value) throw Object.assign(new Error('CUSTOMER_IDENTITY_REQUIRED'), { code: 'CUSTOMER_IDENTITY_REQUIRED' });
  if (!key || String(key).length < 32) throw Object.assign(new Error('IDENTITY_HMAC_KEY_MISSING'), { code: 'IDENTITY_HMAC_KEY_MISSING' });
  return crypto.createHmac('sha256', String(key)).update(value).digest('hex');
}

export async function serverRest(path, options = {}, env = process.env) {
  const { serverKey } = getServerConfig(env);
  const headers = new Headers(options.headers || {});
  headers.set('apikey', serverKey);
  headers.set('authorization', `Bearer ${serverKey}`);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers, cache: 'no-store' });
  return response;
}

export async function parseRestResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: response.ok, status: response.status, data };
}

export function serverRuntimeReadiness(env = process.env) {
  const runtimeEnabled = String(env.PILOT_WHATSAPP_RUNTIME_ENABLED || '') === '1';
  const serverKey = Boolean(String(env.PILOT_SUPABASE_SERVER_KEY || '').trim());
  const identityKey = String(env.PILOT_IDENTITY_HMAC_KEY || '').trim().length >= 32;
  return {
    runtime_enabled: runtimeEnabled,
    server_credential: serverKey,
    identity_hmac_key: identityKey,
    ready_for_persistence: runtimeEnabled && serverKey && identityKey,
  };
}
