// Synthetic activation → first appointment regression using the real product UI.
// All fetch responses stay inside the existing fixture; this is not production evidence.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {activationBookingHandler,activationBookingPaths} from '../test/fixtures/activation-booking-server.mjs';

const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=process.env.BOOKING_BROWSER_OUTPUT||'booking-browser-evidence';
await fs.mkdir(output,{recursive:true});
const businessId='51000000-0000-4000-8000-000000000001';
const devices=[
  {name:'chromium-iphone',engine:chromium,viewport:{width:390,height:844}},
  {name:'webkit-iphone',engine:webkit,viewport:{width:390,height:844}},
  {name:'webkit-ipad',engine:webkit,viewport:{width:1024,height:768}},
];
const results=[];
const server=http.createServer(async(req,res)=>{
  try{
    if(await activationBookingHandler(req,res))return;
    res.statusCode=req.url==='/favicon.ico'?204:404;res.end();
  }catch(error){res.statusCode=500;res.end('Synthetic fixture failure: '+error.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;

async function openAndFill(page){
  await page.locator('#daNextAction').waitFor({state:'visible'});
  assert.equal(await page.locator('#daNextAction').textContent(),'إضافة أول موعد');
  await page.locator('#daNextAction').click();
  const form=page.locator('#appointmentForm'),details=page.locator('#adaptiveApptDetails');
  await page.locator('#apptDetail-phone').waitFor({state:'visible'});
  assert.equal(await details.evaluate(node=>node.tagName),'DETAILS');
  assert.equal(await details.getAttribute('open'),null,'optional details start closed');
  assert.equal(await details.locator('summary').textContent(),'تفاصيل الموعد (اختياري)');
  const visible=[];
  for(const control of await form.locator('input,select,textarea').all()){
    // Native details visibility must use Playwright; getClientRects is misleading in Chromium.
    if(await control.isVisible())visible.push(await control.getAttribute('id'));
  }
  assert.deepEqual(visible.sort(),['apptCustomer','apptDetail-phone','apptTime']);
  assert.equal(await page.locator('#apptDetail-phone').getAttribute('dir'),'ltr');
  assert.match(await page.locator('label[for="apptDetail-phone"]').textContent(),/اختياري/);
  assert.equal(await page.evaluate(()=>window.__activationBookingFixture.state().modalOpens),1,'one CTA opens the actual form');
  const box=await form.boundingBox(),viewport=page.viewportSize();
  assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,'collapsed form fits the viewport');
  await page.locator('#apptCustomer').fill('عميل صناعي لاختبار الموعد');
  await page.locator('#apptTime').fill('2030-09-09T12:30');
  await details.locator('summary').click();
  await page.locator('#apptDetail-service').fill('خدمة صيانة صناعية');
  await page.locator('#apptDetail-duration').fill('75');
  await details.locator('summary').click();
  assert.equal(await page.locator('#apptDetail-service').isVisible(),false);
  assert.equal(await page.locator('#apptDetail-duration').inputValue(),'75','collapsing retains the entered duration');
}

async function waitForSaved(page,attempts){
  await page.waitForFunction(expected=>{
    const state=window.__activationBookingFixture.state();
    return state.saveAttempts===expected&&state.records===1&&state.refreshes===1&&workspace.appointments.length===1&&!document.querySelector('#saveApptBtn').disabled;
  },attempts);
  await page.locator('#appointmentModal').waitFor({state:'hidden'});
}

try{
  for(const device of devices){
    const browser=await device.engine.launch({headless:true});
    try{
      for(const scenario of ['success','lost-response']){
        const context=await browser.newContext({viewport:device.viewport,isMobile:true,hasTouch:true,locale:'ar-AE',timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
        const page=await context.newPage(),errors=[],blockedRequests=[];
        page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
        await context.route('**/*',route=>{
          const request=route.request(),url=new URL(request.url());
          if(url.origin===origin&&request.method()==='GET'&&(activationBookingPaths.has(url.pathname)||url.pathname==='/favicon.ico'))return route.continue();
          blockedRequests.push({origin:url.origin,path:url.pathname,method:request.method()});return route.abort();
        });
        const result={device:device.name,scenario,language:'ar',status:'PASS'};
        try{
          const response=await page.goto(origin+'/activation-booking?lang=ar&scenario='+scenario);
          assert.equal(response.status(),200);
          assert.match(response.headers()['content-security-policy'],/connect-src 'none'/);
          await page.waitForFunction(()=>window.__activationBookingFixture&&window.__dabbirTimezoneLoaded);
          assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
          // Observe the fixture's mock only. The response gate makes the busy-state
          // keyboard check deterministic without relying on a fixed sleep.
          await page.evaluate(()=>{
            const fixtureFetch=window.fetch;
            window.__activationQa={requests:[],holdNext:false,release:null};
            window.fetch=async(input,options={})=>{
              const url=new URL(typeof input==='string'?input:input.url,location.href);
              if(url.pathname!=='/api/adaptive-appointment'||options.method!=='POST')return fixtureFetch(input,options);
              const qa=window.__activationQa;qa.requests.push(JSON.parse(options.body));
              const gate=qa.holdNext?new Promise(resolve=>{qa.release=resolve;qa.holdNext=false}):Promise.resolve();
              const response=await fixtureFetch(input,options);await gate;return response;
            };
          });
          await openAndFill(page);
          const save=page.locator('#saveApptBtn');
          if(scenario==='success'){
            await page.screenshot({path:path.join(output,'activation-'+device.name+'-form.png')});
            await page.evaluate(()=>{window.__activationQa.holdNext=true});
            await save.click();
            assert.equal(await save.isDisabled(),true);
            assert.equal(await page.locator('#appointmentForm').getAttribute('aria-busy'),'true');
            await page.locator('#apptCustomer').press('Enter');
            assert.equal(await page.evaluate(()=>window.__activationQa.requests.length),1,'a second keyboard submission while busy sends no duplicate');
            await page.evaluate(()=>window.__activationQa.release());
            await waitForSaved(page,1);
          }else{
            await save.click();
            await page.waitForFunction(()=>{
              const state=window.__activationBookingFixture.state();
              return state.saveAttempts===1&&state.records===1&&state.refreshes===0&&!document.querySelector('#saveApptBtn').disabled;
            });
            assert.equal(await page.locator('#appointmentModal').isVisible(),true,'lost response leaves the form available for retry');
            assert.match(await page.locator('#fixtureLastMessage').textContent(),/تعذر تأكيد حفظ الموعد/);
            assert.equal(await page.locator('#apptCustomer').inputValue(),'عميل صناعي لاختبار الموعد');
            await save.click();await waitForSaved(page,2);
          }
          const proof=await page.evaluate(()=>({state:window.__activationBookingFixture.state(),requests:window.__activationQa.requests,appointment:workspace.appointments[0]}));
          assert.equal(proof.requests.length,scenario==='success'?1:2);
          for(const request of proof.requests){
            assert.equal(request.business_id,businessId);assert.equal(request.branch_id,null);
            assert.equal(request.starts_at,'2030-09-09T08:30:00.000Z','uses the business timezone, not the browser timezone');
            assert.equal(request.details.service,'خدمة صيانة صناعية');assert.equal(request.details.duration,'75');
            assert.match(request.idempotency_key,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          }
          if(scenario==='lost-response')assert.equal(proof.requests[0].idempotency_key,proof.requests[1].idempotency_key,'retry preserves the same intent key');
          assert.equal(proof.appointment.details.service,'خدمة صيانة صناعية');assert.equal(proof.appointment.details.duration,'75');
          assert.equal(proof.state.records,1);assert.deepEqual(proof.state.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(blockedRequests,[]);
          result.requests=proof.requests.length;result.synthetic_records=proof.state.records;
        }catch(error){result.status='FAIL';result.error=error.message;result.browser_errors=errors;result.blocked_requests=blockedRequests;await page.screenshot({path:path.join(output,'activation-'+device.name+'-'+scenario+'-failure.png'),fullPage:true}).catch(()=>{});throw error}
        finally{results.push(result);await context.close()}
      }
    }finally{await browser.close()}
  }
}catch(error){console.error(error);process.exitCode=1}
finally{
  await fs.writeFile(path.join(output,'activation-booking-report.json'),JSON.stringify({status:process.exitCode?'FAIL':'PASS',synthetic_only:true,production_verified:false,source:'real activation and timezone UI with isolated fixture responses',results},null,2));
  await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({cases:results.length,failed:results.filter(result=>result.status==='FAIL').length,output}));
