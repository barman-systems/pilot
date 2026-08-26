const script=String.raw`(()=>{
  if(window.__dabbirActivityMobilePolish)return;
  window.__dabbirActivityMobilePolish=true;

  const style=document.createElement('style');
  style.dataset.dabbirActivityMobilePolish='v1';
  style.textContent=[
    '@media(max-width:700px){',
    '.bottomNav{grid-template-columns:repeat(5,minmax(0,1fr))!important;column-gap:2px!important;overflow:hidden!important}',
    '.bottomNav>[data-screen="settings"]{display:none!important}',
    '.bottomNav>button,.bottomNav>a{min-width:0!important;padding:5px 2px!important;font-size:8px!important;line-height:1.25!important;white-space:normal!important;overflow:hidden!important}',
    'body.dabbirAppActive>.dabbirMobileBrand{display:flex!important;left:50%!important;right:auto!important;inset-inline-start:auto!important;transform:translateX(-50%)!important;top:11px!important;width:38px!important;height:44px!important;align-items:center!important;justify-content:center!important}',
    '.dabbirMobileBrand>div:not(.logo),.dabbirMobileBrand b,.dabbirMobileBrand small{display:none!important}',
    '.dabbirMobileBrand .logo{width:36px!important;height:36px!important;flex:0 0 36px!important}',
    '.dabbir-action-center{padding:12px!important;margin-bottom:10px!important}',
    '.dac-head strong{font-size:13px!important}.dac-status{font-size:8px!important}',
    '.dac-brief{font-size:10px!important;line-height:1.55!important;margin:9px 0!important}',
    '.dac-metrics{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}',
    '.dac-metric{padding:8px!important}.dac-metric strong{font-size:18px!important}',
    '.dac-items{gap:6px!important}.dac-item{padding:9px!important}.dac-item-body b{font-size:10px!important}',
    '.dac-open{min-width:56px!important;padding:6px 8px!important}',
    '}',
  ].join('');
  document.head.append(style);

  const q=s=>document.querySelector(s);
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const activity=()=>String(window.workspace?.business?.business_type||'other').toLowerCase();
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function keepActionItem(item){
    const type=activity();
    if(type==='store') return item?.type!=='appointment';
    if(['clinic','salon','real_estate','creator','services','other'].includes(type)) return !['inventory','order'].includes(String(item?.type||''));
    return true;
  }

  function when(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }

  function actionCopy(){return ar()?{urgent:'يحتاج تدخلك',warning:'راقب اليوم',total:'إجمالي الأولويات',empty:'كل شيء تحت السيطرة الآن',open:'فتح',brief:'أهم ما يحتاج تدخلك الآن'}:{urgent:'Needs you',warning:'Watch today',total:'Total priorities',empty:'Everything is under control right now',open:'Open',brief:'What needs your attention now'}}

  function normalizeActionCenter(){
    const panel=q('#dabbirActionCenter');
    const data=window.workspace?.owner_action_center;
    if(!panel||!data)return;
    const raw=Array.isArray(data.items)?data.items:[];
    const items=raw.filter(keepActionItem);
    const signature=activity()+'|'+items.map(x=>x.id).join('|')+'|'+(ar()?'ar':'en');
    const list=panel.querySelector('#dacItems');
    if(!list)return;
    const hasLegacy=list.querySelector('.dac-item:not([data-activity-normalized="true"])');
    if(panel.dataset.activitySignature===signature&&!hasLegacy)return;
    panel.dataset.activitySignature=signature;

    const t=actionCopy();
    const urgent=items.filter(x=>x.severity==='critical').length;
    const warning=items.filter(x=>x.severity==='warning').length;
    const metrics=panel.querySelector('#dacMetrics');
    if(metrics){
      const metric=(label,value,tone)=>'<div class="dac-metric '+tone+'"><strong>'+escapeHtml(value)+'</strong><span>'+escapeHtml(label)+'</span></div>';
      metrics.innerHTML=metric(t.urgent,urgent,'critical')+metric(t.warning,warning,'warning')+metric(t.total,items.length,'');
    }

    const brief=panel.querySelector('#dacBrief');
    if(brief){
      const top=items.slice(0,3).map(x=>ar()?x.title_ar:x.title_en).filter(Boolean);
      brief.textContent=top.length?t.brief+': '+top.join('، ')+'.':t.empty;
    }

    list.replaceChildren();
    if(!items.length){
      const empty=document.createElement('div');empty.className='dac-empty';empty.textContent=t.empty;list.append(empty);return;
    }
    for(const item of items.slice(0,3)){
      const row=document.createElement('article');row.className='dac-item '+(item.severity||'info');row.dataset.activityNormalized='true';
      const body=document.createElement('div');body.className='dac-item-body';
      const title=document.createElement('b');title.textContent=ar()?item.title_ar:item.title_en;
      const detail=document.createElement('span');detail.textContent=ar()?item.detail_ar:item.detail_en;
      const small=document.createElement('small');small.textContent=when(item.due_at);
      body.append(title,detail,small);
      const button=document.createElement('button');button.type='button';button.className='secondary dac-open';button.textContent=t.open;
      button.onclick=()=>{const target=String(item.target||'dashboard');if(typeof showScreen==='function')showScreen(target)};
      row.append(body,button);list.append(row);
    }
  }

  function removeMobileBrandText(){
    const brand=document.querySelector('.dabbirMobileBrand');
    if(!brand)return;
    [...brand.children].forEach(child=>{if(!child.classList.contains('logo'))child.remove()});
    const logo=brand.querySelector('.logo');if(logo)logo.textContent='';
  }

  function polish(){removeMobileBrandText();normalizeActionCenter()}
  const observer=new MutationObserver(()=>setTimeout(polish,0));
  observer.observe(document.body,{subtree:true,childList:true});
  setInterval(polish,700);
  setTimeout(polish,0);
  setTimeout(polish,500);
  window.__dabbirActivityMobilePolish={refresh:polish,version:'activity-mobile-polish-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-dabbir-activity-mobile-polish','v1');
  return res.status(200).send(script);
}
