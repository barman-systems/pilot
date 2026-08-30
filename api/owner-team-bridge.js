import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
async function verify(token){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store'});const p=await r.json().catch(()=>null);return r.ok&&p?.authenticated===true&&p?.role==='platform_owner'}
async function rest(path,k){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:k,authorization:`Bearer ${k}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});const p=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(p))throw Object.assign(new Error('OWNER_TEAM_READ_FAILED'),{status:r.status});return p}
export default async function handler(req,res){
 res.setHeader('cache-control','no-store, max-age=0');if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
 const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];if(!token)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const businessId=String(singleQueryValue(req,'business_id')||'').trim();if(!UUID_RE.test(businessId))return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});const k=key();if(!k)return json(res,503,{ok:false,error:'OWNER_TEAM_NOT_CONFIGURED'});
 try{if(!(await verify(token)))return json(res,401,{ok:false,error:'OWNER_SESSION_INVALID'});const [members,invitations]=await Promise.all([
   rest(`dabbir_memberships?select=user_id,display_name,role,status,permissions,created_at,accepted_at,suspended_at,removed_at,updated_at&business_id=eq.${businessId}&order=created_at.asc&limit=200`,k),
   rest(`dabbir_employee_invitations?select=id,email,display_name,role,status,delivery_status,expires_at,accepted_at,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,k).catch(()=>[])
 ]);return json(res,200,{ok:true,business_id:businessId,mode:'platform_owner_read_only',members,invitations});}
 catch(e){return json(res,Number(e?.status||503)>=500?503:Number(e?.status||500),{ok:false,error:'OWNER_TEAM_READ_FAILED'});}
}
