import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getVerifiedUser,
  getBusinessMemberships,
  supabaseRest,
} from './_auth-core.js';
import { DABBIR_PUBLIC_RUNTIME } from '../config/dabbir-public-runtime.js';

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function embeddedPlatformConfig() {
  // Embedded Signup has one DABBIR identity. Do not infer it from legacy PILOT,
  // generic Meta env vars, or an old tenant token. App/config IDs are public
  // product configuration; the app secret remains server-only.
  const envAppId = firstEnv('DABBIR_META_APP_ID', 'DABBIR_WHATSAPP_APP_ID');
  const envConfigId = firstEnv('DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID', 'DABBIR_META_CONFIG_ID');
  const appId = envAppId || DABBIR_PUBLIC_RUNTIME.metaAppId;
  const appSecret = firstEnv('DABBIR_WHATSAPP_APP_SECRET');
  const configId = envConfigId || DABBIR_PUBLIC_RUNTIME.whatsappEmbeddedConfigId;
  const graphVersion = firstEnv('DABBIR_META_GRAPH_VERSION') || DABBIR_PUBLIC_RUNTIME.metaGraphVersion;
  const encryptionSecret = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY') || appSecret;
  return {
    appId,
    appSecret,
    configId,
    graphVersion,
    encryptionSecret,
    appIdSource: envAppId ? 'dabbir_environment' : 'dabbir_public_runtime',
    configIdSource: envConfigId ? 'dabbir_environment' : 'dabbir_public_runtime',
    ready: Boolean(appId && appSecret && configId && encryptionSecret),
  };
}

export async function resolveEmbeddedPlatformConfig() {
  return embeddedPlatformConfig();
}

export async function ownerContext(req, businessId) {
  const accessToken = accessTokenFromRequest(req);
  const user = accessToken ? await getVerifiedUser(accessToken).catch(() => null) : null;
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const memberships = await getBusinessMemberships(accessToken).catch(() => []);
  const membership = memberships.find(item => String(item.business_id) === String(businessId));
  if (!membership || membership.status !== 'active') throw Object.assign(new Error('BUSINESS_ACCESS_REQUIRED'), { status: 403 });
  if (!['owner', 'admin'].includes(String(membership.role || '').toLowerCase())) {
    throw Object.assign(new Error('OWNER_OR_ADMIN_REQUIRED'), { status: 403 });
  }
  return { accessToken, user, membership };
}

function keyFor(config, businessId) {
  if (!config.encryptionSecret) throw new Error('INTEGRATION_ENCRYPTION_NOT_CONFIGURED');
  return crypto.createHash('sha256')
    .update('dabbir-whatsapp-embedded-v1\0')
    .update(String(businessId))
    .update('\0')
    .update(config.encryptionSecret)
    .digest();
}

export function sealAccessToken(token, config, businessId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(config, businessId), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    access_token_ciphertext: ciphertext.toString('base64url'),
    access_token_iv: iv.toString('base64url'),
    access_token_tag: tag.toString('base64url'),
    token_key_version: 'whatsapp_v1',
  };
}

export function openAccessToken(row, config, businessId) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFor(config, businessId),
    Buffer.from(String(row.access_token_iv || ''), 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(String(row.access_token_tag || ''), 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(row.access_token_ciphertext || ''), 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
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
      error.providerCode = payload?.error?.code || null;
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

export async function loadBusinessConnection(accessToken, businessId) {
  const path = `dabbir_whatsapp_connections?select=id,business_id,status,meta_app_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,token_expires_at,connected_at,last_verified_at,last_provider_status,last_error&business_id=eq.${encodeURIComponent(String(businessId))}&limit=1`;
  const response = await supabaseRest(path, accessToken);
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function upsertBusinessConnection(accessToken, row) {
  const response = await supabaseRest('dabbir_whatsapp_connections?on_conflict=business_id', accessToken, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error('WHATSAPP_CONNECTION_STORE_FAILED');
    error.status = 502;
    error.details = payload;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] || null : payload;
}

export async function removeBusinessConnection(accessToken, businessId) {
  const response = await supabaseRest(`dabbir_whatsapp_connections?business_id=eq.${encodeURIComponent(String(businessId))}`, accessToken, {
    method: 'DELETE',
    headers: { prefer: 'return=representation' },
  });
  if (!response.ok) throw Object.assign(new Error('WHATSAPP_CONNECTION_DELETE_FAILED'), { status: 502 });
  return response.json().catch(() => []);
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
