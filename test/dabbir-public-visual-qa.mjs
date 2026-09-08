import { webkit } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.QA_URL;
const sha=process.env.QA_SHA;
assert.ok(origin?.startsWith('https://') && /^[a-f0-9]{40}$/.test(sha||''));
await fs.mkdir('public-visual-evidence',{recursive:true});
const report={sha,origin,engine:'WebKit viewport emulation, not a physical device',authenticated:false,cases:[]};
let release;
for(let attempt=0;attempt<60;attempt++){
  try{const r=await fetch(origin+'/api/release-evidence',{signal:AbortSignal.timeout(10000)});const j=await r.json();if(j.ok&&j.commit_sha===sha){release=j;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.ok(release,'Exact candidate release not available: do not test a stale deployment');
report.release=release;
const browser=await webkit.launch();
let failed=false;
const devices=[['iphone',390,844],['iphone-max',430,932],['ipad',768,1024],['ipad-landscape',1024,768],['desktop',1440,900]];
try{
for(const [name,width,height] of devices){
 for(const lang of ['ar','en']){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1100,hasTouch:width<1100,reducedMotion:'reduce'});
  const page=await context.newPage();const result={name,width,height,lang,checks:[]};report.cases.push(result);
  try{
   await page.goto(origin+'/?signup=1',{waitUntil:'domcontentloaded'});
   await page.locator('#authGate:not(.hidden)').waitFor({timeout:30000});
   await page.locator(lang==='ar'?'#authAr':'#authEn').click();
   await page.getByRole('heading',{name:lang==='ar'?'أنشئ حساب نشاطك':'Create your business account',exact:true}).waitFor();
   assert.equal(await page.locator('#signupTab').getAttribute('aria-selected'),'true');
   assert.ok(await page.locator('#authEmail').evaluate(el=>el.labels.length===1));
   await page.locator('#authGate').evaluate(el=>{el.scrollTop=0});
   assert.ok(await page.locator('#authGate .authCard').evaluate(el=>el.getBoundingClientRect().top>=0),'Signup header must remain reachable at scroll start');
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-signup-top.png`,fullPage:true});
   await page.locator('#authEmail').focus();
   assert.ok(await page.locator('#authEmail').evaluate(el=>el===document.activeElement));
   async function noOverflow(){const m=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+1,JSON.stringify(m));}
   await noOverflow();
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-signup.png`,fullPage:true});
   result.checks.push('signup route, heading, language, associated email label, focus, no horizontal overflow');
   assert.equal(await page.locator('#demoFirstCta, .preSignupValue, a[href="/try"]').count(),0);
   await page.locator('#loginTab').click();
   await page.getByRole('heading',{name:lang==='ar'?'دخول أصحاب الأنشطة':'Business owner login',exact:true}).waitFor();
   assert.equal(await page.locator('#loginTab').getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#authPassword').getAttribute('autocomplete'),'current-password');
   await noOverflow();
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-login.png`,fullPage:true});
   for(const path of ['/try','/try/','/try.html','/api/dabbir-market-preview']){
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    await page.locator('#authGate:not(.hidden)').waitFor({timeout:30000});
    assert.equal(new URL(page.url()).pathname,'/');
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.equal(await page.locator('#demoForm, #demoFirstCta').count(),0);
   }
   const retired=await page.request.post(origin+'/api/dabbir-market-demo',{data:{message:'Hello',operation_id:'retired_demo_check_123'}});
   assert.equal(retired.status(),410);
   assert.equal((await retired.json()).error,'DEMO_RETIRED');
   result.checks.push('login tab and password semantics, demo absent, old links return to login in the selected language, demo API retired');
   result.status='PASS';
  }catch(error){failed=true;result.status='FAIL';result.error=String(error);await page.screenshot({path:`public-visual-evidence/${name}-${lang}-failure.png`,fullPage:true}).catch(()=>{});}
  await context.close();
 }
}
}finally{await browser.close();report.status=failed?'FAIL':'PASS';await fs.writeFile('public-visual-evidence/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(failed)process.exitCode=1;
