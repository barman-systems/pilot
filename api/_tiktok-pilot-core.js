import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
} from './_auth-core.js';
import { applySupabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/, '');
const DEFAULT_SCOPES = ['message.list.read', 'message.list.send', 'message.list.manage'];

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function firstEnv(...names) {
  for (const name of names) {
    const value = clean(process.env[name], 8192);
    if (value) return value;
  }
  return '';
}

function requestOrigin(req) {
  const proto = clean(req?.headers?.['x-forwarded-proto'] || 'https', 20).split(',')[0].trim();
  const host = clean(req?.headers?.['x-forwarded-host'] || req?.headers?.host, 500).split(',')[0].trim();
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) return '';
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

export function tiktokPilotConfig(req) {
  const appId = firstEnv('DABBIR_TIKTOK_APP_ID', 'TIKTOK_APP_ID');
  const appSecret = firstEnv('DABBIR_TIKTOK_APP_SECRET', 'TIKTOK_APP_SECRET');
  const explicitRedirect = firstEnv('DABBIR_TIKTOK_REDIRECT_URI', 'TIKTOK_REDIRECT_URI');
  const origin = requestOrigin(req);
  const redirectUri = explicitRedirect || (origin ? `${origin}/api/dabbir-tiktok-callback` : '');
  const integrationSecret = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY') || appSecret;
  const keyVersion = firstEnv('DABBIR_INTEGRATION_ENCRYPTION_KEY_VERSION') || 'tiktok_v1';
  const scopeEnv = firstEnv('DABBIR_TIKTOK_SCOPES');
  const scopes = (scopeEnv ? scopeEnv.split(',') : DEFAULT_SCOPES)
    .map(item => clean(item, 120))
    .filter(Boolean);
  return {
    appId,
    appSecret,
    redirectUri,
    integrationSecret,
    keyVersion,
    scopes: [...new Set(scopes)],
    ready: Boolean(appId && appSecret && redirectUri && integrationSecret),
  };
}

function serviceKey() {
  return firstEnv('SUPABASE_SERVICE_ROLE_KEY');
}

async function serviceRest(path, options = {}) {
  const key = serviceKey();
  if (!key) throw Object.assign(new Error('TIKTOK_SERVER_DATA_ACCESS_NOT_CONFIGURED'), { status: 503 });
  const headers = new Headers(options.headers || {});
  applySupabaseKeyHeaders(headers, key);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error('TIKTOK_CONNECTION_STORE_FAILED');
    error.status = response.status >= 500 ? 502 : response.status;
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

export async function tiktokOwnerContext(req, businessId) {
  const accessToken = accessTokenFromRequest(req);
  if (!accessToken) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const [user, memberships] = await Promise.all([
    getVerifiedUser(accessToken),
    getBusinessMemberships(accessToken),
  ]);
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const membership = memberships.find(item => String(item.business_id) === String(businessId));
  if (!membership || membership.status !== 'active') {
    throw Object.assign(new Error('BUSINESS_ACCESS_REQUIRED'), { status: 403 });
  }
  if (!['owner', 'admin'].includes(clean(membership.role, 40).toLowerCase())) {
    throw Object.assign(new Error('OWNER_OR_ADMIN_REQUIRED'), { status: 403 });
  }
  return { accessToken, user, membership };
}

function tokenKey(config, businessId) {
  if (!config.integrationSecret) throw Object.assign(new Error('TIKTOK_ENCRYPTION_NOT_CONFIGURED'), { status: 503 });
  return crypto.createHash('sha256')
    .update('dabbir-tiktok-pilot-v1\0')
    .update(String(businessId))
    .update('\0')
    .update(config.integrationSecret)
    .digest();
}

function seal(value, config, businessId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(config, businessId), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function oauthStateHash(state) {
  return crypto.createHash('sha256').update(String(state)).digest('hex');
}

export function newOauthState() {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildAuthorizeUrl(config, state) {
  if (!config.ready) throw Object.assign(new Error('TIKTOK_APP_NOT_CONFIGURED'), { status: 503 });
  const url = new URL('https://ads.tiktok.com/marketing_api/auth');
  url.searchParams.set('app_id', config.appId);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', config.redirectUri);
  if (config.scopes.length) url.searchParams.set('scope', config.scopes.join(','));
  return url.toString();
}

export async function stageTikTokOAuth({ businessId, userId, state, expiresAt }) {
  const row = {
    business_id: String(businessId),
    provider: 'tiktok',
    status: 'verifying',
    oauth_state_hash: oauthStateHash(state),
    oauth_state_expires_at: expiresAt,
    connected_by: String(userId),
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const rows = await serviceRest('dabbir_tiktok_connections?on_conflict=business_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw Object.assign(new Error('TIKTOK_OAUTH_STATE_STORE_UNVERIFIED'), { status: 502 });
  }
  await upsertTikTokChannel(businessId, 'verifying', null, { oauth_started_at: new Date().toISOString() });
  return rows[0];
}

export async function findTikTokConnection(businessId) {
  const rows = await serviceRest(
    `dabbir_tiktok_connections?select=id,business_id,status,open_id,account_label,granted_scopes,access_token_expires_at,refresh_token_expires_at,connected_at,last_verified_at,last_provider_status,last_error,updated_at&business_id=eq.${encodeURIComponent(String(businessId))}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function findConnectionByState(state) {
  const stateHash = oauthStateHash(state);
  const rows = await serviceRest(
    `dabbir_tiktok_connections?select=*&oauth_state_hash=eq.${stateHash}&oauth_state_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function markTikTokFailure(businessId, errorCode, providerStatus = null) {
  await serviceRest(`dabbir_tiktok_connections?business_id=eq.${encodeURIComponent(String(businessId))}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'failed',
      last_error: clean(errorCode, 160),
      last_provider_status: Number.isFinite(Number(providerStatus)) ? Number(providerStatus) : null,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);
  await upsertTikTokChannel(businessId, 'failed', null, { blocker: clean(errorCode, 160) }).catch(() => null);
}

export async function completeTikTokOAuth({ connection, config, tokenData, providerStatus = 200 }) {
  const businessId = connection.business_id;
  const accessToken = clean(tokenData?.access_token, 8192);
  const refreshToken = clean(tokenData?.refresh_token, 8192);
  const openId = clean(tokenData?.open_id, 320);
  const scope = clean(tokenData?.scope, 4000);
  if (!accessToken || !refreshToken || !openId) {
    throw Object.assign(new Error('TIKTOK_TOKEN_RESPONSE_INCOMPLETE'), { status: 502 });
  }
  const access = seal(accessToken, config, businessId);
  const refresh = seal(refreshToken, config, businessId);
  const now = Date.now();
  const accessSeconds = Math.max(1, Number(tokenData?.expires_in || 0));
  const refreshSeconds = Math.max(1, Number(tokenData?.refresh_token_expires_in || 0));
  const patch = {
    status: 'connected',
    open_id: openId,
    granted_scopes: scope,
    access_token_ciphertext: access.ciphertext,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    refresh_token_tag: refresh.tag,
    token_key_version: config.keyVersion,
    access_token_expires_at: new Date(now + accessSeconds * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + refreshSeconds * 1000).toISOString(),
    oauth_state_hash: null,
    oauth_state_expires_at: null,
    connected_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
    last_provider_status: Number(providerStatus) || 200,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const rows = await serviceRest(`dabbir_tiktok_connections?business_id=eq.${encodeURIComponent(String(businessId))}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.status !== 'connected') {
    throw Object.assign(new Error('TIKTOK_CONNECTION_FINALIZE_UNVERIFIED'), { status: 502 });
  }
  await upsertTikTokChannel(businessId, 'connected', openId, {
    provider: 'tiktok',
    scopes: scope.split(',').map(item => item.trim()).filter(Boolean),
    connected_at: patch.connected_at,
  });
  return rows[0];
}

export async function upsertTikTokChannel(businessId, status, externalAccountId = null, metadata = {}) {
  const row = {
    business_id: String(businessId),
    channel_type: 'tiktok',
    status: clean(status, 40),
    external_account_id: externalAccountId ? clean(externalAccountId, 320) : null,
    metadata,
    updated_at: new Date().toISOString(),
  };
  const rows = await serviceRest('dabbir_channels?on_conflict=business_id,channel_type', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw Object.assign(new Error('TIKTOK_CHANNEL_STATE_UNVERIFIED'), { status: 502 });
  }
  return rows[0];
}

export async function exchangeTikTokAuthCode(config, authCode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'authorization_code',
        auth_code: clean(authCode, 2048),
        redirect_uri: config.redirectUri,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || Number(payload.code) !== 0 || !payload.data) {
      const error = new Error('TIKTOK_TOKEN_EXCHANGE_FAILED');
      error.status = response.status >= 500 ? 502 : 409;
      error.providerStatus = response.status;
      error.providerCode = payload?.code ?? null;
      throw error;
    }
    return { data: payload.data, providerStatus: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('TIKTOK_TOKEN_EXCHANGE_TIMEOUT'), { status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeTikTokStatus(connection, config) {
  const scopes = clean(connection?.granted_scopes, 4000).split(',').map(item => item.trim()).filter(Boolean);
  const required = DEFAULT_SCOPES;
  return {
    state: connection?.status === 'connected' ? 'CONNECTED' : connection?.status ? String(connection.status).toUpperCase() : 'NOT_CONNECTED',
    app_configured: config.ready,
    blocker: config.ready ? null : 'TIKTOK_APP_NOT_CONFIGURED',
    open_id: connection?.open_id || null,
    account_label: connection?.account_label || null,
    scopes,
    messaging_read: scopes.includes('message.list.read'),
    messaging_send: scopes.includes('message.list.send'),
    messaging_manage: scopes.includes('message.list.manage'),
    messaging_ready: required.every(scope => scopes.includes(scope)),
    access_token_expires_at: connection?.access_token_expires_at || null,
    refresh_token_expires_at: connection?.refresh_token_expires_at || null,
    connected_at: connection?.connected_at || null,
    last_verified_at: connection?.last_verified_at || null,
    last_error: connection?.last_error || null,
  };
}
