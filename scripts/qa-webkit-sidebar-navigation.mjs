// Actual served root/bundles, synthetic workspace, no external/production writes.
// Uses the same Playwright version and WebKit mobile context as the Production journey.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import rootHandler from '../api/app-safari-recovery.js';
const require=createRequire(import.meta.url);
const {webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=process.env.BOOKING_BROWSER_OUTPUT||'booking-browser-evidence';
await fs.mkdir(output,{recursive:true});
const root=new URL('../',import.meta.url);
const businessId='10000000-0000-4000-8000-000000000001';
const workspace={ok:true,user:{id:'20000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'},membership:{role:'owner'},
 business:{id:businessId,name:'Synthetic sidebar verification',business_type:'store',timezone:'Asia/Dubai',currency_code:'AED',country_code:'AE'},
 customers:[],conversations:[],appointments:[],messages:[],tasks:[],handoffs:[],followups:[],inventory:[],orders:[],services:[],workers:[],branches:[],ai:{configured:false},whatsapp:{state:'NOT_CONNECTED'},
 verified_metrics:{state:'VERIFIED_EXACT_COUNTS',customers:0,active_chats:0,ai_messages:0,appointments:0}};
let html='';const headers=new Map();
rootHandler({method:'GET',headers:{}},{setHeader(k,v){headers.set(k.toLowerCase(),v)},end(body){html=String(body)},statusCode:200});
assert.ok(html.includes('data-dabbir-design-authority-head'));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html)}
  if(['/dabbir-ui-critical.js','/dabbir-ui-deferred.js'].includes(url.pathname)){
   res.setHeader('content-type','application/javascript');return res.end(await fs.readFile(new URL('public'+url.pathname,root)));
  }
  if(['/api/ui-sentry','/api/dabbir-safari-auth-fail-open-ui'].includes(url.pathname)){
   const handler=(await import(new URL('.'+url.pathname+'.js',root))).default;
   const adapter={setHeader(k,v){res.setHeader(k,v);return adapter},status(s){res.statusCode=s;return adapter},send(body){res.end(body);return adapter},end(body){res.end(body);return adapter}};
   return handler({method:'GET',headers:{}},adapter);
  }
  res.statusCode=404;res.end();
 }catch(error){res.statusCode=500;res.end(error.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const report={scope:'SYNTHETIC_WORKSPACE_REAL_ROOT_AND_BUNDLES_NO_PRODUCTION_OR_META',playwright:require((process.env.PLAYWRIGHT_PATH||'playwright')+'/package.json').version,cases:[],blocked:[]};
let browser;
try{
 browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ar-AE',timezoneId:'Asia/Dubai',serviceWorkers:'block'});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.addInitScript(({workspace,businessId})=>{
  const response=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
  window.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   if(url.origin!==location.origin||String(options.method||'GET').toUpperCase()!=='GET')return response({ok:false,error:'SYNTHETIC_CONNECTION_BLOCKED'},403);
   if(['/api/dabbir-runtime-fast','/api/dabbir-runtime'].includes(url.pathname))return response(workspace);
   if(url.pathname==='/api/activity-tasks')return response({ok:true,business_id:businessId,business_type:'store',profile:{show_appointments:false},tasks:[],can_manage:true});
   return response({ok:false,error:'SYNTHETIC_NOT_CONFIGURED'},404);
  };
 },{workspace,businessId});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin&&route.request().method()==='GET')return route.continue();
  report.blocked.push({origin:u.origin,path:u.pathname});return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 const state=()=>page.evaluate(()=>{
  const side=document.querySelector('#side'),target=side?.querySelector('[data-screen="dashboard"]'),rect=target?.getBoundingClientRect(),css=side&&getComputedStyle(side),vv=visualViewport;
  return {lang:document.documentElement.lang,dir:document.documentElement.dir,open:side?.classList.contains('open'),current:document.querySelector('.screen.active')?.id,
   viewport:{width:innerWidth,height:innerHeight,visualWidth:vv?.width,visualLeft:vv?.offsetLeft,scrollX,scrollY},target:rect&&{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
   sidebar:css&&{left:css.left,right:css.right,transform:css.transform,transition:css.transition},anchor:window.__dabbirTabletSidebarViewport};
 });
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForFunction(()=>window.__dabbirUiLifecycle&&window.__dabbirContextualNavigation);
  for(const [width,height] of [[390,844],[430,932],[768,1024]]){
   await page.setViewportSize({width,height});
   for(const language of ['ar','en']){
    const beforeLanguage=await state();await page.locator('#'+language+'Btn').click();
    for(const screen of ['dashboard','tasks','notifications','customers','operations','integrations','settings','automations','analytics']){
     const entry={width,height,language,screen,status:'RUNNING'};report.cases.push(entry);
     if(screen==='dashboard'){entry.beforeLanguage=beforeLanguage;entry.afterLanguage=await state()}
     if(await page.locator('#menuBtn:visible').count()&&!(await page.locator('#side.open').count()))await page.locator('#menuBtn').click();
     let nav=page.locator(`#side [data-screen="${screen}"]:visible`);
     if(!(await nav.count())&&await page.locator('#side [data-screen="more"]:visible').count()){
      await page.locator('#side [data-screen="more"]:visible').click();nav=page.locator(`#screen-more [data-screen="${screen}"]:visible`);
     }
     entry.beforeClick=await state();
     if(screen==='dashboard')console.log('SIDEBAR_BEFORE_TODAY='+JSON.stringify(entry));
     await nav.click({timeout:10000});
     await page.locator(`#screen-${screen}.active`).waitFor({state:'visible',timeout:10000});
     await page.evaluate(()=>{window.scrollTo(0,0);for(const el of document.querySelectorAll('.main,.content'))el.scrollTop=0});
     await page.waitForTimeout(350); // Same visual sampling boundary as the existing Production matrix.
     await page.screenshot({path:path.join(output,`sidebar-${width}-${language}-${screen}.png`),animations:'disabled',timeout:15000});
     if(['dashboard','settings'].includes(screen)&&width===390){
      await page.evaluate(()=>{
       const nodes=[...document.querySelectorAll('#appShell *')].filter(el=>el.getClientRects().length);
       const sizes=nodes.map(el=>parseFloat(getComputedStyle(el).fontSize)*2);
       nodes.forEach((el,i)=>{el.dataset.qaOldStyle=el.getAttribute('style')??'__absent__';el.style.setProperty('font-size',sizes[i]+'px','important')});
      });
      await page.screenshot({path:path.join(output,`sidebar-${width}-${language}-${screen}-text200.png`),timeout:15000});
      await page.evaluate(()=>document.querySelectorAll('[data-qa-old-style]').forEach(el=>{const old=el.dataset.qaOldStyle;delete el.dataset.qaOldStyle;if(old==='__absent__')el.removeAttribute('style');else el.setAttribute('style',old)}));
     }
     if(screen==='operations'){
      await page.locator('#opsAddProduct').click();await page.locator('#opsProductModal.open').waitFor();
      await page.screenshot({path:path.join(output,`sidebar-${width}-${language}-product-dialog.png`),timeout:15000});
      await page.locator('#opsProductCancel').click();
     }
     if(screen==='settings')for(const id of ['dabbirBillingCard','dkSave']){
      const target=page.locator('#'+id);
      if(await target.count()){
       await target.scrollIntoViewIfNeeded();
       await page.screenshot({path:path.join(output,`sidebar-${width}-${language}-${id}.png`),timeout:15000});
      }
     }
     entry.status='PASS';
    }
   }
  }
  // Reproduce the language/open transition at bounded frame offsets. Setup invokes
  // the shipped button handlers; the Today action retains the native pointer check.
  for(const delay of [0,8,16,24,32,48,64,96,128,176,208]){
   await page.evaluate(()=>{showScreen('analytics');setLang('ar')});
   await page.waitForFunction(()=>{
    const side=document.querySelector('#side'),css=getComputedStyle(side);
    return !side.classList.contains('open')&&Math.abs(parseFloat(css.left)-482)<1&&!side.getAnimations().some(a=>a.playState==='running');
   },null,{timeout:10000});
   await page.evaluate(delay=>new Promise(resolve=>{
    document.querySelector('#enBtn').click();
    setTimeout(()=>{document.querySelector('#menuBtn').click();resolve()},delay);
   }),delay);
   const entry={width:768,height:1024,language:'en',screen:'dashboard',open_delay_ms:delay,status:'RUNNING',beforeClick:await state()};report.cases.push(entry);
   await page.locator('#side [data-screen="dashboard"]:visible').click({timeout:10000});
   await page.locator('#screen-dashboard.active').waitFor({state:'visible',timeout:10000});
   assert.equal(await page.locator('#side.open').count(),0,'navigation closes the sidebar');
   entry.status='PASS';console.log('SIDEBAR_TRANSITION='+JSON.stringify(entry));
  }
  assert.equal(report.blocked.length,0,'no external requests');
 }catch(error){
  report.status='FAIL';report.error=String(error.message);report.state=await state();report.pageErrors=pageErrors;
  const last=report.cases.at(-1);if(last)last.status='FAIL';
  console.log('SIDEBAR_FAILURE='+JSON.stringify({error:report.error,state:report.state,last,pageErrors}));
  await page.screenshot({path:path.join(output,'sidebar-failure.png')}).catch(()=>{});throw error;
 }finally{await context.tracing.stop({path:path.join(output,'sidebar-trace.zip')});await context.close()}
 report.status='PASS';console.log('SIDEBAR_NAVIGATION='+JSON.stringify({status:report.status,cases:report.cases.length,playwright:report.playwright}));
}finally{await browser?.close();server.close();await fs.writeFile(path.join(output,'sidebar-navigation-report.json'),JSON.stringify(report,null,2))}
