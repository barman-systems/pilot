import { json, parseCookies, SUPABASE_URL } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const SESSION_COOKIE='__Host-dabbir_owner_session';
async function broker(body){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const p=await r.json().catch(()=>({}));return{r,p}}
async function serviceRpc(name,params){const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!key)return{ok:false,status:503,payload:null};const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',cache:'no-store',headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json'}),body:JSON.stringify(params)});return{ok:r.ok,status:r.status,payload:await r.json().catch(()=>null)}}
export default async function handler(req,res){
 res.setHeader('cache-control','no-store, max-age=0');if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
 const sessionToken=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const action=String(singleQueryValue(req,'action')||'overview').trim();if(!['overview','search','executive'].includes(action))return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
 try{
  if(action==='search'){
   const auth=await broker({action:'owner_session_verify',session_token:sessionToken});if(!auth.r.ok||auth.p?.authenticated!==true)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
   const q=String(singleQueryValue(req,'q')||'').trim().slice(0,160);const call=await serviceRpc('dabbir_platform_customer_search',{p_actor_user_id:auth.p.actor_user_id,p_query:q,p_limit:50});if(!call.ok)return json(res,503,{ok:false,error:'OWNER_SEARCH_FAILED'});
   const payload=call.payload&&typeof call.payload==='object'?call.payload:{};return json(res,200,{ok:true,count:Number(payload.count||0),accounts:Array.isArray(payload.accounts)?payload.accounts:[]});
  }
  const {r,p}=await broker({action:'owner_data',session_token:sessionToken,data_action:action});if(!r.ok||!p?.ok)return json(res,r.status===401?401:r.status>=500?503:r.status,{ok:false,error:p?.error||'OWNER_DATA_FAILED'});
  if(action==='overview')return json(res,200,{ok:true,overview:p.payload});return json(res,200,{ok:true,executive:p.payload});
 }catch{return json(res,503,{ok:false,error:'OWNER_DATA_FAILED'})}
}
