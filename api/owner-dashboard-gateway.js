// Stable production gateway for the DABBIR Owner Command Center.
// Production imports one generated flat runtime only. Numbered/stable source layers are build-time history inputs and never runtime dependencies.
// Build-time source compatibility marker: owner-command-center-v29.js remains in the generated source manifest only and is not imported at runtime.
import dashboard from './_owner-command-center-runtime.generated.js';
import { OWNER_COMMAND_CENTER_DESIGN_SYSTEM } from './_owner-command-center-design-system.js';
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

function injectOwnerExtensions(res){
  const end=res.end.bind(res);let body='';
  res.end=(chunk,...args)=>{
    body+=chunk?String(chunk):'';
    if(!body.includes('</body>'))return end(body,...args);
    const extensions=(body.includes('ownerCommandCenterDesignSystem')?'':OWNER_COMMAND_CENTER_DESIGN_SYSTEM)+(body.includes('ownerPlatformTeamStyles')?'':OWNER_PLATFORM_TEAM_UI);
    return end(body.replace('</body>',extensions+'</body>'),...args);
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('allow', 'GET, HEAD'); return res.end('Method Not Allowed'); }
  const sessionToken = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!sessionToken) return redirectToOwner(res);
  try {
    if (!(await verifyOwnerSession(sessionToken))) return redirectToOwner(res, true);
    injectOwnerExtensions(res);
    return dashboard(req, res);
  } catch { return redirectToOwner(res, true); }
}
