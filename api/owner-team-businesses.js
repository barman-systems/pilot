import { json, parseCookies } from './_auth-core.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const sessionToken=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  try{
    const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_data',data_action:'operations',session_token:sessionToken}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const p=await r.json().catch(()=>({}));
    if(!r.ok||!p?.ok)return json(res,r.status===401?401:r.status>=500?503:r.status,{ok:false,error:p?.error||'TEAM_BUSINESSES_UNAVAILABLE'});
    const rows=Array.isArray(p?.payload?.businesses)?p.payload.businesses:[];
    return json(res,200,{ok:true,businesses:rows.map(x=>({id:x.id,name:x.name||'Business',country_code:x.country||null,business_type:x.business_type||null}))});
  }catch{return json(res,503,{ok:false,error:'TEAM_BUSINESSES_UNAVAILABLE'});}
}
