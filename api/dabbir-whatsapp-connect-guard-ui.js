const script = String.raw`(()=>{
  if(window.__dabbirWhatsAppConnectGuardLoaded) return;
  window.__dabbirWhatsAppConnectGuardLoaded=true;

  let cachedConfig=null;
  let cachedBusinessId='';
  let cachedAt=0;
  let patchScheduled=false;
  let metaSignupStartedAt=0;
  const CACHE_MS=5000;
  const META_SIGNUP_RESUME_KEY='dabbir_meta_signup_resume_v2';

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function businessId(){try{return String(workspace?.business?.id||'')}catch{return ''}}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}

  const style=document.createElement('style');
  style.dataset.dabbirWhatsAppMetaResume='v2';
  style.textContent=[
    '.dabbirWhatsAppMetaResume{flex-basis:100%;margin-top:7px;border:1px solid #2b3655;background:#0f1626;border-radius:12px;padding:10px 11px;color:#b8c3d6;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppMetaResume strong{display:block;color:#eef3fb;font-size:10px;margin-bottom:3px}',
    '.dabbirWhatsAppMetaResume button{margin-top:8px;min-height:38px;border:0;background:#1877f2;color:#fff;border-radius:9px;padding:8px 11px;font-size:9px;font-weight:900;cursor:pointer}',
    '.dabbirWhatsAppMetaResume button:disabled{opacity:.65;cursor:wait}'
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
      ? 'تعذر فتح ربط واتساب لأن إعداد المنصة غير مكتمل: '+items+'.'
      : 'WhatsApp connection cannot open because platform setup is incomplete: '+items+'.';
  }

  function markMetaSignupResume(){
    metaSignupStartedAt=Date.now();
    try{sessionStorage.setItem(META_SIGNUP_RESUME_KEY,JSON.stringify({business_id:businessId(),started_at:metaSignupStartedAt}))}catch{}
  }

  function clearMetaSignupResume(){
    metaSignupStartedAt=0;
    try{sessionStorage.removeItem(META_SIGNUP_RESUME_KEY)}catch{}
  }

  function pendingMetaSignup(){
    try{
      const raw=sessionStorage.getItem(META_SIGNUP_RESUME_KEY);
      if(!raw)return false;
      const data=JSON.parse(raw);
      if(String(data?.business_id||'')!==businessId())return false;
      const started=Number(data?.started_at||0);
      if(!Number.isFinite(started)||Date.now()-started>15*60*1000){clearMetaSignupResume();return false}
      metaSignupStartedAt=started;
      return true;
    }catch{return false}
  }

  function resumeOfficialWhatsAppSignup(){
    if(!pendingMetaSignup())return;
    if(Date.now()-metaSignupStartedAt<1500)return;
    const primary=document.querySelector('.dabbirWhatsAppConnect,.dabbirWhatsAppChange');
    if(!(primary instanceof HTMLButtonElement)||primary.disabled)return;
    clearMetaSignupResume();
    tell(ar()?'جاري إكمال ربط واتساب…':'Continuing WhatsApp connection…');
    setTimeout(()=>primary.click(),150);
  }

  function startFacebookAccountCreation(button){
    if(button.disabled)return;
    markMetaSignupResume();
    button.disabled=true;
    button.textContent=ar()?'أنشئ الحساب ثم ارجع إلى دبّر':'Create the account, then return to DABBIR';
    const popup=window.open('https://www.facebook.com/r.php','_blank','noopener,noreferrer');
    if(!popup){
      button.disabled=false;
      button.textContent=ar()?'إنشاء الحساب والمتابعة':'Create account and continue';
      clearMetaSignupResume();
      tell(ar()?'اسمح بفتح صفحة Facebook ثم أعد المحاولة':'Allow the Facebook page to open, then retry');
    }
  }

  function ensureMetaResumeNotice(box){
    if(!box||box.querySelector('[data-dabbir-meta-resume]')) return;
    const notice=document.createElement('div');
    notice.className='dabbirWhatsAppMetaResume';
    notice.setAttribute('data-dabbir-meta-resume','true');
    const title=document.createElement('strong');
    title.textContent=ar()?'لا تملك حساب Facebook؟':'No Facebook account?';
    const text=document.createElement('span');
    text.textContent=ar()
      ? 'أنشئ الحساب مرة واحدة فقط، ثم ارجع إلى دبّر وسيكمل ربط WhatsApp Business تلقائيًا.'
      : 'Create it once, return to DABBIR, and WhatsApp Business setup will resume automatically.';
    const button=document.createElement('button');
    button.type='button';
    button.textContent=ar()?'إنشاء الحساب والمتابعة':'Create account and continue';
    button.onclick=()=>startFacebookAccountCreation(button);
    notice.append(title,text,button);
    box.appendChild(notice);
  }

  async function patch(){
    patchScheduled=false;
    const cfg=await config();
    const platformReady=Boolean(cfg?.platform_ready&&cfg?.app_id&&cfg?.config_id);
    document.querySelectorAll('[data-dabbir-whatsapp-actions]').forEach(ensureMetaResumeNotice);
    document.querySelectorAll('.dabbirWhatsAppConnect,.dabbirWhatsAppChange').forEach(button=>{
      if(!(button instanceof HTMLButtonElement)) return;
      const box=button.closest('[data-dabbir-whatsapp-actions]');
      if(box) ensureMetaResumeNotice(box);
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

  window.addEventListener('focus',()=>setTimeout(resumeOfficialWhatsAppSignup,250));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(resumeOfficialWhatsAppSignup,250)});

  const observer=new MutationObserver(schedulePatch);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-platform-ready']});
  setTimeout(()=>{patch();resumeOfficialWhatsAppSignup()},800);
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
  res.setHeader('x-dabbir-whatsapp-onboarding','meta-resume-v2');
  return res.end(script);
}
