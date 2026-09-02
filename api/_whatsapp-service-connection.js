import { SUPABASE_DATA_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
import { withServerReadTimeout } from './_server-read-timeout.js';

const WHATSAPP_DATA_TIMEOUT_MS = 10_000;
const CONNECTION_SELECT = 'id,business_id,status,meta_app_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version,token_expires_at,connected_at,last_verified_at,last_provider_status,last_error';

function storageError(code, response, payload = null) {
  const error = new Error(String(payload?.message || payload?.code || code));
  error.code = code;
  error.status = Number(response?.status || 502);
  return error;
}

export async function loadBusinessConnectionWithServiceKey(serviceKey, businessId, options = {}) {
  const key = String(serviceKey || '').trim();
  const id = String(businessId || '').trim();
  if (!key) throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'), { status: 503 });
  if (!id) throw Object.assign(new Error('BUSINESS_ID_REQUIRED'), { status: 400 });

  const path = `dabbir_whatsapp_connections?select=${CONNECTION_SELECT}&business_id=eq.${encodeURIComponent(id)}&limit=1`;
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
    if (!response.ok) throw storageError('WHATSAPP_CONNECTION_SERVICE_READ_FAILED', response, rows);
    if (!Array.isArray(rows) || rows.length > 1) throw storageError('WHATSAPP_CONNECTION_SERVICE_RESPONSE_MALFORMED', response);
    const row = rows[0] || null;
    if (row && (typeof row !== 'object' || Array.isArray(row) || String(row.business_id || '') !== id)) {
      throw storageError('WHATSAPP_CONNECTION_SERVICE_RESPONSE_MALFORMED', response);
    }
    return row;
  }, {
    label: 'WHATSAPP_CONNECTION_SERVICE_READ',
    errorCode: 'WHATSAPP_CONNECTION_SERVICE_READ_TIMEOUT',
    timeoutMs: options.timeoutMs ?? WHATSAPP_DATA_TIMEOUT_MS,
  });
}
