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
  function aiConfigured(){try{return Boolean(workspace?.ai?.configured)}catch{return false}}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function setText(node,text){if(node&&node.textContent!==text)node.textContent=text}
  function openScreen(screen){try{if(typeof showScreen==='function')showScreen(screen)}catch{}}

  const style=document.createElement('style');
  style.dataset.dabbirWhatsAppNoFacebook='v1';
  style.textContent=[
    '.dabbirWhatsAppNoFacebook{flex-basis:100%;margin-top:7px;border:1px solid #2b3655;background:#0f1626;border-radius:12px;padding:10px 11px;color:#b8c3d6;font-size:9px;line-height:1.65}',
    '.dabbirWhatsAppNoFacebook strong{display:block;color:#eef3fb;font-size:10px;margin-bottom:3px}',
    '.dabbirWhatsAppNoFacebook button{margin-top:8px;min-height:36px;border:1px solid #34415f;background:#151d2f;color:#eef3fb;border-radius:9px;padding:7px 10px;font-size:9px;font-weight:850;cursor:pointer}'
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
      ? 'زر الربط يعمل، لكن Meta لا يمكن فتحها لأن إعداد المنصة غير مكتمل: '+items+'. لم يتم حفظ أي ربط ناقص.'
      : 'The connect control works, but Meta cannot open because platform setup is incomplete: '+items+'. No incomplete connection was saved.';
  }

  function ensureNoFacebookNotice(box){
    if(!box||box.querySelector('[data-dabbir-no-facebook]')) return;
    const notice=document.createElement('div');
    notice.className='dabbirWhatsAppNoFacebook';
    notice.setAttribute('data-dabbir-no-facebook','true');
    const title=document.createElement('strong');
    title.textContent=ar()?'لا تملك حساب Facebook؟':'No Facebook account?';
    const text=document.createElement('span');
    text.textContent=ar()
      ? 'يمكنك متابعة استخدام دبّر الآن وربط واتساب لاحقًا. ربط رقم WhatsApp Business الخاص بك رسميًا يمر عبر تسجيل Meta/Facebook بحسب متطلبات منصة WhatsApp الحالية، لذلك عدم وجود حساب Facebook لا يمنع إنشاء حساب دبّر أو استخدام بقية النظام.'
      : 'You can keep using DABBIR now and connect WhatsApp later. Officially connecting your own WhatsApp Business number goes through Meta/Facebook login under the current WhatsApp Business Platform requirements, so not having Facebook does not block your DABBIR account or the rest of the product.';
    const button=document.createElement('button');
    button.type='button';
    button.textContent=ar()?'متابعة بدون واتساب':'Continue without WhatsApp';
    button.onclick=()=>{
      openScreen('dashboard');
      tell(ar()?'يمكنك ربط واتساب لاحقًا من التكاملات':'You can connect WhatsApp later from Integrations');
    };
    notice.append(title,text,button);
    box.appendChild(notice);
  }

  function patchActivation(){
    const panel=document.querySelector('#dabbirActivation');
    if(!panel)return;
    const steps=[...panel.querySelectorAll('.daSteps .daStep')];
    if(steps.length<3)return;

    const profile=steps[0];
    const whatsapp=steps[1];
    const ai=steps[2];
    setText(whatsapp,ar()?'واتساب (اختياري)':'WhatsApp (optional)');

    const coreDone=[profile,ai].filter(step=>step.classList.contains('done')).length;
    const score=Math.round(coreDone/2*100);
    setText(panel.querySelector('.daScore strong'),score+'%');
    const progress=panel.querySelector('.daProgress i');
    if(progress&&progress.style.width!==score+'%')progress.style.width=score+'%';

    const whatsappReady=whatsapp.classList.contains('done');
    if(!profile.classList.contains('done')||whatsappReady)return;

    const nextTitle=panel.querySelector('.daNext b');
    const nextBody=panel.querySelector('.daNext p');
    const nextButton=panel.querySelector('#daNextAction');

    if(!aiConfigured()){
      setText(nextTitle,ar()?'تحقق من جاهزية الذكاء':'Verify AI readiness');
      setText(nextBody,ar()?'يمكنك استخدام دبّر بدون ربط واتساب الآن. جهّز ذكاء دبّر أولًا، ثم اربط واتساب لاحقًا إذا رغبت.':'You can use DABBIR without connecting WhatsApp now. Set up DABBIR AI first, then connect WhatsApp later if you want.');
      if(nextButton){
        setText(nextButton,ar()?'فتح حالة الذكاء':'Open AI status');
        nextButton.onclick=()=>openScreen('integrations');
      }
      return;
    }

    setText(nextTitle,ar()?'ابدأ باستخدام دبّر':'Start using DABBIR');
    setText(nextBody,ar()?'حسابك جاهز للاستخدام. ربط WhatsApp Business اختياري ويمكنك إكماله لاحقًا من التكاملات.':'Your account is ready to use. WhatsApp Business connection is optional and can be completed later from Integrations.');
    if(nextButton){
      setText(nextButton,ar()?'فتح المحادثات':'Open conversations');
      nextButton.onclick=()=>openScreen('conversations');
    }
    setText(panel.querySelector('.daHead h2'),ar()?'دَبِّر جاهز للعمل':'DABBIR is ready to operate');
    setText(panel.querySelector('.daHead p'),ar()?'الأساسيات التشغيلية جاهزة. يمكنك ربط واتساب لاحقًا إذا احتجته.':'Core operations are ready. You can connect WhatsApp later if you need it.');
  }

  async function patch(){
    patchScheduled=false;
    patchActivation();
    const cfg=await config();
    const platformReady=Boolean(cfg?.platform_ready&&cfg?.app_id&&cfg?.config_id);
    document.querySelectorAll('[data-dabbir-whatsapp-actions]').forEach(ensureNoFacebookNotice);
    document.querySelectorAll('.dabbirWhatsAppConnect,.dabbirWhatsAppChange').forEach(button=>{
      if(!(button instanceof HTMLButtonElement)) return;
      const box=button.closest('[data-dabbir-whatsapp-actions]');
      if(box) ensureNoFacebookNotice(box);
      if(platformReady||button.dataset.platformReady!=='false') return;
      if(button.closest('.dabbirWhatsAppBusy')) return;
      const hint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
      const text=blockedText(missingParts(cfg));
      button.disabled=false;
      button.setAttribute('aria-disabled','false');
      button.title=text;
      if(hint&&hint.textContent!==text) hint.textContent=text;
      if(button.dataset.dabbirWhatsAppGuardBound!=='true'){
        button.dataset.dabbirWhatsAppGuardBound='true';
        button.addEventListener('click',()=>{
          const currentHint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
          if(currentHint&&currentHint.textContent!==text) currentHint.textContent=text;
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
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-platform-ready','class']});
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
  res.setHeader('x-dabbir-whatsapp-onboarding','optional-v1');
  return res.end(script);
}
