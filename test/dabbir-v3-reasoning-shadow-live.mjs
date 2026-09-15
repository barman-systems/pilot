// Exact-head protected Preview runner. Touching this file intentionally triggers the canonical live shadow benchmark after duplicate-runner cleanup.
import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN=String(process.env.V3_REASONING_BENCHMARK_ORIGIN||'').trim().replace(/\/$/,'');
const EXPECTED_SHA=String(process.env.EXPECTED_BENCHMARK_SHA||'').trim().toLowerCase();
const BYPASS=String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET||'').trim();
const TRUSTED_OIDC=String(process.env.VERCEL_TRUSTED_OIDC_TOKEN||'').trim();
const REPORT_PATH=String(process.env.V3_REASONING_BENCHMARK_REPORT_PATH||'dabbir-v3-reasoning-shadow-benchmark.json');
const RUN_ID=`v3-reasoning-shadow-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const BENCHMARK_SCOPE='v3-reasoning-shadow-v1';

if(!/^https:\/\/[^/]+$/i.test(ORIGIN))throw new Error('V3_REASONING_BENCHMARK_ORIGIN_REQUIRED');
if(!/^[a-f0-9]{40}$/.test(EXPECTED_SHA))throw new Error('EXPECTED_BENCHMARK_SHA_REQUIRED');
if(!BYPASS&&!TRUSTED_OIDC)throw new Error('VERCEL_PROTECTED_ACCESS_REQUIRED');

const report={run_id:RUN_ID,origin:ORIGIN,expected_sha:EXPECTED_SHA,verified_sha:null,started_at:new Date().toISOString(),completed_at:null,verdict:'RUNNING',result:null};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const small=(value,max=240)=>String(value??'').replace(/eyJ[A-Za-z0-9._-]{30,}/g,'[JWT]').slice(0,max);
function protectionHeaders(extra={}){const auth=BYPASS?{'x-vercel-protection-bypass':BYPASS,'x-vercel-set-bypass-cookie':'true'}:{'x-vercel-trusted-oidc-idp-token':TRUSTED_OIDC};return {...auth,...extra};}
async function rawFetch(url,options={},timeoutMs=30000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{redirect:'follow',cache:'no-store',...options,signal:controller.signal,headers:protectionHeaders(options.headers||{})});const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}return {ok:response.ok,status:response.status,text,json};}catch(error){return {ok:false,status:0,text:String(error?.message||error),json:null};}finally{clearTimeout(timer);}}
async function request(path,{method='GET',body,headers={},timeoutMs=30000}={}){const h={accept:'application/json',...headers};if(!['GET','HEAD'].includes(method.toUpperCase()))h.origin=ORIGIN;let payload=body;if(body!==undefined&&typeof body!=='string'){payload=JSON.stringify(body);h['content-type']='application/json';}return rawFetch(`${ORIGIN}${path}`,{method,headers:h,body:payload},timeoutMs);}
async function waitForPreview(){const deadline=Date.now()+240000;let last='NO_RESPONSE';while(Date.now()<deadline){const r=await request(`/api/release-evidence?t=${Date.now()}`,{timeoutMs:15000});const observed=String(r.json?.commit_sha||'').toLowerCase();last=`${r.status}:${observed||r.json?.error||small(r.text,80)}`;if(r.status===200&&r.json?.ok===true&&observed===EXPECTED_SHA){report.verified_sha=observed;return;}await sleep(5000);}throw new Error(`EXACT_PREVIEW_SHA_NOT_READY_${last}`);}

try{
 await waitForPreview();
 const r=await request('/api/dabbir-v3-reasoning-shadow-benchmark',{method:'POST',headers:{'x-dabbir-benchmark-scope':BENCHMARK_SCOPE},body:{synthetic:true},timeoutMs:180000});
 report.result=r.json&&typeof r.json==='object'?r.json:{ok:false,state:'FAILED',error:`HTTP_${r.status}:${small(r.text,160)}`};
 report.verdict=report.result.ok===true?'PASS':'FAIL';
}catch(error){report.verdict='FAIL';report.error=small(error?.stack||error?.message||error,1400);console.error(error);}
finally{
 report.completed_at=new Date().toISOString();fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));
 const m=report.result?.metrics||{};
 console.log(`DABBIR_V3_REASONING_SHADOW_BENCHMARK=${report.verdict}`);
 console.log(`CASES=${report.result?.cases||0}`);
 console.log(`MODEL_CALLS=${report.result?.model_calls||0}`);
 console.log(`TOOL_CALLS=${report.result?.tool_calls||0}`);
 console.log(`WRONG_MUTATIONS=${m.wrong_mutations??'unknown'}`);
 console.log(`UNSUPPORTED_ASSUMPTIONS=${m.unsupported_assumptions??'unknown'}`);
 console.log(`TASK_COMPLETION_RATE=${m.task_completion_rate??'unknown'}`);
 console.log(`P95_LATENCY_MS=${m.p95_latency_ms??'unknown'}`);
 console.log(`MEASURED_GATEWAY_COST_USD=${m.measured_gateway_cost_usd??'unknown'}`);
 console.log('PRODUCTION_MUTATIONS=0');
}
if(report.verdict!=='PASS')process.exitCode=1;
