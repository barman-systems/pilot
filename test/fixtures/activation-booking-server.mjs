// Local visual fixture only: every identity, appointment and response is synthetic.
// Uses the current product scripts and index.html markup/copy; never imports a write API.
// Browser fetch is replaced completely (no native-fetch fallback), and CSP blocks connections.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import activationUi from '../../api/customer-activation-ui.js';
import timezoneUi from '../../api/timezone-ui.js';
import ownerFirstUi from '../../api/dabbir-owner-first-ui.js';

const root=new URL('../../',import.meta.url);
const id={business:'51000000-0000-4000-8000-000000000001',owner:'52000000-0000-4000-8000-000000000001',branch:'55000000-0000-4000-8000-000000000001'};
const scenarios=['success','network-failure','whatsapp-unavailable','lost-response'];
export const activationBookingPaths=new Set(['/dabbir-design-tokens.css','/dabbir-web.css','/activation-booking','/activation-booking/','/fixture/activation-booking/activation.js','/fixture/activation-booking/timezone.js','/fixture/activation-booking/owner-first.js']);

function capture(handler){
  let body='';
  const res={setHeader(){return res},status(){return res},send(value){body=String(value);return res},end(value=''){body=String(value);return res}};
  handler({method:'GET',headers:{}},res);
  return body;
}

function syntheticWorkspace(){
  return {ok:true,user:{id:id.owner},membership:{role:'owner',user_id:id.owner,business_id:id.business},
    business:{id:id.business,name:'نشاط خدمات — بيانات صناعية',business_type:'services',country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai',phone_country_prefix:'+971'},
    branches:[{id:id.branch,business_id:id.business,name:'فرع صناعي واحد',is_active:true,is_main:true}],active_branch_id:null,branch_id:null,selected_conversation_id:null,ai:{configured:false},
    verified_metrics:{state:'VERIFIED_EXACT_COUNTS',customers:0,active_chats:0,ai_messages:0,appointments:0},
    customers:[],appointments:[],conversations:[],messages:[],tasks:[],orders:[],inventory:[]};
}

function bootScript(language,scenario,dictionary,modalHelpers,modalBindings){
  return `
${dictionary}
var lang=${JSON.stringify(language)},current='dashboard',workspace=${JSON.stringify(syntheticWorkspace())},selectedConversationId=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],T=()=>D[lang];
// Exclude unrelated search, tours and preferences from this bounded visual fixture.
window.__dabbirUxFoundationV1=true;
const fixture={scenario:${JSON.stringify(scenario)},failedOnce:false,saveAttempts:0,refreshes:0,modalOpens:0,calls:[],records:new Map(),errors:[],lastToast:''};
// terminal.local uses HTTP. Supply synthetic request IDs only in this isolated
// fixture; this does not verify HTTPS crypto support or production persistence.
if(!window.crypto.randomUUID){let sequence=0;window.crypto.randomUUID=()=> '56000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function evidence(){
  $('#fixtureCounts').textContent='فتح النموذج: '+fixture.modalOpens+' | طلبات الحفظ: '+fixture.saveAttempts+' | سجلات محلية: '+fixture.records.size+' | تحديث الشاشة: '+fixture.refreshes;
  const output=JSON.stringify({synthetic_only:true,scenario:fixture.scenario,business_id:workspace.business.id,active_screen:current,modal_open:$('#appointmentModal').classList.contains('open'),save_attempts:fixture.saveAttempts,records:fixture.records.size,refreshes:fixture.refreshes,calls:fixture.calls.slice(-8),errors:fixture.errors},null,2);
  if($('#fixtureEvidence').textContent!==output)$('#fixtureEvidence').textContent=output;
}
// This is the complete network mock. Unknown endpoints, other origins and business IDs fail closed.
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  const method=String(options.method||'GET').toUpperCase();
  if(url.origin!==location.origin)throw new Error('FIXTURE_EXTERNAL_CONNECTION_BLOCKED');
  if(method==='GET'&&['/api/business-profile','/api/dabbir-whatsapp-status'].includes(url.pathname)){
    if(url.searchParams.get('business_id')!==${JSON.stringify(id.business)})return json({ok:false,error:'SYNTHETIC_SCOPE_REJECTED'},403);
    fixture.calls.push({path:url.pathname,method});evidence();await delay(180);
    if(url.pathname==='/api/business-profile')return json({ok:true,business_id:workspace.business.id,facts:{}});
    if(fixture.scenario==='whatsapp-unavailable')return json({ok:false,error:'SYNTHETIC_WHATSAPP_UNAVAILABLE'},503);
    return json({ok:true,business_id:workspace.business.id,state:'NOT_CONNECTED',connected:false,operational:false});
  }
  if(method==='POST'&&url.pathname==='/api/adaptive-appointment'){
    const body=JSON.parse(options.body||'{}');
    if(body.business_id!==${JSON.stringify(id.business)}||body.branch_id!=null)return json({ok:false,message_ar:'نطاق النشاط الصناعي غير مطابق.',message_en:'Synthetic business scope does not match.'},403);
    if(!body.customer_name||!body.starts_at||!body.idempotency_key)return json({ok:false,message_ar:'طلب الاختبار لا يطابق عقد الحفظ الحالي.',message_en:'The fixture request does not match the current save contract.'},400);
    fixture.saveAttempts++;
    fixture.calls.push({path:url.pathname,method,idempotency_key:body.idempotency_key,starts_at:body.starts_at,branch_id:body.branch_id??null});evidence();
    await delay(900); // Keep the real pending state visible for a double-click check.
    if(fixture.scenario==='network-failure'&&!fixture.failedOnce){fixture.failedOnce=true;throw new TypeError('FIXTURE_NETWORK_FAILURE_BEFORE_SAVE')}
    let appointment=fixture.records.get(body.idempotency_key);
    const replay=Boolean(appointment);
    if(!appointment){
      appointment={id:'53000000-0000-4000-8000-'+String(fixture.records.size+1).padStart(12,'0'),business_id:body.business_id,branch_id:${JSON.stringify(id.branch)},customer_id:'54000000-0000-4000-8000-'+String(fixture.records.size+1).padStart(12,'0'),customer_name:body.customer_name,starts_at:body.starts_at,status:'requested',details:body.details};
      fixture.records.set(body.idempotency_key,appointment);evidence();
    }
    if(fixture.scenario==='lost-response'&&!fixture.failedOnce){fixture.failedOnce=true;throw new TypeError('FIXTURE_RESPONSE_LOST_AFTER_SAVE')}
    return json({ok:true,appointment,branch_id:appointment.branch_id,idempotent_replay:replay});
  }
  throw new Error('FIXTURE_ENDPOINT_BLOCKED: '+method+' '+url.pathname);
};
function toast(message){
  fixture.lastToast=String(message);$('#toast').textContent=fixture.lastToast;$('#toast').classList.add('show');
  $('#fixtureLastMessage').textContent=fixture.lastToast;
  setTimeout(()=>$('#toast').classList.remove('show'),3500);evidence();
}
${modalHelpers}
${modalBindings}
$('#newApptBtn').onclick=()=>{fixture.modalOpens++;openModal('#appointmentModal','#apptCustomer');evidence()};
function fmt(value){return String(value||'')}
function renderDashboard(){evidence()}
function renderAppointments(){
  const table=$('#appointmentsTable');table.replaceChildren();
  if(!workspace.appointments.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=T().noAppointments;table.append(empty);return}
  for(const appointment of workspace.appointments){
    const row=document.createElement('article');row.className='item';
    const name=document.createElement('strong');name.textContent=appointment.customer_name;
    const time=document.createElement('p');time.textContent=fmt(appointment.starts_at);
    const status=document.createElement('span');status.textContent=lang==='ar'?'بانتظار التأكيد — سجل صناعي':'Pending — synthetic record';
    row.append(name,time,status);table.append(row);
  }
}
function renderAll(){renderDashboard();renderAppointments()}
function showScreen(next){
  if(!['dashboard','appointments'].includes(next)){toast(lang==='ar'?'هذه الوجهة خارج نطاق اختبار أول موعد.':'This destination is outside this first-booking fixture.');return}
  current=next;$$('.screen').forEach(node=>node.classList.toggle('active',node.id==='screen-'+next));renderAll();
}
async function loadRuntime(businessId){
  if(businessId!==${JSON.stringify(id.business)})throw new Error('FIXTURE_REFRESH_SCOPE_REJECTED');
  fixture.refreshes++;evidence();await delay(300);
  workspace.appointments=[...fixture.records.values()];
  workspace.customers=workspace.appointments.map(row=>({id:row.customer_id,name:row.customer_name,business_id:row.business_id}));
  workspace.verified_metrics.customers=workspace.customers.length;workspace.verified_metrics.appointments=workspace.appointments.length;
  renderAll();return workspace;
}
function applyLang(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  const labels={dashTitle:'dashTitle',dashDesc:'dashDesc',apptTitle:'apptTitle',apptDesc:'apptDesc',newApptBtn:'newAppointment',newApptTitle:'newApptTitle',apptCustomerLabel:'customerName',apptTimeLabel:'time',saveApptBtn:'save'};
  for(const [target,key]of Object.entries(labels))$('#'+target).textContent=T()[key];
  $$('.modalClose').forEach(node=>node.textContent=T().cancel);renderAll();
}
function setLanguage(next){lang=next;applyLang()}
function setScenario(next){
  if(!${JSON.stringify(scenarios)}.includes(next))throw new Error('UNKNOWN_FIXTURE_SCENARIO');
  fixture.scenario=next;fixture.failedOnce=false;$('#fixtureScenario').value=next;window.__dabbirCustomerActivation?.refresh();evidence();
}
$('#fixtureScenario').value=fixture.scenario;
$('#fixtureScenario').addEventListener('change',event=>setScenario(event.target.value));
$('#fixtureBack').onclick=()=>showScreen('dashboard');
$('#fixtureReset').onclick=()=>{const url=new URL(location.href);url.searchParams.set('scenario',fixture.scenario);location.assign(url)};
$('#fixtureLanguage').value=lang;
$('#fixtureLanguage').onchange=event=>{const url=new URL(location.href);url.searchParams.set('lang',event.target.value);url.searchParams.set('scenario',fixture.scenario);location.assign(url)};
window.addEventListener('error',event=>{fixture.errors.push(String(event.message));evidence()});
window.addEventListener('unhandledrejection',event=>{fixture.errors.push(String(event.reason?.message||event.reason));evidence()});
new MutationObserver(evidence).observe($('#appointmentModal'),{attributes:true,attributeFilter:['class']});
window.__activationBookingFixture={setScenario,state:()=>({synthetic_only:true,scenario:fixture.scenario,saveAttempts:fixture.saveAttempts,records:fixture.records.size,modalOpens:fixture.modalOpens,refreshes:fixture.refreshes,lastToast:fixture.lastToast,calls:structuredClone(fixture.calls),errors:[...fixture.errors]})};
applyLang();
`;
}

export async function buildActivationBookingPage(url=new URL('http://localhost/activation-booking')){
  const index=await readFile(new URL('index.html',root),'utf8');
  const styles=[...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('\n');
  const dictionary=index.match(/const D=\{ar:\{[\s\S]*?\n\}\};/)?.[0];
  const modal=index.match(/<div class="modal" id="appointmentModal"[\s\S]*?<\/form><\/div>/)?.[0];
  const appointments=index.match(/<section class="screen" id="screen-appointments">[\s\S]*?<\/section>/)?.[0];
  const modalHelpers=index.match(/^function openModal\([^\n]+/m)?.[0];
  const modalBindings=index.match(/\$\$\('\.modalClose'\)\.forEach\(b=>b.onclick=[^\n]+/)?.[0];
  if(!dictionary||!modal||!appointments||!modalHelpers||!modalBindings)throw new Error('CURRENT_INDEX_BOOKING_SURFACE_NOT_FOUND');
  const language=url.searchParams.get('lang')==='en'?'en':'ar';
  const scenario=scenarios.includes(url.searchParams.get('scenario'))?url.searchParams.get('scenario'):'success';
  return `<!doctype html><html data-dabbir-theme="web" lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DABBIR — Synthetic first-booking fixture</title>${styles}<style>
  .fixtureControls{padding:12px;background:#263348;border-bottom:2px solid #f4c55e;font:14px/1.7 system-ui;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fixtureControls p{margin:0;flex-basis:100%}.fixtureControls label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.fixtureControls select,.fixtureControls button{background:#102033;color:white;border:1px solid #94a3b8;border-radius:8px;min-height:44px;padding:7px}.fixtureEvidence{padding:12px;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.fixtureMessage{padding:8px 12px;margin:0;font:14px/1.6 system-ui}.fixtureOnlyNote{border:1px dashed #94a3b8;padding:10px;color:#f4c55e}.fixtureContent{max-width:1050px;margin-inline:auto}#fixtureBack{margin-bottom:12px}
  </style></head><body>
  <section class="fixtureControls" aria-label="Local synthetic fixture controls"><p><strong>اختبار محلي — بيانات صناعية فقط.</strong> زر التفعيل ونموذج الموعد ومنطق الحفظ من المنتج الحالي. الطلبات والجدول التالي محاكاة محلية، ولا تثبت حفظًا في الإنتاج.</p>
    <label>السيناريو <select id="fixtureScenario"><option value="success">نجاح الحفظ</option><option value="network-failure">فشل شبكة مرة واحدة ثم تعافٍ</option><option value="whatsapp-unavailable">تعذّر واتساب — الحجز متاح</option><option value="lost-response">حُفظ محليًا ثم فُقد الرد</option></select></label>
    <label>اللغة <select id="fixtureLanguage"><option value="ar">العربية RTL</option><option value="en">English LTR</option></select></label><button type="button" id="fixtureReset">إعادة الاختبار ببيانات فارغة</button><p id="fixtureCounts" aria-live="polite"></p>
  </section>
  <main class="content fixtureContent"><button type="button" class="secondary" id="fixtureBack">العودة إلى اليوم</button><section class="screen active" id="screen-dashboard"><div class="hero"><div><h1 id="dashTitle"></h1><p id="dashDesc"></p></div></div></section>${appointments}<p class="fixtureOnlyNote">جدول المواعيد المعروض هنا ملخص صناعي للتحقق من نتيجة النموذج، وليس شاشة الجدول الكاملة في الإنتاج. واتساب وAI غير مفعّلين في كل السيناريوهات.</p></main>
  ${modal}<div id="toast" class="toast" role="status" aria-live="polite"></div><p id="fixtureLastMessage" class="fixtureMessage" role="status" aria-live="polite"></p><details><summary>أدلة الطلبات المحلية</summary><pre id="fixtureEvidence" class="fixtureEvidence" dir="ltr"></pre></details>
  <script>${bootScript(language,scenario,dictionary,modalHelpers,modalBindings)}</script><script src="/fixture/activation-booking/owner-first.js"></script><script src="/fixture/activation-booking/activation.js"></script><script src="/fixture/activation-booking/timezone.js"></script><script>renderAll();window.__dabbirCustomerActivation.refresh();</script></body></html>`;
}

// Returns false for unrelated paths so the central dev server can delegate without rewriting URLs.
export async function activationBookingHandler(req,res){
  const url=new URL(req.url,'http://fixture.local');
  if(!activationBookingPaths.has(url.pathname))return false;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');res.end('Fixture serves GET only; all writes are browser-local synthetic responses.');return true}
  try{
    if(url.pathname==='/activation-booking'||url.pathname==='/activation-booking/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await buildActivationBookingPage(url));return true;
    }
    if(url.pathname.endsWith('.css')){res.setHeader('Content-Type','text/css');res.end(await readFile(new URL('public'+url.pathname,root)));return true;}
    const handler=url.pathname.endsWith('/activation.js')?activationUi:url.pathname.endsWith('/timezone.js')?timezoneUi:ownerFirstUi;
    res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(capture(handler));return true;
  }catch(error){res.statusCode=500;res.end('Synthetic booking fixture failed: '+String(error.message));return true}
}

export default activationBookingHandler;

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.DABBIR_ACTIVATION_FIXTURE_PORT||4176);
  http.createServer(async(req,res)=>{if(!await activationBookingHandler(req,res)){res.statusCode=404;res.end('Not in the synthetic activation fixture allowlist')}})
    .listen(port,'127.0.0.1',()=>console.log('Synthetic activation booking fixture: http://localhost:'+port+'/activation-booking'));
}
