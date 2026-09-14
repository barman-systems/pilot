import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN=String(process.env.QWEN37_BENCHMARK_ORIGIN||'').trim().replace(/\/$/,'');
const EXPECTED_SHA=String(process.env.EXPECTED_BENCHMARK_SHA||'').trim().toLowerCase();
const BYPASS=String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET||'').trim();
const TRUSTED_OIDC=String(process.env.VERCEL_TRUSTED_OIDC_TOKEN||'').trim();
const RUN_ID=`qwen37-benchmark-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const REPORT_PATH=String(process.env.QWEN37_BENCHMARK_REPORT_PATH||'dabbir-qwen37-live-benchmark.json');
const SCENARIOS=['critical','service_details','correction_side_question','multiple_requests','context_references'];
const BENCHMARK_SCOPE='qwen37-live-v1';

if(!/^https:\/\/[^/]+$/i.test(ORIGIN))throw new Error('QWEN37_BENCHMARK_ORIGIN_REQUIRED');
if(!/^[a-f0-9]{40}$/.test(EXPECTED_SHA))throw new Error('EXPECTED_BENCHMARK_SHA_REQUIRED');
if(!BYPASS&&!TRUSTED_OIDC)throw new Error('VERCEL_PROTECTED_ACCESS_REQUIRED');

const report={run_id:RUN_ID,model:'alibaba/qwen3.7-flash',origin:ORIGIN,expected_sha:EXPECTED_SHA,verified_sha:null,started_at:new Date().toISOString(),completed_at:null,verdict:'RUNNING',scenarios:[],aggregate:{scenario_passed:0,scenario_total:SCENARIOS.length,provider_calls:0,input_tokens:0,output_tokens:0,reasoning_tokens:0,total_latency_ms:0,avg_provider_latency_ms:0,actual_cost_usd:0},production_mutations:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const small=(value,max=240)=>String(value??'').replace(/eyJ[A-Za-z0-9._-]{30,}/g,'[JWT]').slice(0,max);

function protectionHeaders(extra={}){
 const auth=BYPASS?{'x-vercel-protection-bypass':BYPASS,'x-vercel-set-bypass-cookie':'true'}:{'x-vercel-trusted-oidc-idp-token':TRUSTED_OIDC};
 return {...auth,...extra};
}

async function rawFetch(url,options={},timeoutMs=30000){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(url,{redirect:'follow',cache:'no-store',...options,signal:controller.signal,headers:protectionHeaders(options.headers||{})});
  const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}
  return {ok:response.ok,status:response.status,text,json,response};
 }catch(error){return {ok:false,status:0,text:String(error?.message||error),json:null,response:null};}
 finally{clearTimeout(timer);}
}

async function request(path,{method='GET',body,headers={},timeoutMs=30000}={}){
 const h={accept:'application/json',...headers};if(!['GET','HEAD'].includes(method.toUpperCase()))h.origin=ORIGIN;
 let payload=body;if(body!==undefined&&typeof body!=='string'){payload=JSON.stringify(body);h['content-type']='application/json';}
 return rawFetch(`${ORIGIN}${path}`,{method,headers:h,body:payload},timeoutMs);
}

async function waitForPreview(){
 const deadline=Date.now()+240000;let last='NO_RESPONSE';
 while(Date.now()<deadline){
  const r=await request(`/api/release-evidence?t=${Date.now()}`,{timeoutMs:15000});
  const observed=String(r.json?.commit_sha||'').toLowerCase();last=`${r.status}:${observed||r.json?.error||small(r.text,80)}`;
  if(r.status===200&&r.json?.ok===true&&observed===EXPECTED_SHA){report.verified_sha=observed;return;}
  await sleep(5000);
 }
 throw new Error(`EXACT_PREVIEW_SHA_NOT_READY_${last}`);
}

function aggregateScenario(row){
 if(row.ok)report.aggregate.scenario_passed++;
 for(const call of row.provider_calls||[]){
  report.aggregate.provider_calls++;
  report.aggregate.total_latency_ms+=Number(call.latency_ms)||0;
  const usage=call.telemetry?.final_request_usage||{};
  report.aggregate.input_tokens+=Number(usage.inputTokens??usage.input_tokens)||0;
  report.aggregate.output_tokens+=Number(usage.outputTokens??usage.output_tokens)||0;
  report.aggregate.reasoning_tokens+=Number(usage.reasoningTokens??usage.reasoning_tokens)||0;
  report.aggregate.actual_cost_usd+=Number(call.telemetry?.actual_cost_usd)||0;
 }
}

async function run(){
 await waitForPreview();
 for(const scenario of SCENARIOS){
  const r=await request('/api/dabbir-qwen37-benchmark',{method:'POST',headers:{'x-dabbir-benchmark-scope':BENCHMARK_SCOPE},body:{synthetic:true,scenario},timeoutMs:120000});
  const row=r.json&&typeof r.json==='object'?r.json:{ok:false,state:'FAILED',scenario,error:`HTTP_${r.status}:${small(r.text,120)}`};
  report.scenarios.push(row);aggregateScenario(row);
 }
 report.aggregate.avg_provider_latency_ms=report.aggregate.provider_calls?Math.round(report.aggregate.total_latency_ms/report.aggregate.provider_calls):0;
 report.aggregate.actual_cost_usd=Number(report.aggregate.actual_cost_usd.toFixed(8));
 report.verdict=report.aggregate.scenario_passed===report.aggregate.scenario_total?'PASS':'FAIL';
}

try{await run();}
catch(error){report.verdict='FAIL';report.error=small(error?.stack||error?.message||error,1400);console.error(error);}
finally{
 report.completed_at=new Date().toISOString();fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));
 console.log(`DABBIR_QWEN37_LIVE_BENCHMARK=${report.verdict}`);
 console.log(`SCENARIOS=${report.aggregate.scenario_passed}/${report.aggregate.scenario_total}`);
 console.log(`PROVIDER_CALLS=${report.aggregate.provider_calls}`);
 console.log(`TOKENS=${report.aggregate.input_tokens}/${report.aggregate.output_tokens}/${report.aggregate.reasoning_tokens}`);
 console.log(`ACTUAL_COST_USD=${report.aggregate.actual_cost_usd}`);
 console.log('PRODUCTION_MUTATIONS=0');
}
if(report.verdict!=='PASS')process.exitCode=1;
