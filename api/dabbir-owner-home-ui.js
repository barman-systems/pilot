const css=String.raw`
.dabbir-owner-details{margin-top:10px}
.dabbir-owner-details-toggle{width:100%;min-height:42px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #2b3242;background:rgba(18,22,30,.72);color:#aeb8c7;border-radius:13px;font-size:10px;font-weight:850}
.dabbir-owner-details-toggle:hover{border-color:#3a465d;background:#171c25;color:#eef2f8}
.dabbir-owner-details-toggle .chev{font-size:11px;transition:transform .16s ease}
.dabbir-owner-details-toggle[aria-expanded="true"] .chev{transform:rotate(180deg)}
.dabbir-owner-details-body{margin-top:10px}
.dabbir-owner-details-body[hidden]{display:none!important}
@media(max-width:700px){.dabbir-owner-details{margin-top:8px}.dabbir-owner-details-toggle{min-height:44px;border-radius:14px;font-size:10px}.dabbir-owner-details-body{margin-top:8px}}
@media(prefers-reduced-motion:reduce){.dabbir-owner-details-toggle .chev{transition:none}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirOwnerHomeLoaded)return;
  window.__dabbirOwnerHomeLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirOwnerHome='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.appendChild(style);

  let expanded=false;

  const isArabic=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const labels=()=>isArabic()?{
    show:'عرض تفاصيل النشاط',hide:'إخفاء تفاصيل النشاط',aria:'تفاصيل مؤشرات النشاط'
  }:{
    show:'Show business details',hide:'Hide business details',aria:'Business activity details'
  };

  function sync(){
    const wrap=document.querySelector('#dabbirOwnerDetails');
    if(!wrap)return;
    const button=wrap.querySelector('#dabbirOwnerDetailsToggle');
    const body=wrap.querySelector('#dabbirOwnerDetailsBody');
    if(!button||!body)return;
    const t=labels();
    button.setAttribute('aria-expanded',expanded?'true':'false');
    button.setAttribute('aria-controls','dabbirOwnerDetailsBody');
    button.setAttribute('aria-label',t.aria);
    button.querySelector('.label').textContent=expanded?t.hide:t.show;
    body.hidden=!expanded;
  }

  function install(){
    const dash=document.querySelector('#screen-dashboard');
    const cards=document.querySelector('#dashCards');
    if(!dash||!cards)return;
    const grid=dash.querySelector('.grid2');
    if(!grid)return;

    let wrap=document.querySelector('#dabbirOwnerDetails');
    if(!wrap){
      wrap=document.createElement('section');
      wrap.id='dabbirOwnerDetails';
      wrap.className='dabbir-owner-details';
      const button=document.createElement('button');
      button.id='dabbirOwnerDetailsToggle';
      button.type='button';
      button.className='dabbir-owner-details-toggle';
      button.innerHTML='<span class="label"></span><span class="chev" aria-hidden="true">⌄</span>';
      const body=document.createElement('div');
      body.id='dabbirOwnerDetailsBody';
      body.className='dabbir-owner-details-body';
      cards.parentNode.insertBefore(wrap,cards);
      wrap.append(button,body);
      body.append(cards,grid);
      button.addEventListener('click',()=>{expanded=!expanded;sync()});
    }else{
      const body=wrap.querySelector('#dabbirOwnerDetailsBody');
      if(body){
        if(cards.parentNode!==body)body.append(cards);
        if(grid.parentNode!==body)body.append(grid);
      }
    }

    const body=wrap.querySelector('#dabbirOwnerDetailsBody');
    const actionCenter=document.querySelector('#dabbirActionCenter');
    if(body&&actionCenter&&body.contains(actionCenter)&&wrap.parentNode){
      wrap.parentNode.insertBefore(actionCenter,wrap);
    }
    sync();
  }

  const baseRenderDashboard=typeof renderDashboard==='function'?renderDashboard:null;
  if(baseRenderDashboard){
    renderDashboard=function(){
      const result=baseRenderDashboard.apply(this,arguments);
      install();
      return result;
    };
  }

  const baseApplyLang=typeof applyLang==='function'?applyLang:null;
  if(baseApplyLang){
    applyLang=function(){
      const result=baseApplyLang.apply(this,arguments);
      sync();
      return result;
    };
  }

  const observer=new MutationObserver(()=>{
    if(document.querySelector('#screen-dashboard'))install();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  install();
  window.__dabbirOwnerHome={version:'owner-home-v1',expand:()=>{expanded=true;sync()},collapse:()=>{expanded=false;sync()}};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-owner-home','owner-home-v1');
  return res.end(client);
}
