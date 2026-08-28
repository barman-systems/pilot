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

  function openTeam(){
    window.location.assign('/team.html');
  }

  function openAssistant(){
    if(typeof showScreen==='function')showScreen('dashboard');
    setTimeout(()=>{
      window.__dabbirOwnerCopilot?.refresh?.();
      const card=q('#dabbirOwnerCopilot');
      if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
    },60);
  }

  function ensureMoreCard(){
    const grid=q('#screen-more .moreGrid');
    let card=q('#dabbirContextServices');
    if(!isServiceBusiness()){
      card?.remove();
      return;
    }
    if(!grid)return;
    const t=copy();
    if(!card){
      card=document.createElement('button');
      card.type='button';
      card.id='dabbirContextServices';
      card.className='moreCard';
      card.addEventListener('click',openServices);
      grid.prepend(card);
    }
    card.innerHTML='<h3>'+t.servicesTitle+'</h3><p>'+t.servicesDesc+'</p>';
  }

  function ensureUtilityCards(){
    const grid=q('#screen-more .moreGrid');
    if(!grid||!hasBusiness())return;
    const t=copy();

    let team=q('#dabbirTeamAccess');
    if(!team){
      team=document.createElement('button');
      team.type='button';
      team.id='dabbirTeamAccess';
      team.className='moreCard';
      team.addEventListener('click',openTeam);
      grid.append(team);
    }
    team.innerHTML='<h3>'+t.teamTitle+'</h3><p>'+t.teamDesc+'</p>';

    const sideTeam=q('#teamLink');
    if(sideTeam){
      sideTeam.hidden=false;
      sideTeam.classList.remove('hidden');
      sideTeam.style.removeProperty('display');
      sideTeam.textContent=t.teamTitle;
      sideTeam.setAttribute('aria-label',t.teamTitle);
    }

    let assistant=q('#dabbirAssistantAccess');
    if(!isOwner()){
      assistant?.remove();
      return;
    }
    if(!assistant){
      assistant=document.createElement('button');
      assistant.type='button';
      assistant.id='dabbirAssistantAccess';
      assistant.className='moreCard';
      assistant.addEventListener('click',openAssistant);
      grid.prepend(assistant);
    }
    assistant.innerHTML='<h3>'+t.assistantTitle+'</h3><p>'+t.assistantDesc+'</p>';
  }

  function bindMobileMenuResync(){
    const menu=q('#menuBtn');
    if(!menu||menu.dataset.dabbirContextRouterBound==='true')return;
    menu.dataset.dabbirContextRouterBound='true';
    menu.addEventListener('click',()=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(enforce);
      else setTimeout(enforce,0);
    });
  }

  function enforce(){
    adaptPrimaryActivitySlot();
    ensureMoreCard();
    ensureUtilityCards();
    bindMobileMenuResync();
  }

  try{
    const baseRenderAll=renderAll;
    renderAll=function(){const result=baseRenderAll.apply(this,arguments);setTimeout(enforce,0);return result};
  }catch{}

  try{
    const baseApplyLang=applyLang;
    applyLang=function(){const result=baseApplyLang.apply(this,arguments);setTimeout(enforce,0);return result};
  }catch{}

  setTimeout(enforce,0);
  setTimeout(enforce,650);
  setTimeout(enforce,1600);
  window.__dabbirContextualNavigation={refresh:enforce,version:'v6',authority:'primary-context-router',workspace_source:'global-lexical-first',mobile_menu_resync:true,team_access:'more-and-sidebar',owner_assistant_access:'more'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-contextual-navigation','v6');
  return res.status(200).send(script);
}
