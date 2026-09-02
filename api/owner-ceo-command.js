import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerSessionToken } from './_owner-broker-client.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const CEO_COMMAND_URL=String(process.env.DABBIR_OWNER_CEO_COMMAND_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-ceo-command`).replace(/\/$/,'');

async function callCeo(session_token,payload){
 try{
  const r=await fetch(CEO_COMMAND_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_token,...payload}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  const body=await r.json().catch(()=>({ok:false,error:'CEO_COMMAND_INVALID_RESPONSE'}));
  return {status:r.status,body};
 }catch{return {status:503,body:{ok:false,error:'CEO_COMMAND_UNAVAILABLE'}}}
}

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 const sessionToken=ownerSessionToken(req);
 if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 if(req.method==='GET'){
  const call=await callCeo(sessionToken,{action:'list',limit:20});
  return json(res,call.status,call.body);
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,8192)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const commandText=String(body?.command_text||'').trim();
 const priority=String(body?.priority||'P1').trim().toUpperCase();
 if(commandText.length<4||commandText.length>4000)return json(res,400,{ok:false,error:'COMMAND_TEXT_INVALID'});
 if(!['P0','P1','P2','P3'].includes(priority))return json(res,400,{ok:false,error:'PRIORITY_INVALID'});
 const call=await callCeo(sessionToken,{action:'create',command_text:commandText,priority,limit:20});
 return json(res,call.status,call.body);
}
