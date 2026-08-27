const script=String.raw`(()=>{
  if(window.__dabbirCustomerNumberUi)return;
  window.__dabbirCustomerNumberUi=true;

  let customerNo=null;
  let loading=false;

  function isEnglish(){return document.documentElement.lang==='en'}
  function copy(){return isEnglish()?{
    label:'Customer number',
    help:'Use this number when contacting DABBIR support.',
    copy:'Copy',
    copied:'Copied'
  }:{
    label:'رقم العميل',
    help:'استخدم هذا الرقم عند التواصل مع دعم دبّر.',
    copy:'نسخ',
    copied:'تم النسخ'
  }}

  async function load(){
    if(loading||customerNo)return customerNo;
    loading=true;
    try{
      const response=await fetch('/api/dabbir-customer-number',{cache:'no-store',credentials:'same-origin'});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok&&/^DAB-\d{6,}$/.test(String(payload.customer_no||''))){
        customerNo=String(payload.customer_no);
      }
    }catch{}
    loading=false;
    return customerNo;
  }

  function render(){
    const list=document.querySelector('#settingsList');
    if(!list||!customerNo)return;
    const existing=list.querySelector('[data-dabbir-customer-number]');
    const c=copy();
    const html='<div class="item" data-dabbir-customer-number="v1"><div class="grow"><b>'+c.label+'</b><small dir="ltr" style="font-size:12px;font-weight:900;letter-spacing:.04em;color:var(--text)">'+customerNo+'</small><small style="display:block;margin-top:3px">'+c.help+'</small></div><button type="button" class="secondary" data-copy-dabbir-number style="min-height:38px;padding:7px 10px">'+c.copy+'</button></div>';
    if(existing)existing.outerHTML=html;
    else list.insertAdjacentHTML('afterbegin',html);
    list.querySelector('[data-copy-dabbir-number]')?.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(customerNo);
        if(typeof toast==='function')toast(copy().copied);
      }catch{}
    });
  }

  const originalRender=typeof window.renderSettings==='function'?window.renderSettings:null;
  if(originalRender){
    window.renderSettings=function(){
      originalRender();
      render();
    };
    try{renderSettings=window.renderSettings}catch{}
  }

  const observer=new MutationObserver(()=>render());
  const settings=document.querySelector('#settingsList');
  if(settings)observer.observe(settings,{childList:true});

  load().then(()=>render());
  document.documentElement.dataset.dabbirCustomerNumber='enabled';
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-number-ui','v1');
  return res.end(script);
}
