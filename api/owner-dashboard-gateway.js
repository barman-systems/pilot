// Stable production gateway for the DABBIR Owner Command Center.
// The gateway imports one authoritative entrypoint only. Legacy compatibility marker: owner-command-center-v29.js. Numbered implementations are rollback/history layers and must never be selected here.
import dashboard from './owner-command-center.js';
import { OWNER_PLATFORM_TEAM_UI } from './_owner-platform-team-ui.js';
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
  const response = await fetch(BROKER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'owner_session_verify', session_token: token }), cache:'no-store', signal:AbortSignal.timeout(10000) });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  return payload?.authenticated === true && ['ROOT_OWNER','OWNER_DELEGATE'].includes(String(payload?.authority_role||''));
}

function injectTeamWorkspace(res){
  const end=res.end.bind(res);let body='';
  res.end=(chunk,...args)=>{
    body+=chunk?String(chunk):'';
    const output=body.includes('</body>')&&!body.includes('ownerPlatformTeamStyles')?body.replace('</body>',OWNER_PLATFORM_TEAM_UI+'</body>'):body;
    return end(output,...args);
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('allow', 'GET, HEAD'); return res.end('Method Not Allowed'); }
  const sessionToken = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!sessionToken) return redirectToOwner(res);
  try {
    if (!(await verifyOwnerSession(sessionToken))) return redirectToOwner(res, true);
    injectTeamWorkspace(res);
    return dashboard(req, res);
  } catch { return redirectToOwner(res, true); }
}
