import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const CUSTOMER_RE=/^DAB-[0-9]{6,}$/i;
const key=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();

async function verify(token){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store'});const p=await r.json().catch(()=>null);return r.ok&&p?.authenticated===true&&p?.role==='platform_owner'}
async function rpc(name,params,k){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:k,authorization:`Bearer ${k}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(params),cache:'no-store',signal:AbortSignal.timeout(8000)});const p=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error('OWNER_SUPPORT_READ_FAILED'),{status:r.status});return p}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];if(!token)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  const no=String(singleQueryValue(req,'customer_no')||'').trim().toUpperCase();if(!CUSTOMER_RE.test(no))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
  const k=key();if(!k)return json(res,503,{ok:false,error:'OWNER_SUPPORT_NOT_CONFIGURED'});
  try{if(!(await verify(token)))return json(res,401,{ok:false,error:'OWNER_SESSION_INVALID'});const support=await rpc('dabbir_platform_owner_support_summary_v1',{p_customer_no:no},k);return json(res,200,{ok:true,support});}
  catch(e){return json(res,Number(e?.status||503)>=500?503:Number(e?.status||500),{ok:false,error:'OWNER_SUPPORT_READ_FAILED'});}
}
