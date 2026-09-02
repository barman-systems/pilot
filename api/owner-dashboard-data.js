import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';

async function broker(body){
  const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const p=await r.json().catch(()=>({}));
  return {r,p};
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});

  const sessionToken=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  const action=String(singleQueryValue(req,'action')||'overview').trim();
  if(!['overview','search'].includes(action))return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});

  try{
    const body={action:'owner_data',session_token:sessionToken,data_action:action};
    if(action==='search')body.q=String(singleQueryValue(req,'q')||'').trim().slice(0,160);
    const {r,p}=await broker(body);
    if(!r.ok||!p?.ok){
      return json(res,r.status===401?401:r.status>=500?503:r.status,{ok:false,error:p?.error||'OWNER_DATA_FAILED'});
    }
    if(action==='overview')return json(res,200,{ok:true,overview:p.payload});
    return json(res,200,{ok:true,...(p.payload||{})});
  }catch{
    return json(res,503,{ok:false,error:'OWNER_DATA_FAILED'});
  }
}
