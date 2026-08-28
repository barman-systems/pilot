const script=String.raw`(()=>{
  if(window.__dabbirContextualNavigationUi)return;
  window.__dabbirContextualNavigationUi=true;

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(window.workspace?.business?.business_type||'').toLowerCase();
  const isServiceBusiness=()=>Boolean(businessType())&&businessType()!=='store';
  const copy=()=>ar()?{
    title:'الخدمات',
    desc:'الخدمات الفعلية التي يقدمها نشاطك. عدّلها عند الحاجة بدون زيادة القوائم الرئيسية.'
  }:{
    title:'Services',
    desc:'The real services your business provides. Manage them when needed without adding another primary destination.'
  };

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
    card.innerHTML='<h3>'+t.title+'</h3><p>'+t.desc+'</p>';
  }

  function enforce(){
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
  window.__dabbirContextualNavigation={refresh:enforce,version:'v2'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-contextual-navigation','v2');
  return res.status(200).send(script);
}
