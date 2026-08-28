import crypto from 'node:crypto';
import { resolveEmbeddedPlatformConfig } from '../_whatsapp-embedded-core.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/, '');
const TABLE = 'dabbir_whatsapp_mobile_connect_sessions';
const STATE_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[0-9]{5,40}$/;

function failure(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

function serviceRoleKey() {
  const value = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!value || value.startsWith('sb_publishable_')) throw failure('WHATSAPP_MOBILE_SESSION_STORAGE_NOT_CONFIGURED', 503);
  return value;
}

async function serviceRest(path, options = {}) {
  const key = serviceRoleKey();
  const headers = new Headers(options.headers || {});
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers, cache: 'no-store' });
}

async function jsonRows(response, code) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { throw failure(`${code}_MALFORMED`, 502); }
  }
  if (!response.ok) throw failure(code, response.status === 401 || response.status === 403 ? 503 : 502);
  if (!Array.isArray(payload)) throw failure(`${code}_MALFORMED`, 502);
  return payload;
}

export function newMobileConnectState() {
  return crypto.randomBytes(32).toString('base64url');
}

export function mobileConnectStateHash(state) {
  const value = String(state || '').trim();
  if (!STATE_RE.test(value)) throw failure('WHATSAPP_MOBILE_STATE_INVALID', 400);
  return crypto.createHash('sha256').update(value).digest('hex');
}

function codeKey(platform, businessId, stateHash, keyVersion) {
  const currentVersion = String(platform?.encryptionKeyVersion || 'whatsapp_v1');
  const previousVersion = String(platform?.previousEncryptionKeyVersion || '');
  let secret = '';
  if (String(keyVersion || currentVersion) === currentVersion) secret = String(platform?.encryptionSecret || '');
  else if (String(keyVersion) === previousVersion) secret = String(platform?.previousEncryptionSecret || '');
  if (!secret) throw failure('WHATSAPP_MOBILE_CODE_ENCRYPTION_NOT_CONFIGURED', 503);
  return crypto.createHash('sha256')
    .update('dabbir-whatsapp-mobile-code-v2\0')
    .update(String(businessId))
    .update('\0')
    .update(String(stateHash))
    .update('\0')
    .update(secret)
    .digest();
}

async function sealCode(code, row) {
  const platform = await resolveEmbeddedPlatformConfig();
  if (!platform?.ready) throw failure('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED', 503);
  const keyVersion = String(platform.encryptionKeyVersion || 'whatsapp_v1');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', codeKey(platform, row.business_id, row.state_hash, keyVersion), iv);
  const ciphertext = Buffer.concat([cipher.update(String(code), 'utf8'), cipher.final()]);
  return {
    code_ciphertext: ciphertext.toString('base64url'),
    code_iv: iv.toString('base64url'),
    code_tag: cipher.getAuthTag().toString('base64url'),
    code_key_version: keyVersion,
  };
}

async function openCode(row) {
  const platform = await resolveEmbeddedPlatformConfig();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    codeKey(platform, row.business_id, row.state_hash, row.code_key_version),
    Buffer.from(String(row.code_iv || ''), 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(String(row.code_tag || ''), 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(row.code_ciphertext || ''), 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

function cleanId(value) {
  const text = String(value || '').trim();
  return ID_RE.test(text) ? text : null;
}

export async function createMobileConnectSession({ state, userId, businessId, redirectUri, expiresAt }) {
  const stateHash = mobileConnectStateHash(state);
  if (!UUID_RE.test(String(userId || '')) || !UUID_RE.test(String(businessId || ''))) throw failure('WHATSAPP_MOBILE_SESSION_IDENTITY_INVALID', 400);
  const response = await serviceRest(`${TABLE}?on_conflict=state_hash`, {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      state_hash: stateHash,
      user_id: userId,
      business_id: businessId,
      status: 'pending',
      redirect_uri: String(redirectUri),
      expires_at: new Date(expiresAt).toISOString(),
      onboarding_mode: 'whatsapp_business_app_onboarding',
    }),
  });
  const rows = await jsonRows(response, 'WHATSAPP_MOBILE_SESSION_CREATE_FAILED');
  if (rows.length !== 1) throw failure('WHATSAPP_MOBILE_STATE_COLLISION', 409);
  return rows[0];
}

export async function readMobileConnectSession(state, allowedStatuses = ['pending','captured','completing']) {
  const stateHash = mobileConnectStateHash(state);
  const response = await serviceRest(`${TABLE}?select=state_hash,user_id,business_id,status,redirect_uri,code_ciphertext,code_iv,code_tag,code_key_version,waba_id,phone_number_id,onboarding_mode,created_at,expires_at,captured_at,completing_at,consumed_at,failed_at,last_error&state_hash=eq.${stateHash}&limit=1`);
  const rows = await jsonRows(response, 'WHATSAPP_MOBILE_SESSION_READ_FAILED');
  const row = rows[0] || null;
  if (!row) throw failure('WHATSAPP_MOBILE_SESSION_NOT_FOUND', 404);
  if (!allowedStatuses.includes(String(row.status || ''))) throw failure('WHATSAPP_MOBILE_SESSION_NOT_ACTIVE', 409);
  if (Date.parse(String(row.expires_at || '')) <= Date.now()) throw failure('WHATSAPP_MOBILE_SESSION_EXPIRED', 410);
  return row;
}

export async function captureMobileConnectCode({ state, code, wabaId, phoneNumberId }) {
  const text = String(code || '').trim();
  if (!text || text.length > 4096) throw failure('META_AUTHORIZATION_CODE_REQUIRED', 400);
  const row = await readMobileConnectSession(state, ['pending']);
  const sealed = await sealCode(text, row);
  const response = await serviceRest(`${TABLE}?state_hash=eq.${row.state_hash}&status=eq.pending`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'captured',
      ...sealed,
      waba_id: cleanId(wabaId),
      phone_number_id: cleanId(phoneNumberId),
      captured_at: new Date().toISOString(),
      last_error: null,
    }),
  });
  const rows = await jsonRows(response, 'WHATSAPP_MOBILE_CAPTURE_FAILED');
  if (rows.length !== 1) throw failure('WHATSAPP_MOBILE_CAPTURE_REPLAYED', 409);
  return rows[0];
}

export async function beginMobileConnectCompletion({ state, userId }) {
  const row = await readMobileConnectSession(state, ['captured']);
  if (String(row.user_id) !== String(userId)) throw failure('WHATSAPP_MOBILE_SESSION_OWNER_MISMATCH', 403);
  const code = await openCode(row);
  const response = await serviceRest(`${TABLE}?state_hash=eq.${row.state_hash}&status=eq.captured`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ status: 'completing', completing_at: new Date().toISOString() }),
  });
  const rows = await jsonRows(response, 'WHATSAPP_MOBILE_COMPLETION_RESERVE_FAILED');
  if (rows.length !== 1) throw failure('WHATSAPP_MOBILE_COMPLETION_REPLAYED', 409);
  return { row: rows[0], code };
}

export async function finishMobileConnectSession(stateHash, status, error = null) {
  if (!['consumed','failed'].includes(status)) throw failure('WHATSAPP_MOBILE_TERMINAL_STATE_INVALID', 500);
  const now = new Date().toISOString();
  const response = await serviceRest(`${TABLE}?state_hash=eq.${encodeURIComponent(String(stateHash))}&status=eq.completing`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      status,
      code_ciphertext: null,
      code_iv: null,
      code_tag: null,
      code_key_version: null,
      consumed_at: status === 'consumed' ? now : null,
      failed_at: status === 'failed' ? now : null,
      last_error: error ? String(error).slice(0, 300) : null,
    }),
  });
  const rows = await jsonRows(response, 'WHATSAPP_MOBILE_TERMINAL_STORE_FAILED');
  if (rows.length !== 1) throw failure('WHATSAPP_MOBILE_TERMINAL_STATE_LOST', 409);
  return rows[0];
}
