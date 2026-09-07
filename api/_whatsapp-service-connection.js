import { SUPABASE_DATA_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
import { withServerReadTimeout } from './_server-read-timeout.js';

const WHATSAPP_DATA_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTION_SELECT = 'id,business_id,branch_id,status,meta_app_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,token_expires_at,connected_at,last_verified_at,last_provider_status,last_error';

const safeId = value => UUID_RE.test(String(value || '').trim()) ? String(value).trim() : null;

function storageError(code, response, payload = null) {
  const error = new Error(String(payload?.message || payload?.code || code));
  error.code = code;
  error.status = Number(response?.status || 502);
  return error;
}

async function readRows(key, path, code, options = {}) {
  return withServerReadTimeout(async signal => {
    const response = await fetch(`${SUPABASE_DATA_URL}/rest/v1/${path}`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal,
      headers: supabaseKeyHeaders(key, { accept: 'application/json' }),
    });
    const text = await response.text();
    let rows = null;
    try { rows = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw storageError(code, response, rows);
    if (!Array.isArray(rows)) throw storageError(`${code}_MALFORMED`, response);
    return rows;
  }, {
    label: code,
    errorCode: `${code}_TIMEOUT`,
    timeoutMs: options.timeoutMs ?? WHATSAPP_DATA_TIMEOUT_MS,
  });
}

function requireServiceKey(serviceKey) {
  const key = String(serviceKey || '').trim();
  if (!key) throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'), { status: 503 });
  return key;
}

export async function loadBusinessConnectionWithServiceKey(serviceKey, businessId, options = {}) {
  const key = requireServiceKey(serviceKey);
  const id = safeId(businessId);
  if (!id) throw Object.assign(new Error('BUSINESS_ID_REQUIRED'), { status: 400 });

  // Business-only resolution is legacy. Fail closed if a business has multiple
  // branch connections instead of silently choosing the first row.
  const path = `dabbir_whatsapp_connections?select=${CONNECTION_SELECT}&business_id=eq.${encodeURIComponent(id)}&status=eq.connected&limit=2`;
  const rows = await readRows(key, path, 'WHATSAPP_CONNECTION_SERVICE_READ', options);
  if (rows.length > 1) throw Object.assign(new Error('WHATSAPP_CONNECTION_AMBIGUOUS_BRANCH'), { status: 409, code: 'WHATSAPP_CONNECTION_AMBIGUOUS_BRANCH' });
  const row = rows[0] || null;
  if (row && (typeof row !== 'object' || Array.isArray(row) || String(row.business_id || '') !== id || !safeId(row.branch_id))) {
    throw Object.assign(new Error('WHATSAPP_CONNECTION_SERVICE_RESPONSE_MALFORMED'), { status: 502, code: 'WHATSAPP_CONNECTION_SERVICE_RESPONSE_MALFORMED' });
  }
  return row;
}

export async function loadBusinessBranchConnectionWithServiceKey(serviceKey, businessId, branchId, options = {}) {
  const key = requireServiceKey(serviceKey);
  const business = safeId(businessId);
  const branch = safeId(branchId);
  if (!business || !branch) throw Object.assign(new Error('WHATSAPP_BRANCH_CONNECTION_ID_REQUIRED'), { status: 400 });
  const path = `dabbir_whatsapp_connections?select=${CONNECTION_SELECT}&business_id=eq.${encodeURIComponent(business)}&branch_id=eq.${encodeURIComponent(branch)}&status=eq.connected&limit=2`;
  const rows = await readRows(key, path, 'WHATSAPP_BRANCH_CONNECTION_SERVICE_READ', options);
  if (rows.length > 1) throw Object.assign(new Error('WHATSAPP_BRANCH_CONNECTION_AMBIGUOUS'), { status: 502, code: 'WHATSAPP_BRANCH_CONNECTION_AMBIGUOUS' });
  const row = rows[0] || null;
  if (row && (row.business_id !== business || row.branch_id !== branch || !safeId(row.id))) {
    throw Object.assign(new Error('WHATSAPP_BRANCH_CONNECTION_SCOPE_MISMATCH'), { status: 502, code: 'WHATSAPP_BRANCH_CONNECTION_SCOPE_MISMATCH' });
  }
  return row;
}

export async function loadConversationConnectionWithServiceKey(serviceKey, businessId, conversationId, options = {}) {
  const key = requireServiceKey(serviceKey);
  const business = safeId(businessId);
  const conversation = safeId(conversationId);
  if (!business || !conversation) throw Object.assign(new Error('WHATSAPP_CONVERSATION_CONNECTION_ID_REQUIRED'), { status: 400 });

  const path = `dabbir_conversations?select=id,business_id,branch_id,channel_type&business_id=eq.${encodeURIComponent(business)}&id=eq.${encodeURIComponent(conversation)}&limit=2`;
  const rows = await readRows(key, path, 'WHATSAPP_CONVERSATION_BRANCH_READ', options);
  if (rows.length !== 1) throw Object.assign(new Error(rows.length > 1 ? 'WHATSAPP_CONVERSATION_BRANCH_AMBIGUOUS' : 'WHATSAPP_CONVERSATION_NOT_FOUND'), { status: rows.length > 1 ? 502 : 404 });
  const row = rows[0];
  if (row.business_id !== business || row.id !== conversation || row.channel_type !== 'whatsapp' || !safeId(row.branch_id)) {
    throw Object.assign(new Error('WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH'), { status: 409, code: 'WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH' });
  }
  return loadBusinessBranchConnectionWithServiceKey(key, business, row.branch_id, options);
}
