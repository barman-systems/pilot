// v26 turns the owner dashboard into an executive operations command center while preserving owner-command-center-v25.js, owner-command-center-v24.js, owner-command-center-v23.js and owner-command-center-v22.js truth/security layers.
import dashboard from './owner-command-center-v26.js';
import { parseCookies } from './_auth-core.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const BROKER_URL = String(process.env.DABBIR_OWNER_BROKER_URL || `${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/, '');
const SESSION_COOKIE = '__Host-dabbir_owner_session';

function redirectToOwner(res, clear = false) {
  res.statusCode = 302;
  res.setHeader('location', '/owner');
  res.setHeader('cache-control', 'no-store, max-age=0');
  if (clear) res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.end('Redirecting...');
}

async function verifyOwnerSession(token) {
  const response = await fetch(BROKER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'owner_session_verify', session_token: token }) });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  return payload?.authenticated === true && payload?.role === 'platform_owner';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('allow', 'GET, HEAD'); return res.end('Method Not Allowed'); }
  const sessionToken = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!sessionToken) return redirectToOwner(res);
  try { if (!(await verifyOwnerSession(sessionToken))) return redirectToOwner(res, true); return dashboard(req, res); }
  catch { return redirectToOwner(res, true); }
}
