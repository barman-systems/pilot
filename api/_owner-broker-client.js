import { parseCookies } from './_auth-core.js';
const LEGACY_SUPABASE_URL='https://spohjzrsymsmzsseygtw.supabase.co';
const SUPABASE_URL=String(process.env.SUPABASE_URL||LEGACY_SUPABASE_URL).replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';
export function ownerSessionToken(req){return parseCookies(req.headers.cookie||'')[SESSION_COOKIE]||null}
export async function ownerBroker(req,data_action,extra={}){
 const session_token=ownerSessionToken(req);if(!session_token)return {status:401,payload:{ok:false,error:'OWNER_SESSION_REQUIRED'}};
 try{const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_data',data_action,session_token,...extra}),cache:'no-store',signal:AbortSignal.timeout(12000)});const payload=await r.json().catch(()=>({ok:false,error:'OWNER_BROKER_INVALID_RESPONSE'}));return {status:r.status,payload};}
 catch{return {status:503,payload:{ok:false,error:'OWNER_BROKER_UNAVAILABLE'}}}
}
