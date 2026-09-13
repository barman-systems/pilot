// Authoritative DABBIR owner command center entrypoint.
// One renderer and one router. Do not create new numbered production entrypoints.
import { OWNER_COMMAND_CENTER_DESIGN_SYSTEM } from './_owner-command-center-design-system.js';
import { ownerPlatformTeamClient } from './_owner-platform-team-ui.js';

export const OWNER_NAVIGATION=Object.freeze([
  ['home','نظرة عامة','Overview'],['customers','العملاء','Customers'],
  ['operations','العمليات','Operations'],['support','الدعم','Support'],
  ['ceo','CEO','CEO'],['system','النظام','System'],
]);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scriptJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function renderOwnerCommandCenter(identity={},language='ar'){
  const lang=language==='en'?'en':'ar',t=(ar,en)=>lang==='ar'?ar:en;
  const subnav=(base,items)=>`<nav class="subnav" aria-label="${t('أقسام الصفحة','Page sections')}">${items.map(([id,ar,en])=>`<a href="#${base}/${id}">${t(ar,en)}</a>`).join('')}</nav>`;
  const status=id=>`<div id="${id}State" class="state" role="status" aria-live="polite"></div>`;
  return `<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${t('لوحة المالك','Owner dashboard')} · DABBIR</title><meta name="robots" content="noindex,nofollow">${OWNER_COMMAND_CENTER_DESIGN_SYSTEM}</head><body>
<a href="#mainContent" class="skip button">${t('انتقل إلى المحتوى','Skip to content')}</a>
<header><div class="topbar"><a href="#home" class="brand"><span class="mark" aria-hidden="true">D</span><span><b>DABBIR | دبّر</b><small>${t('لوحة المالك','Owner dashboard')}</small></span></a><div class="topActions"><button id="refreshAll">${t('تحديث','Refresh')}</button><button id="languageButton" lang="${lang==='ar'?'en':'ar'}">${lang==='ar'?'English':'العربية'}</button><button id="logout">${t('خروج','Sign out')}</button></div></div></header>
<main class="shell" id="mainContent" tabindex="-1"><nav id="nav" aria-label="${t('التنقل الرئيسي','Main navigation')}">${OWNER_NAVIGATION.map(([id,ar,en])=>`<a href="#${id}" data-primary="${id}">${t(ar,en)}</a>`).join('')}</nav>
<div class="sectionHeading"><h1 id="pageTitle">${t('نظرة عامة','Overview')}</h1><small id="updatedAt"></small></div>
<div id="workspaceContext" class="context" hidden><span id="contextText"></span><button id="clearContext">${t('تغيير العميل','Change customer')}</button></div>
${status('page')}
<section id="home" class="screen" aria-labelledby="pageTitle"><div id="overviewMetrics" class="metrics"></div><section id="executiveDeckPanel" class="panel" hidden><div class="recordTitle"><div><h2>${t('نبض DABBIR التنفيذي','DABBIR executive pulse')}</h2><small>${t('حالة تفعيل واعتمادية مبنية على البيانات المقاسة؛ البيانات المفقودة لا تُعد سليمة.','Activation and reliability status based on measured evidence; missing telemetry is not treated as healthy.')}</small></div><span id="executiveStatusBadge" class="status"></span></div><div id="activationMilestones" class="metrics"></div><div id="activationNote" class="hint"></div></section><div class="grid"><section id="customerHealthPanel" class="panel" hidden><h2>${t('صحة الأنشطة','Business health')}</h2><div id="customerHealthSummary"></div><div id="customerHealthRisks"></div></section><section id="reliabilityPanel" class="panel" hidden><h2>${t('حقيقة الاعتمادية','Reliability truth')}</h2><div id="reliabilityTruth"></div></section></div><section id="aiUsagePanel" class="panel" hidden><div class="recordTitle"><div><h2>${t('استهلاك AI والمحادثات','AI usage and conversations')}</h2><small id="aiUsagePeriod"></small></div><span id="aiUsageBadge" class="status"></span></div><div id="aiUsageMetrics" class="metrics"></div><div id="aiUsageNotice"></div><details><summary>${t('التفصيل حسب مزود AI','Breakdown by AI provider')}</summary><div id="aiUsageProviders"></div></details></section><div class="grid"><section class="panel"><h2>${t('يحتاج انتباهك','Needs your attention')}</h2><div id="ownerAttention"></div></section><section class="panel"><h2>${t('حالة التشغيل','Operational health')}</h2><div id="overviewHealth"></div></section></div></section>
<section id="customers" class="screen" hidden><form id="customerSearchForm" class="searchForm"><label class="sr" for="customerQuery">${t('البحث عن عميل','Find a customer')}</label><input id="customerQuery" maxlength="160" placeholder="${t('رقم العميل، الاسم أو البريد','Customer number, name or email')}" autocomplete="off"><button class="primary" type="submit">${t('بحث','Search')}</button></form>${status('customers')}<div id="customerResults"></div><div id="customerDetail" class="panel" hidden></div></section>
<section id="operations" class="screen" hidden><div class="panel"><label for="businessPicker">${t('النشاط المحدد','Selected business')}</label><select id="businessPicker"><option value="">${t('اختر نشاطًا','Choose a business')}</option></select></div>${subnav('operations',[['ORDER','الطلبات','Orders'],['BOOKING','الحجوزات','Bookings'],['PRODUCT','المنتجات','Products'],['SERVICE','الخدمات','Services'],['BRANCH','الفروع','Branches'],['WHATSAPP','واتساب','WhatsApp'],['CALENDAR','التقاويم','Calendars']])}${status('operations')}<div id="operationNotice" class="notice" hidden></div><div id="operationEntities"></div></section>
<section id="support" class="screen" hidden>${subnav('support',[['cases','القضايا','Cases'],['incidents','الحوادث','Incidents'],['feedback','الملاحظات','Feedback']])}<div class="row" style="margin-bottom:14px"><button id="newSupportCase" class="primary">${t('قضية دعم جديدة','New support case')}</button><button id="newIncident">${t('تسجيل حادث','Record incident')}</button></div>${status('support')}<div id="supportContent"></div></section>
<section id="ceo" class="screen" hidden>${subnav('ceo',[['commands','المهام','Missions'],['decisions','قرارات المالك','Owner decisions']])}<div id="missionComposer" class="panel"><h2>${t('توجيه CEO','Direct the CEO')}</h2><form id="ownerMissionCreate" class="forms"><label class="wide">${t('الأمر التنفيذي','Instruction')}<textarea id="ownerMissionCommand" minlength="4" maxlength="4000" required></textarea><span class="hint" id="ownerMissionCommandCounter">0 / 4000</span></label><label>${t('الهدف المطلوب','Objective')}<input id="ownerMissionObjective" maxlength="1000"></label><label>${t('الأولوية','Priority')}<select id="ownerMissionPriority"><option>P0</option><option selected>P1</option><option>P2</option><option>P3</option></select></label><label class="wide">${t('معايير القبول، كل معيار في سطر','Acceptance criteria, one per line')}<textarea id="ownerMissionAcceptance"></textarea></label><label>${t('الموعد النهائي','Due date')}<input type="datetime-local" id="ownerMissionDue"><span class="hint">${t('حسب توقيت جهازك','In your device timezone')}</span></label><div class="row"><button class="primary" type="submit">${t('إرسال المهمة','Submit mission')}</button></div></form></div>${status('ceo')}<div id="ceoContent"></div></section>
<section id="system" class="screen" hidden>${subnav('system',[['health','الصحة والتكاملات','Health & integrations'],['billing','الفوترة','Billing'],['team','الفريق','Team'],['audit','التدقيق','Audit'],['settings','الإعدادات','Settings']])}${status('system')}<div id="systemContent"></div><div id="teamPanel" hidden></div></section>
<dialog id="ownerActionDialog" aria-labelledby="actionDialogTitle"><form id="ownerActionForm"><h2 id="actionDialogTitle"></h2><div id="actionDialogFields" class="forms"></div>${status('action')}<div class="dialogActions"><button type="button" id="actionDialogCancel">${t('إغلاق','Close')}</button><button type="submit" class="primary" id="actionDialogSubmit">${t('حفظ','Save')}</button></div></form></dialog>
</main><script>(${ownerDashboardClient.toString()})(${scriptJson(identity)},${scriptJson(lang)},${ownerPlatformTeamClient.toString()});</script></body></html>`;
}

// This historical API URL is a compatibility redirect, never an auth bypass.
export default function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.setHeader('allow','GET, HEAD');return res.end('Method Not Allowed')}
  res.statusCode=302;res.setHeader('location','/owner-dashboard');return res.end('Redirecting...');
}

export function ownerDashboardClient(identity,lang,mountTeam){
  const $=id=>document.getElementById(id),t=(ar,en)=>lang==='ar'?ar:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(lang).format(Number(v));
  const date=v=>{if(!v||!Number.isFinite(Date.parse(v)))return'—';return new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))};
  const month=v=>{if(!v||!Number.isFinite(Date.parse(v)))return'—';return new Intl.DateTimeFormat(lang,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(v))};
  const aed=v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(lang,{style:'currency',currency:'AED',minimumFractionDigits:Number(v)<1?4:2,maximumFractionDigits:6}).format(Number(v));
  const root=identity.authority_role==='ROOT_OWNER';
  const permissions=new Set(identity.permissions||[]),granular=new Set(identity.granular_permissions||[]);
  const can=(coarse,fine)=>root||(granular.size?Boolean(fine&&granular.has(fine)):permissions.has(coarse));
  const globalScope=root||identity.access_scope?.type==='ALL_BUSINESSES';
  const state={route:'home',sub:'',customer:null,business:null,businesses:[],accounts:[],entities:[],cases:[],incidents:[],commands:[],decisions:[],overview:null,executive:null,aiUsage:null,aiUsageError:false};
  const generations=new Map(),controllers=new Map();
  let actionSubmit=null,actionOrigin=null,actionBusy=false;
  const message=(id,text,kind='')=>{const el=$(id+'State');if(el){el.textContent=text;el.className='state '+kind}};
  const dataUrl=(action,values={})=>'/api/owner-dashboard-data?'+new URLSearchParams({action,...values});
  const empty=text=>'<div class="empty">'+esc(text||t('لا توجد سجلات في هذا العرض.','No records in this view.'))+'</div>';
  const list=(headers,rows)=>rows.length?'<div class="tableWrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':empty();
  const details=rows=>'<dl>'+rows.map(([a,b])=>'<dt>'+esc(a)+'</dt><dd>'+esc(b??'—')+'</dd>').join('')+'</dl>';
  const button=(attr,id,label)=>'<button type="button" '+attr+'="'+esc(id)+'">'+esc(label)+'</button>';
  async function api(url,body,signal){
    const request={credentials:'same-origin',cache:'no-store',signal:signal||AbortSignal.timeout(15000)};
    if(body!==undefined){request.method='POST';request.headers={'content-type':'application/json','x-dabbir-client':'web'};request.body=JSON.stringify(body)}
    const r=await fetch(url,request),p=await r.json().catch(()=>null);
    if(r.status===401){location.replace('/owner');throw new Error('OWNER_SESSION_REQUIRED')}
    if(!r.ok||p?.ok!==true){const e=new Error(p?.error||'HTTP_'+r.status);e.status=r.status;e.retrySafe=p?.retry_safe;throw e}
    return p;
  }
  function describeError(e){return e.status===403?t('ليس لديك إذن لعرض هذه البيانات أو تنفيذ الإجراء.','You do not have permission to view this data or perform this action.'):t('تعذر إكمال الطلب.','The request could not be completed.')+' '+e.message}
  async function load(key,url,apply,clear=()=>{}){
    const generation=(generations.get(key)||0)+1;generations.set(key,generation);controllers.get(key)?.abort();
    const controller=new AbortController();controllers.set(key,controller);const timer=setTimeout(()=>controller.abort(),15000);
    clear();message(key,t('جارٍ التحميل…','Loading…'));
    try{const p=await api(url,undefined,controller.signal);if(generations.get(key)!==generation)return false;message(key,'');apply(p);return true}
    catch(e){if(generations.get(key)!==generation)return false;clear();message(key,describeError(e),'error');return false}
    finally{clearTimeout(timer);if(controllers.get(key)===controller)controllers.delete(key)}
  }
  function invalidate(key){generations.set(key,(generations.get(key)||0)+1);controllers.get(key)?.abort();controllers.delete(key)}
  function updateContext(){
    const visible=['customers','operations','support'].includes(state.route)&&Boolean(state.customer||state.business);
    $('workspaceContext').hidden=!visible;
    $('contextText').textContent=[state.customer?.customer_no,state.business?.name].filter(Boolean).join(' · ');
  }
  function selectBusiness(id){
    const b=state.businesses.find(row=>row.id===id)||(state.customer?.businesses||[]).find(row=>row.id===id);
    state.business=b||null;invalidate('operations');state.entities=[];$('operationEntities').innerHTML='';updateContext();
  }
  function refreshBusinessPicker(){const entries=state.customer?.businesses?.length?state.customer.businesses:state.businesses;$('businessPicker').innerHTML='<option value="">'+t('اختر نشاطًا','Choose a business')+'</option>'+entries.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===state.business?.id?' selected':'')+'>'+esc(b.name||b.id)+(b.demo_mode?' · '+t('تجريبي','Test'):'')+'</option>').join('')}
  function metric(label,value,note,href){return '<a class="metric" href="#'+href+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note||'')+'</small></a>'}
  function stat(label,value,note=''){return '<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>'}
  function renderAiUsage(){
    const panel=$('aiUsagePanel');if(!root){panel.hidden=true;return}panel.hidden=false;
    if(state.aiUsageError){$('aiUsagePeriod').textContent='';$('aiUsageBadge').textContent=t('القياس غير متاح','Measurement unavailable');$('aiUsageMetrics').innerHTML='';$('aiUsageProviders').innerHTML='';$('aiUsageNotice').innerHTML='<p class="state error">'+t('تعذر تحميل قياس استهلاك AI. لم يتم عرض صفر بدلاً من البيانات المفقودة.','AI usage measurement could not be loaded. Missing data is not shown as zero.')+'</p>';return}
    const a=state.aiUsage;if(!a){$('aiUsagePeriod').textContent=t('جارٍ التحميل…','Loading…');$('aiUsageBadge').textContent='';$('aiUsageMetrics').innerHTML='';$('aiUsageProviders').innerHTML='';$('aiUsageNotice').innerHTML='';return}
    const partial=a.measurement_state==='PARTIAL';
    $('aiUsagePeriod').textContent=t('الشهر: ','Month: ')+month(a.month_start)+' · '+t('آخر تحديث: ','Updated: ')+date(a.generated_at);
    $('aiUsageBadge').textContent=partial?t('قياس جزئي','Partial measurement'):a.measurement_state==='COMPLETE'?t('قياس مكتمل','Complete measurement'):t('حالة القياس غير معروفة','Measurement state unknown');
    $('aiUsageBadge').className='status '+(partial?'warn':a.measurement_state==='COMPLETE'?'good':'');
    $('aiUsageMetrics').innerHTML=[
      stat(t('المحادثات','Conversations'),number(a.conversations),t('محادثات لها رسائل هذا الشهر','Conversations with messages this month')),
      stat(t('الرسائل','Messages'),number(a.messages),t('رسائل DABBIR هذا الشهر','DABBIR messages this month')),
      stat(t('طلبات AI','AI requests'),number(a.ai_requests),t('جميع المزودين','All providers')),
      stat(t('إجمالي التوكنز','Total tokens'),number(a.total_tokens),t('إدخال + إخراج + reasoning','Input + output + reasoning')),
      stat(t('الصرف المؤكد','Confirmed spend'),aed(a.known_cost_aed),t('تكلفة مثبتة من المصادر المسعّرة','Cost verified from priced sources')),
      stat(t('متوسط واتساب / محادثة','WhatsApp avg / conversation'),aed(a.known_cost_per_conversation_aed),t('من التكلفة المؤكدة فقط','Known cost only')),
    ].join('');
    $('aiUsageNotice').innerHTML=partial?'<div class="notice">'+t('القياس جزئي: ','Measurement is partial: ')+number(a.unpriced_operations)+' '+t('عملية AI غير مسعّرة، منها ','unpriced AI operations; ')+number(a.whatsapp_unpriced_operations)+' '+t('على واتساب. الصرف المعروض هو التكلفة المؤكدة فقط ولا يعتبر العمليات غير المسعّرة صفرًا.','are on WhatsApp. Displayed spend is confirmed cost only; unpriced operations are not treated as zero.')+'</div>':'<p class="state success">'+t('لا توجد عمليات AI غير مسعّرة ضمن هذا الشهر.','No unpriced AI operations are recorded for this month.')+'</p>';
    const providers=Array.isArray(a.providers)?a.providers:[];
    $('aiUsageProviders').innerHTML=list([t('المزود','Provider'),t('طلبات AI','AI requests'),t('الصرف المؤكد','Confirmed spend'),t('غير مسعّر','Unpriced')],providers.map(row=>[esc(row.provider),esc(number(row.ai_requests)),esc(aed(row.known_cost_aed)),esc(number(row.unpriced_operations))]));
  }
  function riskReason(value){
    const key=String(value||'');const ar={inactive_7d:'غير نشط منذ 7 أيام',no_first_value:'لم يصل إلى أول قيمة',catalog_empty:'الكتالوج فارغ',integration_degraded:'تكامل متدهور',failed_payment:'فشل دفع'};const en={inactive_7d:'Inactive for 7 days',no_first_value:'No first value yet',catalog_empty:'Catalog is empty',integration_degraded:'Integration degraded',failed_payment:'Failed payment'};
    return (lang==='ar'?ar:en)[key]||key.replaceAll('_',' ');
  }
  function renderExecutiveDeck(){
    const deck=$('executiveDeckPanel'),healthPanel=$('customerHealthPanel'),reliabilityPanel=$('reliabilityPanel');
    if(!root||!state.executive){deck.hidden=true;healthPanel.hidden=true;reliabilityPanel.hidden=true;return}
    const e=state.executive,f=e.funnel||{},pulse=e.executive_pulse||{},health=e.customer_health||{},risk=e.risk_register||{},reliability=e.reliability||{};
    deck.hidden=false;healthPanel.hidden=false;reliabilityPanel.hidden=false;
    const status=String(pulse.overall_status||'').toLowerCase();
    $('executiveStatusBadge').textContent=status==='red'?t('تحتاج تدخل','Needs attention'):status==='yellow'?t('تحتاج مراقبة','Watch'):status==='green'?t('مستقرة','Healthy'):t('غير محسومة','Unknown');
    $('executiveStatusBadge').className='status '+(status==='red'?'bad':status==='yellow'?'warn':status==='green'?'good':'');
    $('activationMilestones').innerHTML=[
      stat(t('حسابات مسجلة','Signup accounts'),number(f.signup_accounts),t('حسابات وصلت للتسجيل','Accounts that reached signup')),
      stat(t('أنشطة منشأة','Businesses created'),number(f.created_business),t('مؤشر تفعيل مستقل','Independent activation milestone')),
      stat(t('كتالوج جاهز','Catalog ready'),number(f.catalog_ready),t('أنشطة لها كتالوج جاهز','Businesses with ready catalog')),
      stat(t('أول قيمة','First value'),number(f.first_value),t('وصلت لنتيجة تشغيلية أولى','Reached a first operational value')),
      stat(t('واتساب مربوط','WhatsApp connected'),number(f.whatsapp_connected),t('ربط مثبت للقناة','Verified channel connection')),
      stat(t('مشترك','Subscribed'),number(f.subscribed),t('ضمن بيئة الاشتراك المسجلة','Within the recorded subscription environment')),
    ].join('');
    $('activationNote').textContent=t('هذه مؤشرات تفعيل مستقلة وليست Funnel خطيًا؛ أول قيمة قد تتحقق من مسار لا يتطلب WhatsApp. متوسط وقت الوصول لأول قيمة: ','These are independent activation milestones, not a strict linear funnel; first value may come from a path that does not require WhatsApp. Average time to first value: ')+number(f.avg_time_to_first_value_hours)+' '+t('ساعة.','hours.');
    $('customerHealthSummary').innerHTML='<div class="metrics">'+[
      stat(t('أحمر','Red'),number(health.red),t('يتطلب تدخلاً','Needs intervention')),
      stat(t('أصفر','Yellow'),number(health.yellow),t('يحتاج متابعة','Needs monitoring')),
      stat(t('أخضر','Green'),number(health.green),t('سليم حسب نموذج القياس','Healthy under the scoring model')),
    ].join('')+'</div>';
    const risky=(Array.isArray(health.items)?health.items:[]).filter(row=>['red','yellow'].includes(String(row.health||'').toLowerCase())).sort((a,b)=>(Number(a.score)||999)-(Number(b.score)||999)).slice(0,5);
    $('customerHealthRisks').innerHTML=risky.length?'<div class="stack">'+risky.map(row=>'<article class="record"><div class="recordTitle"><b>'+esc(row.business_name||row.business_type||t('نشاط','Business'))+'</b><span class="status '+(row.health==='red'?'bad':'warn')+'">'+esc(String(row.score??'—'))+'/100</span></div><small>'+esc(row.business_type||'—')+'</small><p>'+esc((Array.isArray(row.risk_reasons)?row.risk_reasons:[]).map(riskReason).join(' · ')||t('لا توجد أسباب مخاطرة مسجلة.','No recorded risk reasons.'))+'</p></article>').join('')+'</div>':empty(t('لا توجد أنشطة حمراء أو صفراء في النموذج الحالي.','No red or yellow businesses in the current model.'));
    const runtimeState=reliability.runtime_5xx_state||state.overview?.system?.runtime_5xx_state;
    const runtime5xx=runtimeState==='NEEDS_INSTRUMENTATION'||reliability.runtime_5xx_24h===null||reliability.runtime_5xx_24h===undefined?t('غير مقاس','Unmeasured'):number(reliability.runtime_5xx_24h);
    const apiP95=reliability.api_p95_ms===null||reliability.api_p95_ms===undefined?t('غير مقاس','Unmeasured'):number(reliability.api_p95_ms)+' ms';
    const gaps=Array.isArray(risk.telemetry_gaps)?risk.telemetry_gaps:[];
    const whatsappHealth=reliability.whatsapp_degraded===null||reliability.whatsapp_degraded===undefined?t('غير مقاس','Unmeasured'):Number(reliability.whatsapp_degraded)>0?t('متدهور','Degraded'):t('لا يوجد تدهور مسجل','No recorded degradation');
    const calendarHealth=reliability.calendar_degraded===null||reliability.calendar_degraded===undefined?t('غير مقاس','Unmeasured'):Number(reliability.calendar_degraded)>0?t('متدهور','Degraded'):t('لا يوجد تدهور مسجل','No recorded degradation');
    $('reliabilityTruth').innerHTML=(gaps.length?'<div class="notice">'+t('فجوات قياس مفتوحة: ','Open telemetry gaps: ')+esc(gaps.join(' · '))+'. '+t('غياب القياس لا يُعرض كصفر أو كحالة سليمة.','Missing telemetry is not shown as zero or healthy.')+'</div>':'')+details([
      [t('أخطاء Runtime خلال 24 ساعة','Runtime 5xx in 24h'),runtime5xx],
      ['API p95',apiP95],
      [t('عينات الأداء 24 ساعة','Performance samples 24h'),number(reliability.sample_count_24h??state.overview?.system?.sample_count_24h)],
      [t('زمن Database RPC','Database RPC latency'),reliability.database_rpc_latency_ms===null||reliability.database_rpc_latency_ms===undefined?t('غير مقاس','Unmeasured'):number(reliability.database_rpc_latency_ms)+' ms'],
      ['WhatsApp',whatsappHealth],
      [t('التقويم','Calendar'),calendarHealth],
      [t('اختبار الاستعادة','Restore test'),reliability.restore_test_state||'—'],
    ]);
  }
  function renderOverview(){
    const o=state.overview||{},e=state.executive||{},pulse=e.executive_pulse||{},revenue=e.revenue||{},health=e.customer_health||{};
    const realRevenue=String(revenue.environment||'').toLowerCase()==='live';
    const sandbox=t('الفوترة تجريبية؛ لا يُحسب كإيراد فعلي','Sandbox billing; excluded from real revenue');
    $('updatedAt').textContent=o.generated_at?t('آخر تحديث: ','Updated: ')+date(o.generated_at):'';
    $('overviewMetrics').innerHTML=[
      metric(t('عملاء نشطون','Active customers'),number(pulse.active_customers),t('دخول خلال آخر 7 أيام','Signed in during the last 7 days'),'customers'),
      metric(t('العملاء المسجلون','Registered customers'),number(o.customers?.accounts),'','customers'),
      metric(t('أنشطة مباشرة','Live businesses'),number(o.customers?.live_businesses),'','operations'),
      metric(t('أنشطة حمراء','Red health'),number(health.red),t('حسب نموذج صحة التفعيل والاعتمادية','Activation/reliability health model'),'customers'),
      metric(t('مهام CEO محجوبة','Blocked CEO missions'),number(o.ceo?.blocked),'','ceo/commands'),
      metric(t('مشتركون دافعون','Paying customers'),realRevenue?number(pulse.paid_subscribers):'—',realRevenue?'':sandbox,'system/billing'),
      metric('MRR',realRevenue?number(revenue.mrr_aed):'—',realRevenue?'AED':sandbox,'system/billing'),
      metric(t('حوادث حرجة','Critical incidents'),number(o.incidents?.critical),'','support/incidents'),
    ].join('');
    renderExecutiveDeck();
    const gaps=Array.isArray(e.risk_register?.telemetry_gaps)?e.risk_register.telemetry_gaps:[];
    const actions=[['customers',t('أنشطة حمراء تحتاج تدخلاً','Red businesses needing intervention'),health.red],['system/health',t('فجوات قياس مفتوحة','Open telemetry gaps'),gaps.length],['system/health',t('عمليات AI غير مسعّرة','Unpriced AI operations'),state.aiUsage?.unpriced_operations],['support/cases',t('قضايا تجاوزت وقت الاستجابة','Support cases past SLA'),o.support?.sla_breached],['support/incidents',t('حوادث مفتوحة','Open incidents'),o.incidents?.open],['ceo/commands',t('مهام CEO محجوبة','Blocked CEO missions'),o.ceo?.blocked],['ceo/decisions',t('قرارات بانتظار المالك','Decisions awaiting owner'),o.ceo?.decisions_waiting],['operations/WHATSAPP',t('اتصالات واتساب بها أخطاء','WhatsApp connections with errors'),o.whatsapp?.error]].filter(([, ,value])=>Number.isFinite(Number(value))&&Number(value)>0);
    $('ownerAttention').innerHTML=actions.length?'<ul class="actionsList">'+actions.map(([href,label,value])=>'<li><a href="#'+href+'"><span>'+esc(label)+'</span><b>'+number(value)+'</b></a></li>').join('')+'</ul>':empty(t('لا توجد عناصر عاجلة مثبتة ضمن المصادر الحالية.','No urgent items are proven by the current sources.'));
    const wa=o.whatsapp,cal=o.calendar,sys=o.system;
    $('overviewHealth').innerHTML=details([
      ['WhatsApp',wa?.configured===0?t('غير مربوط','Not connected'):wa?.configured===undefined?'—':number(wa.verified_recent)+' / '+number(wa.configured)+' '+t('تم التحقق خلال 24 ساعة','verified within 24 hours')],
      [t('التقويم','Calendar'),cal?.configured===0?t('غير مربوط','Not connected'):cal?.configured===undefined?'—':number(cal.verified_recent)+' / '+number(cal.configured)+' '+t('تم التحقق خلال 24 ساعة','verified within 24 hours')],
      [t('أخطاء الرسائل','Message failures'),t('غير مقاسة بهذا المصدر','Not measured by this source')],
      [t('أخطاء إنشاء الحجوزات','Booking creation failures'),t('غير مقاسة بهذا المصدر','Not measured by this source')],
      [t('أخطاء الخادم خلال 24 ساعة','Server errors in 24 hours'),sys?.runtime_5xx_state==='NEEDS_INSTRUMENTATION'?t('القياس غير متاح','Measurement unavailable'):number(sys?.runtime_5xx_24h)],
      [t('عينات الأداء خلال 24 ساعة','Performance samples in 24 hours'),number(sys?.sample_count_24h)],
    ])+'<p><a href="#system/health">'+t('تفاصيل النظام والتكاملات','System and integration details')+'</a></p>';
  }
  async function loadOverview(){
    state.overview=null;state.executive=null;state.aiUsage=null;state.aiUsageError=false;renderOverview();renderAiUsage();
    const generation=(generations.get('home')||0)+1;generations.set('home',generation);message('page',t('جارٍ تحميل المؤشرات…','Loading metrics…'));
    const results=await Promise.allSettled([api(dataUrl('overview')),root?api(dataUrl('executive')):Promise.resolve(null),root?api(dataUrl('ai_usage')):Promise.resolve(null)]);
    if(generations.get('home')!==generation)return;
    const [overview,executive,aiUsage]=results;if(overview.status==='fulfilled')state.overview=overview.value.overview;if(executive.status==='fulfilled')state.executive=executive.value?.executive||null;if(aiUsage.status==='fulfilled')state.aiUsage=aiUsage.value?.ai_usage||null;else if(root)state.aiUsageError=true;
    renderOverview();renderAiUsage();const failed=[overview,executive].find(r=>r.status==='rejected');message('page',failed?describeError(failed.reason):'',failed?'error':'');
  }
  async function searchCustomers(){
    const q=$('customerQuery').value.trim();
    await load('customers',dataUrl('search',{q}),p=>{state.accounts=Array.isArray(p.accounts)?p.accounts:[];$('customerResults').innerHTML=list([t('العميل','Customer'),t('البريد','Email'),t('الحالة','Status'),t('الإجراء','Action')],state.accounts.map((c,i)=>[esc(c.customer_no||'—'),esc(c.email||'—'),esc(c.access_status||'—'),button('data-customer-index',i,t('فتح العميل','Open customer'))]));if(state.accounts.length===50)message('customers',t('عُرضت أول 50 نتيجة. ضيّق البحث للوصول إلى العميل.','Showing the first 50 results. Refine your search.'))},()=>{state.accounts=[];$('customerResults').innerHTML=''});
  }
  async function openCustomer(index){
    const selected=state.accounts[index];if(!selected?.user_id)return;
    invalidate('operations');state.business=null;state.customer=null;$('customerDetail').hidden=true;updateContext();
    await load('customers',dataUrl('customer360',{user_id:selected.user_id}),p=>{
      state.customer={...p,user_id:p.account?.user_id||selected.user_id};const businesses=Array.isArray(p.businesses)?p.businesses:[];
      $('customerDetail').innerHTML='<h2>'+esc(p.customer_no)+'</h2>'+details([[t('البريد','Email'),p.account?.email],[t('آخر دخول','Last sign in'),date(p.account?.last_login)]])+'<h3 style="margin-top:16px">'+t('الأنشطة','Businesses')+'</h3>'+list([t('النشاط','Business'),t('الاشتراك','Subscription'),'WhatsApp',t('الإجراء','Action')],businesses.map(b=>[esc(b.name),esc(b.plan?.status||t('غير مشترك','Not subscribed')),esc(b.whatsapp?.state||'—'),button('data-business',b.id,t('فتح العمليات','Open operations'))]))+'<div class="row" style="margin-top:12px"><a class="button" href="#support/cases">'+t('دعم العميل','Customer support')+'</a></div>';
      $('customerDetail').hidden=false;updateContext();refreshBusinessPicker();
    },()=>{$('customerDetail').hidden=true;$('customerDetail').innerHTML=''});
  }
  async function loadOperations(){
    const type=state.sub||'ORDER';
    if(!state.businesses.length)await load('operations',dataUrl('operations'),p=>{state.businesses=Array.isArray(p.businesses)?p.businesses:[];refreshBusinessPicker()});
    refreshBusinessPicker();const id=state.business?.id;
    if(state.route!=='operations'||state.sub!==type)return;
    if(!id){$('operationNotice').hidden=true;$('operationEntities').innerHTML=empty(t('اختر نشاطًا لعرض سجلاته.','Choose a business to view its records.'));return}
    $('operationNotice').hidden=!['ORDER','BOOKING','WHATSAPP'].includes(type);
    $('operationNotice').textContent=type==='WHATSAPP'?t('حالة الاتصال تأتي من تحقق المزود. لا يوجد زر يغيّرها إلى «متصل» يدويًا.','Connection status comes from provider verification. It cannot be set to connected manually.'):t('عرض السجلات متاح. تغيير الحالة يتطلب مسار العملية الخاص بالنشاط؛ محرر الحالة العام غير متاح هنا.','Records are available for review. Status changes require the business workflow; a generic status editor is unavailable here.');
    await load('operations',dataUrl('operation_entities',{business_id:id,entity_type:type}),p=>{if(state.business?.id!==id||state.sub!==type)return;state.entities=Array.isArray(p.entities)?p.entities:[];renderEntities(type)},()=>{state.entities=[];$('operationEntities').innerHTML=''});
  }
  function renderEntities(type){
    const money=v=>{const currency=state.business?.currency;if(!currency||v===null||v===undefined)return'—';try{return new Intl.NumberFormat(lang,{style:'currency',currency}).format(Number(v))}catch{return'—'}};
    $('operationEntities').innerHTML=list([t('السجل','Record'),t('الحالة','Status'),t('التفاصيل','Details'),t('الإجراء','Action')],state.entities.map((row,i)=>{
      const title=row.name||row.display_phone_number||row.provider||String(row.id||'').slice(0,8);
      const status=row.status??(typeof row.active==='boolean'?(row.active?t('نشط','Active'):t('متوقف','Inactive')):'—');
      const info=type==='BOOKING'?date(row.starts_at):type==='ORDER'?money(row.total_aed):['PRODUCT','SERVICE'].includes(type)?money(row.price_aed):type==='WHATSAPP'?t('آخر تحقق: ','Last verified: ')+date(row.last_verified_at)+(row.last_error?' · '+row.last_error:''):type==='CALENDAR'?t('آخر مزامنة: ','Last sync: ')+date(row.last_sync_at):row.is_primary?t('الفرع الرئيسي','Primary branch'):'—';
      const coarse={PRODUCT:'manage_products',SERVICE:'manage_services',BRANCH:'manage_businesses',CALENDAR:'manage_integrations'}[type];
      const editable=coarse&&can(coarse,'businesses.edit')&&!(type==='BRANCH'&&row.is_primary);
      return [esc(title),esc(status),esc(info),editable?button('data-edit-entity',i,t('تعديل','Edit')):'—'];
    }));
    if(state.entities.length===100)$('operationEntities').insertAdjacentHTML('beforeend','<p class="hint">'+t('عُرض أحدث 100 سجل؛ هذا ليس العدد الإجمالي.','Showing up to 100 records; this is not a total count.')+'</p>');
  }
  function fields(spec){return spec.map(([name,label,type='text',options=[]])=>'<label class="'+(type==='textarea'?'wide':'')+'">'+esc(label)+(type==='textarea'?'<textarea name="'+name+'" maxlength="4000" required></textarea>':type==='select'?'<select name="'+name+'">'+options.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('')+'</select>':'<input name="'+name+'" type="'+type+'" required maxlength="500">')+'</label>').join('')}
  function openAction(title,spec,submit){
    if(actionBusy)return;actionSubmit=submit;actionOrigin=document.activeElement;
    $('actionDialogTitle').textContent=title;$('actionDialogFields').innerHTML=fields(spec);message('action','');$('actionDialogSubmit').disabled=false;$('actionDialogCancel').disabled=false;$('ownerActionDialog').showModal();
  }
  function writeMessage(p){return p.readback_verified===false?t('سُجل التنفيذ، لكن تعذرت مطابقة القراءة اللاحقة. حدّث القائمة قبل تكرار الإجراء.','The action was recorded, but its readback could not be verified. Refresh the list before repeating it.'):t('حُفظ التغيير وأُعيد تحميل السجل.','The change was saved and the record was reloaded.')}
  function editEntity(index){
    const entity=state.entities[index],business=state.business,type=state.sub;if(!entity||!business)return;
    const defs={PRODUCT:['PRODUCT_SET_ACTIVE','active'],SERVICE:['SERVICE_SET_ACTIVE','active'],BRANCH:['BRANCH_SET_STATUS','status'],CALENDAR:['CALENDAR_SET_SYNC','sync_enabled']};
    const definition=defs[type];if(!definition)return;const [action,key]=definition;
    const label=type==='CALENDAR'?t('المزامنة','Sync'):t('الحالة','Status');
    openAction((entity.name||entity.provider||t('السجل','Record'))+' · '+t('تعديل','Edit'),[
      ['value',label,'select',key==='status'?[['active',t('نشط','Active')],['inactive',t('متوقف','Inactive')]]:[['true',t('مفعّل','Enabled')],['false',t('معطّل','Disabled')]]],
      ['reason',t('سبب التغيير، 8 أحرف على الأقل','Reason, at least 8 characters'),'textarea'],
      ['confirmation',t('اكتب للتأكيد: ','Type to confirm: ')+'EXECUTE '+action],
    ],async values=>{
      const p=await api('/api/owner-action-bridge',{business_id:business.id,entity_id:entity.id,action,reason:values.reason,confirmation:values.confirmation,payload:{[key]:key==='status'?values.value:values.value==='true'}});
      if(state.business?.id===business.id)await loadOperations();
      message('operations',writeMessage(p)+' '+t('رقم التدقيق: ','Audit receipt: ')+p.result.audit_id,p.readback_verified?'success':'warning');return p;
    });
    $('actionDialogFields').querySelector('[name="value"]').value=String(entity[key]);
  }
  async function loadSupport(){
    const sub=state.sub||'cases',no=state.customer?.customer_no;
    $('newSupportCase').hidden=sub!=='cases'||!can('manage_support','support.reply');$('newIncident').hidden=sub!=='incidents'||!can('manage_incidents','incidents.create');
    const url=sub==='cases'?'/api/owner-support-bridge'+(no?'?customer_no='+encodeURIComponent(no):''):sub==='incidents'?'/api/owner-incident-center'+(no?'?customer_no='+encodeURIComponent(no):''):dataUrl('feedback');
    await load('support',url,p=>{
      if(state.sub!==sub)return;
      if(sub==='cases'){
        state.cases=Array.isArray(p.cases)?p.cases:[];
        $('supportContent').innerHTML=state.cases.length?'<div class="stack">'+state.cases.map((c,i)=>'<article class="record"><div class="recordTitle"><b>'+esc(c.subject)+'</b><span class="status">'+esc(c.status)+'</span></div><small>'+esc(c.customer_no)+' · '+esc(c.priority)+' · '+date(c.updated_at)+'</small>'+(c.diagnostic?'<p>'+esc(c.diagnostic)+'</p>':'')+(c.resolution?'<p>'+esc(c.resolution)+'</p>':'')+(c.messages?.length?'<details open><summary>'+t('محادثة العميل','Customer conversation')+'</summary>'+c.messages.map(m=>'<p><b>'+esc(m.author_kind==='customer'?t('العميل','Customer'):t('الدعم','Support'))+'</b> · '+esc(m.body)+'</p><small>'+date(m.created_at)+'</small>').join('')+'</details>':'')+(c.notes?.length?'<details><summary>'+t('سجل الملاحظات','Note history')+'</summary>'+c.notes.map(n=>'<p>'+esc(n.note)+'</p><small>'+date(n.created_at)+'</small>').join('')+'</details>':'')+'<div class="row">'+(c.customer_visible&&can('manage_support','support.reply')?button('data-support-reply',i,t('رد مرئي للعميل','Reply to customer')):'')+(can('manage_support','support.reply')?button('data-support-note',i,t('ملاحظة داخلية','Internal note')):'')+(can('manage_support','support.close')?button('data-support-update',i,t('تحديث القضية','Update case')):'')+'</div></article>').join('')+'</div>':empty();
      }else if(sub==='incidents'){
        state.incidents=Array.isArray(p.payload?.incidents)?p.payload.incidents:[];
        $('supportContent').innerHTML=state.incidents.length?'<div class="stack">'+state.incidents.map((row,i)=>'<article class="record"><div class="recordTitle"><b>'+esc(row.summary)+'</b><span class="status">'+esc(row.status)+'</span></div><small>'+esc(row.customer_no)+' · '+esc(row.priority)+' · '+date(row.updated_at)+'</small><p>'+esc(row.description||row.resolution||'')+'</p>'+(can('manage_incidents','incidents.update')?button('data-incident-update',i,t('تحديث الحادث','Update incident')):'')+'</article>').join('')+'</div>':empty();
      }else{
        const rows=Array.isArray(p.feedback)?p.feedback:[];
        $('supportContent').innerHTML=rows.length?'<div class="stack">'+rows.map(row=>'<article class="record"><div class="recordTitle"><b>'+esc(row.screen_feature||row.feature||row.category||t('ملاحظة','Feedback'))+'</b><small>'+date(row.date||row.created_at)+'</small></div><p>'+esc(row.message||row.feedback||'')+'</p><small>'+esc(row.status||'new')+'</small></article>').join('')+'</div>':empty();
      }
    },()=>{$('supportContent').innerHTML='';state.cases=[];state.incidents=[]});
  }
  function requireCustomer(){if(state.customer?.user_id&&state.customer?.customer_no)return true;message('support',t('اختر العميل من قسم العملاء أولًا.','Select the customer in Customers first.'),'warning');return false}
  function createSupport(){
    if(!requireCustomer())return;const customer=state.customer,business=state.business;
    openAction(t('قضية دعم جديدة','New support case'),[['subject',t('الموضوع','Subject')],['note',t('تفاصيل القضية','Case details'),'textarea'],['priority',t('الأولوية','Priority'),'select',[['normal',t('عادية','Normal')],['high',t('عالية','High')],['urgent',t('عاجلة','Urgent')]]]],async values=>{
      const p=await api('/api/owner-support-bridge',{...values,operation:'CREATE',customer_no:customer.customer_no,target_user_id:customer.user_id,business_id:business?.id||null,category:'general'});await loadSupport();message('support',writeMessage(p),p.readback_verified?'success':'warning');return p;
    });
  }
  function updateSupport(index,noteOnly,customerReply=false){
    const c=state.cases[index];if(!c)return;
    const spec=customerReply?[['note',t('الرد المرئي للعميل','Customer-visible reply'),'textarea']]:noteOnly?[['note',t('الملاحظة','Note'),'textarea']]:[['status',t('الحالة','Status'),'select',[['open',t('مفتوحة','Open')],['waiting',t('انتظار','Waiting')],['resolved',t('محلولة','Resolved')]]],['note',t('الملاحظة أو الحل','Note or resolution'),'textarea']];
    openAction(c.subject||t('الدعم','Support'),spec,async values=>{const p=await api('/api/owner-support-bridge',{...values,operation:customerReply?'REPLY_CUSTOMER':noteOnly?'ADD_NOTE':'UPDATE',case_id:c.id,customer_no:c.customer_no,resolution:values.status==='resolved'?values.note:undefined});await loadSupport();message('support',writeMessage(p),p.readback_verified?'success':'warning');return p});
  }
  function incidentAction(index){
    const row=index===undefined?null:state.incidents[index];if(!row&&!requireCustomer())return;
    const customer=state.customer,business=state.business;
    const spec=row?[['status',t('الحالة','Status'),'select',[['open',t('مفتوح','Open')],['diagnosing',t('قيد التشخيص','Diagnosing')],['action_required',t('يتطلب إجراء','Action required')],['resolved',t('تم الحل','Resolved')],['closed',t('مغلق','Closed')]]],['note',t('التشخيص أو الحل','Diagnosis or resolution'),'textarea']]:[['summary',t('عنوان الحادث','Incident title')],['description',t('ما حدث','What happened'),'textarea'],['priority',t('الأولوية','Priority'),'select',[['normal',t('عادية','Normal')],['high',t('عالية','High')],['urgent',t('عاجلة','Urgent')]]]];
    openAction(row?.summary||t('تسجيل حادث','Record incident'),spec,async values=>{
      const body=row?{...values,operation:'update',incident_id:row.id,resolution:['resolved','closed'].includes(values.status)?values.note:undefined}:{...values,operation:'create',customer_no:customer.customer_no,business_id:business?.id,category:'GENERAL',assigned_queue:'owner'};
      const p=await api('/api/owner-incident-center',body);await loadSupport();message('support',writeMessage(p),p.readback_verified?'success':'warning');return p;
    });
  }
  async function loadCeo(){
    const decisions=state.sub==='decisions';$('missionComposer').hidden=decisions||!can('manage_ceo_commands','ceo.create');
    if(decisions&&!root){$('ceoContent').innerHTML=empty(t('قرارات المالك متاحة للمالك الأصلي فقط.','Owner decisions are available only to the root owner.'));return}
    await load('ceo',decisions?'/api/owner-decision?limit=100':'/api/owner-ceo-command?limit=50',p=>{
      if(decisions){state.decisions=Array.isArray(p.decisions)?p.decisions:[];renderDecisions()}else{state.commands=Array.isArray(p.commands)?p.commands:[];renderCommands()}
    },()=>{$('ceoContent').innerHTML='';state.commands=[];state.decisions=[]});
  }
  function renderCommands(){
    const labels={QUEUED:t('في الانتظار','Queued'),CLAIMED:t('مستلمة','Claimed'),IN_PROGRESS:t('قيد التنفيذ','In progress'),BLOCKED:t('محجوبة','Blocked'),DONE:t('مكتملة','Done'),CANCELLED:t('ملغاة','Cancelled')};
    $('ceoContent').innerHTML=state.commands.length?'<div class="stack">'+state.commands.map((c,i)=>{
      const evidence=(c.actions||[]).flatMap(a=>Array.isArray(a.evidence)?a.evidence:[]);
      return '<article class="record"><div class="recordTitle"><b>'+esc(c.priority||'')+' · '+esc(labels[c.status]||c.status)+'</b><small>'+date(c.created_at)+'</small></div><p>'+esc(c.command_text)+'</p>'+(c.objective?'<p class="muted">'+esc(c.objective)+'</p>':'')+(c.blocked_reason?'<p class="warn">'+esc(c.blocked_reason)+'</p>':'')+(c.result_summary?'<p>'+esc(c.result_summary)+'</p>':'')+'<small>'+t('الموعد: ','Due: ')+date(c.due_at)+'</small><details><summary>'+t('معايير القبول والأدلة','Acceptance criteria and evidence')+'</summary><p>'+esc((c.acceptance_criteria||[]).join('\n'))+'</p>'+ (evidence.length?evidence.map(ev=>'<p class="code">'+esc(ev.type)+' · '+esc(ev.reference)+' · '+(ev.verified?t('تحقق مسجل','Verification recorded'):t('لم يتحقق','Not verified'))+'</p>').join(''):empty(t('لا توجد أدلة مسجلة.','No evidence recorded.')))+'</details>'+(can('manage_ceo_commands','ceo.update')&&!['DONE','CANCELLED'].includes(c.status)?'<div class="row">'+button('data-command-guide',i,t('توجيه إضافي','Add guidance'))+button('data-command-priority',i,t('الأولوية','Priority'))+button('data-command-due',i,t('الموعد','Due date'))+button('data-command-cancel',i,t('إلغاء المهمة','Cancel mission'))+'</div>':'')+(can('manage_ceo_commands','ceo.update')&&['BLOCKED','CANCELLED'].includes(c.status)?button('data-command-resume',i,t('إعادة للطابور','Return to queue')):'')+'</article>';
    }).join('')+'</div>':empty();
    if(state.commands.length===50)$('ceoContent').insertAdjacentHTML('beforeend','<p class="hint">'+t('أحدث 50 مهمة؛ هذا ليس مجموع مهام المنصة.','Latest 50 missions; this is not a platform total.')+'</p>');
  }
  function renderDecisions(){
    const rows=state.decisions.filter(d=>!d.status||String(d.status).toLowerCase()==='open');
    $('ceoContent').innerHTML=rows.length?'<div class="stack">'+rows.map(d=>'<article class="record"><b>'+esc(d.question||d.title||d.reason||d.summary||t('قرار مطلوب','Decision required'))+'</b><p>'+esc(d.action_description||d.event_summary||d.description||d.context_summary||'')+'</p><div class="row">'+['approve','reject','modify'].map(op=>'<button data-resolution="'+op+'" data-decision-id="'+esc(d.id)+'">'+({approve:t('اعتماد','Approve'),reject:t('رفض','Reject'),modify:t('تعديل','Modify')}[op])+'</button>').join('')+'</div></article>').join('')+'</div>':empty(t('لا توجد قرارات مفتوحة ضمن السجلات المعروضة.','No open decisions in the returned records.'));
  }
  function manageCommand(index,operation){
    const c=state.commands[index];if(!c)return;
    const spec=operation==='add_guidance'?[['guidance',t('التوجيه الإضافي','Additional guidance'),'textarea']]:operation==='reprioritize'?[['priority',t('الأولوية','Priority'),'select',[['P0','P0'],['P1','P1'],['P2','P2'],['P3','P3']]]]:operation==='set_due_at'?[['due_at',t('الموعد النهائي؛ اتركه فارغًا لإزالته','Due date; leave empty to clear'),'datetime-local']]:[['confirmation',t('اكتب CONFIRM للتأكيد','Type CONFIRM to confirm')]];
    openAction(t('إدارة المهمة','Manage mission'),spec,async values=>{
      if(['cancel','resume'].includes(operation)&&values.confirmation!=='CONFIRM')throw new Error(t('التأكيد غير مطابق','Confirmation does not match'));
      const p=await api('/api/owner-ceo-command',{operation,command_id:c.id,...(operation==='add_guidance'?{guidance:values.guidance}:operation==='reprioritize'?{priority:values.priority}:operation==='set_due_at'?{due_at:values.due_at?new Date(values.due_at).toISOString():null}:{})});
      await loadCeo();message('ceo',writeMessage(p),p.readback_verified?'success':'warning');return p;
    });
    if(operation==='reprioritize')$('actionDialogFields').querySelector('[name="priority"]').value=c.priority||'P1';
    if(operation==='set_due_at'){const due=$('actionDialogFields').querySelector('[name="due_at"]');due.required=false;if(c.due_at){const d=new Date(c.due_at);due.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}}
  }
  async function loadSystem(){
    const sub=state.sub;
    $('teamPanel').hidden=sub!=='team';$('systemContent').hidden=sub==='team';$('systemContent').innerHTML='';
    if(sub==='team'){if(!can('manage_employees','team.view')){message('system',t('لا تملك صلاحية عرض الفريق.','You cannot view the team.'),'error');$('teamPanel').hidden=true;return}await team.refresh();return}
    if(sub==='audit'){await load('system',dataUrl('audit'),p=>{$('systemContent').innerHTML='<p class="hint">'+t('سجل الفريق والدعم والعمليات وقرارات المالك. تُعرض السجلات ضمن نطاق صلاحيتك.','Team, support, operations and owner decisions. Scoped access restricts the returned entries.')+'</p>'+list([t('الوقت','Time'),t('الإجراء','Action'),t('النتيجة','Result'),t('السبب','Reason')],(p.entries||[]).map(row=>[esc(date(row.created_at)),esc(row.action),esc(row.result),esc(row.reason)]))},()=>{$('systemContent').innerHTML=''});return}
    if(sub==='settings'){$('systemContent').innerHTML='<div class="panel">'+details([[t('الحساب','Account'),identity.display_name],[t('الصلاحية','Authority'),identity.authority_role],[t('انتهاء الجلسة','Session expires'),date(identity.expires_at)],[t('نطاق العمل','Access scope'),identity.access_scope?.type],[t('اللغة','Language'),lang==='ar'?'العربية':'English'],[t('التوقيت','Timezone'),Intl.DateTimeFormat().resolvedOptions().timeZone]])+'</div>';return}
    await loadOverview();if(state.route!=='system'||state.sub!==sub)return;
    const o=state.overview||{},e=state.executive||{},r=e.reliability||{};
    if(sub==='billing'){$('systemContent').innerHTML='<div class="notice">'+(o.payments?.environment==='SANDBOX_ONLY'?t('الفوترة في وضع التجربة. لا توجد إيرادات فعلية مثبتة بهذا المصدر.','Billing is in sandbox mode. This source does not establish real revenue.'):t('حالة الفوترة من سجل مزود الدفع.','Billing status comes from the payment provider ledger.'))+'</div><div class="panel">'+details([[t('البيئة','Environment'),o.payments?.environment],[t('المدفوعات الفاشلة','Failed payments'),number(o.payments?.failed)],['MRR (AED)',number(e.revenue?.mrr_aed)],[t('التجارب','Trials'),number(e.executive_pulse?.trialing)]])+'</div>';return}
    $('systemContent').innerHTML='<div class="grid"><section class="panel"><h2>'+t('الأداء','Performance')+'</h2>'+details([[t('أخطاء الخادم 24 ساعة','Server errors in 24 hours'),number(o.system?.runtime_5xx_24h)],['API p95 (ms)',number(o.system?.api_p95_ms)],['Database RPC (ms)',number(r.database_rpc_latency_ms)],[t('عينات 24 ساعة','24-hour samples'),number(o.system?.sample_count_24h)],[t('حالة القياس','Measurement state'),o.system?.runtime_5xx_state]])+'</section><section class="panel"><h2>'+t('النسخ والاستعادة','Backup & recovery')+'</h2>'+details([[t('نوع الدليل','Evidence type'),r.backup_state],[t('آخر نسخة مسجلة','Last recorded backup'),date(r.backup_last_at)],[t('اختبار الاستعادة','Restore test'),r.restore_test_state],[t('وقت الاختبار','Test time'),date(r.restore_test_last_at)]])+'</section><section class="panel"><h2>WhatsApp</h2>'+details([[t('الاتصالات المسجلة','Configured connections'),number(o.whatsapp?.configured)],[t('تحقق حديث','Recently verified'),number(o.whatsapp?.verified_recent)],[t('اتصالات بها أخطاء','Connections with errors'),number(o.whatsapp?.error)]])+'<p><a href="#operations/WHATSAPP">'+t('فحص اتصال نشاط','Inspect business connection')+'</a></p></section><section class="panel"><h2>'+t('التقاويم','Calendars')+'</h2>'+details([[t('الاتصالات المسجلة','Configured connections'),number(o.calendar?.configured)],[t('مزامنة حديثة','Recent sync'),number(o.calendar?.verified_recent)],[t('اتصالات بها أخطاء','Connections with errors'),number(o.calendar?.error)]])+'<p><a href="#operations/CALENDAR">'+t('إدارة مزامنة نشاط','Manage business sync')+'</a></p></section></div>';
  }
  const defaults={home:'',customers:'',operations:'ORDER',support:'cases',ceo:'commands',system:'health'};
  const allowed={home:[''],customers:[''],operations:['ORDER','BOOKING','PRODUCT','SERVICE','BRANCH','WHATSAPP','CALENDAR'],support:['cases','incidents','feedback'],ceo:['commands','decisions'],system:['health','billing','team','audit','settings']};
  const aliases={governance:'system/audit',team:'system/team',ai:'ceo/commands',feedback:'support/feedback'};
  function route(){
    const raw=location.hash.slice(1)||'home',key=aliases[raw]||raw;let [primary,sub]=key.split('/');if(!allowed[primary])primary='home';sub=allowed[primary].includes(sub)?sub:defaults[primary];
    if(navPermissions[primary]&&!navPermissions[primary]()){primary='home';sub=''}
    if(sectionPermission[primary])sub=allowed[primary].filter(key=>sectionPermission[primary][key]?.()).includes(sub)?sub:allowed[primary].find(key=>sectionPermission[primary][key]?.());
    if(actionBusy){history.replaceState(null,'','#'+state.route+(state.sub?'/'+state.sub:''));return}if($('ownerActionDialog').open)$('ownerActionDialog').close();
    for(const name of ['home','customers','operations','support','ceo','system'])if(name!==primary)invalidate(name);
    state.route=primary;state.sub=sub;message('page','');$('updatedAt').textContent='';
    document.querySelectorAll('.screen').forEach(el=>el.hidden=el.id!==primary);
    document.querySelectorAll('#nav a').forEach(el=>{if(el.dataset.primary===primary)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
    document.querySelectorAll('.subnav a').forEach(el=>{if(el.hash==='#'+primary+'/'+sub)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
    const current=document.querySelector('#nav a[data-primary="'+primary+'"]');$('pageTitle').textContent=current?.textContent||'';updateContext();
    if(primary==='home')void loadOverview();else if(primary==='customers')void searchCustomers();else if(primary==='operations')void loadOperations();else if(primary==='support')void loadSupport();else if(primary==='ceo')void loadCeo();else void loadSystem();
  }
  $('customerSearchForm').addEventListener('submit',e=>{e.preventDefault();void searchCustomers()});
  $('businessPicker').addEventListener('change',e=>{selectBusiness(e.target.value);void loadOperations()});
  $('clearContext').addEventListener('click',()=>{state.customer=null;state.business=null;invalidate('customers');invalidate('operations');invalidate('support');$('customerDetail').hidden=true;updateContext();location.hash='customers';if(state.route==='customers')void searchCustomers()});
  $('newSupportCase').addEventListener('click',createSupport);$('newIncident').addEventListener('click',()=>incidentAction());
  $('refreshAll').addEventListener('click',route);
  $('languageButton').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('lang',lang==='ar'?'en':'ar');location.assign(url.toString())});
  $('logout').addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api('/api/auth/owner-logout',{});location.replace('/owner')}catch(error){message('page',describeError(error),'error');$('logout').disabled=false}});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const d=b.dataset;
    if(d.customerIndex!==undefined)void openCustomer(Number(d.customerIndex));
    else if(d.business){selectBusiness(d.business);location.hash='operations/ORDER'}
    else if(d.editEntity!==undefined)editEntity(Number(d.editEntity));
    else if(d.supportNote!==undefined)updateSupport(Number(d.supportNote),true);
    else if(d.supportReply!==undefined)updateSupport(Number(d.supportReply),false,true);
    else if(d.supportUpdate!==undefined)updateSupport(Number(d.supportUpdate),false);
    else if(d.incidentUpdate!==undefined)incidentAction(Number(d.incidentUpdate));
    else if(d.commandGuide!==undefined)manageCommand(Number(d.commandGuide),'add_guidance');
    else if(d.commandPriority!==undefined)manageCommand(Number(d.commandPriority),'reprioritize');
    else if(d.commandDue!==undefined)manageCommand(Number(d.commandDue),'set_due_at');
    else if(d.commandCancel!==undefined)manageCommand(Number(d.commandCancel),'cancel');
    else if(d.commandResume!==undefined)manageCommand(Number(d.commandResume),'resume');
    else if(d.resolution&&root)openAction(t('قرار المالك','Owner decision'),[['note',t('سبب القرار أو التعديل','Decision reason or revision'),'textarea']],async values=>{const p=await api('/api/owner-decision',{escalation_id:d.decisionId,resolution:d.resolution,note:values.note});await loadCeo();message('ceo',writeMessage(p),p.readback_verified?'success':'warning');return p});
  });
  $('ownerMissionCommand').addEventListener('input',e=>$('ownerMissionCommandCounter').textContent=e.target.value.length+' / 4000');
  $('ownerMissionCreate').addEventListener('submit',async e=>{
    e.preventDefault();const submit=e.submitter;if(submit.disabled)return;submit.disabled=true;message('ceo',t('جارٍ إرسال المهمة…','Submitting mission…'));
    try{const due=$('ownerMissionDue').value;const p=await api('/api/owner-ceo-command',{operation:'create',command_text:$('ownerMissionCommand').value.trim(),objective:$('ownerMissionObjective').value.trim(),priority:$('ownerMissionPriority').value,acceptance_criteria:$('ownerMissionAcceptance').value.split('\n').map(x=>x.trim()).filter(Boolean),due_at:due?new Date(due).toISOString():null});e.target.reset();$('ownerMissionCommandCounter').textContent='0 / 4000';await loadCeo();message('ceo',writeMessage(p),p.readback_verified?'success':'warning')}
    catch(error){message('ceo',describeError(error)+' '+t('تحقق من قائمة المهام قبل إعادة الإرسال.','Check the mission list before submitting again.'),'error')}
    finally{submit.disabled=false}
  });
  $('actionDialogCancel').addEventListener('click',()=>{if(!actionBusy){$('ownerActionDialog').close();actionOrigin?.focus()}});
  $('ownerActionDialog').addEventListener('cancel',e=>{if(actionBusy)e.preventDefault()});
  $('ownerActionForm').addEventListener('submit',async e=>{
    e.preventDefault();if(actionBusy||!actionSubmit)return;actionBusy=true;$('actionDialogSubmit').disabled=true;$('actionDialogCancel').disabled=true;message('action',t('جارٍ الحفظ…','Saving…'));
    try{const p=await actionSubmit(Object.fromEntries(new FormData(e.target)));message('action',writeMessage(p),p.readback_verified===false?'warning':'success');actionSubmit=null}
    catch(error){message('action',describeError(error)+' '+t('تحقق من السجل قبل تكرار الإجراء.','Check the record before repeating the action.'),'error');$('actionDialogSubmit').disabled=error.retrySafe===false||error.status>=500||(!error.status&&error.name!=='Error')}
    finally{actionBusy=false;$('actionDialogCancel').disabled=false}
  });
  // Client visibility is only presentation. Broker and database remain authoritative.
  const sectionPermission={
    operations:{ORDER:()=>can('manage_orders','orders.view'),BOOKING:()=>can('manage_bookings','bookings.view'),PRODUCT:()=>can('manage_businesses','businesses.view'),SERVICE:()=>can('manage_businesses','businesses.view'),BRANCH:()=>can('manage_businesses','businesses.view'),WHATSAPP:()=>can('manage_businesses','businesses.view'),CALENDAR:()=>can('manage_businesses','businesses.view')},
    support:{cases:()=>can('manage_support','support.view'),incidents:()=>can('manage_incidents','incidents.view'),feedback:()=>can('manage_customers','customers.view')},
    ceo:{commands:()=>globalScope&&can('manage_ceo_commands','ceo.view'),decisions:()=>root},
    system:{health:()=>globalScope&&can('manage_system','system.view'),billing:()=>globalScope&&can('view_financials','payments.view'),team:()=>can('manage_employees','team.view'),audit:()=>can('manage_system','audit.view'),settings:()=>true}
  };
  const navPermissions={customers:()=>can('manage_customers','customers.view'),...Object.fromEntries(Object.entries(sectionPermission).map(([key,checks])=>[key,()=>Object.values(checks).some(check=>check())]))};
  for(const [primary,checks] of Object.entries(sectionPermission))for(const [sub,check] of Object.entries(checks)){const link=document.querySelector('.subnav a[href="#'+primary+'/'+sub+'"]');if(link)link.hidden=!check()}
  for(const [id,check] of Object.entries(navPermissions)){const link=document.querySelector('[data-primary="'+id+'"]');if(link)link.hidden=!check()}
  const team=mountTeam({api,t,esc,date,number,can,root,openAction,writeMessage,describeError});
  addEventListener('hashchange',route);route();
}
