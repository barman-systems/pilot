import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN=String(process.env.QWEN37_CANARY_PROBE_ORIGIN||'').trim().replace(/\/$/,'');
const EXPECTED_SHA=String(process.env.EXPECTED_CANARY_SHA||'').trim().toLowerCase();
const BYPASS=String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET||'').trim();
const TRUSTED_OIDC=String(process.env.VERCEL_TRUSTED_OIDC_TOKEN||'').trim();
const REPORT_PATH=String(process.env.QWEN37_CANARY_PROBE_REPORT_PATH||'dabbir-qwen37-live-canary-probe.json');
const SCOPE='qwen37-canary-live-v1';
const RUN_ID=`qwen37-canary-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

if(!/^https:\/\/[^/]+$/i.test(ORIGIN))throw new Error('QWEN37_CANARY_PROBE_ORIGIN_REQUIRED');
if(!/^[a-f0-9]{40}$/.test(EXPECTED_SHA))throw new Error('EXPECTED_CANARY_SHA_REQUIRED');
if(!BYPASS&&!TRUSTED_OIDC)throw new Error('VERCEL_PROTECTED_ACCESS_REQUIRED');

const report={run_id:RUN_ID,expected_sha:EXPECTED_SHA,verified_sha:null,origin:ORIGIN,started_at:new Date().toISOString(),completed_at:null,verdict:'RUNNING',probe:null,production_mutations:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const small=(value,max=240)=>String(value??'').replace(/eyJ[A-Za-z0-9._-]{30,}/g,'[JWT]').slice(0,max);

function protectionHeaders(extra={}){
  const auth=BYPASS?{'x-vercel-protection-bypass':BYPASS,'x-vercel-set-bypass-cookie':'true'}:{'x-vercel-trusted-oidc-idp-token':TRUSTED_OIDC};
  return {...auth,...extra};
}

async function request(path,{method='GET',body,headers={},timeoutMs=30000}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const h={accept:'application/json',...headers};if(!['GET','HEAD'].includes(method.toUpperCase()))h.origin=ORIGIN;
    let payload=body;if(body!==undefined&&typeof body!=='string'){payload=JSON.stringify(body);h['content-type']='application/json';}
    const response=await fetch(`${ORIGIN}${path}`,{method,body:payload,headers:protectionHeaders(h),redirect:'follow',cache:'no-store',signal:controller.signal});
    const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}
    return {status:response.status,ok:response.ok,json,text};
  }finally{clearTimeout(timer);}
}

async function waitForExactPreview(){
  const deadline=Date.now()+240000;let last='NO_RESPONSE';
  while(Date.now()<deadline){
    const r=await request(`/api/release-evidence?t=${Date.now()}`,{timeoutMs:15000}).catch(error=>({status:0,json:null,text:String(error)}));
    const observed=String(r.json?.commit_sha||'').toLowerCase();last=`${r.status}:${observed||r.json?.error||small(r.text,80)}`;
    if(r.status===200&&r.json?.ok===true&&observed===EXPECTED_SHA){report.verified_sha=observed;return;}
    await sleep(5000);
  }
  throw new Error(`EXACT_PREVIEW_SHA_NOT_READY_${last}`);
}

async function run(){
  await waitForExactPreview();
  const r=await request('/api/dabbir-qwen37-canary-probe',{
    method:'POST',
    headers:{'x-dabbir-canary-probe-scope':SCOPE},
    body:{synthetic:true},
    timeoutMs:45000,
  });
  const probe=r.json&&typeof r.json==='object'?r.json:{ok:false,error:`HTTP_${r.status}:${small(r.text,120)}`};
  report.probe=probe;
  const exactModel=probe.model==='alibaba/qwen3.7-flash';
  const exactProvider=probe.provider==='vercel-ai-gateway';
  const selected=probe.canary?.selected===true&&probe.canary?.fallback===false&&probe.canary?.percent===1;
  const noMutations=probe.synthetic_only===true&&probe.customer_delivery===false&&probe.database_metering===false&&probe.production_mutations===0;
  report.verdict=r.status===200&&probe.ok===true&&exactModel&&exactProvider&&selected&&noMutations?'PASS':'FAIL';
}

try{await run();}
catch(error){report.verdict='FAIL';report.error=small(error?.stack||error?.message||error,1400);console.error(error);}
finally{
  report.completed_at=new Date().toISOString();
  fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));
  console.log(`DABBIR_QWEN37_LIVE_CANARY=${report.verdict}`);
  console.log(`EXACT_SHA=${report.verified_sha||'NONE'}`);
  console.log(`MODEL=${report.probe?.model||'NONE'}`);
  console.log(`PROVIDER=${report.probe?.provider||'NONE'}`);
  console.log(`SELECTED=${report.probe?.canary?.selected===true}`);
  console.log(`FALLBACK=${report.probe?.canary?.fallback===true}`);
  console.log(`TOKENS=${report.probe?.usage?.input_tokens||0}/${report.probe?.usage?.output_tokens||0}/${report.probe?.usage?.reasoning_tokens||0}`);
  console.log(`LATENCY_MS=${report.probe?.usage?.latency_ms||0}`);
  console.log(`ACTUAL_COST_USD=${report.probe?.usage?.actual_cost_usd??'UNKNOWN'}`);
  console.log('PRODUCTION_MUTATIONS=0');
}
if(report.verdict!=='PASS')process.exitCode=1;
