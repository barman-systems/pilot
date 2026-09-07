import { parseCookies, readJsonBody } from './_auth-core.js';
const SUPABASE_URL=String(process.env.SUPABASE_URL || '').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';
export function ownerSessionToken(req){try{return parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||null}catch{return null}}
export async function readOwnerBody(req,limit){const body=await readJsonBody(req,limit);if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('INVALID_JSON'),{code:400});return body}
export async function ownerBroker(req,data_action,extra={}){
 const session_token=ownerSessionToken(req);if(!session_token)return {status:401,payload:{ok:false,error:'OWNER_SESSION_REQUIRED'}};
 // Caller-controlled fields must never replace the verified cookie or broker action.
 try{const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...extra,action:'owner_data',data_action,session_token}),cache:'no-store',signal:AbortSignal.timeout(12000)});const payload=await r.json().catch(()=>null);if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.ok!=='boolean')return {status:502,payload:{ok:false,error:'OWNER_BROKER_INVALID_RESPONSE'}};if(!r.ok)return {status:r.status,payload:{...payload,ok:false,error:payload.error||'OWNER_BROKER_HTTP_ERROR'}};return {status:payload.ok?r.status:502,payload};}
 catch{return {status:503,payload:{ok:false,error:'OWNER_BROKER_UNAVAILABLE'}}}
}
