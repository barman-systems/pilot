import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerContext } from './_whatsapp-embedded-core.js';
import {
  deleteExactBusinessConnection,
  loadBusinessBranchConnection,
  loadPrimaryBusinessConnection,
} from './_whatsapp-branch-connection.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

export function verifiedDeletion(value, businessId, connectionId = null) {
  const rows=Array.isArray(value)?value:[value].filter(Boolean);
  if(rows.length!==1)return false;
  const row=rows[0];
  return Boolean(
    row
    && typeof row==='object'
    && !Array.isArray(row)
    && String(row.business_id||'')===String(businessId)
    && (!connectionId||String(row.id||'')===String(connectionId))
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'SAME_ORIGIN_REQUIRED' });

  try {
    const body = await readJsonBody(req, 4096);
    const businessId = safeId(body?.business_id);
    const branchRaw=String(body?.branch_id||'').trim();
    const branchId=branchRaw?safeId(branchRaw):null;
    if (!businessId) return json(res, 400, { ok: false, error: 'BUSINESS_REQUIRED' });
    if(branchRaw&&!branchId)return json(res,400,{ok:false,error:'VALID_BRANCH_REQUIRED'});

    const owner = await ownerContext(req, businessId);
    // Backward-compatible callers without branch_id operate on the primary branch only.
    // A branch disconnect must never delete all connections for the business.
    const row = branchId
      ? await loadBusinessBranchConnection(owner.accessToken,businessId,branchId)
      : await loadPrimaryBusinessConnection(owner.accessToken,businessId);
    if (!row) return json(res, 200, { ok: true, connected: false, already_disconnected: true, branch_id: branchId });

    const deleted = await deleteExactBusinessConnection(owner.accessToken,businessId,row.id);
    if (!verifiedDeletion(deleted, businessId, row.id)) {
      throw Object.assign(new Error('WHATSAPP_CONNECTION_DELETE_UNVERIFIED'), { status: 502 });
    }

    return json(res, 200, {
      ok: true,
      connected: false,
      branch_id: row.branch_id,
      connection_id: row.id,
      phone_number_id: row.phone_number_id,
      remote_unsubscribed: false,
      remote_unsubscribe_skipped_reason: 'BRANCH_SAFE_LOCAL_DISCONNECT',
      secrets_exposed: false,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, [400, 401, 403, 409, 413, 429, 502, 503, 504].includes(status) ? status : 500, {
      ok: false,
      error: error?.message || 'WHATSAPP_DISCONNECT_FAILED',
    });
  }
}
