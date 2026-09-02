import { timingSafeEqual } from 'node:crypto';
import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
const EXPECTED_SCHEDULE='*/5 * * * *';
const clean=(v,m=4096)=>String(v??'').trim().slice(0,m);
function sameSecret(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)}
function authorized(req){const secret=clean(process.env.CRON_SECRET);const auth=clean(req.headers?.authorization,8192);if(secret)return sameSecret(auth,`Bearer ${secret}`);return process.env.VERCEL_ENV==='production'&&clean(req.headers?.['user-agent'],120).toLowerCase()==='vercel-cron/1.0'&&clean(req.headers?.['x-vercel-cron-schedule'],120)===EXPECTED_SCHEDULE}
async function timed(fn){const t=performance.now();try{const value=await fn();return{ok:true,ms:Math.round((performance.now()-t)*10)/10,value}}catch(error){return{ok:false,ms:Math.round((performance.now()-t)*10)/10,error:String(error?.message||error)}}}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
 if(!authorized(req))return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
 const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);if(!key)return json(res,503,{ok:false,error:'SERVICE_ROLE_REQUIRED'});
 const domain=clean(process.env.DABBIR_META_APP_DOMAIN||'dabbir.bmalman.com',200);
 const api=await timed(async()=>{const r=await fetch(`https://${domain}/api/qa-capability`,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});return{status:r.status,ok:r.ok}});
 const db=await timed(async()=>{const r=await fetch(`${SUPABASE_URL}/rest/v1/dabbir_platform_admins?select=user_id&limit=1`,{cache:'no-store',headers:supabaseKeyHeaders(key,{accept:'application/json'}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`DB_HTTP_${r.status}`);return{status:r.status}});
 const record=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_owner_ops_sample_write_v1`,{method:'POST',cache:'no-store',headers:supabaseKeyHeaders(key,{'content-type':'application/json'}),body:JSON.stringify({p_api_ok:api.ok&&api.value?.ok===true,p_api_status:api.value?.status||null,p_api_latency_ms:api.ms,p_db_ok:db.ok,p_db_latency_ms:db.ms,p_details:{domain,api_error:api.error||null,db_error:db.error||null}})});
 if(!record.ok)return json(res,503,{ok:false,error:'OPS_SAMPLE_WRITE_FAILED',api,db});
 console.info('dabbir_owner_ops_synthetic',{api_ok:api.ok&&api.value?.ok===true,api_status:api.value?.status,api_ms:api.ms,db_ok:db.ok,db_ms:db.ms});
 return json(res,200,{ok:true,api:{ok:api.ok&&api.value?.ok===true,status:api.value?.status,latency_ms:api.ms},db:{ok:db.ok,latency_ms:db.ms}});
}
