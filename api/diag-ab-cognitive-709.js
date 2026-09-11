import crypto from 'node:crypto';

const OLD={label:'066341d',sha:'066341d18824cd90c0e7a32353d062e0e3faac45',deployment:'dpl_3aNH4sUUqdSezKoGKmbmDAqBWCMu',origin:'https://dabbir-3q3n5aiof-nd56cm4j5v-3619s-projects.vercel.app'};
const NEW={label:'bda910a',sha:'bda910aac40111c72c91b48b5708e3c8bd59dbd1',deployment:'dpl_GYvGwb4bxFQj3KpD6h2n9wX3gov2',origin:'https://dabbir-4e07t9ikb-nd56cm4j5v-3619s-projects.vercel.app'};
const TARGETS=[OLD,NEW];
const SCENARIOS=['unseen_multi_activity','multiple_requests'];
const RUNS=3;
const FIXED_PROVIDER='groq';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const supabaseUrl=String(process.env.SUPABASE_AUTH_URL||process.env.SUPABASE_URL||'https://fphpoysqdsceniwduxjq.supabase.co').replace(/\/$/,'');
const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();

function json(res,status,body){return res.status(status).setHeader('cache-control','no-store').json(body)}
function safeTelemetry(t){return {request_count:t?.request_count??null,attempts:Array.isArray(t?.attempts)?t.attempts.map(a=>({provider:a?.provider??null,model:a?.model??null,status:a?.status??null,latency_ms:a?.latency_ms??null})):[],usage:t?.final_request_usage?{inputTokens:t.final_request_usage.inputTokens??null,outputTokens:t.final_request_usage.outputTokens??null,reasoningTokens:t.final_request_usage.reasoningTokens??null}:null};}
async function fetchJson(url,options={}){const started=Date.now();try{const r=await fetch(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(90000),...options});const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{}return {ok:r.ok,status:r.status,body,text:text.slice(0,300),headers:r.headers,elapsed_ms:Date.now()-started};}catch(error){return {ok:false,status:0,body:null,text:String(error?.message||error),headers:new Headers(),elapsed_ms:Date.now()-started};}}
async function verifyTarget(target){const r=await fetchJson(target.origin+'/api/release-evidence',{headers:{accept:'application/json'}});return {ok:r.ok&&r.body?.ok===true&&r.body?.commit_sha===target.sha&&r.body?.deployment_id===target.deployment,status:r.status,commit_sha:r.body?.commit_sha??null,deployment_id:r.body?.deployment_id??null,environment:r.body?.environment??null};}
async function adminCreate(runId){if(!serviceKey||serviceKey.startsWith('sb_publishable_'))throw new Error('SERVICE_ROLE_UNAVAILABLE');const email=`dabbir-ab-${runId}@example.com`;const password=`Dabbir-AB-${crypto.randomBytes(24).toString('base64url')}!Aa9`;const r=await fetchJson(supabaseUrl+'/auth/v1/admin/users',{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{dabbir_qa:true,dabbir_qa_run_id:runId,role_label:'ab-cognitive-709'}})});if(!r.ok||!r.body?.id)throw new Error('QA_USER_CREATE_FAILED_'+r.status);return {id:r.body.id,email,password};}
async function adminDelete(userId){if(!userId)return {ok:true,status:204};const r=await fetchJson(supabaseUrl+'/auth/v1/admin/users/'+encodeURIComponent(userId),{method:'DELETE',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`}});return {ok:r.ok,status:r.status};}
function cookiesFrom(headers){const rows=typeof headers.getSetCookie==='function'?headers.getSetCookie():[headers.get('set-cookie')].filter(Boolean);const pairs=[];for(const row of rows){for(const name of ['__Host-dabbir_access','__Host-dabbir_refresh']){const m=String(row).match(new RegExp('(?:^|,\\s*)'+name+'=([^;]+)'));if(m)pairs.push(name+'='+m[1]);}}return [...new Set(pairs)].join('; ');}
async function login(target,user){const r=await fetchJson(target.origin+'/api/auth/login',{method:'POST',headers:{origin:target.origin,'content-type':'application/json',accept:'application/json','x-dabbir-client':'web'},body:JSON.stringify({email:user.email,password:user.password})});const cookie=cookiesFrom(r.headers);if(!r.ok||!cookie.includes('__Host-dabbir_access='))throw new Error(`LOGIN_FAILED_${target.label}_${r.status}`);return cookie;}
async function probe(target,cookie,scenario){const r=await fetchJson(target.origin+'/api/dabbir-ai',{method:'POST',headers:{origin:target.origin,cookie,'content-type':'application/json',accept:'application/json','x-dabbir-client':'web'},body:JSON.stringify({synthetic:true,probe:'cognitive_dialogue',scenario,provider:FIXED_PROVIDER})});const providers=Array.isArray(r.body?.providers)?r.body.providers:[];const fixedPath=providers.length>0&&providers.every(p=>p?.provider===FIXED_PROVIDER);const providerErrors=providers.filter(p=>p?.error).map(p=>p.error);const checks=r.body?.checks&&typeof r.body.checks==='object'?r.body.checks:{};const checkValues=Object.values(checks);const logicPass=r.ok&&r.body?.ok===true&&checkValues.length>0&&checkValues.every(Boolean)&&fixedPath&&providerErrors.length===0;const noise=!r.ok&&(r.status===429||r.status===502||providerErrors.length>0);return {http_status:r.status,elapsed_ms:r.elapsed_ms,logic_pass:logicPass,provider_noise:noise,fixed_provider_path:fixedPath,checks,providers:providers.map(p=>({turn:p?.turn??null,provider:p?.provider??null,model:p?.model??null,latency_ms:p?.latency_ms??null,error:p?.error??null,telemetry:safeTelemetry(p?.telemetry)})),error:r.body?.error??null};}

export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(process.env.VERCEL_ENV==='production'||process.env.DABBIR_AI_GATEWAY_TEST!=='1'||String(process.env.VERCEL_GIT_COMMIT_REF||'')!=='diag/ab-cognitive-709')return json(res,404,{ok:false,error:'NOT_AVAILABLE'});
 if(String(req.query?.run||'')!=='1')return json(res,400,{ok:false,error:'RUN_CONFIRMATION_REQUIRED'});
 const startedAt=new Date().toISOString();const runId='ab709-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex');let user=null;const result={ok:false,run_id:runId,started_at:startedAt,provider:FIXED_PROVIDER,runs_per_side:RUNS,targets:{},samples:[],cleanup:null};
 try{
  for(const t of TARGETS){const v=await verifyTarget(t);result.targets[t.label]=v;if(!v.ok)throw new Error('IMMUTABLE_TARGET_MISMATCH_'+t.label);}
  user=await adminCreate(runId);
  const sessions={};for(const t of TARGETS)sessions[t.label]=await login(t,user);
  for(let i=0;i<RUNS;i++){
   const ordered=i%2===0?TARGETS:[...TARGETS].reverse();
   for(const scenario of SCENARIOS){
    for(const t of ordered){const sample=await probe(t,sessions[t.label],scenario);result.samples.push({iteration:i+1,target:t.label,sha:t.sha,deployment:t.deployment,scenario,...sample});await sleep(2500);}
   }
  }
  const summary={};for(const t of TARGETS){summary[t.label]={};for(const s of SCENARIOS){const rows=result.samples.filter(x=>x.target===t.label&&x.scenario===s);summary[t.label][s]={attempts:rows.length,logic_passes:rows.filter(x=>x.logic_pass).length,provider_noise:rows.filter(x=>x.provider_noise).length,fixed_path_runs:rows.filter(x=>x.fixed_provider_path).length,check_failures:rows.filter(x=>!x.logic_pass&&!x.provider_noise).map(x=>Object.entries(x.checks||{}).filter(([,v])=>v!==true).map(([k])=>k)),avg_elapsed_ms:Math.round(rows.reduce((a,x)=>a+x.elapsed_ms,0)/Math.max(1,rows.length))};}}
  result.summary=summary;result.ok=true;
 }catch(error){result.error=String(error?.message||error);}finally{result.cleanup=await adminDelete(user?.id).catch(error=>({ok:false,status:0,error:String(error?.message||error)}));result.completed_at=new Date().toISOString();}
 return json(res,result.ok?200:500,result);
}
