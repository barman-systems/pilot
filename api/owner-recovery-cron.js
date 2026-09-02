import { timingSafeEqual } from 'node:crypto';
import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
const EXPECTED_SCHEDULE='17 23 * * *';
const clean=(v,m=4096)=>String(v??'').trim().slice(0,m);
function sameSecret(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)}
function authorized(req){const secret=clean(process.env.CRON_SECRET);const auth=clean(req.headers?.authorization,8192);if(secret)return sameSecret(auth,`Bearer ${secret}`);return process.env.VERCEL_ENV==='production'&&clean(req.headers?.['user-agent'],120).toLowerCase()==='vercel-cron/1.0'&&clean(req.headers?.['x-vercel-cron-schedule'],120)===EXPECTED_SCHEDULE}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
 if(!authorized(req))return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
 const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);if(!key)return json(res,503,{ok:false,error:'SERVICE_ROLE_REQUIRED'});
 const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_owner_recovery_maintenance_v1`,{method:'POST',cache:'no-store',headers:supabaseKeyHeaders(key,{'content-type':'application/json'}),body:'{}',signal:AbortSignal.timeout(110000)});
 const payload=await r.json().catch(()=>null);
 if(!r.ok){console.error('dabbir_owner_recovery_cron_failed',{status:r.status});return json(res,503,{ok:false,error:'RECOVERY_MAINTENANCE_FAILED'})}
 console.info('dabbir_owner_recovery_cron_verified',{ok:true});return json(res,200,{ok:true,recovery:payload});
}
