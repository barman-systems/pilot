import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SUPABASE_URL='https://spohjzrsymsmzsseygtw.supabase.co';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const OWNER_USER_ID=process.env.DABBIR_OWNER_USER_ID||'f1c5e98b-4060-43cb-a09b-a67a67028800';

function serviceKey(){return String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()}

async function verifyOwner(req){
  const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!token)return false;
  const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token})});
  if(!r.ok)return false;
  const p=await r.json().catch(()=>null);
  return p?.authenticated===true&&p?.role==='platform_owner';
}

async function rpc(key,name,params={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',cache:'no-store',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(params)});
  const text=await r.text();
  let p=null;try{p=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=new Error(p?.message||p?.error||'OWNER_DATA_FAILED');e.status=r.status;throw e}
  return p;
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(!(await verifyOwner(req).catch(()=>false)))return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  const key=serviceKey();
  if(!key)return json(res,503,{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'});
  const action=String(singleQueryValue(req,'action')||'overview').trim();
  try{
    if(action==='overview'){
      const overview=await rpc(key,'dabbir_platform_owner_overview',{p_actor_user_id:OWNER_USER_ID});
      return json(res,200,{ok:true,overview});
    }
    if(action==='search'){
      const q=String(singleQueryValue(req,'q')||'').trim().slice(0,160);
      const payload=await rpc(key,'dabbir_platform_customer_search',{p_actor_user_id:OWNER_USER_ID,p_query:q||null,p_limit:100});
      return json(res,200,{ok:true,...payload});
    }
    return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
  }catch(e){return json(res,Number(e?.status||500)>=500?503:Number(e?.status||500),{ok:false,error:'OWNER_DATA_FAILED'});}
}
