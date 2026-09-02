import crypto from 'node:crypto';
import { tiktokPilotConfig } from './_tiktok-pilot-core.js';
import { applySupabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/, '');
const TIKTOK_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

function clean(value, max = 6000) {
  return String(value || '').trim().slice(0, max);
}

function serviceKey() {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 8192);
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

function openToken(row, prefix, config) {
  const ciphertext = clean(row?.[`${prefix}_token_ciphertext`], 16384);
  const iv = clean(row?.[`${prefix}_token_iv`], 1000);
  const tag = clean(row?.[`${prefix}_token_tag`], 1000);
  if (!ciphertext || !iv || !tag) throw Object.assign(new Error('TIKTOK_TOKEN_STORAGE_INCOMPLETE'), { status: 409 });
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(config, row.business_id), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw Object.assign(new Error('TIKTOK_TOKEN_DECRYPT_FAILED'), { status: 503 });
  }
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

async function serviceRest(path, options = {}) {
  const key = serviceKey();
  if (!key) throw Object.assign(new Error('TIKTOK_SERVER_DATA_ACCESS_NOT_CONFIGURED'), { status: 503 });
  const headers = new Headers(options.headers || {});
  applySupabaseKeyHeaders(headers, key);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers, cache: 'no-store' });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw Object.assign(new Error('TIKTOK_CONNECTION_STORE_FAILED'), { status: response.status >= 500 ? 502 : response.status });
  return payload;
}

async function secretConnection(businessId) {
  const rows = await serviceRest(`dabbir_tiktok_connections?select=*&business_id=eq.${encodeURIComponent(String(businessId))}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row) throw Object.assign(new Error('TIKTOK_NOT_CONNECTED'), { status: 409 });
  if (!['connected', 'degraded'].includes(String(row.status || ''))) {
    throw Object.assign(new Error('TIKTOK_NOT_CONNECTED'), { status: 409 });
  }
  if (!clean(row.open_id, 320)) throw Object.assign(new Error('TIKTOK_OPEN_ID_MISSING'), { status: 409 });
  return row;
}

function scopes(row) {
  return clean(row?.granted_scopes, 4000).split(',').map(item => item.trim()).filter(Boolean);
}

async function updateTokenRow(row, config, tokenData) {
  const access = seal(tokenData.access_token, config, row.business_id);
  const refresh = seal(tokenData.refresh_token, config, row.business_id);
  const now = Date.now();
  const patch = {
    access_token_ciphertext: access.ciphertext,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    refresh_token_tag: refresh.tag,
    token_key_version: config.keyVersion,
    granted_scopes: clean(tokenData.scope || row.granted_scopes, 4000),
    open_id: clean(tokenData.open_id || row.open_id, 320),
    access_token_expires_at: new Date(now + Math.max(1, Number(tokenData.expires_in || 0)) * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + Math.max(1, Number(tokenData.refresh_token_expires_in || 0)) * 1000).toISOString(),
    last_verified_at: new Date().toISOString(),
    last_provider_status: 200,
    last_error: null,
    status: 'connected',
    updated_at: new Date().toISOString(),
  };
  const rows = await serviceRest(`dabbir_tiktok_connections?business_id=eq.${encodeURIComponent(String(row.business_id))}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw Object.assign(new Error('TIKTOK_REFRESH_STORE_UNVERIFIED'), { status: 502 });
  return rows[0];
}

async function refreshConnection(row, config) {
  const refreshToken = openToken(row, 'refresh', config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${TIKTOK_BASE}/tt_user/oauth2/refresh_token/`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || Number(payload.code) !== 0 || !payload.data?.access_token || !payload.data?.refresh_token) {
      throw Object.assign(new Error('TIKTOK_TOKEN_REFRESH_FAILED'), { status: response.status >= 500 ? 502 : 409, providerStatus: response.status });
    }
    return updateTokenRow(row, config, payload.data);
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('TIKTOK_TOKEN_REFRESH_TIMEOUT'), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function usableConnection(req, businessId, requiredScope) {
  const config = tiktokPilotConfig(req);
  if (!config.ready) throw Object.assign(new Error('TIKTOK_APP_NOT_CONFIGURED'), { status: 503 });
  let row = await secretConnection(businessId);
  if (requiredScope && !scopes(row).includes(requiredScope)) {
    throw Object.assign(new Error(`TIKTOK_SCOPE_REQUIRED_${requiredScope.toUpperCase().replace(/\W+/g, '_')}`), { status: 403 });
  }
  const expiry = new Date(row.access_token_expires_at || 0).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now() + 5 * 60 * 1000) row = await refreshConnection(row, config);
  return { row, config, token: openToken(row, 'access', config) };
}

async function providerRequest(token, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const headers = new Headers(options.headers || {});
    headers.set('Access-Token', token);
    headers.set('accept', 'application/json');
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${TIKTOK_BASE}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || Number(payload.code) !== 0) {
      const error = new Error('TIKTOK_PROVIDER_REQUEST_FAILED');
      error.status = response.status >= 500 ? 502 : 409;
      error.providerStatus = response.status;
      error.providerCode = payload?.code ?? null;
      error.providerMessage = clean(payload?.message, 300) || null;
      throw error;
    }
    return payload.data || {};
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('TIKTOK_PROVIDER_TIMEOUT'), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listTikTokConversations(req, businessId) {
  const { row, token } = await usableConnection(req, businessId, 'message.list.read');
  const load = async conversationType => {
    const params = new URLSearchParams({
      business_id: row.open_id,
      conversation_type: conversationType,
      limit: '100',
      cursor: '0',
    });
    const data = await providerRequest(token, `/business/message/conversation/list/?${params.toString()}`, { method: 'GET' });
    return Array.isArray(data.conversations) ? data.conversations : [];
  };
  const [strangers, singles] = await Promise.all([load('STRANGER'), load('SINGLE')]);
  const unique = new Map();
  for (const item of [...strangers, ...singles]) {
    const id = clean(item?.conversation_id, 1000);
    if (!id) continue;
    const existing = unique.get(id);
    if (!existing || Number(item?.update_time || item?.up_time || 0) > Number(existing?.update_time || existing?.up_time || 0)) unique.set(id, item);
  }
  return [...unique.values()].sort((a, b) => Number(b?.update_time || b?.up_time || 0) - Number(a?.update_time || a?.up_time || 0));
}

export async function listTikTokMessages(req, businessId, conversationId) {
  const { row, token } = await usableConnection(req, businessId, 'message.list.read');
  const params = new URLSearchParams({ business_id: row.open_id, conversation_id: String(conversationId) });
  const data = await providerRequest(token, `/business/message/content/list/?${params.toString()}`, { method: 'GET' });
  return {
    participants: Array.isArray(data.participants) ? data.participants : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export async function sendTikTokText(req, businessId, conversationId, text) {
  const body = clean(text, 6000);
  if (!body) throw Object.assign(new Error('TIKTOK_MESSAGE_REQUIRED'), { status: 400 });
  const { row, token } = await usableConnection(req, businessId, 'message.list.send');
  const data = await providerRequest(token, '/business/message/send/', {
    method: 'POST',
    body: JSON.stringify({
      business_id: row.open_id,
      recipient_type: 'CONVERSATION',
      recipient: String(conversationId),
      message_type: 'TEXT',
      text: { body },
    }),
  });
  const messageId = clean(data?.message?.message_id, 1000);
  if (!messageId) throw Object.assign(new Error('TIKTOK_SEND_ACCEPTED_WITHOUT_MESSAGE_ID'), { status: 502 });
  return { message_id: messageId };
}
