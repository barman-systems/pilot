// Actual application response transformers and bundles; synthetic data only.
// Runs in CI with the existing Playwright QA dependency. No production credentials or writes.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'ui-authority-evidence');await fs.mkdir(out,{recursive:true});
const beforeDir=await fs.mkdtemp(path.join(os.tmpdir(),'dabbir-ui-before-'));
const base='00ffb68ab0dee7b184c97aa8c38c410720c23ab6';
execFileSync('git',['worktree','add','--detach',beforeDir,base],{cwd:root,stdio:'pipe'});
await fs.symlink(path.join(root,'node_modules'),path.join(beforeDir,'node_modules'),'dir');
// Compare the Vercel build output, not stale committed generated copies.
for(const cwd of [beforeDir,root])execFileSync(process.execPath,['scripts/build-dabbir-ui-bundles.mjs'],{cwd,stdio:'pipe'});
const B='10000000-0000-4000-8000-000000000001',C='30000000-0000-4000-8000-000000000001';
const fixture={ok:true,user:{id:'20000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'},membership:{role:'owner'},business:{id:B,name:'Synthetic UI authority',business_type:'store',timezone:'Asia/Dubai',currency_code:'AED',country_code:'AE'},customers:[],conversations:[{id:C,state:'ai_active'}],selected_conversation_id:C,appointments:[],messages:['customer','ai','human'].map((role,i)=>({id:'message-'+i,conversation_id:C,sender_type:role,body:role==='customer'?'أريد حجز موعد غدًا':role==='ai'?'DABBIR — كيف أساعدك؟':'Staff — ready to help',created_at:'2026-09-14T10:00:00Z'})),tasks:[],handoffs:[],followups:[],inventory:[],orders:[],services:[],workers:[],branches:[],ai:{configured:false},whatsapp:{state:'NOT_CONNECTED'},verified_metrics:{state:'VERIFIED_EXACT_COUNTS',customers:0,active_chats:1,ai_messages:1,appointments:0}};
async function serve(directory){
 const app=(await import(pathToFileURL(path.join(directory,'api/app-safari-recovery.js')))).default;
 const booking=(await import(pathToFileURL(path.join(directory,'api/car-wash-booking.js')))).default;
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://fixture');
   const adapter={status(c){res.statusCode=c;return adapter},setHeader(k,v){res.setHeader(k,v);return adapter},getHeader(k){return res.getHeader(k)},end(b){res.end(b);return adapter},send(b){res.end(b);return adapter},set statusCode(c){res.statusCode=c},get statusCode(){return res.statusCode}};
   if(url.pathname==='/')return app(req,adapter);
   if(url.pathname==='/book')return booking(req,adapter);
   if(url.pathname==='/team'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(await fs.readFile(path.join(directory,'team.html')))}
   if(url.pathname.startsWith('/api/')&&/(?:ui|ui-sentry)$/.test(url.pathname)){
    const module=await import(pathToFileURL(path.join(directory,url.pathname+'.js')));
    return module.default(req,adapter);
   }
   const asset=path.join(directory,'public',url.pathname);
   if(!asset.startsWith(path.join(directory,'public')+path.sep))throw Error('invalid asset path');
   res.setHeader('content-type',asset.endsWith('.css')?'text/css':asset.endsWith('.js')?'application/javascript':'image/png');
   res.end(await fs.readFile(asset));
  }catch{res.statusCode=404;res.end('Synthetic fixture: asset unavailable')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,url:'http://127.0.0.1:'+server.address().port};
}

const servers={before:await serve(beforeDir),after:await serve(root)};
const report={base,head:process.env.UI_AUTHORITY_HEAD||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'REAL_SERVED_UI_SYNTHETIC_DATA_NO_PRODUCTION_WRITES',comparisons:[],booking:[],errors:[]};
async function contextFor(browser,url,language,width,mode='workspace',gps='denied'){
 const context=await browser.newContext({viewport:{width,height:1024},isMobile:width<=768,hasTouch:width<=768,locale:language==='ar'?'ar-AE':'en-AE',timezoneId:'Asia/Dubai',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 await context.addInitScript(({fixture,language,mode,gps})=>{
  localStorage.setItem('dabbir_lang',language);window.__uiTestPosts=[];
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:gps==='unsupported'?undefined:{getCurrentPosition(ok,fail){gps==='success'?ok({coords:{latitude:24.4539,longitude:54.3773}}):fail({code:1})}}});
  window.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href),reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
   if(url.pathname==='/api/public-car-wash'){
    if(options.method==='POST'){window.__uiTestPosts.push(JSON.parse(options.body));return reply({ok:true,booking:{id:'synthetic-booking'}})}
    if(url.searchParams.get('action')==='slots')return reply({ok:true,slots:[{slot_at:'2026-10-01T10:00:00Z'}]});
    return reply({ok:true,catalog:{business:{name:'Synthetic car wash',country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai'},offers:[{id:'40000000-0000-4000-8000-000000000001',name_ar:'غسيل خارجي',name_en:'Exterior wash',saloon_price_aed:30,station_price_aed:40,duration_minutes:30}]}});
   }
   if((options.method||'GET')!=='GET')return reply({ok:false,error:'SYNTHETIC_WRITE_BLOCKED'},403);
   if(url.pathname.includes('dabbir-runtime'))return mode==='auth'?reply({ok:false},401):reply(fixture);
   if(url.pathname==='/api/activity-tasks')return reply({ok:true,business_id:fixture.business.id,business_type:'store',profile:{show_appointments:false},tasks:[],can_manage:true});
   return reply({ok:false,error:'SYNTHETIC_NOT_CONFIGURED'},404);
  };
 },{fixture,language,mode,gps});
 return context;
}
const palette=page=>page.evaluate(()=>Object.fromEntries(['--bg','--accent','--panel','--line','--muted','--ds-brand'].map(key=>[key,getComputedStyle(document.documentElement).getPropertyValue(key).trim()])));
const finalCascade=page=>page.evaluate(()=>{
 const selectors=['body','.side','.top','#nav .navBtn.active','#bottomNav button.active','#screen-dashboard .card','#authEmail','#authSubmit','.authCard','.modalBox','#toast','.table'];
 const properties=['background-color','color','border-top-color','border-top-width','border-radius','font-family','font-size','font-weight','line-height','padding-top','padding-right','padding-bottom','padding-left','min-height','text-align','direction'];
 return {themeColor:document.querySelector('meta[name="theme-color"]')?.content,...Object.fromEntries(selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return [selector,null];const style=getComputedStyle(el);return [selector,Object.fromEntries(properties.map(key=>[key,style.getPropertyValue(key)]))]}))};
});
try{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch();
  try{
   for(const width of [390,768,1280])for(const language of ['ar','en']){
    const observed={};
    for(const version of ['before','after']){
     const context=await contextFor(browser,servers[version].url,language,width);
     const page=await context.newPage();page.setDefaultTimeout(15000);
     await page.goto(servers[version].url,{waitUntil:'domcontentloaded'});
     await page.locator('#appShell:not(.hidden)').waitFor();
     await page.waitForFunction(()=>window.__dabbirUiLifecycle&&window.__dabbirContextualNavigation);
     observed[version]={palette:await palette(page),card:await page.locator('#screen-dashboard .card').first().evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderColor,radius:s.borderRadius,padding:s.padding}})};
     observed[version].cascade=await finalCascade(page);
     await page.evaluate(()=>{openModal('#appointmentModal','#apptCustomer');toast(document.documentElement.lang==='ar'?'اختبار الواجهة':'UI verification')});
     await page.locator('#appointmentModal.open').waitFor({state:'visible'});
     await page.locator('#toast.show').waitFor({state:'visible'});
     observed[version].modalCascade=await finalCascade(page);
     await page.evaluate(()=>{closeModal(document.querySelector('#appointmentModal'));document.querySelector('#toast').classList.remove('show')});
     if(version==='after'){
      assert.equal(await page.locator('style').count(),0,'no feature can inject a second stylesheet');
      const stable=await finalCascade(page);
      await page.evaluate(()=>{for(const link of [...document.querySelectorAll('link[rel="stylesheet"]')].reverse())document.head.append(link)});
      // Moving link nodes can detach/reload their sheets. Compare the final cascade, not the transient unstyled frame.
      await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.sheet&&link.sheet.cssRules.length>0));
      assert.deepEqual(await finalCascade(page),stable,'resolved styles do not depend on stylesheet link ordering');
      const attack=await page.addStyleTag({content:'#screen-dashboard .card{background-color:rgb(1,2,3)!important}'});
      assert.notDeepEqual(await finalCascade(page),stable,'computed-style oracle detects a competing runtime authority');
      await attack.evaluate(el=>el.remove());
      assert.deepEqual(await finalCascade(page),stable,'removing attacker restores the canonical result');
     }
     if(await page.locator('#menuBtn').isVisible())await page.locator('#menuBtn').click();
     await page.locator('#nav [data-screen="conversations"]').click();
     await page.locator('#chatList [data-cid]').first().click();
     await page.waitForFunction(()=>document.querySelectorAll('#messages .msgrow').length===3&&document.querySelector('#messages .dabbirSenderLabel'));
     observed[version].senders=await page.locator('#messages .msgrow').evaluateAll(rows=>rows.map(row=>({role:['ai','human','customer'].find(role=>row.classList.contains(role)),background:getComputedStyle(row.querySelector('.bubble')).backgroundColor,border:getComputedStyle(row.querySelector('.bubble')).borderColor,labels:[...row.querySelectorAll(':scope > .dabbirSenderLabel,:scope > .d4-sender')].map(el=>el.textContent)})));
     if(version==='after'){
      assert.equal(new Set(observed.after.senders.map(x=>x.background)).size,3,'sender backgrounds remain distinct after all runtime modules');
      assert.equal(new Set(observed.after.senders.map(x=>x.border)).size,3,'sender borders remain distinct');
      for(const sender of observed.after.senders){assert.equal(sender.labels.length,1,'one sender label owner');assert.equal(sender.labels[0],sender.role==='ai'?'DABBIR':sender.role==='human'?(language==='ar'?'الموظف':'Staff'):(language==='ar'?'العميل':'Customer'))}
      // Exercise real render/language lifecycle in both directions, not just initial load.
      await page.locator(language==='ar'?'#enBtn':'#arBtn').click();await page.locator(language==='ar'?'#arBtn':'#enBtn').click();
      await page.waitForFunction(()=>[...document.querySelectorAll('#messages .msgrow')].every(row=>row.querySelectorAll(':scope > .dabbirSenderLabel,:scope > .d4-sender').length===1));
     }
     await page.screenshot({path:path.join(out,`${engine}-${width}-${language}-${version}.png`),fullPage:true});await context.close();
    }
    assert.deepEqual(observed.after.palette,observed.before.palette,'web palette is preserved');
    assert.deepEqual(observed.after.card,observed.before.card,'dashboard card appearance is preserved');
    assert.deepEqual(observed.after.cascade,observed.before.cascade,'navigation, cards, forms, auth, modal/toast and typography preserve the final cascade');
    assert.deepEqual(observed.after.modalCascade,observed.before.modalCascade,'opened modal and visible toast retain their computed styles');
    const auth={};
    for(const version of ['before','after']){
     const context=await contextFor(browser,servers[version].url,language,width,'auth');
     const page=await context.newPage();await page.goto(servers[version].url,{waitUntil:'domcontentloaded'});
     await page.locator('#authGate:not(.hidden)').waitFor({state:'visible'});
     await page.waitForFunction(()=>window.__dabbirAuthSessionStabilityV5);
     await page.locator('#signupTab').click();await page.locator('#loginTab').click();
     assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
     auth[version]=await finalCascade(page);
     await page.screenshot({path:path.join(out,`${engine}-${width}-${language}-${version}-auth.png`),fullPage:true});
     await context.close();
    }
    assert.deepEqual(auth.after,auth.before,'real signed-out auth flow remains visually equivalent');
    report.comparisons.push({engine,width,language,status:'PASS',...observed});
   }
   for(const gps of ['success','denied','unsupported'])for(const language of ['ar','en']){
    const context=await contextFor(browser,servers.after.url,language,390,'workspace',gps),page=await context.newPage();page.setDefaultTimeout(15000);
    await page.goto(servers.after.url+'/book?slug=synthetic-car-wash&lang='+language);
    await page.locator('[data-vehicle="saloon"]').click();await page.locator('[data-offer]').first().click();await page.locator('[data-slot]').first().click();
    await page.locator('#customerName').fill('Synthetic User');await page.locator('#customerPhone').fill('+000000000001');await page.locator('#locationBtn').click();
    if(gps!=='success'){
     assert.equal(await page.locator('#submitBtn').isEnabled(),false);
     await page.locator('#manualCoordinates').fill('91, 54');assert.equal(await page.locator('#submitBtn').isEnabled(),false);
     await page.locator('#manualCoordinates').fill('24.4539, 54.3773');
    }
    // Geolocation/UI events may complete after click resolves (notably in WebKit).
    // Wait for the same required state, and preserve diagnostics if it never arrives.
    try{await page.waitForFunction(()=>!document.querySelector('#submitBtn').disabled,null,{timeout:5000})}
    catch(error){
     report.errors.push({engine,language,gps,state:await page.evaluate(()=>({location:document.querySelector('#locationStatus').textContent,map:document.querySelector('#mapLink').getAttribute('href'),vehicle:document.querySelector('[data-vehicle].selected')?.dataset.vehicle,offer:document.querySelector('[data-offer].selected')?.dataset.offer,slot:document.querySelector('[data-slot].selected')?.dataset.slot,name:document.querySelector('#customerName').value,phone:document.querySelector('#customerPhone').value}))});
     await page.screenshot({path:path.join(out,`${engine}-${language}-${gps}-booking-failure.png`),fullPage:true});throw error;
    }
    assert.equal(await page.locator('#submitBtn').isEnabled(),true);await page.locator('#submitBtn').click();await page.locator('#success:not(.hidden)').waitFor();
    const posts=await page.evaluate(()=>window.__uiTestPosts);assert.equal(posts.length,1);assert.equal(posts[0].location_lat,24.4539);assert.equal(posts[0].location_lng,54.3773);
    await page.screenshot({path:path.join(out,`${engine}-${language}-${gps}-booking.png`),fullPage:true});
    report.booking.push({engine,language,gps,status:'PASS',coordinates:'synthetic fixture exact match'});await context.close();
   }
  }finally{await browser.close()}
 }
}catch(error){report.errors.push(String(error.stack||error));process.exitCode=1}
finally{
 for(const {server} of Object.values(servers))await new Promise(resolve=>server.close(resolve));
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 execFileSync('git',['worktree','remove','--force',beforeDir],{cwd:root,stdio:'pipe'});
}
console.log(JSON.stringify({comparisons:report.comparisons.length,booking:report.booking.length,errors:report.errors}));
