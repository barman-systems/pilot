// v28 is the single authoritative DABBIR owner command center. Legacy v22-v27 files remain only as rollback/source history and are not in the runtime render chain.
import dashboard from './owner-command-center.js';
import { parseCookies } from './_auth-core.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';
function redirectToOwner(res,clear=false){res.statusCode=302;res.setHeader('location','/owner');res.setHeader('cache-control','no-store, max-age=0');if(clear)res.setHeader('set-cookie',`${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);res.end('Redirecting...')}
async function verifyOwnerSession(token){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)return false;const p=await r.json().catch(()=>null);return p?.authenticated===true&&p?.role==='platform_owner'}
export default async function handler(req,res){if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('allow','GET, HEAD');return res.end('Method Not Allowed')}const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];if(!token)return redirectToOwner(res);try{if(!(await verifyOwnerSession(token)))return redirectToOwner(res,true);return dashboard(req,res)}catch{return redirectToOwner(res,true)}}
