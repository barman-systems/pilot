// BAR-30 router authority: feature modules do not create or mutate primary destinations.
const script=String.raw`(()=>{
  if(window.__dabbirContextualNavigationUi)return;
  window.__dabbirContextualNavigationUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(window.workspace?.business?.business_type||'').toLowerCase();
  const isStore=()=>businessType()==='store';
  const isServiceBusiness=()=>Boolean(businessType())&&!isStore();
  const copy=()=>ar()?{
    servicesTitle:'الخدمات',
    servicesDesc:'الخدمات الفعلية التي يقدمها نشاطك. عدّلها عند الحاجة بدون زيادة القوائم الرئيسية.',
    operations:'العمليات'
  }:{
    servicesTitle:'Services',
    servicesDesc:'The real services your business provides. Manage them when needed without adding another primary destination.',
    operations:'Operations'
  };

  function activitySlots(){
    qa('#nav [data-screen="appointments"],#bottomNav [data-screen="appointments"],#nav [data-dabbir-activity-slot="true"],#bottomNav [data-dabbir-activity-slot="true"]').forEach(node=>{
      node.dataset.dabbirActivitySlot='true';
    });
    return qa('[data-dabbir-activity-slot="true"]');
  }

  function setActivitySlot(node,target,label){
    node.dataset.screen=target;
    node.style.display='';
    const labelNode=node.querySelector('[data-label]');
    if(labelNode)labelNode.textContent=label;
    node.setAttribute('aria-label',label);
    const icon=node.querySelector(':scope > .d4-nav-icon');
    if(icon&&icon.dataset.routerTarget!==target){
      icon.dataset.routerTarget=target;
      if(target==='operations'){
        icon.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg>';
      }
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
        const icon=node.querySelector(':scope > .d4-nav-icon');
        if(icon&&icon.dataset.routerTarget==='operations'){
          icon.dataset.routerTarget='appointments';
          icon.innerHTML='<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>';
        }
      }
    }
    if(isStore()&&current==='appointments'&&typeof showScreen==='function')showScreen('operations');
  }

  function openServices(){
    if(typeof showScreen==='function')showScreen('operations');
    setTimeout(()=>window.__dabbirServiceOperations?.refresh?.(),0);
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

  function enforce(){
    adaptPrimaryActivitySlot();
    ensureMoreCard();
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
  window.__dabbirContextualNavigation={refresh:enforce,version:'v3',authority:'primary-context-router'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-contextual-navigation','v3');
  return res.status(200).send(script);
}
