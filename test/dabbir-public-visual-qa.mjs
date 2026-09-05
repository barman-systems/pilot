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
   await page.locator('#authEmail').focus();
   assert.ok(await page.locator('#authEmail').evaluate(el=>el===document.activeElement));
   async function noOverflow(){const m=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+1,JSON.stringify(m));}
   await noOverflow();
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-signup.png`,fullPage:true});
   result.checks.push('signup route, heading, language, associated email label, focus, no horizontal overflow');
   await page.locator('#demoFirstCta').click();
   await page.locator('#demoForm').waitFor();
   await noOverflow();
   assert.match(await page.locator('h1').innerText(),/أعمال نشاطك/);
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-trial.png`,fullPage:true});
   // The trial UI remains Arabic; both Arabic and English customer requests are supported.
   await page.locator('#demoMessage').fill(lang==='ar'?'أحتاج تلميع لسيارة دفع رباعي في دبي مارينا بكرة الساعة 11 am':'premium polish SUV Dubai Marina tomorrow 11 am');
   await page.locator('#runDemo').click();
   await page.locator('#receipt.visible').waitFor({timeout:20000});
   assert.match(await page.locator('#truthEvidence').innerText(),/لم تُرسل رسالة واتساب ولم يُحصّل مبلغ/);
   await page.locator('.executionDetails summary').click();
   assert.ok(await page.locator('.executionDetails').getAttribute('open')!==null);
   await noOverflow();
   await page.screenshot({path:`public-visual-evidence/${name}-${lang}-receipt.png`,fullPage:true});
   await page.locator('#resetDemo').click();
   assert.equal(await page.locator('#receipt').isVisible(),false);
   await page.locator('#demoMessage').fill('مرحبا');
   await page.locator('#runDemo').click();
   await page.waitForFunction(()=>document.querySelector('#runDemo').disabled===false&&document.querySelector('#demoStatus').textContent.length>0);
   assert.equal(await page.locator('#receipt').isVisible(),false);
   result.checks.push('business positioning, isolated booking, explicit no-charge truth, expandable history, reset, missing-detail state');
   result.status='PASS';
  }catch(error){failed=true;result.status='FAIL';result.error=String(error);await page.screenshot({path:`public-visual-evidence/${name}-${lang}-failure.png`,fullPage:true}).catch(()=>{});}
  await context.close();
 }
}
}finally{await browser.close();report.status=failed?'FAIL':'PASS';await fs.writeFile('public-visual-evidence/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(failed)process.exitCode=1;
