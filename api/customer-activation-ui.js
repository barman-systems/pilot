const script=String.raw`(()=>{
  if(window.__dabbirCustomerActivationUi)return;
  window.__dabbirCustomerActivationUi=true;

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let businessId=null;
  let profile=null;
  let whatsapp=null;
  let loading=false;
  let loadedAt=0;
  const CACHE_MS=30000;

  const style=document.createElement('style');
  style.dataset.dabbirCustomerActivation='v3';
  style.textContent=[
    '.dabbirActivation{margin:0 0 14px;border:1px solid #334061;background:linear-gradient(145deg,#12182b 0%,#101526 54%,#111827 100%);border-radius:22px;padding:16px;box-shadow:0 18px 55px #0005}',
    '.daHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.daHead h2{margin:0;font-size:16px;line-height:1.35}.daHead p{margin:5px 0 0;color:#a9b4c8;font-size:10px;line-height:1.65}',
    '.daScore{min-width:66px;text-align:center;border:1px solid #3d4d73;background:#151e35;border-radius:16px;padding:9px}.daScore strong{display:block;font-size:20px}.daScore span{font-size:8px;color:#94a2bc}',
    '.daProgress{height:7px;border-radius:999px;background:#202941;overflow:hidden;margin:12px 0}.daProgress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#3b82f6,#22d3ee);transition:width .25s ease}',
    '.daGrid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr);gap:10px}.daNext,.daProof{border:1px solid #2b3655;background:#0d1322;border-radius:16px;padding:12px}',
    '.daLabel{font-size:8px;font-weight:900;letter-spacing:.04em;color:#8ca0c3}.daNext b{display:block;margin-top:5px;font-size:12px}.daNext p{margin:5px 0 10px;color:#99a7bd;font-size:9px;line-height:1.6}',
    '.daActions{display:flex;gap:7px;flex-wrap:wrap}.daActions button{min-height:40px;border-radius:11px;padding:8px 11px;font-size:9px;font-weight:900}',
    '.daPrimary{border:0;color:white;background:linear-gradient(135deg,#7c3aed,#2563eb)}.daSecondary{border:1px solid #34415f;background:#151d2f;color:#e9eef8}',
    '.daProofGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.daProofItem{border:1px solid #26324e;background:#11192a;border-radius:12px;padding:9px}.daProofItem strong{display:block;font-size:16px}.daProofItem span{display:block;margin-top:3px;color:#8f9db2;font-size:7px}',
    '.daSteps{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.daStep{display:inline-flex;align-items:center;gap:5px;border:1px solid #303c5c;background:#121a2b;border-radius:999px;padding:6px 8px;font-size:8px;color:#aab6ca}.daStep.done{border-color:#285d4a;background:#10261f;color:#8ce6a1}.daStep:before{content:"•";font-size:14px;line-height:0}.daStep.done:before{content:"✓";font-size:9px}',
    '.daIntentWrap{margin-top:10px;border-top:1px solid #26324a;padding-top:10px}.daIntentTitle{font-size:9px;font-weight:900;color:#cbd5e7;margin-bottom:7px}.daIntentGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.daIntent{border:1px solid #34415f;background:#121a2c;color:#e9eef8;border-radius:12px;min-height:42px;padding:8px;font-size:8px;font-weight:850;text-align:center}.daIntent:hover,.daIntent:focus-visible{border-color:#5472b4;background:#17233b}',
    '.daLoading{padding:12px;color:#9aa8bd;font-size:9px}',
    '@media(max-width:700px){.dabbirActivation{padding:13px;border-radius:18px;margin-bottom:10px}.daHead h2{font-size:15px}.daScore{min-width:58px;padding:8px}.daGrid{grid-template-columns:1fr}.daProofGrid{gap:5px}.daProofItem{padding:8px}.daActions button{flex:1;min-width:120px;min-height:44px}.daSteps{gap:5px}.daIntentGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.daIntent{min-height:46px;font-size:9px}}',
    '@media(prefers-reduced-motion:reduce){.daProgress i{transition:none}}'
  ].join('');
  document.head.append(style);

  function copy(){return ar()?{
    title:'جهّز دَبِّر ليعمل عنك',readyTitle:'دَبِّر جاهز للعمل',desc:'دقيقة واحدة هنا تختصر عليك البحث داخل الإعدادات. نعرض فقط ما تم التحقق منه فعليًا.',readyDesc:'الأساسيات التشغيلية جاهزة. راقب ما أنجزه دَبِّر وما يحتاج قرارك فقط.',score:'الجاهزية',next:'الخطوة الأفضل الآن',proof:'دليل القيمة',intentTitle:'ماذا تريد من دَبِّر الآن؟',
    profile:'معلومات النشاط',channel:'واتساب',ai:'ذكاء دَبِّر',profileTodo:'أكمل معلومات نشاطك',profileBody:'أضف الساعات وبيانات التواصل والسياسات الأساسية حتى يرد دَبِّر بمعلومات صحيحة.',profileAction:'إكمال المعلومات',channelTodo:'اربط واتساب',channelBody:'اربط رقم WhatsApp Business من داخل دَبِّر حتى تنتقل من التجربة الداخلية إلى قناة العميل الحقيقية.',channelAction:'ربط واتساب',channelVerifyTodo:'تحقق من تشغيل واتساب',channelVerifyBody:'الرقم مرتبط بـ Meta، لكن دَبِّر لن يعتبره جاهزًا حتى يستقبل رسالة WhatsApp حقيقية ويسجل ردًا حقيقيًا بنتيجة خارجية موثقة.',channelVerifyAction:'اختبار واتساب',aiTodo:'تحقق من جاهزية الذكاء',aiBody:'دَبِّر يحتاج AI تشغيليًا قبل أن يعتمد عليه في الردود والمتابعة.',aiAction:'فتح الحالة',testTodo:'جرّب أول محادثة',testBody:'أرسل محادثة اختبار حقيقية داخل دَبِّر وشاهد الرد والحفظ قبل الاعتماد اليومي.',testAction:'فتح المحادثات',priorities:'راجع أولويات اليوم',customers:'عملاء',chats:'محادثات',aiReplies:'ردود AI',unverified:'—',loading:'دَبِّر يتحقق من التجهيز الفعلي…',complete:'مكتمل',reply:'الرد على العملاء',follow:'المتابعات',customerRecords:'العملاء',settings:'معلومات النشاط',appointments:'المواعيد',operations:'الطلبات والمخزون',viewings:'المعاينات',schedule:'الجدول'
  }:{
    title:'Get DABBIR working for you',readyTitle:'DABBIR is ready to operate',desc:'One minute here saves hunting through settings. Only verified setup state is shown.',readyDesc:'Core operations are ready. Focus on what DABBIR completed and what actually needs your decision.',score:'Readiness',next:'Best next step',proof:'Proof of value',intentTitle:'What do you want DABBIR to do now?',
    profile:'Business info',channel:'WhatsApp',ai:'DABBIR AI',profileTodo:'Complete business information',profileBody:'Add hours, contact details and key policies so DABBIR can answer accurately.',profileAction:'Complete info',channelTodo:'Connect WhatsApp',channelBody:'Connect your WhatsApp Business number inside DABBIR to move from internal testing to the real customer channel.',channelAction:'Connect WhatsApp',channelVerifyTodo:'Verify WhatsApp operation',channelVerifyBody:'The number is linked to Meta, but DABBIR will not mark it ready until a real WhatsApp inbound and a real externally verified reply are recorded.',channelVerifyAction:'Test WhatsApp',aiTodo:'Verify AI readiness',aiBody:'DABBIR needs operational AI before replies and follow-ups can be trusted.',aiAction:'Open status',testTodo:'Try the first conversation',testBody:'Run a real in-app conversation and verify the reply and persistence before daily use.',testAction:'Open conversations',priorities:'Review today’s priorities',customers:'Customers',chats:'Conversations',aiReplies:'AI replies',unverified:'—',loading:'DABBIR is checking verified setup…',complete:'Complete',reply:'Reply to customers',follow:'Follow-ups',customerRecords:'Customers',settings:'Business info',appointments:'Appointments',operations:'Orders & inventory',viewings:'Viewings',schedule:'Schedule'
  }}

  function profileReady(){
    const f=profile?.facts||{};
    const core=Boolean(String(f.about_business||'').trim()&&String(f.business_hours||'').trim());
    const contact=Boolean(String(f.contact_phone||'').trim()||String(f.contact_whatsapp||'').trim()||String(f.contact_email||'').trim());
    return core&&contact;
  }

  function whatsappLinked(){
    const w=whatsapp||workspace?.whatsapp||{};
    return Boolean(w.connected||w.meta_authorized||['META_AUTHORIZED','OPERATIONAL'].includes(String(w.state||'')));
  }

  function whatsappReady(){
    const w=whatsapp||workspace?.whatsapp||{};
    return w.operational===true&&String(w.state||'')==='OPERATIONAL';
  }

  function aiReady(){return Boolean(workspace?.ai?.configured)}
  function exactMetric(key){
    const m=workspace?.verified_metrics;
    if(!m||m.state!=='VERIFIED_EXACT_COUNTS')return null;
    const value=m[key];
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }

  function openScreen(screen){if(typeof showScreen==='function')showScreen(screen)}
  function ensure(){
    const dash=q('#screen-dashboard');
    if(!dash)return null;
    let panel=q('#dabbirActivation');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActivation';
    panel.className='dabbirActivation';
    const hero=dash.querySelector('.hero');
    if(hero?.nextSibling)dash.insertBefore(panel,hero.nextSibling);else dash.prepend(panel);
    return panel;
  }

  function nextStep(){
    const t=copy();
    if(!profileReady())return {title:t.profileTodo,body:t.profileBody,action:t.profileAction,screen:'settings'};
    if(!whatsappLinked())return {title:t.channelTodo,body:t.channelBody,action:t.channelAction,screen:'integrations'};
    if(!whatsappReady())return {title:t.channelVerifyTodo,body:t.channelVerifyBody,action:t.channelVerifyAction,screen:'integrations'};
    if(!aiReady())return {title:t.aiTodo,body:t.aiBody,action:t.aiAction,screen:'integrations'};
    const chats=exactMetric('active_chats');
    if(chats===0)return {title:t.testTodo,body:t.testBody,action:t.testAction,screen:'conversations'};
    return {title:t.priorities,body:t.readyDesc,action:t.priorities,screen:'dashboard',target:'#dabbirActionCenter'};
  }

  function intents(){
    const t=copy();
    const type=String(workspace?.business?.business_type||'other').toLowerCase();
    const common=[{label:t.reply,screen:'conversations'},{label:t.follow,screen:'tasks'}];
    if(type==='store')return [...common,{label:t.operations,screen:'operations'},{label:t.customerRecords,screen:'customers'}];
    if(type==='clinic'||type==='salon'||type==='services')return [...common,{label:t.appointments,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    if(type==='real_estate')return [...common,{label:t.viewings,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    if(type==='creator')return [...common,{label:t.schedule,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    return [...common,{label:t.customerRecords,screen:'customers'},{label:t.settings,screen:'settings'}];
  }

  function render(){
    const panel=ensure();if(!panel||!workspace?.business)return;
    const t=copy();
    if(loading&&(!profile||!whatsapp)){panel.innerHTML='<div class="daLoading">'+esc(t.loading)+'</div>';return}
    const states=[profileReady(),whatsappReady(),aiReady()];
    const done=states.filter(Boolean).length;
    const score=Math.round(done/states.length*100);
    const ready=done===states.length;
    const next=nextStep();
    const customers=exactMetric('customers');
    const chats=exactMetric('active_chats');
    const aiReplies=exactMetric('ai_messages');
    const metric=(value,label)=>'<div class="daProofItem"><strong>'+esc(value==null?t.unverified:value)+'</strong><span>'+esc(label)+'</span></div>';
    const step=(label,value)=>'<span class="daStep '+(value?'done':'')+'">'+esc(label)+'</span>';
    const intentButtons=intents().map(item=>'<button type="button" class="daIntent" data-da-screen="'+esc(item.screen)+'">'+esc(item.label)+'</button>').join('');
    panel.innerHTML='<div class="daHead"><div><h2>'+esc(ready?t.readyTitle:t.title)+'</h2><p>'+esc(ready?t.readyDesc:t.desc)+'</p></div><div class="daScore"><strong>'+score+'%</strong><span>'+esc(t.score)+'</span></div></div><div class="daProgress" aria-label="'+esc(t.score)+' '+score+'%"><i style="width:'+score+'%"></i></div><div class="daGrid"><div class="daNext"><span class="daLabel">'+esc(t.next)+'</span><b>'+esc(next.title)+'</b><p>'+esc(next.body)+'</p><div class="daActions"><button type="button" class="daPrimary" id="daNextAction">'+esc(next.action)+'</button><button type="button" class="daSecondary" id="daPriorities">'+esc(t.priorities)+'</button></div><div class="daSteps">'+step(t.profile,states[0])+step(t.channel,states[1])+step(t.ai,states[2])+'</div></div><div class="daProof"><span class="daLabel">'+esc(t.proof)+'</span><div class="daProofGrid">'+metric(customers,t.customers)+metric(chats,t.chats)+metric(aiReplies,t.aiReplies)+'</div></div></div><div class="daIntentWrap"><div class="daIntentTitle">'+esc(t.intentTitle)+'</div><div class="daIntentGrid">'+intentButtons+'</div></div>';
    const nextButton=q('#daNextAction');if(nextButton)nextButton.onclick=()=>{openScreen(next.screen);if(next.target)setTimeout(()=>q(next.target)?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
    const priorities=q('#daPriorities');if(priorities)priorities.onclick=()=>{openScreen('dashboard');setTimeout(()=>q('#dabbirActionCenter')?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
    panel.querySelectorAll('[data-da-screen]').forEach(button=>button.onclick=()=>openScreen(button.dataset.daScreen));
  }

  async function fetchJson(url){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVATION_READ_FAILED');
    return body;
  }

  async function load(force=false){
    const id=workspace?.business?.id;if(!id||loading)return;
    if(!force&&businessId===id&&Date.now()-loadedAt<CACHE_MS){render();return}
    businessId=id;loading=true;render();
    const [p,w]=await Promise.allSettled([
      fetchJson('/api/business-profile?business_id='+encodeURIComponent(id)),
      fetchJson('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(id))
    ]);
    profile=p.status==='fulfilled'?p.value:null;
    whatsapp=w.status==='fulfilled'?w.value:(workspace?.whatsapp||null);
    loadedAt=Date.now();loading=false;render();
  }

  if(typeof renderDashboard==='function'){
    const base=renderDashboard;
    renderDashboard=function(){const result=base.apply(this,arguments);render();load(false);return result};
  }
  if(typeof renderAll==='function'){
    const base=renderAll;
    renderAll=function(){const result=base.apply(this,arguments);setTimeout(()=>{render();load(false)},0);return result};
  }
  if(typeof setLanguage==='function'){
    const base=setLanguage;
    setLanguage=function(next){const result=base(next);setTimeout(render,0);return result};
  }
  setTimeout(()=>{render();load(false)},500);
  window.__dabbirCustomerActivation={version:'customer-activation-v3',refresh:()=>load(true)};
})();`;

const uxFoundation=String.raw`(()=>{
  if(window.__dabbirUxFoundationV1)return;
  window.__dabbirUxFoundationV1=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const isAr=()=>document.documentElement.lang!=='en';
  const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const DEFAULT_NOTIFICATIONS={handoffs:true,appointments:true,channel_issues:true,daily_summary:true};
  const DEFAULT_DASHBOARD={hidden_metrics:[],metric_order:['conversations','appointments','customers','attention']};
  let preferences={notification_preferences:{...DEFAULT_NOTIFICATIONS},dashboard_preferences:{...DEFAULT_DASHBOARD}};
  let preferencesBusinessId='';
  let confirmResolver=null;
  let tourIndex=0;

  const copy={
    ar:{search:'بحث سريع',searchPlaceholder:'ابحث في المحادثات والعملاء والمواعيد والمهام…',searchHint:'اضغط / للبحث من أي مكان',noResults:'لا توجد نتائج مطابقة.',allStatuses:'كل الحالات',filterPlaceholder:'ابحث داخل هذه الشاشة…',loading:'جارٍ تحديث بيانات النشاط…',loadError:'تعذر تحديث البيانات. تحقق من الاتصال وأعد المحاولة.',offline:'أنت غير متصل. سنحافظ على الشاشة الحالية حتى يعود الاتصال.',online:'عاد الاتصال بالإنترنت.',confirmTitle:'تأكيد الإجراء',confirmBody:'راجع الإجراء قبل المتابعة.',confirm:'متابعة',cancel:'إلغاء',logoutTitle:'تسجيل الخروج؟',logoutBody:'ستحتاج إلى تسجيل الدخول مجددًا للوصول إلى نشاطك.',takeoverTitle:'استلام المحادثة يدويًا؟',takeoverBody:'ستتوقف ردود دبّر التلقائية حتى تعيد المحادثة إليه.',returnTitle:'إعادة المحادثة إلى دبّر؟',returnBody:'سيستأنف دبّر الرد التلقائي وفق إعدادات النشاط.',emptyChatsTitle:'ابدأ أول محادثة',emptyChatsBody:'أنشئ محادثة عميل داخل دبّر للتحقق من الرد والحفظ.',emptyAppointmentsTitle:'لا توجد مواعيد بعد',emptyAppointmentsBody:'أضف أول موعد ليظهر في جدول النشاط.',emptyCustomersTitle:'لا يوجد عملاء بعد',emptyCustomersBody:'يُنشأ العميل تلقائيًا عند بدء أول محادثة.',emptyTasksTitle:'كل شيء تحت السيطرة',emptyTasksBody:'لا توجد قرارات أو متابعات تحتاج تدخلك الآن.',emptyNoticesTitle:'لا توجد تنبيهات مهمة',emptyNoticesBody:'سنظهر هنا فقط ما يحتاج انتباهك فعلًا.',startChat:'محادثة جديدة',addAppointment:'إضافة موعد',goDashboard:'العودة إلى اليوم',customize:'تخصيص اللوحة',customizeTitle:'اختر مؤشرات لوحة اليوم',customizeDesc:'أظهر ما يهمك ورتّب البطاقات بما يناسب عملك.',showMetric:'إظهار',moveUp:'أعلى',moveDown:'أسفل',savePrefs:'حفظ التفضيلات',prefsSaved:'تم حفظ التفضيلات.',prefsFailed:'تعذر حفظ التفضيلات الآن؛ احتفظنا بها على هذا الجهاز.',notificationPrefs:'تفضيلات التنبيهات',notificationDesc:'اختر التنبيهات التي تريد متابعتها. التنبيهات الحرجة الخاصة بالأمان لا يمكن تعطيلها.',handoffs:'التحويلات البشرية',appointments:'المواعيد القادمة',channelIssues:'مشكلات القنوات',dailySummary:'الملخص اليومي',feedbackTitle:'ساعدنا على تحسين دبّر',feedbackDesc:'أرسل ملاحظة قصيرة. لا تضع كلمات مرور أو بيانات حساسة.',feedbackCategory:'نوع الملاحظة',general:'ملاحظة عامة',problem:'مشكلة',idea:'فكرة',onboarding:'التجهيز الأولي',rating:'التقييم',message:'اكتب ملاحظتك…',sendFeedback:'إرسال الملاحظة',feedbackSent:'شكرًا، تم حفظ ملاحظتك.',feedbackFailed:'تعذر حفظ الملاحظة الآن.',tourWelcome:'مرحبًا بك في دبّر',tourWelcomeBody:'ابدأ من بطاقة الجاهزية؛ ستقودك إلى الخطوة الأكثر فائدة لنشاطك.',tourPriority:'الأولوية أولًا',tourPriorityBody:'تعرض لوحة اليوم ما يحتاج قرارك بدل إغراقك بالقوائم.',tourMore:'كل الأدوات في مكان واضح',tourMoreBody:'تجد الإعدادات والربط والتنبيهات والمساعدة تحت «المزيد».',next:'التالي',finish:'ابدأ العمل',skip:'تخطي الجولة',metricConversations:'المحادثات',metricAppointments:'المواعيد',metricCustomers:'العملاء',metricAttention:'تحتاج قرارك',results:'نتائج البحث',clear:'مسح'},
    en:{search:'Quick search',searchPlaceholder:'Search conversations, customers, appointments and tasks…',searchHint:'Press / to search from anywhere',noResults:'No matching results.',allStatuses:'All statuses',filterPlaceholder:'Search this screen…',loading:'Refreshing workspace data…',loadError:'Data could not be refreshed. Check your connection and try again.',offline:'You are offline. The current screen will stay available until connection returns.',online:'Internet connection restored.',confirmTitle:'Confirm action',confirmBody:'Review this action before continuing.',confirm:'Continue',cancel:'Cancel',logoutTitle:'Log out?',logoutBody:'You will need to sign in again to access your workspace.',takeoverTitle:'Take over this conversation?',takeoverBody:'DABBIR automatic replies will pause until you return the conversation.',returnTitle:'Return this conversation to DABBIR?',returnBody:'DABBIR will resume automatic replies using the workspace settings.',emptyChatsTitle:'Start the first conversation',emptyChatsBody:'Create an in-app customer conversation to verify replies and persistence.',emptyAppointmentsTitle:'No appointments yet',emptyAppointmentsBody:'Add the first appointment to start the business schedule.',emptyCustomersTitle:'No customers yet',emptyCustomersBody:'A customer is created automatically with the first conversation.',emptyTasksTitle:'Everything is under control',emptyTasksBody:'No decisions or follow-ups need your attention right now.',emptyNoticesTitle:'No important alerts',emptyNoticesBody:'Only items that truly need attention will appear here.',startChat:'New conversation',addAppointment:'Add appointment',goDashboard:'Back to Today',customize:'Customize dashboard',customizeTitle:'Choose Today metrics',customizeDesc:'Show what matters and order cards for your workflow.',showMetric:'Show',moveUp:'Up',moveDown:'Down',savePrefs:'Save preferences',prefsSaved:'Preferences saved.',prefsFailed:'Preferences could not be saved now; they remain on this device.',notificationPrefs:'Alert preferences',notificationDesc:'Choose the alerts you want to follow. Critical security alerts cannot be disabled.',handoffs:'Human handoffs',appointments:'Upcoming appointments',channelIssues:'Channel issues',dailySummary:'Daily summary',feedbackTitle:'Help improve DABBIR',feedbackDesc:'Send a short note. Do not include passwords or sensitive data.',feedbackCategory:'Feedback type',general:'General note',problem:'Problem',idea:'Idea',onboarding:'Onboarding',rating:'Rating',message:'Write your feedback…',sendFeedback:'Send feedback',feedbackSent:'Thank you. Your feedback was saved.',feedbackFailed:'Feedback could not be saved now.',tourWelcome:'Welcome to DABBIR',tourWelcomeBody:'Start with readiness; it leads to the most useful next step for your workspace.',tourPriority:'Priority first',tourPriorityBody:'Today shows what needs your decision instead of overwhelming you with lists.',tourMore:'Every tool has a clear home',tourMoreBody:'Settings, connections, alerts and help live under More.',next:'Next',finish:'Start working',skip:'Skip tour',metricConversations:'Conversations',metricAppointments:'Appointments',metricCustomers:'Customers',metricAttention:'Needs you',results:'Search results',clear:'Clear'}
  };
  const t=()=>isAr()?copy.ar:copy.en;

  const style=document.createElement('style');
  style.dataset.dabbirUxFoundation='v1';
  style.textContent=[
    '.uxBusyBar{position:fixed;z-index:90;top:0;inset-inline:0;height:3px;pointer-events:none;overflow:hidden;opacity:0}.uxBusyBar.show{opacity:1}.uxBusyBar:after{content:"";display:block;width:38%;height:100%;background:linear-gradient(90deg,transparent,#d7ff5f,transparent);animation:uxProgress 1.05s linear infinite}',
    '@keyframes uxProgress{from{transform:translateX(-140%)}to{transform:translateX(360%)}}',
    '.uxNetwork{position:fixed;z-index:92;top:8px;left:50%;transform:translate(-50%,-140%);max-width:min(560px,calc(100% - 24px));padding:9px 13px;border:1px solid #725c25;border-radius:999px;background:#342b16;color:#ffe49c;font-size:10px;font-weight:850;transition:transform .18s cubic-bezier(.23,1,.32,1)}.uxNetwork.show{transform:translate(-50%,0)}.uxNetwork.online{border-color:#285d4a;background:#10261f;color:#8ce6a1}',
    '.uxSearchButton{display:inline-flex;align-items:center;gap:7px;border:1px solid #2f353c;background:#15181b;color:#dfe3e8;border-radius:12px;padding:7px 10px;min-height:38px;font-size:9px}.uxSearchButton kbd{border:1px solid #3b424a;background:#20242a;border-radius:6px;padding:2px 5px;font:inherit;color:#9da5ae}',
    '.uxOverlay{display:none;position:fixed;inset:0;z-index:110;background:#030405c7;backdrop-filter:blur(8px);padding:18px;align-items:flex-start;justify-content:center}.uxOverlay.open{display:flex}.uxDialog{width:min(620px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;margin-top:min(10vh,90px);border:1px solid #353b43;background:#121416;border-radius:22px;box-shadow:0 28px 90px #000b;color:#f7f8f9}.uxDialogHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #292e34}.uxDialogHead h2{margin:0;font-size:16px}.uxDialogHead p{margin:5px 0 0;color:#979da5;font-size:10px;line-height:1.6}.uxClose{border:1px solid #31363c;background:#191c20;color:#fff;border-radius:10px;min-width:40px;min-height:40px}.uxDialogBody{padding:14px}.uxDialogActions{display:flex;justify-content:flex-end;gap:8px;padding:0 14px 14px}.uxDialogActions button{border-radius:11px;padding:9px 13px;font-weight:850}.uxDialogPrimary{border:0;background:#536dfe;color:#fff}.uxDialogSecondary{border:1px solid #31363c;background:#191c20;color:#fff}',
    '.uxSearchInput{width:100%;min-height:52px;border:1px solid #39414a;background:#0d0f11;color:#fff;border-radius:14px;padding:12px 14px;font-size:16px}.uxSearchMeta{display:flex;justify-content:space-between;gap:8px;margin:9px 2px;color:#8f969e;font-size:9px}.uxResults{display:flex;flex-direction:column;gap:6px}.uxResult{width:100%;display:flex;align-items:center;gap:10px;border:1px solid #292f36;background:#171a1d;color:#fff;border-radius:13px;padding:11px;text-align:start}.uxResult:hover,.uxResult:focus-visible{border-color:#65772f;background:#1d2219}.uxResultIcon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#252a30}.uxResult b{display:block;font-size:11px}.uxResult small{display:block;margin-top:3px;color:#9299a2;font-size:8px}.uxNoResults{padding:24px;text-align:center;color:#9299a2;font-size:10px}',
    '.uxScreenTools{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px);gap:8px;margin:-6px 0 12px}.uxScreenTools input,.uxScreenTools select{width:100%;min-height:44px;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:9px 11px}',
    '.uxEmpty{display:grid;place-items:center;gap:7px;padding:26px 14px}.uxEmptyIcon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:#20251a;color:#d7ff5f;font-size:18px}.uxEmpty b{font-size:12px;color:#f7f8f9}.uxEmpty span{max-width:380px;line-height:1.65}.uxEmpty button{margin-top:5px;border:0;background:#d7ff5f;color:#111;border-radius:11px;padding:9px 13px;font-weight:850}',
    '.uxPrefsGrid{display:grid;gap:8px}.uxPrefRow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #292f35;background:#171a1d;border-radius:13px;padding:11px}.uxPrefRow b{font-size:10px}.uxSwitch{position:relative;width:46px;height:26px;flex:none}.uxSwitch input{position:absolute;opacity:0}.uxSwitch i{display:block;width:100%;height:100%;border-radius:999px;background:#30353b;transition:.16s}.uxSwitch i:after{content:"";display:block;width:20px;height:20px;margin:3px;border-radius:50%;background:#fff;transition:.16s}.uxSwitch input:checked+i{background:#72912c}.uxSwitch input:checked+i:after{transform:translateX(20px)}html[dir=rtl] .uxSwitch input:checked+i:after{transform:translateX(-20px)}',
    '.uxDashboardButton{border:1px solid #30363d;background:#171a1d;color:#fff;border-radius:12px;padding:8px 11px;font-size:9px;font-weight:850}.uxMetricRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;border:1px solid #292f35;border-radius:12px;padding:9px;margin-bottom:7px}.uxMetricRow button{min-height:38px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:9px;padding:6px 8px}.uxMetricRow label{display:flex;gap:7px;align-items:center;font-size:10px}',
    '.uxFeedback{margin-top:12px}.uxFeedbackForm{display:grid;gap:10px}.uxFeedbackForm select,.uxFeedbackForm textarea{width:100%;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:10px}.uxFeedbackForm textarea{min-height:110px;resize:vertical}.uxRating{display:flex;gap:5px}.uxRating button{width:42px;min-height:40px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:10px}.uxRating button.active{border-color:#7f9f35;background:#273315;color:#d7ff5f}.uxFormStatus{min-height:20px;color:#ffd87a;font-size:9px}',
    '.uxTour{position:fixed;z-index:120;inset:0;pointer-events:none}.uxTourCard{position:absolute;inset-inline:18px;bottom:18px;margin:auto;width:min(480px,calc(100% - 36px));pointer-events:auto;border:1px solid var(--ds-border,#2d3c50);background:var(--ds-surface,#0d1a2a);border-radius:16px;padding:16px;box-shadow:0 12px 32px #0005}.uxTourCard h2{margin:0;font-size:16px}.uxTourCard p{color:#a8b6c9;font-size:14px;line-height:1.7}.uxTourActions{display:flex;justify-content:space-between;gap:8px}.uxTourActions button{border-radius:11px;padding:8px 12px;font-weight:850}.uxTourTarget{position:relative;z-index:119!important;box-shadow:0 0 0 3px #8193ff,0 0 0 9999px #0005!important}',
    '.uxAnnouncer{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}',
    '@media(max-width:700px){.uxSearchButton #uxSearchButtonText,.uxSearchButton kbd{display:none}.uxSearchButton{width:44px;justify-content:center;padding:0}.uxScreenTools{grid-template-columns:1fr}.uxOverlay{padding:10px}.uxDialog{margin-top:4vh;border-radius:18px}.uxTourCard{bottom:calc(78px + env(safe-area-inset-bottom))}.uxMetricRow{grid-template-columns:minmax(0,1fr) auto auto}.uxMetricRow label{grid-column:1/-1}.uxNetwork{top:6px}}',
    '@media(prefers-reduced-motion:reduce){.uxBusyBar:after{animation:none}.uxNetwork,.uxSwitch i,.uxSwitch i:after{transition:none}}'
  ].join('');
  document.head.appendChild(style);

  function ensureBase(){
    if(!q('#uxBusyBar'))document.body.insertAdjacentHTML('afterbegin','<div id="uxBusyBar" class="uxBusyBar" aria-hidden="true"></div><div id="uxNetwork" class="uxNetwork" role="status" aria-live="polite"></div><div id="uxAnnouncer" class="uxAnnouncer" role="status" aria-live="polite"></div>');
    if(!q('#uxConfirm'))document.body.insertAdjacentHTML('beforeend','<div id="uxConfirm" class="uxOverlay" role="alertdialog" aria-modal="true" aria-labelledby="uxConfirmTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxConfirmTitle"></h2><p id="uxConfirmBody"></p></div></div><div class="uxDialogActions"><button id="uxConfirmCancel" class="uxDialogSecondary" type="button"></button><button id="uxConfirmAccept" class="uxDialogPrimary" type="button"></button></div></div></div>');
    if(!q('#uxSearch'))document.body.insertAdjacentHTML('beforeend','<div id="uxSearch" class="uxOverlay" role="dialog" aria-modal="true" aria-labelledby="uxSearchTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxSearchTitle"></h2><p id="uxSearchHint"></p></div><button id="uxSearchClose" class="uxClose" type="button" aria-label="Close">×</button></div><div class="uxDialogBody"><input id="uxSearchInput" class="uxSearchInput" type="search"><div class="uxSearchMeta"><span id="uxSearchMeta"></span><button id="uxSearchClear" class="ghost" type="button"></button></div><div id="uxSearchResults" class="uxResults"></div></div></div></div>');
    ensureSearchButton();
    applyCopy();
  }

  function announce(message){const el=q('#uxAnnouncer');if(el)el.textContent='';setTimeout(()=>{if(el)el.textContent=message||''},20)}
  function uxStartKey(){return 'dabbir_ux_started_'+String(workspace?.business?.id||'workspace')}
  function uxFirstValueKey(){return 'dabbir_ux_first_value_'+String(workspace?.business?.id||'workspace')}
  function ensureUxStart(){if(!workspace?.business?.id)return;try{if(!localStorage.getItem(uxStartKey()))localStorage.setItem(uxStartKey(),String(Date.now()))}catch{}}
  function trackUx(eventName,extra={}){
    const businessId=workspace?.business?.id;if(!businessId)return;
    const duration=Number.isInteger(extra.duration_ms)?extra.duration_ms:null;
    const context={screen:String(typeof current!=='undefined'?current:''),language:document.documentElement.lang,viewport:innerWidth+'x'+innerHeight,release:'ux-foundation-v1'};
    if(extra.item_type)context.item_type=String(extra.item_type);
    fetch('/api/ux-events',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,event_name:eventName,duration_ms:duration,context})}).catch(()=>{});
    if(['conversation_created','appointment_created'].includes(eventName)){try{if(!localStorage.getItem(uxFirstValueKey())){const started=Number(localStorage.getItem(uxStartKey())||Date.now());localStorage.setItem(uxFirstValueKey(),'done');trackUx('workspace_first_value',{duration_ms:Math.max(0,Math.min(86400000,Date.now()-started))})}}catch{}}
  }
  window.__dabbirTrackUx=trackUx;
  function setBusy(active){q('#uxBusyBar')?.classList.toggle('show',Boolean(active));q('.main')?.setAttribute('aria-busy',String(Boolean(active)));if(active)announce(t().loading)}
  function showNetwork(online){const el=q('#uxNetwork');if(!el)return;el.textContent=online?t().online:t().offline;el.classList.toggle('online',online);el.classList.add('show');if(online)setTimeout(()=>el.classList.remove('show'),2400)}
  window.addEventListener('offline',()=>showNetwork(false));
  window.addEventListener('online',()=>showNetwork(true));

  function ask(options={}){
    ensureBase();
    const modal=q('#uxConfirm');
    q('#uxConfirmTitle').textContent=options.title||t().confirmTitle;
    q('#uxConfirmBody').textContent=options.body||t().confirmBody;
    q('#uxConfirmCancel').textContent=options.cancel||t().cancel;
    q('#uxConfirmAccept').textContent=options.accept||t().confirm;
    modal.classList.add('open');
    setTimeout(()=>q('#uxConfirmAccept')?.focus(),0);
    return new Promise(resolve=>{confirmResolver=resolve});
  }
  function settleConfirm(value){q('#uxConfirm')?.classList.remove('open');const resolve=confirmResolver;confirmResolver=null;if(resolve)resolve(Boolean(value))}
  window.__dabbirConfirm=ask;

  function ensureSearchButton(){
    const actions=q('.topActions');if(!actions||q('#uxSearchButton'))return;
    const button=document.createElement('button');button.id='uxSearchButton';button.className='uxSearchButton';button.type='button';
    button.innerHTML='<span>⌕</span><span id="uxSearchButtonText"></span><kbd>/</kbd>';
    actions.insertBefore(button,actions.firstChild);button.onclick=openSearch;
  }
  function openSearch(){ensureBase();q('#uxSearch').classList.add('open');q('#uxSearchInput').value='';renderSearch('');trackUx('search_opened');setTimeout(()=>q('#uxSearchInput')?.focus(),0)}
  function closeSearch(){q('#uxSearch')?.classList.remove('open')}
  function searchItems(){
    const items=[];
    const add=(type,title,sub,screen,id)=>items.push({type,title:String(title||''),sub:String(sub||''),screen,id});
    (workspace?.conversations||[]).forEach(row=>add('chat',typeof customerName==='function'?customerName(row.customer_id):row.id,row.state,'conversations',row.id));
    (workspace?.customers||[]).forEach(row=>add('customer',row.display_name,row.lead_status,'customers',row.id));
    (workspace?.appointments||[]).forEach(row=>add('appointment',typeof customerName==='function'?customerName(row.customer_id):row.customer_id,typeof fmt==='function'?fmt(row.starts_at):row.starts_at,'appointments',row.id));
    (workspace?.handoffs||[]).forEach(row=>add('task',row.route_class,row.reason||row.state,'tasks',row.id));
    (workspace?.followups||[]).forEach(row=>add('task',isAr()?'متابعة':'Follow-up',row.reason||row.status,'tasks',row.id));
    return items;
  }
  function renderSearch(term){
    const needle=normalize(term);const items=searchItems().filter(item=>!needle||normalize(item.title+' '+item.sub).includes(needle)).slice(0,30);
    q('#uxSearchMeta').textContent=t().results+' · '+items.length;
    q('#uxSearchResults').innerHTML=items.length?items.map((item,index)=>'<button class="uxResult" type="button" data-ux-result="'+index+'"><span class="uxResultIcon">'+(item.type==='chat'?'◉':item.type==='customer'?'♙':item.type==='appointment'?'□':'✓')+'</span><span><b>'+html(item.title)+'</b><small>'+html(item.sub)+'</small></span></button>').join(''):'<div class="uxNoResults">'+html(t().noResults)+'</div>';
    qa('[data-ux-result]').forEach(button=>button.onclick=async()=>{
      const item=items[Number(button.dataset.uxResult)];if(!item)return;closeSearch();trackUx('search_result_opened',{item_type:item.type});
      if(item.type==='chat'&&item.id){selectedConversationId=item.id;if(typeof loadRuntime==='function')await loadRuntime(workspace?.business?.id,item.id)}
      if(typeof showScreen==='function')showScreen(item.screen);
    });
  }

  const FILTER_TARGETS={conversations:'#chatList .chatContact',appointments:'#appointmentsTable .tr:not(.head)',customers:'#customersTable .tr:not(.head)'};
  function statusOf(screen,node){
    if(screen==='conversations')return normalize(node.querySelector('span')?.textContent);
    const spans=node.querySelectorAll('span');return normalize(spans[spans.length-1]?.textContent);
  }
  function ensureFilters(){
    Object.entries(FILTER_TARGETS).forEach(([screen])=>{
      if(screen==='customers'&&q('#crmSearch')){q('[data-ux-tools="customers"]')?.remove();return}
      const host=q('#screen-'+screen);const hero=host?.querySelector('.hero');if(!host||!hero||host.querySelector('[data-ux-tools="'+screen+'"]'))return;
      const tools=document.createElement('div');tools.className='uxScreenTools';tools.dataset.uxTools=screen;
      tools.innerHTML='<input type="search" data-ux-query="'+screen+'"><select data-ux-status="'+screen+'"><option value=""></option></select>';
      hero.insertAdjacentElement('afterend',tools);
      const input=tools.querySelector('input');const select=tools.querySelector('select');
      input.value=localStorage.getItem('dabbir_filter_'+screen)||'';
      input.addEventListener('input',()=>{localStorage.setItem('dabbir_filter_'+screen,input.value);applyFilter(screen)});
      select.addEventListener('change',()=>applyFilter(screen));
    });
    refreshFilters();
  }
  function refreshFilters(){
    Object.entries(FILTER_TARGETS).forEach(([screen,selector])=>{
      const select=q('[data-ux-status="'+screen+'"]');const input=q('[data-ux-query="'+screen+'"]');if(!select||!input)return;
      input.placeholder=t().filterPlaceholder;const previous=select.value;
      const statuses=[...new Set(qa(selector).map(node=>statusOf(screen,node)).filter(Boolean))];
      select.innerHTML='<option value="">'+html(t().allStatuses)+'</option>'+statuses.map(value=>'<option value="'+html(value)+'">'+html(value)+'</option>').join('');
      if(statuses.includes(previous))select.value=previous;
      applyFilter(screen);
    });
  }
  function applyFilter(screen){
    const query=normalize(q('[data-ux-query="'+screen+'"]')?.value);const status=normalize(q('[data-ux-status="'+screen+'"]')?.value);const selector=FILTER_TARGETS[screen];
    qa(selector).forEach(node=>{const visible=(!query||normalize(node.textContent).includes(query))&&(!status||statusOf(screen,node)===status);node.style.display=visible?'':'none'});
  }

  function emptyModel(container){
    const id=container.id;
    if(id==='chatList'||id==='messages')return {icon:'◉',title:t().emptyChatsTitle,body:t().emptyChatsBody,action:t().startChat,run:()=>q('#newChatModal')?.classList.add('open')};
    if(id==='appointmentsTable')return {icon:'□',title:t().emptyAppointmentsTitle,body:t().emptyAppointmentsBody,action:t().addAppointment,run:()=>q('#appointmentModal')?.classList.add('open')};
    if(id==='customersTable')return {icon:'♙',title:t().emptyCustomersTitle,body:t().emptyCustomersBody,action:t().startChat,run:()=>q('#newChatModal')?.classList.add('open')};
    if(['handoffList','followupList','automationList'].includes(id))return {icon:'✓',title:t().emptyTasksTitle,body:t().emptyTasksBody,action:t().goDashboard,run:()=>showScreen('dashboard')};
    if(id==='noticeList')return {icon:'✓',title:t().emptyNoticesTitle,body:t().emptyNoticesBody,action:t().goDashboard,run:()=>showScreen('dashboard')};
    return null;
  }
  function enrichEmptyStates(){
    ['chatList','messages','appointmentsTable','customersTable','handoffList','followupList','automationList','noticeList'].forEach(id=>{
      const container=q('#'+id);const empty=container?.querySelector('.empty');const model=container&&empty?emptyModel(container):null;if(!empty||!model||empty.dataset.uxEmpty)return;
      empty.dataset.uxEmpty='true';empty.classList.add('uxEmpty');empty.innerHTML='<span class="uxEmptyIcon">'+model.icon+'</span><b>'+html(model.title)+'</b><span>'+html(model.body)+'</span><button type="button">'+html(model.action)+'</button>';
      empty.querySelector('button').onclick=model.run;
    });
  }

  function prefKey(){return 'dabbir_preferences_'+String(workspace?.business?.id||'anonymous')}
  function normalizePrefs(value){
    const notifications={...DEFAULT_NOTIFICATIONS,...(value?.notification_preferences||{})};
    const source=value?.dashboard_preferences||{};const order=[...new Set([...(Array.isArray(source.metric_order)?source.metric_order:[]),...DEFAULT_DASHBOARD.metric_order])].filter(key=>DEFAULT_DASHBOARD.metric_order.includes(key));
    const hidden=[...new Set(Array.isArray(source.hidden_metrics)?source.hidden_metrics:[])].filter(key=>DEFAULT_DASHBOARD.metric_order.includes(key));
    return {notification_preferences:notifications,dashboard_preferences:{metric_order:order,hidden_metrics:hidden}};
  }
  async function loadPreferences(){
    const id=workspace?.business?.id;if(!id||preferencesBusinessId===id)return;preferencesBusinessId=id;
    try{const local=JSON.parse(localStorage.getItem(prefKey())||'null');if(local)preferences=normalizePrefs(local)}catch{}
    applyDashboardPreferences();renderNotificationPreferences();
    try{
      const response=await fetch('/api/user-preferences?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});const body=await response.json().catch(()=>null);
      if(response.ok&&body?.ok){preferences=normalizePrefs(body);localStorage.setItem(prefKey(),JSON.stringify(preferences));applyDashboardPreferences();renderNotificationPreferences()}
    }catch{}
  }
  async function savePreferences(){
    localStorage.setItem(prefKey(),JSON.stringify(preferences));applyDashboardPreferences();renderNotificationPreferences();
    const id=workspace?.business?.id;if(!id)return;
    try{
      const response=await fetch('/api/user-preferences',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:id,...preferences})});
      if(!response.ok)throw new Error('save');trackUx('preferences_saved');if(typeof toast==='function')toast(t().prefsSaved);
    }catch{if(typeof toast==='function')toast(t().prefsFailed)}
  }
  function metricLabel(key){return {conversations:t().metricConversations,appointments:t().metricAppointments,customers:t().metricCustomers,attention:t().metricAttention}[key]||key}
  function ensureDashboardButton(){
    const hero=q('#screen-dashboard .hero');if(!hero||q('#uxDashboardButton'))return;
    const button=document.createElement('button');button.id='uxDashboardButton';button.type='button';button.className='uxDashboardButton';button.onclick=openDashboardPreferences;hero.appendChild(button);
  }
  function applyDashboardPreferences(){
    ensureDashboardButton();const host=q('#dashCards');if(!host)return;const baseKeys=DEFAULT_DASHBOARD.metric_order;
    qa('#dashCards .metric').forEach((card,index)=>{if(!card.dataset.uxMetric)card.dataset.uxMetric=baseKeys[index]||''});
    preferences.dashboard_preferences.metric_order.forEach(key=>{const card=host.querySelector('[data-ux-metric="'+key+'"]');if(card)host.appendChild(card)});
    qa('#dashCards .metric').forEach(card=>card.hidden=preferences.dashboard_preferences.hidden_metrics.includes(card.dataset.uxMetric));
  }
  function openDashboardPreferences(){
    ensureBase();let modal=q('#uxDashboardPrefs');
    if(!modal){document.body.insertAdjacentHTML('beforeend','<div id="uxDashboardPrefs" class="uxOverlay" role="dialog" aria-modal="true" aria-labelledby="uxDashboardPrefsTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxDashboardPrefsTitle"></h2><p id="uxDashboardPrefsDesc"></p></div><button class="uxClose" data-ux-close="uxDashboardPrefs" type="button">×</button></div><div id="uxMetricRows" class="uxDialogBody"></div><div class="uxDialogActions"><button id="uxDashboardSave" class="uxDialogPrimary" type="button"></button></div></div></div>');modal=q('#uxDashboardPrefs')}
    q('#uxDashboardPrefsTitle').textContent=t().customizeTitle;q('#uxDashboardPrefsDesc').textContent=t().customizeDesc;q('#uxDashboardSave').textContent=t().savePrefs;
    renderMetricRows();modal.classList.add('open');q('#uxDashboardSave').onclick=async()=>{await savePreferences();modal.classList.remove('open')};
    qa('[data-ux-close="uxDashboardPrefs"]').forEach(button=>button.onclick=()=>modal.classList.remove('open'));
  }
  function renderMetricRows(){
    const order=preferences.dashboard_preferences.metric_order;
    q('#uxMetricRows').innerHTML=order.map((key,index)=>'<div class="uxMetricRow" data-ux-metric-row="'+key+'"><label><input type="checkbox" '+(preferences.dashboard_preferences.hidden_metrics.includes(key)?'':'checked')+'> '+html(metricLabel(key))+'</label><button type="button" data-ux-up="'+key+'" '+(index===0?'disabled':'')+'>'+html(t().moveUp)+'</button><button type="button" data-ux-down="'+key+'" '+(index===order.length-1?'disabled':'')+'>'+html(t().moveDown)+'</button></div>').join('');
    qa('[data-ux-metric-row]').forEach(row=>row.querySelector('input').onchange=event=>{const key=row.dataset.uxMetricRow;const hidden=preferences.dashboard_preferences.hidden_metrics;preferences.dashboard_preferences.hidden_metrics=event.target.checked?hidden.filter(item=>item!==key):[...new Set([...hidden,key])]});
    qa('[data-ux-up]').forEach(button=>button.onclick=()=>moveMetric(button.dataset.uxUp,-1));qa('[data-ux-down]').forEach(button=>button.onclick=()=>moveMetric(button.dataset.uxDown,1));
  }
  function moveMetric(key,direction){const order=preferences.dashboard_preferences.metric_order;const index=order.indexOf(key),next=index+direction;if(index<0||next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];renderMetricRows()}

  function ensureNotificationPreferences(){
    const screen=q('#screen-notifications');if(!screen||q('#uxNotificationPreferences'))return;
    const card=document.createElement('section');card.id='uxNotificationPreferences';card.className='card';card.style.marginTop='12px';screen.appendChild(card);
  }
  function applyNotificationVisibility(){
    const host=q('#noticeList');if(!host)return;
    qa('#noticeList [data-notice-type]').forEach(item=>item.style.display=preferences.notification_preferences[item.dataset.noticeType]===false?'none':'');
    const visible=qa('#noticeList [data-notice-type]').some(item=>item.style.display!=='none');
    let empty=host.querySelector('[data-ux-filtered-empty]');
    if(!visible&&qa('#noticeList [data-notice-type]').length){if(!empty){empty=document.createElement('div');empty.className='empty uxEmpty';empty.dataset.uxFilteredEmpty='true';empty.innerHTML='<span class="uxEmptyIcon">✓</span><b>'+html(t().emptyNoticesTitle)+'</b><span>'+html(t().emptyNoticesBody)+'</span>';host.appendChild(empty)}}else empty?.remove();
  }
  function renderNotificationPreferences(){
    ensureNotificationPreferences();const card=q('#uxNotificationPreferences');if(!card)return;
    const rows=[['handoffs',t().handoffs],['appointments',t().appointments],['channel_issues',t().channelIssues],['daily_summary',t().dailySummary]];
    card.innerHTML='<div class="sectionHead"><div><h2>'+html(t().notificationPrefs)+'</h2><p class="muted">'+html(t().notificationDesc)+'</p></div></div><div class="uxPrefsGrid">'+rows.map(([key,label])=>'<div class="uxPrefRow"><b>'+html(label)+'</b><label class="uxSwitch"><input type="checkbox" data-ux-notification="'+key+'" '+(preferences.notification_preferences[key]?'checked':'')+'><i></i></label></div>').join('')+'</div>';
    qa('[data-ux-notification]').forEach(input=>input.onchange=()=>{preferences.notification_preferences[input.dataset.uxNotification]=input.checked;savePreferences()});
    applyNotificationVisibility();
  }

  function ensureFeedback(){
    const screen=q('#screen-help');if(!screen||q('#uxFeedback'))return;
    const card=document.createElement('section');card.id='uxFeedback';card.className='card uxFeedback';screen.appendChild(card);renderFeedback();
  }
  function renderFeedback(){
    const card=q('#uxFeedback');if(!card)return;
    card.innerHTML='<div class="sectionHead"><div><h2>'+html(t().feedbackTitle)+'</h2><p class="muted">'+html(t().feedbackDesc)+'</p></div></div><form id="uxFeedbackForm" class="uxFeedbackForm"><label>'+html(t().feedbackCategory)+'<select id="uxFeedbackCategory"><option value="general">'+html(t().general)+'</option><option value="problem">'+html(t().problem)+'</option><option value="idea">'+html(t().idea)+'</option><option value="onboarding">'+html(t().onboarding)+'</option></select></label><div><span class="muted">'+html(t().rating)+'</span><div id="uxRating" class="uxRating">'+[1,2,3,4,5].map(value=>'<button type="button" data-ux-rating="'+value+'" aria-label="'+value+'">'+value+'</button>').join('')+'</div></div><textarea id="uxFeedbackMessage" maxlength="2000" minlength="3" required placeholder="'+html(t().message)+'"></textarea><button id="uxFeedbackSubmit" class="primary" type="submit">'+html(t().sendFeedback)+'</button><div id="uxFeedbackStatus" class="uxFormStatus" role="status" aria-live="polite"></div></form>';
    let rating=null;qa('[data-ux-rating]').forEach(button=>button.onclick=()=>{rating=Number(button.dataset.uxRating);qa('[data-ux-rating]').forEach(item=>item.classList.toggle('active',Number(item.dataset.uxRating)===rating))});
    q('#uxFeedbackForm').onsubmit=async event=>{
      event.preventDefault();const button=q('#uxFeedbackSubmit'),status=q('#uxFeedbackStatus'),message=q('#uxFeedbackMessage').value.trim();if(message.length<3)return;
      button.disabled=true;status.textContent='';
      try{const response=await fetch('/api/feedback',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:workspace?.business?.id,category:q('#uxFeedbackCategory').value,rating,message,context:{screen:String(typeof current!=='undefined'?current:''),language:document.documentElement.lang,viewport:innerWidth+'x'+innerHeight,release:'ux-foundation-v1'}})});const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error('feedback');trackUx('feedback_submitted');status.textContent=t().feedbackSent;q('#uxFeedbackForm').reset();rating=null;qa('[data-ux-rating]').forEach(item=>item.classList.remove('active'))}catch{status.textContent=t().feedbackFailed}finally{button.disabled=false}
    };
  }

  function tourKey(){return 'dabbir_tour_v1_'+String(workspace?.business?.id||'workspace')}
  const tourSteps=()=>[{target:'#dabbirActivation',title:t().tourWelcome,body:t().tourWelcomeBody},{target:'#attentionList',title:t().tourPriority,body:t().tourPriorityBody},{target:matchMedia('(max-width:700px)').matches?'#bottomNav [data-screen="more"]':'#nav [data-screen="more"]',title:t().tourMore,body:t().tourMoreBody}];
  function startTour(){if(q('.screen.active')?.id!=='screen-dashboard'||!workspace?.business||localStorage.getItem(tourKey())==='done'||q('#uxTour'))return;tourIndex=0;trackUx('tour_started');document.body.insertAdjacentHTML('beforeend','<div id="uxTour" class="uxTour"><div class="uxTourCard"><h2 id="uxTourTitle"></h2><p id="uxTourBody"></p><div class="uxTourActions"><button id="uxTourSkip" class="uxDialogSecondary" type="button"></button><button id="uxTourNext" class="uxDialogPrimary" type="button"></button></div></div></div>');q('#uxTourSkip').onclick=finishTour;q('#uxTourNext').onclick=()=>{tourIndex++;if(tourIndex>=tourSteps().length)finishTour();else renderTour()};renderTour()}
  function renderTour(){qa('.uxTourTarget').forEach(node=>node.classList.remove('uxTourTarget'));const steps=tourSteps(),step=steps[tourIndex],target=q(step.target);if(target){target.classList.add('uxTourTarget');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}q('#uxTourTitle').textContent=step.title;q('#uxTourBody').textContent=step.body;q('#uxTourSkip').textContent=t().skip;q('#uxTourNext').textContent=tourIndex===steps.length-1?t().finish:t().next}
  function finishTour(){qa('.uxTourTarget').forEach(node=>node.classList.remove('uxTourTarget'));q('#uxTour')?.remove();localStorage.setItem(tourKey(),'done');trackUx('tour_completed')}

  function applyCopy(){
    ensureSearchButton();if(q('#uxSearchButtonText'))q('#uxSearchButtonText').textContent=t().search;if(q('#uxSearchTitle'))q('#uxSearchTitle').textContent=t().search;if(q('#uxSearchHint'))q('#uxSearchHint').textContent=t().searchHint;if(q('#uxSearchInput'))q('#uxSearchInput').placeholder=t().searchPlaceholder;if(q('#uxSearchClear'))q('#uxSearchClear').textContent=t().clear;if(q('#uxDashboardButton'))q('#uxDashboardButton').textContent=t().customize;
    ensureFilters();refreshFilters();renderNotificationPreferences();if(q('#uxFeedback'))renderFeedback();
  }
  function afterRender(){ensureUxStart();ensureBase();ensureFilters();enrichEmptyStates();applyDashboardPreferences();renderNotificationPreferences();applyNotificationVisibility();ensureFeedback();loadPreferences();setTimeout(()=>startTour(),450)}

  ensureBase();
  q('#uxConfirmCancel')?.addEventListener('click',()=>settleConfirm(false));q('#uxConfirmAccept')?.addEventListener('click',()=>settleConfirm(true));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(q('#uxSearch')?.classList.contains('open'))closeSearch();else if(q('#uxConfirm')?.classList.contains('open'))settleConfirm(false);return}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();openSearch()}});
  q('#uxSearchClose')?.addEventListener('click',closeSearch);q('#uxSearchInput')?.addEventListener('input',event=>renderSearch(event.target.value));q('#uxSearchClear')?.addEventListener('click',()=>{q('#uxSearchInput').value='';renderSearch('');q('#uxSearchInput').focus()});

  try{
    if(typeof loadRuntime==='function'){const base=loadRuntime;loadRuntime=async function(){setBusy(true);try{return await base.apply(this,arguments)}catch{trackUx('load_error_shown');if(typeof toast==='function')toast(t().loadError);return null}finally{setBusy(false)}}}
    if(typeof renderAll==='function'){const base=renderAll;renderAll=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderDashboard==='function'){const base=renderDashboard;renderDashboard=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderChats==='function'){const base=renderChats;renderChats=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderAppointments==='function'){const base=renderAppointments;renderAppointments=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderCustomers==='function'){const base=renderCustomers;renderCustomers=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderTasks==='function'){const base=renderTasks;renderTasks=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderNotices==='function'){const base=renderNotices;renderNotices=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
  }catch{}
  document.addEventListener('click',event=>{const nav=event.target.closest?.('[data-screen]');if(nav&&nav.dataset.screen!=='dashboard'&&q('#uxTour'))finishTour()});
  const observer=new MutationObserver(()=>{applyCopy();enrichEmptyStates();refreshFilters();if(q('#uxTour'))renderTour()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  afterRender();
  window.__dabbirUxFoundation={version:'ux-foundation-v1',confirm:ask,search:openSearch,refresh:afterRender,startTour:()=>{localStorage.removeItem(tourKey());startTour()}};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-activation','v3');
  return res.end(script+'\n'+uxFoundation);
}