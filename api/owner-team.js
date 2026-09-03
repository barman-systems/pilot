import { json, parseCookies, readJsonBody, requireSameOrigin } from './_auth-core.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';

async function callBroker(sessionToken,payload={}){
  const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_data',data_action:'team',session_token:sessionToken,...payload}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  const p=await r.json().catch(()=>({ok:false,error:'OWNER_BROKER_INVALID_RESPONSE'}));
  return {r,p};
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-dabbir-owner-team','authority-v1');
  const sessionToken=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  try{
    if(req.method==='GET'){
      const {r,p}=await callBroker(sessionToken,{operation:'list'});
      return json(res,r.status,p);
    }
    if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req,8192);
    const operation=String(body.operation||'').trim().toLowerCase();
    const payload={...body,operation};
    if(operation==='invite')payload.resend_key=String(process.env.RESEND_API_KEY||'').trim();
    const {r,p}=await callBroker(sessionToken,payload);
    return json(res,r.status,p);
  }catch(error){
    const code=Number(error?.code||500);
    return json(res,code===400||code===413?code:503,{ok:false,error:error?.message==='PAYLOAD_TOO_LARGE'?'PAYLOAD_TOO_LARGE':error?.message==='INVALID_JSON'?'INVALID_JSON':'OWNER_TEAM_UNAVAILABLE'});
  }
}
