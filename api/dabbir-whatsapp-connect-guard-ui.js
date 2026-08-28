const script = String.raw`(()=>{
  if(window.__dabbirWhatsAppConnectGuardLoaded) return;
  window.__dabbirWhatsAppConnectGuardLoaded=true;

  let cachedConfig=null;
  let cachedBusinessId='';
  let cachedAt=0;
  let patchScheduled=false;
  const CACHE_MS=5000;

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function businessId(){try{return String(workspace?.business?.id||'')}catch{return ''}}

  async function config(){
    const bid=businessId();
    if(!bid) return null;
    if(cachedConfig&&cachedBusinessId===bid&&Date.now()-cachedAt<CACHE_MS) return cachedConfig;
    try{
      const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{
        cache:'no-store',headers:{accept:'application/json'}
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok) return null;
      cachedConfig=payload;cachedBusinessId=bid;cachedAt=Date.now();
      return payload;
    }catch{return null}
  }

  function missingParts(cfg){
    const readiness=cfg?.platform_readiness||{};
    const missing=[];
    if(!readiness.app_id_configured) missing.push('Meta App ID');
    if(!readiness.app_secret_configured) missing.push('Meta App Secret');
    if(!readiness.embedded_config_id_configured) missing.push('Embedded Signup Configuration ID');
    if(!readiness.encryption_configured) missing.push(ar()?'مفتاح تشفير الربط':'integration encryption key');
    return missing;
  }

  function blockedText(missing){
    const items=missing.length?missing.join('، '):(ar()?'إعداد Meta للمنصة':'Meta platform configuration');
    return ar()
      ? 'زر الربط يعمل، لكن Meta لا يمكن فتحها لأن إعداد المنصة غير مكتمل: '+items+'. لم يتم حفظ أي ربط ناقص.'
      : 'The connect control works, but Meta cannot open because platform setup is incomplete: '+items+'. No incomplete connection was saved.';
  }

  async function patch(){
    patchScheduled=false;
    const cfg=await config();
    const platformReady=Boolean(cfg?.platform_ready&&cfg?.app_id&&cfg?.config_id);
    document.querySelectorAll('.dabbirWhatsAppConnect,.dabbirWhatsAppChange').forEach(button=>{
      if(!(button instanceof HTMLButtonElement)) return;
      if(platformReady||button.dataset.platformReady!=='false') return;
      if(button.closest('.dabbirWhatsAppBusy')) return;
      const hint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
      const text=blockedText(missingParts(cfg));
      button.disabled=false;
      button.setAttribute('aria-disabled','false');
      button.title=text;
      if(hint) hint.textContent=text;
      if(button.dataset.dabbirWhatsAppGuardBound!=='true'){
        button.dataset.dabbirWhatsAppGuardBound='true';
        button.addEventListener('click',()=>{
          const currentHint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
          if(currentHint) currentHint.textContent=text;
        },true);
      }
    });
  }

  function schedulePatch(){
    if(patchScheduled) return;
    patchScheduled=true;
    setTimeout(patch,0);
  }

  const observer=new MutationObserver(schedulePatch);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-platform-ready']});
  setTimeout(patch,800);
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
  return res.end(script);
}
