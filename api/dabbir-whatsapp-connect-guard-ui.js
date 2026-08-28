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
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function setText(node,text){if(node&&node.textContent!==text)node.textContent=text}

  const style=document.createElement('style');
  style.dataset.dabbirWhatsAppInstantSandbox='v1';
  style.textContent=[
    '.dabbirWhatsAppInstantSandbox{flex-basis:100%;margin-top:7px;border:1px solid #285d4a;background:#10261f;border-radius:12px;padding:11px;color:#b9d7c5;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppInstantSandbox strong{display:block;color:#eaffef;font-size:11px;margin-bottom:3px}',
    '.dabbirWhatsAppInstantSandbox button{margin-top:8px;min-height:40px;border:0;background:#25d366;color:#07150b;border-radius:9px;padding:8px 12px;font-size:9px;font-weight:950;cursor:pointer}',
    '.dabbirWhatsAppInstantSandbox button:disabled{opacity:.65;cursor:wait}',
    '.dabbirWhatsAppInstantSandbox small{display:block;margin-top:7px;color:#8faf99;font-size:8px}'
  ].join('');
  document.head.appendChild(style);

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
      ? 'تعذر فتح ربط الرقم التجاري لأن إعداد Meta غير مكتمل: '+items+'. لم يتم حفظ أي ربط ناقص.'
      : 'Your business-number connection cannot open because Meta platform setup is incomplete: '+items+'. No incomplete connection was saved.';
  }

  async function startInstantSandbox(button){
    if(button.disabled)return;
    const bid=businessId();
    if(!bid){tell(ar()?'أكمل إنشاء نشاطك أولًا':'Finish creating your business first');return}
    const original=button.textContent;
    button.disabled=true;
    button.textContent=ar()?'جاري فتح واتساب…':'Opening WhatsApp…';
    const popup=window.open('about:blank','_blank');
    try{
      const response=await fetch('/api/dabbir-whatsapp-sandbox',{
        method:'POST',
        cache:'no-store',
        credentials:'same-origin',
        headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({business_id:bid})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok||!payload.available||!payload.whatsapp_url){
        if(popup&&!popup.closed)popup.close();
        const reason=String(payload.error||payload.reason||'');
        tell(ar()
          ? (reason.includes('NOT_CONFIGURED')?'قناة تجربة واتساب غير مفعلة على المنصة بعد':'تعذر فتح تجربة واتساب الآن')
          : (reason.includes('NOT_CONFIGURED')?'The WhatsApp test channel is not enabled on the platform yet':'Could not open the WhatsApp test right now'));
        return;
      }
      const url=String(payload.whatsapp_url);
      if(popup&&!popup.closed)popup.location.href=url;
      else window.location.href=url;
      tell(ar()?'أرسل الرسالة الجاهزة وسيجيبك دبّر على واتساب':'Send the prepared message and DABBIR will reply on WhatsApp');
    }catch{
      if(popup&&!popup.closed)popup.close();
      tell(ar()?'تعذر فتح تجربة واتساب الآن':'Could not open the WhatsApp test right now');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  }

  function ensureInstantSandbox(box){
    if(!box||box.querySelector('[data-dabbir-whatsapp-sandbox]'))return;
    const notice=document.createElement('div');
    notice.className='dabbirWhatsAppInstantSandbox';
    notice.setAttribute('data-dabbir-whatsapp-sandbox','true');
    const title=document.createElement('strong');
    title.textContent=ar()?'جرّب دبّر على واتساب الآن':'Try DABBIR on WhatsApp now';
    const text=document.createElement('span');
    text.textContent=ar()
      ? 'تجربة فورية على رقم دبّر، بدون Facebook. أرسل رسالة من واتسابك وشاهد رد دبّر على نشاطك مباشرة.'
      : 'Instant test on DABBIR’s number, with no Facebook setup. Send a WhatsApp message and see DABBIR answer for your business.';
    const button=document.createElement('button');
    button.type='button';
    button.textContent=ar()?'فتح واتساب والتجربة':'Open WhatsApp and try it';
    button.onclick=()=>startInstantSandbox(button);
    const note=document.createElement('small');
    note.textContent=ar()
      ? 'للاختبار فقط — ليس رقم نشاطك. عندما تريد استقبال عملائك على رقمك التجاري اختر «استخدم رقمي التجاري».'
      : 'Test only — this is not your business number. When you want customers on your own number, choose “Use my business number”.';
    notice.append(title,text,button,note);
    box.prepend(notice);
  }

  async function patch(){
    patchScheduled=false;
    const cfg=await config();
    const platformReady=Boolean(cfg?.platform_ready&&cfg?.app_id&&cfg?.config_id);
    document.querySelectorAll('[data-dabbir-whatsapp-actions]').forEach(ensureInstantSandbox);
    document.querySelectorAll('.dabbirWhatsAppConnect,.dabbirWhatsAppChange').forEach(button=>{
      if(!(button instanceof HTMLButtonElement))return;
      const box=button.closest('[data-dabbir-whatsapp-actions]');
      if(box)ensureInstantSandbox(box);
      if(button.classList.contains('dabbirWhatsAppConnect'))setText(button,ar()?'استخدم رقمي التجاري':'Use my business number');
      if(platformReady||button.dataset.platformReady!=='false')return;
      if(button.closest('.dabbirWhatsAppBusy'))return;
      const hint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
      const text=blockedText(missingParts(cfg));
      button.disabled=false;
      button.setAttribute('aria-disabled','false');
      button.title=text;
      if(hint&&hint.textContent!==text)hint.textContent=text;
      if(button.dataset.dabbirWhatsAppGuardBound!=='true'){
        button.dataset.dabbirWhatsAppGuardBound='true';
        button.addEventListener('click',()=>{
          const currentHint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
          if(currentHint&&currentHint.textContent!==text)currentHint.textContent=text;
        },true);
      }
    });
  }

  function schedulePatch(){
    if(patchScheduled)return;
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
  res.setHeader('x-dabbir-whatsapp-onboarding','instant-sandbox-v1');
  return res.end(script);
}
