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

  // Keep priority rendering under owner-action-center-core-ui authority.

  function removeMobileBrandText(){
    const brand=document.querySelector('.dabbirMobileBrand');
    if(!brand)return;
    [...brand.children].forEach(child=>{if(!child.classList.contains('logo'))child.remove()});
    const logo=brand.querySelector('.logo');if(logo)logo.textContent='';
  }

  function polish(){removeMobileBrandText()}
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
