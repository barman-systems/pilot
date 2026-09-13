import { timingSafeEqual } from 'node:crypto';
import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
import { indexApprovedKnowledge } from './_dabbir-knowledge-rag.js';
import { mineProductionFailures } from './_dabbir-intelligence-flywheel.js';

const clean=(value,max=500)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function serviceKey(){const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('INTELLIGENCE_STORAGE_NOT_CONFIGURED'),{status:503});return key}
function sameSecret(a,b){const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&left.length>0&&timingSafeEqual(left,right)}
export function cronAuthMode(req,env=process.env){const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;return null}
async function rpc(key,name,params={}){const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(12000),headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json'}),body:JSON.stringify(params)});const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.code||`${name.toUpperCase()}_FAILED`),{status:response.status});return payload}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const authMode=cronAuthMode(req);if(!authMode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});
  let key;try{key=serviceKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
  const call=(name,params)=>rpc(key,name,params);let indexing={ok:false,state:'NOT_RUN'},mining={ok:false,state:'NOT_RUN'};
  try{indexing=await indexApprovedKnowledge({rpc:call,env:process.env,fetchImpl:fetch,limit:12})}catch(error){indexing={ok:false,state:'FAILED',error:clean(error?.message||'RAG_INDEX_FAILED',160)}}
  try{mining=await mineProductionFailures({rpc:call,since:'7 days'})}catch(error){mining={ok:false,state:'FAILED',error:clean(error?.message||'FAILURE_MINER_FAILED',160)}}
  const ok=indexing.state==='SKIPPED'?Boolean(mining?.ok):Boolean(indexing?.ok&&mining?.ok);
  const summary={ok,auth_mode:authMode,indexing:{ok:indexing.ok,state:indexing.state,queued:indexing.queued||0,indexed:indexing.indexed||0,failed:indexing.failed||0,error_codes:indexing.error_codes||{},reason:indexing.reason||null},mining:{ok:Boolean(mining?.ok),cases_ingested:mining?.cases_ingested||0,clusters_updated:mining?.clusters_updated||0,proposals_touched:mining?.proposals_touched||0,auto_apply:false}};
  console.info('dabbir_intelligence_maintenance',summary);return json(res,ok?200:503,summary);
}
