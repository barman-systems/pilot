import fs from 'node:fs';

const ORIGIN=String(process.env.PROTECTED_QA_ORIGIN||'').trim().replace(/\/$/,'');
const TRUSTED_OIDC=String(process.env.VERCEL_TRUSTED_OIDC_TOKEN||'').trim();
const EXPECTED_SHA=String(process.env.EXPECTED_CANARY_SHA||'').trim().toLowerCase();
const REPORT_PATH=process.env.CANARY_REPORT_PATH||'dabbir-golden-canary-smoke-report.json';
const EXPECTED_PROJECT_ID='prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq';
const EXPECTED_REPOSITORY='barman-systems/pilot';

if(!/^https:\/\/[^/]+$/i.test(ORIGIN)) throw new Error('GOLDEN_CANARY_ORIGIN_REQUIRED');
if(!TRUSTED_OIDC) throw new Error('GOLDEN_CANARY_TRUSTED_OIDC_REQUIRED');
if(!/^[a-f0-9]{40}$/i.test(EXPECTED_SHA)) throw new Error('GOLDEN_CANARY_SHA_REQUIRED');

const report={
  contract:'DABBIR_GOLDEN_CANARY_V1',
  origin:ORIGIN,
  expected_sha:EXPECTED_SHA,
  verified_sha:null,
  deployment_id:null,
  environment:null,
  verdict:'RUNNING',
  started_at:new Date().toISOString(),
  completed_at:null,
  steps:[],
  artifacts:{},
};

function assert(condition,message){if(!condition)throw new Error(message||'ASSERTION_FAILED')}
function headers(extra={}){return {'x-vercel-trusted-oidc-idp-token':TRUSTED_OIDC,...extra}}
async function protectedFetch(path,init={}){const h=new Headers(init.headers||{});for(const [k,v] of Object.entries(headers()))h.set(k,v);return fetch(`${ORIGIN}${path}`,{redirect:'follow',cache:'no-store',...init,headers:h})}
async function step(name,fn){const started=Date.now();const row={name,status:'RUNNING',duration_ms:null,detail:null};report.steps.push(row);try{const detail=await fn();row.status='PASS';row.duration_ms=Date.now()-started;row.detail=detail||null;console.log(`PASS ${name} (${row.duration_ms}ms)${detail?` — ${detail}`:''}`)}catch(error){row.status='FAIL';row.duration_ms=Date.now()-started;row.detail=String(error?.stack||error?.message||error).slice(0,1200);console.error(`FAIL ${name} — ${row.detail}`);throw error}}

let browser;
try{
  await step('00_exact_preview_release',async()=>{
    const response=await protectedFetch(`/api/release-evidence?t=${Date.now()}`,{headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>({}));
    assert(response.status===200&&body?.ok===true,`RELEASE_EVIDENCE_HTTP_${response.status}`);
    assert(String(body.commit_sha||'').toLowerCase()===EXPECTED_SHA,`CANARY_SHA_MISMATCH_${body.commit_sha||'missing'}`);
    assert(String(body.environment||'').toLowerCase()==='preview',`CANARY_NOT_PREVIEW_${body.environment||'missing'}`);
    assert(body.project_id===EXPECTED_PROJECT_ID,`CANARY_PROJECT_MISMATCH_${body.project_id||'missing'}`);
    assert(body.git_provider==='github','CANARY_GIT_PROVIDER_MISMATCH');
    assert(body.repository===EXPECTED_REPOSITORY,`CANARY_REPOSITORY_MISMATCH_${body.repository||'missing'}`);
    assert(String(body.deployment_id||'').startsWith('dpl_'),'CANARY_DEPLOYMENT_ID_MISSING');
    report.verified_sha=String(body.commit_sha).toLowerCase();
    report.deployment_id=body.deployment_id;
    report.environment=body.environment;
    return `${body.deployment_id} is exact preview SHA ${report.verified_sha}`;
  });

  await step('01_home_identity',async()=>{
    const response=await protectedFetch('/',{headers:{accept:'text/html'}});
    const text=await response.text();
    assert(response.status===200,`HOME_STATUS_${response.status}`);
    assert(/DABBIR/i.test(text),'DABBIR_IDENTITY_MISSING');
    return 'Protected preview home returned DABBIR identity.';
  });

  await step('02_auth_fails_closed',async()=>{
    const response=await protectedFetch('/api/dabbir-runtime-fast?summary=1',{headers:{accept:'application/json'}});
    const text=await response.text();
    assert(response.status===401,`UNAUTH_RUNTIME_EXPECTED_401_GOT_${response.status}:${text.slice(0,160)}`);
    return 'Vercel preview access does not bypass DABBIR application authentication.';
  });

  await step('03_iphone_webkit_login_gate',async()=>{
    const {webkit}=await import('playwright');
    browser=await webkit.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-AE',timezoneId:'Asia/Dubai',extraHTTPHeaders:headers()});
    const page=await context.newPage();
    const pageErrors=[];const consoleErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
    page.on('console',message=>{if(message.type()==='error'&&!/401|AUTH_REQUIRED|Failed to load resource/i.test(message.text()))consoleErrors.push(message.text())});
    const response=await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:45000});
    assert(response?.status()===200,`BROWSER_HOME_STATUS_${response?.status()}`);
    await page.locator('#authGate:not(.hidden)').waitFor({state:'visible',timeout:20000});
    await page.locator('#authEmail').waitFor({state:'visible',timeout:10000});
    await page.locator('#authPassword').waitFor({state:'visible',timeout:10000});
    await page.locator('#authSubmit').waitFor({state:'visible',timeout:10000});
    const ui=await page.evaluate(()=>({authority:window.__dabbirUiAuthority||null,bodyAuthority:document.body?.dataset?.dabbirUi||null}));
    report.artifacts.ui_authority=ui;
    assert(ui.authority?.version==='owner-first-v4',`UI_AUTHORITY_INVALID_${JSON.stringify(ui)}`);
    assert(pageErrors.length===0,`PAGE_ERRORS_${pageErrors.join('|')}`);
    assert(consoleErrors.length===0,`CONSOLE_ERRORS_${consoleErrors.join('|')}`);
    await page.screenshot({path:'dabbir-golden-canary-smoke.png',fullPage:true});
    report.artifacts.screenshot='dabbir-golden-canary-smoke.png';
    await context.close();
    return 'Arabic iPhone WebKit login gate rendered with authoritative owner-first-v4 UI.';
  });

  report.verdict='PASS';
}catch(error){report.verdict='FAIL';report.error=String(error?.stack||error?.message||error).slice(0,1800);process.exitCode=1}finally{if(browser)await browser.close().catch(()=>{});report.completed_at=new Date().toISOString();fs.writeFileSync(REPORT_PATH,`${JSON.stringify(report,null,2)}\n`);console.log(`DABBIR_GOLDEN_CANARY_SMOKE_VERDICT=${report.verdict}`)}
