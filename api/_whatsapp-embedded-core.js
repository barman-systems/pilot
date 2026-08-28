import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getVerifiedUser,
  getBusinessMemberships,
  supabaseRest,
} from './_auth-core.js';
import { withServerReadTimeout } from './_bounded-server-read.js';

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function legacyWhatsAppAccessToken() {
  return firstEnv(
    'DABBIR_WHATSAPP_ACCESS_TOKEN',
    'PILOT_WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
  );
}

export function embeddedPlatformConfig() {
  const appId = firstEnv(
    'DABBIR_META_APP_ID',
    'DABBIR_WHATSAPP_APP_ID',
    'PILOT_META_APP_ID',
    'PILOT_WHATSAPP_APP_ID',
    'META_APP_ID',
    'FACEBOOK_APP_ID',
  );
  const appSecret = firstEnv(
    'DABBIR_WHATSAPP_APP_SECRET',
    'PILOT_WHATSAPP_APP_SECRET',
    'META_APP_SECRET',
    'FACEBOOK_APP_SECRET',
  );
  const configId = firstEnv(
    'DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID',
    'DABBIR_META_CONFIG_ID',
    'PILOT_WHATSAPP_EMBEDDED_CONFIG_ID',
    'PILOT_META_CONFIG_ID',
    'WHATSAPP_EMBEDDED_CONFIG_ID',
    'META_CONFIG_ID',
  );
  const graphVersion = firstEnv('DABBIR_META_GRAPH_VERSION', 'PILOT_META_GRAPH_VERSION', 'META_GRAPH_VERSION') || 'v23.0';
  const encryptionSecret = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY') || appSecret;
  const encryptionKeyVersion = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY_VERSION') || 'whatsapp_v1';
  const previousEncryptionSecret = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY_PREVIOUS');
  const previousEncryptionKeyVersion = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY_PREVIOUS_VERSION');
  return {
    appId,
    appSecret,
    configId,
    graphVersion,
    encryptionSecret,
    encryptionKeyVersion,
    previousEncryptionSecret,
    previousEncryptionKeyVersion,
    rotationReady: Boolean(
      previousEncryptionSecret
      && previousEncryptionKeyVersion
      && previousEncryptionKeyVersion !== encryptionKeyVersion
    ),
    appIdSource: appId ? 'environment' : null,
    legacyAccessTokenAvailable: Boolean(legacyWhatsAppAccessToken()),
    ready: Boolean(appId && appSecret && configId && encryptionSecret),
  };
}

let discoveredAppIdCache = null;
let discoveredAppIdExpiresAt = 0;

async function discoverAppIdFromExistingToken(config) {
  if (config.appId) return config.appId;
  if (discoveredAppIdCache && Date.now() < discoveredAppIdExpiresAt) return discoveredAppIdCache;
  const token = legacyWhatsAppAccessToken();
  if (!token) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/app`);
    url.searchParams.set('fields', 'id');
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    const id = String(payload?.id || '').trim();
    if (!response.ok || !/^[0-9]{5,40}$/.test(id)) return '';
    discoveredAppIdCache = id;
    discoveredAppIdExpiresAt = Date.now() + 15 * 60 * 1000;
    return id;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveEmbeddedPlatformConfig() {
  const base = embeddedPlatformConfig();
  if (base.appId) return base;
  const appId = await discoverAppIdFromExistingToken(base);
  return {
    ...base,
    appId,
    appIdSource: appId ? 'existing_whatsapp_token' : null,
    ready: Boolean(appId && base.appSecret && base.configId && base.encryptionSecret),
  };
}

export async function ownerContext(req, businessId, options = {}) {
  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const [user, memberships] = await withServerReadTimeout(signal => Promise.all([
    getVerifiedUser(accessToken, { signal }),
    getBusinessMemberships(accessToken, { signal }),
  ]), { timeoutMs: options.timeoutMs, errorCode: 'WHATSAPP_AUTH_DATA_TIMEOUT' });
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const membership = memberships.find(item => String(item.business_id) === String(businessId));
  if (!membership || membership.status !== 'active') throw Object.assign(new Error('BUSINESS_ACCESS_REQUIRED'), { status: 403 });
  if (!['owner', 'admin'].includes(String(membership.role || '').toLowerCase())) {
    throw Object.assign(new Error('OWNER_OR_ADMIN_REQUIRED'), { status: 403 });
  }
  return { accessToken, user, membership };
}

function keySecretForVersion(config, keyVersion) {
  const currentVersion = String(config.encryptionKeyVersion || 'whatsapp_v1');
  const requestedVersion = String(keyVersion || currentVersion);
  if (requestedVersion === currentVersion && config.encryptionSecret) return config.encryptionSecret;
  if (
    requestedVersion === String(config.previousEncryptionKeyVersion || '')
    && config.previousEncryptionSecret
  ) return config.previousEncryptionSecret;
  throw new Error('INTEGRATION_ENCRYPTION_KEY_VERSION_UNAVAILABLE');
}

function keyFor(config, businessId, keyVersion = config.encryptionKeyVersion) {
  const secret = keySecretForVersion(config, keyVersion);
  return crypto.createHash('sha256')
    .update('dabbir-whatsapp-embedded-v1\0')
    .update(String(businessId))
    .update('\0')
    .update(secret)
    .digest();
}

export function sealAccessToken(token, config, businessId) {
  const keyVersion = String(config.encryptionKeyVersion || 'whatsapp_v1');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(config, businessId, keyVersion), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    access_token_ciphertext: ciphertext.toString('base64url'),
    access_token_iv: iv.toString('base64url'),
    access_token_tag: tag.toString('base64url'),
    token_key_version: keyVersion,
  };
}

export function openAccessToken(row, config, businessId) {
  const keyVersion = String(row.token_key_version || 'whatsapp_v1');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFor(config, businessId, keyVersion),
    Buffer.from(String(row.access_token_iv || ''), 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(String(row.access_token_tag || ''), 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(row.access_token_ciphertext || ''), 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function tokenNeedsRotation(row, config) {
  return String(row?.token_key_version || 'whatsapp_v1') !== String(config?.encryptionKeyVersion || 'whatsapp_v1');
}

function connectionStorageError(message, response) {
  const providerStatus = Number(response?.status || 500);
  const status = providerStatus === 401 ? 401 : providerStatus === 403 ? 403 : 502;
  return Object.assign(new Error(message), { status, code: message, providerStatus });
}

export async function rotateStoredConnectionEncryption(accessToken, row, config, token = null, options = {}) {
  if (!row || !tokenNeedsRotation(row, config)) return { rotated: false, row };
  const plaintext = token == null ? openAccessToken(row, config, row.business_id) : String(token);
  const sealed = sealAccessToken(plaintext, config, row.business_id);
  return withServerReadTimeout(async signal => {
    const response = await supabaseRest(
      `dabbir_whatsapp_connections?business_id=eq.${encodeURIComponent(String(row.business_id))}`,
      accessToken,
      {
        method: 'PATCH',
        signal,
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(sealed),
      },
    );
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw connectionStorageError('INTEGRATION_KEY_ROTATION_STORE_FAILED', response);
    const updated = Array.isArray(payload) ? payload[0] || { ...row, ...sealed } : { ...row, ...sealed };
    return { rotated: true, row: updated };
  }, { timeoutMs: options.timeoutMs, errorCode: 'WHATSAPP_CONNECTION_STORE_TIMEOUT' });
}

async function graphFetch(config, path, { method = 'GET', token, query, body } = {}) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${String(path).replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    let payloadBody;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payloadBody = JSON.stringify(body);
    }
    const response = await fetch(url, {
      method,
      headers,
      body: payloadBody,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(payload?.error?.message || 'META_REQUEST_FAILED').slice(0, 300));
      error.status = 502;
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      throw error;
    }
    return { payload, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeEmbeddedCode(config, code) {
  if (!config.ready) throw Object.assign(new Error('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED'), { status: 503 });
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/oauth/access_token`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('client_secret', config.appSecret);
  url.searchParams.set('code', String(code));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      const error = new Error(String(payload?.error?.message || 'META_CODE_EXCHANGE_FAILED').slice(0, 300));
      error.status = 502;
      error.providerStatus = response.status;
      throw error;
    }
    return {
      accessToken: String(payload.access_token),
      expiresIn: Number(payload.expires_in || 0) || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyEmbeddedAssets(config, token, wabaId, phoneNumberId) {
  const phoneResult = await graphFetch(config, phoneNumberId, {
    token,
    query: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status' },
  });
  if (String(phoneResult.payload?.id || '') !== String(phoneNumberId)) {
    throw Object.assign(new Error('META_PHONE_NUMBER_ID_MISMATCH'), { status: 400 });
  }

  const wabaPhones = await graphFetch(config, `${encodeURIComponent(String(wabaId))}/phone_numbers`, {
    token,
    query: { fields: 'id,display_phone_number,verified_name', limit: '100' },
  });
  const belongsToWaba = Array.isArray(wabaPhones.payload?.data)
    && wabaPhones.payload.data.some(item => String(item?.id || '') === String(phoneNumberId));
  if (!belongsToWaba) throw Object.assign(new Error('META_PHONE_NOT_IN_SELECTED_WABA'), { status: 400 });

  const subscription = await graphFetch(config, `${encodeURIComponent(String(wabaId))}/subscribed_apps`, {
    method: 'POST',
    token,
    body: {},
  });

  return {
    displayPhoneNumber: phoneResult.payload?.display_phone_number || null,
    verifiedName: phoneResult.payload?.verified_name || null,
    providerStatus: subscription.status,
  };
}

export async function loadBusinessConnection(accessToken, businessId, options = {}) {
  const path = `dabbir_whatsapp_connections?select=id,business_id,status,meta_app_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,token_expires_at,connected_at,last_verified_at,last_provider_status,last_error&business_id=eq.${encodeURIComponent(String(businessId))}&limit=1`;
  let row = await withServerReadTimeout(async signal => {
    const response = await supabaseRest(path, accessToken, { signal });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw connectionStorageError('WHATSAPP_CONNECTION_READ_FAILED', response);
    return Array.isArray(rows) ? rows[0] || null : null;
  }, { timeoutMs: options.timeoutMs, errorCode: 'WHATSAPP_CONNECTION_READ_TIMEOUT' });
  if (!row) return null;
  const config = embeddedPlatformConfig();
  if (tokenNeedsRotation(row, config) && config.rotationReady) {
    const rotation = await rotateStoredConnectionEncryption(accessToken, row, config, null, options);
    row = rotation.row || row;
  }
  return row;
}

export async function upsertBusinessConnection(accessToken, row, options = {}) {
  return withServerReadTimeout(async signal => {
    const response = await supabaseRest('dabbir_whatsapp_connections?on_conflict=business_id', accessToken, {
      method: 'POST',
      signal,
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      const error = connectionStorageError('WHATSAPP_CONNECTION_STORE_FAILED', response);
      error.details = payload;
      throw error;
    }
    return Array.isArray(payload) ? payload[0] || null : payload;
  }, { timeoutMs: options.timeoutMs, errorCode: 'WHATSAPP_CONNECTION_STORE_TIMEOUT' });
}

export async function removeBusinessConnection(accessToken, businessId, options = {}) {
  return withServerReadTimeout(async signal => {
    const response = await supabaseRest(`dabbir_whatsapp_connections?business_id=eq.${encodeURIComponent(String(businessId))}`, accessToken, {
      method: 'DELETE',
      signal,
      headers: { prefer: 'return=representation' },
    });
    if (!response.ok) throw connectionStorageError('WHATSAPP_CONNECTION_DELETE_FAILED', response);
    return response.json().catch(() => []);
  }, { timeoutMs: options.timeoutMs, errorCode: 'WHATSAPP_CONNECTION_DELETE_TIMEOUT' });
}

export async function unsubscribeWaba(config, token, wabaId) {
  try {
    await graphFetch(config, `${encodeURIComponent(String(wabaId))}/subscribed_apps`, { method: 'DELETE', token });
    return true;
  } catch {
    return false;
  }
}

export async function verifyStoredConnection(config, row) {
  const token = openAccessToken(row, config, row.business_id);
  const result = await graphFetch(config, row.phone_number_id, {
    token,
    query: { fields: 'id,display_phone_number,verified_name' },
  });
  return {
    token,
    authorized: String(result.payload?.id || '') === String(row.phone_number_id),
    displayPhoneNumber: result.payload?.display_phone_number || row.display_phone_number || null,
    verifiedName: result.payload?.verified_name || row.verified_name || null,
    providerStatus: result.status,
  };
}