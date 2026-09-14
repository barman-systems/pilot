// BAR-30 router authority: feature modules do not create or mutate primary destinations.
// The activity slot is reversible so switching business context cannot leave a stale target, label, or icon behind.
const script=String.raw`(()=>{
  if(window.__dabbirContextualNavigationUi)return;
  window.__dabbirContextualNavigationUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
// index.html owns workspace as a top-level lexical binding, not a window property.
  // Read that canonical binding first; keep window.workspace only as a compatibility fallback.
  function currentWorkspace(){
    try{
      if(typeof workspace!=='undefined'&&workspace)return workspace;
    }catch{}
    return window.workspace||null;
  }

  const businessType=()=>String(currentWorkspace()?.business?.business_type||'').toLowerCase();
  const isStore=()=>businessType()==='store';
  const isServiceBusiness=()=>Boolean(businessType())&&!isStore();
  const isOwner=()=>String(currentWorkspace()?.membership?.role||'').toLowerCase()==='owner';
  const hasBusiness=()=>Boolean(currentWorkspace()?.business?.id);
  const copy=()=>ar()?{
    servicesTitle:'الخدمات',
    servicesDesc:'الخدمات الفعلية التي يقدمها نشاطك. عدّلها عند الحاجة بدون زيادة القوائم الرئيسية.',
    operations:'العمليات',
    teamTitle:'الفريق والموظفون',
    teamDesc:'إدارة أعضاء الفريق والدعوات والصلاحيات من مكان واضح.',
    assistantTitle:'مساعد دبّر',
    assistantDesc:'اسأل دبّر عن نشاطك وما يحتاج انتباهك الآن.'
  }:{
    servicesTitle:'Services',
    servicesDesc:'The real services your business provides. Manage them when needed without adding another primary destination.',
    operations:'Operations',
    teamTitle:'Team & employees',
    teamDesc:'Manage team members, invitations and permissions from one clear place.',
    assistantTitle:'DABBIR Assistant',
    assistantDesc:'Ask DABBIR about your business and what needs attention now.'
  };

  function activitySlots(){
    qa('#nav [data-screen="appointments"],#bottomNav [data-screen="appointments"],#nav [data-screen="operations"],#bottomNav [data-screen="operations"],#nav [data-dabbir-activity-slot="true"],#bottomNav [data-dabbir-activity-slot="true"]').forEach(node=>{
      node.dataset.dabbirActivitySlot='true';
    });
    return qa('[data-dabbir-activity-slot="true"]');
  }

  function setActivitySlot(node,target,label){
    node.dataset.screen=target;
    node.hidden=false;
    node.classList.remove('hidden');
    node.style.removeProperty('display');
    const labelNode=node.querySelector('[data-label]');
    if(labelNode)labelNode.textContent=label;
    node.setAttribute('aria-label',label);
    const icon=node.querySelector(':scope > .d4-nav-icon');
    if(icon&&icon.dataset.routerTarget!==target){
      icon.dataset.routerTarget=target;
      icon.innerHTML=target==='operations'
        ? '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg>'
        : '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>';
    }
  }

  function adaptPrimaryActivitySlot(){
    const t=copy();
    for(const node of activitySlots()){
      if(isStore()){
        setActivitySlot(node,'operations',t.operations);
      }else{
        let appointmentLabel='';
        try{appointmentLabel=String(T()?.appointments||'').trim()}catch{}
        setActivitySlot(node,'appointments',appointmentLabel||(ar()?'المواعيد':'Appointments'));
      }
    }
    if(isStore()&&typeof current!=='undefined'&&current==='appointments'&&typeof showScreen==='function')showScreen('operations');
  }

  function openServices(){
    if(typeof showScreen==='function')showScreen('operations');
    setTimeout(()=>window.__dabbirServiceOperations?.refresh?.(),0);
  }

  function openTeam(){window.location.assign('/team.html')}

  function openAssistant(){
    if(typeof showScreen==='function')showScreen('dashboard');
    setTimeout(()=>{
      const command=q('#doCommandInput');
      if(command&&command.getClientRects().length){
        q('#dabbirOperatorSummary')?.scrollIntoView({behavior:'auto',block:'start'});
        command.focus({preventScroll:true});return;
      }
      const card=q('#dabbirOwnerCopilot');
      if(card&&card.getClientRects().length){
        window.__dabbirOwnerCopilot?.refresh?.();
        card.scrollIntoView({behavior:'auto',block:'start'});
        card.querySelector('input,textarea')?.focus({preventScroll:true});
      }
    },60);
  }

  function whatsAppLabel(){
    try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}
  }
  function navigationNotice(message){try{if(typeof toast==='function')toast(message)}catch{}}
  function openWhatsAppSettings(expectedBusinessId){
    if(!expectedBusinessId||String(currentWorkspace()?.business?.id||'')!==expectedBusinessId){
      navigationNotice(ar()?'تغيّر النشاط. افتح تنبيهات النشاط الحالي وحاول مجددًا.':'The business changed. Open its current notifications and try again.');
      return;
    }
    if(typeof showScreen!=='function')return;
    showScreen('integrations');
    setTimeout(()=>{
      if(String(currentWorkspace()?.business?.id||'')!==expectedBusinessId||!q('#screen-integrations.active'))return;
      const wanted=whatsAppLabel();
      const card=qa('#integrationGrid .integration').find(node=>String(node.querySelector('h3')?.textContent||'').trim()===wanted);
      if(!card||!card.getClientRects().length){
        navigationNotice(ar()?'تعذر عرض إعداد واتساب. حدّث الصفحة وحاول مجددًا.':'WhatsApp settings could not be shown. Refresh the page and try again.');
        return;
      }
      card.scrollIntoView({behavior:'auto',block:'start'});
      const heading=card.querySelector('h3');
      heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    },0);
  }
  let observedNoticeList=null;
  let noticeListObserver=null;
  function ensureWhatsAppNoticeAction(){
    const host=q('#noticeList');
    // The calendar refresh also replaces notice rows outside renderAll. Observe only
    // direct row replacement; inserting a button inside a row cannot trigger a loop.
    if(host!==observedNoticeList){
      noticeListObserver?.disconnect();
      noticeListObserver=null;
      observedNoticeList=host;
      if(host&&typeof MutationObserver==='function'){
        noticeListObserver=new MutationObserver(ensureWhatsAppNoticeAction);
        noticeListObserver.observe(host,{childList:true});
      }
    }
    const businessId=String(currentWorkspace()?.business?.id||'');
    for(const row of qa('#noticeList [data-notice-type="channel_issues"]')){
      let button=row.querySelector('[data-dabbir-whatsapp-notice-action]');
      if(!businessId||String(row.querySelector('b')?.textContent||'').trim()!==whatsAppLabel()){
        button?.remove();continue;
      }
      if(!button){
        button=document.createElement('button');button.type='button';button.className='secondary';
        button.dataset.dabbirWhatsappNoticeAction='true';
        button.classList.add('contextualServiceAction');
        button.addEventListener('click',()=>openWhatsAppSettings(button.dataset.businessId));
        (row.querySelector('.grow')||row).append(button);
      }
      button.dataset.businessId=businessId;
      button.textContent=ar()?'إعداد واتساب':'WhatsApp settings';
    }
  }

  function ensureMoreCard(){
    const grid=q('#screen-more .moreGrid');
    let card=q('#dabbirContextServices');
    if(!isServiceBusiness()){card?.remove();return}
    if(!grid)return;
    const t=copy();
    if(!card){card=document.createElement('button');card.type='button';card.id='dabbirContextServices';card.className='moreCard';card.addEventListener('click',openServices);grid.prepend(card)}
    card.innerHTML='<h3>'+t.servicesTitle+'</h3><p>'+t.servicesDesc+'</p>';
  }

  function ensureUtilityCards(){
    const grid=q('#screen-more .moreGrid');
    if(!grid||!hasBusiness())return;
    const t=copy();
    let team=q('#dabbirTeamAccess');
    if(!team){team=document.createElement('button');team.type='button';team.id='dabbirTeamAccess';team.className='moreCard';team.addEventListener('click',openTeam);grid.append(team)}
    team.innerHTML='<h3>'+t.teamTitle+'</h3><p>'+t.teamDesc+'</p>';
    const sideTeam=q('#teamLink');
    if(sideTeam){sideTeam.hidden=false;sideTeam.classList.remove('hidden');sideTeam.style.removeProperty('display');sideTeam.textContent=t.teamTitle;sideTeam.setAttribute('aria-label',t.teamTitle)}
    let assistant=q('#dabbirAssistantAccess');
    if(!isOwner()){assistant?.remove();return}
    if(!assistant){assistant=document.createElement('button');assistant.type='button';assistant.id='dabbirAssistantAccess';assistant.className='moreCard';assistant.addEventListener('click',openAssistant);grid.prepend(assistant)}
    assistant.innerHTML='<h3>'+t.assistantTitle+'</h3><p>'+t.assistantDesc+'</p>';
  }

  let mobileMenuSide=null;
  let mobileMenuObserver=null;
  function syncMobileMenuAccessibility(){
    const menu=q('#menuBtn'),side=q('#side');
    if(!menu)return;
    const expanded=Boolean(side?.classList.contains('open')&&!side.hidden&&!side.classList.contains('hidden'));
    menu.setAttribute('aria-label',ar()?'القائمة الرئيسية':'Main navigation');
    menu.setAttribute('aria-controls','side');
    menu.setAttribute('aria-expanded',expanded?'true':'false');
  }
  function bindMobileMenuResync(){
    const menu=q('#menuBtn');
    const side=q('#side');
    syncMobileMenuAccessibility();
    // Observe only this panel's visibility attributes so every close path updates the control.
    if(side!==mobileMenuSide){
      mobileMenuObserver?.disconnect();
      mobileMenuObserver=null;
      mobileMenuSide=side;
      if(side&&typeof MutationObserver==='function'){
        mobileMenuObserver=new MutationObserver(syncMobileMenuAccessibility);
        mobileMenuObserver.observe(side,{attributes:true,attributeFilter:['class','hidden']});
      }
    }
    if(!menu||menu.dataset.dabbirContextRouterBound==='true')return;
    menu.dataset.dabbirContextRouterBound='true';
    menu.addEventListener('click',()=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(enforce);
      else setTimeout(enforce,0);
    });
  }

  function settingsActive(){return !!q('#screen-settings.active')}
  function ensureSettingsHeaderLogo(){
    if(!settingsActive())return;
    const top=q('.top');if(!top||typeof document.createElement!=='function')return;
    let logo=top.querySelector('.dsa-header-logo');
    if(!logo){logo=document.createElement('img');logo.className='dsa-header-logo';logo.src='/dabbir-app-icon.png';logo.alt='DABBIR';logo.decoding='async';top.append(logo)}
  }
  function toggleSettingsLanguage(){
    const buttons=qa('.top .lang button');
    const target=buttons.find(button=>!button.classList.contains('on'));
    if(target){target.click();return}
    try{if(typeof setLanguage==='function')setLanguage(ar()?'en':'ar');else if(typeof applyLang==='function')applyLang(ar()?'en':'ar')}catch{}
  }
  function parseClock(value){const match=String(value||'').match(/^(\d{2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):NaN}
  function businessTimeZone(){
    return String(currentWorkspace()?.business?.timezone||document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  }
  function currentBusinessClock(){
    try{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:businessTimeZone(),weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
      return {day:parts.weekday,minute:Number(parts.hour)*60+Number(parts.minute)};
    }catch{return null}
  }
  function businessOpenNow(){
    const now=currentBusinessClock();if(!now)return false;
    const raw=String(q('#dk-business_hours')?.value||currentWorkspace()?.business?.business_hours||'');
    const line=raw.split(';').map(value=>value.trim()).find(value=>value.startsWith(now.day+' '));
    const match=line?.match(/^[A-Za-z]+\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);if(!match)return false;
    const start=parseClock(match[1]),end=parseClock(match[2]);if(!Number.isFinite(start)||!Number.isFinite(end))return false;
    return end>=start?(now.minute>=start&&now.minute<end):(now.minute>=start||now.minute<end);
  }
  function ensureSettingsToolbar(){
    if(!settingsActive()||typeof document.createElement!=='function')return;
    const screen=q('#screen-settings');const card=screen?.querySelector('.dabbir-knowledge-card');if(!screen||!card)return;
    let toolbar=screen.querySelector('.dsa-settings-toolbar');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.className='dsa-settings-toolbar';
      toolbar.innerHTML='<button type="button" class="dsa-language-control" aria-label="Language"><span class="dsa-globe">◎</span><span class="dsa-language-label"></span><span class="dsa-chevron">⌄</span></button><div class="dsa-open-state"><span class="dsa-state-dot"></span><span><small class="dsa-state-caption"></small><b class="dsa-state-label"></b></span></div>';
      toolbar.querySelector('.dsa-language-control')?.addEventListener('click',()=>{toggleSettingsLanguage();setTimeout(syncApprovedSettings,60)});
      card.before(toolbar);
    }
    const open=businessOpenNow();
    toolbar.querySelector('.dsa-language-label').textContent=ar()?'العربية':'English';
    toolbar.querySelector('.dsa-state-caption').textContent=ar()?'حالة النشاط':'Business status';
    toolbar.querySelector('.dsa-state-label').textContent=ar()?(open?'مفتوح الآن':'مغلق الآن'):(open?'Open now':'Closed now');
    toolbar.querySelector('.dsa-open-state').classList.toggle('is-open',open);
  }
  function syncApprovedSettings(){
    const on=settingsActive();
    document.body?.classList?.toggle('dabbir-settings-approved',on);
    if(!on)return;
    ensureSettingsHeaderLogo();ensureSettingsToolbar();
  }
  function bindApprovedSettings(){
    if(!document.addEventListener||document.documentElement?.dataset?.dabbirApprovedSettingsBound==='true')return;
    if(document.documentElement?.dataset)document.documentElement.dataset.dabbirApprovedSettingsBound='true';
    document.addEventListener('change',event=>{if(event.target?.matches?.('[id^="dk-day-"],[id^="dk-start-"],[id^="dk-end-"]'))setTimeout(syncApprovedSettings,0)},true);
    document.addEventListener('click',event=>{if(event.target?.closest?.('[data-screen="settings"],#menuBtn,.navBtn,#bottomNav button,#bottomNav a,.dsa-language-control'))setTimeout(syncApprovedSettings,0)},true);
  }

  function enforce(){
    adaptPrimaryActivitySlot();
    ensureMoreCard();
    ensureUtilityCards();
    ensureWhatsAppNoticeAction();
    bindMobileMenuResync();
    bindApprovedSettings();
    syncApprovedSettings();
  }

  function queueEnforce(){setTimeout(enforce,0)}
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','contextual-navigation',queueEnforce);
    lifecycle.on('afterNavigate','contextual-navigation',queueEnforce);
    lifecycle.on('afterLanguage','contextual-navigation',queueEnforce);
  }

  setTimeout(enforce,0);
  setTimeout(enforce,650);
  setTimeout(enforce,1600);
  window.__dabbirContextualNavigation={refresh:enforce,version:'v7',authority:'primary-context-router',workspace_source:'global-lexical-first',mobile_menu_resync:true,team_access:'more-and-sidebar',owner_assistant_access:'more',approved_settings_ui:true,lifecycle_driven:true,business_timezone_status:true};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-contextual-navigation','v7');
  return res.status(200).send(script);
}
