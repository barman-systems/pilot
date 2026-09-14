// Synthetic, network-isolated regression: execute the actual shipped calendar UI.
// No customer account, AI, WhatsApp, payment or production database is used.
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import calendarHandler from '../api/calendar-performance-ui.js';
import {createBookingLifecycle} from '../api/_booking-lifecycle.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=process.env.BOOKING_BROWSER_OUTPUT||'booking-browser-evidence';
await fs.mkdir(output,{recursive:true});
const NOW=Date.parse('2026-09-06T04:35:00Z'),life=createBookingLifecycle();
const branches=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
const types=['car_wash','clinic','salon','laundry','real_estate','creator','services','other'];
const bizId=type=>'10000000-0000-4000-8000-'+String(types.indexOf(type)+1).padStart(12,'0');
const state=new Map(),writes=[],results=[];
let pauseWrite=null,writeReceived=null;
function seed(type,onlyScreenshot=false){
  const business={id:bizId(type),business_type:type,timezone:'Asia/Dubai',locale:'ar-AE',name:'نشاط اختبار'};
  const make=(id,status,start='2026-09-03T10:00:00Z',end='2026-09-03T11:00:00Z',branch_id=branches[0])=>({id,business_id:business.id,branch_id,customer_id:'customer-'+id,service_id:'service-a',worker_id:null,status,starts_at:start,ends_at:end,quoted_price_aed:30,discount_aed:0,payment_status:'unpaid'});
  const rows=onlyScreenshot?[make('screenshot-completed','completed'),make('review-a','confirmed'),make('review-b','confirmed')]:[
    ...Array.from({length:123},(_,i)=>make('history-'+String(i).padStart(3,'0'),['completed','cancelled','no_show'][i%3],'2026-09-01T10:00:00Z','2026-09-01T11:00:00Z')),
    make('review-a','confirmed'),make('review-b','in_progress'),
    make('current-a','confirmed','2026-09-06T10:00:00Z','2026-09-06T11:00:00Z'),
    make('future-a','confirmed','2026-09-07T10:00:00Z','2026-09-07T11:00:00Z'),
    make('branch-b-current','confirmed','2026-09-06T10:00:00Z','2026-09-06T11:00:00Z',branches[1]),
  ];
  const customers=rows.map(row=>({id:row.customer_id,display_name:'عميل '+row.id}));
  const w={business,branch_scope:{mode:'selected',branch_id:branches[0]},appointments:rows.slice(0,50),customers:customers.slice(0,50),handoffs:[],followups:[],whatsapp:{state:'OPERATIONAL'}};
  state.set(business.id,{business,rows,customers,workspace:w});return w;
}
const capture={statusCode:200,body:'',status(c){this.statusCode=c;return this},setHeader(){return this},send(s){this.body=s;return this},end(s){this.body=s;return this}};
await calendarHandler({method:'GET'},capture);assert.equal(capture.statusCode,200);
const html=(w,lang)=>`<!doctype html><html data-dabbir-theme="web" lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dabbir-design-tokens.css"><link rel="stylesheet" href="/dabbir-web.css"><style>:root{--line:#303942;--muted:#a7b3bf;--accent:#bbc966}*{box-sizing:border-box}body{margin:0;background:#091320;color:white;font-family:Arial,sans-serif}.content{max-width:1100px;margin:auto;padding:12px}.screen{display:none}.screen.active{display:block}.hidden{display:none!important}.hero{display:flex;justify-content:space-between;margin:10px 0}button{cursor:pointer}.modalBack{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;z-index:90;padding:18px}.modalBox{background:#131922;padding:16px;border-radius:16px;width:min(700px,100%)}.modalActions{display:flex;gap:8px;margin-top:12px}.modalActions button{min-height:44px}.card{padding:12px}.muted{color:var(--muted)}input,select{max-width:100%}</style></head><body><main class="content"><section id="screen-dashboard" class="screen"><div class="hero"><div></div></div><div id="dashCards"></div><div id="noticeList"></div></section><section id="screen-appointments" class="screen active"><div class="hero"><h2 id="apptTitle">الحجوزات</h2><button id="newApptBtn">إضافة</button></div><p id="apptDesc"></p><div id="appointmentsTable"></div></section><section id="screen-customers" class="screen"><div id="customersTable"></div></section><section id="screen-tasks" class="screen"><div class="grid2"></div></section><section id="screen-more" class="screen"><div class="moreGrid"></div></section><section id="screen-settings" class="screen"></section><button id="quickAppt" hidden></button></main><script>
window.workspace=${JSON.stringify(w)};window.fixtureToasts=[];window.current='appointments';window.D={ar:{},en:{}};
window.fixtureNow=${NOW};const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.fixtureNow]))}static now(){return window.fixtureNow}};
function renderAll(){}function renderAppointments(){}function T(){return D[document.documentElement.lang]}function toast(message){fixtureToasts.push(message)}function showScreen(name){current=name;document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id==='screen-'+name))}
window.__dabbirConfirm=async()=>true;
window.fixtureBranch=function(branch){workspace={...workspace,branch_scope:{mode:'selected',branch_id:branch},appointments:[],customers:[]};window.dispatchEvent(new Event('dabbir:branch-scope-changed'));renderAll()};
</script><script src="/fixture.js"></script></body></html>`;
async function body(req){const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://fixture');
    const send=(payload,status=200,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(payload):payload)};
    if(['/dabbir-design-tokens.css','/dabbir-web.css'].includes(url.pathname))return send(await fs.readFile(new URL('../public'+url.pathname,import.meta.url),'utf8'),200,'text/css');
    if(url.pathname==='/fixture.js')return send(capture.body,200,'application/javascript');
    if(url.pathname==='/')return send(html(state.get(bizId(url.searchParams.get('type'))).workspace,url.searchParams.get('lang')||'ar'),200,'text/html');
    const payload=req.method==='POST'?await body(req):null;
    const id=payload?.business_id||url.searchParams.get('business_id'),s=state.get(id);
    if(url.pathname==='/api/activity-tasks')return send({ok:true,business_type:s.business.business_type,profile:{name_ar:'نشاط اختبار',name_en:'Test business',show_appointments:true,appointments_ar:'الحجوزات',appointments_en:'Bookings'},tasks:[],can_manage:true});
    if(url.pathname==='/api/calendar-connections')return send({ok:true,connections:[],providers:{}});
    if(url.pathname==='/api/appointment-management'&&req.method==='GET'){
      const range=url.searchParams.has('from')?{from:url.searchParams.get('from'),to:url.searchParams.get('to')}:null;
      const selected=life.select(s.rows,{business:s.business,branch_scope:{mode:'selected',branch_id:url.searchParams.get('branch_id')}},{scope:url.searchParams.get('scope'),range,now:NOW});
      const offset=Number(url.searchParams.get('offset')||0),rows=selected.slice(offset,offset+50);
      return send({ok:true,business_id:id,branch_id:url.searchParams.get('branch_id'),appointments:rows,customers:s.customers,total:selected.length,next_offset:offset+rows.length,has_more:offset+rows.length<selected.length});
    }
    if((url.pathname==='/api/appointment-management'||url.pathname==='/api/salon-operations')&&req.method==='POST'){
      const row=s.rows.find(row=>row.id===payload.appointment_id);assert.ok(row,'fixture mutation targets known row');
      assert.ok(!payload.branch_id||payload.branch_id===row.branch_id,'branch is preserved');
      writes.push(structuredClone(payload));if(writeReceived)writeReceived();if(pauseWrite)await pauseWrite;
      if(payload.starts_at)row.starts_at=payload.starts_at;if(payload.status)row.status=payload.status;
      return send({ok:true,appointment:row,waitlist_matches:[]});
    }
    if(url.pathname==='/api/salon-operations')return send({ok:true,business:s.business,appointments:s.rows.slice(0,50),customers:s.customers,workers:[],services:[{id:'service-a',active:true,name:'Test service',name_ar:'خدمة اختبار',name_en:'Test service',duration_minutes:60}],worker_services:[],settings:{},schedules:[],commissions:[],notifications:[]});
    return send({ok:true,appointments:[],customers:[],services:[],patient_data_gate:{production_patient_data_allowed:false}});
  }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:error.message}))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const devices=[{name:'chromium-iphone',engine:chromium,viewport:{width:390,height:844}},{name:'webkit-iphone',engine:webkit,viewport:{width:390,height:844}},{name:'webkit-ipad',engine:webkit,viewport:{width:1024,height:768}}];
const ids=async(page,selector,attribute)=>page.locator(selector).evaluateAll((els,attr)=>els.map(el=>el.getAttribute(attr)).sort(),attribute);
async function waitCount(page,selector,count){await page.waitForFunction(({selector,count})=>document.querySelectorAll(selector).length===count,{selector,count},{timeout:15000})}
try{
  for(const device of devices){
    const browser=await device.engine.launch({headless:true});
    try{
      for(const [index,type] of types.entries()){
        const lang=index%2?'en':'ar';seed(type);const errors=[];
        const context=await browser.newContext({viewport:device.viewport,isMobile:true,hasTouch:true,locale:lang==='ar'?'ar-AE':'en-US',timezoneId:'America/Los_Angeles'});
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        const salon=type==='salon',host=salon?'#salonCalendarHost':'#dabbirCalendarShell';
        const rowSelector=salon?'#salonCalendarHost [data-salon-appt]':'#dabbirApptManage [data-appt-row]',attribute=salon?'data-salon-appt':'data-appt-row';
        try{
          await page.goto(origin+'/?type='+type+'&lang='+lang);await waitCount(page,rowSelector,1);
          assert.deepEqual(await ids(page,rowSelector,attribute),['current-a']);
          assert.equal(await page.locator('#dabbirGenericCalendar').count(),0,'no duplicate calendar');
          if(!salon)assert.deepEqual(await ids(page,'#dabbirCalendarShell [data-booking-open]','data-booking-open'),['current-a']);
          await page.locator(host+' [data-booking-scope="review"]').click();await waitCount(page,rowSelector,2);
          assert.deepEqual(await ids(page,rowSelector,attribute),['review-a','review-b']);
          if(!salon)assert.deepEqual(await ids(page,'#dabbirCalendarShell [data-booking-open]','data-booking-open'),['review-a','review-b']);
          if(type==='car_wash')await page.screenshot({path:output+'/'+device.name+'-review.png',fullPage:true});
          if(salon){await page.locator('[data-open-appt="review-a"]').click();await page.locator('[data-transition="no_show"]').click()}
          else{
            await page.locator('[data-appt-edit="review-a"]').click();
            const modal=page.locator('#dabbirApptEditModal');
            const width=await modal.locator('form').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,viewport:innerWidth}));
            assert.ok(width.left>=0&&width.right<=width.viewport,'mobile editor fits viewport');
            await page.locator('#dabbirApptEditStatus').selectOption('no_show');await page.locator('#dabbirApptEditForm button[type="submit"]').click();
          }
          await waitCount(page,rowSelector,1);assert.deepEqual(await ids(page,rowSelector,attribute),['review-b']);
          const saved=state.get(bizId(type)).rows.find(row=>row.id==='review-a');assert.equal(saved.status,'no_show');assert.equal(saved.starts_at,'2026-09-03T10:00:00Z');
          assert.equal(writes.at(-1).starts_at,undefined,'status resolution must not invent a reschedule');
          await page.locator(host+' [data-booking-scope="history"]').click();await waitCount(page,rowSelector,50);
          await page.locator(host+' [data-booking-more]').click();await waitCount(page,rowSelector,100);
          await page.locator(host+' [data-booking-more]').click();await waitCount(page,rowSelector,124);
          if(salon){assert.equal(await page.locator(host+' [draggable="true"]').count(),0);assert.equal(await page.locator(host+' [data-resize]').count(),0)}
          else assert.equal(await page.locator('#dabbirApptManage [data-appt-delete]').count(),0);
          await page.evaluate(branch=>fixtureBranch(branch),branches[1]);await waitCount(page,rowSelector,1);
          assert.deepEqual(await ids(page,rowSelector,attribute),['branch-b-current'],'branch change resets current view without historical leakage');
          assert.deepEqual(errors,[],'no browser exceptions');
          results.push({device:device.name,activity:type,language:lang,status:'PASS'});
        }catch(error){await page.screenshot({path:output+'/'+device.name+'-'+type+'-failure.png',fullPage:true}).catch(()=>{});results.push({device:device.name,activity:type,language:lang,status:'FAIL',error:error.message,browser_errors:errors});throw error}
        finally{await context.close()}
      }
      // The exact three-record screenshot scenario: empty current, two unresolved,
      // one retained completed record, with no automatic POST.
      seed('car_wash',true);const page=await browser.newPage({viewport:device.viewport});
      const priorWrites=writes.length;await page.goto(origin+'/?type=car_wash&lang=ar');
      await page.waitForFunction(()=>window.__dabbirBookingReader?.entry(workspace)?.ready);
      assert.equal(await page.locator('#dabbirApptManage [data-appt-row]').count(),0);
      await page.locator('#dabbirCalendarShell [data-booking-scope="review"]').click();await waitCount(page,'#dabbirApptManage [data-appt-row]',2);
      await page.locator('#dabbirCalendarShell [data-booking-scope="history"]').click();await waitCount(page,'#dabbirApptManage [data-appt-row]',1);
      assert.equal(writes.length,priorWrites);results.push({device:device.name,scenario:'exact-original-screenshot',status:'PASS'});await page.close();
    }finally{await browser.close()}
  }
}catch(error){console.error(error);process.exitCode=1}
finally{await fs.writeFile(output+'/report.json',JSON.stringify({status:process.exitCode?'FAIL':'PASS',source:'synthetic fixture using actual calendar-performance-ui handler',results,writes:writes.length},null,2));await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({cases:results.length,failed:results.filter(r=>r.status==='FAIL').length,output}));
