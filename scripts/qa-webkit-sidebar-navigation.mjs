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
     await nav.click({timeout:10000});
     await page.locator(`#screen-${screen}.active`).waitFor({state:'visible',timeout:10000});
     await page.evaluate(()=>{window.scrollTo(0,0);for(const el of document.querySelectorAll('.main,.content'))el.scrollTop=0});
     await page.waitForTimeout(350); // Same visual sampling boundary as the existing Production matrix.
     await page.screenshot({path:path.join(output,`sidebar-${width}-${language}-${screen}.png`),animations:'disabled',timeout:15000});
     entry.status='PASS';
    }
   }
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
