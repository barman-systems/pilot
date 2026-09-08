// Synthetic UI integration only. Production journey separately proves real API/DB writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ui from '../api/dabbir-owner-decision-memory-ui.js';
const {webkit,chromium}=await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_PATH,'index.mjs')).href);
const output=process.env.BOOKING_BROWSER_OUTPUT||'booking-browser-evidence';await fs.mkdir(output,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url==='/knowledge.js')return ui(req,res);
  const language=req.url.includes('lang=en')?'en':'ar';
  res.setHeader('content-type','text/html;charset=utf-8');
  res.end(`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#111;color:white}#screen-automations{display:none}#tour{display:none;position:fixed;inset:0;z-index:120;background:#234a;pointer-events:auto}</style><div id="screen-automations"><div class="hero"></div></div><div id="dabbirActionCenter"></div><div id="tour">Synthetic onboarding overlay</div><script>
let workspace={business:{id:'qa-business'},membership:{role:'owner'}},status=null,version=0,writes=[];
window.fetch=async(url,options={})=>{
 if(options.method==='POST'){const body=JSON.parse(options.body);writes.push(body.action);status={propose:'PROPOSED',approve:'OWNER_APPROVED',revoke:'REVOKED',rollback:'OWNER_APPROVED'}[body.action];version++;document.querySelector('#tour').style.display='block'}
 return {ok:true,json:async()=>({ok:true,services:[{id:'qa-service',name:'Gold wash',active:true}],proposals:status?[{id:'qa-proposal',entity_type:'service',alias:'VIP',target_id:'qa-service',status,version}]:[],audit:[]})};
};
setTimeout(()=>{const host=document.createElement('div');host.className='dac-head';document.querySelector('#dabbirActionCenter').append(host)},900);
</script><script src="/knowledge.js"></script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const results=[];
try{
 for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await engine.launch({headless:true});
  try{for(const language of ['ar','en'])for(const width of [390,820]){
   const context=await browser.newContext({viewport:{width,height:844},locale:language==='ar'?'ar-AE':'en-US'}),page=await context.newPage();
   const entry={engine:name,language,width,status:'RUNNING'};results.push(entry);
   try{
    await page.goto(origin+'/?lang='+language);await page.locator('#dabbirActionCenter #dabbirMemoryButton').click();
    await page.locator('input[name="alias"]').fill('VIP');await page.locator('select[name="service"]').selectOption('qa-service');
    await page.locator('form button[type="submit"]').click();
    const card=page.locator('[data-knowledge="v2"] article').filter({hasText:'VIP'});
    await card.getByRole('button',{name:/اعتماد المعنى|^Approve meaning$/}).click();
    await card.getByRole('button',{name:/إلغاء الاعتماد|^Revoke approval$/}).click();
    await card.getByRole('button',{name:/إعادة اعتماد هذا الإصدار|^Approve this version again$/}).click();
    await card.getByRole('button',{name:/إلغاء الاعتماد|^Revoke approval$/}).waitFor();
    const evidence=await page.evaluate(()=>({actions:writes,status,version,modal:document.querySelector('#dabbirMemoryOverlay').matches(':modal'),tourVisible:getComputedStyle(document.querySelector('#tour')).display==='block'}));
    if(evidence.actions.join(',')!=='propose,approve,revoke,rollback'||!evidence.modal||!evidence.tourVisible||evidence.version!==4)throw Error('KNOWLEDGE_BROWSER_EVIDENCE_INVALID');
    entry.status='PASS';entry.evidence=evidence;
   }catch(error){entry.status='FAIL';entry.error=String(error.message);await page.screenshot({path:path.join(output,`knowledge-${name}-${language}-${width}.png`)}).catch(()=>{});throw error}
   finally{await context.close()}
  }}finally{await browser.close()}
 }
}finally{server.close();await fs.writeFile(path.join(output,'knowledge-browser-report.json'),JSON.stringify(results,null,2))}
console.log(JSON.stringify({knowledge_browser_cases:results.length,failed:results.filter(r=>r.status!=='PASS').length}));
