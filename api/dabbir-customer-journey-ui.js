const script = String.raw`(()=>{
  if(window.__dabbirCustomerJourneyV1) return;
  window.__dabbirCustomerJourneyV1=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const copy=()=>ar()?{
    today:'اليوم',conversations:'المحادثات',appointments:'المواعيد',customers:'العملاء',needsYou:'تحتاجك',settings:'الإعدادات',more:'المزيد',advanced:'أدوات إضافية',
    dashTitle:'ملخص نشاطك',dashDesc:'كل ما يهمك الآن في مكان واحد، بدون تفاصيل تقنية.',runtime:'دبّر يعمل',aiTitle:'ما الذي يديره دبّر؟',aiSafe:'دبّر يتولى الأعمال تلقائيًا ضمن الصلاحيات المتاحة، ويطلب تدخلك فقط عند الحاجة.',
    quickTitle:'إجراءات سريعة',quickDesc:'الأكثر استخدامًا بدون البحث داخل القوائم.',newChat:'محادثة جديدة',newAppointment:'موعد جديد',openCustomers:'عرض العملاء',connectWhatsApp:'ربط WhatsApp',
    onboardingTitle:'جهّز نشاطك في خطوة واحدة',onboardingDesc:'اكتب اسم النشاط واختر نوعه فقط. دبّر يجهّز مساحة العمل والباقي يمكنك ضبطه لاحقًا.',setupHint:'لن نطلب منك إعدادات طويلة الآن.',
    authTitle:'أهلًا بك في دبّر',authDesc:'ادخل إلى نشاطك ودع دبّر يرتّب ما يحتاج انتباهك.',
    toolsTitle:'كل الأدوات في مكان واحد',toolsDesc:'استخدم هذه الخيارات عند الحاجة فقط. عملك اليومي يبقى في الصفحات الرئيسية.',analytics:'التقارير',automations:'الأتمتة',integrations:'الربط والقنوات',notifications:'التنبيهات',help:'المساعدة',team:'الفريق',
    noChat:'لا توجد محادثات بعد.',startChat:'ابدأ أول محادثة',noAppointments:'لا توجد مواعيد بعد.',addAppointment:'أضف أول موعد',noCustomers:'سيظهر العملاء هنا تلقائيًا عند بدء المحادثات أو إنشاء المواعيد.',allClear:'لا يوجد شيء يحتاج تدخلك الآن.',
    settingsDesc:'حسابك، ربط القنوات، والأدوات التي لا تحتاجها كل يوم.'
  }:{
    today:'Today',conversations:'Conversations',appointments:'Appointments',customers:'Customers',needsYou:'Needs you',settings:'Settings',more:'More',advanced:'More tools',
    dashTitle:'Business summary',dashDesc:'Everything that matters now, without technical clutter.',runtime:'DABBIR online',aiTitle:'What DABBIR handles',aiSafe:'DABBIR handles routine work within available permissions and asks for you only when needed.',
    quickTitle:'Quick actions',quickDesc:'Common actions without hunting through menus.',newChat:'New conversation',newAppointment:'New appointment',openCustomers:'View customers',connectWhatsApp:'Connect WhatsApp',
    onboardingTitle:'Set up your business in one step',onboardingDesc:'Enter the business name and type only. DABBIR prepares the workspace and you can adjust the rest later.',setupHint:'No long setup form required.',
    authTitle:'Welcome to DABBIR',authDesc:'Open your business and let DABBIR surface what needs your attention.',
    toolsTitle:'All tools in one place',toolsDesc:'Use these only when needed. Daily work stays in the primary pages.',analytics:'Reports',automations:'Automations',integrations:'Channels & connections',notifications:'Notifications',help:'Help',team:'Team',
    noChat:'No conversations yet.',startChat:'Start first conversation',noAppointments:'No appointments yet.',addAppointment:'Add first appointment',noCustomers:'Customers appear here automatically when conversations or appointments are created.',allClear:'Nothing needs your attention right now.',
    settingsDesc:'Your account, channel connections, and tools you do not need every day.'
  };

  const style=document.createElement('style');
  style.dataset.dabbirCustomerJourney='v1';
  style.textContent=[
    '.journeyAdvanced{margin-top:5px;border-top:1px solid var(--d4-line,#ffffff18);padding-top:7px}',
    '.journeyAdvanced>summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border-radius:13px;color:#8fa0b4;font-size:10px;font-weight:850}',
    '.journeyAdvanced>summary::-webkit-details-marker{display:none}.journeyAdvanced>summary:after{content:"⌄";font-size:13px}.journeyAdvanced[open]>summary:after{content:"⌃"}',
    '.journeyAdvanced>summary:hover{background:#ffffff07;color:white}.journeyAdvanced .navBtn{width:100%}',
    '.journeyQuick{margin:0 0 12px;padding:14px 15px;border:1px solid var(--d4-line,#ffffff18);border-radius:18px;background:linear-gradient(135deg,#8b5cf616,#2563eb12);box-shadow:0 14px 38px #00000028}',
    '.journeyQuickHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:11px}.journeyQuickHead b{font-size:13px}.journeyQuickHead span{display:block;color:#93a4ba;font-size:9px;margin-top:3px}',
    '.journeyQuickActions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.journeyQuickActions button{min-height:46px;border-radius:13px;font-size:10px}',
    '.journeyTools{margin-top:10px;padding:14px;border:1px solid var(--d4-line,#ffffff18);border-radius:17px;background:#ffffff05}.journeyTools h3{font-size:13px;margin:0}.journeyTools p{font-size:9px;color:#93a4ba;line-height:1.6;margin:5px 0 11px}',
    '.journeyToolGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.journeyToolGrid button{min-height:46px;text-align:start}',
    '.journeySetupHint{margin:11px 0 -4px;padding:9px 11px;border-radius:12px;background:#ffffff06;border:1px solid #ffffff12;color:#9fb0c4;font-size:9px;line-height:1.55}',
    '.journeyEmptyAction{margin-top:10px;min-height:40px!important;padding:7px 10px!important;font-size:9px!important}',
    '.sideFoot{display:none!important}',
    '@media(max-width:700px){.journeyQuick{padding:12px}.journeyQuickHead span{display:none}.journeyQuickActions{grid-template-columns:repeat(2,minmax(0,1fr))}.journeyToolGrid{grid-template-columns:1fr}.journeyAdvanced{margin-top:3px}.journeyAdvanced>summary{min-height:46px}}'
  ].join('');
  document.head.appendChild(style);

  function screen(name){if(typeof showScreen==='function')showScreen(name)}
  function click(sel){const el=q(sel);if(el)el.click()}
  function currentWorkspace(){try{return typeof workspace!=='undefined'?workspace:null}catch{return null}}

  function simplifyNavigation(){
    const t=copy();
    const labels={dashboard:t.today,conversations:t.conversations,appointments:t.appointments,customers:t.customers,tasks:t.needsYou,settings:t.settings};
    Object.entries(labels).forEach(([name,text])=>{const node=q('#nav [data-screen="'+name+'"] [data-label]');if(node)node.textContent=text;});
    const bottomLabels={dashboard:t.today,conversations:t.conversations,appointments:t.appointments,tasks:t.needsYou,settings:t.more};
    Object.entries(bottomLabels).forEach(([name,text])=>{const node=q('#bottomNav [data-screen="'+name+'"] [data-label]');if(node)node.textContent=text;});
    const nav=q('#nav');if(!nav)return;
    let details=q('#journeyAdvancedNav');
    if(!details){
      details=document.createElement('details');details.id='journeyAdvancedNav';details.className='journeyAdvanced';
      const summary=document.createElement('summary');summary.dataset.journeySummary='true';
      const box=document.createElement('div');box.className='journeyAdvancedItems';
      details.append(summary,box);nav.append(details);
      ['automations','analytics','integrations','notifications','help'].forEach(name=>{const btn=q('#nav [data-screen="'+name+'"]');if(btn)box.append(btn)});
    }
    const summary=details.querySelector('[data-journey-summary]');if(summary)summary.textContent=t.advanced;
  }

  function tuneCoreCopy(){
    const t=copy();
    if(q('#dashTitle'))q('#dashTitle').textContent=t.dashTitle;
    if(q('#dashDesc'))q('#dashDesc').textContent=t.dashDesc;
    if(q('#runtimeChip'))q('#runtimeChip').textContent=t.runtime;
    if(q('#aiTitle'))q('#aiTitle').textContent=t.aiTitle;
    const aiTruth=q('#aiStatus .truth');if(aiTruth)aiTruth.textContent=t.aiSafe;
    if(q('#settingsDesc'))q('#settingsDesc').textContent=t.settingsDesc;
    if(q('#setupTitle'))q('#setupTitle').textContent=t.onboardingTitle;
    if(q('#setupDesc'))q('#setupDesc').textContent=t.onboardingDesc;
    if(q('#authTitle'))q('#authTitle').textContent=t.authTitle;
    if(q('#authDesc'))q('#authDesc').textContent=t.authDesc;
    const form=q('#businessForm');
    if(form&&!q('#journeySetupHint')){const hint=document.createElement('div');hint.id='journeySetupHint';hint.className='journeySetupHint';form.insertBefore(hint,q('#setupSubmit'));}
    if(q('#journeySetupHint'))q('#journeySetupHint').textContent=t.setupHint;
  }

  function ensureQuickActions(){
    const t=copy(),cards=q('#dashCards');if(!cards)return;
    let panel=q('#journeyQuick');
    if(!panel){panel=document.createElement('section');panel.id='journeyQuick';panel.className='journeyQuick';cards.parentNode.insertBefore(panel,cards);}
    panel.innerHTML='<div class="journeyQuickHead"><div><b>'+t.quickTitle+'</b><span>'+t.quickDesc+'</span></div></div><div class="journeyQuickActions"></div>';
    const actions=panel.querySelector('.journeyQuickActions');
    const add=(label,kind,fn)=>{const b=document.createElement('button');b.type='button';b.className=kind;b.textContent=label;b.onclick=fn;actions.append(b)};
    add(t.newChat,'primary',()=>click('#newChatBtn'));
    add(t.newAppointment,'secondary',()=>click('#newApptBtn'));
    add(t.openCustomers,'secondary',()=>screen('customers'));
    const w=currentWorkspace();if(String(w?.whatsapp?.state||'').toUpperCase()!=='OPERATIONAL')add(t.connectWhatsApp,'secondary',()=>screen('integrations'));
  }

  function ensureSettingsHub(){
    const t=copy(),card=q('#screen-settings .card');if(!card)return;
    let hub=q('#journeyTools');if(!hub){hub=document.createElement('section');hub.id='journeyTools';hub.className='journeyTools';const logout=q('#logoutBtn');card.insertBefore(hub,logout||null)}
    hub.innerHTML='<h3>'+t.toolsTitle+'</h3><p>'+t.toolsDesc+'</p><div class="journeyToolGrid"></div>';
    const grid=hub.querySelector('.journeyToolGrid');
    const add=(label,target,href)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.onclick=()=>href?location.assign(href):screen(target);grid.append(b)};
    add(t.customers,'customers');add(t.analytics,'analytics');add(t.integrations,'integrations');add(t.automations,'automations');add(t.notifications,'notifications');add(t.help,'help');add(t.team,null,'/team.html');
  }

  function improveEmptyStates(){
    const t=copy();
    const chat=q('#chatList .empty');if(chat){chat.textContent=t.noChat;const b=document.createElement('button');b.type='button';b.className='secondary journeyEmptyAction';b.textContent=t.startChat;b.onclick=()=>click('#newChatBtn');chat.append(document.createElement('br'),b)}
    const appt=q('#appointmentsTable .empty');if(appt){appt.textContent=t.noAppointments;const b=document.createElement('button');b.type='button';b.className='secondary journeyEmptyAction';b.textContent=t.addAppointment;b.onclick=()=>click('#newApptBtn');appt.append(document.createElement('br'),b)}
    const cust=q('#customersTable .empty');if(cust)cust.textContent=t.noCustomers;
    qa('#handoffList .empty,#followupList .empty').forEach(el=>el.textContent=t.allClear);
  }

  let frame=0;
  function polish(){simplifyNavigation();tuneCoreCopy();ensureQuickActions();ensureSettingsHub();improveEmptyStates();document.body?.setAttribute('data-customer-journey','simplified-v1')}
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;polish()})}

  if(typeof renderAll==='function'&&!window.__dabbirJourneyRenderWrapped){window.__dabbirJourneyRenderWrapped=true;const base=renderAll;renderAll=function(){const out=base.apply(this,arguments);schedule();return out}}
  if(typeof applyLang==='function'&&!window.__dabbirJourneyLangWrapped){window.__dabbirJourneyLangWrapped=true;const base=applyLang;applyLang=function(){const out=base.apply(this,arguments);schedule();return out}}
  setTimeout(schedule,0);setTimeout(schedule,300);
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-journey','simplified-v1');
  return res.status(200).send(script);
}
