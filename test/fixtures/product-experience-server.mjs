// Local product-surface verification. All business records and identities below are synthetic.
// This harness does not test production authentication, authorization, delivery, or database writes.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import actionCenterUi from '../../api/owner-action-center-core-ui.js';
import ownerFirstUi from '../../api/dabbir-owner-first-ui.js';

const root=new URL('../../',import.meta.url);
const ids={
  a:'10000000-0000-4000-8000-000000000001',
  b:'10000000-0000-4000-8000-000000000002',
  user:'20000000-0000-4000-8000-000000000001',
};
const syntheticDate='2026-09-08T08:00:00.000Z';

export function fixtureWorkspace(key='a'){
  const businessKey=key==='b'?'b':'a';
  const suffix=businessKey==='b'?'2':'1';
  return {
    ok:true,user:{id:ids.user},membership:{role:'owner',user_id:ids.user,business_id:ids[businessKey]},
    business:{id:ids[businessKey],name:businessKey==='a'?'نشاط أ — بيانات صناعية':'نشاط ب — بيانات صناعية',business_type:'services',timezone:'Asia/Dubai'},
    branches:[],active_branch_id:null,branch_id:null,selected_conversation_id:null,
    conversations:Array.from({length:7},(_,index)=>({
      id:'30000000-0000-4000-8000-'+suffix+String(index+1).padStart(11,'0'),
      business_id:ids[businessKey],customer_name:(businessKey==='a'?'عميل أ ':'عميل ب ')+(index+1),
      status:'action_required',channel:'whatsapp',last_message_at:syntheticDate,
    })),
    messages:[],appointments:[],orders:[],inventory:[],tasks:[],customers:[],
  };
}

export function fixtureActionCenter(key='a',mode='normal'){
  const w=fixtureWorkspace(key);
  const items=mode==='empty'?[]:w.conversations.map((conversation,index)=>({
    id:'conversation:'+conversation.id,type:index===1?'handoff':index===2?'followup':'conversation',
    entity_id:conversation.id,target:'conversations',business_id:w.business.id,
    severity:index<2?'critical':index<5?'warning':'info',due_at:syntheticDate,
    title_ar:conversation.customer_name+' ينتظر متابعة الموعد وتأكيد التفاصيل',
    title_en:conversation.customer_name+' needs an appointment follow-up',
    detail_ar:index===0?'نص عربي طويل للتحقق من الالتفاف: العميل ينتظر تأكيد موعد الخدمة في مدينة أبوظبي مع توضيح مدة العمل واسم الفريق المكلف، ويريد معرفة الخطوة التالية قبل تأكيد حضوره.':'افتح المحادثة المقصودة مباشرة؛ هذا سجل صناعي للتحقق فقط.',
    detail_en:'Open this exact synthetic conversation and verify the selected record after navigation.',
  }));
  return {ok:true,business_id:w.business.id,status:items.length?'needs_attention':'clear',
    brief:{ar:items.length?'سبع أولويات صناعية لاختبار العرض والوصول إلى السجل الصحيح.':'لا توجد أولويات في السيناريو الصناعي الحالي.',en:items.length?'Seven synthetic priorities for layout and record-navigation verification.':'No priorities in this synthetic scenario.'},
    handled:{available:true,verified_autonomous_today:key==='b'?2:4},
    metrics:{urgent:items.filter(x=>x.severity==='critical').length,warning:items.filter(x=>x.severity==='warning').length},items};
}

const fixtureStyles=`
.fixtureControls{padding:12px;border-bottom:2px solid #efc45e;background:#1c2635;color:#fff;font:14px/1.65 system-ui;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fixtureControls p{margin:0;flex:1 0 100%}.fixtureControls label{display:flex;gap:6px;align-items:center}.fixtureControls button,.fixtureControls select{background:#132033;color:#fff;border:1px solid #708099;border-radius:6px;padding:8px;min-height:44px}.fixtureEvidence{margin:12px;padding:12px;border:1px dashed #728197;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace}.fixtureDestination{padding:16px}.fixtureDestination button{margin-bottom:12px}.fixtureDestination article{margin-top:12px;padding:16px;border:2px solid #56d6a0;border-radius:12px}#appShell{grid-template-columns:1fr!important}#appShell .top{position:relative}#dashCards:empty{display:none}.fixtureScope{font-size:12px;color:#f1cf7e}.fixtureNotice{padding:12px;margin:0}
`;

function capture(handler){
  let body='';
  const res={setHeader(){return res},status(){return res},send(value){body=String(value);return res},end(value=''){body=String(value);return res}};
  handler({method:'GET',headers:{}},res);
  return body;
}

function bootScript(initialKey,initialLang,initialMode){
  return `
var lang=${JSON.stringify(initialLang)};
var current='dashboard';
var workspace=${JSON.stringify(fixtureWorkspace(initialKey))};
var currentUser={id:${JSON.stringify(ids.user)}};
var user=currentUser,sessionUser=currentUser,authUser=currentUser;
var selectedConversationId=null;
var fixtureMode=${JSON.stringify(initialMode)};
var fixtureDelay=false;
var fixtureCalls=[];
var fixtureNavigation=[];
const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const fixtureBusinesses=${JSON.stringify({a:fixtureWorkspace('a'),b:fixtureWorkspace('b')})};
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!['/api/owner-action-center','/api/dabbir-runtime-fast'].includes(url.pathname))return Promise.reject(new Error('FIXTURE_NETWORK_BLOCKED'));
  url.searchParams.set('fixture_mode',fixtureMode);
  if(fixtureDelay&&url.searchParams.get('business_id')===${JSON.stringify(ids.a)})url.searchParams.set('fixture_delay','1400');
  fixtureCalls.push({path:url.pathname,business_id:url.searchParams.get('business_id'),conversation_id:url.searchParams.get('conversation_id'),at:Date.now()});
  updateFixtureEvidence();
  return nativeFetch(url,options);
};
// Match index.html's {r,j} contract while retaining this fixture's read-only network allowlist.
async function api(path,options={}){try{if(String(options.method||'GET').toUpperCase()!=='GET')throw new Error('FIXTURE_READ_ONLY');const r=await fetch(path,{cache:'no-store',...options,headers:{'content-type':'application/json','x-dabbir-client':'web',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return {r,j}}catch{return {r:{ok:false,status:0},j:{ok:false,error:'SYNTHETIC_CONNECTION_FAILED'}}}}
function T(){return lang==='ar'?{dashboard:'اليوم',conversations:'العملاء',appointments:'المواعيد',customers:'العملاء',more:'المزيد'}:{dashboard:'Today',conversations:'Customers',appointments:'Bookings',customers:'Customers',more:'More'}}
function updateFixtureEvidence(){
  const evidence=$('#fixtureEvidence');if(!evidence)return;
  evidence.textContent=JSON.stringify({synthetic_only:true,business:workspace?.business?.id,selectedConversationId,workspace_selected:workspace?.selected_conversation_id,active_screen:current,calls:fixtureCalls.slice(-5),navigation:fixtureNavigation.slice(-3)},null,2);
}
function renderDashboard(){
  $('#pageTitle').textContent=T().dashboard;
  $('#runtimeChip').textContent=workspace.business.name;
  $('#dashTitle').textContent=T().dashboard;
  $('#todayEyebrow').textContent=lang==='ar'?'بيئة اختبار محلية':'Local test fixture';
  $('#dashDesc').textContent=lang==='ar'?'مركز الأولويات الحقيقي ببيانات صناعية؛ لا يوجد اتصال بالإنتاج.':'Real priority-center code with synthetic data; no production connection.';
  updateFixtureEvidence();
}
function renderMessages(){
  const selected=workspace.conversations.find(row=>row.id===selectedConversationId);
  $('#fixtureDestinationName').textContent=selected?.customer_name||'لم يُحدد سجل مطابق';
  $('#fixtureDestinationId').textContent=selected?.id||'NO_MATCHING_RECORD_SELECTED';
  $('#fixtureDestinationBody').textContent=workspace.messages?.map(row=>row.body||row.content||'').join('\\n')||'لا توجد رسالة في السجل الصناعي المحدد.';
  updateFixtureEvidence();
}
function renderChats(){renderMessages()}
function renderAll(){renderDashboard();renderMessages()}
function renderIntegrations(){}
function showScreen(name){
  if(!['dashboard','conversations'].includes(name)){toast('خارج نطاق هذه البيئة المحلية: '+name);return}
  current=name;
  $$('.screen').forEach(screen=>screen.classList.toggle('active',screen.id==='screen-'+name));
  fixtureNavigation.push({target:name,business:workspace.business.id,selectedConversationId});
  if(name==='dashboard')renderDashboard();else renderMessages();
  updateFixtureEvidence();
}
function applyLang(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  $('#arBtn').classList.toggle('on',lang==='ar');$('#enBtn').classList.toggle('on',lang!=='ar');renderAll();
}
function setLanguage(next){lang=next;applyLang()}
function toast(message){$('#fixtureToast').textContent=String(message)}
function setFixtureBusiness(key){
  workspace=structuredClone(fixtureBusinesses[key==='b'?'b':'a']);selectedConversationId=null;showScreen('dashboard');renderAll();window.__dabbirOwnerActionCenter?.refresh();updateFixtureEvidence();
}
$('#fixtureBusiness').value=${JSON.stringify(initialKey)};
$('#fixtureMode').value=fixtureMode;
$('#fixtureBusiness').addEventListener('change',event=>setFixtureBusiness(event.target.value));
$('#fixtureMode').addEventListener('change',event=>{fixtureMode=event.target.value;window.__dabbirOwnerActionCenter.refresh()});
$('#fixtureDelay').addEventListener('change',event=>{fixtureDelay=event.target.checked});
$('#fixtureRace').addEventListener('click',()=>{
  fixtureMode='normal';$('#fixtureMode').value='normal';fixtureDelay=true;$('#fixtureDelay').checked=true;$('#fixtureBusiness').value='a';setFixtureBusiness('a');
  setTimeout(()=>{$('#fixtureBusiness').value='b';setFixtureBusiness('b')},100);
});
$('#fixtureBack').addEventListener('click',()=>showScreen('dashboard'));
$('#fixtureRefresh').addEventListener('click',()=>window.__dabbirOwnerActionCenter.refresh());
$('#arBtn').addEventListener('click',()=>setLanguage('ar'));
$('#enBtn').addEventListener('click',()=>setLanguage('en'));
$('#menuBtn').hidden=true;$('#menuBtn').style.setProperty('display','none','important');
window.addEventListener('error',event=>{toast('FIXTURE ERROR: '+event.message)});
window.addEventListener('unhandledrejection',event=>{toast('FIXTURE REJECTION: '+String(event.reason?.message||event.reason))});
window.__productFixture={ids:${JSON.stringify(ids)},calls:fixtureCalls,navigation:fixtureNavigation,setBusiness:setFixtureBusiness,getWorkspace:()=>workspace,getSelected:()=>selectedConversationId};
`;
}

export async function buildFixturePage(url=new URL('http://localhost/surface')){
  const index=await readFile(new URL('index.html',root),'utf8');
  const baseStyles=[...index.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(match=>match[0]).join('\n');
  const header=index.match(/<header class="top">[\s\S]*?<\/header>/)?.[0];
  const dashboard=index.match(/<section class="screen active" id="screen-dashboard">[\s\S]*?<div class="todayGrid">/)?.[0].replace(/<div class="todayGrid">$/,'')+'</section>';
  if(!header||!dashboard?.includes('dashCards'))throw new Error('LIVE_INDEX_SURFACE_NOT_FOUND');
  const language=url.searchParams.get('lang')==='en'?'en':'ar';
  const businessKey=url.searchParams.get('business')==='b'?'b':'a';
  const mode=['empty','error'].includes(url.searchParams.get('mode'))?url.searchParams.get('mode'):'normal';
  return `<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DABBIR — Synthetic priority-center verification</title>${baseStyles}<style>${fixtureStyles}</style></head><body>
  <section class="fixtureControls" aria-label="Synthetic fixture controls">
    <p><strong>اختبار محلي ببيانات صناعية فقط.</strong> العرض والمنطق من ملفات المنتج الحالية. هذه البيئة لا تختبر تسجيل الدخول أو قاعدة البيانات أو إرسال الرسائل.</p>
    <label>النشاط <select id="fixtureBusiness"><option value="a">نشاط أ</option><option value="b">نشاط ب</option></select></label>
    <label>السيناريو <select id="fixtureMode"><option value="normal">7 أولويات</option><option value="empty">فارغ</option><option value="error">خطأ قابل للمحاولة</option></select></label>
    <label><input id="fixtureDelay" type="checkbox">بطء نشاط أ (1.4 ثانية)</label>
    <button id="fixtureRace" type="button">ابدأ طلب أ ثم انتقل إلى ب</button><button id="fixtureRefresh" type="button">إعادة التحميل</button>
  </section>
  <div id="appShell" class="shell"><main class="main">${header}<div class="content">${dashboard}
    <section id="screen-conversations" class="screen fixtureDestination"><button id="fixtureBack" type="button" class="secondary">العودة إلى الأولويات</button><p class="fixtureScope">هذه وجهة إثبات صناعية لرقم السجل؛ ليست شاشة محادثات الإنتاج.</p><article><h2 id="fixtureDestinationName"></h2><p id="fixtureDestinationId" dir="ltr"></p><p id="fixtureDestinationBody"></p></article></section>
  </div></main></div><p class="fixtureNotice" id="fixtureToast" role="status" aria-live="polite"></p><details><summary>أدلة الطلبات والتوجيه الصناعية</summary><pre class="fixtureEvidence" id="fixtureEvidence"></pre></details>
  <script>${bootScript(businessKey,language,mode)}</script><script src="/fixture/owner-first.js"></script><script src="/fixture/action-center.js"></script><script>applyLang();renderAll();window.__dabbirOwnerActionCenter.refresh();</script></body></html>`;
}

const harness=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DABBIR product fixture harness</title><style>body{font:16px/1.7 system-ui;background:#07111f;color:#fff;margin:18px}a{color:#92b4ff}iframe{display:block;border:1px solid #64748b;height:1180px;margin:12px 0;background:#07111f}.frameWrap{overflow-x:auto}h2{margin-top:26px}</style></head><body><h1>تحقق مركز أولويات دبّر — بيانات صناعية</h1><p>يشغّل المكوّن الحقيقي وطبقة العرض الحالية. لا يثبت مصادقة الإنتاج أو صحة قاعدة البيانات أو إرسال الرسائل. افتح سطحًا منفصلًا للتحقق من النقر والتبديل.</p><a href="/surface?lang=ar">فتح العربية مباشرة</a> · <a href="/surface?lang=en">فتح الإنجليزية مباشرة</a> · <a href="/surface?lang=ar&mode=empty">الحالة الفارغة</a> · <a href="/surface?lang=ar&mode=error">حالة الخطأ</a><h2>هاتف — 390px RTL</h2><div class="frameWrap"><iframe title="Phone 390 Arabic" src="/surface?lang=ar" width="390"></iframe></div><h2>لوحي — 820px RTL</h2><div class="frameWrap"><iframe title="Tablet 820 Arabic" src="/surface?lang=ar" width="820"></iframe></div><h2>سطح مكتب — 1280px LTR</h2><div class="frameWrap"><iframe title="Desktop 1280 English" src="/surface?lang=en" width="1280"></iframe></div></body></html>`;

export function createFixtureServer(){
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Content-Type-Options','nosniff');
    try{
      if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end('Fixture is read only')}
      const url=new URL(req.url,'http://fixture.local');
      if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(harness)}
      if(url.pathname==='/surface'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(await buildFixturePage(url))}
      if(url.pathname==='/fixture/owner-first.js'||url.pathname==='/fixture/action-center.js'){
        res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(capture(url.pathname.includes('owner-first')?ownerFirstUi:actionCenterUi));
      }
      if(url.pathname==='/dabbir-app-icon.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(new URL('public/dabbir-app-icon.png',root)))}
      if(url.pathname==='/api/owner-action-center'||url.pathname==='/api/dabbir-runtime-fast'){
        res.setHeader('Content-Type','application/json; charset=utf-8');
        const businessId=url.searchParams.get('business_id');
        if(![ids.a,ids.b].includes(businessId)){res.statusCode=403;return res.end(JSON.stringify({ok:false,error:'SYNTHETIC_BUSINESS_REQUIRED'}))}
        const key=businessId===ids.b?'b':'a';
        const delay=Math.min(1600,Math.max(0,Number(url.searchParams.get('fixture_delay'))||0));
        if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
        if(url.searchParams.get('fixture_mode')==='error'){res.statusCode=503;return res.end(JSON.stringify({ok:false,error:'SYNTHETIC_TEMPORARY_FAILURE'}))}
        if(url.pathname==='/api/owner-action-center')return res.end(JSON.stringify(fixtureActionCenter(key,url.searchParams.get('fixture_mode'))));
        const workspace=fixtureWorkspace(key);
        const conversationId=url.searchParams.get('conversation_id');
        const conversation=workspace.conversations.find(row=>row.id===conversationId);
        if(!conversation){res.statusCode=404;return res.end(JSON.stringify({ok:false,error:'SYNTHETIC_CONVERSATION_NOT_FOUND'}))}
        workspace.selected_conversation_id=conversation.id;
        workspace.selected_conversation=conversation;
        workspace.messages=[{id:'synthetic-message-'+conversation.id,conversation_id:conversation.id,business_id:businessId,role:'customer',body:'رسالة صناعية تخص '+conversation.customer_name,created_at:syntheticDate}];
        return res.end(JSON.stringify(workspace));
      }
      res.statusCode=404;res.end('Not in the synthetic fixture allowlist');
    }catch(error){res.statusCode=500;res.end('Fixture failure: '+String(error.message))}
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.DABBIR_PRODUCT_FIXTURE_PORT||4174);
  createFixtureServer().listen(port,'0.0.0.0',()=>console.log('Synthetic DABBIR product fixture on http://localhost:'+port));
}
