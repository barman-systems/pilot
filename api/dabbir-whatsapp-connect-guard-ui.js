const script = String.raw`(()=>{
  if(window.__dabbirWhatsAppConnectGuardLoaded) return;
  window.__dabbirWhatsAppConnectGuardLoaded=true;

  let cachedConfig=null;
  let cachedBusinessId='';
  let cachedAt=0;
  let patchScheduled=false;
  let metaSignupStartedAt=0;
  let oauthReturnBusy=false;
  let oauthLaunchBusy=false;
  const CACHE_MS=5000;
  const META_SIGNUP_RESUME_KEY='dabbir_meta_signup_resume_v2';
  const META_OAUTH_PENDING_KEY='dabbir_whatsapp_manual_oauth_v1';
  const COEXISTENCE_FEATURE='whatsapp_business_app_onboarding';
  const OAUTH_TTL_MS=15*60*1000;
  const CONNECT_SELECTOR='.dabbirWhatsAppConnect,.dabbirWhatsAppChange';

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function businessId(){try{return String(workspace?.business?.id||'')}catch{return ''}}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}

  function report(event,extra={}){
    try{
      fetch('/api/dabbir-whatsapp-client-event',{
        method:'POST',cache:'no-store',keepalive:true,
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({event,...extra})
      }).catch(()=>{});
    }catch{}
  }

  const style=document.createElement('style');
  style.dataset.dabbirWhatsAppMetaResume='v4';
  style.textContent=[
    '.dabbirWhatsAppMetaResume{flex-basis:100%;margin-top:7px;border:1px solid #2b3655;background:#0f1626;border-radius:12px;padding:10px 11px;color:#b8c3d6;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppMetaResume strong{display:block;color:#eef3fb;font-size:10px;margin-bottom:3px}',
    '.dabbirWhatsAppMetaResume button{margin-top:8px;min-height:38px;border:0;background:#1877f2;color:#fff;border-radius:9px;padding:8px 11px;font-size:9px;font-weight:900;cursor:pointer}',
    '.dabbirWhatsAppMetaResume button:disabled{opacity:.65;cursor:wait}'
  ].join('');
  document.head.appendChild(style);

  async function config(force=false){
    const bid=businessId();
    if(!bid) return null;
    if(!force&&cachedConfig&&cachedBusinessId===bid&&Date.now()-cachedAt<CACHE_MS) return cachedConfig;
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
      ? 'تعذر فتح ربط واتساب لأن إعداد المنصة غير مكتمل: '+items+'. لم يتم حفظ أي ربط ناقص.'
      : 'WhatsApp connection cannot open because platform setup is incomplete: '+items+'. No incomplete connection was saved.';
  }

  function authoritativeRedirectUri(){
    const host=String(window.location.hostname||'').toLowerCase();
    if(host==='dabbir.bmalman.com') return 'https://dabbir.bmalman.com/';
    return window.location.origin+'/';
  }

  function randomState(){
    try{
      const bytes=new Uint8Array(24);
      crypto.getRandomValues(bytes);
      return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    }catch{
      return String(Date.now())+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
    }
  }

  function saveOauthPending(record){
    try{sessionStorage.setItem(META_OAUTH_PENDING_KEY,JSON.stringify(record));return true}catch{return false}
  }

  function readOauthPending(){
    try{
      const raw=sessionStorage.getItem(META_OAUTH_PENDING_KEY);
      if(!raw)return null;
      const data=JSON.parse(raw);
      if(!data||typeof data!=='object')return null;
      if(Date.now()-Number(data.started_at||0)>OAUTH_TTL_MS){sessionStorage.removeItem(META_OAUTH_PENDING_KEY);return null}
      return data;
    }catch{return null}
  }

  function clearOauthPending(){try{sessionStorage.removeItem(META_OAUTH_PENDING_KEY)}catch{}}

  function cleanOauthLocation(){
    try{
      const url=new URL(window.location.href);
      ['code','state','error','error_code','error_reason','error_description'].forEach(key=>url.searchParams.delete(key));
      const next=url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash;
      history.replaceState({},document.title,next||'/');
    }catch{}
  }

  function buildManualOauthUrl(cfg,state){
    const graph=String(cfg?.graph_version||'v26.0').replace(/[^a-zA-Z0-9.]/g,'');
    const url=new URL('https://www.facebook.com/'+graph+'/dialog/oauth');
    url.searchParams.set('client_id',String(cfg.app_id));
    url.searchParams.set('config_id',String(cfg.config_id));
    url.searchParams.set('redirect_uri',authoritativeRedirectUri());
    url.searchParams.set('response_type','code');
    url.searchParams.set('override_default_response_type','true');
    url.searchParams.set('state',state);
    url.searchParams.set('extras',JSON.stringify({setup:{},featureType:COEXISTENCE_FEATURE}));
    return url.toString();
  }

  async function beginManualOauth(event,button,cfgOverride=null){
    if(event){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()}
    if(oauthLaunchBusy||oauthReturnBusy)return;
    oauthLaunchBusy=true;
    if(button){button.disabled=true;button.textContent=ar()?'جارٍ فتح Meta…':'Opening Meta…'}
    try{
      const cfg=cfgOverride||await config(true);
      if(!cfg?.platform_ready||!cfg.app_id||!cfg.config_id){
        tell(blockedText(missingParts(cfg)));
        if(button)button.disabled=false;
        return;
      }
      const bid=businessId();
      if(!bid){
        tell(ar()?'لم يتم تحديد النشاط بعد':'Business is not ready yet');
        if(button)button.disabled=false;
        return;
      }
      const state=randomState();
      const redirectUri=authoritativeRedirectUri();
      const pending={state,business_id:bid,redirect_uri:redirectUri,started_at:Date.now(),onboarding_mode:COEXISTENCE_FEATURE};
      if(!saveOauthPending(pending)){
        tell(ar()?'تعذر بدء الربط الآمن. أعد تحميل الصفحة.':'Could not start secure onboarding. Reload the page.');
        if(button)button.disabled=false;
        return;
      }
      report('manual_oauth_start',{stage:'meta_login'});
      window.location.assign(buildManualOauthUrl(cfg,state));
    }finally{
      setTimeout(()=>{oauthLaunchBusy=false},1000);
    }
  }

  function delegatedManualOauthClick(event){
    const target=event.target instanceof Element?event.target:null;
    const button=target?.closest(CONNECT_SELECTOR);
    if(!(button instanceof HTMLButtonElement))return;

    // This listener runs on document capture. It is the sole click authority for
    // WhatsApp onboarding and stops the older FB.login target handler even when
    // renderIntegrations recreates the button immediately before a tap.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(oauthLaunchBusy||oauthReturnBusy)return;
    void beginManualOauth(null,button,null);
  }
  document.addEventListener('click',delegatedManualOauthClick,true);

  async function finishManualOauthReturn(){
    if(oauthReturnBusy)return;
    let url;
    try{url=new URL(window.location.href)}catch{return}
    const code=String(url.searchParams.get('code')||'');
    const state=String(url.searchParams.get('state')||'');
    const providerError=String(url.searchParams.get('error_description')||url.searchParams.get('error_reason')||url.searchParams.get('error')||'');
    if(!code&&!providerError)return;

    oauthReturnBusy=true;
    const pending=readOauthPending();
    try{
      if(providerError){
        clearOauthPending();
        cleanOauthLocation();
        report('manual_oauth_provider_error',{stage:'meta_login',error:providerError.slice(0,160)});
        tell(ar()?'تم إلغاء ربط Meta أو رفضه. لم يتم حفظ أي ربط ناقص.':'Meta onboarding was cancelled or rejected. No incomplete connection was saved.');
        return;
      }
      if(!pending||!pending.state||pending.state!==state||!pending.business_id){
        clearOauthPending();
        cleanOauthLocation();
        report('manual_oauth_state_error',{stage:'meta_login',error:'META_OAUTH_STATE_MISMATCH'});
        tell(ar()?'انتهت جلسة الربط الآمن. ابدأ ربط واتساب من جديد.':'Secure onboarding session expired. Start WhatsApp connection again.');
        return;
      }
      if(String(pending.redirect_uri||'')!==authoritativeRedirectUri()){
        clearOauthPending();
        cleanOauthLocation();
        report('manual_oauth_state_error',{stage:'meta_login',error:'META_OAUTH_REDIRECT_MISMATCH'});
        tell(ar()?'عنوان الرجوع للربط تغير. أعد المحاولة من دبّر.':'OAuth return address changed. Retry from DABBIR.');
        return;
      }

      report('manual_oauth_complete_start',{stage:'server_complete',has_code:true});
      const response=await fetch('/api/dabbir-whatsapp-embedded-complete',{
        method:'POST',cache:'no-store',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({
          business_id:String(pending.business_id),
          code,
          waba_id:'',
          phone_number_id:'',
          onboarding_mode:COEXISTENCE_FEATURE
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok){
        const key=String(payload?.error||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
        report('manual_oauth_complete_error',{stage:'server_complete',error:key.slice(0,160),has_code:true});
        throw Object.assign(new Error(key),{providerCode:payload?.provider_code||null});
      }
      report('manual_oauth_complete_ok',{stage:'server_complete',has_code:true,has_waba:true,has_phone:true});
      clearOauthPending();
      cleanOauthLocation();
      try{if(typeof workspace!=='undefined'&&workspace)workspace.whatsapp={...(workspace.whatsapp||{}),...payload}}catch{}
      tell(ar()?'تم ربط رقم WhatsApp Business بنجاح':'WhatsApp Business number connected successfully');
      setTimeout(()=>window.location.replace('/'),350);
    }catch(error){
      const key=String(error?.message||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
      cleanOauthLocation();
      report('manual_oauth_complete_error',{stage:'server_complete',error:key.slice(0,160),has_code:true});
      if(key.toLowerCase().includes('redirect_uri')){
        tell(ar()?'رفضت Meta عنوان الرجوع المستخدم في هذه المحاولة. لم يتم حفظ أي ربط ناقص.':'Meta rejected the callback URL used for this attempt. No incomplete connection was saved.');
      }else{
        tell(ar()?'تعذر إكمال ربط WhatsApp Business من Meta. لم يتم حفظ أي ربط ناقص.':'Meta could not complete WhatsApp Business setup. No incomplete connection was saved.');
      }
      clearOauthPending();
    }finally{
      oauthReturnBusy=false;
      schedulePatch();
    }
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
    const primary=document.querySelector(CONNECT_SELECTOR);
    if(!(primary instanceof HTMLButtonElement))return;
    clearMetaSignupResume();
    tell(ar()?'جاري إكمال ربط واتساب…':'Continuing WhatsApp connection…');
    primary.disabled=false;
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
    void finishManualOauthReturn();
    const cfg=await config();
    const platformReady=Boolean(cfg?.platform_ready&&cfg?.app_id&&cfg?.config_id);
    document.querySelectorAll('[data-dabbir-whatsapp-actions]').forEach(ensureMetaResumeNotice);
    document.querySelectorAll(CONNECT_SELECTOR).forEach(button=>{
      if(!(button instanceof HTMLButtonElement)) return;
      const box=button.closest('[data-dabbir-whatsapp-actions]');
      if(box) ensureMetaResumeNotice(box);
      const hint=button.parentElement?.querySelector('.dabbirWhatsAppHint');
      if(platformReady){
        button.disabled=oauthReturnBusy||oauthLaunchBusy;
        button.setAttribute('aria-disabled',(oauthReturnBusy||oauthLaunchBusy)?'true':'false');
        button.dataset.platformReady='true';
        button.dataset.dabbirDirectOauthAuthority='document-capture-v1';
        if(hint) hint.textContent=ar()
          ? 'اضغط ربط. سيستخدم دبّر مسار Meta المباشر بعنوان رجوع ثابت، ولن يستخدم مسار FB.login القديم.'
          : 'Tap Connect. DABBIR will use the direct Meta OAuth path with one fixed callback and will not use the old FB.login path.';
        return;
      }
      if(button.closest('.dabbirWhatsAppBusy')) return;
      const text=blockedText(missingParts(cfg));
      button.disabled=false;
      button.setAttribute('aria-disabled','false');
      button.title=text;
      if(hint&&hint.textContent!==text) hint.textContent=text;
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
  setTimeout(()=>{void finishManualOauthReturn();schedulePatch();resumeOfficialWhatsAppSignup()},200);
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
  res.setHeader('x-dabbir-whatsapp-onboarding','meta-direct-oauth-v1-document-capture');
  return res.end(script);
}
