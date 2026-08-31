/* DABBIR UI bundle: generated from config/dabbir-ui-bundles.json. */
(()=>{
  if(window.__dabbirWhatsAppEmbeddedUiLoaded) return;
  window.__dabbirWhatsAppEmbeddedUiLoaded=true;

  const SESSION_TIMEOUT_MS=15*60*1000;
  const POST_LOGIN_SESSION_GRACE_MS=5000;
  const EMBEDDED_SIGNUP_VERSION='v4';
  const COEXISTENCE_FEATURE='whatsapp_business_app_onboarding';
  const META_FINISH_EVENTS=new Set([
    'FINISH',
    'FINISH_ONLY_WABA',
    'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  ]);

  const css=document.createElement('style');
  css.textContent=[
    '.dabbirWhatsAppActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.dabbirWhatsAppActions button{min-height:40px;border-radius:10px;padding:8px 11px;font-size:10px;font-weight:850}',
    '.dabbirWhatsAppConnect{border:0;background:#25D366;color:#07140c}',
    '.dabbirWhatsAppChange{border:1px solid #2a2e33;background:#181b1f;color:#fff}',
    '.dabbirWhatsAppDisconnect{border:1px solid #5a2525;background:#2d1717;color:#ffb1b1}',
    '.dabbirWhatsAppHint{display:block;flex-basis:100%;margin-top:7px;color:#979da5;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppBusy{opacity:.65;pointer-events:none}'
  ].join('');
  document.head.appendChild(css);

  let sdkPromise=null;
  let sdkPreparePromise=null;
  let sdkReadyAppId=null;
  let embeddedSession=null;
  let sessionWaiters=[];
  let configCache=null;
  let configBusinessId=null;
  let busy=false;

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function businessId(){try{return String(workspace?.business?.id||'')}catch{return ''}}
  function trustedMetaOrigin(origin){
    try{
      const url=new URL(String(origin||''));
      const host=String(url.hostname||'').toLowerCase();
      return url.protocol==='https:'&&(host==='facebook.com'||host.endsWith('.facebook.com'));
    }catch{return false}
  }

  function canonicalRedirectUri(){
    try{
      const url=new URL(window.location.href);
      url.search='';
      url.hash='';
      return url.toString();
    }catch{return ''}
  }

  function report(event,extra={}){
    try{
      fetch('/api/dabbir-whatsapp-client-event',{
        method:'POST',
        cache:'no-store',
        keepalive:true,
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({event,...extra})
      }).catch(()=>{});
    }catch{}
  }

  function whatsappCard(){
    const grid=document.querySelector('#integrationGrid');
    if(!grid) return null;
    const wanted=(()=>{try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}})();
    return [...grid.querySelectorAll('.integration')].find(card=>String(card.querySelector('h3')?.textContent||'').trim()===wanted)||null;
  }

  function settleSession(value){
    const waiters=sessionWaiters.splice(0);
    waiters.forEach(resolve=>resolve(value));
  }

  function parseMetaMessage(event){
    if(!trustedMetaOrigin(event.origin)) return;
    let data=event.data;
    if(typeof data==='string'){
      try{data=JSON.parse(data)}catch{return}
    }
    if(!data||data.type!=='WA_EMBEDDED_SIGNUP') return;

    const metaEvent=String(data.event||'');
    if(META_FINISH_EVENTS.has(metaEvent)){
      const payload=data.data||{};
      embeddedSession={
        waba_id:String(payload.waba_id||payload.whatsapp_business_account_id||''),
        phone_number_id:String(payload.phone_number_id||''),
        onboarding_mode:COEXISTENCE_FEATURE
      };
      report('session_finish',{
        stage:'meta_session',
        meta_event:metaEvent,
        onboarding_mode:embeddedSession.onboarding_mode,
        has_waba:Boolean(embeddedSession.waba_id),
        has_phone:Boolean(embeddedSession.phone_number_id)
      });
      if(embeddedSession.waba_id) settleSession(embeddedSession);
    }else if(metaEvent==='CANCEL'){
      report('session_cancel',{stage:'meta_session'});
      settleSession(null);
    }else if(metaEvent==='ERROR'){
      report('session_error',{stage:'meta_session',error:String(data?.data?.error_message||data?.data?.error||'META_EMBEDDED_SIGNUP_ERROR').slice(0,160)});
      settleSession(null);
      tell(ar()?'تعذر إكمال ربط WhatsApp Business من Meta':'Meta could not complete WhatsApp Business setup');
    }
  }
  window.addEventListener('message',parseMetaMessage);

  function waitForSession(timeoutMs=SESSION_TIMEOUT_MS){
    if(embeddedSession?.waba_id) return Promise.resolve(embeddedSession);
    return new Promise(resolve=>{
      let done=false;
      let timer=null;
      const finish=value=>{
        if(done)return;
        done=true;
        if(timer)clearTimeout(timer);
        const index=sessionWaiters.indexOf(finish);
        if(index>=0)sessionWaiters.splice(index,1);
        resolve(value);
      };
      timer=setTimeout(()=>{
        report('session_timeout',{stage:'meta_session'});
        finish(null);
      },timeoutMs);
      sessionWaiters.push(finish);
    });
  }

  async function loadSdk(cfg){
    if(window.FB){
      try{window.FB.init({appId:cfg.app_id,cookie:true,xfbml:false,version:cfg.graph_version})}catch{}
      return window.FB;
    }
    if(sdkPromise) return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const previous=window.fbAsyncInit;
      window.fbAsyncInit=function(){
        try{if(typeof previous==='function')previous()}catch{}
        try{
          window.FB.init({appId:cfg.app_id,cookie:true,xfbml:false,version:cfg.graph_version});
          resolve(window.FB);
        }catch(error){reject(error)}
      };
      const existing=document.querySelector('script[data-dabbir-meta-sdk]');
      if(existing){
        const wait=setInterval(()=>{
          if(window.FB){
            clearInterval(wait);
            try{window.FB.init({appId:cfg.app_id,cookie:true,xfbml:false,version:cfg.graph_version})}catch{}
            resolve(window.FB);
          }
        },100);
        setTimeout(()=>{clearInterval(wait);if(!window.FB)reject(new Error('META_SDK_LOAD_TIMEOUT'))},10000);
        return;
      }
      const metaScript=document.createElement('script');
      metaScript.async=true;
      metaScript.defer=true;
      metaScript.crossOrigin='anonymous';
      metaScript.src='https://connect.facebook.net/'+encodeURIComponent(cfg.sdk_locale||'en_US')+'/sdk.js';
      metaScript.setAttribute('data-dabbir-meta-sdk','true');
      metaScript.onerror=()=>reject(new Error('META_SDK_LOAD_FAILED'));
      document.head.appendChild(metaScript);
    });
    return sdkPromise;
  }

  async function prepareMeta(cfg){
    if(!cfg?.platform_ready||!cfg.app_id||!cfg.config_id) return false;
    if(window.FB&&sdkReadyAppId===String(cfg.app_id)) return true;
    if(sdkPreparePromise) return sdkPreparePromise;
    report('sdk_preload_start',{stage:'sdk_preload'});
    sdkPreparePromise=loadSdk(cfg)
      .then(FB=>{
        if(!FB||typeof FB.login!=='function') throw new Error('META_SDK_NOT_READY');
        sdkReadyAppId=String(cfg.app_id);
        report('sdk_ready',{stage:'sdk_preload'});
        return true;
      })
      .catch(error=>{
        sdkPromise=null;
        sdkReadyAppId=null;
        report('sdk_preload_error',{stage:'sdk_preload',error:String(error?.message||'META_SDK_LOAD_FAILED').slice(0,160)});
        return false;
      })
      .finally(()=>{sdkPreparePromise=null});
    return sdkPreparePromise;
  }

  async function loadConfig(force=false){
    const bid=businessId();
    if(!bid) return null;
    if(!force&&configCache&&configBusinessId===bid) return configCache;
    const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{cache:'no-store',headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok) return null;
    configBusinessId=bid;
    configCache=payload;
    return payload;
  }

  async function refreshTenantStatus(){
    const bid=businessId();
    if(!bid) return;
    try{
      const response=await fetch('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(bid),{cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok&&typeof workspace!=='undefined'&&workspace){
        workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
        try{if(typeof renderIntegrations==='function')renderIntegrations()}catch{}
      }
    }catch{}
  }

  function setBusy(value){
    busy=value;
    const card=whatsappCard();
    card?.querySelector('[data-dabbir-whatsapp-actions]')?.classList.toggle('dabbirWhatsAppBusy',value);
    card?.querySelectorAll('[data-dabbir-whatsapp-actions] button').forEach(button=>button.disabled=value||button.dataset.platformReady==='false');
  }

  async function completeSignup(code,session){
    const safeSession=session||{};
    report('complete_start',{
      stage:'server_complete',
      onboarding_mode:COEXISTENCE_FEATURE,
      embedded_signup_version:EMBEDDED_SIGNUP_VERSION,
      has_code:Boolean(code),
      has_waba:Boolean(safeSession.waba_id),
      has_phone:Boolean(safeSession.phone_number_id)
    });
    const response=await fetch('/api/dabbir-whatsapp-embedded-complete',{
      method:'POST',
      cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({
        business_id:businessId(),
        code,
        waba_id:safeSession.waba_id||'',
        phone_number_id:safeSession.phone_number_id||'',
        onboarding_mode:COEXISTENCE_FEATURE,
        exchange_mode:'facebook_js_sdk'
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){
      const error=new Error(String(payload.error||'WHATSAPP_EMBEDDED_SIGNUP_FAILED').slice(0,240));
      error.providerCode=payload.provider_code||null;
      error.providerStatus=payload.provider_status||null;
      throw error;
    }
    report('complete_ok',{stage:'server_complete',onboarding_mode:COEXISTENCE_FEATURE,has_waba:true,has_phone:true});
    if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
    configCache=null;
    await loadConfig(true).catch(()=>null);
    await refreshTenantStatus();
    tell(ar()?'تم ربط رقم WhatsApp Business بنجاح':'WhatsApp Business number connected successfully');
  }

  function failureText(key,providerCode=null){
    const raw=String(key||'');
    const lower=raw.toLowerCase();
    if(raw==='META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED') return ar()?'إعداد ربط WhatsApp Business في Meta غير مكتمل بعد':'Meta WhatsApp Business onboarding is not configured yet';
    if(raw==='META_AUTHORIZATION_CODE_MISSING') return ar()?'لم تُرجع Meta رمز التفويض. أغلق نافذة Meta وأعد المحاولة من داخل دبّر.':'Meta did not return an authorization code. Close the Meta window and retry from DABBIR.';
    if(raw==='META_LOGIN_FAILED'||lower.includes('user denied')||lower.includes('cancel')) return ar()?'تم إلغاء ربط Meta. أعد المحاولة واضغط متابعة حتى نهاية الخطوات.':'Meta connection was cancelled. Retry and continue through all setup steps.';
    if(raw==='META_EMBEDDED_SIGNUP_SESSION_MISSING') return ar()?'لم يصل تأكيد ربط WhatsApp Business من Meta. لم يتم حفظ أي ربط ناقص.':'Meta did not return the WhatsApp Business connection confirmation. No incomplete connection was saved.';
    if(raw==='META_WABA_DISCOVERY_EMPTY') return ar()?'أكملت Meta تسجيل الدخول، لكن لم تشارك أي حساب WhatsApp Business مع دبّر.':'Meta login completed, but no WhatsApp Business Account was shared with DABBIR.';
    if(raw==='META_WABA_RESOLUTION_REQUIRED') return ar()?'تمت مشاركة أكثر من حساب WhatsApp Business ولا يمكن اختيار أحدها تلقائيًا بأمان.':'More than one WhatsApp Business Account was shared, so DABBIR cannot safely choose one automatically.';
    if(raw==='META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED') return ar()?'يوجد أكثر من رقم داخل حساب WhatsApp Business ولم تتمكن Meta من تحديد الرقم المختار تلقائيًا.':'More than one WhatsApp Business number is available and Meta did not identify the selected number.';
    if(raw==='META_PHONE_NOT_IN_SELECTED_WABA'||raw==='META_PHONE_NUMBER_ID_MISMATCH') return ar()?'لم يتطابق رقم WhatsApp المختار مع حساب WhatsApp Business. أعد الربط واختر الرقم من داخل نافذة Meta نفسها.':'The selected WhatsApp number does not match the WhatsApp Business Account. Retry and choose the number inside Meta.';
    if(raw==='META_APP_DOMAIN_REPAIR_NOT_ALLOWED'||raw==='META_APP_DOMAIN_REPAIR_CONFIGURATION_MISSING'||raw==='META_APP_DOMAIN_UPDATE_UNVERIFIED'||Number(providerCode)===191||lower.includes("domain of this url")||lower.includes('valid oauth redirect')) return ar()?'رفضت Meta نطاق الموقع. يجب إضافة dabbir.bmalman.com إلى Allowed domains وValid OAuth Redirect URIs في إعدادات Facebook Login for Business ثم إعادة المحاولة.':'Meta rejected the site domain. Add dabbir.bmalman.com to Allowed domains and Valid OAuth Redirect URIs in Facebook Login for Business, then retry.';
    if(raw==='META_CODE_EXCHANGE_FAILED'||raw==='META_WABA_DISCOVERY_FAILED') return ar()?'تعذر تأكيد التفويض من Meta. تحقق من صلاحيات WhatsApp Business وتكوين Embedded Signup ثم أعد المحاولة.':'Meta authorization could not be confirmed. Check WhatsApp Business permissions and the Embedded Signup configuration, then retry.';
    if(raw==='META_SDK_NOT_READY'||raw==='META_SDK_LOAD_FAILED'||raw==='META_SDK_LOAD_TIMEOUT') return ar()?'جاري تجهيز الربط الآمن من Meta. أعد الضغط بعد أن يصبح الزر جاهزًا.':'Meta secure onboarding is still preparing. Retry when the connect button is ready.';
    return ar()?'تعذر ربط WhatsApp Business. لم يتم حفظ أي ربط غير مكتمل.':'WhatsApp Business could not be connected. No incomplete connection was saved.';
  }

  async function connectWhatsApp(){
    if(busy) return;
    const cfg=configCache;
    const FB=window.FB;
    embeddedSession=null;
    let stage='start';
    report('connect_start',{stage,onboarding_mode:COEXISTENCE_FEATURE,embedded_signup_version:EMBEDDED_SIGNUP_VERSION});

    if(!cfg?.platform_ready||!cfg.app_id||!cfg.config_id){
      report('connect_error',{stage:'platform_config',error:'META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED',has_waba:false,has_phone:false});
      tell(failureText('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED'));
      renderActions();
      return;
    }
    if(!FB||typeof FB.login!=='function'||sdkReadyAppId!==String(cfg.app_id)){
      report('connect_error',{stage:'sdk_preload',error:'META_SDK_NOT_READY',has_waba:false,has_phone:false});
      tell(failureText('META_SDK_NOT_READY'));
      prepareMeta(cfg).then(()=>renderActions());
      return;
    }

    setBusy(true);
    try{
      stage='meta_login';
      const sessionPromise=waitForSession();
      const authPromise=new Promise((resolve,reject)=>{
        try{
          FB.login(response=>{
            report('login_callback',{stage:'meta_login',onboarding_mode:COEXISTENCE_FEATURE,embedded_signup_version:EMBEDDED_SIGNUP_VERSION,has_code:Boolean(response?.authResponse?.code)});
            if(response?.error){
              const message=String(response.error.message||response.error.error_message||'META_LOGIN_FAILED').slice(0,160);
              reject(new Error(message));
              return;
            }
            resolve(response);
          },{
            config_id:cfg.config_id,
            response_type:'code',
            override_default_response_type:true,
            extras:{setup:{},featureType:COEXISTENCE_FEATURE}
          });
          report('login_invoked',{stage:'meta_login',onboarding_mode:COEXISTENCE_FEATURE,embedded_signup_version:EMBEDDED_SIGNUP_VERSION});
        }catch(error){reject(error)}
      });

      const auth=await authPromise;
      const code=String(auth?.authResponse?.code||'');
      if(!code) throw new Error('META_AUTHORIZATION_CODE_MISSING');

      stage='meta_session';
      let session=embeddedSession?.waba_id?embeddedSession:null;
      if(!session){
        session=await Promise.race([
          sessionPromise,
          new Promise(resolve=>setTimeout(()=>resolve(null),POST_LOGIN_SESSION_GRACE_MS))
        ]);
      }
      if(!session?.waba_id){
        report('session_server_fallback',{stage:'meta_session',has_code:true,has_waba:false,has_phone:false});
        settleSession(null);
        session=null;
      }

      stage='server_complete';
      await completeSignup(code,session);
    }catch(error){
      const key=String(error?.message||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
      report('connect_error',{stage,error:key,onboarding_mode:COEXISTENCE_FEATURE,embedded_signup_version:EMBEDDED_SIGNUP_VERSION,has_waba:Boolean(embeddedSession?.waba_id),has_phone:Boolean(embeddedSession?.phone_number_id)});
      tell(failureText(key,error?.providerCode));
    }finally{
      setBusy(false);
      renderActions();
    }
  }

  async function disconnectWhatsApp(){
    if(busy) return;
    const accepted=window.confirm(ar()?'فصل رقم WhatsApp Business عن هذا النشاط؟':'Disconnect WhatsApp Business from this business?');
    if(!accepted) return;
    setBusy(true);
    try{
      const response=await fetch('/api/dabbir-whatsapp-disconnect',{
        method:'POST',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({business_id:businessId()})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok) throw new Error(payload.error||'WHATSAPP_DISCONNECT_FAILED');
      configCache=null;
      sdkReadyAppId=null;
      if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={connected:false,state:'NOT_CONFIGURED',phone:null,operational:false};
      try{if(typeof renderIntegrations==='function')renderIntegrations()}catch{}
      tell(ar()?'تم فصل WhatsApp Business':'WhatsApp Business disconnected');
    }catch{
      tell(ar()?'تعذر فصل WhatsApp Business':'WhatsApp Business could not be disconnected');
    }finally{
      setBusy(false);
      renderActions();
    }
  }

  async function renderActions(){
    const card=whatsappCard();
    if(!card||!businessId()) return;
    let box=card.querySelector('[data-dabbir-whatsapp-actions]');
    if(!box){
      box=document.createElement('div');
      box.className='dabbirWhatsAppActions';
      box.setAttribute('data-dabbir-whatsapp-actions','true');
      card.appendChild(box);
    }

    let cfg=null;
    try{cfg=await loadConfig()}catch{}
    if(!cfg){box.replaceChildren();return}
    box.replaceChildren();

    const connected=Boolean(cfg.connected||workspace?.whatsapp?.connected);
    const platformReady=Boolean(cfg.platform_ready&&cfg.app_id&&cfg.config_id);
    const primary=document.createElement('button');
    primary.type='button';
    primary.className=connected?'dabbirWhatsAppChange':'dabbirWhatsAppConnect';
    primary.textContent=connected
      ? (ar()?'تغيير رقم WhatsApp Business':'Change WhatsApp Business number')
      : (ar()?'ربط WhatsApp Business':'Connect WhatsApp Business');
    primary.dataset.platformReady='false';
    primary.disabled=true;
    primary.onclick=connectWhatsApp;
    box.appendChild(primary);

    if(connected){
      const disconnect=document.createElement('button');
      disconnect.type='button';
      disconnect.className='dabbirWhatsAppDisconnect';
      disconnect.textContent=ar()?'فصل WhatsApp':'Disconnect WhatsApp';
      disconnect.onclick=disconnectWhatsApp;
      disconnect.disabled=busy;
      box.appendChild(disconnect);
    }

    const hint=document.createElement('span');
    hint.className='dabbirWhatsAppHint';
    hint.textContent=platformReady
      ? (ar()?'جاري تجهيز الربط الآمن لرقم WhatsApp Business الحالي…':'Preparing secure onboarding for your existing WhatsApp Business number…')
      : (ar()?'إعداد Meta Embedded Signup للمنصة يحتاج App ID وConfiguration ID صالحين.':'Meta Embedded Signup needs a valid App ID and Configuration ID.');
    box.appendChild(hint);

    if(platformReady){
      prepareMeta(cfg).then(metaReady=>{
        if(!primary.isConnected) return;
        primary.dataset.platformReady=String(metaReady);
        primary.disabled=busy||!metaReady;
        hint.textContent=metaReady
          ? (ar()?'اضغط ربط. ستطلب Meta رقم WhatsApp Business الحالي، ثم ستصلك رسالة رسمية داخل واتساب لتأكيد Connect وإدخال الكود. لا تحتاج نسخ Token أو إعداد الربط يدويًا.':'Tap Connect. Meta will ask for your existing WhatsApp Business number, then send an official in-app WhatsApp prompt to confirm Connect and enter the code. No token copying or manual setup is required.')
          : failureText('META_SDK_NOT_READY');
      });
    }
  }

  if(typeof renderIntegrations==='function'&&!window.__dabbirWhatsAppEmbeddedRenderWrapped){
    window.__dabbirWhatsAppEmbeddedRenderWrapped=true;
    const before=renderIntegrations;
    renderIntegrations=function(){
      const result=before.apply(this,arguments);
      setTimeout(renderActions,0);
      return result;
    };
  }

  const observer=new MutationObserver(()=>{
    const card=whatsappCard();
    if(card&&!card.querySelector('[data-dabbir-whatsapp-actions]')) setTimeout(renderActions,0);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>{refreshTenantStatus();renderActions()},700);
})();
(()=>{
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
    // The official Embedded Signup UI owns the button when it is mounted. Meta
    // returns WABA/phone IDs through WA_EMBEDDED_SIGNUP message events; do not
    // replace that flow with the legacy manual OAuth path, which cannot receive
    // those asset IDs and falls back to unreliable Graph discovery.
    if(window.__dabbirWhatsAppEmbeddedUiLoaded)return;

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
          onboarding_mode:COEXISTENCE_FEATURE,
          exchange_mode:'redirect'
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
        button.dataset.dabbirEmbeddedSignupAuthority='official-message-flow-v1';
        if(hint) hint.textContent=ar()
          ? 'اضغط ربط. سيستخدم دبّر Embedded Signup الرسمي من Meta، وستُعاد معرفات WABA والرقم عبر رسالة Meta الآمنة.'
          : 'Tap Connect. DABBIR will use Meta Embedded Signup, which returns the WABA and phone IDs through its secure message event.';
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
})();
(()=>{
  if(window.__dabbirTimezoneLoaded)return;
  window.__dabbirTimezoneLoaded=true;
  const DABBIR_TIME_ZONE='Asia/Dubai';
  const DABBIR_UTC_OFFSET='+04:00';
  window.__dabbirTimeZone=DABBIR_TIME_ZONE;

  function locale(){
    try{return typeof lang!=='undefined'&&lang==='en'?'en-AE':'ar-AE'}catch{return document.documentElement.lang==='en'?'en-AE':'ar-AE'}
  }

  function dubaiFormat(value){
    if(!value){
      try{return typeof T==='function'?T().unknown:'—'}catch{return '—'}
    }
    try{
      return new Intl.DateTimeFormat(locale(),{
        dateStyle:'medium',
        timeStyle:'short',
        timeZone:DABBIR_TIME_ZONE,
      }).format(new Date(value));
    }catch{return String(value)}
  }

  function dubaiLocalToIso(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
      const absolute=new Date(raw);
      return Number.isNaN(absolute.getTime())?null:absolute.toISOString();
    }
    const normalized=raw.length===16?raw+':00':raw;
    const date=new Date(normalized+DABBIR_UTC_OFFSET);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }

  try{fmt=dubaiFormat}catch{}
  window.fmt=dubaiFormat;
  window.dabbirFormatTime=dubaiFormat;
  window.dabbirLocalTimeToIso=dubaiLocalToIso;

  const appointmentForm=document.querySelector('#appointmentForm');
  if(appointmentForm&&!appointmentForm.dataset.dabbirDubaiTime){
    appointmentForm.dataset.dabbirDubaiTime='v1';
    appointmentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const input=document.querySelector('#apptTime');
      const customer=document.querySelector('#apptCustomer');
      const startsAt=dubaiLocalToIso(input&&input.value);
      if(!startsAt){
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Invalid time')}catch{}
        return;
      }
      try{
        const businessId=typeof workspace!=='undefined'&&workspace&&workspace.business?workspace.business.id:null;
        if(!businessId)return;
        const response=await fetch('/api/dabbir-runtime-fast',{
          method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
          body:JSON.stringify({action:'create_appointment',business_id:businessId,customer_name:String(customer&&customer.value||'').trim(),starts_at:startsAt})
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok){
          try{if(typeof toast==='function')toast(payload.error||(typeof T==='function'?T().invalid:'Save failed'))}catch{}
          return;
        }
        document.querySelector('#appointmentModal')?.classList.remove('open');
        appointmentForm.reset();
        try{if(typeof toast==='function')toast(typeof T==='function'?T().saved:'Saved')}catch{}
        if(typeof loadRuntime==='function')await loadRuntime(businessId,typeof selectedConversationId!=='undefined'?selectedConversationId:null);
      }catch{
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Save failed')}catch{}
      }
    },true);
  }

  document.documentElement.dataset.dabbirTimezone=DABBIR_TIME_ZONE;
  setTimeout(()=>{
    try{if(typeof workspace!=='undefined'&&workspace&&typeof renderAll==='function')renderAll()}catch{}
  },0);
})();
(()=>{
  if(window.__dabbirHumanChatUiLoaded)return;
  window.__dabbirHumanChatUiLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirChatUi='v2';
  style.textContent=[
    '#newChatBtn{display:none!important}',
    '.dabbirChatControl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.dabbirOwnerChip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;font-size:9px;font-weight:900;border:1px solid #31363c;background:#171a1d;color:#c8cdd3}',
    '.dabbirOwnerChip:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9}',
    '.dabbirOwnerChip.ai{border-color:#3d4b27;background:#202918;color:#bfe977}',
    '.dabbirOwnerChip.human{border-color:#244a66;background:#132737;color:#9bd2ff}',
    '.dabbirOwnerChip.action{border-color:#665527;background:#332b16;color:#ffd87a}',
    '.dabbirTakeover{min-height:38px!important;padding:7px 11px!important;border-radius:11px!important;font-size:9px!important;white-space:nowrap}',
    '.dabbirTakeover.take{border:1px solid #52652c;background:#26331a;color:#d7ff5f;font-weight:900}',
    '.dabbirTakeover.return{border:1px solid #35546b;background:#172b3a;color:#b6dcff;font-weight:900}',
    '#screen-conversations .chatPanel{background:linear-gradient(180deg,#111315,#0d0f11)}',
    '#screen-conversations .chatHead{background:#121416}',
    '#screen-conversations #translateAll{border:1px solid #30363d!important;background:#181b1f!important;color:#d8dde2!important;border-radius:10px!important;font-size:9px!important;padding:7px 10px!important;min-height:38px!important}',
    '#screen-conversations .messages{scrollbar-width:thin;scrollbar-color:#31363c transparent}',
    '#screen-conversations .msgrow{margin:12px 0}',
    '#screen-conversations .bubble{max-width:min(78%,560px);box-shadow:none}',
    '#screen-conversations .bubble .body{font-size:12px;line-height:1.65}',
    '#screen-conversations .bubble .original{font-size:9px;line-height:1.55;opacity:.72}',
    '#screen-conversations .meta{margin-top:6px;gap:5px}',
    '#screen-conversations .meta button{min-height:26px!important;padding:2px 4px!important;font-size:8px!important}',
    '.compose.dabbirHumanLocked{opacity:1!important;background:#0f1210;border-top-color:#242a22!important}',
    '.compose.dabbirHumanLocked input{cursor:not-allowed;background:#141814!important;border-color:#252d22!important;color:#8c9584!important;text-align:center;font-size:10px}',
    '.compose.dabbirHumanLocked #sendBtn{display:none!important}',
    '.dabbirSenderLabel{font-size:8px;font-weight:900;margin:0 5px 4px;color:#8f969e;letter-spacing:.01em}',
    '.msgrow.customer .bubble{margin-right:auto!important;margin-left:0!important;background:#191c20!important;border-color:#30353b!important}',
    '.msgrow.customer .dabbirSenderLabel{margin-right:auto!important;margin-left:5px!important}',
    '.msgrow.ai .bubble{margin-left:auto!important;margin-right:0!important;background:#202817!important;border-color:#3a4827!important}',
    '.msgrow.ai .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#b9de7d}',
    '.msgrow.human .bubble{margin-left:auto!important;margin-right:0!important;background:#162735!important;border-color:#2e526c!important}',
    '.msgrow.human .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#9bcaff}',
    '@media(max-width:700px){'+
      '#screen-conversations .chatGrid{margin-top:0!important}'+
      '#screen-conversations .chatList{max-height:132px!important;margin-bottom:8px!important;border-radius:14px!important}'+
      '#screen-conversations .chatPanel{height:calc(100dvh - 238px);min-height:500px;border-radius:16px!important;overflow:hidden}'+
      '#screen-conversations .chatHead{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:10px!important}'+
      '#screen-conversations .chatHead>.grow{grid-column:1;grid-row:1;min-width:0}'+
      '#screen-conversations .chatHead>.grow b,#screen-conversations #chatName{font-size:12px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #chatState{font-size:8px!important;color:#858c94!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #translateAll{grid-column:2;grid-row:1;min-height:38px!important;padding:6px 9px!important;white-space:nowrap}'+
      '#screen-conversations .dabbirChatControl{grid-column:1/-1;grid-row:2;width:100%;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}'+
      '#screen-conversations .dabbirOwnerChip{max-width:none!important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 8px;font-size:8px}'+
      '#screen-conversations .dabbirTakeover{min-height:36px!important;padding:6px 9px!important;font-size:8px!important}'+
      '#screen-conversations .messages{min-height:0!important;padding:11px 9px 14px!important}'+
      '#screen-conversations .msgrow{margin:10px 0!important}'+
      '#screen-conversations .bubble{max-width:84%!important;border-radius:15px!important;padding:9px 10px!important}'+
      '#screen-conversations .bubble .body{font-size:13px!important;line-height:1.58!important}'+
      '#screen-conversations .compose{padding:8px!important;gap:7px!important;background:#101214}'+
      '#screen-conversations .compose input{min-height:46px!important;border-radius:12px!important;font-size:16px!important}'+
      '#screen-conversations .send{width:46px!important;min-width:46px!important;height:46px!important;border-radius:12px!important}'+
      '#screen-conversations .compose.dabbirHumanLocked input{font-size:10px!important;min-height:42px!important}'+
      '#screen-conversations+.truth,#screen-conversations .truth{font-size:8px!important;line-height:1.55!important;padding:9px 10px!important;margin-top:8px!important}'+
    '}'
  ].join('');
  document.head.appendChild(style);

  const q=s=>document.querySelector(s);
  const isArabic=()=>document.documentElement.lang!=='en';
  const copy=()=>isArabic()?{
    ai:'DABBIR يتولى المحادثة',human:'رد يدوي من الموظف',action:'تحتاج تدخلًا بشريًا',
    takeover:'استلام يدوي',returnAi:'إعادة إلى DABBIR',locked:'DABBIR يرد تلقائيًا — استلم المحادثة للرد يدويًا',
    reply:'اكتب ردك للعميل...',customer:'العميل',assistant:'DABBIR',staff:'الموظف',
    takeoverOk:'تم استلام المحادثة. توقفت ردود DABBIR التلقائية.',returnOk:'تمت إعادة المحادثة إلى DABBIR.',takeoverConfirmTitle:'استلام المحادثة يدويًا؟',takeoverConfirmBody:'ستتوقف ردود دبّر التلقائية حتى تعيد المحادثة إليه.',returnConfirmTitle:'إعادة المحادثة إلى دبّر؟',returnConfirmBody:'سيستأنف دبّر الرد التلقائي وفق إعدادات النشاط.',continueAction:'متابعة',cancelAction:'إلغاء',
    takeoverFail:'تعذر استلام المحادثة',sendFail:'تعذر إرسال رد الموظف',returnFail:'تعذر إعادة المحادثة إلى DABBIR'
  }:{
    ai:'DABBIR is handling this chat',human:'Staff reply mode',action:'Human attention required',
    takeover:'Take over',returnAi:'Return to DABBIR',locked:'DABBIR replies automatically — take over to reply manually',
    reply:'Write your reply to the customer...',customer:'Customer',assistant:'DABBIR',staff:'Staff',
    takeoverOk:'Conversation taken over. DABBIR auto-replies are paused.',returnOk:'Conversation returned to DABBIR.',takeoverConfirmTitle:'Take over this conversation?',takeoverConfirmBody:'DABBIR automatic replies will pause until you return the conversation.',returnConfirmTitle:'Return this conversation to DABBIR?',returnConfirmBody:'DABBIR will resume automatic replies using the workspace settings.',continueAction:'Continue',cancelAction:'Cancel',
    takeoverFail:'Could not take over conversation',sendFail:'Could not send staff reply',returnFail:'Could not return conversation to DABBIR'
  };

  function currentConversation(){try{return typeof selectedConversation==='function'?selectedConversation():null}catch{return null}}
  function currentBusinessId(){try{return workspace&&workspace.business?workspace.business.id:null}catch{return null}}
  function currentConversationId(){try{return selectedConversationId||((currentConversation()||{}).id)||null}catch{return null}}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}

  function ensureControl(){
    const head=q('.chatHead');
    if(!head)return null;
    let wrap=q('#dabbirChatControl');
    if(wrap)return wrap;
    wrap=document.createElement('div');
    wrap.id='dabbirChatControl';
    wrap.className='dabbirChatControl';
    wrap.innerHTML='<span id="dabbirChatOwner" class="dabbirOwnerChip"></span><button id="dabbirTakeoverBtn" class="dabbirTakeover" type="button"></button>';
    const translate=q('#translateAll');
    if(translate)head.insertBefore(wrap,translate);else head.appendChild(wrap);
    q('#dabbirTakeoverBtn').addEventListener('click',toggleTakeover);
    return wrap;
  }

  function replaceLegacyComposer(){
    const input=q('#composer');
    if(input&&!input.dataset.dabbirHumanComposer){
      const clone=input.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v2';
      input.replaceWith(clone);
      clone.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendHumanReply()}});
    }
    const button=q('#sendBtn');
    if(button&&!button.dataset.dabbirHumanComposer){
      const clone=button.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v2';
      button.replaceWith(clone);
      clone.addEventListener('click',sendHumanReply);
    }
  }

  function normalizeComparable(value){return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()}
  function cleanDuplicateTranslations(){
    const messages=q('#messages');
    if(!messages)return;
    messages.querySelectorAll('.bubble').forEach(bubble=>{
      const body=bubble.querySelector('.body');
      const original=bubble.querySelector('.original');
      if(!body||!original)return;
      if(normalizeComparable(body.textContent)===normalizeComparable(original.textContent))original.remove();
    });
  }

  function labelMessages(){
    const t=copy();
    const messages=q('#messages');
    if(!messages)return;
    messages.querySelectorAll('.msgrow').forEach(row=>{
      const old=row.querySelector('.dabbirSenderLabel');
      if(old)old.remove();
      const label=document.createElement('div');
      label.className='dabbirSenderLabel';
      if(row.classList.contains('customer'))label.textContent=t.customer;
      else if(row.classList.contains('human'))label.textContent=t.staff;
      else if(row.classList.contains('ai'))label.textContent=t.assistant;
      else return;
      row.prepend(label);
    });
    cleanDuplicateTranslations();
  }

  function updateHumanUi(){
    ensureControl();
    replaceLegacyComposer();
    labelMessages();
    const t=copy();
    const conversation=currentConversation();
    const state=String(conversation?conversation.state:'');
    const owner=q('#dabbirChatOwner');
    const control=q('#dabbirTakeoverBtn');
    const input=q('#composer');
    const send=q('#sendBtn');
    const compose=input?input.closest('.compose'):null;
    const stateText=q('#chatState');

    if(!conversation){
      if(owner)owner.textContent='';
      if(control)control.style.display='none';
      if(input){input.disabled=true;input.placeholder=t.locked}
      if(send)send.disabled=true;
      if(compose)compose.classList.add('dabbirHumanLocked');
      return;
    }

    if(control)control.style.display='inline-flex';
    if(state==='human_active'){
      if(owner){owner.textContent=t.human;owner.className='dabbirOwnerChip human'}
      if(control){control.textContent=t.returnAi;control.className='dabbirTakeover return'}
      if(input){input.disabled=false;input.placeholder=t.reply}
      if(send)send.disabled=false;
      if(compose)compose.classList.remove('dabbirHumanLocked');
      if(stateText)stateText.textContent=t.human;
    }else{
      const needsHuman=state==='action_required';
      if(owner){owner.textContent=needsHuman?t.action:t.ai;owner.className='dabbirOwnerChip '+(needsHuman?'action':'ai')}
      if(control){control.textContent=t.takeover;control.className='dabbirTakeover take'}
      if(input){input.disabled=true;input.value='';input.placeholder=t.locked}
      if(send)send.disabled=true;
      if(compose)compose.classList.add('dabbirHumanLocked');
      if(stateText)stateText.textContent=needsHuman?t.action:t.ai;
    }
  }

  async function chatControl(action,message){
    const businessId=currentBusinessId();
    const conversationId=currentConversationId();
    if(!businessId||!conversationId)throw new Error('CONVERSATION_REQUIRED');
    const body={action:action,business_id:businessId,conversation_id:conversationId};
    if(message)body.message=message;
    const response=await fetch('/api/chat-control',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'CHAT_CONTROL_FAILED');
    return payload;
  }

  async function toggleTakeover(){
    const button=q('#dabbirTakeoverBtn');
    const conversation=currentConversation();
    if(!conversation||(button&&button.disabled))return;
    const t=copy();
    const returning=conversation.state==='human_active';
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:returning?t.returnConfirmTitle:t.takeoverConfirmTitle,body:returning?t.returnConfirmBody:t.takeoverConfirmBody,accept:t.continueAction,cancel:t.cancelAction}):window.confirm(returning?t.returnConfirmTitle:t.takeoverConfirmTitle);
    if(!confirmed)return;
    if(button)button.disabled=true;
    try{
      if(returning){
        await chatControl('return_to_ai');
        notify(t.returnOk);
      }else{
        await chatControl('takeover');
        notify(t.takeoverOk);
      }
      if(typeof loadRuntime==='function')await loadRuntime(currentBusinessId(),currentConversationId());
    }catch(error){notify((conversation.state==='human_active'?t.returnFail:t.takeoverFail)+(error&&error.message?' — '+error.message:''))}
    finally{if(button)button.disabled=false;updateHumanUi()}
  }

  let sending=false;
  async function sendHumanReply(){
    const t=copy();
    const conversation=currentConversation();
    const input=q('#composer');
    const button=q('#sendBtn');
    const message=String(input?input.value:'').trim();
    if(sending||!message||!conversation||conversation.state!=='human_active')return;
    sending=true;
    if(button)button.disabled=true;
    try{
      const payload=await chatControl('human_message',message);
      const saved=payload&&payload.result?payload.result.message:null;
      if(input)input.value='';
      if(saved&&typeof workspace!=='undefined'&&workspace){
        workspace.messages=Array.isArray(workspace.messages)?workspace.messages:[];
        workspace.messages.push(saved);
        workspace.messages_loaded=true;
        if(typeof renderMessages==='function')renderMessages();
        labelMessages();
      }else if(typeof loadRuntime==='function'){
        await loadRuntime(currentBusinessId(),currentConversationId());
      }
    }catch(error){notify(t.sendFail+(error&&error.message?' — '+error.message:''))}
    finally{sending=false;if(button)button.disabled=false;updateHumanUi();const live=q('#composer');if(live&&!live.disabled)live.focus()}
  }

  ensureControl();
  replaceLegacyComposer();
  try{
    if(typeof renderMessages==='function'){
      const baseRenderMessages=renderMessages;
      renderMessages=function(){const value=baseRenderMessages.apply(this,arguments);labelMessages();updateHumanUi();return value};
    }
    if(typeof renderChats==='function'){
      const baseRenderChats=renderChats;
      renderChats=function(){const value=baseRenderChats.apply(this,arguments);updateHumanUi();return value};
    }
    if(typeof renderAll==='function'){
      const baseRenderAll=renderAll;
      renderAll=function(){const value=baseRenderAll.apply(this,arguments);updateHumanUi();return value};
    }
  }catch{}
  new MutationObserver(updateHumanUi).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(updateHumanUi,0);
  setTimeout(updateHumanUi,500);
  window.__dabbirHumanChatUiVersion='v2';
})();
(()=>{
  if(window.__dabbirTranslationUiLoaded)return;
  window.__dabbirTranslationUiLoaded=true;

  const q=s=>document.querySelector(s);
  const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const targetFor=text=>{
    const value=String(text||'');
    const ar=(value.match(/[\u0600-\u06FF]/g)||[]).length;
    const en=(value.match(/[A-Za-z]/g)||[]).length;
    if(!ar&&!en)return null;
    return ar>=en?'en':'ar';
  };
  const labelFor=()=>document.documentElement.lang==='en'?'Translate conversation':'ترجمة المحادثة';
  const activeLabelFor=()=>document.documentElement.lang==='en'?'Show original':'عرض النص الأصلي';
  const notify=text=>{try{if(typeof toast==='function')toast(text)}catch{}};

  async function requestGroup(businessId,targetLanguage,messages){
    const response=await fetch('/api/translate',{
      method:'POST',cache:'no-store',credentials:'same-origin',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({business_id:businessId,targetLanguage,messages})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.error||('TRANSLATION_'+response.status));
    return Array.isArray(payload.translations)?payload.translations:[];
  }

  async function smartTranslate(ids){
    const businessId=typeof workspace!=='undefined'&&workspace?.business?.id;
    const source=typeof workspace!=='undefined'&&Array.isArray(workspace?.messages)?workspace.messages:[];
    if(!businessId||!Array.isArray(ids)||!ids.length)return;
    const selected=source.filter(message=>ids.includes(message.id)).map(message=>({id:String(message.id),text:String(message.body||'')}));
    if(!selected.length)return;

    const groups={ar:[],en:[]};
    for(const message of selected){
      const target=targetFor(message.text);
      if(!target)continue;
      groups[target].push(message);
    }

    try{
      const results=[];
      for(const target of ['ar','en']){
        if(!groups[target].length)continue;
        results.push(...await requestGroup(businessId,target,groups[target]));
      }
      for(const item of results){
        const original=selected.find(message=>String(message.id)===String(item.id))?.text||'';
        const translated=String(item.text||'');
        if(typeof translations!=='undefined'&&translations instanceof Map){
          if(translated&&normalize(translated)!==normalize(original))translations.set(String(item.id),translated);
          else translations.delete(String(item.id));
        }
      }
      if(typeof renderMessages==='function')renderMessages();
    }catch(error){
      console.error('dabbir_smart_translation_failed',String(error?.message||error).slice(0,140));
      notify(document.documentElement.lang==='en'?'Translation is temporarily unavailable':'تعذر الترجمة مؤقتًا');
    }
  }

  try{translateMessages=smartTranslate}catch{window.translateMessages=smartTranslate}

  function refreshLabels(){
    const all=q('#translateAll');
    if(all){
      let active=false;
      try{active=Boolean(translationMode)}catch{}
      all.textContent=active?activeLabelFor():labelFor();
      all.setAttribute('aria-label',all.textContent);
    }
  }

  if(typeof renderMessages==='function'&&!window.__dabbirTranslationRenderWrapped){
    window.__dabbirTranslationRenderWrapped=true;
    const base=renderMessages;
    renderMessages=function(){const result=base.apply(this,arguments);refreshLabels();return result};
  }
  if(typeof applyLang==='function'&&!window.__dabbirTranslationLangWrapped){
    window.__dabbirTranslationLangWrapped=true;
    const base=applyLang;
    applyLang=function(){const result=base.apply(this,arguments);refreshLabels();return result};
  }

  refreshLabels();
  setTimeout(refreshLabels,300);
  setTimeout(refreshLabels,1000);
  window.__dabbirTranslationUiVersion='v2-opposite-language';
})();
(()=>{
  if(window.__dabbirOwnerOperationsLoaded)return;
  window.__dabbirOwnerOperationsLoaded=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    nav:'العمليات',title:'مركز العمليات',desc:'المنتجات والمخزون والطلبات من بيانات نشاطك الفعلية.',
    products:'المنتجات',stock:'المخزون',available:'المتاح',low:'مخزون منخفض',orders:'الطلبات',sales:'المبيعات المؤكدة',
    add:'إضافة منتج',sku:'SKU',name:'اسم المنتج',price:'السعر (درهم)',qty:'الكمية',reserved:'محجوز',status:'الحالة',customer:'العميل',date:'التاريخ',
    noProducts:'لا توجد منتجات بعد.',noOrders:'لا توجد طلبات فعلية بعد.',lowTitle:'تحتاج انتباه',lowNone:'لا يوجد نقص مخزون حاليًا.',
    simulated:'الطلبات التجريبية مستبعدة من المبيعات.',save:'حفظ',cancel:'إلغاء',editStock:'تعديل المخزون',update:'تحديث',
    created:'تمت إضافة المنتج.',updated:'تم تحديث المخزون.',orderUpdated:'تم تحديث حالة الطلب.',failed:'تعذر إكمال العملية.',
    draft:'مسودة',reservedStatus:'محجوز',confirmed:'مؤكد',cancelled:'ملغي',completed:'مكتمل',loading:'جارٍ تحميل العمليات...'
  }:{
    nav:'Operations',title:'Owner operations',desc:'Products, inventory, and orders from your real business data.',
    products:'Products',stock:'Inventory',available:'Available',low:'Low stock',orders:'Orders',sales:'Recognized sales',
    add:'Add product',sku:'SKU',name:'Product name',price:'Price (AED)',qty:'Quantity',reserved:'Reserved',status:'Status',customer:'Customer',date:'Date',
    noProducts:'No products yet.',noOrders:'No real orders yet.',lowTitle:'Needs attention',lowNone:'No low-stock items right now.',
    simulated:'Simulated orders are excluded from recognized sales.',save:'Save',cancel:'Cancel',editStock:'Edit inventory',update:'Update',
    created:'Product added.',updated:'Inventory updated.',orderUpdated:'Order status updated.',failed:'Operation failed.',
    draft:'Draft',reservedStatus:'Reserved',confirmed:'Confirmed',cancelled:'Cancelled',completed:'Completed',loading:'Loading operations...'
  };

  const style=document.createElement('style');
  style.textContent=[
    '.opsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}',
    '.opsMetric{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:16px;padding:14px}',
    '.opsMetric span{display:block;color:var(--muted);font-size:9px}.opsMetric strong{display:block;font-size:22px;margin-top:6px}',
    '.opsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.opsTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}',
    '.opsRow{display:grid;grid-template-columns:minmax(130px,1.5fr) .8fr .7fr .7fr auto;gap:8px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:10px}',
    '.opsRow:last-child{border-bottom:0}.opsRow.head{color:var(--muted);background:#15181b;font-size:9px}',
    '.opsOrderRow{grid-template-columns:minmax(120px,1.2fr) .9fr .8fr .8fr}',
    '.opsName b{display:block;font-size:11px}.opsName small{color:var(--muted);font-size:8px}',
    '.opsLow{border:1px solid #5b4b20;background:#2b2516;border-radius:14px;padding:11px;margin-bottom:12px;color:#f4d991;font-size:10px}',
    '.opsAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:7px 9px;min-height:36px;font-size:9px;font-weight:800}',
    '.opsOrderSelect{width:100%;min-height:38px;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;padding:6px;font-size:9px}',
    '.opsSection{margin-top:12px}.opsSection h2{font-size:13px;margin:0 0 9px}',
    '@media(max-width:800px){.opsMetrics{grid-template-columns:repeat(2,1fr)}.opsGrid{grid-template-columns:1fr}.opsRow{grid-template-columns:minmax(110px,1.4fr) .7fr .7fr auto}.opsRow .opsReserved{display:none}.opsOrderRow{grid-template-columns:minmax(105px,1.1fr) .8fr .8fr}.opsOrderRow .opsDate{display:none}}'
  ].join('');
  document.head.appendChild(style);

  let data=null;
  let loading=false;
  let businessId=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' AED'}catch{return Number(value||0).toFixed(2)+' AED'}}
  function date(value){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function isStore(){try{return String(workspace?.business?.business_type||'').toLowerCase()==='store'}catch{return false}}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}

  function ensureScreen(){
    let screen=q('#screen-operations');
    if(screen)return screen;
    screen=document.createElement('section');
    screen.className='screen';
    screen.id='screen-operations';
    screen.innerHTML='<div class="hero"><div><h1 id="opsTitle"></h1><p id="opsDesc"></p></div><button class="primary" id="opsAddProduct" type="button"></button></div><div id="opsBody"></div>';
    q('.content')?.appendChild(screen);

    const productModal=document.createElement('div');
    productModal.className='modal';productModal.id='opsProductModal';
    productModal.innerHTML='<form class="modalBox" id="opsProductForm"><h3 id="opsProductModalTitle"></h3><div class="field"><label id="opsSkuLabel"></label><input id="opsSku" maxlength="80" required></div><div class="field"><label id="opsNameLabel"></label><input id="opsName" maxlength="160" required></div><div class="field"><label id="opsPriceLabel"></label><input id="opsPrice" type="number" min="0" step="0.01" required></div><div class="field"><label id="opsQtyLabel"></label><input id="opsQty" type="number" min="0" step="1" required></div><div class="modalActions"><button type="button" class="secondary" id="opsProductCancel"></button><button class="primary" id="opsProductSave" type="submit"></button></div></form>';
    document.body.appendChild(productModal);

    const stockModal=document.createElement('div');
    stockModal.className='modal';stockModal.id='opsStockModal';
    stockModal.innerHTML='<form class="modalBox" id="opsStockForm"><h3 id="opsStockTitle"></h3><input id="opsStockProductId" type="hidden"><div class="field"><label id="opsStockQtyLabel"></label><input id="opsStockQty" type="number" min="0" step="1" required></div><div class="modalActions"><button type="button" class="secondary" id="opsStockCancel"></button><button class="primary" id="opsStockSave" type="submit"></button></div></form>';
    document.body.appendChild(stockModal);

    q('#opsAddProduct').onclick=()=>q('#opsProductModal').classList.add('open');
    q('#opsProductCancel').onclick=()=>q('#opsProductModal').classList.remove('open');
    q('#opsStockCancel').onclick=()=>q('#opsStockModal').classList.remove('open');
    q('#opsProductForm').onsubmit=createProduct;
    q('#opsStockForm').onsubmit=saveStock;
    [productModal,stockModal].forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')}));
    applyCopy();
    return screen;
  }

  function applyCopy(){
    const t=text();
    if(q('#opsTitle'))q('#opsTitle').textContent=t.title;
    if(q('#opsDesc'))q('#opsDesc').textContent=t.desc;
    if(q('#opsAddProduct'))q('#opsAddProduct').textContent=t.add;
    if(q('#opsProductModalTitle'))q('#opsProductModalTitle').textContent=t.add;
    if(q('#opsSkuLabel'))q('#opsSkuLabel').textContent=t.sku;
    if(q('#opsNameLabel'))q('#opsNameLabel').textContent=t.name;
    if(q('#opsPriceLabel'))q('#opsPriceLabel').textContent=t.price;
    if(q('#opsQtyLabel'))q('#opsQtyLabel').textContent=t.qty;
    if(q('#opsProductCancel'))q('#opsProductCancel').textContent=t.cancel;
    if(q('#opsProductSave'))q('#opsProductSave').textContent=t.save;
    if(q('#opsStockTitle'))q('#opsStockTitle').textContent=t.editStock;
    if(q('#opsStockQtyLabel'))q('#opsStockQtyLabel').textContent=t.qty;
    if(q('#opsStockCancel'))q('#opsStockCancel').textContent=t.cancel;
    if(q('#opsStockSave'))q('#opsStockSave').textContent=t.update;
    if(current==='operations'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={}){
    if(!businessId)businessId=workspace?.business?.id||null;
    const url='/api/owner-operations?business_id='+encodeURIComponent(businessId||'');
    const response=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'OWNER_OPERATIONS_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isStore())return;
    businessId=workspace?.business?.id||businessId;
    if(loading||(!force&&data&&data.business_id===businessId))return;
    loading=true;render();
    try{data=await request();render()}catch(error){data={error:error.message};render()}finally{loading=false;render()}
  }

  function statusOptions(current){
    const t=text();
    const labels={draft:t.draft,reserved:t.reservedStatus,confirmed:t.confirmed,cancelled:t.cancelled,completed:t.completed};
    return Object.entries(labels).map(([value,label])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+escapeHtml(label)+'</option>').join('');
  }

  function render(){
    const body=q('#opsBody');
    if(!body)return;
    const t=text();
    if(loading&&!data){body.innerHTML='<div class="empty">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class="empty">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class="empty">'+escapeHtml(t.loading)+'</div>';return}
    const m=data.metrics||{};
    const low=data.low_stock||[];
    const realOrders=(data.orders||[]).filter(order=>order.simulated===false);
    const products=data.products||[];
    if(q('#opsAddProduct'))q('#opsAddProduct').style.display=data.can_manage?'inline-flex':'none';

    const metrics=[
      [t.products,m.active_products||0],[t.stock,m.inventory_units||0],[t.low,m.low_stock_products||0],[t.sales,money(m.recognized_sales_aed||0)]
    ].map(([label,value])=>'<div class="opsMetric"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>').join('');

    const lowHtml='<div class="opsLow"><b>'+escapeHtml(t.lowTitle)+'</b><div style="margin-top:5px">'+(low.length?low.slice(0,8).map(p=>escapeHtml(p.name)+' · '+escapeHtml(p.available)+' '+escapeHtml(t.available)).join('<br>'):escapeHtml(t.lowNone))+'</div></div>';

    const productRows=products.length?products.map(product=>'<div class="opsRow"><div class="opsName"><b>'+escapeHtml(product.name)+'</b><small>'+escapeHtml(product.sku)+'</small></div><span>'+escapeHtml(money(product.price_aed))+'</span><span>'+escapeHtml(product.available)+'</span><span class="opsReserved">'+escapeHtml(product.reserved)+'</span>'+(data.can_manage?'<button class="opsAction" data-ops-stock="'+escapeHtml(product.id)+'" data-ops-qty="'+escapeHtml(product.quantity)+'">'+escapeHtml(t.editStock)+'</button>':'<span></span>')+'</div>').join(''):'<div class="empty">'+escapeHtml(t.noProducts)+'</div>';
    const productsHtml='<div class="opsSection"><h2>'+escapeHtml(t.products)+'</h2><div class="opsTable"><div class="opsRow head"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.available)+'</span><span class="opsReserved">'+escapeHtml(t.reserved)+'</span><span></span></div>'+productRows+'</div></div>';

    const orderRows=realOrders.length?realOrders.map(order=>'<div class="opsRow opsOrderRow"><div class="opsName"><b>'+escapeHtml(order.customer_name||t.customer)+'</b><small>'+escapeHtml(String(order.id||'').slice(0,8))+'</small></div><span>'+escapeHtml(money(order.total_aed))+'</span>'+(data.can_manage?'<select class="opsOrderSelect" data-ops-order="'+escapeHtml(order.id)+'">'+statusOptions(String(order.status||'draft'))+'</select>':'<span>'+escapeHtml(order.status)+'</span>')+'<span class="opsDate">'+escapeHtml(date(order.created_at))+'</span></div>').join(''):'<div class="empty">'+escapeHtml(t.noOrders)+'</div>';
    const ordersHtml='<div class="opsSection"><h2>'+escapeHtml(t.orders)+'</h2><div class="opsTable"><div class="opsRow opsOrderRow head"><span>'+escapeHtml(t.customer)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.status)+'</span><span class="opsDate">'+escapeHtml(t.date)+'</span></div>'+orderRows+'</div><div class="truth" style="margin-top:9px">'+escapeHtml(t.simulated)+'</div></div>';

    body.innerHTML='<div class="opsMetrics">'+metrics+'</div>'+lowHtml+'<div class="opsGrid"><div>'+productsHtml+'</div><div>'+ordersHtml+'</div></div>';
    qa('[data-ops-stock]').forEach(button=>button.onclick=()=>{
      q('#opsStockProductId').value=button.dataset.opsStock;
      q('#opsStockQty').value=button.dataset.opsQty||0;
      q('#opsStockModal').classList.add('open');
    });
    qa('[data-ops-order]').forEach(select=>select.onchange=()=>updateOrder(select.dataset.opsOrder,select.value));
  }

  async function mutate(payload){
    const response=await fetch('/api/owner-operations',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.detail||result.error||'OWNER_OPERATION_FAILED');
    return result;
  }

  async function createProduct(event){
    event.preventDefault();
    const t=text();const button=q('#opsProductSave');if(button)button.disabled=true;
    try{
      await mutate({action:'create_product',sku:q('#opsSku').value,name:q('#opsName').value,price_aed:q('#opsPrice').value,quantity:q('#opsQty').value});
      q('#opsProductForm').reset();q('#opsProductModal').classList.remove('open');notify(t.created);data=null;await load(true);
    }catch(error){notify(t.failed+' — '+error.message)}finally{if(button)button.disabled=false}
  }

  async function saveStock(event){
    event.preventDefault();
    const t=text();const button=q('#opsStockSave');if(button)button.disabled=true;
    try{
      await mutate({action:'set_inventory',product_id:q('#opsStockProductId').value,quantity:q('#opsStockQty').value});
      q('#opsStockModal').classList.remove('open');notify(t.updated);data=null;await load(true);
    }catch(error){notify(t.failed+' — '+error.message)}finally{if(button)button.disabled=false}
  }

  async function updateOrder(orderId,status){
    const t=text();
    try{await mutate({action:'update_order_status',order_id:orderId,status});notify(t.orderUpdated);data=null;await load(true)}catch(error){notify(t.failed+' — '+error.message);data=null;await load(true)}
  }

  ensureScreen();

  try{
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const result=baseShowScreen(name);
      if(name==='operations'){
        ensureScreen();if(q('#pageTitle'))q('#pageTitle').textContent=text().nav;load();
      }
      return result;
    };
  }catch{}

  try{
    const baseRenderAll=renderAll;
    renderAll=function(){const result=baseRenderAll.apply(this,arguments);ensureScreen();applyCopy();if(current==='operations')load();return result};
  }catch{}

  new MutationObserver(applyCopy).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(()=>{ensureScreen();if(isStore())load()},600);
})();

(()=>{
  if(window.__dabbirServiceOperations)return;
  const style=document.createElement('style');
  style.dataset.dabbirServices='v1';
  style.textContent="\n.svcHero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.svcHero h1{margin:0 0 5px;font-size:25px}.svcHero p{margin:0;color:var(--muted);font-size:11px;line-height:1.7}.svcTruth{border:1px solid #314132;background:#152019;border-radius:13px;padding:10px 12px;margin-bottom:10px;color:#bfe8c7;font-size:9px}.svcMetrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:11px}.svcMetric{border:1px solid var(--line);background:#111315;border-radius:14px;padding:12px}.svcMetric span{display:block;color:var(--muted);font-size:9px}.svcMetric strong{display:block;font-size:22px;margin-top:5px}.svcTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}.svcRow{display:grid;grid-template-columns:minmax(150px,1fr) .58fr .55fr .55fr auto;gap:9px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:10px}.svcRow:last-child{border-bottom:0}.svcRow.head{background:#15181b;color:var(--muted);font-size:9px}.svcName b{display:block;font-size:11px}.svcName small{color:var(--muted);font-size:8px}.svcPrice{font-weight:900;white-space:nowrap}.svcStatus{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900}.svcStatus.on{background:#14331e;color:var(--green)}.svcStatus.off{background:#2b2d31;color:#aab0b7}.svcAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:7px 9px;min-height:38px;font-size:9px;font-weight:800}.svcEmpty{padding:22px;text-align:center;color:var(--muted);font-size:10px}@media(max-width:700px){.svcHero{align-items:center}.svcHero h1{font-size:20px}.svcRow{grid-template-columns:minmax(105px,1fr) .62fr .62fr auto;gap:7px}.svcRow .svcStateCol{display:none}.svcRow{font-size:9px}.svcName b{font-size:10px}}\n";
  document.head.append(style);

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(workspace?.business?.business_type||'').toLowerCase();
  const isServiceBusiness=()=>Boolean(businessType())&&businessType()!=='store';
  let data=null;
  let loading=false;
  let editingId=null;
  let observedScreen=null;

  const copy=()=>ar()?{
    nav:'الخدمات',title:'الخدمات',desc:'الخدمات الفعلية التي يقدمها نشاطك. دَبِّر يستخدم الخدمات النشطة عند الرد على العملاء.',truth:'الخدمات النشطة هنا تُعامل كمعلومة تشغيلية حية لدى AI.',add:'إضافة خدمة',name:'اسم الخدمة',price:'قيمة الخدمة',aed:'درهم',duration:'المدة',minutes:'دقيقة',status:'الحالة',active:'نشطة',inactive:'متوقفة',edit:'تعديل',save:'حفظ',cancel:'إلغاء',empty:'لا توجد خدمات بعد.',loading:'جارٍ تحميل الخدمات…',failed:'تعذر تحميل الخدمات.',created:'تمت إضافة الخدمة.',updated:'تم تحديث الخدمة.',activeMetric:'الخدمات النشطة',totalMetric:'إجمالي الخدمات'
  }:{
    nav:'Services',title:'Services',desc:'The real services your business provides. DABBIR uses active services when replying to customers.',truth:'Active services here are treated as live operational facts by AI.',add:'Add service',name:'Service name',price:'Service price',aed:'AED',duration:'Duration',minutes:'min',status:'Status',active:'Active',inactive:'Inactive',edit:'Edit',save:'Save',cancel:'Cancel',empty:'No services yet.',loading:'Loading services…',failed:'Could not load services.',created:'Service added.',updated:'Service updated.',activeMetric:'Active services',totalMetric:'Total services'
  };

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}
  function money(value){const n=Number(value||0);return Number.isFinite(n)?n.toLocaleString(ar()?'ar-AE':'en-AE',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2}):'0'}

  function ensureScreen(){
    if(!isServiceBusiness())return null;
    let screen=q('#screen-operations');
    if(!screen){
      screen=document.createElement('section');
      screen.id='screen-operations';
      screen.className='screen';
      q('.content')?.append(screen);
    }
    if(!q('#dabbirServicesRoot')){
      screen.innerHTML='<div id="dabbirServicesRoot"><div class="svcHero"><div><h1 id="svcTitle"></h1><p id="svcDesc"></p></div><button id="svcAdd" class="primary" type="button"></button></div><div id="svcTruth" class="svcTruth"></div><div id="svcBody"></div></div>';
    }
    return screen;
  }

  function ensureModal(){
    if(q('#svcModal'))return;
    const modal=document.createElement('div');
    modal.id='svcModal';modal.className='modal';
    modal.innerHTML='<form id="svcForm" class="modalBox"><h3 id="svcModalTitle"></h3><div class="field"><label id="svcNameLabel"></label><input id="svcName" maxlength="160" required></div><div class="field"><label id="svcPriceLabel"></label><input id="svcPrice" type="number" inputmode="decimal" min="0" max="10000000" step="0.01" required></div><div class="field"><label id="svcDurationLabel"></label><input id="svcDuration" type="number" inputmode="numeric" min="1" max="1440" step="1" required></div><div class="field" id="svcActiveField"><label id="svcActiveLabel"></label><select id="svcActive"><option value="true"></option><option value="false"></option></select></div><div class="modalActions"><button id="svcCancel" type="button" class="secondary"></button><button id="svcSave" type="submit" class="primary"></button></div></form>';
    document.body.append(modal);
    q('#svcCancel').onclick=()=>modal.classList.remove('open');
    modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')});
    q('#svcForm').onsubmit=saveService;
  }

  function applyCopy(){
    if(!isServiceBusiness())return;
    ensureScreen();ensureModal();
    const t=copy();
    if(q('#svcTitle'))q('#svcTitle').textContent=t.title;
    if(q('#svcDesc'))q('#svcDesc').textContent=t.desc;
    if(q('#svcTruth'))q('#svcTruth').textContent=t.truth;
    if(q('#svcAdd'))q('#svcAdd').textContent=t.add;
    if(q('#svcNameLabel'))q('#svcNameLabel').textContent=t.name;
    if(q('#svcPriceLabel'))q('#svcPriceLabel').textContent=t.price+' ('+t.aed+')';
    if(q('#svcDurationLabel'))q('#svcDurationLabel').textContent=t.duration+' ('+t.minutes+')';
    if(q('#svcActiveLabel'))q('#svcActiveLabel').textContent=t.status;
    if(q('#svcActive option[value="true"]'))q('#svcActive option[value="true"]').textContent=t.active;
    if(q('#svcActive option[value="false"]'))q('#svcActive option[value="false"]').textContent=t.inactive;
    if(q('#svcCancel'))q('#svcCancel').textContent=t.cancel;
    if(q('#svcSave'))q('#svcSave').textContent=t.save;
    if(q('#svcAdd'))q('#svcAdd').onclick=()=>openModal(null);
    if(q('#screen-operations.active')&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={}){
    const id=workspace?.business?.id;
    if(!id)throw new Error('BUSINESS_REQUIRED');
    const response=await fetch('/api/service-catalog?business_id='+encodeURIComponent(id),{cache:'no-store',credentials:'same-origin',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error(payload?.detail||payload?.error||'SERVICE_CATALOG_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isServiceBusiness()||loading)return;
    const id=workspace?.business?.id;
    if(!id)return;
    if(!force&&data?.business_id===id)return render();
    loading=true;render();
    try{data=await request();render()}catch(error){data={business_id:id,error:String(error?.message||error)};render()}finally{loading=false;render()}
  }

  function render(){
    const body=q('#svcBody');
    if(!body||!isServiceBusiness())return;
    const t=copy();
    if(loading&&!data){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.loading)+'</div>';return}
    const services=Array.isArray(data.services)?data.services:[];
    const active=services.filter(service=>service.active!==false).length;
    const metrics='<div class="svcMetrics"><div class="svcMetric"><span>'+escapeHtml(t.activeMetric)+'</span><strong>'+active+'</strong></div><div class="svcMetric"><span>'+escapeHtml(t.totalMetric)+'</span><strong>'+services.length+'</strong></div></div>';
    const rows=services.length?services.map(service=>'<div class="svcRow"><div class="svcName"><b>'+escapeHtml(service.name)+'</b><small>'+escapeHtml(String(service.id||'').slice(0,8))+'</small></div><span class="svcPrice">'+escapeHtml(money(service.price_aed))+' '+escapeHtml(t.aed)+'</span><span>'+escapeHtml(service.duration_minutes)+' '+escapeHtml(t.minutes)+'</span><span class="svcStateCol"><span class="svcStatus '+(service.active!==false?'on':'off')+'">'+escapeHtml(service.active!==false?t.active:t.inactive)+'</span></span>'+(data.can_manage?'<button class="svcAction" data-svc-edit="'+escapeHtml(service.id)+'">'+escapeHtml(t.edit)+'</button>':'<span></span>')+'</div>').join(''):'<div class="svcEmpty">'+escapeHtml(t.empty)+'</div>';
    body.innerHTML=metrics+'<div class="svcTable"><div class="svcRow head"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.duration)+'</span><span class="svcStateCol">'+escapeHtml(t.status)+'</span><span></span></div>'+rows+'</div>';
    if(q('#svcAdd'))q('#svcAdd').style.display=data.can_manage?'inline-flex':'none';
    body.querySelectorAll('[data-svc-edit]').forEach(button=>button.addEventListener('click',()=>openModal(services.find(service=>service.id===button.dataset.svcEdit)||null)));
  }

  function openModal(service){
    const t=copy();editingId=service?.id||null;
    q('#svcModalTitle').textContent=service?t.edit:t.add;
    q('#svcName').value=service?.name||'';
    q('#svcPrice').value=Number(service?.price_aed||0).toFixed(2).replace(/\.00$/,'');
    q('#svcDuration').value=service?.duration_minutes||30;
    q('#svcActive').value=service?.active===false?'false':'true';
    q('#svcActiveField').style.display=service?'block':'none';
    q('#svcModal').classList.add('open');
  }

  async function saveService(event){
    event.preventDefault();
    if(loading)return;
    loading=true;
    const t=copy();
    try{
      const name=q('#svcName').value.trim();
      const price=Number(q('#svcPrice').value);
      const duration=Number(q('#svcDuration').value);
      const body=editingId?{action:'update_service',business_id:workspace.business.id,service_id:editingId,name,price_aed:price,duration_minutes:duration,active:q('#svcActive').value==='true'}:{action:'create_service',business_id:workspace.business.id,name,price_aed:price,duration_minutes:duration};
      const response=await fetch('/api/service-catalog',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.detail||payload?.error||'SERVICE_SAVE_FAILED');
      q('#svcModal').classList.remove('open');
      data=null;
      notify(editingId?t.updated:t.created);
      editingId=null;
      await load(true);
    }catch(error){notify(t.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}
  }

  function initialize(){
    if(!isServiceBusiness())return;
    applyCopy();
    const screen=ensureScreen();
    if(screen&&screen!==observedScreen){
      observedScreen=screen;
      new MutationObserver(()=>{if(screen.classList.contains('active')){applyCopy();load(false)}}).observe(screen,{attributes:true,attributeFilter:['class']});
    }
    if(current==='operations')load(false);
  }

  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result};

  try{
    const baseRenderAll=renderAll;
    renderAll=function(){const result=baseRenderAll.apply(this,arguments);initialize();return result};
  }catch{}

  setTimeout(initialize,500);
  window.__dabbirServiceOperations={refresh:()=>load(true),version:'service-catalog-v4-price'};
})();

(()=>{
  if(window.__dabbirActivityProfile)return;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  let state=null,loading=false,lastBusiness=null;
  let calendarView=(()=>{try{return localStorage.getItem('dabbir_calendar_view')||'month'}catch{return 'month'}})();
  if(!['day','week','month'].includes(calendarView))calendarView='month';
  let calendarCursor=new Date(),calendarConnections=null,calendarConnectionsBusiness=null,calendarConnectionsLoading=false;
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    operational:'تشغيلي',activityTasks:'مهام خاصة بهذا النشاط',activityDesc:'دَبِّر يغيّر الأولويات والوحدات حسب نوع نشاطك، وليس بنفس القالب لكل الأعمال.',pending:'مطلوبة',progress:'قيد التنفيذ',done:'مكتملة',complete:'تم',reopen:'إعادة فتح',priority:'الأولوية',followups:'المتابعات',handoffs:'التدخل البشري',loading:'جارٍ تحميل مهام النشاط…',empty:'لا توجد مهام نشاط مفتوحة.',customersDesc:'السجلات المرتبطة بهذا النوع من النشاط.',appointmentsDesc:'المواعيد والجدول التشغيلي لهذا النشاط.',tasksDesc:'المهام التشغيلية الخاصة بنوع نشاطك، إضافة إلى المتابعات والتدخلات البشرية.',dashboardDesc:'لوحة تشغيل مخصصة لهذا النوع من النشاط من بياناتك الفعلية.',conversationsDesc:'الاستفسارات والمحادثات المرتبطة بهذا النوع من النشاط.',
    calendar:'التقويم',today:'اليوم',day:'يومي',week:'أسبوعي',month:'شهري',previous:'السابق',next:'التالي',noDayBookings:'لا توجد حجوزات في هذا اليوم.',calendarSync:'ربط التقويم',calendarSyncDesc:'تقويم دبّر هو الأساس. يمكنك ربط Google Calendar أو Outlook ومتابعة حالة الاتصال من هنا.',google:'Google Calendar',outlook:'Outlook / Microsoft 365',connect:'ربط',disconnect:'فصل',connected:'متصل',notConnected:'غير متصل',providerSetup:'يحتاج إعداد OAuth',loadingConnections:'جارٍ فحص الربط…',connectionFailed:'تعذر فحص حالة التقويم',calendarConnected:'تم ربط التقويم بنجاح',calendarError:'تعذر إكمال ربط التقويم',statusRequested:'مطلوب',statusConfirmed:'مؤكد',statusCancelled:'ملغي',statusCompleted:'مكتمل',busy:'مشغول'
  }:{
    operational:'Operational',activityTasks:'Activity-specific tasks',activityDesc:'DABBIR changes priorities and modules by business type instead of using one template for every business.',pending:'Pending',progress:'In progress',done:'Done',complete:'Done',reopen:'Reopen',priority:'Priority',followups:'Follow-ups',handoffs:'Human intervention',loading:'Loading activity tasks…',empty:'No open activity tasks.',customersDesc:'Records relevant to this business type.',appointmentsDesc:'The operational schedule for this business type.',tasksDesc:'Operational tasks for this business type, plus follow-ups and human handoffs.',dashboardDesc:'An operations dashboard tailored to this business type using live data.',conversationsDesc:'Inquiries and conversations relevant to this business type.',
    calendar:'Calendar',today:'Today',day:'Day',week:'Week',month:'Month',previous:'Previous',next:'Next',noDayBookings:'No bookings on this day.',calendarSync:'Calendar connections',calendarSyncDesc:'DABBIR Calendar is the source of truth. Connect Google Calendar or Outlook and manage the connection here.',google:'Google Calendar',outlook:'Outlook / Microsoft 365',connect:'Connect',disconnect:'Disconnect',connected:'Connected',notConnected:'Not connected',providerSetup:'OAuth setup required',loadingConnections:'Checking calendar connections…',connectionFailed:'Could not check calendar status',calendarConnected:'Calendar connected successfully',calendarError:'Calendar connection could not be completed',statusRequested:'Requested',statusConfirmed:'Confirmed',statusCancelled:'Cancelled',statusCompleted:'Completed',busy:'Busy'
  };

  const style=document.createElement('style');
  style.textContent=[
    '.activityIdentity{display:flex;align-items:center;gap:8px;margin:8px 0 0}.activityPill{display:inline-flex;align-items:center;border:1px solid #3a4330;background:#172016;color:var(--accent);padding:5px 9px;border-radius:999px;font-size:9px;font-weight:900}.activityTaskCard{margin-bottom:12px}.activityTaskGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.activityTask{border:1px solid #292f34;background:#15181b;border-radius:14px;padding:11px;display:flex;gap:10px;align-items:flex-start}.activityTask .grow{flex:1;min-width:0}.activityTask b{display:block;font-size:11px;line-height:1.5}.activityTask small{display:block;color:var(--muted);font-size:8px;margin-top:4px}.activityTask button{min-height:34px;padding:6px 9px}.activityDone{opacity:.58}.activityPriority{font-size:8px;color:var(--yellow);font-weight:900}.navBtn>.navIcon{display:none!important}',
    '.dabbirCalendarShell{display:grid;gap:12px}.dabbirCalendarCard{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;overflow:hidden}.dabbirCalendarToolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.dabbirCalendarNav,.dabbirCalendarViews{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.dabbirCalendarTitle{font-size:14px;font-weight:900;min-width:160px}.dabbirCalendarToolbar button{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:7px 10px;min-height:38px;font-size:10px}.dabbirCalendarToolbar button.on{border-color:#4f46e5;background:#24204e;color:#fff}.dabbirCalendarToolbar .todayBtn{background:#252c1d;border-color:#414d2a}.dabbirMonthWeekdays,.dabbirMonthGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.dabbirMonthWeekdays span{text-align:center;color:var(--muted);font-size:9px;padding:5px 2px}.dabbirCalDay{border:1px solid #252a2f;background:#15181b;border-radius:11px;min-height:92px;padding:6px;min-width:0}.dabbirCalDay.out{opacity:.38}.dabbirCalDay.today{border-color:#4f46e5;box-shadow:inset 0 0 0 1px #4f46e555}.dabbirCalDate{display:flex;align-items:center;justify-content:space-between;font-size:9px;font-weight:900;margin-bottom:5px}.dabbirCalCount{color:var(--muted);font-size:8px}.dabbirCalEvent{display:block;width:100%;border:0;background:#14243a;color:#d7e8ff;border-radius:7px;padding:5px 6px;margin-top:4px;text-align:start;min-height:0;font-size:8px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dabbirCalEvent.cancelled{background:#34191b;color:#ffb9b9}.dabbirCalEvent.completed{background:#17311f;color:#bce8c7}.dabbirCalEvent.requested{background:#3a3014;color:#ffe29c}.dabbirAgenda{display:grid;gap:7px}.dabbirAgendaRow{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;align-items:stretch}.dabbirAgendaTime{color:var(--muted);font-size:9px;padding:9px 4px;text-align:center}.dabbirAgendaSlot{border:1px solid #292f34;background:#15181b;border-radius:10px;min-height:46px;padding:6px}.dabbirAgendaEvent{border:1px solid #334861;background:#14243a;border-radius:8px;padding:7px 8px;font-size:9px}.dabbirWeek{overflow-x:auto;padding-bottom:3px}.dabbirWeekGrid{display:grid;grid-template-columns:repeat(7,minmax(112px,1fr));gap:6px;min-width:784px}.dabbirWeekDay{border:1px solid #292f34;background:#15181b;border-radius:11px;padding:7px;min-height:150px}.dabbirWeekDay.today{border-color:#4f46e5}.dabbirWeekHead{font-size:9px;font-weight:900;margin-bottom:7px}.dabbirCalendarEmpty{border:1px dashed #31363c;border-radius:12px;padding:18px;text-align:center;color:var(--muted);font-size:10px}.dabbirCalendarConnections{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}.dabbirCalendarConnectionsHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:9px}.dabbirCalendarConnectionsHead h3{font-size:12px;margin:0 0 3px}.dabbirCalendarConnectionsHead p{font-size:9px;color:var(--muted);margin:0;line-height:1.55}.dabbirProviderGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dabbirProvider{border:1px solid #292f34;background:#15181b;border-radius:12px;padding:10px}.dabbirProviderTop{display:flex;gap:8px;justify-content:space-between;align-items:center}.dabbirProvider b{font-size:10px}.dabbirProvider small{display:block;color:var(--muted);font-size:8px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dabbirProvider button,.dabbirProvider a{display:inline-flex;align-items:center;justify-content:center;border-radius:9px;padding:6px 9px;min-height:36px;font-size:9px;font-weight:850;text-decoration:none}.dabbirProvider a{background:#252c1d;border:1px solid #414d2a}.dabbirProvider button{background:#181b1f;border:1px solid var(--line);color:#fff}.dabbirProvider button:disabled{opacity:.55}.dabbirProviderBadge{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900;background:#25282d;color:#c5cad0}.dabbirProviderBadge.ok{background:#14331e;color:var(--green)}.dabbirProviderBadge.warn{background:#3a3014;color:var(--yellow)}',
    '@media(max-width:700px){.activityTaskGrid{grid-template-columns:1fr}.dabbirCalendarCard{padding:9px;border-radius:15px}.dabbirCalendarToolbar{align-items:stretch}.dabbirCalendarTitle{order:-1;width:100%;text-align:center}.dabbirCalendarNav,.dabbirCalendarViews{flex:1;justify-content:center}.dabbirMonthWeekdays,.dabbirMonthGrid{gap:3px}.dabbirMonthWeekdays span{font-size:8px}.dabbirCalDay{min-height:74px;padding:4px;border-radius:8px}.dabbirCalDate{font-size:8px}.dabbirCalEvent{font-size:7px;padding:4px}.dabbirCalCount{display:none}.dabbirProviderGrid{grid-template-columns:1fr}.dabbirAgendaRow{grid-template-columns:58px minmax(0,1fr)}}'
  ].join('');
  document.head.append(style);

  function businessId(){return workspace?.business?.id||null}
  function setText(selector,value){const el=q(selector);if(el&&value!==undefined&&value!==null)el.textContent=value}
  function setLabel(screen,value){qa('[data-screen="'+screen+'"] [data-label]').forEach(el=>{if(value)el.textContent=value})}
  function dayKey(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
  function startOfWeek(value){const d=new Date(value);d.setHours(0,0,0,0);const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);return d}
  function plusDays(value,days){const d=new Date(value);d.setDate(d.getDate()+days);return d}
  function fmtTime(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
  function fmtDay(value,opts={}){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',opts).format(value)}catch{return ''}}
  function customerLabel(id){const row=(workspace?.customers||[]).find(x=>x.id===id);return row?.display_name||(ar()?'عميل':'Customer')}
  function appointmentStatus(value){const t=copy(),s=String(value||'').toLowerCase();if(['cancelled','canceled'].includes(s))return {label:t.statusCancelled,cls:'cancelled'};if(['completed','done'].includes(s))return {label:t.statusCompleted,cls:'completed'};if(['confirmed','approved'].includes(s))return {label:t.statusConfirmed,cls:'confirmed'};return {label:t.statusRequested,cls:'requested'}}
  function appointments(){return (workspace?.appointments||[]).filter(a=>a?.starts_at&&!Number.isNaN(new Date(a.starts_at).getTime())).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}

  function ensureTaskCard(){
    const screen=q('#screen-tasks');if(!screen)return null;
    let card=q('#activityTaskCard');if(card)return card;
    card=document.createElement('section');card.id='activityTaskCard';card.className='card activityTaskCard';
    const grid=screen.querySelector('.grid2');screen.insertBefore(card,grid||screen.firstChild);
    return card;
  }

  function patchDictionary(p){
    if(typeof D==='undefined'||!D.ar||!D.en)return;
    D.ar.conversations=p.conversation_ar;D.en.conversations=p.conversation_en;
    D.ar.convTitle=p.conversation_ar;D.en.convTitle=p.conversation_en;
    D.ar.customers=p.customer_ar;D.en.customers=p.customer_en;
    D.ar.customer=p.customer_ar;D.en.customer=p.customer_en;
    D.ar.customersCount=p.customer_ar;D.en.customersCount=p.customer_en;
    D.ar.custTitle=p.customer_ar;D.en.custTitle=p.customer_en;
    D.ar.tasks=p.tasks_ar;D.en.tasks=p.tasks_en;
    D.ar.tasksTitle=p.tasks_ar;D.en.tasksTitle=p.tasks_en;
    D.ar.dashTitle=p.dashboard_ar;D.en.dashTitle=p.dashboard_en;
    if(p.show_appointments){
      D.ar.appointments=p.appointments_ar;D.en.appointments=p.appointments_en;
      D.ar.apptTitle=p.appointments_ar;D.en.apptTitle=p.appointments_en;
      D.ar.todayAppointments=p.appointments_ar;D.en.todayAppointments=p.appointments_en;
      D.ar.newAppointment='إضافة '+p.appointments_ar;D.en.newAppointment='Add '+String(p.appointments_en||'appointment').toLowerCase();
    }else{
      D.ar.todayAppointments='المتابعات';D.en.todayAppointments='Follow-ups';
    }
  }

  function ensureCalendar(){
    const screen=q('#screen-appointments');if(!screen)return null;
    let shell=q('#dabbirCalendarShell');
    if(!shell){
      shell=document.createElement('div');shell.id='dabbirCalendarShell';shell.className='dabbirCalendarShell';
      const table=q('#appointmentsTable');if(table){table.style.display='none';table.parentNode.insertBefore(shell,table)}else screen.append(shell);
    }
    return shell;
  }

  function calendarTitle(){
    if(calendarView==='month')return fmtDay(calendarCursor,{month:'long',year:'numeric'});
    if(calendarView==='day')return fmtDay(calendarCursor,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const start=startOfWeek(calendarCursor),end=plusDays(start,6);
    return fmtDay(start,{day:'numeric',month:'short'})+' — '+fmtDay(end,{day:'numeric',month:'short',year:'numeric'});
  }

  function monthBody(rows){
    const t=copy(),year=calendarCursor.getFullYear(),month=calendarCursor.getMonth(),first=new Date(year,month,1),start=startOfWeek(first),today=dayKey(new Date());
    const weekdays=ar()?['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const groups=new Map();rows.forEach(a=>{const key=dayKey(a.starts_at);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a)});
    let cells='';for(let i=0;i<42;i++){
      const d=plusDays(start,i),key=dayKey(d),events=groups.get(key)||[],outside=d.getMonth()!==month;
      cells+='<div class="dabbirCalDay '+(outside?'out ':'')+(key===today?'today':'')+'"><div class="dabbirCalDate"><span>'+esc(String(d.getDate()))+'</span>'+(events.length?'<span class="dabbirCalCount">'+events.length+'</span>':'')+'</div>'+events.slice(0,3).map(a=>{const s=appointmentStatus(a.status);return '<button type="button" class="dabbirCalEvent '+s.cls+'" data-calendar-day="'+esc(key)+'" title="'+esc(customerLabel(a.customer_id)+' · '+fmtTime(a.starts_at))+'">'+esc(fmtTime(a.starts_at)+' · '+customerLabel(a.customer_id))+'</button>'}).join('')+(events.length>3?'<button type="button" class="dabbirCalEvent" data-calendar-day="'+esc(key)+'">+'+(events.length-3)+'</button>':'')+'</div>';
    }
    return '<div class="dabbirMonthWeekdays">'+weekdays.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><div class="dabbirMonthGrid">'+cells+'</div>';
  }

  function dayBody(rows){
    const t=copy(),key=dayKey(calendarCursor),todayRows=rows.filter(a=>dayKey(a.starts_at)===key),byHour=new Map();
    todayRows.forEach(a=>{const h=new Date(a.starts_at).getHours();if(!byHour.has(h))byHour.set(h,[]);byHour.get(h).push(a)});
    const hours=[];for(let h=7;h<=21;h++)hours.push(h);
    const body=hours.map(h=>{
      const slot=byHour.get(h)||[];const clock=new Date(calendarCursor);clock.setHours(h,0,0,0);
      return '<div class="dabbirAgendaRow"><div class="dabbirAgendaTime">'+esc(fmtTime(clock))+'</div><div class="dabbirAgendaSlot">'+slot.map(a=>{const s=appointmentStatus(a.status);return '<div class="dabbirAgendaEvent"><b>'+esc(customerLabel(a.customer_id))+'</b><div class="muted">'+esc(fmtTime(a.starts_at)+' · '+s.label)+'</div></div>'}).join('')+'</div></div>';
    }).join('');
    return todayRows.length?'<div class="dabbirAgenda">'+body+'</div>':'<div class="dabbirCalendarEmpty">'+esc(t.noDayBookings)+'</div>';
  }

  function weekBody(rows){
    const t=copy(),start=startOfWeek(calendarCursor),today=dayKey(new Date());let out='<div class="dabbirWeek"><div class="dabbirWeekGrid">';
    for(let i=0;i<7;i++){
      const d=plusDays(start,i),key=dayKey(d),events=rows.filter(a=>dayKey(a.starts_at)===key);
      out+='<div class="dabbirWeekDay '+(key===today?'today':'')+'"><div class="dabbirWeekHead">'+esc(fmtDay(d,{weekday:'short',day:'numeric',month:'short'}))+'</div>'+(events.length?events.map(a=>{const s=appointmentStatus(a.status);return '<button type="button" class="dabbirCalEvent '+s.cls+'" data-calendar-day="'+esc(key)+'">'+esc(fmtTime(a.starts_at)+' · '+customerLabel(a.customer_id))+'</button>'}).join(''):'<div class="muted" style="font-size:8px">—</div>')+'</div>';
    }
    return out+'</div></div>';
  }

  function providerCard(provider,title){
    const t=copy(),connections=calendarConnections?.connections||[],row=connections.find(c=>c.provider===provider&&c.status==='active'),configured=Boolean(calendarConnections?.providers?.[provider]?.configured),id=businessId();
    const badge=row?'<span class="dabbirProviderBadge ok">'+esc(t.connected)+'</span>':configured?'<span class="dabbirProviderBadge">'+esc(t.notConnected)+'</span>':'<span class="dabbirProviderBadge warn">'+esc(t.providerSetup)+'</span>';
    const account=row?'<small>'+esc(row.provider_email||row.provider_display_name||'')+'</small>':'<small>'+esc(configured?t.notConnected:t.providerSetup)+'</small>';
    const action=row?'<button type="button" data-calendar-disconnect="'+esc(row.id)+'">'+esc(t.disconnect)+'</button>':configured?'<a href="/api/calendar-oauth-start?provider='+encodeURIComponent(provider)+'&business_id='+encodeURIComponent(id||'')+'">'+esc(t.connect)+'</a>':'<button type="button" disabled>'+esc(t.connect)+'</button>';
    return '<div class="dabbirProvider"><div class="dabbirProviderTop"><div><b>'+esc(title)+'</b>'+account+'</div>'+badge+'</div><div style="margin-top:8px">'+action+'</div></div>';
  }

  function renderCalendarConnections(){
    const host=q('#dabbirCalendarConnections');if(!host)return;const t=copy();
    if(calendarConnectionsLoading&&!calendarConnections){host.innerHTML='<div class="dabbirCalendarEmpty">'+esc(t.loadingConnections)+'</div>';return}
    if(!calendarConnections){host.innerHTML='<div class="dabbirCalendarEmpty">'+esc(t.connectionFailed)+'</div>';return}
    host.innerHTML='<div class="dabbirProviderGrid">'+providerCard('google',t.google)+providerCard('outlook',t.outlook)+'</div>';
    host.querySelectorAll('[data-calendar-disconnect]').forEach(btn=>btn.onclick=()=>disconnectCalendar(btn.dataset.calendarDisconnect));
  }

  async function loadCalendarConnections(force=false){
    const id=businessId();if(!id||calendarConnectionsLoading)return;
    if(!force&&calendarConnections&&calendarConnectionsBusiness===id){renderCalendarConnections();return}
    calendarConnectionsLoading=true;renderCalendarConnections();
    try{
      const response=await fetch('/api/calendar-connections?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'CALENDAR_CONNECTIONS_FAILED');
      calendarConnections=body;calendarConnectionsBusiness=id;
    }catch(error){calendarConnections=null;calendarConnectionsBusiness=id;console.error('dabbir_calendar_connections_ui_failed',String(error?.message||error).slice(0,120))}
    finally{calendarConnectionsLoading=false;renderCalendarConnections()}
  }

  async function disconnectCalendar(connectionId){
    const id=businessId();if(!id||!connectionId)return;
    try{
      const response=await fetch('/api/calendar-connections',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({action:'disconnect',business_id:id,connection_id:connectionId})});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'CALENDAR_DISCONNECT_FAILED');
      calendarConnections=null;await loadCalendarConnections(true);
      try{toast(ar()?'تم فصل التقويم':'Calendar disconnected')}catch{}
    }catch(error){try{toast(ar()?'تعذر فصل التقويم':'Could not disconnect calendar')}catch{}}
  }

  function bindCalendarControls(shell){
    shell.querySelectorAll('[data-calendar-view]').forEach(btn=>btn.onclick=()=>{calendarView=btn.dataset.calendarView;try{localStorage.setItem('dabbir_calendar_view',calendarView)}catch{}renderCalendar()});
    shell.querySelector('[data-calendar-today]')?.addEventListener('click',()=>{calendarCursor=new Date();renderCalendar()},{once:true});
    shell.querySelector('[data-calendar-prev]')?.addEventListener('click',()=>{if(calendarView==='month')calendarCursor.setMonth(calendarCursor.getMonth()-1);else calendarCursor=plusDays(calendarCursor,calendarView==='week'?-7:-1);renderCalendar()},{once:true});
    shell.querySelector('[data-calendar-next]')?.addEventListener('click',()=>{if(calendarView==='month')calendarCursor.setMonth(calendarCursor.getMonth()+1);else calendarCursor=plusDays(calendarCursor,calendarView==='week'?7:1);renderCalendar()},{once:true});
    shell.querySelectorAll('[data-calendar-day]').forEach(btn=>btn.onclick=()=>{const parts=btn.dataset.calendarDay.split('-').map(Number);calendarCursor=new Date(parts[0],parts[1]-1,parts[2]);calendarView='day';try{localStorage.setItem('dabbir_calendar_view','day')}catch{}renderCalendar()});
  }

  function renderCalendar(){
    if(!state?.profile?.show_appointments)return;const shell=ensureCalendar();if(!shell)return;const t=copy(),rows=appointments();
    const body=calendarView==='month'?monthBody(rows):calendarView==='week'?weekBody(rows):dayBody(rows);
    shell.innerHTML='<section class="dabbirCalendarCard"><div class="dabbirCalendarToolbar"><div class="dabbirCalendarNav"><button type="button" data-calendar-prev aria-label="'+esc(t.previous)+'">‹</button><button type="button" class="todayBtn" data-calendar-today>'+esc(t.today)+'</button><button type="button" data-calendar-next aria-label="'+esc(t.next)+'">›</button></div><div class="dabbirCalendarTitle">'+esc(calendarTitle())+'</div><div class="dabbirCalendarViews"><button type="button" data-calendar-view="day" class="'+(calendarView==='day'?'on':'')+'">'+esc(t.day)+'</button><button type="button" data-calendar-view="week" class="'+(calendarView==='week'?'on':'')+'">'+esc(t.week)+'</button><button type="button" data-calendar-view="month" class="'+(calendarView==='month'?'on':'')+'">'+esc(t.month)+'</button></div></div>'+body+'<div class="dabbirCalendarConnections"><div class="dabbirCalendarConnectionsHead"><div><h3>'+esc(t.calendarSync)+'</h3><p>'+esc(t.calendarSyncDesc)+'</p></div></div><div id="dabbirCalendarConnections"></div></div></section>';
    bindCalendarControls(shell);renderCalendarConnections();loadCalendarConnections(false);
  }

  function applyProfile(){
    if(!state?.profile||!workspace?.business)return;
    const p=state.profile,t=copy();
    patchDictionary(p);
    document.body.dataset.dabbirActivity=state.business_type;
    const activityName=ar()?p.name_ar:p.name_en;
    const conversationLabel=ar()?p.conversation_ar:p.conversation_en;
    const customerLabel=ar()?p.customer_ar:p.customer_en;
    const appointmentLabel=ar()?p.appointments_ar:p.appointments_en;
    const taskLabel=ar()?p.tasks_ar:p.tasks_en;
    const dashboardLabel=ar()?p.dashboard_ar:p.dashboard_en;

    setText('#workspaceState',activityName+' • '+t.operational);
    setText('#dashTitle',dashboardLabel);
    setText('#dashDesc',t.dashboardDesc);
    setText('#convTitle',conversationLabel);
    setText('#convDesc',t.conversationsDesc);
    setText('#tasksTitle',taskLabel);
    setText('#tasksDesc',t.tasksDesc);
    setText('#custTitle',customerLabel);
    setText('#custDesc',t.customersDesc);
    setText('#handoffTitle',t.handoffs);
    setText('#followupsTitle',t.followups);
    setLabel('conversations',conversationLabel);
    setLabel('customers',customerLabel);
    setLabel('tasks',taskLabel);

    qa('[data-screen="appointments"]').forEach(el=>{el.style.display=p.show_appointments?'':'none'});
    if(p.show_appointments){
      setLabel('appointments',appointmentLabel);
      setText('#apptTitle',appointmentLabel);
      setText('#apptDesc',t.appointmentsDesc);
      if(q('#newApptBtn'))q('#newApptBtn').textContent=ar()?('إضافة '+appointmentLabel):('Add '+appointmentLabel.toLowerCase());
      renderCalendar();
    }else if(current==='appointments'&&typeof showScreen==='function')showScreen('dashboard');

    const serviceNav=q('#dabbirServicesNav');
    if(serviceNav)serviceNav.style.display=p.show_services?'':'none';
    if(!p.show_services&&!p.show_operations&&current==='operations'&&typeof showScreen==='function')showScreen('dashboard');

    const cards=qa('#dashCards .card.metric');
    if(cards[0]?.querySelector('span'))cards[0].querySelector('span').textContent=conversationLabel;
    if(cards[1]?.querySelector('span'))cards[1].querySelector('span').textContent=p.show_appointments?appointmentLabel:(ar()?'المتابعات':'Follow-ups');
    if(cards[2]?.querySelector('span'))cards[2].querySelector('span').textContent=customerLabel;

    let identity=q('#activityIdentity');
    if(!identity&&q('#screen-dashboard .hero>div')){
      identity=document.createElement('div');identity.id='activityIdentity';identity.className='activityIdentity';
      q('#screen-dashboard .hero>div').append(identity);
    }
    if(identity)identity.innerHTML='<span class="activityPill">'+esc(activityName)+'</span>';
    renderTasks();
  }

  function renderTasks(){
    const card=ensureTaskCard();if(!card)return;
    const t=copy();
    if(loading&&!state){card.innerHTML='<div class="empty">'+esc(t.loading)+'</div>';return}
    if(!state){card.innerHTML='';return}
    const tasks=(state.tasks||[]).filter(x=>x.status!=='dismissed');
    const open=tasks.filter(x=>x.status!=='done');
    const done=tasks.filter(x=>x.status==='done');
    const rows=(open.length?open:done.slice(0,4));
    card.innerHTML='<div class="sectionHead"><div><h2>'+esc(t.activityTasks)+'</h2><small class="muted">'+esc(t.activityDesc)+'</small></div></div>'+(rows.length?'<div class="activityTaskGrid">'+rows.map(task=>{
      const title=ar()?task.title_ar:task.title_en;
      const status=task.status==='in_progress'?t.progress:task.status==='done'?t.done:t.pending;
      const button=state.can_manage?'<button class="secondary" data-activity-task="'+esc(task.id)+'" data-next="'+(task.status==='done'?'pending':'done')+'">'+esc(task.status==='done'?t.reopen:t.complete)+'</button>':'';
      return '<div class="activityTask '+(task.status==='done'?'activityDone':'')+'"><div class="grow"><b>'+esc(title)+'</b><small>'+esc(task.category)+' · '+esc(status)+'</small><span class="activityPriority">'+esc(t.priority)+' '+esc(task.priority)+'</span></div>'+button+'</div>';
    }).join('')+'</div>':'<div class="empty">'+esc(t.empty)+'</div>');
    card.querySelectorAll('[data-activity-task]').forEach(btn=>btn.onclick=()=>setTask(btn.dataset.activityTask,btn.dataset.next));
  }

  async function setTask(taskId,status){
    const id=businessId();if(!id)return;
    try{
      const response=await fetch('/api/activity-tasks',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,task_id:taskId,status})});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'TASK_UPDATE_FAILED');
      const task=state.tasks.find(x=>x.id===taskId);if(task)task.status=status;renderTasks();
    }catch(error){try{toast(ar()?'تعذر تحديث المهمة':'Could not update task')}catch{}}
  }

  async function load(force=false){
    const id=businessId();if(!id||loading)return;
    if(!force&&lastBusiness===id&&state)return applyProfile();
    loading=true;renderTasks();
    try{
      const response=await fetch('/api/activity-tasks?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_FAILED');
      state=body;lastBusiness=id;calendarConnections=null;calendarConnectionsBusiness=null;applyProfile();
    }catch(error){console.error('dabbir_activity_profile_failed',String(error?.message||error).slice(0,120))}
    finally{loading=false;renderTasks()}
  }

  const observer=new MutationObserver(()=>{if(workspace?.business?.id){setTimeout(applyProfile,0);load(false)}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);setTimeout(applyProfile,0);return result};
  const baseRenderAppointments=typeof window.renderAppointments==='function'?window.renderAppointments:null;
  if(baseRenderAppointments)window.renderAppointments=function(...args){const result=baseRenderAppointments.apply(this,args);setTimeout(renderCalendar,0);return result};
  const params=new URLSearchParams(location.search);
  if(params.get('calendar')){
    setTimeout(()=>{try{if(typeof showScreen==='function')showScreen('appointments');toast(params.get('calendar')==='connected'?copy().calendarConnected:copy().calendarError)}catch{}const u=new URL(location.href);u.searchParams.delete('calendar');u.searchParams.delete('provider');u.searchParams.delete('code');history.replaceState(null,'',u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash)},900);
  }
  setInterval(()=>{if(workspace?.business?.id&&workspace.business.id!==lastBusiness)load(true)},1200);
  setTimeout(()=>load(false),500);
  window.__dabbirActivityProfile={refresh:()=>load(true),refreshCalendar:()=>{renderCalendar();return loadCalendarConnections(true)},version:'activity-profile-v3-calendar'};
})();
(()=>{
  if(window.__dabbirCalendarLiveUi)return;
  const q=s=>document.querySelector(s);
  let busy=false,lastBusiness=null,lastSyncAt=0,lastBusy=[];
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const businessId=()=>{try{return workspace?.business?.id||null}catch{return null}};
  const screenActive=()=>q('#screen-appointments')?.classList.contains('active');
  const fmt=value=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return String(value||'')}};

  const style=document.createElement('style');
  style.textContent='.dabbirExternalBusy{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}.dabbirExternalBusy h4{font-size:10px;margin:0 0 7px}.dabbirExternalBusyList{display:grid;gap:5px}.dabbirExternalBusyRow{display:flex;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:9px;padding:7px 8px;font-size:8px}.dabbirExternalBusyRow b{font-size:9px}.dabbirExternalBusyRow span{margin-inline-start:auto;color:var(--muted);white-space:nowrap}.dabbirSyncBtn{border:1px solid #414d2a;background:#252c1d;color:#fff;border-radius:9px;padding:6px 9px;min-height:36px;font-size:9px;font-weight:850}.dabbirSyncBtn:disabled{opacity:.55}';
  document.head.append(style);

  function ensureUi(){
    const head=q('.dabbirCalendarConnectionsHead'),host=q('#dabbirCalendarConnections');if(!head||!host)return false;
    let btn=q('#dabbirCalendarSyncNow');
    if(!btn){btn=document.createElement('button');btn.id='dabbirCalendarSyncNow';btn.type='button';btn.className='dabbirSyncBtn';btn.onclick=()=>sync(true);head.append(btn)}
    btn.textContent=busy?(ar()?'جارٍ المزامنة…':'Syncing…'):(ar()?'مزامنة الآن':'Sync now');btn.disabled=busy;
    let panel=q('#dabbirExternalBusy');if(!panel){panel=document.createElement('div');panel.id='dabbirExternalBusy';panel.className='dabbirExternalBusy';host.append(panel)}
    renderBusy();return true;
  }

  function renderBusy(){
    const panel=q('#dabbirExternalBusy');if(!panel)return;
    const now=Date.now(),rows=lastBusy.filter(x=>new Date(x.ends_at).getTime()>now).slice(0,8);
    panel.innerHTML='<h4>'+(ar()?'الأوقات المشغولة من Google / Outlook':'Busy time from Google / Outlook')+'</h4>'+(rows.length?'<div class="dabbirExternalBusyList">'+rows.map(row=>'<div class="dabbirExternalBusyRow"><b>'+esc(row.summary||(ar()?'مشغول':'Busy'))+'</b><span>'+esc(fmt(row.starts_at))+'</span></div>').join('')+'</div>':'<div style="font-size:8px;color:var(--muted)">'+(ar()?'لا توجد أوقات خارجية مشغولة قادمة.':'No upcoming external busy time.')+'</div>');
  }

  async function connectionState(id){
    const response=await fetch('/api/calendar-connections?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'CALENDAR_CONNECTIONS_FAILED');
    return body;
  }

  async function loadBusy(id){
    const response=await fetch('/api/calendar-sync?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'CALENDAR_BUSY_FAILED');
    lastBusy=Array.isArray(body.busy_blocks)?body.busy_blocks:[];renderBusy();
  }

  async function sync(force=false){
    const id=businessId();if(!id||busy)return;
    ensureUi();
    if(id!==lastBusiness){lastBusiness=id;lastSyncAt=0;lastBusy=[]}
    try{
      const connections=await connectionState(id),active=(connections.connections||[]).filter(c=>c.status==='active'&&c.sync_enabled!==false);
      if(!active.length){lastBusy=[];renderBusy();return}
      const due=force||Date.now()-lastSyncAt>5*60*1000;
      if(due){
        busy=true;ensureUi();
        const response=await fetch('/api/calendar-sync',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id})});
        const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'CALENDAR_SYNC_FAILED');
        lastSyncAt=Date.now();
        try{window.__dabbirActivityProfile?.refresh?.()}catch{}
      }
      await loadBusy(id);
      if(force)try{toast(ar()?'تمت مزامنة التقويم':'Calendar synced')}catch{}
    }catch(error){
      console.error('dabbir_calendar_live_ui_failed',String(error?.message||error).slice(0,120));
      if(force)try{toast(ar()?'تعذرت مزامنة التقويم':'Calendar sync failed')}catch{}
    }finally{busy=false;ensureUi()}
  }

  const observer=new MutationObserver(()=>{if(screenActive()&&businessId()){ensureUi();sync(false)}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(screenActive()&&businessId())sync(false)},60000);
  setTimeout(()=>{if(screenActive()&&businessId())sync(false)},1200);
  window.__dabbirCalendarLiveUi={sync:()=>sync(true),refreshBusy:()=>businessId()?loadBusy(businessId()):Promise.resolve(),version:'calendar-live-v3-composite-management'};
})();
(()=>{
  if(window.__dabbirAppointmentManagementUi)return;
  window.__dabbirAppointmentManagementUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const ws=()=>{try{return typeof workspace!=='undefined'?workspace:null}catch{return null}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    title:'إدارة الحجوزات',desc:'يمكنك تعديل موعد العميل أو حذفه. أي تغيير يُحفظ في دبّر ويُزامن مع التقويم المرتبط.',
    customer:'العميل',time:'الموعد',status:'الحالة',edit:'تعديل',del:'حذف',save:'حفظ التعديل',cancel:'إلغاء',
    editTitle:'تعديل الموعد',deleteTitle:'حذف الموعد؟',deleteBody:'سيتم حذف الموعد من دبّر ومن التقويمات المرتبطة إن وُجدت.',
    requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',
    saved:'تم تعديل الموعد.',deleted:'تم حذف الموعد.',deletePending:'تم إلغاء الموعد، لكن حذف التقويم الخارجي يحتاج إعادة مزامنة.',
    failed:'تعذر إكمال العملية.',past:'لا يمكن تعديل موعد مضى وقته.',empty:'لا توجد حجوزات لإدارتها.'
  }:{
    title:'Manage bookings',desc:'Edit or delete a customer booking. Changes are saved in DABBIR and synced to connected calendars.',
    customer:'Customer',time:'Booking',status:'Status',edit:'Edit',del:'Delete',save:'Save changes',cancel:'Cancel',
    editTitle:'Edit booking',deleteTitle:'Delete booking?',deleteBody:'The booking will be removed from DABBIR and connected calendars when available.',
    requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',
    saved:'Booking updated.',deleted:'Booking deleted.',deletePending:'Booking was cancelled, but the external calendar delete still needs reconciliation.',
    failed:'Could not complete the action.',past:'Past bookings cannot be rescheduled.',empty:'No bookings to manage.'
  };

  const style=document.createElement('style');
  style.textContent='.dabbirApptManage{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirApptManageHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.dabbirApptManageHead h3{font-size:13px;margin:0 0 4px}.dabbirApptManageHead p{font-size:9px;color:var(--muted);margin:0;line-height:1.55}.dabbirApptManageList{display:grid;gap:7px}.dabbirApptManageRow{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(135px,1fr) 90px auto;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:11px;padding:9px}.dabbirApptManageRow b{font-size:10px}.dabbirApptManageRow span{font-size:9px;color:var(--muted)}.dabbirApptManageActions{display:flex;gap:6px;justify-content:flex-end}.dabbirApptManageActions button{min-height:34px;border-radius:9px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirApptEdit{border:1px solid #414d2a;background:#252c1d;color:#fff}.dabbirApptDelete{border:1px solid #5b2b2b;background:#32191a;color:#ffb9b9}.dabbirApptEdit:disabled{opacity:.45}.dabbirApptEmpty{border:1px dashed #31363c;border-radius:11px;padding:16px;text-align:center;color:var(--muted);font-size:9px}.dabbirApptModal{position:fixed;inset:0;z-index:90;background:#000b;display:none;align-items:center;justify-content:center;padding:18px}.dabbirApptModal.open{display:flex}.dabbirApptModalBox{width:min(430px,100%);background:#131518;border:1px solid #343940;border-radius:18px;padding:16px}.dabbirApptModalBox h3{margin:0 0 10px;font-size:14px}.dabbirApptField{display:grid;gap:5px;margin-top:9px}.dabbirApptField label{font-size:9px;color:var(--muted)}.dabbirApptField input,.dabbirApptField select{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:9px;min-height:42px}.dabbirApptModalActions{display:flex;gap:7px;justify-content:flex-end;margin-top:13px}.dabbirApptModalActions button{border-radius:10px;padding:8px 11px;font-weight:850}.dabbirApptModalActions .save{border:0;background:var(--accent);color:#10130b}.dabbirApptModalActions .cancel{border:1px solid var(--line);background:#181b1f;color:#fff}@media(max-width:700px){.dabbirApptManageRow{grid-template-columns:1fr}.dabbirApptManageActions{justify-content:stretch}.dabbirApptManageActions button{flex:1}.dabbirApptManageHead{display:block}}';
  document.head.append(style);

  let signature='',editingId=null,busy=false;
  function customerName(id){
    const row=(ws()?.customers||[]).find(x=>x.id===id);
    return row?.display_name||(ar()?'عميل':'Customer');
  }
  function fmt(value){
    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value||'')}
  }
  function statusLabel(status){
    const c=copy(),s=String(status||'requested').toLowerCase();
    return c[s]||s;
  }
  function dubaiLocalMinute(date=new Date()){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function isoFromDubaiLocal(value){
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return null;
    const d=new Date(raw+':00+04:00');
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  function ensurePanel(){
    const screen=q('#screen-appointments');if(!screen)return null;
    let panel=q('#dabbirApptManage');
    if(panel)return panel;
    panel=document.createElement('section');panel.id='dabbirApptManage';panel.className='dabbirApptManage';
    const table=q('#appointmentsTable');
    if(table?.parentNode)table.parentNode.insertBefore(panel,table);
    else screen.append(panel);
    return panel;
  }
  function ensureModal(){
    let modal=q('#dabbirApptEditModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='dabbirApptEditModal';modal.className='dabbirApptModal';
    document.body.append(modal);return modal;
  }
  function render(){
    const w=ws();if(!w?.business)return;
    const panel=ensurePanel();if(!panel)return;
    const rows=[...(w.appointments||[])].filter(a=>a?.id&&a?.starts_at).sort((a,b)=>{
      const an=new Date(a.starts_at).getTime(),bn=new Date(b.starts_at).getTime(),now=Date.now();
      const af=an>=now,bf=bn>=now;if(af!==bf)return af?-1:1;return af?an-bn:bn-an;
    });
    const nextSig=(ar()?'ar':'en')+'|'+rows.map(a=>[a.id,a.starts_at,a.status].join(':')).join('|');
    if(nextSig===signature&&panel.dataset.ready==='1')return;
    signature=nextSig;panel.dataset.ready='1';
    const c=copy();
    panel.innerHTML='<div class="dabbirApptManageHead"><div><h3>'+esc(c.title)+'</h3><p>'+esc(c.desc)+'</p></div></div><div class="dabbirApptManageList">'+(rows.length?rows.map(a=>{
      const future=new Date(a.starts_at).getTime()>=Date.now();
      return '<div class="dabbirApptManageRow" data-appt-row="'+esc(a.id)+'"><b>'+esc(customerName(a.customer_id))+'</b><span>'+esc(fmt(a.starts_at))+'</span><span>'+esc(statusLabel(a.status))+'</span><div class="dabbirApptManageActions"><button type="button" class="dabbirApptEdit" data-appt-edit="'+esc(a.id)+'" '+(future?'':'disabled title="'+esc(c.past)+'"')+'>'+esc(c.edit)+'</button><button type="button" class="dabbirApptDelete" data-appt-delete="'+esc(a.id)+'">'+esc(c.del)+'</button></div></div>';
    }).join(''):'<div class="dabbirApptEmpty">'+esc(c.empty)+'</div>')+'</div>';
    panel.querySelectorAll('[data-appt-edit]').forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.apptEdit));
    panel.querySelectorAll('[data-appt-delete]').forEach(btn=>btn.onclick=()=>removeAppointment(btn.dataset.apptDelete));
  }
  function openEdit(id){
    const w=ws(),a=(w?.appointments||[]).find(x=>x.id===id);if(!a)return;
    if(new Date(a.starts_at).getTime()<Date.now()){try{toast(copy().past)}catch{};return}
    editingId=id;const c=copy(),modal=ensureModal();
    modal.innerHTML='<form class="dabbirApptModalBox" id="dabbirApptEditForm"><h3>'+esc(c.editTitle)+'</h3><div class="dabbirApptField"><label>'+esc(c.customer)+'</label><input value="'+esc(customerName(a.customer_id))+'" disabled></div><div class="dabbirApptField"><label>'+esc(c.time)+'</label><input id="dabbirApptEditTime" type="datetime-local" min="'+esc(dubaiLocalMinute(new Date(Date.now()+60000)))+'" value="'+esc(dubaiLocalMinute(new Date(a.starts_at)))+'" required></div><div class="dabbirApptField"><label>'+esc(c.status)+'</label><select id="dabbirApptEditStatus"><option value="requested" '+(a.status==='requested'?'selected':'')+'>'+esc(c.requested)+'</option><option value="confirmed" '+(a.status==='confirmed'?'selected':'')+'>'+esc(c.confirmed)+'</option><option value="rescheduled" '+(a.status==='rescheduled'?'selected':'')+'>'+esc(c.rescheduled)+'</option><option value="completed" '+(a.status==='completed'?'selected':'')+'>'+esc(c.completed)+'</option><option value="cancelled" '+(a.status==='cancelled'?'selected':'')+'>'+esc(c.cancelled)+'</option></select></div><div class="dabbirApptModalActions"><button type="button" class="cancel" id="dabbirApptEditCancel">'+esc(c.cancel)+'</button><button type="submit" class="save">'+esc(c.save)+'</button></div></form>';
    q('#dabbirApptEditCancel').onclick=closeModal;
    q('#dabbirApptEditForm').onsubmit=saveEdit;
    modal.onclick=e=>{if(e.target===modal)closeModal()};
    modal.classList.add('open');setTimeout(()=>q('#dabbirApptEditTime')?.focus(),0);
  }
  function closeModal(){const modal=q('#dabbirApptEditModal');modal?.classList.remove('open');editingId=null}
  async function request(body){
    const response=await fetch('/api/appointment-management',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));return {response,data};
  }
  async function refresh(){
    const w=ws();if(!w?.business?.id)return;
    signature='';
    try{if(typeof loadRuntime==='function')await loadRuntime(w.business.id,typeof selectedConversationId!=='undefined'?selectedConversationId:null)}catch{}
    render();
    try{window.__dabbirCalendarLiveUi?.refreshBusy?.()}catch{}
  }
  async function saveEdit(event){
    event.preventDefault();if(busy||!editingId)return;
    const w=ws(),start=isoFromDubaiLocal(q('#dabbirApptEditTime')?.value),status=q('#dabbirApptEditStatus')?.value;
    if(!w?.business?.id||!start)return;
    if(new Date(start).getTime()<Date.now()){try{toast(copy().past)}catch{};return}
    busy=true;const submit=event.submitter;if(submit)submit.disabled=true;
    try{
      const {response,data}=await request({action:'update',business_id:w.business.id,appointment_id:editingId,starts_at:start,status});
      if(!response.ok||!data.ok)throw new Error(data.error||copy().failed);
      closeModal();try{toast(copy().saved)}catch{};await refresh();
    }catch(error){try{toast(copy().failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false;if(submit)submit.disabled=false}
  }
  async function removeAppointment(id){
    if(busy)return;const w=ws();if(!w?.business?.id)return;const c=copy();
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:c.deleteTitle,body:c.deleteBody}):window.confirm(c.deleteTitle+'\n'+c.deleteBody);
    if(!confirmed)return;
    busy=true;
    try{
      const {response,data}=await request({action:'delete',business_id:w.business.id,appointment_id:id});
      if(response.ok&&data.ok){try{toast(c.deleted)}catch{};await refresh();return}
      if(data.state==='CANCELLED_PENDING_EXTERNAL_DELETE'){try{toast(c.deletePending)}catch{};await refresh();return}
      throw new Error(data.error||c.failed);
    }catch(error){try{toast(c.failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false}
  }

  const observer=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(q('#screen-appointments')?.classList.contains('active'))render()},1500);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#dabbirApptEditModal.open'))closeModal()});
  setTimeout(render,500);
  window.__dabbirAppointmentManagement={render,version:'appointment-management-v1'};
})();

(()=>{
  if(document.querySelector('style[data-dabbir-action-center]'))return;
  const style=document.createElement('style');
  style.dataset.dabbirActionCenter='v3';
  style.textContent="\n.dabbir-action-center{margin-bottom:12px;border-color:#343a31;background:linear-gradient(180deg,#171b17,#101311)}\n.dac-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.dac-head strong{font-size:15px}.dac-status{font-size:9px;color:var(--muted);margin-top:4px}.dac-brief{margin:12px 0;color:#dfe4e7;font-size:11px;line-height:1.75}.dac-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dac-metric{border:1px solid #2b3031;background:#121518;border-radius:13px;padding:10px}.dac-metric strong{display:block;font-size:20px}.dac-metric span{font-size:8px;color:var(--muted)}.dac-metric.critical strong{color:var(--red)}.dac-metric.warning strong{color:var(--yellow)}.dac-metric.handled strong{color:var(--green)}.dac-items{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dac-item{display:flex;align-items:center;gap:9px;border:1px solid #292e31;background:#15181a;border-radius:13px;padding:10px}.dac-item.critical{border-inline-start:3px solid var(--red)}.dac-item.warning{border-inline-start:3px solid var(--yellow)}.dac-item.info{border-inline-start:3px solid var(--blue)}.dac-item-body{flex:1;min-width:0}.dac-item-body b{display:block;font-size:10px}.dac-item-body span{display:block;color:#b6bcc3;font-size:9px;line-height:1.55;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dac-item-body small{display:block;color:#777f87;font-size:8px;margin-top:4px}.dac-open{min-width:62px;padding:7px 9px;font-size:9px}.dac-empty{padding:16px;text-align:center;color:var(--green);font-size:10px;border:1px dashed #314034;border-radius:12px}.dac-more-wrap{display:flex;justify-content:center;margin-top:9px}.dac-more{min-height:36px;padding:7px 12px;font-size:9px;color:var(--muted)}@media(max-width:700px){.dac-metrics{gap:6px}.dac-metric{padding:9px}.dac-item{align-items:flex-start}.dac-open{min-height:40px}.dac-more{min-height:42px}.dac-item-body span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}\n";
  document.head.append(style);

  const CACHE_MS=20000;
  const DEFAULT_VISIBLE=3;
  const MAX_VISIBLE=8;
  let lastBusinessId=null;
  let lastLoadedAt=0;
  let loading=false;
  let expanded=false;

  const text=()=>lang==='ar'?{
    title:'اليوم في دَبِّر',refresh:'تحديث',loading:'دَبِّر يراجع النشاط…',handled:'عالجها دَبِّر',urgent:'يحتاج تدخلك',warning:'راقب اليوم',empty:'كل شيء تحت السيطرة الآن',open:'فتح',error:'تعذر تحميل مركز الأولويات',showLess:'عرض الأهم فقط'
  }:{
    title:'Today in DABBIR',refresh:'Refresh',loading:'DABBIR is reviewing the business…',handled:'Handled by DABBIR',urgent:'Needs you',warning:'Watch today',empty:'Everything is under control right now',open:'Open',error:'Could not load action center',showLess:'Show top 3 only'
  };

  function ensurePanel(){
    const dash=document.querySelector('#screen-dashboard');
    if(!dash)return null;
    let panel=document.querySelector('#dabbirActionCenter');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActionCenter';
    panel.className='dabbir-action-center card';
    panel.innerHTML='<div class="dac-head"><div><strong id="dacTitle"></strong><div id="dacStatus" class="dac-status"></div></div><button id="dacRefresh" class="secondary" type="button"></button></div><p id="dacBrief" class="dac-brief"></p><div id="dacMetrics" class="dac-metrics"></div><div id="dacItems" class="dac-items"></div><div id="dacMoreWrap" class="dac-more-wrap" hidden><button id="dacMore" class="secondary dac-more" type="button"></button></div>';
    const cards=document.querySelector('#dashCards');
    if(cards&&cards.parentNode)cards.parentNode.insertBefore(panel,cards);
    else dash.prepend(panel);
    panel.querySelector('#dacRefresh')?.addEventListener('click',()=>loadActionCenter(true));
    panel.querySelector('#dacMore')?.addEventListener('click',()=>{
      expanded=!expanded;
      if(workspace?.owner_action_center)render(workspace.owner_action_center);
    });
    return panel;
  }

  function metric(label,value,tone){
    const box=document.createElement('div');
    box.className='dac-metric '+(tone||'');
    const strong=document.createElement('strong');
    strong.textContent=String(value??0);
    const span=document.createElement('span');
    span.textContent=label;
    box.append(strong,span);
    return box;
  }

  function formatWhen(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }

  function moreLabel(hiddenCount,t){
    if(expanded)return t.showLess;
    return lang==='ar'?'عرض بقية الأولويات ('+hiddenCount+')':'Show '+hiddenCount+' more';
  }

  function render(data){
    const panel=ensurePanel();
    if(!panel)return;
    const t=text();
    panel.querySelector('#dacTitle').textContent=t.title;
    panel.querySelector('#dacRefresh').textContent=t.refresh;
    panel.dataset.state=data?.status||'clear';
    const status=panel.querySelector('#dacStatus');
    status.textContent=data?.status==='needs_attention'?(lang==='ar'?'هناك عناصر حرجة':'Critical items need attention'):data?.status==='watch'?(lang==='ar'?'هناك أمور تحتاج متابعة':'Some items need monitoring'):(lang==='ar'?'لا توجد عناصر حرجة':'No critical items');
    panel.querySelector('#dacBrief').textContent=(lang==='ar'?data?.brief?.ar:data?.brief?.en)||t.empty;

    const handledAvailable=data?.handled?.available===true;
    const handledValue=handledAvailable?(data?.handled?.verified_autonomous_today??0):'—';
    const metrics=panel.querySelector('#dacMetrics');
    metrics.replaceChildren(
      metric(t.handled,handledValue,'handled'),
      metric(t.urgent,data?.metrics?.urgent,'critical'),
      metric(t.warning,data?.metrics?.warning,'warning')
    );

    const list=panel.querySelector('#dacItems');
    list.replaceChildren();
    const rows=Array.isArray(data?.items)?data.items:[];
    const moreWrap=panel.querySelector('#dacMoreWrap');
    const moreButton=panel.querySelector('#dacMore');
    if(!rows.length){
      const empty=document.createElement('div');
      empty.className='dac-empty';
      empty.textContent=t.empty;
      list.append(empty);
      if(moreWrap)moreWrap.hidden=true;
      return;
    }

    const visibleLimit=expanded?MAX_VISIBLE:DEFAULT_VISIBLE;
    for(const item of rows.slice(0,visibleLimit)){
      const row=document.createElement('article');
      row.className='dac-item '+(item.severity||'info');
      const body=document.createElement('div');
      body.className='dac-item-body';
      const title=document.createElement('b');
      title.textContent=lang==='ar'?item.title_ar:item.title_en;
      const detail=document.createElement('span');
      detail.textContent=lang==='ar'?item.detail_ar:item.detail_en;
      const when=document.createElement('small');
      when.textContent=formatWhen(item.due_at);
      body.append(title,detail,when);
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary dac-open';
      button.textContent=t.open;
      button.addEventListener('click',()=>{
        const target=String(item.target||'dashboard');
        if(typeof showScreen==='function')showScreen(target);
      });
      row.append(body,button);
      list.append(row);
    }

    const canExpand=rows.length>DEFAULT_VISIBLE;
    if(moreWrap)moreWrap.hidden=!canExpand;
    if(moreButton&&canExpand){
      const hiddenCount=Math.max(0,Math.min(rows.length,MAX_VISIBLE)-DEFAULT_VISIBLE);
      moreButton.textContent=moreLabel(hiddenCount,t);
      moreButton.setAttribute('aria-expanded',expanded?'true':'false');
    }
  }

  async function loadActionCenter(force=false){
    const businessId=workspace?.business?.id;
    if(!businessId||loading)return;
    if(lastBusinessId&&businessId!==lastBusinessId)expanded=false;
    const now=Date.now();
    if(!force&&businessId===lastBusinessId&&now-lastLoadedAt<CACHE_MS&&workspace?.owner_action_center){
      render(workspace.owner_action_center);
      return;
    }
    loading=true;
    const panel=ensurePanel();
    if(panel){
      const t=text();
      panel.querySelector('#dacTitle').textContent=t.title;
      panel.querySelector('#dacRefresh').textContent=t.refresh;
      panel.querySelector('#dacBrief').textContent=t.loading;
    }
    try{
      const response=await fetch('/api/owner-action-center?business_id='+encodeURIComponent(businessId),{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('ACTION_CENTER_'+response.status));
      if(workspace)workspace.owner_action_center=data;
      lastBusinessId=businessId;
      lastLoadedAt=Date.now();
      render(data);
    }catch(error){
      console.error('dabbir_action_center_ui_failed',String(error?.message||error).slice(0,120));
      if(panel){
        const t=text();
        panel.querySelector('#dacBrief').textContent=t.error;
      }
    }finally{loading=false}
  }

  const baseRenderDashboard=renderDashboard;
  renderDashboard=function(){
    baseRenderDashboard();
    ensurePanel();
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>loadActionCenter(false));
    else setTimeout(()=>loadActionCenter(false),0);
  };

  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage){
    setLanguage=function(next){
      const result=baseSetLanguage(next);
      if(workspace?.owner_action_center)render(workspace.owner_action_center);
      return result;
    };
  }

  window.__dabbirOwnerActionCenter={refresh:()=>loadActionCenter(true),version:'owner-action-center-v3'};
})();


(()=>{
  if(window.__dabbirOwnerAwayUiLoaded)return;
  window.__dabbirOwnerAwayUiLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirOwnerAway='v1';
  style.textContent="\n.dabbir-away-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}\n.dabbir-away-btn.active{border-color:#7b67d8;background:#211b35;color:#d9d2ff}\n.dabbir-away-overlay{position:fixed;inset:0;z-index:80;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px}\n.dabbir-away-dialog{width:min(430px,100%);border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px;box-shadow:0 24px 80px #000a}\n.dabbir-away-dialog h3{margin:0;font-size:16px}.dabbir-away-dialog p{color:#a0a8b5;font-size:10px;line-height:1.7;margin:8px 0 14px}.dabbir-away-options{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.dabbir-away-options button,.dabbir-away-stop,.dabbir-away-close{min-height:44px;border-radius:12px;font-weight:900}.dabbir-away-options button{border:1px solid #343b49;background:#191e27;color:#fff}.dabbir-away-stop{width:100%;margin-top:8px;border:1px solid #5b3337;background:#26171a;color:#ffb4b4}.dabbir-away-close{width:100%;margin-top:8px;border:0;background:transparent;color:#9ba4b2}.dabbir-away-state{margin-top:12px;padding:9px;border:1px solid #2e3542;border-radius:11px;color:#bac2cf;font-size:9px}\n@media(max-width:700px){.dabbir-away-overlay{align-items:flex-end;padding:10px}.dabbir-away-dialog{border-radius:20px 20px 14px 14px}.dabbir-away-options{grid-template-columns:1fr}.dabbir-away-btn{min-height:40px}}\n";
  document.head.appendChild(style);

  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    if(typeof input==='string'&&input.startsWith('/api/owner-action-center?')){
      input='/api/owner-action-center-away?'+input.split('?')[1];
    }
    return nativeFetch(input,init);
  };

  let mode=null;
  let checkedBusiness=null;
  let modeLoaded=false;
  let loading=false;
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const copy=()=>ar()?{
    button:'وضع غياب',active:'غياب المالك',title:'وضع غياب المالك',desc:'دَبِّر يؤجل التصعيد غير الحرج خلال غيابك، لكنه لا يخفي الحالات الحرجة ولا يتجاوز موافقات المال أو القانون أو الهوية.',d1:'يوم واحد',d3:'3 أيام',d7:'7 أيام',stop:'إيقاف وضع الغياب',close:'إغلاق',saved:'تم تحديث وضع الغياب',failed:'تعذر تحديث وضع الغياب',unavailable:'وضع الغياب غير متاح في هذه البيئة بعد',until:'حتى'
  }:{
    button:'Away Mode',active:'Owner away',title:'Owner Away Mode',desc:'DABBIR holds non-critical escalation while you are away. Critical exceptions stay visible, and money, legal, or identity approvals are never bypassed.',d1:'1 day',d3:'3 days',d7:'7 days',stop:'Turn off Away Mode',close:'Close',saved:'Away Mode updated',failed:'Could not update Away Mode',unavailable:'Away Mode is not available in this environment yet',until:'until'
  };

  function businessId(){return workspace?.business?.id||null}
  function isOwner(){return workspace?.membership?.role==='owner'}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function dateLabel(value){if(!value)return '';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}

  async function refreshMode(force=false){
    const id=businessId();
    if(!id||!isOwner()||loading)return;
    if(!force&&checkedBusiness===id&&modeLoaded)return renderButton();
    loading=true;
    try{
      const response=await nativeFetch('/api/owner-away-mode?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_AWAY_LOOKUP_FAILED');
      mode=payload.mode||null;checkedBusiness=id;modeLoaded=true;renderButton();
    }catch{mode=null;checkedBusiness=id;modeLoaded=true;renderButton()}
    finally{loading=false}
  }

  function renderButton(){
    const panel=document.querySelector('#dabbirActionCenter');
    const head=panel?.querySelector('.dac-head');
    if(!head||!isOwner())return;
    let button=document.querySelector('#dabbirAwayButton');
    if(!button){
      button=document.createElement('button');
      button.id='dabbirAwayButton';button.type='button';button.className='dabbir-away-btn';button.addEventListener('click',openDialog);
      const refresh=head.querySelector('#dacRefresh');
      if(refresh?.parentNode)refresh.parentNode.insertBefore(button,refresh);else head.append(button);
    }
    const t=copy();
    const active=mode?.active===true;
    button.classList.toggle('active',active);
    const nextLabel=active?(t.active+' · '+t.until+' '+dateLabel(mode.ends_at)):t.button;
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
  }

  function closeDialog(){document.querySelector('#dabbirAwayOverlay')?.remove()}
  function openDialog(){
    closeDialog();
    const t=copy();
    const overlay=document.createElement('div');overlay.id='dabbirAwayOverlay';overlay.className='dabbir-away-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-away-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title=document.createElement('h3');title.textContent=t.title;
    const desc=document.createElement('p');desc.textContent=t.desc;
    const options=document.createElement('div');options.className='dabbir-away-options';
    [[1,t.d1],[3,t.d3],[7,t.d7]].forEach(([days,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>setMode(days));options.append(b)});
    dialog.append(title,desc,options);
    if(mode?.active||mode?.scheduled){const stop=document.createElement('button');stop.type='button';stop.className='dabbir-away-stop';stop.textContent=t.stop;stop.addEventListener('click',()=>setMode(0));dialog.append(stop)}
    if(mode){const state=document.createElement('div');state.className='dabbir-away-state';state.textContent=mode.active?(t.active+' '+t.until+' '+dateLabel(mode.ends_at)):String(mode.state||'');dialog.append(state)}
    const close=document.createElement('button');close.type='button';close.className='dabbir-away-close';close.textContent=t.close;close.addEventListener('click',closeDialog);dialog.append(close);
    overlay.append(dialog);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});document.body.append(overlay);
  }

  async function setMode(days){
    const id=businessId();if(!id||!isOwner()||loading)return;
    loading=true;const t=copy();
    try{
      const now=Date.now();
      const enabled=Number(days)>0;
      const response=await nativeFetch('/api/owner-away-mode',{
        method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({business_id:id,enabled,starts_at:enabled?new Date(now).toISOString():null,ends_at:enabled?new Date(now+Number(days)*24*60*60*1000).toISOString():null,timezone:'Asia/Dubai'})
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_AWAY_UPDATE_FAILED');
      mode=payload.mode;checkedBusiness=id;modeLoaded=true;closeDialog();renderButton();notify(t.saved);
      if(window.__dabbirOwnerActionCenter?.refresh)window.__dabbirOwnerActionCenter.refresh();
    }catch(error){notify(String(error?.message||'').includes('LOOKUP')?t.unavailable:t.failed)}
    finally{loading=false}
  }

  let observerFrame=0;
  function scheduleObservedSync(){
    if(observerFrame)return;
    const run=()=>{
      observerFrame=0;
      if(document.querySelector('#dabbirActionCenter')){renderButton();refreshMode(false)}
    };
    observerFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame(run):setTimeout(run,0);
  }
  const observer=new MutationObserver(scheduleObservedSync);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>refreshMode(true),500);
  window.__dabbirOwnerAway={refresh:()=>refreshMode(true),version:'owner-away-ui-v1'};
})();


(()=>{
  if(window.__dabbirOwnerDecisionMemoryUiLoaded)return;
  window.__dabbirOwnerDecisionMemoryUiLoaded=true;
  const style=document.createElement('style');style.dataset.dabbirOwnerDecisionMemory='v1';style.textContent="\n.dabbir-memory-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}\n.dabbir-memory-btn.has-candidate{border-color:#665fd0;background:#201d35;color:#ddd8ff}\n.dabbir-memory-overlay{position:fixed;inset:0;z-index:82;background:#000c;display:flex;align-items:center;justify-content:center;padding:18px}\n.dabbir-memory-dialog{width:min(560px,100%);max-height:84vh;overflow:auto;border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px}\n.dabbir-memory-dialog h3{margin:0;font-size:16px}.dabbir-memory-dialog>p{color:#9fa8b6;font-size:10px;line-height:1.7}\n.dabbir-memory-card{border:1px solid #2e3542;background:#171b23;border-radius:14px;padding:12px;margin-top:9px}\n.dabbir-memory-card b{font-size:11px}.dabbir-memory-card p{font-size:9px;color:#a9b1bf;line-height:1.6;margin:5px 0 8px}.dabbir-memory-card small{display:block;color:#7f8998;font-size:8px;word-break:break-word}\n.dabbir-memory-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dabbir-memory-actions button{min-height:36px;border-radius:10px;padding:7px 10px;font-size:9px;font-weight:900}\n.dabbir-memory-approve{border:1px solid #6c63d8;background:#262047;color:#e2ddff}.dabbir-memory-pause{border:1px solid #5e5637;background:#242117;color:#ffe4a1}.dabbir-memory-revoke{border:1px solid #64373c;background:#29191c;color:#ffb9bd}\n.dabbir-memory-close{width:100%;min-height:42px;margin-top:12px;border:0;background:transparent;color:#9fa8b6;font-weight:800}.dabbir-memory-empty{padding:13px;margin-top:10px;border:1px dashed #343b49;border-radius:13px;color:#929ba8;font-size:10px}.dabbir-memory-section{margin-top:14px;font-size:11px;color:#e8ebf1}\n@media(max-width:700px){.dabbir-memory-overlay{align-items:flex-end;padding:10px}.dabbir-memory-dialog{border-radius:20px 20px 14px 14px;max-height:88vh}.dabbir-memory-btn{min-height:40px}.dabbir-memory-actions button{flex:1}}\n";document.head.appendChild(style);
  const nativeFetch=window.fetch.bind(window);
  let state={candidates:[],policies:[],loading:false,business:null};
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const copy=()=>ar()?{
    button:'سياسات دبّر',candidate:'اقتراح جديد',title:'سياسات المالك',
    desc:'بعد تكرار نفس القرار منخفض المخاطر 3 مرات، يقترح دبّر سياسة. لا تُفعّل إلا بموافقتك الصريحة. المال والقانون والهوية وKYC مستبعدة من التعلّم.',
    suggestions:'اقتراحات تحتاج موافقتك',active:'السياسات المعتمدة',approve:'دع دبّر يتولى هذا النوع',pause:'إيقاف مؤقت',resume:'إعادة التفعيل',revoke:'إلغاء نهائي',close:'إغلاق',empty:'لا توجد اقتراحات جديدة الآن.',count:'قرارات متطابقة',saved:'تم تحديث السياسة',failed:'تعذر تحديث السياسة',exact:'مطابقة دقيقة فقط',privacy:'السبب محفوظ كبصمة، وليس كنص خام'
  }:{
    button:'DABBIR Policies',candidate:'New suggestion',title:'Owner policies',
    desc:'After the same low-risk decision repeats 3 times, DABBIR can suggest a policy. Nothing activates without your explicit approval. Money, legal, identity, and KYC actions are excluded from learning.',
    suggestions:'Suggestions needing approval',active:'Approved policies',approve:'Let DABBIR handle this type',pause:'Pause',resume:'Resume',revoke:'Revoke',close:'Close',empty:'No new suggestions right now.',count:'matching decisions',saved:'Policy updated',failed:'Could not update policy',exact:'Exact match only',privacy:'Reason stored as a fingerprint, not raw text'
  };
  function businessId(){return workspace?.business?.id||null}
  function isOwner(){return workspace?.membership?.role==='owner'}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function scopeLabel(bounds){
    const x=copy();
    if(bounds?.route_class==='OWNER_DECISION')return ar()?'قرار مالك متكرر منخفض الأولوية':'Repeated low-priority owner decision';
    return x.exact;
  }
  async function load(force=false){
    const id=businessId();if(!id||!isOwner()||state.loading)return;
    if(!force&&state.business===id)return renderButton();
    state.loading=true;
    try{
      const response=await nativeFetch('/api/owner-decision-memory?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_POLICY_LOOKUP_FAILED');
      state={candidates:payload.candidates||[],policies:payload.policies||[],loading:false,business:id};renderButton();
    }catch{state={candidates:[],policies:[],loading:false,business:id};renderButton()}
  }
  function renderButton(){
    if(!isOwner())return;
    const actionHead=document.querySelector('#dabbirActionCenter .dac-head');
    const autoHero=document.querySelector('#screen-automations .hero');
    const host=actionHead||autoHero;if(!host)return;
    let button=document.querySelector('#dabbirMemoryButton');
    if(!button){button=document.createElement('button');button.id='dabbirMemoryButton';button.type='button';button.className='dabbir-memory-btn';button.addEventListener('click',openDialog);const refresh=actionHead?.querySelector('#dacRefresh');refresh?.parentNode?refresh.parentNode.insertBefore(button,refresh):host.append(button)}
    const x=copy();
    const hasCandidate=state.candidates.length>0;
    button.classList.toggle('has-candidate',hasCandidate);
    const nextLabel=hasCandidate?x.candidate+' · '+state.candidates.length:x.button;
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
  }
  function closeDialog(){document.querySelector('#dabbirMemoryOverlay')?.remove()}
  function policyActions(card,policy,isCandidate){
    const x=copy(),actions=document.createElement('div');actions.className='dabbir-memory-actions';
    if(isCandidate){const approve=document.createElement('button');approve.className='dabbir-memory-approve';approve.textContent=x.approve;approve.onclick=()=>mutate('activate',{action_key:policy.action_key,decision_key:policy.decision_key,decision_value:policy.decision_value,match_bounds:policy.match_bounds});actions.append(approve)}
    else{
      if(policy.state==='ACTIVE'){const pause=document.createElement('button');pause.className='dabbir-memory-pause';pause.textContent=x.pause;pause.onclick=()=>mutate('pause',{policy_id:policy.id});actions.append(pause)}
      if(policy.state==='PAUSED'){const resume=document.createElement('button');resume.className='dabbir-memory-approve';resume.textContent=x.resume;resume.onclick=()=>mutate('resume',{policy_id:policy.id});actions.append(resume)}
      const revoke=document.createElement('button');revoke.className='dabbir-memory-revoke';revoke.textContent=x.revoke;revoke.onclick=()=>mutate('revoke',{policy_id:policy.id});actions.append(revoke);
    }
    card.append(actions);
  }
  function policyCard(policy,isCandidate=false){
    const x=copy(),card=document.createElement('div');card.className='dabbir-memory-card';
    const title=document.createElement('b');title.textContent=scopeLabel(policy.match_bounds);
    const detail=document.createElement('p');detail.textContent=isCandidate?(policy.decision_value+' · '+policy.observation_count+' '+x.count):(policy.decision_value+' · v'+policy.version+' · '+policy.state);
    const safety=document.createElement('small');safety.textContent='LOW · '+x.exact+' · '+x.privacy+' · '+policy.action_key;
    card.append(title,detail,safety);policyActions(card,policy,isCandidate);return card;
  }
  function openDialog(){
    closeDialog();const x=copy(),overlay=document.createElement('div');overlay.id='dabbirMemoryOverlay';overlay.className='dabbir-memory-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-memory-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title=document.createElement('h3');title.textContent=x.title;const desc=document.createElement('p');desc.textContent=x.desc;dialog.append(title,desc);
    const suggestions=document.createElement('div');suggestions.className='dabbir-memory-section';suggestions.textContent=x.suggestions;dialog.append(suggestions);
    if(state.candidates.length)state.candidates.forEach(item=>dialog.append(policyCard(item,true)));else{const empty=document.createElement('div');empty.className='dabbir-memory-empty';empty.textContent=x.empty;dialog.append(empty)}
    const active=document.createElement('div');active.className='dabbir-memory-section';active.textContent=x.active;dialog.append(active);
    state.policies.filter(item=>['ACTIVE','PAUSED'].includes(item.state)).forEach(item=>dialog.append(policyCard(item,false)));
    const close=document.createElement('button');close.className='dabbir-memory-close';close.textContent=x.close;close.onclick=closeDialog;dialog.append(close);
    overlay.append(dialog);overlay.onclick=event=>{if(event.target===overlay)closeDialog()};document.body.append(overlay);
  }
  async function mutate(action,extra){
    const id=businessId();if(!id||state.loading)return;state.loading=true;const x=copy();
    try{
      const response=await nativeFetch('/api/owner-decision-memory',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,action,...extra})});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_POLICY_UPDATE_FAILED');
      state.loading=false;await load(true);closeDialog();openDialog();notify(x.saved);
    }catch{state.loading=false;notify(x.failed)}
  }
  let observerFrame=0;
  function scheduleObservedSync(){
    if(observerFrame)return;
    const run=()=>{
      observerFrame=0;
      if(document.querySelector('#dabbirActionCenter')||document.querySelector('#screen-automations')){renderButton();load(false)}
    };
    observerFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame(run):setTimeout(run,0);
  }
  const observer=new MutationObserver(scheduleObservedSync);observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>load(true),700);window.__dabbirOwnerDecisionMemory={refresh:()=>load(true),version:'owner-decision-memory-ui-v1'};
})();


(()=>{
  if(window.__dabbirBusinessProfile)return;
  const style=document.createElement('style');
  style.dataset.dabbirKnowledge='v4';
  style.textContent="\n.dabbir-knowledge-card{margin-top:14px;padding:0!important;overflow:hidden;border-color:#30353b;background:linear-gradient(180deg,#15181b 0%,#0f1113 100%)}\n.dk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 15px;border-bottom:1px solid #252a30;background:linear-gradient(180deg,#191c20,#14171a)}\n.dk-head-copy{min-width:0;max-width:760px}.dk-head h2{font-size:16px;line-height:1.35;margin:0;color:#fff}.dk-head p{font-size:10px;color:var(--muted);line-height:1.75;margin:6px 0 0}\n.dk-state{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:900;color:var(--green);white-space:nowrap;border:1px solid #254a31;background:#12291a;padding:6px 9px;border-radius:999px}.dk-state:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px #8ce6a118}\n.dk-form{padding:14px}.dk-sections{display:grid;grid-template-columns:1fr;gap:12px}.dk-section{border:1px solid #292e34;background:#121416;border-radius:16px;padding:14px}.dk-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.dk-section-head h3{font-size:11px;line-height:1.3;margin:0;color:#e9ecef}.dk-section-head span{font-size:8px;color:#707780}\n.dk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dk-field{display:flex;flex-direction:column;gap:6px;min-width:0}.dk-field.wide{grid-column:1/-1}.dk-field label{font-size:9px;font-weight:750;color:#bfc5cc}.dk-field input,.dk-field textarea{width:100%;min-height:48px;border:1px solid #30363d;background:#181b1f;color:#fff;border-radius:12px;padding:10px 12px;resize:vertical;line-height:1.55;transition:border-color .16s,box-shadow .16s,background .16s}.dk-field input::placeholder,.dk-field textarea::placeholder{color:#666d75}.dk-field input:focus,.dk-field textarea:focus{outline:none;border-color:#687c37;background:#1b1f22;box-shadow:0 0 0 3px #d7ff5f12}.dk-field textarea{min-height:82px}.dk-field[data-key=\"about_business\"] textarea{min-height:96px}.dk-field[data-key=\"delivery_policy\"] textarea,.dk-field[data-key=\"return_policy\"] textarea,.dk-field[data-key=\"booking_policy\"] textarea{min-height:90px}\n.dk-hours-wrap{border:1px solid #2d3339;background:#101214;border-radius:14px;padding:10px}.dk-hours-help{font-size:8px;line-height:1.6;color:#7f8790;margin:0 0 9px}.dk-hours-tools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.dk-hours-tools button{min-height:34px;border:1px solid #343a41;background:#191d21;color:#c9ced4;border-radius:10px;padding:5px 9px;font-size:8px;font-weight:800}.dk-hours-tools button:hover{border-color:#59623c;color:#fff}.dk-hours-list{display:flex;flex-direction:column;gap:6px}.dk-hours-row{display:grid;grid-template-columns:116px minmax(0,1fr) minmax(0,1fr);gap:7px;align-items:center;border:1px solid #262b30;background:#15181b;border-radius:12px;padding:7px}.dk-day-toggle{display:flex;align-items:center;gap:7px;min-height:38px;color:#8f969e;font-size:9px;font-weight:850;cursor:pointer;user-select:none}.dk-day-toggle input{appearance:none;-webkit-appearance:none;width:34px;height:20px;min-height:20px;border:1px solid #444b53;border-radius:999px;background:#24282d;padding:0;position:relative;flex:0 0 auto}.dk-day-toggle input:after{content:'';position:absolute;width:14px;height:14px;top:2px;inset-inline-start:2px;border-radius:50%;background:#8e959d;transition:.16s}.dk-day-toggle input:checked{background:#2a3719;border-color:#6d8234}.dk-day-toggle input:checked:after{inset-inline-start:16px;background:var(--accent)}html[dir=ltr] .dk-day-toggle input:checked:after{left:16px}.dk-hours-row.is-open .dk-day-name{color:#fff}.dk-time{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px}.dk-time span{font-size:7px;color:#737b84;white-space:nowrap}.dk-time input{min-height:38px!important;height:38px;padding:5px 7px!important;font-size:12px!important;border-radius:9px!important}.dk-time input:disabled{opacity:.35;background:#121416;color:#777}.dk-hours-legacy{display:none;margin-top:8px;padding:8px 9px;border:1px solid #4a4026;background:#241f14;color:#e8cf87;border-radius:10px;font-size:8px;line-height:1.55}.dk-hours-legacy.show{display:block}\n.dk-payments-wrap{border:1px solid #2d3339;background:#101214;border-radius:14px;padding:10px}.dk-payments-help{font-size:8px;line-height:1.6;color:#7f8790;margin:0 0 9px}.dk-payment-options{display:flex;flex-wrap:wrap;gap:7px}.dk-payment-option{appearance:none;-webkit-appearance:none;border:1px solid #343a41;background:#191d21;color:#aeb5bd;border-radius:999px;min-height:38px;padding:7px 12px;font-size:9px;font-weight:850;cursor:pointer;transition:border-color .16s,background .16s,color .16s,box-shadow .16s}.dk-payment-option:hover{border-color:#59623c;color:#fff}.dk-payment-option[aria-pressed=\"true\"]{border-color:#6d8234;background:#28351a;color:#fff;box-shadow:0 0 0 2px #d7ff5f10}.dk-payment-option[aria-pressed=\"true\"]:before{content:'✓';font-weight:950;margin-inline-end:6px;color:var(--accent)}\n.dk-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px}.dk-msg{min-height:18px;font-size:9px;color:var(--muted);line-height:1.6}.dk-actions .primary{min-width:150px}.dk-actions .primary:disabled{opacity:.55;cursor:wait}\n@media(max-width:700px){\n  #screen-settings.active{padding-bottom:8px}.dabbir-knowledge-card{margin-top:10px;border-radius:16px}.dk-head{padding:15px 14px 13px;gap:10px}.dk-head h2{font-size:15px}.dk-head p{font-size:9px;line-height:1.65}.dk-state{font-size:7px;padding:5px 7px}.dk-form{padding:10px}.dk-sections{gap:9px}.dk-section{padding:12px;border-radius:14px}.dk-section-head{margin-bottom:9px}.dk-grid{grid-template-columns:1fr;gap:9px}.dk-field.wide{grid-column:auto}.dk-field input,.dk-field textarea{font-size:16px;min-height:50px;border-radius:12px;padding:10px 12px}.dk-field textarea{min-height:72px}.dk-field[data-key=\"about_business\"] textarea{min-height:82px}.dk-field[data-key=\"delivery_policy\"] textarea,.dk-field[data-key=\"return_policy\"] textarea,.dk-field[data-key=\"booking_policy\"] textarea{min-height:78px}.dk-hours-wrap{padding:8px}.dk-hours-row{grid-template-columns:1fr 1fr;gap:6px;padding:8px}.dk-day-toggle{grid-column:1/-1;min-height:30px}.dk-time{grid-template-columns:42px 1fr}.dk-time input{font-size:16px!important;min-height:44px!important;height:44px}.dk-payments-wrap{padding:8px}.dk-payment-options{gap:6px}.dk-payment-option{min-height:42px;padding:8px 11px;font-size:10px}.dk-actions{position:relative;display:grid;grid-template-columns:1fr;gap:8px;padding-top:11px}.dk-actions .primary{width:100%;min-height:50px}.dk-msg{order:2;text-align:center}\n  body.dabbirAppActive>.dabbirMobileBrand{left:50%!important;right:auto!important;inset-inline-start:auto!important;inset-inline-end:auto!important;transform:translateX(-50%)!important;top:11px!important}.dabbirMobileBrand .logo{width:31px!important;height:31px!important}.dabbirMobileBrand b{font-size:11px!important}\n}\n";
  document.head.append(style);

  const dayDefs=[
    ['Sunday','sun'],['Monday','mon'],['Tuesday','tue'],['Wednesday','wed'],['Thursday','thu'],['Friday','fri'],['Saturday','sat']
  ];
  const paymentDefs=[
    ['cash','Cash'],['cards','Cards'],['apple_pay','Apple Pay'],['google_pay','Google Pay'],['bank_transfer','Bank transfer'],['payment_link','Payment link'],['tabby','Tabby'],['tamara','Tamara'],['paypal','PayPal']
  ];
  const paymentAliases={
    cash:['cash','cod','cash on delivery','نقد','نقدا','نقداً','كاش','الدفع عند الاستلام'],
    cards:['card','cards','visa','mastercard','بطاق','فيزا','ماستركارد'],
    apple_pay:['apple pay','ابل باي','أبل باي','آبل باي'],
    google_pay:['google pay','جوجل باي','قوقل باي'],
    bank_transfer:['bank transfer','bank','تحويل بنكي','تحويل مصرفي'],
    payment_link:['payment link','pay link','رابط دفع','رابط الدفع'],
    tabby:['tabby','تابي'],
    tamara:['tamara','تمارا'],
    paypal:['paypal','pay pal','باي بال','بايبال']
  };
  const fields=[
    ['about_business','about','basics','textarea','wide'],
    ['business_hours','hours','basics','schedule','wide'],
    ['business_location','location','basics','input',''],
    ['contact_phone','phone','contact','input',''],
    ['contact_whatsapp','whatsapp','contact','input',''],
    ['contact_email','email','contact','input',''],
    ['payment_methods','payments','contact','payments','wide'],
    ['delivery_policy','delivery','policies','textarea','wide'],
    ['return_policy','returns','policies','textarea','wide'],
    ['booking_policy','booking','policies','textarea','wide'],
  ];
  const groupOrder=['basics','contact','policies'];
  let loadedBusiness=null;
  let loading=false;

  const copy=()=>lang==='ar'?{
    title:'معلومات النشاط',desc:'هذه المعلومات هي المرجع المعتمد الذي يستخدمه دَبِّر عند الرد على العملاء. اكتب فقط المعلومات المؤكدة.',saved:'تم الحفظ — تم تحديث معرفة دَبِّر',loading:'جاري تحميل المعلومات…',saving:'جاري الحفظ…',error:'تعذر حفظ معلومات النشاط',save:'حفظ التغييرات',ready:'معتمد من المالك',optional:'اختياري',
    sections:{basics:'أساسيات النشاط',contact:'التواصل والدفع',policies:'السياسات'},
    labels:{about:'نبذة عن النشاط',hours:'أيام وساعات العمل',location:'الموقع / المنطقة',phone:'رقم الهاتف',whatsapp:'واتساب',email:'البريد الإلكتروني',payments:'طرق الدفع المقبولة',delivery:'سياسة التوصيل والشحن',returns:'سياسة الإرجاع والاستبدال',booking:'سياسة الحجز والمواعيد'},
    placeholders:{about:'مثال: متجر إلكتروني لمنتجات المنزل والإكسسوارات',location:'مثال: أبوظبي – الإمارات',phone:'050 000 0000',whatsapp:'نفس الرقم أو رقم واتساب آخر',email:'name@example.com',delivery:'مناطق التوصيل، المدة والتكلفة',returns:'شروط ومدة الإرجاع أو الاستبدال',booking:'طريقة الحجز، التأكيد والإلغاء'},
    paymentHelp:'اختر كل طرق الدفع التي يقبلها نشاطك. يمكن اختيار أكثر من خيار.',paymentOptions:{cash:'نقدًا / عند الاستلام',cards:'بطاقات ائتمان أو خصم',apple_pay:'Apple Pay',google_pay:'Google Pay',bank_transfer:'تحويل بنكي',payment_link:'رابط دفع',tabby:'Tabby',tamara:'Tamara',paypal:'PayPal'},
    days:{sun:'الأحد',mon:'الإثنين',tue:'الثلاثاء',wed:'الأربعاء',thu:'الخميس',fri:'الجمعة',sat:'السبت'},hoursHelp:'حدد أيام العمل ثم اختر وقت الفتح والإغلاق. لا حاجة لكتابة ساعات الدوام يدويًا.',open:'يفتح',close:'يغلق',allDays:'كل الأيام',workweek:'الأحد–الخميس',clearDays:'مسح',legacyHours:'توجد ساعات دوام قديمة مكتوبة كنص. اختر الأيام والأوقات هنا لتحويلها إلى جدول منظم.'
  }:{
    title:'Business information',desc:'This is the approved reference DABBIR uses when replying to customers. Add only verified information.',saved:'Saved — DABBIR knowledge updated',loading:'Loading business information…',saving:'Saving…',error:'Could not save business information',save:'Save changes',ready:'Owner approved',optional:'Optional',
    sections:{basics:'Business basics',contact:'Contact & payments',policies:'Policies'},
    labels:{about:'About the business',hours:'Working days & hours',location:'Location / area',phone:'Phone number',whatsapp:'WhatsApp',email:'Email',payments:'Accepted payment methods',delivery:'Delivery & shipping policy',returns:'Returns & exchange policy',booking:'Booking & appointment policy'},
    placeholders:{about:'Example: Online store for home products and accessories',location:'Example: Abu Dhabi, UAE',phone:'050 000 0000',whatsapp:'Same number or another WhatsApp number',email:'name@example.com',delivery:'Delivery areas, timing and fees',returns:'Return or exchange conditions and window',booking:'Booking, confirmation and cancellation rules'},
    paymentHelp:'Select every payment method your business accepts. You can choose more than one.',paymentOptions:{cash:'Cash / cash on delivery',cards:'Credit or debit cards',apple_pay:'Apple Pay',google_pay:'Google Pay',bank_transfer:'Bank transfer',payment_link:'Payment link',tabby:'Tabby',tamara:'Tamara',paypal:'PayPal'},
    days:{sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'},hoursHelp:'Select working days, then choose opening and closing times. No manual hours text is needed.',open:'Opens',close:'Closes',allDays:'Every day',workweek:'Sun–Thu',clearDays:'Clear',legacyHours:'Legacy hours are saved as free text. Choose days and times here to convert them into a structured schedule.'
  };

  function dirty(){const msg=document.querySelector('#dkMsg');if(msg&&msg.textContent===copy().saved)msg.textContent=''}

  function canonicalHours(){
    const parts=[];
    for(const [english,key] of dayDefs){
      const enabled=document.querySelector('#dk-day-'+key)?.checked;
      if(!enabled)continue;
      const start=document.querySelector('#dk-start-'+key)?.value||'08:00';
      const end=document.querySelector('#dk-end-'+key)?.value||'18:00';
      parts.push(english+' '+start+'-'+end);
    }
    return parts.join('; ');
  }

  function syncHoursValue(){
    const hidden=document.querySelector('#dk-business_hours');
    if(hidden)hidden.value=canonicalHours();
    document.querySelector('#dkHoursLegacy')?.classList.remove('show');
    dirty();
  }

  function setDay(key,enabled,start='08:00',end='18:00',silent=false){
    const checkbox=document.querySelector('#dk-day-'+key);
    const startInput=document.querySelector('#dk-start-'+key);
    const endInput=document.querySelector('#dk-end-'+key);
    const row=document.querySelector('[data-hours-day="'+key+'"]');
    if(!checkbox||!startInput||!endInput)return;
    checkbox.checked=!!enabled;
    startInput.disabled=!enabled;
    endInput.disabled=!enabled;
    if(start)startInput.value=start;
    if(end)endInput.value=end;
    row?.classList.toggle('is-open',!!enabled);
    if(!silent)syncHoursValue();
  }

  function hydrateHours(value){
    for(const [,key] of dayDefs)setDay(key,false,'08:00','18:00',true);
    const text=String(value||'').trim();
    const hidden=document.querySelector('#dk-business_hours');
    if(hidden)hidden.value=text;
    if(!text){document.querySelector('#dkHoursLegacy')?.classList.remove('show');return}
    let matched=0;
    for(const [english,key] of dayDefs){
      const re=new RegExp('(?:^|;\\s*)'+english+'\\s+(\\d{2}:\\d{2})-(\\d{2}:\\d{2})(?=;|$)','i');
      const hit=text.match(re);
      if(hit){setDay(key,true,hit[1],hit[2],true);matched++}
    }
    const legacy=document.querySelector('#dkHoursLegacy');
    if(matched){if(hidden)hidden.value=canonicalHours();legacy?.classList.remove('show')}
    else legacy?.classList.add('show');
  }

  function canonicalPayments(){
    const values=[];
    for(const [key,value] of paymentDefs){
      const button=document.querySelector('[data-payment-key="'+key+'"]');
      if(button?.getAttribute('aria-pressed')==='true')values.push(value);
    }
    return values.join('; ');
  }

  function syncPaymentsValue(){
    const hidden=document.querySelector('#dk-payment_methods');
    if(hidden)hidden.value=canonicalPayments();
    dirty();
  }

  function setPayment(key,enabled,silent=false){
    const button=document.querySelector('[data-payment-key="'+key+'"]');
    if(!button)return;
    button.setAttribute('aria-pressed',enabled?'true':'false');
    if(!silent)syncPaymentsValue();
  }

  function hydratePayments(value){
    const text=String(value||'').trim().toLowerCase();
    let matched=0;
    for(const [key,canonical] of paymentDefs){
      const aliases=[canonical.toLowerCase(),...(paymentAliases[key]||[])];
      const selected=!!text&&aliases.some(alias=>text.includes(alias));
      setPayment(key,selected,true);
      if(selected)matched++;
    }
    const hidden=document.querySelector('#dk-payment_methods');
    if(hidden)hidden.value=matched?canonicalPayments():'';
  }

  function createScheduleField(def){
    const [key,labelKey,,,width]=def;
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.dataset.labelKey=labelKey;
    label.htmlFor='dk-day-sun';
    const hidden=document.createElement('input');
    hidden.type='hidden';hidden.id='dk-'+key;hidden.name=key;
    const box=document.createElement('div');
    box.className='dk-hours-wrap';
    box.innerHTML='<p class="dk-hours-help" id="dkHoursHelp"></p><div class="dk-hours-tools"><button type="button" data-hours-preset="all"></button><button type="button" data-hours-preset="workweek"></button><button type="button" data-hours-preset="clear"></button></div><div class="dk-hours-list" id="dkHoursList"></div><div class="dk-hours-legacy" id="dkHoursLegacy"></div>';
    const list=box.querySelector('#dkHoursList');
    for(const [,dayKey] of dayDefs){
      const row=document.createElement('div');
      row.className='dk-hours-row';row.dataset.hoursDay=dayKey;
      row.innerHTML='<label class="dk-day-toggle"><input type="checkbox" id="dk-day-'+dayKey+'"><span class="dk-day-name" data-day-key="'+dayKey+'"></span></label><label class="dk-time"><span data-hours-open></span><input type="time" id="dk-start-'+dayKey+'" value="08:00" disabled></label><label class="dk-time"><span data-hours-close></span><input type="time" id="dk-end-'+dayKey+'" value="18:00" disabled></label>';
      list.append(row);
      row.querySelector('#dk-day-'+dayKey).addEventListener('change',e=>setDay(dayKey,e.target.checked));
      row.querySelector('#dk-start-'+dayKey).addEventListener('change',syncHoursValue);
      row.querySelector('#dk-end-'+dayKey).addEventListener('change',syncHoursValue);
    }
    box.querySelector('[data-hours-preset="all"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,true,'08:00','18:00',true);syncHoursValue()});
    box.querySelector('[data-hours-preset="workweek"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,['sun','mon','tue','wed','thu'].includes(d),'08:00','18:00',true);syncHoursValue()});
    box.querySelector('[data-hours-preset="clear"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,false,'08:00','18:00',true);syncHoursValue()});
    wrap.append(label,hidden,box);
    return wrap;
  }

  function createPaymentsField(def){
    const [key,labelKey,,,width]=def;
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.dataset.labelKey=labelKey;
    const hidden=document.createElement('input');
    hidden.type='hidden';hidden.id='dk-'+key;hidden.name=key;
    const box=document.createElement('div');
    box.className='dk-payments-wrap';
    box.innerHTML='<p class="dk-payments-help" data-payments-help></p><div class="dk-payment-options" role="group"></div>';
    const options=box.querySelector('.dk-payment-options');
    for(const [paymentKey] of paymentDefs){
      const button=document.createElement('button');
      button.type='button';
      button.className='dk-payment-option';
      button.dataset.paymentKey=paymentKey;
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>setPayment(paymentKey,button.getAttribute('aria-pressed')!=='true'));
      options.append(button);
    }
    wrap.append(label,hidden,box);
    return wrap;
  }

  function createField(def){
    const [key,labelKey,,type,width]=def;
    if(type==='schedule')return createScheduleField(def);
    if(type==='payments')return createPaymentsField(def);
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.htmlFor='dk-'+key;
    label.dataset.labelKey=labelKey;
    const control=document.createElement(type==='textarea'?'textarea':'input');
    control.id='dk-'+key;
    control.name=key;
    control.autocomplete='off';
    control.dataset.placeholderKey=labelKey;
    if(type==='textarea')control.rows=3;
    if(key==='contact_email'){control.type='email';control.autocomplete='email'}
    if(key==='contact_phone'||key==='contact_whatsapp'){control.type='tel';control.inputMode='tel';control.autocomplete='tel'}
    control.maxLength=key==='contact_phone'||key==='contact_whatsapp'?120:key==='contact_email'?180:1200;
    control.addEventListener('input',dirty);
    wrap.append(label,control);
    return wrap;
  }

  function ensure(){
    const screen=document.querySelector('#screen-settings');
    if(!screen)return null;
    let card=document.querySelector('#dabbirBusinessKnowledge');
    if(card)return card;
    card=document.createElement('section');
    card.id='dabbirBusinessKnowledge';
    card.className='card dabbir-knowledge-card';
    card.innerHTML='<div class="dk-head"><div class="dk-head-copy"><h2 id="dkTitle"></h2><p id="dkDesc"></p></div><span id="dkState" class="dk-state"></span></div><form id="dkForm" class="dk-form"><div id="dkSections" class="dk-sections"></div><div class="dk-actions"><span id="dkMsg" class="dk-msg" role="status" aria-live="polite"></span><button id="dkSave" class="primary" type="submit"></button></div></form>';
    screen.append(card);
    const sections=card.querySelector('#dkSections');
    for(const group of groupOrder){
      const section=document.createElement('section');
      section.className='dk-section';
      section.dataset.group=group;
      section.innerHTML='<div class="dk-section-head"><h3 data-section-key="'+group+'"></h3><span data-optional></span></div><div class="dk-grid"></div>';
      const grid=section.querySelector('.dk-grid');
      for(const field of fields.filter(item=>item[2]===group))grid.append(createField(field));
      sections.append(section);
    }
    card.querySelector('#dkForm').addEventListener('submit',save);
    applyCopy();
    return card;
  }

  function applyCopy(){
    const card=document.querySelector('#dabbirBusinessKnowledge')||ensure();
    if(!card)return;
    const t=copy();
    card.querySelector('#dkTitle').textContent=t.title;
    card.querySelector('#dkDesc').textContent=t.desc;
    card.querySelector('#dkState').textContent=t.ready;
    card.querySelector('#dkSave').textContent=t.save;
    for(const node of card.querySelectorAll('[data-section-key]'))node.textContent=t.sections[node.dataset.sectionKey]||node.dataset.sectionKey;
    for(const node of card.querySelectorAll('[data-optional]'))node.textContent=t.optional;
    for(const label of card.querySelectorAll('[data-label-key]'))label.textContent=t.labels[label.dataset.labelKey]||label.dataset.labelKey;
    for(const control of card.querySelectorAll('[data-placeholder-key]'))control.placeholder=t.placeholders[control.dataset.placeholderKey]||'';
    for(const node of card.querySelectorAll('[data-payment-key]'))node.textContent=t.paymentOptions[node.dataset.paymentKey]||node.dataset.paymentKey;
    const paymentHelp=card.querySelector('[data-payments-help]');if(paymentHelp)paymentHelp.textContent=t.paymentHelp;
    for(const node of card.querySelectorAll('[data-day-key]'))node.textContent=t.days[node.dataset.dayKey]||node.dataset.dayKey;
    for(const node of card.querySelectorAll('[data-hours-open]'))node.textContent=t.open;
    for(const node of card.querySelectorAll('[data-hours-close]'))node.textContent=t.close;
    const help=card.querySelector('#dkHoursHelp');if(help)help.textContent=t.hoursHelp;
    const legacy=card.querySelector('#dkHoursLegacy');if(legacy)legacy.textContent=t.legacyHours;
    const all=card.querySelector('[data-hours-preset="all"]');if(all)all.textContent=t.allDays;
    const week=card.querySelector('[data-hours-preset="workweek"]');if(week)week.textContent=t.workweek;
    const clear=card.querySelector('[data-hours-preset="clear"]');if(clear)clear.textContent=t.clearDays;
  }

  function businessId(){return workspace?.business?.id||null}
  function setMessage(value){const el=document.querySelector('#dkMsg');if(el)el.textContent=value||''}

  async function load(force=false){
    const id=businessId();
    const card=ensure();
    if(!id||!card||loading)return;
    if(!force&&loadedBusiness===id)return;
    loading=true;
    setMessage(copy().loading);
    try{
      const response=await fetch('/api/business-profile?business_id='+encodeURIComponent(id),{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('BUSINESS_PROFILE_'+response.status));
      for(const [key,,,type] of fields){
        if(type==='schedule')continue;
        if(type==='payments'){hydratePayments(data.facts?.[key]||'');continue}
        const input=document.querySelector('#dk-'+key);
        if(input)input.value=String(data.facts?.[key]||'');
      }
      hydrateHours(data.facts?.business_hours||'');
      loadedBusiness=id;
      setMessage('');
    }catch(error){
      console.error('dabbir_business_knowledge_load_failed',String(error?.message||error).slice(0,120));
      setMessage(copy().error);
    }finally{loading=false}
  }

  async function save(event){
    event.preventDefault();
    const id=businessId();
    if(!id||loading)return;
    loading=true;
    const button=document.querySelector('#dkSave');
    const t=copy();
    if(button)button.disabled=true;
    setMessage(t.saving);
    try{
      const facts={};
      for(const [key] of fields)facts[key]=document.querySelector('#dk-'+key)?.value||'';
      const response=await fetch('/api/business-profile',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,facts})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('BUSINESS_PROFILE_SAVE_'+response.status));
      hydrateHours(data.facts?.business_hours||facts.business_hours||'');
      hydratePayments(data.facts?.payment_methods||facts.payment_methods||'');
      loadedBusiness=id;
      setMessage(t.saved);
    }catch(error){
      console.error('dabbir_business_knowledge_save_failed',String(error?.message||error).slice(0,120));
      setMessage(t.error);
    }finally{
      loading=false;
      if(button)button.disabled=false;
    }
  }

  ensure();
  const screen=document.querySelector('#screen-settings');
  if(screen){
    const observer=new MutationObserver(()=>{
      applyCopy();
      if(screen.classList.contains('active'))load(false);
    });
    observer.observe(screen,{attributes:true,attributeFilter:['class']});
  }
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage){
    setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result;};
  }
  setTimeout(()=>{applyCopy();if(document.querySelector('#screen-settings.active'))load(false)},500);
  window.__dabbirBusinessProfile={refresh:()=>load(true),version:'business-knowledge-v4'};
})();

(()=>{
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

  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}

  function render(){
    const list=document.querySelector('#settingsList');
    if(!list||!customerNo)return;
    const c=copy();
    let row=list.querySelector('[data-dabbir-customer-number]');
    if(!row){
      list.insertAdjacentHTML('afterbegin','<div class="item" data-dabbir-customer-number="v1"><div class="grow"><b data-dabbir-customer-number-label></b><small data-dabbir-customer-number-value dir="ltr" style="font-size:12px;font-weight:900;letter-spacing:.04em;color:var(--text)"></small><small data-dabbir-customer-number-help style="display:block;margin-top:3px"></small></div><button type="button" class="secondary" data-copy-dabbir-number style="min-height:38px;padding:7px 10px"></button></div>');
      row=list.querySelector('[data-dabbir-customer-number]');
    }
    if(!row)return;
    setText(row.querySelector('[data-dabbir-customer-number-label]'),c.label);
    setText(row.querySelector('[data-dabbir-customer-number-value]'),customerNo);
    setText(row.querySelector('[data-dabbir-customer-number-help]'),c.help);
    const button=row.querySelector('[data-copy-dabbir-number]');
    setText(button,c.copy);
    if(button&&button.dataset.dabbirCopyBound!=='true'){
      button.dataset.dabbirCopyBound='true';
      button.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(customerNo);
          if(typeof toast==='function')toast(copy().copied);
        }catch{}
      });
    }
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
})();
(()=>{
  if(window.__dabbirCustomerCrmUi)return;
  window.__dabbirCustomerCrmUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const copy=()=>ar()?{
    total:'إجمالي العملاء',newCustomers:'عملاء جدد',repeat:'عملاء متكررون',inactive:'غير نشطين',
    search:'ابحث بالاسم أو رقم الهاتف…',all:'كل العملاء',newStatus:'جديد',repeatStatus:'متكرر',inactiveStatus:'غير نشط',
    sortLatest:'الأحدث نشاطًا',sortActivity:'الأكثر تعاملًا',sortName:'الاسم',
    appointments:'الحجوزات',conversations:'المحادثات',orders:'الطلبات',spent:'إجمالي التعاملات',
    lastActivity:'آخر تعامل',created:'منذ',phone:'الهاتف',noPhone:'لا يوجد رقم محفوظ',
    call:'اتصال',whatsapp:'واتساب',newBooking:'حجز جديد',newOrder:'طلب جديد',close:'إغلاق',
    customerHistory:'سجل العميل',recentAppointments:'آخر الحجوزات',recentOrders:'آخر الطلبات',notes:'ملاحظات',noNotes:'لا توجد ملاحظات.',
    noResults:'لا توجد نتائج مطابقة.',merged:'سجلات موحّدة لنفس الرقم',
    orderProduct:'المنتج',orderQty:'الكمية',payment:'طريقة الدفع',cash:'نقدي',card:'بطاقة',transfer:'تحويل',credit:'آجل',other:'أخرى',saveOrder:'تأكيد الطلب',cancel:'إلغاء',orderSaved:'تم إنشاء الطلب وربطه بالعميل.',orderFailed:'تعذر إنشاء الطلب.',loadingOrders:'جارٍ تحميل سجل الطلبات…',
    statuses:{new:'جديد',active:'نشط',qualified:'مهتم',converted:'عميل',won:'عميل',closed:'مغلق',inactive:'غير نشط',lost:'غير نشط'}
  }:{
    total:'Total customers',newCustomers:'New customers',repeat:'Repeat customers',inactive:'Inactive',
    search:'Search name or phone…',all:'All customers',newStatus:'New',repeatStatus:'Repeat',inactiveStatus:'Inactive',
    sortLatest:'Latest activity',sortActivity:'Most activity',sortName:'Name',
    appointments:'Bookings',conversations:'Conversations',orders:'Orders',spent:'Total value',
    lastActivity:'Last activity',created:'Since',phone:'Phone',noPhone:'No phone stored',
    call:'Call',whatsapp:'WhatsApp',newBooking:'New booking',newOrder:'New order',close:'Close',
    customerHistory:'Customer history',recentAppointments:'Recent bookings',recentOrders:'Recent orders',notes:'Notes',noNotes:'No notes.',
    noResults:'No matching customers.',merged:'records merged for the same number',
    orderProduct:'Product',orderQty:'Quantity',payment:'Payment method',cash:'Cash',card:'Card',transfer:'Transfer',credit:'Credit',other:'Other',saveOrder:'Confirm order',cancel:'Cancel',orderSaved:'Order created and linked to customer.',orderFailed:'Could not create order.',loadingOrders:'Loading order history…',
    statuses:{new:'New',active:'Active',qualified:'Qualified',converted:'Customer',won:'Customer',closed:'Closed',inactive:'Inactive',lost:'Inactive'}
  };

  const style=document.createElement('style');
  style.dataset.dabbirCustomerCrm='v1';
  style.textContent=[
    '#customersTable.crmHost{border:0;border-radius:0;overflow:visible;background:transparent}',
    '.crmMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}',
    '.crmMetric{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:15px;padding:12px}',
    '.crmMetric span{display:block;color:var(--muted);font-size:9px}.crmMetric strong{display:block;font-size:22px;margin-top:5px}',
    '.crmToolbar{display:grid;grid-template-columns:minmax(0,1fr) 170px 170px;gap:8px;margin-bottom:12px}',
    '.crmToolbar input,.crmToolbar select{width:100%;border:1px solid var(--line);background:#15181b;color:#fff;border-radius:12px;padding:10px 11px}',
    '.crmList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
    '.crmCard{border:1px solid #293039;background:linear-gradient(180deg,#141922,#0f1724);border-radius:17px;padding:13px;text-align:inherit;color:inherit;min-width:0}',
    '.crmCard:hover{border-color:#43506a}.crmCardTop{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}',
    '.crmIdentity{min-width:0}.crmIdentity b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.crmIdentity small{display:block;color:var(--muted);font-size:9px;margin-top:4px;direction:ltr;text-align:start}',
    '.crmBadges{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.crmBadge{border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900;background:#202630;color:#cbd3df}.crmBadge.new{background:#14331e;color:var(--green)}.crmBadge.inactive{background:#3b1717;color:var(--red)}.crmBadge.repeat{background:#1f2550;color:#aebcff}',
    '.crmStats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px}.crmStat{background:#121722;border:1px solid #222a36;border-radius:11px;padding:8px}.crmStat span{display:block;font-size:8px;color:var(--muted)}.crmStat b{font-size:12px;margin-top:3px}',
    '.crmLast{margin-top:9px;color:var(--muted);font-size:9px;display:flex;justify-content:space-between;gap:8px}',
    '.crmEmpty{border:1px dashed #31363c;border-radius:14px;padding:26px;text-align:center;color:var(--muted);font-size:11px;grid-column:1/-1}',
    '.crmModal{z-index:55}.crmModal .modalBox{width:min(620px,100%);max-height:min(82vh,760px);overflow:auto}.crmDetailHead{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.crmDetailHead h3{font-size:19px;margin:0}.crmDetailHead small{display:block;color:var(--muted);margin-top:4px;direction:ltr;text-align:start}',
    '.crmQuick{display:flex;gap:7px;flex-wrap:wrap;margin:13px 0}.crmQuick button,.crmQuick a{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:8px 10px;min-height:40px;font-size:9px;font-weight:850;text-decoration:none;display:inline-flex;align-items:center}.crmQuick .primary{border:0;background:var(--accent);color:#10130b}',
    '.crmDetailGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0 14px}.crmDetailMetric{border:1px solid var(--line);background:#15181b;border-radius:12px;padding:9px}.crmDetailMetric span{display:block;color:var(--muted);font-size:8px}.crmDetailMetric b{display:block;font-size:13px;margin-top:4px}',
    '.crmSection{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}.crmSection h4{font-size:11px;margin:0 0 8px}.crmHistory{display:flex;flex-direction:column;gap:6px}.crmHistoryRow{border:1px solid #252b32;background:#15181b;border-radius:11px;padding:9px;display:flex;justify-content:space-between;gap:8px;font-size:9px}.crmHistoryRow b{font-size:10px}.crmHistoryRow span{color:var(--muted)}',
    '.crmNotes{white-space:pre-wrap;color:#c7ccd3;font-size:10px;line-height:1.7}',
    '.crmOrderModal{z-index:60}',
    '@media(max-width:760px){.crmMetrics{grid-template-columns:repeat(2,1fr)}.crmToolbar{grid-template-columns:1fr 1fr}.crmToolbar input{grid-column:1/-1}.crmList{grid-template-columns:1fr}.crmStats{grid-template-columns:repeat(3,1fr)}.crmDetailGrid{grid-template-columns:repeat(2,1fr)}}',
    '@media(max-width:430px){.crmMetric{padding:10px}.crmMetric strong{font-size:19px}.crmCard{padding:12px}.crmDetailHead{display:block}.crmBadges{justify-content:flex-start;margin-top:8px}.crmQuick{display:grid;grid-template-columns:repeat(2,1fr)}.crmQuick button,.crmQuick a{justify-content:center}.crmLast{display:block}.crmLast span{display:block;margin-top:3px}}'
  ].join('');
  document.head.appendChild(style);

  let state={query:'',filter:'all',sort:'latest',selected:null};
  let operationsCache=null;
  let operationsBusinessId=null;
  let operationsLoading=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function lower(value){return String(value||'').trim().toLocaleLowerCase()}
  function date(value,withTime=false){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{style:'currency',currency:'AED',maximumFractionDigits:2}).format(Number(value||0))}catch{return Number(value||0).toFixed(2)+' AED'}}
  function metadata(customer){const value=customer?.metadata;if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return{}}}
  function phoneOf(customer){const m=metadata(customer);const candidates=[m.phone,m.phone_number,m.whatsapp,m.whatsapp_number,m.wa_id,m.sender_phone,m.sender,m.mobile,m.contact_phone];for(const value of candidates){const raw=String(value||'').trim();if(raw){const digits=raw.replace(/\D/g,'');if(digits.length>=7)return{raw,digits}}}return null}
  function noteOf(customer){const m=metadata(customer);return String(m.note||m.notes||m.customer_note||m.internal_note||'').trim()}
  function statusLabel(value){const key=String(value||'new').toLowerCase();return copy().statuses[key]||key}
  function maxDate(values){let best=null,bestMs=-Infinity;for(const value of values){if(!value)continue;const ms=new Date(value).getTime();if(Number.isFinite(ms)&&ms>bestMs){best=value;bestMs=ms}}return best}
  function isRecent(value,days){const ms=new Date(value||0).getTime();return Number.isFinite(ms)&&Date.now()-ms<=days*86400000}

  function buildCustomers(){
    const rows=Array.isArray(workspace?.customers)?workspace.customers:[];
    const groups=[];
    const byPhone=new Map();
    for(const customer of rows){
      const phone=phoneOf(customer);
      if(phone){
        const key=phone.digits;
        if(byPhone.has(key)){byPhone.get(key).members.push(customer);continue}
        const group={members:[customer],phone};byPhone.set(key,group);groups.push(group);
      }else groups.push({members:[customer],phone:null});
    }
    const conversations=Array.isArray(workspace?.conversations)?workspace.conversations:[];
    const appointments=Array.isArray(workspace?.appointments)?workspace.appointments:[];
    return groups.map(group=>{
      const ids=new Set(group.members.map(item=>item.id));
      const conv=conversations.filter(item=>ids.has(item.customer_id));
      const appts=appointments.filter(item=>ids.has(item.customer_id));
      const memberLatest=maxDate(group.members.map(item=>item.created_at));
      const last=maxDate([...conv.map(item=>item.updated_at||item.created_at),...appts.map(item=>item.starts_at||item.created_at),memberLatest]);
      const newest=[...group.members].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||group.members[0];
      const name=group.members.map(item=>String(item.display_name||'').trim()).find(Boolean)||'—';
      const activityCount=conv.length+appts.length;
      const rawStatus=String(newest?.lead_status||'new').toLowerCase();
      const inactive=rawStatus==='inactive'||rawStatus==='lost'||(!isRecent(last,60)&&!isRecent(memberLatest,60));
      const repeat=activityCount>=2;
      const isNew=rawStatus==='new'||isRecent(memberLatest,30);
      return {
        key:group.phone?'phone:'+group.phone.digits:'id:'+String(newest?.id||Math.random()),
        id:newest?.id||null,ids:[...ids],name,phone:group.phone,status:rawStatus,created:memberLatest,last,conversations:conv,appointments:appts,activityCount,repeat,inactive,isNew,merged:group.members.length,notes:group.members.map(noteOf).filter(Boolean).join('\n'),members:group.members
      };
    });
  }

  async function loadOperations(){
    const businessId=workspace?.business?.id||null;
    if(!businessId)return null;
    if(operationsCache&&operationsBusinessId===businessId)return operationsCache;
    if(operationsLoading)return operationsLoading;
    operationsBusinessId=businessId;
    operationsLoading=(async()=>{
      try{
        const response=await fetch('/api/owner-operations?business_id='+encodeURIComponent(businessId),{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'}});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok)return null;
        operationsCache=payload;
        return payload;
      }catch{return null}finally{operationsLoading=null}
    })();
    return operationsLoading;
  }

  function ordersFor(customer,ops){
    if(!ops||!Array.isArray(ops.orders))return[];
    const ids=new Set(customer.ids);
    return ops.orders.filter(order=>ids.has(order.customer_id)&&order.simulated===false);
  }

  function metrics(customers){
    return {total:customers.length,newCustomers:customers.filter(c=>c.isNew).length,repeat:customers.filter(c=>c.repeat).length,inactive:customers.filter(c=>c.inactive).length};
  }

  function filtered(customers){
    const query=lower(state.query);
    let rows=customers.filter(customer=>{
      if(query&&!lower(customer.name+' '+(customer.phone?.raw||customer.phone?.digits||'')).includes(query))return false;
      if(state.filter==='new'&&!customer.isNew)return false;
      if(state.filter==='repeat'&&!customer.repeat)return false;
      if(state.filter==='inactive'&&!customer.inactive)return false;
      return true;
    });
    if(state.sort==='activity')rows.sort((a,b)=>b.activityCount-a.activityCount||new Date(b.last||0)-new Date(a.last||0));
    else if(state.sort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name,ar()?'ar':'en'));
    else rows.sort((a,b)=>new Date(b.last||b.created||0)-new Date(a.last||a.created||0));
    return rows;
  }

  function customerBadges(customer){
    const t=copy();
    const badges=[];
    badges.push('<span class="crmBadge '+(customer.inactive?'inactive':customer.isNew?'new':'')+'">'+escapeHtml(customer.inactive?t.inactiveStatus:statusLabel(customer.status))+'</span>');
    if(customer.repeat)badges.push('<span class="crmBadge repeat">'+escapeHtml(t.repeatStatus)+'</span>');
    if(customer.merged>1)badges.push('<span class="crmBadge">'+escapeHtml(customer.merged+' '+t.merged)+'</span>');
    return badges.join('');
  }

  function card(customer){
    const t=copy();
    return '<button type="button" class="crmCard" data-crm-customer="'+escapeHtml(customer.key)+'">'+
      '<div class="crmCardTop"><div class="crmIdentity"><b>'+escapeHtml(customer.name)+'</b><small>'+escapeHtml(customer.phone?.raw||customer.phone?.digits||t.noPhone)+'</small></div><div class="crmBadges">'+customerBadges(customer)+'</div></div>'+
      '<div class="crmStats"><div class="crmStat"><span>'+escapeHtml(t.appointments)+'</span><b>'+customer.appointments.length+'</b></div><div class="crmStat"><span>'+escapeHtml(t.conversations)+'</span><b>'+customer.conversations.length+'</b></div><div class="crmStat"><span>'+escapeHtml(t.lastActivity)+'</span><b>'+escapeHtml(date(customer.last))+'</b></div></div>'+
      '<div class="crmLast"><span>'+escapeHtml(t.created)+': '+escapeHtml(date(customer.created))+'</span><span>'+escapeHtml(statusLabel(customer.status))+'</span></div></button>';
  }

  function bindToolbar(customers){
    const input=q('#crmSearch');
    if(input){input.oninput=()=>{state.query=input.value;const pos=input.selectionStart;renderCustomersEnhanced();requestAnimationFrame(()=>{const next=q('#crmSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch{}}})}}
    const filter=q('#crmFilter');if(filter)filter.onchange=()=>{state.filter=filter.value;renderCustomersEnhanced()};
    const sort=q('#crmSort');if(sort)sort.onchange=()=>{state.sort=sort.value;renderCustomersEnhanced()};
    qa('[data-crm-customer]').forEach(button=>button.onclick=()=>openDetail(customers.find(item=>item.key===button.dataset.crmCustomer)));
  }

  function ensureDetailModal(){
    if(q('#crmDetailModal'))return;
    const modal=document.createElement('div');
    modal.id='crmDetailModal';modal.className='modal crmModal';
    modal.innerHTML='<div class="modalBox"><div id="crmDetailBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeDetail()});

    const order=document.createElement('div');
    order.id='crmOrderModal';order.className='modal crmOrderModal';
    order.innerHTML='<form class="modalBox" id="crmOrderForm"><h3 id="crmOrderTitle"></h3><div class="field"><label id="crmOrderProductLabel"></label><select id="crmOrderProduct" required></select></div><div class="field"><label id="crmOrderQtyLabel"></label><input id="crmOrderQty" type="number" min="1" step="1" value="1" required></div><div class="field"><label id="crmOrderPaymentLabel"></label><select id="crmOrderPayment"><option value="cash"></option><option value="card"></option><option value="transfer"></option><option value="credit"></option><option value="other"></option></select></div><div class="modalActions"><button type="button" class="secondary" id="crmOrderCancel"></button><button class="primary" type="submit" id="crmOrderSave"></button></div></form>';
    document.body.appendChild(order);
    q('#crmOrderCancel').onclick=()=>order.classList.remove('open');
    order.addEventListener('click',event=>{if(event.target===order)order.classList.remove('open')});
    q('#crmOrderForm').onsubmit=saveQuickOrder;
  }

  function closeDetail(){q('#crmDetailModal')?.classList.remove('open');state.selected=null}

  async function openDetail(customer){
    if(!customer)return;
    state.selected=customer;
    ensureDetailModal();
    q('#crmDetailModal').classList.add('open');
    renderDetail(customer,null,true);
    const ops=await loadOperations();
    if(state.selected?.key===customer.key)renderDetail(customer,ops,false);
  }

  function renderDetail(customer,ops,loadingOps){
    const body=q('#crmDetailBody');if(!body)return;
    const t=copy();
    const orders=ordersFor(customer,ops);
    const total=orders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase())).reduce((sum,order)=>sum+Number(order.total_aed||0),0);
    const phoneDigits=customer.phone?.digits||'';
    const phoneHref=phoneDigits?'tel:+'+phoneDigits:'';
    const waHref=phoneDigits?'https://wa.me/'+phoneDigits:'';
    const canOrder=Boolean(ops?.can_operate&&Array.isArray(ops?.products)&&ops.products.some(p=>p.active!==false&&Number(p.available||0)>0));
    const quick=[
      phoneDigits?'<a href="'+escapeHtml(phoneHref)+'">☎ '+escapeHtml(t.call)+'</a>':'',
      phoneDigits?'<a href="'+escapeHtml(waHref)+'" target="_blank" rel="noopener noreferrer">◉ '+escapeHtml(t.whatsapp)+'</a>':'',
      '<button type="button" class="secondary" id="crmNewBooking">＋ '+escapeHtml(t.newBooking)+'</button>',
      canOrder?'<button type="button" class="primary" id="crmNewOrder">＋ '+escapeHtml(t.newOrder)+'</button>':''
    ].join('');
    const apptRows=customer.appointments.slice().sort((a,b)=>new Date(b.starts_at||b.created_at||0)-new Date(a.starts_at||a.created_at||0)).slice(0,6).map(item=>'<div class="crmHistoryRow"><b>'+escapeHtml(date(item.starts_at,true))+'</b><span>'+escapeHtml(statusLabel(item.status))+'</span></div>').join('');
    const orderRows=orders.slice(0,6).map(item=>'<div class="crmHistoryRow"><div><b>'+escapeHtml(money(item.total_aed))+'</b><span style="display:block;margin-top:3px">'+escapeHtml(date(item.created_at))+'</span></div><span>'+escapeHtml(statusLabel(item.status))+'</span></div>').join('');
    body.innerHTML='<div class="crmDetailHead"><div><h3>'+escapeHtml(customer.name)+'</h3><small>'+escapeHtml(customer.phone?.raw||customer.phone?.digits||t.noPhone)+'</small></div><div class="crmBadges">'+customerBadges(customer)+'</div></div>'+
      '<div class="crmQuick">'+quick+'</div>'+
      '<div class="crmDetailGrid"><div class="crmDetailMetric"><span>'+escapeHtml(t.appointments)+'</span><b>'+customer.appointments.length+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.conversations)+'</span><b>'+customer.conversations.length+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.orders)+'</span><b>'+(loadingOps?'…':orders.length)+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.spent)+'</span><b>'+(loadingOps?'…':escapeHtml(money(total)))+'</b></div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.lastActivity)+'</h4><div class="crmHistoryRow"><b>'+escapeHtml(date(customer.last,true))+'</b><span>'+escapeHtml(t.created)+': '+escapeHtml(date(customer.created))+'</span></div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.recentAppointments)+'</h4><div class="crmHistory">'+(apptRows||'<div class="crmHistoryRow"><span>—</span></div>')+'</div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.recentOrders)+'</h4><div class="crmHistory">'+(loadingOps?'<div class="crmHistoryRow"><span>'+escapeHtml(t.loadingOrders)+'</span></div>':orderRows||'<div class="crmHistoryRow"><span>—</span></div>')+'</div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.notes)+'</h4><div class="crmNotes">'+escapeHtml(customer.notes||t.noNotes)+'</div></div>'+
      '<div class="modalActions"><button type="button" class="secondary" id="crmDetailClose">'+escapeHtml(t.close)+'</button></div>';
    q('#crmDetailClose').onclick=closeDetail;
    q('#crmNewBooking').onclick=()=>{const input=q('#apptCustomer');if(input)input.value=customer.name;q('#appointmentModal')?.classList.add('open');requestAnimationFrame(()=>q('#apptTime')?.focus())};
    const orderButton=q('#crmNewOrder');if(orderButton)orderButton.onclick=()=>openQuickOrder(customer,ops);
  }

  function openQuickOrder(customer,ops){
    if(!customer||!ops)return;
    state.selected=customer;
    ensureDetailModal();
    const t=copy();
    q('#crmOrderTitle').textContent=t.newOrder+' — '+customer.name;
    q('#crmOrderProductLabel').textContent=t.orderProduct;
    q('#crmOrderQtyLabel').textContent=t.orderQty;
    q('#crmOrderPaymentLabel').textContent=t.payment;
    q('#crmOrderCancel').textContent=t.cancel;
    q('#crmOrderSave').textContent=t.saveOrder;
    const productSelect=q('#crmOrderProduct');
    productSelect.innerHTML=(ops.products||[]).filter(p=>p.active!==false&&Number(p.available||0)>0).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+' · '+escapeHtml(money(p.price_aed))+' · '+escapeHtml(String(p.available))+'</option>').join('');
    const payment=q('#crmOrderPayment');
    const labels={cash:t.cash,card:t.card,transfer:t.transfer,credit:t.credit,other:t.other};
    [...payment.options].forEach(option=>option.textContent=labels[option.value]||option.value);
    q('#crmOrderQty').value='1';
    q('#crmOrderModal').classList.add('open');
  }

  async function saveQuickOrder(event){
    event.preventDefault();
    const t=copy(),customer=state.selected,button=q('#crmOrderSave');
    if(!customer?.id||!workspace?.business?.id)return;
    const productId=q('#crmOrderProduct').value;
    const quantity=Math.max(1,Math.trunc(Number(q('#crmOrderQty').value||1)));
    const paymentMethod=q('#crmOrderPayment').value;
    button.disabled=true;
    try{
      const response=await fetch('/api/owner-operations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete_sale',business_id:workspace.business.id,customer_id:customer.id,payment_method:paymentMethod,items:[{product_id:productId,quantity}]})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok)throw new Error(payload.error||t.orderFailed);
      operationsCache=null;
      q('#crmOrderModal').classList.remove('open');
      try{if(typeof toast==='function')toast(t.orderSaved)}catch{}
      const ops=await loadOperations();
      if(state.selected)renderDetail(state.selected,ops,false);
    }catch(error){try{if(typeof toast==='function')toast(error.message||t.orderFailed)}catch{}}
    finally{button.disabled=false}
  }

  function renderCustomersEnhanced(){
    const host=q('#customersTable');if(!host||typeof workspace==='undefined'||!workspace)return;
    host.classList.add('crmHost');
    const t=copy(),customers=buildCustomers(),m=metrics(customers),rows=filtered(customers);
    host.innerHTML='<div class="crmMetrics"><div class="crmMetric"><span>'+escapeHtml(t.total)+'</span><strong>'+m.total+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.newCustomers)+'</span><strong>'+m.newCustomers+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.repeat)+'</span><strong>'+m.repeat+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.inactive)+'</span><strong>'+m.inactive+'</strong></div></div>'+
      '<div class="crmToolbar"><input id="crmSearch" value="'+escapeHtml(state.query)+'" placeholder="'+escapeHtml(t.search)+'"><select id="crmFilter"><option value="all">'+escapeHtml(t.all)+'</option><option value="new">'+escapeHtml(t.newStatus)+'</option><option value="repeat">'+escapeHtml(t.repeatStatus)+'</option><option value="inactive">'+escapeHtml(t.inactiveStatus)+'</option></select><select id="crmSort"><option value="latest">'+escapeHtml(t.sortLatest)+'</option><option value="activity">'+escapeHtml(t.sortActivity)+'</option><option value="name">'+escapeHtml(t.sortName)+'</option></select></div>'+
      '<div class="crmList">'+(rows.length?rows.map(card).join(''):'<div class="crmEmpty">'+escapeHtml(t.noResults)+'</div>')+'</div>';
    q('#crmFilter').value=state.filter;
    q('#crmSort').value=state.sort;
    bindToolbar(customers);
  }

  const previous=typeof window.renderCustomers==='function'?window.renderCustomers:(typeof renderCustomers==='function'?renderCustomers:null);
  window.renderCustomers=renderCustomersEnhanced;
  try{renderCustomers=renderCustomersEnhanced}catch{}
  ensureDetailModal();
  try{renderCustomersEnhanced()}catch{}
  document.documentElement.dataset.dabbirCustomerCrm='v1';
})();
(()=>{
  if(window.__dabbirBillingUiLoaded)return;
  window.__dabbirBillingUiLoaded=true;
  let billingState=null,billingBusiness=null,billingLoading=false;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    title:'اشتراك DABBIR — المالك',price:'129 د.إ شهريًا • تجربة كاملة 7 أيام',loading:'جارٍ التحقق من حالة الاشتراك…',unavailable:'حالة الاشتراك غير متاحة حاليًا.',start:'ابدأ التجربة الكاملة',subscribe:'اشترك الآن',manage:'إدارة الاشتراك والدفع',opening:'جارٍ فتح صفحة Stripe الآمنة…',success:'تم إنشاء الاشتراك في Sandbox وتُحدّث الحالة تلقائيًا.',cancelled:'لم يتم إنشاء اشتراك أو خصم أي مبلغ.',trialEnds:'تنتهي التجربة',periodEnds:'نهاية الفترة',cancelScheduled:'الإلغاء مقرر في نهاية الفترة',sandbox:'Stripe Sandbox فقط',states:{not_subscribed:'غير مشترك',trialing:'فترة تجريبية',active:'نشط',past_due:'الدفع متأخر',unpaid:'غير مدفوع',incomplete:'غير مكتمل',canceled:'ملغي',paused:'موقوف',unknown:'غير معروف'}
  }:{
    title:'DABBIR — Owner subscription',price:'AED 129 monthly • 7-day full trial',loading:'Checking subscription status…',unavailable:'Subscription status is currently unavailable.',start:'Start full trial',subscribe:'Subscribe now',manage:'Manage subscription & payment',opening:'Opening secure Stripe Sandbox…',success:'Sandbox subscription created; status updates automatically.',cancelled:'No subscription was created and no amount was charged.',trialEnds:'Trial ends',periodEnds:'Period ends',cancelScheduled:'Cancellation scheduled for period end',sandbox:'Stripe Sandbox only',states:{not_subscribed:'Not subscribed',trialing:'Trial',active:'Active',past_due:'Payment past due',unpaid:'Unpaid',incomplete:'Incomplete',canceled:'Canceled',paused:'Paused',unknown:'Unknown'}
  };
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function format(value){if(!value)return '';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value)}}
  function owner(){return String(window.workspace?.membership?.role||'').toLowerCase()==='owner'}
  async function load(){const id=window.workspace?.business?.id;if(!id||!owner()||billingLoading||(billingBusiness===id&&billingState))return;billingLoading=true;billingBusiness=id;billingState=null;renderCard();try{const response=await fetch('/api/billing/status?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const body=await response.json().catch(()=>null);billingState=response.ok&&body?.ok?body.billing:{error:true};}catch{billingState={error:true}}finally{billingLoading=false;renderCard()}}
  async function open(path,button){const id=window.workspace?.business?.id;if(!id||!owner()||button?.disabled)return;button.disabled=true;try{if(typeof toast==='function')toast(text().opening);const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id})});const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok||!body?.url)throw new Error(body?.error||'BILLING_UNAVAILABLE');location.assign(body.url)}catch(error){button.disabled=false;if(typeof toast==='function')toast(String(error?.message||text().unavailable))}}
  function cardHtml(){const t=text();if(billingLoading||!billingState)return '<div class="item" id="dabbirBillingCard"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.price)+'<br>'+escape(t.loading)+'</small></div><span class="badge gray">…</span></div>';if(billingState.error)return '<div class="item" id="dabbirBillingCard"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.unavailable)+'</small></div><span class="badge red">!</span></div>';const state=String(billingState.status||'unknown'),label=t.states[state]||t.states.unknown,active=['trialing','active'].includes(state),badge=active?'green':(['past_due','unpaid'].includes(state)?'red':'gray');const date=billingState.trial_ends_at?t.trialEnds+': '+format(billingState.trial_ends_at):(billingState.current_period_ends_at?t.periodEnds+': '+format(billingState.current_period_ends_at):'');const cancel=billingState.cancel_at_period_end?t.cancelScheduled:'';const action=billingState.can_manage?'<button class="secondary" id="dabbirBillingManage">'+escape(t.manage)+'</button>':(billingState.can_subscribe?'<button class="primary" id="dabbirBillingStart">'+escape(billingState.trial_available?t.start:t.subscribe)+'</button>':'');return '<div class="item" id="dabbirBillingCard" data-mode="sandbox"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.price)+'<br>'+escape(t.sandbox)+(date?'<br>'+escape(date):'')+(cancel?'<br>'+escape(cancel):'')+'</small></div><span class="badge '+badge+'">'+escape(label)+'</span>'+action+'</div>'}
  function renderCard(){const list=q('#settingsList');if(!list||!window.workspace?.business)return;const old=q('#dabbirBillingCard');if(old)old.remove();if(!owner())return;list.insertAdjacentHTML('beforeend',cardHtml());const start=q('#dabbirBillingStart'),manage=q('#dabbirBillingManage');if(start)start.onclick=()=>open('/api/billing/checkout',start);if(manage)manage.onclick=()=>open('/api/billing/portal',manage)}
  if(typeof renderSettings==='function'){const base=renderSettings;renderSettings=function(){const result=base.apply(this,arguments);renderCard();load();return result}}
  if(typeof setLanguage==='function'){const base=setLanguage;setLanguage=function(next){const result=base.apply(this,arguments);setTimeout(renderCard,0);return result}}
  const params=new URLSearchParams(location.search);const billing=params.get('billing');if(billing){setTimeout(()=>{if(typeof toast==='function')toast(billing==='success'?text().success:text().cancelled)},350);const clean=new URL(location.href);clean.searchParams.delete('billing');clean.searchParams.delete('session_id');history.replaceState({},'',clean.pathname+clean.search+clean.hash)}
  setTimeout(()=>{renderCard();load()},250);
  window.__dabbirBillingUi={version:'sandbox-v1',refresh:()=>{billingState=null;billingBusiness=null;return load()}};
})();
(()=>{
  if (window.__dabbirPlatformCustomersUi) return;
  window.__dabbirPlatformCustomersUi = true;

  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const isAr = () => document.documentElement.lang !== 'en';
  const text = () => isAr() ? {
    nav:'إدارة العملاء', title:'إدارة عملاء DABBIR', desc:'حسابات عملاء المنصة والدعم والتحكم والاسترجاع من مكان واحد.',
    search:'ابحث برقم DAB أو البريد أو الهاتف أو اسم النشاط', find:'بحث', accounts:'الحسابات', businesses:'الأنشطة', active:'نشط', blocked:'موقوف', suspended:'معلّق في DABBIR',
    lastLogin:'آخر دخول', created:'تاريخ التسجيل', phone:'الهاتف', noPhone:'غير مسجل', details:'فتح الحساب', back:'العودة للحسابات',
    customers:'عملاء النشاط', chats:'المحادثات', messages:'الرسائل', orders:'الطلبات', appointments:'المواعيد', tasks:'المهام',
    access:'وصول DABBIR', accessDesc:'تعليق الحساب يوقف وصول هذا العميل إلى DABBIR فقط ولا يحظر هوية Supabase أو أي نظام آخر.',
    suspend:'تعليق الحساب', reactivate:'إعادة تفعيل الحساب', reason:'سبب التعليق', reasonPlaceholder:'مثال: طلب العميل، إساءة استخدام، مشكلة فوترة قيد المراجعة',
    suspendConfirm:'للتعليق اكتب', suspendedAt:'تم التعليق', accessUpdated:'تم تحديث وصول الحساب.', adminProtected:'لا يمكن تعليق حساب Platform Admin.', reasonRequired:'اكتب سببًا واضحًا للتعليق.', confirmRequired:'عبارة التأكيد غير مطابقة.',
    recovery:'استرجاع البيانات', recoveryDesc:'اختر وقتًا سابقًا لمساحة العمل. المعاينة تفصل الاسترجاع الآمن عن البيانات التي تحتاج مصالحة يدوية. يجب تعليق الحساب قبل إنشاء حالة الاسترجاع.', targetTime:'الوقت المراد الرجوع إليه', preview:'معاينة الاسترجاع', prepare:'إنشاء حالة استرجاع', events:'إجمالي التغييرات', safeEvents:'قابلة للاسترجاع الآمن', manualEvents:'تحتاج مصالحة يدوية', confirmLabel:'للتنفيذ اكتب', apply:'تنفيذ الاسترجاع', restored:'تم تنفيذ الاسترجاع.', danger:'سيبقى الحساب معلّقًا بعد الاسترجاع حتى تتم مراجعته وإعادة تفعيله يدويًا.', frozenRequired:'يجب تعليق حساب العميل أولًا قبل إنشاء أو تنفيذ الاسترجاع.', manualRequired:'المعاينة تحتوي بيانات دفع/رسائل/طلبات/خصوصية أو تكاملات. تم منع الاسترجاع التلقائي وتحتاج هذه البيانات مصالحة يدوية.', safeReady:'المعاينة آمنة للاسترجاع التلقائي.',
    empty:'لا توجد نتائج.', loading:'جارٍ التحميل...', failed:'تعذر تحميل لوحة إدارة العملاء.'
  } : {
    nav:'Customer admin', title:'DABBIR customer administration', desc:'Platform customer accounts, support, access control and recovery in one place.',
    search:'Search DAB number, email, phone, or business name', find:'Search', accounts:'Accounts', businesses:'Businesses', active:'Active', blocked:'Blocked', suspended:'Suspended in DABBIR',
    lastLogin:'Last sign-in', created:'Created', phone:'Phone', noPhone:'Not stored', details:'Open account', back:'Back to accounts',
    customers:'Business customers', chats:'Conversations', messages:'Messages', orders:'Orders', appointments:'Appointments', tasks:'Tasks',
    access:'DABBIR access', accessDesc:'Suspension blocks this customer from DABBIR only. It does not ban the Supabase identity or other systems.',
    suspend:'Suspend account', reactivate:'Reactivate account', reason:'Suspension reason', reasonPlaceholder:'Example: customer request, abuse, billing review',
    suspendConfirm:'To suspend, type', suspendedAt:'Suspended', accessUpdated:'Account access updated.', adminProtected:'A Platform Admin account cannot be suspended.', reasonRequired:'Enter a clear suspension reason.', confirmRequired:'Confirmation phrase does not match.',
    recovery:'Data recovery', recoveryDesc:'Choose an earlier workspace time. Preview separates safe automatic recovery from data that requires manual reconciliation. The account must be suspended before a recovery case can be created.', targetTime:'Restore point', preview:'Preview recovery', prepare:'Create recovery case', events:'Total changes', safeEvents:'Safe automatic restore', manualEvents:'Manual reconciliation', confirmLabel:'To apply, type', apply:'Apply recovery', restored:'Recovery applied.', danger:'The account remains suspended after recovery until it is reviewed and manually reactivated.', frozenRequired:'Suspend the customer account before creating or applying recovery.', manualRequired:'This preview includes payment, messaging, order, privacy, workflow, or integration state. Automatic recovery is blocked and manual reconciliation is required.', safeReady:'Preview is safe for automatic recovery.',
    empty:'No results.', loading:'Loading...', failed:'Customer administration could not load.'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat(isAr() ? 'ar-AE' : 'en-AE', {dateStyle:'medium', timeStyle:'short'}).format(new Date(value)); }
    catch { return String(value); }
  };
  const api = async (url, options={}) => {
    const response = await fetch(url, {cache:'no-store', credentials:'same-origin', ...options, headers:{'content-type':'application/json', ...(options.headers||{})}});
    const payload = await response.json().catch(()=>({}));
    return {response,payload};
  };
  const notify = message => { try { if (typeof toast === 'function') toast(message); } catch {} };

  let enabled = false;
  let capabilityDenied = false;
  let capabilityProbePromise = null;
  let accounts = [];
  let selected = null;
  let recoveryPreview = null;
  let recoveryCase = null;

  const style = document.createElement('style');
  style.dataset.dabbirPlatformCustomers = 'v4';
  style.textContent = '.pcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pcToolbar{display:flex;gap:8px;margin-bottom:12px}.pcToolbar input{flex:1;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px}.pcAccount{border:1px solid var(--line);background:#131619;border-radius:16px;padding:13px}.pcAccount b{display:block;font-size:12px}.pcAccount small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.pcCode{direction:ltr;display:inline-block;font-weight:950;letter-spacing:.04em;color:var(--accent)}.pcBiz{border:1px solid var(--line);border-radius:15px;padding:12px;margin-top:10px;background:#121416}.pcCounts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.pcCount{background:#191c20;border-radius:10px;padding:8px}.pcCount span{font-size:8px;color:var(--muted);display:block}.pcCount b{font-size:15px}.pcDanger{border:1px solid #5b3030;background:#2b1717;border-radius:14px;padding:11px;margin-top:12px}.pcAccess{border:1px solid #3d4654;background:#151a20;border-radius:14px;padding:12px;margin-top:12px}.pcAccess.suspended{border-color:#6a4c2c;background:#261d12}.pcAccess input{width:100%;border:1px solid var(--line);background:#101316;color:#fff;border-radius:10px;padding:9px;margin-top:7px}.pcRecoveryResult{margin-top:9px;padding:9px;border:1px solid var(--line);border-radius:11px;font-size:10px}.pcRecoverySafe{border-color:#28583a;background:#12251a}.pcRecoveryBlocked{border-color:#6c4030;background:#2d1d15}.pcMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.pcMetric{border:1px solid var(--line);border-radius:14px;padding:12px;background:#131619}.pcMetric span{font-size:9px;color:var(--muted);display:block}.pcMetric strong{font-size:21px}.pcActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}@media(max-width:760px){.pcGrid{grid-template-columns:1fr}.pcMetrics{grid-template-columns:repeat(2,1fr)}.pcToolbar{flex-direction:column}.pcCounts{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(style);

  function ensureScreen(){
    if (q('#screen-platform-customers')) return;
    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.id = 'screen-platform-customers';
    screen.innerHTML = '<div class="hero"><div><h1 id="pcTitle"></h1><p id="pcDesc"></p></div></div><div id="pcBody"></div>';
    q('.content')?.appendChild(screen);
    const nav = document.createElement('button');
    nav.className = 'navBtn';
    nav.dataset.screen = 'platform-customers';
    nav.innerHTML = '♚ <span id="pcNav"></span>';
    q('#nav')?.appendChild(nav);
    nav.onclick = () => { showScreen('platform-customers'); loadAccounts(''); };
    applyLabels();
  }

  function removeScreen(){
    q('#screen-platform-customers')?.remove();
    q('#nav [data-screen="platform-customers"]')?.remove();
  }

  function applyLabels(){
    const t = text();
    if (q('#pcTitle')) q('#pcTitle').textContent = t.title;
    if (q('#pcDesc')) q('#pcDesc').textContent = t.desc;
    if (q('#pcNav')) q('#pcNav').textContent = t.nav;
    if (typeof current !== 'undefined' && current === 'platform-customers' && q('#pageTitle')) q('#pageTitle').textContent = t.nav;
  }

  async function capability(){
    if(enabled||capabilityDenied)return enabled;
    if(capabilityProbePromise)return capabilityProbePromise;
    capabilityProbePromise=(async()=>{
      const {response,payload} = await api('/api/platform-customers?action=capability');
      if(!response.ok)return false;
      if(!payload.allowed){
        if(payload.reason==='PLATFORM_ADMIN_REQUIRED'||payload.reason==='SERVER_ADMIN_NOT_CONFIGURED')capabilityDenied=true;
        return false;
      }
      enabled = true;
      ensureScreen();
      await loadAccounts('');
      return true;
    })();
    try{return await capabilityProbePromise}finally{capabilityProbePromise=null}
  }

  function loading(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().loading)+'</div>'; }
  function failed(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().failed)+'</div>'; }
  function isSuspended(account){ return String(account?.access_status || account?.access?.status || 'active') === 'suspended'; }
  function accountLabel(account){ const t=text(); return isSuspended(account) ? t.suspended : (account.deleted_at || account.banned_until ? t.blocked : t.active); }
  function badgeClass(account){ return isSuspended(account) || account.deleted_at || account.banned_until ? 'red' : 'green'; }

  async function loadAccounts(term){
    if (!enabled) return;
    selected=null; recoveryPreview=null; recoveryCase=null; loading();
    const {response,payload} = await api('/api/platform-customers?action=search&q='+encodeURIComponent(term||''));
    if (!response.ok) return failed();
    accounts = payload.accounts || [];
    renderAccounts();
  }

  async function openAccount(userId){
    loading();
    const {response,payload} = await api('/api/platform-customers?action=detail&user_id='+encodeURIComponent(userId));
    if (!response.ok) return failed();
    selected=payload.customer; recoveryPreview=null; recoveryCase=null;
    renderDetail();
  }

  function renderAccounts(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const active=accounts.filter(a=>!a.deleted_at&&!a.banned_until&&!isSuspended(a)).length;
    const businesses=accounts.reduce((sum,a)=>sum+Number(a.business_count||0),0);
    const cards=accounts.length ? accounts.map(a =>
      '<div class="pcAccount"><span class="pcCode">'+esc(a.customer_no)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small><small>'+esc(t.lastLogin)+': '+esc(fmt(a.last_sign_in_at))+'</small><div class="pcActions"><span class="badge '+badgeClass(a)+'">'+esc(accountLabel(a))+'</span><button class="secondary" data-pc-user="'+esc(a.user_id)+'">'+esc(t.details)+'</button></div></div>'
    ).join('') : '<div class="empty">'+esc(t.empty)+'</div>';
    body.innerHTML='<div class="pcMetrics"><div class="pcMetric"><span>'+esc(t.accounts)+'</span><strong>'+accounts.length+'</strong></div><div class="pcMetric"><span>'+esc(t.active)+'</span><strong>'+active+'</strong></div><div class="pcMetric"><span>'+esc(t.businesses)+'</span><strong>'+businesses+'</strong></div></div><div class="pcToolbar"><input id="pcSearch" placeholder="'+esc(t.search)+'"><button class="primary" id="pcSearchBtn">'+esc(t.find)+'</button></div><div class="pcGrid">'+cards+'</div>';
    q('#pcSearchBtn').onclick=()=>loadAccounts(q('#pcSearch').value);
    q('#pcSearch').onkeydown=event=>{ if(event.key==='Enter') loadAccounts(event.target.value); };
    qa('[data-pc-user]').forEach(button=>button.onclick=()=>openAccount(button.dataset.pcUser));
  }

  function renderAccess(){
    const t=text(), account=selected.account||{}, access=selected.access||{status:'active'};
    if(access.status==='suspended'){
      return '<div class="pcAccess suspended"><div class="row space"><div><b>'+esc(t.access)+'</b><small>'+esc(t.accessDesc)+'</small></div><span class="badge red">'+esc(t.suspended)+'</span></div><div class="pcRecoveryResult"><b>'+esc(t.reason)+':</b> '+esc(access.reason||'—')+'<br><small>'+esc(t.suspendedAt)+': '+esc(fmt(access.suspended_at))+'</small></div><div class="pcActions"><button class="primary" id="pcReactivate">'+esc(t.reactivate)+'</button></div></div>';
    }
    const phrase='SUSPEND '+String(account.customer_no||'');
    return '<div class="pcAccess"><div class="row space"><div><b>'+esc(t.access)+'</b><small>'+esc(t.accessDesc)+'</small></div><span class="badge green">'+esc(t.active)+'</span></div><label style="display:block;margin-top:9px;font-size:9px;color:var(--muted)">'+esc(t.reason)+'</label><input id="pcSuspendReason" maxlength="500" placeholder="'+esc(t.reasonPlaceholder)+'"><div style="margin-top:8px;font-size:9px;color:var(--muted)">'+esc(t.suspendConfirm)+' <span class="pcCode">'+esc(phrase)+'</span></div><input id="pcSuspendConfirm" autocomplete="off" placeholder="'+esc(phrase)+'"><div class="pcActions"><button class="danger" id="pcSuspend">'+esc(t.suspend)+'</button></div></div>';
  }

  function renderBusiness(business){
    const t=text(), counts=business.counts||{};
    const preview=recoveryPreview?.business_id===business.id ? recoveryPreview : null;
    const caseId=recoveryCase?.business_id===business.id ? recoveryCase.case_id : null;
    const accountSuspended=String(selected?.access?.status||'active')==='suspended';
    const blocked=preview ? !preview.auto_restore_ready : false;
    const tableSummary=preview?.tables ? Object.entries(preview.tables).map(([name,count])=>esc(name)+': '+esc(count)).join(' · ') : '';
    const reconcileSummary=preview?.reconciliation_tables ? Object.entries(preview.reconciliation_tables).map(([name,value])=>esc(name)+': '+Number(value?.events||0)).join(' · ') : '';
    const counterPairs=[[t.customers,counts.customers],[t.chats,counts.conversations],[t.messages,counts.messages],[t.orders,counts.orders],[t.appointments,counts.appointments],[t.tasks,counts.tasks]];
    const counters=counterPairs.map(pair=>'<div class="pcCount"><span>'+esc(pair[0])+'</span><b>'+Number(pair[1]||0)+'</b></div>').join('');
    const previewHtml=preview ? '<div class="pcRecoveryResult '+(blocked?'pcRecoveryBlocked':'pcRecoverySafe')+'"><b>'+esc(t.events)+': '+Number(preview.events_to_reverse||0)+'</b><div>'+esc(t.safeEvents)+': '+Number(preview.auto_restore_events||0)+' · '+esc(t.manualEvents)+': '+Number(preview.reconciliation_events||0)+'</div>'+(tableSummary?'<div>'+tableSummary+'</div>':'')+(blocked?'<small style="display:block;margin-top:6px;color:var(--red)">'+esc(t.manualRequired)+(reconcileSummary?' · '+reconcileSummary:'')+'</small>':'<small style="display:block;margin-top:6px">'+esc(t.safeReady)+'</small>')+(!accountSuspended?'<small style="display:block;margin-top:6px;color:var(--red)">'+esc(t.frozenRequired)+'</small>':'')+'</div>' : '';
    const canPrepare=preview && !blocked && accountSuspended;
    const caseHtml=caseId ? '<div class="pcRecoveryResult"><div>'+esc(t.confirmLabel)+' <span class="pcCode">RESTORE '+esc(selected.account.customer_no)+'</span></div><input style="width:100%;margin-top:7px" data-pc-confirm="'+esc(business.id)+'" placeholder="RESTORE '+esc(selected.account.customer_no)+'"><button style="margin-top:7px" class="primary" data-pc-apply="'+esc(business.id)+'">'+esc(t.apply)+'</button><small style="display:block;color:var(--red);margin-top:6px">'+esc(t.danger)+'</small></div>' : '';
    return '<div class="pcBiz"><div class="row space"><div><b>'+esc(business.name)+'</b><small>'+esc(business.business_type)+' · '+esc(business.role)+' · '+esc(business.membership_status)+'</small></div><span class="badge gray">'+esc(business.locale||'')+'</span></div><div class="pcCounts">'+counters+'</div><div class="pcDanger"><b>'+esc(t.recovery)+'</b><small style="display:block;color:var(--muted);margin-top:4px">'+esc(t.recoveryDesc)+'</small><div class="field"><label>'+esc(t.targetTime)+'</label><input type="datetime-local" data-pc-time="'+esc(business.id)+'"></div><div class="pcActions"><button class="secondary" data-pc-preview="'+esc(business.id)+'">'+esc(t.preview)+'</button>'+(canPrepare?'<button class="primary" data-pc-open="'+esc(business.id)+'">'+esc(t.prepare)+'</button>':'')+'</div>'+previewHtml+caseHtml+'</div></div>';
  }

  function renderDetail(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const user=selected.user||{}, account=selected.account||{}, businesses=selected.businesses||[];
    const statusObject={...user,access:selected.access};
    body.innerHTML='<button class="secondary" id="pcBack">← '+esc(t.back)+'</button><div class="card" style="margin-top:10px"><div class="row space"><div><span class="pcCode">'+esc(account.customer_no||'')+'</span><h2 style="margin:5px 0">'+esc(user.email||'—')+'</h2></div><span class="badge '+badgeClass(statusObject)+'">'+esc(accountLabel(statusObject))+'</span></div><div class="pcGrid" style="margin-top:10px"><div class="pcAccount"><small>'+esc(t.phone)+'</small><b>'+esc(user.phone||t.noPhone)+'</b></div><div class="pcAccount"><small>'+esc(t.created)+'</small><b>'+esc(fmt(user.created_at))+'</b></div><div class="pcAccount"><small>'+esc(t.lastLogin)+'</small><b>'+esc(fmt(user.last_sign_in_at))+'</b></div></div>'+renderAccess()+'</div><div style="margin-top:12px">'+businesses.map(renderBusiness).join('')+'</div>';
    q('#pcBack').onclick=()=>{selected=null;renderAccounts();};
    if(q('#pcSuspend')) q('#pcSuspend').onclick=suspendAccount;
    if(q('#pcReactivate')) q('#pcReactivate').onclick=reactivateAccount;
    qa('[data-pc-preview]').forEach(button=>button.onclick=()=>previewRecovery(button.dataset.pcPreview));
    qa('[data-pc-open]').forEach(button=>button.onclick=()=>openRecovery(button.dataset.pcOpen));
    qa('[data-pc-apply]').forEach(button=>button.onclick=()=>applyRecovery(button.dataset.pcApply));
  }

  async function suspendAccount(){
    const t=text();
    const reason=String(q('#pcSuspendReason')?.value||'').trim();
    const expected='SUSPEND '+String(selected.account?.customer_no||'');
    const confirmation=String(q('#pcSuspendConfirm')?.value||'').trim();
    if(reason.length<3) return notify(t.reasonRequired);
    if(confirmation!==expected) return notify(t.confirmRequired);
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'set_access',user_id:selected.user.id,status:'suspended',reason})});
    if(!response.ok) return notify(payload.error==='PLATFORM_ADMIN_IMMUTABLE' ? t.adminProtected : (payload.error||t.failed));
    notify(t.accessUpdated);
    await openAccount(selected.user.id);
  }

  async function reactivateAccount(){
    const t=text();
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'set_access',user_id:selected.user.id,status:'active'})});
    if(!response.ok) return notify(payload.error||t.failed);
    notify(t.accessUpdated);
    await openAccount(selected.user.id);
  }

  async function previewRecovery(businessId){
    const input=q('[data-pc-time="'+CSS.escape(businessId)+'"]');
    if(!input?.value) return;
    const target=new Date(input.value).toISOString();
    const {response,payload}=await api('/api/platform-customers?action=recovery_preview&user_id='+encodeURIComponent(selected.user.id)+'&business_id='+encodeURIComponent(businessId)+'&target_at='+encodeURIComponent(target));
    if(!response.ok) return notify(payload.error||text().failed);
    recoveryPreview={...payload.preview,business_id:businessId,target_at:target}; recoveryCase=null; renderDetail();
  }

  async function openRecovery(businessId){
    const t=text();
    if(!recoveryPreview||recoveryPreview.business_id!==businessId) return;
    if(!recoveryPreview.auto_restore_ready) return notify(t.manualRequired);
    if(String(selected?.access?.status||'active')!=='suspended') return notify(t.frozenRequired);
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'open_recovery',user_id:selected.user.id,business_id:businessId,target_at:recoveryPreview.target_at,reason:'Platform owner customer support recovery'})});
    if(!response.ok){
      if(payload.error==='RECOVERY_ACCOUNT_MUST_BE_SUSPENDED') return notify(t.frozenRequired);
      if(payload.error==='RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED') return notify(t.manualRequired);
      return notify(payload.error||t.failed);
    }
    recoveryCase={business_id:businessId,case_id:payload.case_id}; renderDetail();
  }

  async function applyRecovery(businessId){
    const t=text();
    if(!recoveryCase||recoveryCase.business_id!==businessId) return;
    if(String(selected?.access?.status||'active')!=='suspended') return notify(t.frozenRequired);
    const input=q('[data-pc-confirm="'+CSS.escape(businessId)+'"]');
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'apply_recovery',user_id:selected.user.id,case_id:recoveryCase.case_id,confirmation:input?.value||''})});
    if(!response.ok){
      if(payload.error==='RECOVERY_ACCOUNT_MUST_BE_SUSPENDED') return notify(t.frozenRequired);
      if(payload.error==='RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED') return notify(t.manualRequired);
      return notify(payload.error||t.failed);
    }
    notify(t.restored); recoveryPreview=null; recoveryCase=null; await openAccount(selected.user.id);
  }

  const langObserver=new MutationObserver(()=>{ if(enabled){ applyLabels(); selected ? renderDetail() : renderAccounts(); } });
  langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  const authStage=()=>String(document.body?.dataset?.dabbirAuthStage||'');
  const authReady=()=>authStage()==='session_verified'||authStage()==='workspace_ready';
  const probeWhenReady=()=>{ if(authReady()&&!enabled&&!capabilityDenied) capability(); };
  const authObserver=new MutationObserver(()=>{
    if(authStage()==='signed_out'){
      enabled=false;
      capabilityDenied=false;
      capabilityProbePromise=null;
      removeScreen();
    }
    probeWhenReady();
  });
  if(document.body)authObserver.observe(document.body,{attributes:true,attributeFilter:['data-dabbir-auth-stage']});
  setTimeout(probeWhenReady,0);
})();
(()=>{
  if(window.__dabbirPlatformCustomerSupportUi)return;
  window.__dabbirPlatformCustomerSupportUi=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const copy=()=>ar()?{
    title:'الدعم الداخلي',desc:'قضايا وملاحظات الدعم الخاصة بهذا العميل. هذه البيانات لا تظهر للعميل.',open:'مفتوحة',waiting:'انتظار',resolved:'محلولة',total:'الإجمالي',
    newCase:'فتح قضية دعم',subject:'الموضوع',subjectPh:'وصف مختصر للمشكلة',category:'التصنيف',priority:'الأولوية',business:'النشاط',allAccount:'الحساب بالكامل',note:'ملاحظة داخلية',notePh:'ما الذي حدث؟ وما الإجراء التالي؟',create:'إنشاء القضية',
    cases:'قضايا الدعم',noCases:'لا توجد قضايا دعم لهذا العميل.',addNote:'إضافة ملاحظة',saveNote:'حفظ الملاحظة',markWaiting:'بانتظار متابعة',resolve:'إغلاق كمحلولة',reopen:'إعادة فتح',
    timeline:'سجل إدارة الحساب',noTimeline:'لا توجد إجراءات إدارية مسجلة.',loading:'جارٍ تحميل الدعم...',failed:'تعذر تحميل سجل الدعم.',saved:'تم تحديث سجل الدعم.',
    categories:{general:'عام',access:'الوصول',billing:'الفوترة',data:'البيانات',recovery:'الاسترجاع',whatsapp:'واتساب',integration:'الربط',bug:'خلل تقني',abuse:'إساءة استخدام',privacy:'الخصوصية',other:'أخرى'},
    priorities:{low:'منخفضة',normal:'عادية',high:'عالية',urgent:'عاجلة'},statuses:{open:'مفتوحة',waiting:'انتظار',resolved:'محلولة'}
  }:{
    title:'Internal support',desc:'Support cases and internal notes for this customer. Customers cannot see this data.',open:'Open',waiting:'Waiting',resolved:'Resolved',total:'Total',
    newCase:'Open support case',subject:'Subject',subjectPh:'Short description of the issue',category:'Category',priority:'Priority',business:'Business',allAccount:'Whole account',note:'Internal note',notePh:'What happened and what is the next action?',create:'Create case',
    cases:'Support cases',noCases:'No support cases for this customer.',addNote:'Add note',saveNote:'Save note',markWaiting:'Mark waiting',resolve:'Resolve',reopen:'Reopen',
    timeline:'Account administration timeline',noTimeline:'No administration events recorded.',loading:'Loading support...',failed:'Support history could not load.',saved:'Support history updated.',
    categories:{general:'General',access:'Access',billing:'Billing',data:'Data',recovery:'Recovery',whatsapp:'WhatsApp',integration:'Integration',bug:'Bug',abuse:'Abuse',privacy:'Privacy',other:'Other'},
    priorities:{low:'Low',normal:'Normal',high:'High',urgent:'Urgent'},statuses:{open:'Open',waiting:'Waiting',resolved:'Resolved'}
  };
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const api=async(url,options={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return{r,j}};
  const style=document.createElement('style');
  style.dataset.dabbirCustomerSupport='v1';
  style.textContent='.pcsCard{border:1px solid var(--line);background:#111417;border-radius:18px;padding:15px;margin-top:14px}.pcsHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.pcsHead h3{margin:0}.pcsHead p{margin:4px 0 0;color:var(--muted);font-size:10px}.pcsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.pcsMetric{background:#171a1e;border:1px solid var(--line);border-radius:12px;padding:9px}.pcsMetric span{display:block;color:var(--muted);font-size:8px}.pcsMetric b{font-size:18px}.pcsForm{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}.pcsForm input,.pcsForm select,.pcsNote{width:100%;border:1px solid var(--line);background:#0f1215;color:#fff;border-radius:10px;padding:9px;min-height:42px}.pcsNote{margin-top:8px;min-height:74px;resize:vertical}.pcsCase{border:1px solid var(--line);border-radius:14px;padding:11px;margin-top:9px;background:#15181b}.pcsMeta{color:var(--muted);font-size:9px}.pcsNotes{margin-top:8px}.pcsNoteItem{border-inline-start:2px solid var(--line);padding:6px 9px;margin-top:5px;font-size:10px}.pcsTimeline{border-top:1px solid var(--line);padding:8px 0;font-size:10px}.pcsActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pcsActions button{min-height:36px}.pcsSectionTitle{margin:15px 0 7px;font-size:12px}.pcsBadge{display:inline-flex;border-radius:99px;padding:4px 7px;font-size:8px;font-weight:900;background:#20252a}.pcsUrgent{background:#3b1717;color:#ffaaaa}.pcsHigh{background:#3c2a14;color:#ffd28c}.pcsResolved{background:#14331e;color:#8ce6a1}@media(max-width:760px){.pcsForm{grid-template-columns:1fr 1fr}.pcsMetrics{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(style);

  function customerNo(){for(const n of qa('#pcBody .pcCode')){const v=String(n.textContent||'').trim().toUpperCase();if(/^DAB-[0-9]{6,}$/.test(v))return v}return null}
  function businessOptions(){const seen=new Set(),out=[];for(const n of qa('#pcBody [data-pc-time]')){const id=String(n.getAttribute('data-pc-time')||'');if(!id||seen.has(id))continue;seen.add(id);const name=n.closest('.pcBiz')?.querySelector('b')?.textContent?.trim()||id;out.push({id,name})}return out}
  function eventLabel(action){const map=ar()?{customer_detail:'فتح بيانات الحساب',account_access_changed:'تغيير وصول الحساب',support_case_created:'فتح قضية دعم',support_note_added:'إضافة ملاحظة دعم',support_case_status_changed:'تغيير حالة قضية',recovery_case_opened:'فتح حالة استرجاع',recovery_applied:'تنفيذ استرجاع'}:{customer_detail:'Account opened',account_access_changed:'Account access changed',support_case_created:'Support case opened',support_note_added:'Support note added',support_case_status_changed:'Support case status changed',recovery_case_opened:'Recovery case opened',recovery_applied:'Recovery applied'};return map[action]||String(action||'—').replaceAll('_',' ')}
  function badgeCase(c,t){const cls=c.status==='resolved'?' pcsResolved':c.priority==='urgent'?' pcsUrgent':c.priority==='high'?' pcsHigh':'';return '<span class="pcsBadge'+cls+'">'+esc(t.statuses[c.status]||c.status)+' · '+esc(t.priorities[c.priority]||c.priority)+'</span>'}

  async function load(panel,no){
    panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(copy().title)+'</h3><p>'+esc(copy().loading)+'</p></div></div>';
    const {r,j}=await api('/api/platform-customer-support?customer_no='+encodeURIComponent(no));
    if(!r.ok){panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(copy().title)+'</h3><p>'+esc(copy().failed)+'</p></div></div>';return}
    render(panel,no,j.support||{});
  }
  function render(panel,no,data){
    const t=copy(),m=data.metrics||{},cases=Array.isArray(data.cases)?data.cases:[],timeline=Array.isArray(data.timeline)?data.timeline:[],biz=businessOptions();
    const catOptions=Object.entries(t.categories).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const priOptions=Object.entries(t.priorities).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const bizOptions='<option value="">'+esc(t.allAccount)+'</option>'+biz.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');
    const casesHtml=cases.length?cases.map(c=>'<div class="pcsCase" data-pcs-case="'+esc(c.id)+'"><div class="pcsHead"><div><b>'+esc(c.subject)+'</b><div class="pcsMeta">'+esc(t.categories[c.category]||c.category)+' · '+esc(fmt(c.created_at))+'</div></div>'+badgeCase(c,t)+'</div><div class="pcsNotes">'+((c.notes||[]).map(n=>'<div class="pcsNoteItem">'+esc(n.note)+'<div class="pcsMeta">'+esc(fmt(n.created_at))+'</div></div>').join('')||'')+'</div><textarea class="pcsNote" data-pcs-note-input="'+esc(c.id)+'" placeholder="'+esc(t.addNote)+'"></textarea><div class="pcsActions"><button class="secondary" data-pcs-add-note="'+esc(c.id)+'">'+esc(t.saveNote)+'</button>'+(c.status!=='waiting'?'<button class="secondary" data-pcs-status="waiting" data-pcs-id="'+esc(c.id)+'">'+esc(t.markWaiting)+'</button>':'')+(c.status!=='resolved'?'<button class="primary" data-pcs-status="resolved" data-pcs-id="'+esc(c.id)+'">'+esc(t.resolve)+'</button>':'<button class="secondary" data-pcs-status="open" data-pcs-id="'+esc(c.id)+'">'+esc(t.reopen)+'</button>')+'</div></div>').join(''):'<div class="pcsMeta">'+esc(t.noCases)+'</div>';
    const timelineHtml=timeline.length?timeline.slice(0,20).map(e=>'<div class="pcsTimeline"><b>'+esc(eventLabel(e.action))+'</b><div class="pcsMeta">'+esc(fmt(e.created_at))+'</div></div>').join(''):'<div class="pcsMeta">'+esc(t.noTimeline)+'</div>';
    panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(t.title)+'</h3><p>'+esc(t.desc)+'</p></div><span class="pcCode">'+esc(no)+'</span></div><div class="pcsMetrics"><div class="pcsMetric"><span>'+esc(t.open)+'</span><b>'+Number(m.open||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.waiting)+'</span><b>'+Number(m.waiting||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.resolved)+'</span><b>'+Number(m.resolved||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.total)+'</span><b>'+Number(m.total||0)+'</b></div></div><div class="pcsSectionTitle">'+esc(t.newCase)+'</div><div class="pcsForm"><input id="pcsSubject" maxlength="200" placeholder="'+esc(t.subjectPh)+'"><select id="pcsCategory">'+catOptions+'</select><select id="pcsPriority">'+priOptions+'</select><select id="pcsBusiness">'+bizOptions+'</select></div><textarea id="pcsInitialNote" class="pcsNote" maxlength="4000" placeholder="'+esc(t.notePh)+'"></textarea><div class="pcsActions"><button class="primary" id="pcsCreate">'+esc(t.create)+'</button></div><div class="pcsSectionTitle">'+esc(t.cases)+'</div>'+casesHtml+'<div class="pcsSectionTitle">'+esc(t.timeline)+'</div>'+timelineHtml;
    q('#pcsCreate')?.addEventListener('click',async()=>{const subject=String(q('#pcsSubject')?.value||'').trim();if(subject.length<3)return;const body={action:'create_case',customer_no:no,business_id:q('#pcsBusiness')?.value||null,category:q('#pcsCategory')?.value||'general',priority:q('#pcsPriority')?.value||'normal',subject,note:String(q('#pcsInitialNote')?.value||'').trim()};const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify(body)});if(r.ok){notify(t.saved);await load(panel,no)}});
    qa('[data-pcs-add-note]').forEach(b=>b.onclick=async()=>{const id=b.dataset.pcsAddNote,input=q('[data-pcs-note-input="'+CSS.escape(id)+'"]'),note=String(input?.value||'').trim();if(note.length<2)return;const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify({action:'add_note',customer_no:no,case_id:id,note})});if(r.ok){notify(t.saved);await load(panel,no)}});
    qa('[data-pcs-status]').forEach(b=>b.onclick=async()=>{const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify({action:'set_status',customer_no:no,case_id:b.dataset.pcsId,status:b.dataset.pcsStatus})});if(r.ok){notify(t.saved);await load(panel,no)}});
  }

  let mounting=false,lastNo='';
  async function mount(){
    const no=customerNo(),body=q('#pcBody');
    if(!no||!body)return;
    const existing=q('#pcSupport360');
    if(existing&&existing.dataset.customerNo===no)return;
    if(mounting)return;
    mounting=true;lastNo=no;
    existing?.remove();
    const panel=document.createElement('section');panel.id='pcSupport360';panel.className='pcsCard';panel.dataset.customerNo=no;body.appendChild(panel);
    await load(panel,no);mounting=false;
  }
  const observer=new MutationObserver(()=>{const no=customerNo();if(no&&no!==lastNo)lastNo='';mount()});
  observer.observe(document.body,{childList:true,subtree:true});
  setInterval(mount,1800);mount();
})();
(()=>{
  if(window.__dabbirRecoveryReconciliationUi)return;
  window.__dabbirRecoveryReconciliationUi=true;

  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const copy=()=>ar()?{
    open:'فتح قضية مصالحة',opening:'جارٍ فتح القضية...',created:'تم فتح قضية المصالحة وربطها بالمعاينة الموثقة.',existing:'قضية المصالحة موجودة بالفعل وتم ربطها بنفس المعاينة.',preview:'أعد تشغيل معاينة الاسترجاع ثم افتح قضية المصالحة خلال 30 دقيقة.',notNeeded:'لم تعد المصالحة مطلوبة. أعد تشغيل معاينة الاسترجاع.',failed:'تعذر فتح قضية المصالحة.'
  }:{
    open:'Open reconciliation case',opening:'Opening case...',created:'Reconciliation case opened and bound to the verified preview.',existing:'The reconciliation case already exists for this verified preview.',preview:'Run the recovery preview again, then open the reconciliation case within 30 minutes.',notNeeded:'Reconciliation is no longer required. Run the recovery preview again.',failed:'Could not open the reconciliation case.'
  };
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const customerNo=()=>{for(const n of qa('#pcBody .pcCode')){const v=String(n.textContent||'').trim().toUpperCase();if(/^DAB-[0-9]{6,}$/.test(v))return v}return null};
  const api=async(body)=>{const r=await fetch('/api/platform-customer-support',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));return{r,j}};

  async function ensureCase(button,businessId){
    const t=copy(),no=customerNo();
    if(!no||!businessId)return notify(t.failed);
    button.disabled=true;button.textContent=t.opening;
    const {r,j}=await api({action:'ensure_recovery_reconciliation',customer_no:no,business_id:businessId});
    if(!r.ok){
      button.disabled=false;button.textContent=t.open;
      if(j.error==='RECOVERY_PREVIEW_REQUIRED')return notify(t.preview);
      if(j.error==='RECOVERY_RECONCILIATION_NOT_REQUIRED')return notify(t.notNeeded);
      return notify(j.error||t.failed);
    }
    notify(j.reconciliation?.created?t.created:t.existing);
    q('#pcSupport360')?.remove();
    button.textContent=j.reconciliation?.created?t.created:t.existing;
  }

  function mount(){
    const t=copy();
    for(const blocked of qa('#pcBody .pcRecoveryBlocked')){
      if(blocked.querySelector('[data-pc-reconcile-case]'))continue;
      const business=blocked.closest('.pcBiz');
      const input=business?.querySelector('[data-pc-time]');
      const businessId=String(input?.getAttribute('data-pc-time')||'').trim();
      if(!businessId)continue;
      const actions=document.createElement('div');actions.className='pcActions';
      const button=document.createElement('button');button.className='secondary';button.dataset.pcReconcileCase=businessId;button.textContent=t.open;
      button.onclick=()=>ensureCase(button,businessId);
      actions.appendChild(button);blocked.appendChild(actions);
    }
  }

  const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});
  new MutationObserver(()=>{for(const b of qa('[data-pc-reconcile-case]'))if(!b.disabled)b.textContent=copy().open}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  setInterval(mount,1500);mount();
})();
(()=>{
  if(window.__dabbirOwnerFirstUiV4) return;
  window.__dabbirOwnerFirstUiV4=true;

  const ICON='/dabbir-app-icon.png';
  const isArabic=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  const style=document.createElement('style');
  style.dataset.dabbirUiAuthority='owner-first-v4';
  style.textContent=[
    ':root{color-scheme:dark;--d4-bg:#060b16;--d4-bg2:#091225;--d4-surface:#0d1729;--d4-surface2:#111e33;--d4-surface3:#16243b;--d4-line:#ffffff18;--d4-line-strong:#ffffff28;--d4-text:#f8fafc;--d4-muted:#93a4ba;--d4-violet:#8b5cf6;--d4-blue:#3b82f6;--d4-cyan:#22d3ee;--d4-green:#34d399;--d4-yellow:#fbbf24;--d4-red:#fb7185;--d4-radius:20px;--d4-shadow:0 18px 55px #00000045;--accent:var(--d4-blue)!important;--green:var(--d4-green)!important;--yellow:var(--d4-yellow)!important;--red:var(--d4-red)!important;--blue:#60a5fa!important;--muted:var(--d4-muted)!important;--line:var(--d4-line)!important;--bg:var(--d4-bg)!important;--panel:var(--d4-surface)!important;--panel2:var(--d4-surface2)!important}',
    'html,body{background:radial-gradient(circle at 78% -8%,#253d7a55 0,transparent 34%),radial-gradient(circle at 10% 10%,#6d28d933 0,transparent 28%),linear-gradient(180deg,var(--d4-bg2),var(--d4-bg) 52%)!important;color:var(--d4-text)!important}',
    'body{min-height:100dvh;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}',
    'button,input,select,textarea{font-family:inherit}',
    'button{transition:transform .14s ease,background .14s ease,border-color .14s ease,opacity .14s ease}',
    'button:active{transform:scale(.975)}',
    'button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--d4-cyan)!important;outline-offset:2px!important}',
    '.primary{border:1px solid #ffffff18!important;background:linear-gradient(135deg,var(--d4-violet),var(--d4-blue) 58%,var(--d4-cyan))!important;color:white!important;font-weight:900!important;box-shadow:0 12px 30px #3b82f62b!important}',
    '.secondary{border:1px solid var(--d4-line)!important;background:#ffffff09!important;color:var(--d4-text)!important;box-shadow:none!important}',
    '.secondary:hover{background:#ffffff0f!important;border-color:var(--d4-line-strong)!important}',
    '.card,.chatList,.chatPanel,.integration,.table,.workspace,.dabbir-knowledge-card,.dabbir-action-center{background:linear-gradient(180deg,#111d31f2,#0b1425f2)!important;border:1px solid var(--d4-line)!important;box-shadow:var(--d4-shadow)!important}',
    '.card,.integration,.chatList,.chatPanel,.table,.dabbir-knowledge-card,.dabbir-action-center{border-radius:var(--d4-radius)!important}',
    '.item{background:#ffffff08!important;border:1px solid var(--d4-line)!important;border-radius:15px!important}',
    '.muted,.item small,.integration p,.hero p{color:var(--d4-muted)!important}',
    '.badge,.statusChip{border:1px solid transparent!important;font-weight:850!important;letter-spacing:0!important}',
    '.green,.statusChip{background:#12382f!important;color:#72e6bd!important;border-color:#2e6b58!important}',
    '.yellow{background:#3d2f10!important;color:#ffd369!important;border-color:#6e541d!important}',
    '.red{background:#3c1721!important;color:#ff9bb0!important;border-color:#6e293b!important}',
    '.blue{background:#112f50!important;color:#82c7ff!important;border-color:#28577d!important}',
    '.gray{background:#ffffff0a!important;color:#b9c4d2!important;border-color:var(--d4-line)!important}',
    '.shell{grid-template-columns:268px minmax(0,1fr)!important}',
    '.side{background:#07101ce8!important;border-inline-end:1px solid var(--d4-line)!important;padding:18px 14px!important;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}',
    '.side>.brand{padding:4px 7px 8px!important;gap:10px!important}.side>.brand b{font-size:14px!important;letter-spacing:.12em}.side>.brand small{font-size:9px!important}',
    '.side .logo{width:42px!important;height:42px!important;border-radius:13px!important}',
    '.workspace{margin:12px 0 14px!important;padding:12px 13px!important;border-radius:16px!important;box-shadow:none!important}.workspace b{font-size:12px!important}.workspace span{font-size:9px!important;color:#72e6bd!important}',
    '.nav{gap:4px!important}.navBtn{min-height:46px!important;padding:9px 11px!important;border-radius:14px!important;color:#9fb0c4!important;gap:10px!important;font-size:11px!important;box-shadow:none!important}',
    '.navBtn:hover{background:#ffffff08!important;color:white!important}.navBtn.active{background:linear-gradient(90deg,#7047cc35,#2563eb24)!important;color:white!important;box-shadow:inset 0 0 0 1px #8b5cf638!important}',
    'html[dir=rtl] .navBtn.active,html[dir=ltr] .navBtn.active{box-shadow:inset 0 0 0 1px #8b5cf638!important}',
    '.d4-nav-icon{width:22px;height:22px;display:grid;place-items:center;flex:0 0 22px;color:#91a7c1}.navBtn.active .d4-nav-icon{color:#a78bfa}',
    '.d4-nav-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.top{height:70px!important;padding:0 22px!important;background:#07101dcc!important;border-bottom:1px solid var(--d4-line)!important;backdrop-filter:blur(24px)!important;-webkit-backdrop-filter:blur(24px)!important;box-shadow:0 12px 28px #00000018!important}',
    '.top>.row{min-width:0;gap:10px!important}.d4-header-mark{width:38px;height:38px;display:none;object-fit:contain;flex:0 0 38px;border-radius:12px}.pageTitle{font-size:15px!important;font-weight:900!important;letter-spacing:-.01em}.statusChip{font-size:8px!important;margin-top:3px!important;padding:4px 7px!important}',
    '.lang{background:#ffffff08!important;border:1px solid var(--d4-line)!important;border-radius:13px!important}.lang button{color:#8fa0b4!important;border-radius:10px!important}.lang button.on{background:#ffffff10!important;color:white!important}',
    '.content{max-width:1280px!important;padding:28px 24px 110px!important}',
    '.hero{margin-bottom:16px!important;align-items:center!important}.hero h1{font-size:27px!important;letter-spacing:-.035em!important}.hero p{font-size:11px!important;max-width:700px!important}',
    '.cards{gap:10px!important}.card{padding:16px!important}.metric{position:relative;overflow:hidden;min-height:105px}.metric:after{content:"";position:absolute;inset:auto -26px -34px auto;width:88px;height:88px;border-radius:50%;background:radial-gradient(circle,#3b82f628 0,transparent 68%);pointer-events:none}.metric span{font-size:10px!important;color:#9fb0c4!important}.metric strong{font-size:29px!important;letter-spacing:-.035em!important}.d4-metric-icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;margin-bottom:12px;background:linear-gradient(135deg,#8b5cf627,#3b82f622);border:1px solid #ffffff13;color:#9ec6ff}.d4-metric-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.grid2{gap:12px!important}.sectionHead h2{font-size:13px!important}.truth{background:#17233a!important;border:1px solid #2a4064!important;color:#b9c9df!important;border-radius:14px!important;font-size:9px!important;line-height:1.65!important}',
    '.dabbir-action-center{padding:16px!important;margin-bottom:12px!important;box-shadow:var(--d4-shadow)!important}.dac-head strong{font-size:16px!important}.dac-status{color:#93a4ba!important}.dac-brief{font-size:11px!important;color:#dbe7f6!important;line-height:1.7!important}.dac-metric{background:#ffffff07!important;border-color:var(--d4-line)!important;border-radius:14px!important}.dac-metric.handled strong{color:#72e6bd!important}.dac-metric.critical strong{color:#ff9bb0!important}.dac-metric.warning strong{color:#ffd369!important}.dac-item{background:#ffffff07!important;border-color:var(--d4-line)!important;border-radius:14px!important}.dac-empty{color:#72e6bd!important;border-color:#275b4b!important;background:#0d2a221f!important}',
    '.integrationGrid{gap:10px!important}.integration{padding:15px!important;position:relative;overflow:hidden}.integration h3{font-size:13px!important}.integration p{font-size:10px!important}.dabbirWhatsAppIdentity{background:#ffffff07!important;border-color:var(--d4-line)!important;border-radius:13px!important}.dabbirWhatsAppActions{gap:7px!important}.dabbirWhatsAppActions button{min-height:44px!important;border-radius:12px!important}.dabbirWhatsAppConnect{background:linear-gradient(135deg,#13a95c,#25d366)!important;color:white!important;box-shadow:0 10px 24px #25d36626!important}',
    '.chatGrid{gap:10px!important}.chatList{padding:9px!important}.chatContact{border:1px solid transparent!important;border-radius:14px!important;padding:11px 12px!important;transition:background .14s,border-color .14s!important}.chatContact:hover{background:#ffffff07!important}.chatContact.active{background:linear-gradient(135deg,#7250d526,#2563eb1c)!important;border-color:#7c5ddd55!important}.chatContact b{font-size:12px!important}.chatContact span{font-size:9px!important;color:#8fa0b4!important}.chatHead{padding:12px 13px!important;background:#ffffff04!important;border-bottom:1px solid var(--d4-line)!important}.messages{background:radial-gradient(circle at 70% 0,#3b82f60d,transparent 34%)!important;padding:16px!important}.bubble{border:1px solid var(--d4-line)!important;background:#172238!important;box-shadow:0 8px 20px #0000001e!important}.msgrow.ai .bubble,.msgrow.human .bubble{background:linear-gradient(135deg,#302352,#182c50)!important;border-color:#7658b85c!important}.bubble .body{font-size:13px!important;line-height:1.68!important}.d4-sender{display:flex;align-items:center;gap:6px;margin:0 5px 5px;color:#a7c8ff;font-size:9px;font-weight:900}.d4-sender img{width:20px;height:20px;object-fit:contain;border-radius:6px}.compose{background:#0b1425!important;border-top:1px solid var(--d4-line)!important;padding:9px!important}.compose input{background:#ffffff08!important;border:1px solid var(--d4-line)!important;border-radius:14px!important;color:white!important}.send{background:linear-gradient(135deg,var(--d4-violet),var(--d4-blue))!important;color:white!important;border-radius:13px!important;box-shadow:0 8px 20px #3b82f62b!important}',
    '.field input,.field select,.dk-field input,.dk-field textarea,.dk-time input{background:#ffffff08!important;border:1px solid var(--d4-line)!important;color:white!important;border-radius:13px!important}.field label,.dk-field label{color:#93a4ba!important}',
    '.authWrap{background:radial-gradient(circle at 75% 10%,#3b82f63a 0,transparent 36%),radial-gradient(circle at 15% 82%,#7c3aed2c 0,transparent 34%),#060b16!important;padding:20px!important}.authCard{width:min(440px,100%)!important;padding:26px!important;background:#0d1729f2!important;border:1px solid var(--d4-line)!important;border-radius:26px!important;box-shadow:0 30px 90px #0000005c!important}.authCard>.brand{justify-content:center!important;flex-direction:column!important;text-align:center!important;gap:8px!important}.authCard .logo{width:62px!important;height:62px!important;border-radius:18px!important}.authCard>.brand b{font-size:15px!important;letter-spacing:.14em}.authCard h1{text-align:center!important;font-size:24px!important;letter-spacing:-.03em!important;margin-top:20px!important}.authCard p{text-align:center!important;color:#93a4ba!important;font-size:11px!important;line-height:1.7!important}.authTabs{background:#ffffff07!important;border-color:var(--d4-line)!important;border-radius:14px!important}.authTabs button.on{background:#ffffff10!important;color:white!important}.authMsg{font-size:10px!important}',
    '.modal{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.modalBox{background:#0d1729!important;border:1px solid var(--d4-line)!important;border-radius:22px!important;box-shadow:0 30px 90px #0008!important}.toast{background:#f8fafc!important;color:#0f172a!important;border-radius:13px!important;box-shadow:0 16px 40px #0006!important}',
    '.dabbirMobileBrand{display:none!important}',
    '@media(max-width:920px){.shell{grid-template-columns:1fr!important}.side{width:min(82vw,286px)!important;box-shadow:24px 0 70px #0009!important}.content{padding-inline:16px!important}.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
    '@media(max-width:700px){',
      'html{background:#060b16!important}body{font-size:15px!important}',
      'button,input,select,textarea,a{min-height:48px}',
      '.top{height:calc(64px + env(safe-area-inset-top))!important;padding:env(safe-area-inset-top) 12px 0!important;align-items:center!important}',
      '.top>.row{flex:1!important;gap:9px!important}.d4-header-mark{display:block!important;width:36px!important;height:36px!important;flex-basis:36px!important}',
      '.mobileMenu{width:44px!important;height:44px!important;flex:0 0 44px!important;border-radius:13px!important;background:#ffffff08!important;border:1px solid var(--d4-line)!important;color:white!important;font-size:16px!important}',
      '.pageTitle{max-width:36vw!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:14px!important}.statusChip{font-size:7px!important;padding:3px 6px!important}',
      '.topActions{gap:4px!important}.lang{padding:2px!important}.lang button{min-height:36px!important;padding:4px 8px!important;font-size:10px!important}',
      '.content{padding:14px 11px calc(104px + env(safe-area-inset-bottom))!important;max-width:none!important}',
      '.screen>.hero{margin:0 1px 10px!important;min-height:0!important}.screen>.hero h1{display:none!important}.screen>.hero p{font-size:10px!important;line-height:1.55!important}.screen>.hero>.primary,.screen>.hero>.secondary{min-height:40px!important;padding:7px 10px!important;font-size:9px!important}',
      '.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}.card{border-radius:18px!important;padding:13px!important}.metric{min-height:104px!important}.metric span{font-size:9px!important}.metric strong{font-size:25px!important;margin-top:4px!important}.d4-metric-icon{width:27px;height:27px;margin-bottom:9px!important}',
      '.grid2{grid-template-columns:1fr!important;gap:9px!important;margin-top:9px!important}.item{padding:11px!important}.item b{font-size:11px!important}.item small{font-size:9px!important;line-height:1.5!important}',
      '.dabbir-action-center{padding:13px!important;border-radius:18px!important}.dac-head strong{font-size:14px!important}.dac-brief{margin:9px 0!important;font-size:10px!important}.dac-metrics{gap:6px!important}.dac-metric{padding:8px!important}.dac-metric strong{font-size:19px!important}.dac-item{padding:9px!important}.dac-item-body b{font-size:10px!important}.dac-item-body span{font-size:9px!important;white-space:normal!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important}.dac-open{min-width:54px!important;min-height:40px!important;padding:6px 8px!important;font-size:8px!important}',
      '.integrationGrid{grid-template-columns:1fr!important;gap:8px!important}.integration{padding:13px!important;border-radius:17px!important}.integration h3{font-size:12px!important}.integration p{font-size:9px!important;line-height:1.55!important}.dabbirWhatsAppActions{display:grid!important;grid-template-columns:1fr!important}.dabbirWhatsAppActions button{width:100%!important}',
      '#screen-conversations .chatGrid{display:flex!important;flex-direction:column!important;gap:8px!important;min-height:0!important}',
      '#screen-conversations .chatList{display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;gap:7px!important;padding:7px!important;max-height:none!important;margin:0!important;scrollbar-width:none!important;box-shadow:none!important}',
      '#screen-conversations .chatList::-webkit-scrollbar{display:none}',
      '#screen-conversations .chatContact{min-width:min(76vw,286px)!important;flex:0 0 auto!important;margin:0!important;padding:10px 11px!important}',
      '#screen-conversations .chatPanel{height:calc(100dvh - 224px - env(safe-area-inset-top) - env(safe-area-inset-bottom))!important;min-height:480px!important;overflow:hidden!important;border-radius:18px!important}',
      '#screen-conversations .chatHead{padding:10px 11px!important}.messages{padding:12px 9px 16px!important}.bubble{max-width:88%!important;padding:10px 11px!important;border-radius:16px!important}.bubble .body{font-size:14px!important;line-height:1.62!important}',
      '.compose{padding:8px 8px calc(8px + env(safe-area-inset-bottom))!important}.compose input{font-size:16px!important;min-height:48px!important}.send{width:48px!important;flex:0 0 48px!important}',
      '.table{border-radius:17px!important}.tr{font-size:9px!important;padding:11px!important}',
      '#screen-settings #settingsList{display:grid!important;gap:7px!important}.authWrap{align-items:center!important;padding:calc(16px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom))!important}.authCard{padding:21px 18px!important;border-radius:23px!important}.authCard .logo{width:56px!important;height:56px!important}.authCard h1{font-size:22px!important}.field input,.field select{font-size:16px!important;min-height:52px!important}',
      '.bottomNav{position:fixed!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important;left:0!important;right:0!important;bottom:0!important;z-index:30!important;background:#07101df2!important;border-top:1px solid var(--d4-line)!important;padding:6px 6px calc(6px + env(safe-area-inset-bottom))!important;box-shadow:0 -16px 42px #00000075!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important}',
      '.bottomNav>button,.bottomNav>a{min-width:0!important;min-height:58px!important;border:0!important;background:transparent!important;color:#7e90a7!important;border-radius:15px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important;padding:5px 2px!important;font-size:8px!important;line-height:1.15!important;overflow:hidden!important}',
      '.bottomNav .d4-nav-icon{width:21px!important;height:21px!important;margin:0!important;color:currentColor!important}.bottomNav>button.active,.bottomNav>a.active{background:linear-gradient(180deg,#8b5cf622,#3b82f618)!important;color:#b8c8ff!important;box-shadow:inset 0 0 0 1px #8b5cf633!important}',
      '.bottomNav br{display:none!important}',
    '}',
    '@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}'
  ].join('');
  document.head.appendChild(style);

  const icons={
    dashboard:'<svg viewBox="0 0 24 24"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    conversations:'<svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>',
    appointments:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>',
    customers:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 6.5c2.5.2 4 1.6 4 3.5 0 1.7-1.1 2.9-2.8 3.3M15.5 14.5c2.8.4 4.5 1.9 5 4.5"/></svg>',
    tasks:'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/><path d="M5 5h8M5 19h14"/></svg>',
    automations:'<svg viewBox="0 0 24 24"><path d="M19 7V3l-2 2a8 8 0 1 0 2.3 8"/><path d="M12 8v4l3 2"/></svg>',
    analytics:'<svg viewBox="0 0 24 24"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></svg>',
    integrations:'<svg viewBox="0 0 24 24"><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="9"/></svg>',
    notifications:'<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 7H4c0-1 2-1 2-7"/><path d="M10 19h4"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3H9.6l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
    help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.3 1-1.3 2M12 17h.01"/></svg>'
  };

  const iconSvg=name=>icons[name]||icons.tasks;

  function installHeaderMark(){
    const row=q('.top>.row');
    if(!row||row.querySelector('.d4-header-mark'))return;
    const img=document.createElement('img');
    img.className='d4-header-mark';
    img.src=ICON;
    img.alt='DABBIR';
    img.decoding='async';
    img.loading='eager';
    const menu=q('#menuBtn');
    if(menu?.nextSibling)row.insertBefore(img,menu.nextSibling);else row.append(img);
  }

  function decorateNav(){
    qa('#nav .navBtn,#bottomNav>button,#bottomNav>a').forEach(button=>{
      const key=String(button.dataset.screen||'settings');
      const label=button.querySelector('[data-label]');
      if(!label)return;
      [...button.childNodes].forEach(node=>{
        if(node.nodeType===3&&String(node.textContent||'').trim())node.remove();
        if(node.nodeName==='BR')node.remove();
      });
      let icon=button.querySelector(':scope > .d4-nav-icon');
      if(!icon){
        icon=document.createElement('span');
        icon.className='d4-nav-icon';
        button.insertBefore(icon,label);
      }
      icon.innerHTML=iconSvg(key);
      button.setAttribute('aria-label',String(label.textContent||key).trim());
    });
  }

  function decorateMetrics(){
    const metricIcons=['analytics','appointments','customers','notifications'];
    qa('#dashCards > .card.metric').forEach((card,index)=>{
      if(card.querySelector(':scope > .d4-metric-icon'))return;
      const icon=document.createElement('span');
      icon.className='d4-metric-icon';
      icon.innerHTML=iconSvg(metricIcons[index]||'analytics');
      card.prepend(icon);
    });
  }

  function decorateAiMessages(){
    qa('#messages .msgrow.ai').forEach(row=>{
      row.querySelectorAll(':scope > .dabbirAiIdentity,:scope > .dabbirSenderLabel').forEach(node=>node.remove());
      if(row.querySelector(':scope > .d4-sender'))return;
      const sender=document.createElement('div');
      sender.className='d4-sender';
      const img=document.createElement('img');
      img.src=ICON;img.alt='';img.decoding='async';
      const text=document.createElement('span');text.textContent='DABBIR';
      sender.append(img,text);
      const bubble=row.querySelector(':scope > .bubble');
      if(bubble)row.insertBefore(sender,bubble);else row.prepend(sender);
    });
  }

  function localizeMachineText(){
    const map=isArabic()
      ? {SUPPORT:'دعم / تدخل بشري',manual_takeover:'استلام يدوي',RETURNED_TO_AI:'أُعيدت إلى دبّر',returned_to_ai:'أُعيدت إلى دبّر',OPEN:'مفتوح',RESOLVED:'مكتمل',CLOSED:'مغلق',PENDING:'قيد المتابعة',waiting_customer:'بانتظار العميل',ai_active:'دبّر يتولى المحادثة',human_active:'تدخل بشري',action_required:'تحتاج تدخلك'}
      : {SUPPORT:'Human support',manual_takeover:'Manual takeover',RETURNED_TO_AI:'Returned to DABBIR',returned_to_ai:'Returned to DABBIR',OPEN:'Open',RESOLVED:'Resolved',CLOSED:'Closed',PENDING:'Pending',waiting_customer:'Waiting for customer',ai_active:'DABBIR is handling it',human_active:'Human takeover',action_required:'Needs your attention'};
    qa('#screen-tasks .item b,#screen-tasks .item small,#screen-tasks .badge,#screen-conversations .chatContact span').forEach(el=>{
      const current=String(el.textContent||'').trim();
      const raw=el.dataset.d4RawText||current;
      if(!el.dataset.d4RawText)el.dataset.d4RawText=raw;
      const key=Object.keys(map).find(k=>raw===k||raw.endsWith('• '+k)||raw.endsWith('· '+k));
      if(!key)return;
      const prefix=raw.includes('•')?raw.slice(0,raw.lastIndexOf('•')+1)+' ':raw.includes('·')?raw.slice(0,raw.lastIndexOf('·')+1)+' ':'';
      el.textContent=prefix+map[key];
    });
  }

  function activityType(){return String(window.workspace?.business?.business_type||'other').toLowerCase()}
  function keepActionItem(item){
    const type=activityType();
    if(type==='store')return item?.type!=='appointment';
    if(['clinic','salon','real_estate','creator','services','other'].includes(type))return !['inventory','order'].includes(String(item?.type||''));
    return true;
  }
  function formatWhen(value){
    if(!value)return '';
    const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
    try{return new Intl.DateTimeFormat(isArabic()?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }
  function actionCopy(){return isArabic()?{urgent:'يحتاج تدخلك',warning:'راقب اليوم',total:'إجمالي الأولويات',empty:'كل شيء تحت السيطرة الآن',open:'فتح',brief:'أهم ما يحتاج تدخلك الآن'}:{urgent:'Needs you',warning:'Watch today',total:'Total priorities',empty:'Everything is under control right now',open:'Open',brief:'What needs your attention now'}}

  function normalizeActionCenter(){
    const panel=q('#dabbirActionCenter');
    const data=window.workspace?.owner_action_center;
    if(!panel||!data)return;
    const items=(Array.isArray(data.items)?data.items:[]).filter(keepActionItem);
    const signature=activityType()+'|'+(isArabic()?'ar':'en')+'|'+items.map(x=>x.id).join('|');
    const list=panel.querySelector('#dacItems');
    if(!list||panel.dataset.d4Signature===signature)return;
    panel.dataset.d4Signature=signature;
    const t=actionCopy();
    const urgent=items.filter(x=>x.severity==='critical').length;
    const warning=items.filter(x=>x.severity==='warning').length;
    const metrics=panel.querySelector('#dacMetrics');
    if(metrics){
      const metric=(label,value,tone)=>'<div class="dac-metric '+tone+'"><strong>'+String(value)+'</strong><span>'+label+'</span></div>';
      metrics.innerHTML=metric(t.urgent,urgent,'critical')+metric(t.warning,warning,'warning')+metric(t.total,items.length,'');
    }
    const brief=panel.querySelector('#dacBrief');
    if(brief){
      const top=items.slice(0,3).map(x=>isArabic()?x.title_ar:x.title_en).filter(Boolean);
      brief.textContent=top.length?t.brief+': '+top.join(isArabic()?'، ':', ')+'.':t.empty;
    }
    list.replaceChildren();
    if(!items.length){const empty=document.createElement('div');empty.className='dac-empty';empty.textContent=t.empty;list.append(empty);return;}
    for(const item of items.slice(0,3)){
      const row=document.createElement('article');row.className='dac-item '+(item.severity||'info');
      const body=document.createElement('div');body.className='dac-item-body';
      const title=document.createElement('b');title.textContent=isArabic()?item.title_ar:item.title_en;
      const detail=document.createElement('span');detail.textContent=isArabic()?item.detail_ar:item.detail_en;
      const small=document.createElement('small');small.textContent=formatWhen(item.due_at);
      body.append(title,detail,small);
      const button=document.createElement('button');button.type='button';button.className='secondary dac-open';button.textContent=t.open;
      button.onclick=()=>{const target=String(item.target||'dashboard');if(typeof showScreen==='function')showScreen(target)};
      row.append(body,button);list.append(row);
    }
    panel.querySelector('#dacMoreWrap')?.setAttribute('hidden','');
  }

  function tuneWhatsappCard(){
    const grid=q('#integrationGrid');if(!grid)return;
    const wanted=(()=>{try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}})();
    const card=qa('#integrationGrid .integration').find(item=>String(item.querySelector('h3')?.textContent||'').trim()===wanted);
    qa('#integrationGrid .integration').forEach(item=>item.classList.toggle('d4-whatsapp-card',item===card));
  }

  let actionObserver=null;
  function bindActionObserver(){
    const panel=q('#dabbirActionCenter');
    if(!panel||panel.dataset.d4Observed==='true')return Boolean(panel);
    panel.dataset.d4Observed='true';
    actionObserver=new MutationObserver(()=>schedulePolish());
    actionObserver.observe(panel,{subtree:true,childList:true,characterData:true});
    return true;
  }

  let frame=0;
  function schedulePolish(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;polish()});
  }
  function polish(){
    installHeaderMark();decorateNav();decorateMetrics();decorateAiMessages();localizeMachineText();normalizeActionCenter();tuneWhatsappCard();bindActionObserver();
    document.body?.setAttribute('data-dabbir-ui','owner-first-v4');
  }

  if(typeof renderAll==='function'&&!window.__d4RenderAllWrapped){
    window.__d4RenderAllWrapped=true;const base=renderAll;renderAll=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderMessages==='function'&&!window.__d4RenderMessagesWrapped){
    window.__d4RenderMessagesWrapped=true;const base=renderMessages;renderMessages=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderDashboard==='function'&&!window.__d4RenderDashboardWrapped){
    window.__d4RenderDashboardWrapped=true;const base=renderDashboard;renderDashboard=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderIntegrations==='function'&&!window.__d4RenderIntegrationsWrapped){
    window.__d4RenderIntegrationsWrapped=true;const base=renderIntegrations;renderIntegrations=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof applyLang==='function'&&!window.__d4ApplyLangWrapped){
    window.__d4ApplyLangWrapped=true;const base=applyLang;applyLang=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }

  const bootstrapObserver=new MutationObserver(()=>{
    schedulePolish();
    if(bindActionObserver())bootstrapObserver.disconnect();
  });
  if(document.body)bootstrapObserver.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>bootstrapObserver.disconnect(),5000);
  setTimeout(schedulePolish,0);
  setTimeout(schedulePolish,350);

  const theme=q('meta[name="theme-color"]');if(theme)theme.content='#07101d';
  window.__dabbirUiAuthority={version:'owner-first-v4',pollingLoops:0,presentationObservers:1};
})();
(()=>{
  if(window.__dabbirVerifiedMetricsUi)return;
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const unknown='—';

  function metrics(){
    const value=typeof workspace!=='undefined'&&workspace?workspace.verified_metrics:null;
    return value&&value.state==='VERIFIED_EXACT_COUNTS'?value:null;
  }

  function exactValue(key){
    const value=metrics()?.[key];
    return Number.isSafeInteger(value)&&value>=0?String(value):unknown;
  }

  function evidenceTitle(){
    const value=metrics();
    if(!value)return ar()?'العدد غير موثق — لن يعرض دبّر رقمًا تقديريًا.':'Count unverified — DABBIR will not show an estimated number.';
    let stamp='';
    try{
      stamp=new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{
        dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Dubai'
      }).format(new Date(value.as_of));
    }catch{}
    return ar()
      ? 'عدد موثق من قاعدة البيانات • '+(stamp||value.date_key||'')+' • Asia/Dubai'
      : 'Verified database count • '+(stamp||value.date_key||'')+' • Asia/Dubai';
  }

  function applyMetric(card,key){
    if(!card)return;
    const strong=card.querySelector('strong');
    if(strong)strong.textContent=exactValue(key);
    card.dataset.dabbirMetricTruth=metrics()?'verified':'unverified';
    card.title=evidenceTitle();
  }

  function applyDashboardMetrics(){
    const cards=qa('#dashCards .card.metric');
    if(cards.length<4)return;
    applyMetric(cards[0],'active_chats');
    const isStore=String(workspace?.business?.business_type||'').toLowerCase()==='store';
    if(isStore){
      const label=cards[1].querySelector('span');
      if(label)label.textContent=ar()?'المتابعات':'Follow-ups';
      applyMetric(cards[1],'open_followups');
    }else{
      applyMetric(cards[1],'today_appointments');
    }
    applyMetric(cards[2],'customers');
    applyMetric(cards[3],'needs_attention');
  }

  function applyAnalyticsMetrics(){
    const cards=qa('#analyticsCards .card.metric');
    if(cards.length<4)return;
    applyMetric(cards[0],'active_chats');
    applyMetric(cards[1],'ai_messages');
    applyMetric(cards[2],'customers');
    applyMetric(cards[3],'human_handoffs');
  }

  function applyAll(){
    applyDashboardMetrics();
    applyAnalyticsMetrics();
  }

  if(typeof renderDashboard==='function'){
    const baseRenderDashboard=renderDashboard;
    renderDashboard=function(){const result=baseRenderDashboard();applyDashboardMetrics();return result};
  }
  if(typeof renderAnalytics==='function'){
    const baseRenderAnalytics=renderAnalytics;
    renderAnalytics=function(){const result=baseRenderAnalytics();applyAnalyticsMetrics();return result};
  }
  if(typeof setLanguage==='function'){
    const baseSetLanguage=setLanguage;
    setLanguage=function(next){const result=baseSetLanguage(next);setTimeout(applyAll,0);return result};
  }

  setTimeout(applyAll,0);
  setTimeout(applyAll,400);
  window.__dabbirVerifiedMetricsUi={apply:applyAll,version:'exact-metrics-v1-final',source:'SUPABASE_POSTGREST_COUNT_EXACT'};
})();
(()=>{
  if(window.__dabbirCustomerActivationUi)return;
  window.__dabbirCustomerActivationUi=true;

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let businessId=null;
  let profile=null;
  let whatsapp=null;
  let loading=false;
  let loadedAt=0;
  const CACHE_MS=30000;

  const style=document.createElement('style');
  style.dataset.dabbirCustomerActivation='v3';
  style.textContent=[
    '.dabbirActivation{margin:0 0 14px;border:1px solid #334061;background:linear-gradient(145deg,#12182b 0%,#101526 54%,#111827 100%);border-radius:22px;padding:16px;box-shadow:0 18px 55px #0005}',
    '.daHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.daHead h2{margin:0;font-size:16px;line-height:1.35}.daHead p{margin:5px 0 0;color:#a9b4c8;font-size:10px;line-height:1.65}',
    '.daScore{min-width:66px;text-align:center;border:1px solid #3d4d73;background:#151e35;border-radius:16px;padding:9px}.daScore strong{display:block;font-size:20px}.daScore span{font-size:8px;color:#94a2bc}',
    '.daProgress{height:7px;border-radius:999px;background:#202941;overflow:hidden;margin:12px 0}.daProgress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#3b82f6,#22d3ee);transition:width .25s ease}',
    '.daGrid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr);gap:10px}.daNext,.daProof{border:1px solid #2b3655;background:#0d1322;border-radius:16px;padding:12px}',
    '.daLabel{font-size:8px;font-weight:900;letter-spacing:.04em;color:#8ca0c3}.daNext b{display:block;margin-top:5px;font-size:12px}.daNext p{margin:5px 0 10px;color:#99a7bd;font-size:9px;line-height:1.6}',
    '.daActions{display:flex;gap:7px;flex-wrap:wrap}.daActions button{min-height:40px;border-radius:11px;padding:8px 11px;font-size:9px;font-weight:900}',
    '.daPrimary{border:0;color:white;background:linear-gradient(135deg,#7c3aed,#2563eb)}.daSecondary{border:1px solid #34415f;background:#151d2f;color:#e9eef8}',
    '.daProofGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.daProofItem{border:1px solid #26324e;background:#11192a;border-radius:12px;padding:9px}.daProofItem strong{display:block;font-size:16px}.daProofItem span{display:block;margin-top:3px;color:#8f9db2;font-size:7px}',
    '.daSteps{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.daStep{display:inline-flex;align-items:center;gap:5px;border:1px solid #303c5c;background:#121a2b;border-radius:999px;padding:6px 8px;font-size:8px;color:#aab6ca}.daStep.done{border-color:#285d4a;background:#10261f;color:#8ce6a1}.daStep:before{content:"•";font-size:14px;line-height:0}.daStep.done:before{content:"✓";font-size:9px}',
    '.daIntentWrap{margin-top:10px;border-top:1px solid #26324a;padding-top:10px}.daIntentTitle{font-size:9px;font-weight:900;color:#cbd5e7;margin-bottom:7px}.daIntentGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.daIntent{border:1px solid #34415f;background:#121a2c;color:#e9eef8;border-radius:12px;min-height:42px;padding:8px;font-size:8px;font-weight:850;text-align:center}.daIntent:hover,.daIntent:focus-visible{border-color:#5472b4;background:#17233b}',
    '.daLoading{padding:12px;color:#9aa8bd;font-size:9px}',
    '@media(max-width:700px){.dabbirActivation{padding:13px;border-radius:18px;margin-bottom:10px}.daHead h2{font-size:15px}.daScore{min-width:58px;padding:8px}.daGrid{grid-template-columns:1fr}.daProofGrid{gap:5px}.daProofItem{padding:8px}.daActions button{flex:1;min-width:120px;min-height:44px}.daSteps{gap:5px}.daIntentGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.daIntent{min-height:46px;font-size:9px}}',
    '@media(prefers-reduced-motion:reduce){.daProgress i{transition:none}}'
  ].join('');
  document.head.append(style);

  function copy(){return ar()?{
    title:'جهّز دَبِّر ليعمل عنك',readyTitle:'دَبِّر جاهز للعمل',desc:'دقيقة واحدة هنا تختصر عليك البحث داخل الإعدادات. نعرض فقط ما تم التحقق منه فعليًا.',readyDesc:'الأساسيات التشغيلية جاهزة. راقب ما أنجزه دَبِّر وما يحتاج قرارك فقط.',score:'الجاهزية',next:'الخطوة الأفضل الآن',proof:'دليل القيمة',intentTitle:'ماذا تريد من دَبِّر الآن؟',
    profile:'معلومات النشاط',channel:'واتساب',ai:'ذكاء دَبِّر',profileTodo:'أكمل معلومات نشاطك',profileBody:'أضف الساعات وبيانات التواصل والسياسات الأساسية حتى يرد دَبِّر بمعلومات صحيحة.',profileAction:'إكمال المعلومات',channelTodo:'اربط واتساب',channelBody:'اربط رقم WhatsApp Business من داخل دَبِّر حتى تنتقل من التجربة الداخلية إلى قناة العميل الحقيقية.',channelAction:'ربط واتساب',channelVerifyTodo:'تحقق من تشغيل واتساب',channelVerifyBody:'الرقم مرتبط بـ Meta، لكن دَبِّر لن يعتبره جاهزًا حتى يستقبل رسالة WhatsApp حقيقية ويسجل ردًا حقيقيًا بنتيجة خارجية موثقة.',channelVerifyAction:'اختبار واتساب',aiTodo:'تحقق من جاهزية الذكاء',aiBody:'دَبِّر يحتاج AI تشغيليًا قبل أن يعتمد عليه في الردود والمتابعة.',aiAction:'فتح الحالة',testTodo:'جرّب أول محادثة',testBody:'أرسل محادثة اختبار حقيقية داخل دَبِّر وشاهد الرد والحفظ قبل الاعتماد اليومي.',testAction:'فتح المحادثات',priorities:'راجع أولويات اليوم',customers:'عملاء',chats:'محادثات',aiReplies:'ردود AI',unverified:'—',loading:'دَبِّر يتحقق من التجهيز الفعلي…',complete:'مكتمل',reply:'الرد على العملاء',follow:'المتابعات',customerRecords:'العملاء',settings:'معلومات النشاط',appointments:'المواعيد',operations:'الطلبات والمخزون',viewings:'المعاينات',schedule:'الجدول'
  }:{
    title:'Get DABBIR working for you',readyTitle:'DABBIR is ready to operate',desc:'One minute here saves hunting through settings. Only verified setup state is shown.',readyDesc:'Core operations are ready. Focus on what DABBIR completed and what actually needs your decision.',score:'Readiness',next:'Best next step',proof:'Proof of value',intentTitle:'What do you want DABBIR to do now?',
    profile:'Business info',channel:'WhatsApp',ai:'DABBIR AI',profileTodo:'Complete business information',profileBody:'Add hours, contact details and key policies so DABBIR can answer accurately.',profileAction:'Complete info',channelTodo:'Connect WhatsApp',channelBody:'Connect your WhatsApp Business number inside DABBIR to move from internal testing to the real customer channel.',channelAction:'Connect WhatsApp',channelVerifyTodo:'Verify WhatsApp operation',channelVerifyBody:'The number is linked to Meta, but DABBIR will not mark it ready until a real WhatsApp inbound and a real externally verified reply are recorded.',channelVerifyAction:'Test WhatsApp',aiTodo:'Verify AI readiness',aiBody:'DABBIR needs operational AI before replies and follow-ups can be trusted.',aiAction:'Open status',testTodo:'Try the first conversation',testBody:'Run a real in-app conversation and verify the reply and persistence before daily use.',testAction:'Open conversations',priorities:'Review today’s priorities',customers:'Customers',chats:'Conversations',aiReplies:'AI replies',unverified:'—',loading:'DABBIR is checking verified setup…',complete:'Complete',reply:'Reply to customers',follow:'Follow-ups',customerRecords:'Customers',settings:'Business info',appointments:'Appointments',operations:'Orders & inventory',viewings:'Viewings',schedule:'Schedule'
  }}

  function profileReady(){
    const f=profile?.facts||{};
    const core=Boolean(String(f.about_business||'').trim()&&String(f.business_hours||'').trim());
    const contact=Boolean(String(f.contact_phone||'').trim()||String(f.contact_whatsapp||'').trim()||String(f.contact_email||'').trim());
    return core&&contact;
  }

  function whatsappLinked(){
    const w=whatsapp||workspace?.whatsapp||{};
    return Boolean(w.connected||w.meta_authorized||['META_AUTHORIZED','OPERATIONAL'].includes(String(w.state||'')));
  }

  function whatsappReady(){
    const w=whatsapp||workspace?.whatsapp||{};
    return w.operational===true&&String(w.state||'')==='OPERATIONAL';
  }

  function aiReady(){return Boolean(workspace?.ai?.configured)}
  function exactMetric(key){
    const m=workspace?.verified_metrics;
    if(!m||m.state!=='VERIFIED_EXACT_COUNTS')return null;
    const value=m[key];
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }

  function openScreen(screen){if(typeof showScreen==='function')showScreen(screen)}
  function ensure(){
    const dash=q('#screen-dashboard');
    if(!dash)return null;
    let panel=q('#dabbirActivation');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActivation';
    panel.className='dabbirActivation';
    const hero=dash.querySelector('.hero');
    if(hero?.nextSibling)dash.insertBefore(panel,hero.nextSibling);else dash.prepend(panel);
    return panel;
  }

  function nextStep(){
    const t=copy();
    if(!profileReady())return {title:t.profileTodo,body:t.profileBody,action:t.profileAction,screen:'settings'};
    if(!whatsappLinked())return {title:t.channelTodo,body:t.channelBody,action:t.channelAction,screen:'integrations'};
    if(!whatsappReady())return {title:t.channelVerifyTodo,body:t.channelVerifyBody,action:t.channelVerifyAction,screen:'integrations'};
    if(!aiReady())return {title:t.aiTodo,body:t.aiBody,action:t.aiAction,screen:'integrations'};
    const chats=exactMetric('active_chats');
    if(chats===0)return {title:t.testTodo,body:t.testBody,action:t.testAction,screen:'conversations'};
    return {title:t.priorities,body:t.readyDesc,action:t.priorities,screen:'dashboard',target:'#dabbirActionCenter'};
  }

  function intents(){
    const t=copy();
    const type=String(workspace?.business?.business_type||'other').toLowerCase();
    const common=[{label:t.reply,screen:'conversations'},{label:t.follow,screen:'tasks'}];
    if(type==='store')return [...common,{label:t.operations,screen:'operations'},{label:t.customerRecords,screen:'customers'}];
    if(type==='clinic'||type==='salon'||type==='services')return [...common,{label:t.appointments,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    if(type==='real_estate')return [...common,{label:t.viewings,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    if(type==='creator')return [...common,{label:t.schedule,screen:'appointments'},{label:t.customerRecords,screen:'customers'}];
    return [...common,{label:t.customerRecords,screen:'customers'},{label:t.settings,screen:'settings'}];
  }

  function render(){
    const panel=ensure();if(!panel||!workspace?.business)return;
    const t=copy();
    if(loading&&(!profile||!whatsapp)){panel.innerHTML='<div class="daLoading">'+esc(t.loading)+'</div>';return}
    const states=[profileReady(),whatsappReady(),aiReady()];
    const done=states.filter(Boolean).length;
    const score=Math.round(done/states.length*100);
    const ready=done===states.length;
    const next=nextStep();
    const customers=exactMetric('customers');
    const chats=exactMetric('active_chats');
    const aiReplies=exactMetric('ai_messages');
    const metric=(value,label)=>'<div class="daProofItem"><strong>'+esc(value==null?t.unverified:value)+'</strong><span>'+esc(label)+'</span></div>';
    const step=(label,value)=>'<span class="daStep '+(value?'done':'')+'">'+esc(label)+'</span>';
    const intentButtons=intents().map(item=>'<button type="button" class="daIntent" data-da-screen="'+esc(item.screen)+'">'+esc(item.label)+'</button>').join('');
    panel.innerHTML='<div class="daHead"><div><h2>'+esc(ready?t.readyTitle:t.title)+'</h2><p>'+esc(ready?t.readyDesc:t.desc)+'</p></div><div class="daScore"><strong>'+score+'%</strong><span>'+esc(t.score)+'</span></div></div><div class="daProgress" aria-label="'+esc(t.score)+' '+score+'%"><i style="width:'+score+'%"></i></div><div class="daGrid"><div class="daNext"><span class="daLabel">'+esc(t.next)+'</span><b>'+esc(next.title)+'</b><p>'+esc(next.body)+'</p><div class="daActions"><button type="button" class="daPrimary" id="daNextAction">'+esc(next.action)+'</button><button type="button" class="daSecondary" id="daPriorities">'+esc(t.priorities)+'</button></div><div class="daSteps">'+step(t.profile,states[0])+step(t.channel,states[1])+step(t.ai,states[2])+'</div></div><div class="daProof"><span class="daLabel">'+esc(t.proof)+'</span><div class="daProofGrid">'+metric(customers,t.customers)+metric(chats,t.chats)+metric(aiReplies,t.aiReplies)+'</div></div></div><div class="daIntentWrap"><div class="daIntentTitle">'+esc(t.intentTitle)+'</div><div class="daIntentGrid">'+intentButtons+'</div></div>';
    const nextButton=q('#daNextAction');if(nextButton)nextButton.onclick=()=>{openScreen(next.screen);if(next.target)setTimeout(()=>q(next.target)?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
    const priorities=q('#daPriorities');if(priorities)priorities.onclick=()=>{openScreen('dashboard');setTimeout(()=>q('#dabbirActionCenter')?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
    panel.querySelectorAll('[data-da-screen]').forEach(button=>button.onclick=()=>openScreen(button.dataset.daScreen));
  }

  async function fetchJson(url){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVATION_READ_FAILED');
    return body;
  }

  async function load(force=false){
    const id=workspace?.business?.id;if(!id||loading)return;
    if(!force&&businessId===id&&Date.now()-loadedAt<CACHE_MS){render();return}
    businessId=id;loading=true;render();
    const [p,w]=await Promise.allSettled([
      fetchJson('/api/business-profile?business_id='+encodeURIComponent(id)),
      fetchJson('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(id))
    ]);
    profile=p.status==='fulfilled'?p.value:null;
    whatsapp=w.status==='fulfilled'?w.value:(workspace?.whatsapp||null);
    loadedAt=Date.now();loading=false;render();
  }

  if(typeof renderDashboard==='function'){
    const base=renderDashboard;
    renderDashboard=function(){const result=base.apply(this,arguments);render();load(false);return result};
  }
  if(typeof renderAll==='function'){
    const base=renderAll;
    renderAll=function(){const result=base.apply(this,arguments);setTimeout(()=>{render();load(false)},0);return result};
  }
  if(typeof setLanguage==='function'){
    const base=setLanguage;
    setLanguage=function(next){const result=base(next);setTimeout(render,0);return result};
  }
  setTimeout(()=>{render();load(false)},500);
  window.__dabbirCustomerActivation={version:'customer-activation-v3',refresh:()=>load(true)};
})();
(()=>{
  if(window.__dabbirUxFoundationV1)return;
  window.__dabbirUxFoundationV1=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const isAr=()=>document.documentElement.lang!=='en';
  const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const DEFAULT_NOTIFICATIONS={handoffs:true,appointments:true,channel_issues:true,daily_summary:true};
  const DEFAULT_DASHBOARD={hidden_metrics:[],metric_order:['conversations','appointments','customers','attention']};
  let preferences={notification_preferences:{...DEFAULT_NOTIFICATIONS},dashboard_preferences:{...DEFAULT_DASHBOARD}};
  let preferencesBusinessId='';
  let confirmResolver=null;
  let tourIndex=0;

  const copy={
    ar:{search:'بحث سريع',searchPlaceholder:'ابحث في المحادثات والعملاء والمواعيد والمهام…',searchHint:'اضغط / للبحث من أي مكان',noResults:'لا توجد نتائج مطابقة.',allStatuses:'كل الحالات',filterPlaceholder:'ابحث داخل هذه الشاشة…',loading:'جارٍ تحديث بيانات النشاط…',loadError:'تعذر تحديث البيانات. تحقق من الاتصال وأعد المحاولة.',offline:'أنت غير متصل. سنحافظ على الشاشة الحالية حتى يعود الاتصال.',online:'عاد الاتصال بالإنترنت.',confirmTitle:'تأكيد الإجراء',confirmBody:'راجع الإجراء قبل المتابعة.',confirm:'متابعة',cancel:'إلغاء',logoutTitle:'تسجيل الخروج؟',logoutBody:'ستحتاج إلى تسجيل الدخول مجددًا للوصول إلى نشاطك.',takeoverTitle:'استلام المحادثة يدويًا؟',takeoverBody:'ستتوقف ردود دبّر التلقائية حتى تعيد المحادثة إليه.',returnTitle:'إعادة المحادثة إلى دبّر؟',returnBody:'سيستأنف دبّر الرد التلقائي وفق إعدادات النشاط.',emptyChatsTitle:'ابدأ أول محادثة',emptyChatsBody:'أنشئ محادثة عميل داخل دبّر للتحقق من الرد والحفظ.',emptyAppointmentsTitle:'لا توجد مواعيد بعد',emptyAppointmentsBody:'أضف أول موعد ليظهر في جدول النشاط.',emptyCustomersTitle:'لا يوجد عملاء بعد',emptyCustomersBody:'يُنشأ العميل تلقائيًا عند بدء أول محادثة.',emptyTasksTitle:'كل شيء تحت السيطرة',emptyTasksBody:'لا توجد قرارات أو متابعات تحتاج تدخلك الآن.',emptyNoticesTitle:'لا توجد تنبيهات مهمة',emptyNoticesBody:'سنظهر هنا فقط ما يحتاج انتباهك فعلًا.',startChat:'محادثة جديدة',addAppointment:'إضافة موعد',goDashboard:'العودة إلى اليوم',customize:'تخصيص اللوحة',customizeTitle:'اختر مؤشرات لوحة اليوم',customizeDesc:'أظهر ما يهمك ورتّب البطاقات بما يناسب عملك.',showMetric:'إظهار',moveUp:'أعلى',moveDown:'أسفل',savePrefs:'حفظ التفضيلات',prefsSaved:'تم حفظ التفضيلات.',prefsFailed:'تعذر حفظ التفضيلات الآن؛ احتفظنا بها على هذا الجهاز.',notificationPrefs:'تفضيلات التنبيهات',notificationDesc:'اختر التنبيهات التي تريد متابعتها. التنبيهات الحرجة الخاصة بالأمان لا يمكن تعطيلها.',handoffs:'التحويلات البشرية',appointments:'المواعيد القادمة',channelIssues:'مشكلات القنوات',dailySummary:'الملخص اليومي',feedbackTitle:'ساعدنا على تحسين دبّر',feedbackDesc:'أرسل ملاحظة قصيرة. لا تضع كلمات مرور أو بيانات حساسة.',feedbackCategory:'نوع الملاحظة',general:'ملاحظة عامة',problem:'مشكلة',idea:'فكرة',onboarding:'التجهيز الأولي',rating:'التقييم',message:'اكتب ملاحظتك…',sendFeedback:'إرسال الملاحظة',feedbackSent:'شكرًا، تم حفظ ملاحظتك.',feedbackFailed:'تعذر حفظ الملاحظة الآن.',tourWelcome:'مرحبًا بك في دبّر',tourWelcomeBody:'ابدأ من بطاقة الجاهزية؛ ستقودك إلى الخطوة الأكثر فائدة لنشاطك.',tourPriority:'الأولوية أولًا',tourPriorityBody:'تعرض لوحة اليوم ما يحتاج قرارك بدل إغراقك بالقوائم.',tourMore:'كل الأدوات في مكان واضح',tourMoreBody:'تجد الإعدادات والربط والتنبيهات والمساعدة تحت «المزيد».',next:'التالي',finish:'ابدأ العمل',skip:'تخطي الجولة',metricConversations:'المحادثات',metricAppointments:'المواعيد',metricCustomers:'العملاء',metricAttention:'تحتاج قرارك',results:'نتائج البحث',clear:'مسح'},
    en:{search:'Quick search',searchPlaceholder:'Search conversations, customers, appointments and tasks…',searchHint:'Press / to search from anywhere',noResults:'No matching results.',allStatuses:'All statuses',filterPlaceholder:'Search this screen…',loading:'Refreshing workspace data…',loadError:'Data could not be refreshed. Check your connection and try again.',offline:'You are offline. The current screen will stay available until connection returns.',online:'Internet connection restored.',confirmTitle:'Confirm action',confirmBody:'Review this action before continuing.',confirm:'Continue',cancel:'Cancel',logoutTitle:'Log out?',logoutBody:'You will need to sign in again to access your workspace.',takeoverTitle:'Take over this conversation?',takeoverBody:'DABBIR automatic replies will pause until you return the conversation.',returnTitle:'Return this conversation to DABBIR?',returnBody:'DABBIR will resume automatic replies using the workspace settings.',emptyChatsTitle:'Start the first conversation',emptyChatsBody:'Create an in-app customer conversation to verify replies and persistence.',emptyAppointmentsTitle:'No appointments yet',emptyAppointmentsBody:'Add the first appointment to start the business schedule.',emptyCustomersTitle:'No customers yet',emptyCustomersBody:'A customer is created automatically with the first conversation.',emptyTasksTitle:'Everything is under control',emptyTasksBody:'No decisions or follow-ups need your attention right now.',emptyNoticesTitle:'No important alerts',emptyNoticesBody:'Only items that truly need attention will appear here.',startChat:'New conversation',addAppointment:'Add appointment',goDashboard:'Back to Today',customize:'Customize dashboard',customizeTitle:'Choose Today metrics',customizeDesc:'Show what matters and order cards for your workflow.',showMetric:'Show',moveUp:'Up',moveDown:'Down',savePrefs:'Save preferences',prefsSaved:'Preferences saved.',prefsFailed:'Preferences could not be saved now; they remain on this device.',notificationPrefs:'Alert preferences',notificationDesc:'Choose the alerts you want to follow. Critical security alerts cannot be disabled.',handoffs:'Human handoffs',appointments:'Upcoming appointments',channelIssues:'Channel issues',dailySummary:'Daily summary',feedbackTitle:'Help improve DABBIR',feedbackDesc:'Send a short note. Do not include passwords or sensitive data.',feedbackCategory:'Feedback type',general:'General note',problem:'Problem',idea:'Idea',onboarding:'Onboarding',rating:'Rating',message:'Write your feedback…',sendFeedback:'Send feedback',feedbackSent:'Thank you. Your feedback was saved.',feedbackFailed:'Feedback could not be saved now.',tourWelcome:'Welcome to DABBIR',tourWelcomeBody:'Start with readiness; it leads to the most useful next step for your workspace.',tourPriority:'Priority first',tourPriorityBody:'Today shows what needs your decision instead of overwhelming you with lists.',tourMore:'Every tool has a clear home',tourMoreBody:'Settings, connections, alerts and help live under More.',next:'Next',finish:'Start working',skip:'Skip tour',metricConversations:'Conversations',metricAppointments:'Appointments',metricCustomers:'Customers',metricAttention:'Needs you',results:'Search results',clear:'Clear'}
  };
  const t=()=>isAr()?copy.ar:copy.en;

  const style=document.createElement('style');
  style.dataset.dabbirUxFoundation='v1';
  style.textContent=[
    '.uxBusyBar{position:fixed;z-index:90;top:0;inset-inline:0;height:3px;pointer-events:none;overflow:hidden;opacity:0}.uxBusyBar.show{opacity:1}.uxBusyBar:after{content:"";display:block;width:38%;height:100%;background:linear-gradient(90deg,transparent,#d7ff5f,transparent);animation:uxProgress 1.05s linear infinite}',
    '@keyframes uxProgress{from{transform:translateX(-140%)}to{transform:translateX(360%)}}',
    '.uxNetwork{position:fixed;z-index:92;top:8px;left:50%;transform:translate(-50%,-140%);max-width:min(560px,calc(100% - 24px));padding:9px 13px;border:1px solid #725c25;border-radius:999px;background:#342b16;color:#ffe49c;font-size:10px;font-weight:850;transition:transform .18s cubic-bezier(.23,1,.32,1)}.uxNetwork.show{transform:translate(-50%,0)}.uxNetwork.online{border-color:#285d4a;background:#10261f;color:#8ce6a1}',
    '.uxSearchButton{display:inline-flex;align-items:center;gap:7px;border:1px solid #2f353c;background:#15181b;color:#dfe3e8;border-radius:12px;padding:7px 10px;min-height:38px;font-size:9px}.uxSearchButton kbd{border:1px solid #3b424a;background:#20242a;border-radius:6px;padding:2px 5px;font:inherit;color:#9da5ae}',
    '.uxOverlay{display:none;position:fixed;inset:0;z-index:110;background:#030405c7;backdrop-filter:blur(8px);padding:18px;align-items:flex-start;justify-content:center}.uxOverlay.open{display:flex}.uxDialog{width:min(620px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;margin-top:min(10vh,90px);border:1px solid #353b43;background:#121416;border-radius:22px;box-shadow:0 28px 90px #000b;color:#f7f8f9}.uxDialogHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #292e34}.uxDialogHead h2{margin:0;font-size:16px}.uxDialogHead p{margin:5px 0 0;color:#979da5;font-size:10px;line-height:1.6}.uxClose{border:1px solid #31363c;background:#191c20;color:#fff;border-radius:10px;min-width:40px;min-height:40px}.uxDialogBody{padding:14px}.uxDialogActions{display:flex;justify-content:flex-end;gap:8px;padding:0 14px 14px}.uxDialogActions button{border-radius:11px;padding:9px 13px;font-weight:850}.uxDialogPrimary{border:0;background:#d7ff5f;color:#111}.uxDialogSecondary{border:1px solid #31363c;background:#191c20;color:#fff}',
    '.uxSearchInput{width:100%;min-height:52px;border:1px solid #39414a;background:#0d0f11;color:#fff;border-radius:14px;padding:12px 14px;font-size:16px}.uxSearchMeta{display:flex;justify-content:space-between;gap:8px;margin:9px 2px;color:#8f969e;font-size:9px}.uxResults{display:flex;flex-direction:column;gap:6px}.uxResult{width:100%;display:flex;align-items:center;gap:10px;border:1px solid #292f36;background:#171a1d;color:#fff;border-radius:13px;padding:11px;text-align:start}.uxResult:hover,.uxResult:focus-visible{border-color:#65772f;background:#1d2219}.uxResultIcon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#252a30}.uxResult b{display:block;font-size:11px}.uxResult small{display:block;margin-top:3px;color:#9299a2;font-size:8px}.uxNoResults{padding:24px;text-align:center;color:#9299a2;font-size:10px}',
    '.uxScreenTools{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px);gap:8px;margin:-6px 0 12px}.uxScreenTools input,.uxScreenTools select{width:100%;min-height:44px;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:9px 11px}',
    '.uxEmpty{display:grid;place-items:center;gap:7px;padding:26px 14px}.uxEmptyIcon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:#20251a;color:#d7ff5f;font-size:18px}.uxEmpty b{font-size:12px;color:#f7f8f9}.uxEmpty span{max-width:380px;line-height:1.65}.uxEmpty button{margin-top:5px;border:0;background:#d7ff5f;color:#111;border-radius:11px;padding:9px 13px;font-weight:850}',
    '.uxPrefsGrid{display:grid;gap:8px}.uxPrefRow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #292f35;background:#171a1d;border-radius:13px;padding:11px}.uxPrefRow b{font-size:10px}.uxSwitch{position:relative;width:46px;height:26px;flex:none}.uxSwitch input{position:absolute;opacity:0}.uxSwitch i{display:block;width:100%;height:100%;border-radius:999px;background:#30353b;transition:.16s}.uxSwitch i:after{content:"";display:block;width:20px;height:20px;margin:3px;border-radius:50%;background:#fff;transition:.16s}.uxSwitch input:checked+i{background:#72912c}.uxSwitch input:checked+i:after{transform:translateX(20px)}html[dir=rtl] .uxSwitch input:checked+i:after{transform:translateX(-20px)}',
    '.uxDashboardButton{border:1px solid #30363d;background:#171a1d;color:#fff;border-radius:12px;padding:8px 11px;font-size:9px;font-weight:850}.uxMetricRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;border:1px solid #292f35;border-radius:12px;padding:9px;margin-bottom:7px}.uxMetricRow button{min-height:38px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:9px;padding:6px 8px}.uxMetricRow label{display:flex;gap:7px;align-items:center;font-size:10px}',
    '.uxFeedback{margin-top:12px}.uxFeedbackForm{display:grid;gap:10px}.uxFeedbackForm select,.uxFeedbackForm textarea{width:100%;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:10px}.uxFeedbackForm textarea{min-height:110px;resize:vertical}.uxRating{display:flex;gap:5px}.uxRating button{width:42px;min-height:40px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:10px}.uxRating button.active{border-color:#7f9f35;background:#273315;color:#d7ff5f}.uxFormStatus{min-height:20px;color:#ffd87a;font-size:9px}',
    '.uxTour{position:fixed;z-index:120;inset:0;pointer-events:none}.uxTourCard{position:absolute;inset-inline:18px;bottom:18px;margin:auto;width:min(480px,calc(100% - 36px));pointer-events:auto;border:1px solid #52652c;background:#111510;border-radius:20px;padding:16px;box-shadow:0 26px 80px #000d}.uxTourCard h2{margin:0;font-size:16px}.uxTourCard p{color:#aeb8a0;font-size:10px;line-height:1.7}.uxTourActions{display:flex;justify-content:space-between;gap:8px}.uxTourActions button{border-radius:11px;padding:8px 12px;font-weight:850}.uxTourTarget{position:relative;z-index:119!important;box-shadow:0 0 0 4px #d7ff5f,0 0 0 9999px #0009!important}',
    '.uxAnnouncer{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}',
    '@media(max-width:700px){.uxSearchButton #uxSearchButtonText,.uxSearchButton kbd{display:none}.uxSearchButton{width:44px;justify-content:center;padding:0}.uxScreenTools{grid-template-columns:1fr}.uxOverlay{padding:10px}.uxDialog{margin-top:4vh;border-radius:18px}.uxTourCard{bottom:calc(78px + env(safe-area-inset-bottom))}.uxMetricRow{grid-template-columns:minmax(0,1fr) auto auto}.uxMetricRow label{grid-column:1/-1}.uxNetwork{top:6px}}',
    '@media(prefers-reduced-motion:reduce){.uxBusyBar:after{animation:none}.uxNetwork,.uxSwitch i,.uxSwitch i:after{transition:none}}'
  ].join('');
  document.head.appendChild(style);

  function ensureBase(){
    if(!q('#uxBusyBar'))document.body.insertAdjacentHTML('afterbegin','<div id="uxBusyBar" class="uxBusyBar" aria-hidden="true"></div><div id="uxNetwork" class="uxNetwork" role="status" aria-live="polite"></div><div id="uxAnnouncer" class="uxAnnouncer" role="status" aria-live="polite"></div>');
    if(!q('#uxConfirm'))document.body.insertAdjacentHTML('beforeend','<div id="uxConfirm" class="uxOverlay" role="alertdialog" aria-modal="true" aria-labelledby="uxConfirmTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxConfirmTitle"></h2><p id="uxConfirmBody"></p></div></div><div class="uxDialogActions"><button id="uxConfirmCancel" class="uxDialogSecondary" type="button"></button><button id="uxConfirmAccept" class="uxDialogPrimary" type="button"></button></div></div></div>');
    if(!q('#uxSearch'))document.body.insertAdjacentHTML('beforeend','<div id="uxSearch" class="uxOverlay" role="dialog" aria-modal="true" aria-labelledby="uxSearchTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxSearchTitle"></h2><p id="uxSearchHint"></p></div><button id="uxSearchClose" class="uxClose" type="button" aria-label="Close">×</button></div><div class="uxDialogBody"><input id="uxSearchInput" class="uxSearchInput" type="search"><div class="uxSearchMeta"><span id="uxSearchMeta"></span><button id="uxSearchClear" class="ghost" type="button"></button></div><div id="uxSearchResults" class="uxResults"></div></div></div></div>');
    ensureSearchButton();
    applyCopy();
  }

  function announce(message){const el=q('#uxAnnouncer');if(el)el.textContent='';setTimeout(()=>{if(el)el.textContent=message||''},20)}
  function uxStartKey(){return 'dabbir_ux_started_'+String(workspace?.business?.id||'workspace')}
  function uxFirstValueKey(){return 'dabbir_ux_first_value_'+String(workspace?.business?.id||'workspace')}
  function ensureUxStart(){if(!workspace?.business?.id)return;try{if(!localStorage.getItem(uxStartKey()))localStorage.setItem(uxStartKey(),String(Date.now()))}catch{}}
  function trackUx(eventName,extra={}){
    const businessId=workspace?.business?.id;if(!businessId)return;
    const duration=Number.isInteger(extra.duration_ms)?extra.duration_ms:null;
    const context={screen:String(typeof current!=='undefined'?current:''),language:document.documentElement.lang,viewport:innerWidth+'x'+innerHeight,release:'ux-foundation-v1'};
    if(extra.item_type)context.item_type=String(extra.item_type);
    fetch('/api/ux-events',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,event_name:eventName,duration_ms:duration,context})}).catch(()=>{});
    if(['conversation_created','appointment_created'].includes(eventName)){try{if(!localStorage.getItem(uxFirstValueKey())){const started=Number(localStorage.getItem(uxStartKey())||Date.now());localStorage.setItem(uxFirstValueKey(),'done');trackUx('workspace_first_value',{duration_ms:Math.max(0,Math.min(86400000,Date.now()-started))})}}catch{}}
  }
  window.__dabbirTrackUx=trackUx;
  function setBusy(active){q('#uxBusyBar')?.classList.toggle('show',Boolean(active));q('.main')?.setAttribute('aria-busy',String(Boolean(active)));if(active)announce(t().loading)}
  function showNetwork(online){const el=q('#uxNetwork');if(!el)return;el.textContent=online?t().online:t().offline;el.classList.toggle('online',online);el.classList.add('show');if(online)setTimeout(()=>el.classList.remove('show'),2400)}
  window.addEventListener('offline',()=>showNetwork(false));
  window.addEventListener('online',()=>showNetwork(true));

  function ask(options={}){
    ensureBase();
    const modal=q('#uxConfirm');
    q('#uxConfirmTitle').textContent=options.title||t().confirmTitle;
    q('#uxConfirmBody').textContent=options.body||t().confirmBody;
    q('#uxConfirmCancel').textContent=options.cancel||t().cancel;
    q('#uxConfirmAccept').textContent=options.accept||t().confirm;
    modal.classList.add('open');
    setTimeout(()=>q('#uxConfirmAccept')?.focus(),0);
    return new Promise(resolve=>{confirmResolver=resolve});
  }
  function settleConfirm(value){q('#uxConfirm')?.classList.remove('open');const resolve=confirmResolver;confirmResolver=null;if(resolve)resolve(Boolean(value))}
  window.__dabbirConfirm=ask;

  function ensureSearchButton(){
    const actions=q('.topActions');if(!actions||q('#uxSearchButton'))return;
    const button=document.createElement('button');button.id='uxSearchButton';button.className='uxSearchButton';button.type='button';
    button.innerHTML='<span>⌕</span><span id="uxSearchButtonText"></span><kbd>/</kbd>';
    actions.insertBefore(button,actions.firstChild);button.onclick=openSearch;
  }
  function openSearch(){ensureBase();q('#uxSearch').classList.add('open');q('#uxSearchInput').value='';renderSearch('');trackUx('search_opened');setTimeout(()=>q('#uxSearchInput')?.focus(),0)}
  function closeSearch(){q('#uxSearch')?.classList.remove('open')}
  function searchItems(){
    const items=[];
    const add=(type,title,sub,screen,id)=>items.push({type,title:String(title||''),sub:String(sub||''),screen,id});
    (workspace?.conversations||[]).forEach(row=>add('chat',typeof customerName==='function'?customerName(row.customer_id):row.id,row.state,'conversations',row.id));
    (workspace?.customers||[]).forEach(row=>add('customer',row.display_name,row.lead_status,'customers',row.id));
    (workspace?.appointments||[]).forEach(row=>add('appointment',typeof customerName==='function'?customerName(row.customer_id):row.customer_id,typeof fmt==='function'?fmt(row.starts_at):row.starts_at,'appointments',row.id));
    (workspace?.handoffs||[]).forEach(row=>add('task',row.route_class,row.reason||row.state,'tasks',row.id));
    (workspace?.followups||[]).forEach(row=>add('task',isAr()?'متابعة':'Follow-up',row.reason||row.status,'tasks',row.id));
    return items;
  }
  function renderSearch(term){
    const needle=normalize(term);const items=searchItems().filter(item=>!needle||normalize(item.title+' '+item.sub).includes(needle)).slice(0,30);
    q('#uxSearchMeta').textContent=t().results+' · '+items.length;
    q('#uxSearchResults').innerHTML=items.length?items.map((item,index)=>'<button class="uxResult" type="button" data-ux-result="'+index+'"><span class="uxResultIcon">'+(item.type==='chat'?'◉':item.type==='customer'?'♙':item.type==='appointment'?'□':'✓')+'</span><span><b>'+html(item.title)+'</b><small>'+html(item.sub)+'</small></span></button>').join(''):'<div class="uxNoResults">'+html(t().noResults)+'</div>';
    qa('[data-ux-result]').forEach(button=>button.onclick=async()=>{
      const item=items[Number(button.dataset.uxResult)];if(!item)return;closeSearch();trackUx('search_result_opened',{item_type:item.type});
      if(item.type==='chat'&&item.id){selectedConversationId=item.id;if(typeof loadRuntime==='function')await loadRuntime(workspace?.business?.id,item.id)}
      if(typeof showScreen==='function')showScreen(item.screen);
    });
  }

  const FILTER_TARGETS={conversations:'#chatList .chatContact',appointments:'#appointmentsTable .tr:not(.head)',customers:'#customersTable .tr:not(.head)'};
  function statusOf(screen,node){
    if(screen==='conversations')return normalize(node.querySelector('span')?.textContent);
    const spans=node.querySelectorAll('span');return normalize(spans[spans.length-1]?.textContent);
  }
  function ensureFilters(){
    Object.entries(FILTER_TARGETS).forEach(([screen])=>{
      const host=q('#screen-'+screen);const hero=host?.querySelector('.hero');if(!host||!hero||host.querySelector('[data-ux-tools="'+screen+'"]'))return;
      const tools=document.createElement('div');tools.className='uxScreenTools';tools.dataset.uxTools=screen;
      tools.innerHTML='<input type="search" data-ux-query="'+screen+'"><select data-ux-status="'+screen+'"><option value=""></option></select>';
      hero.insertAdjacentElement('afterend',tools);
      const input=tools.querySelector('input');const select=tools.querySelector('select');
      input.value=localStorage.getItem('dabbir_filter_'+screen)||'';
      input.addEventListener('input',()=>{localStorage.setItem('dabbir_filter_'+screen,input.value);applyFilter(screen)});
      select.addEventListener('change',()=>applyFilter(screen));
    });
    refreshFilters();
  }
  function refreshFilters(){
    Object.entries(FILTER_TARGETS).forEach(([screen,selector])=>{
      const select=q('[data-ux-status="'+screen+'"]');const input=q('[data-ux-query="'+screen+'"]');if(!select||!input)return;
      input.placeholder=t().filterPlaceholder;const previous=select.value;
      const statuses=[...new Set(qa(selector).map(node=>statusOf(screen,node)).filter(Boolean))];
      select.innerHTML='<option value="">'+html(t().allStatuses)+'</option>'+statuses.map(value=>'<option value="'+html(value)+'">'+html(value)+'</option>').join('');
      if(statuses.includes(previous))select.value=previous;
      applyFilter(screen);
    });
  }
  function applyFilter(screen){
    const query=normalize(q('[data-ux-query="'+screen+'"]')?.value);const status=normalize(q('[data-ux-status="'+screen+'"]')?.value);const selector=FILTER_TARGETS[screen];
    qa(selector).forEach(node=>{const visible=(!query||normalize(node.textContent).includes(query))&&(!status||statusOf(screen,node)===status);node.style.display=visible?'':'none'});
  }

  function emptyModel(container){
    const id=container.id;
    if(id==='chatList'||id==='messages')return {icon:'◉',title:t().emptyChatsTitle,body:t().emptyChatsBody,action:t().startChat,run:()=>q('#newChatModal')?.classList.add('open')};
    if(id==='appointmentsTable')return {icon:'□',title:t().emptyAppointmentsTitle,body:t().emptyAppointmentsBody,action:t().addAppointment,run:()=>q('#appointmentModal')?.classList.add('open')};
    if(id==='customersTable')return {icon:'♙',title:t().emptyCustomersTitle,body:t().emptyCustomersBody,action:t().startChat,run:()=>q('#newChatModal')?.classList.add('open')};
    if(['handoffList','followupList','automationList'].includes(id))return {icon:'✓',title:t().emptyTasksTitle,body:t().emptyTasksBody,action:t().goDashboard,run:()=>showScreen('dashboard')};
    if(id==='noticeList')return {icon:'✓',title:t().emptyNoticesTitle,body:t().emptyNoticesBody,action:t().goDashboard,run:()=>showScreen('dashboard')};
    return null;
  }
  function enrichEmptyStates(){
    ['chatList','messages','appointmentsTable','customersTable','handoffList','followupList','automationList','noticeList'].forEach(id=>{
      const container=q('#'+id);const empty=container?.querySelector('.empty');const model=container&&empty?emptyModel(container):null;if(!empty||!model||empty.dataset.uxEmpty)return;
      empty.dataset.uxEmpty='true';empty.classList.add('uxEmpty');empty.innerHTML='<span class="uxEmptyIcon">'+model.icon+'</span><b>'+html(model.title)+'</b><span>'+html(model.body)+'</span><button type="button">'+html(model.action)+'</button>';
      empty.querySelector('button').onclick=model.run;
    });
  }

  function prefKey(){return 'dabbir_preferences_'+String(workspace?.business?.id||'anonymous')}
  function normalizePrefs(value){
    const notifications={...DEFAULT_NOTIFICATIONS,...(value?.notification_preferences||{})};
    const source=value?.dashboard_preferences||{};const order=[...new Set([...(Array.isArray(source.metric_order)?source.metric_order:[]),...DEFAULT_DASHBOARD.metric_order])].filter(key=>DEFAULT_DASHBOARD.metric_order.includes(key));
    const hidden=[...new Set(Array.isArray(source.hidden_metrics)?source.hidden_metrics:[])].filter(key=>DEFAULT_DASHBOARD.metric_order.includes(key));
    return {notification_preferences:notifications,dashboard_preferences:{metric_order:order,hidden_metrics:hidden}};
  }
  async function loadPreferences(){
    const id=workspace?.business?.id;if(!id||preferencesBusinessId===id)return;preferencesBusinessId=id;
    try{const local=JSON.parse(localStorage.getItem(prefKey())||'null');if(local)preferences=normalizePrefs(local)}catch{}
    applyDashboardPreferences();renderNotificationPreferences();
    try{
      const response=await fetch('/api/user-preferences?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});const body=await response.json().catch(()=>null);
      if(response.ok&&body?.ok){preferences=normalizePrefs(body);localStorage.setItem(prefKey(),JSON.stringify(preferences));applyDashboardPreferences();renderNotificationPreferences()}
    }catch{}
  }
  async function savePreferences(){
    localStorage.setItem(prefKey(),JSON.stringify(preferences));applyDashboardPreferences();renderNotificationPreferences();
    const id=workspace?.business?.id;if(!id)return;
    try{
      const response=await fetch('/api/user-preferences',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:id,...preferences})});
      if(!response.ok)throw new Error('save');trackUx('preferences_saved');if(typeof toast==='function')toast(t().prefsSaved);
    }catch{if(typeof toast==='function')toast(t().prefsFailed)}
  }
  function metricLabel(key){return {conversations:t().metricConversations,appointments:t().metricAppointments,customers:t().metricCustomers,attention:t().metricAttention}[key]||key}
  function ensureDashboardButton(){
    const hero=q('#screen-dashboard .hero');if(!hero||q('#uxDashboardButton'))return;
    const button=document.createElement('button');button.id='uxDashboardButton';button.type='button';button.className='uxDashboardButton';button.onclick=openDashboardPreferences;hero.appendChild(button);
  }
  function applyDashboardPreferences(){
    ensureDashboardButton();const host=q('#dashCards');if(!host)return;const baseKeys=DEFAULT_DASHBOARD.metric_order;
    qa('#dashCards .metric').forEach((card,index)=>{if(!card.dataset.uxMetric)card.dataset.uxMetric=baseKeys[index]||''});
    preferences.dashboard_preferences.metric_order.forEach(key=>{const card=host.querySelector('[data-ux-metric="'+key+'"]');if(card)host.appendChild(card)});
    qa('#dashCards .metric').forEach(card=>card.hidden=preferences.dashboard_preferences.hidden_metrics.includes(card.dataset.uxMetric));
  }
  function openDashboardPreferences(){
    ensureBase();let modal=q('#uxDashboardPrefs');
    if(!modal){document.body.insertAdjacentHTML('beforeend','<div id="uxDashboardPrefs" class="uxOverlay" role="dialog" aria-modal="true" aria-labelledby="uxDashboardPrefsTitle"><div class="uxDialog"><div class="uxDialogHead"><div><h2 id="uxDashboardPrefsTitle"></h2><p id="uxDashboardPrefsDesc"></p></div><button class="uxClose" data-ux-close="uxDashboardPrefs" type="button">×</button></div><div id="uxMetricRows" class="uxDialogBody"></div><div class="uxDialogActions"><button id="uxDashboardSave" class="uxDialogPrimary" type="button"></button></div></div></div>');modal=q('#uxDashboardPrefs')}
    q('#uxDashboardPrefsTitle').textContent=t().customizeTitle;q('#uxDashboardPrefsDesc').textContent=t().customizeDesc;q('#uxDashboardSave').textContent=t().savePrefs;
    renderMetricRows();modal.classList.add('open');q('#uxDashboardSave').onclick=async()=>{await savePreferences();modal.classList.remove('open')};
    qa('[data-ux-close="uxDashboardPrefs"]').forEach(button=>button.onclick=()=>modal.classList.remove('open'));
  }
  function renderMetricRows(){
    const order=preferences.dashboard_preferences.metric_order;
    q('#uxMetricRows').innerHTML=order.map((key,index)=>'<div class="uxMetricRow" data-ux-metric-row="'+key+'"><label><input type="checkbox" '+(preferences.dashboard_preferences.hidden_metrics.includes(key)?'':'checked')+'> '+html(metricLabel(key))+'</label><button type="button" data-ux-up="'+key+'" '+(index===0?'disabled':'')+'>'+html(t().moveUp)+'</button><button type="button" data-ux-down="'+key+'" '+(index===order.length-1?'disabled':'')+'>'+html(t().moveDown)+'</button></div>').join('');
    qa('[data-ux-metric-row]').forEach(row=>row.querySelector('input').onchange=event=>{const key=row.dataset.uxMetricRow;const hidden=preferences.dashboard_preferences.hidden_metrics;preferences.dashboard_preferences.hidden_metrics=event.target.checked?hidden.filter(item=>item!==key):[...new Set([...hidden,key])]});
    qa('[data-ux-up]').forEach(button=>button.onclick=()=>moveMetric(button.dataset.uxUp,-1));qa('[data-ux-down]').forEach(button=>button.onclick=()=>moveMetric(button.dataset.uxDown,1));
  }
  function moveMetric(key,direction){const order=preferences.dashboard_preferences.metric_order;const index=order.indexOf(key),next=index+direction;if(index<0||next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];renderMetricRows()}

  function ensureNotificationPreferences(){
    const screen=q('#screen-notifications');if(!screen||q('#uxNotificationPreferences'))return;
    const card=document.createElement('section');card.id='uxNotificationPreferences';card.className='card';card.style.marginTop='12px';screen.appendChild(card);
  }
  function applyNotificationVisibility(){
    const host=q('#noticeList');if(!host)return;
    qa('#noticeList [data-notice-type]').forEach(item=>item.style.display=preferences.notification_preferences[item.dataset.noticeType]===false?'none':'');
    const visible=qa('#noticeList [data-notice-type]').some(item=>item.style.display!=='none');
    let empty=host.querySelector('[data-ux-filtered-empty]');
    if(!visible&&qa('#noticeList [data-notice-type]').length){if(!empty){empty=document.createElement('div');empty.className='empty uxEmpty';empty.dataset.uxFilteredEmpty='true';empty.innerHTML='<span class="uxEmptyIcon">✓</span><b>'+html(t().emptyNoticesTitle)+'</b><span>'+html(t().emptyNoticesBody)+'</span>';host.appendChild(empty)}}else empty?.remove();
  }
  function renderNotificationPreferences(){
    ensureNotificationPreferences();const card=q('#uxNotificationPreferences');if(!card)return;
    const rows=[['handoffs',t().handoffs],['appointments',t().appointments],['channel_issues',t().channelIssues],['daily_summary',t().dailySummary]];
    card.innerHTML='<div class="sectionHead"><div><h2>'+html(t().notificationPrefs)+'</h2><p class="muted">'+html(t().notificationDesc)+'</p></div></div><div class="uxPrefsGrid">'+rows.map(([key,label])=>'<div class="uxPrefRow"><b>'+html(label)+'</b><label class="uxSwitch"><input type="checkbox" data-ux-notification="'+key+'" '+(preferences.notification_preferences[key]?'checked':'')+'><i></i></label></div>').join('')+'</div>';
    qa('[data-ux-notification]').forEach(input=>input.onchange=()=>{preferences.notification_preferences[input.dataset.uxNotification]=input.checked;savePreferences()});
    applyNotificationVisibility();
  }

  function ensureFeedback(){
    const screen=q('#screen-help');if(!screen||q('#uxFeedback'))return;
    const card=document.createElement('section');card.id='uxFeedback';card.className='card uxFeedback';screen.appendChild(card);renderFeedback();
  }
  function renderFeedback(){
    const card=q('#uxFeedback');if(!card)return;
    card.innerHTML='<div class="sectionHead"><div><h2>'+html(t().feedbackTitle)+'</h2><p class="muted">'+html(t().feedbackDesc)+'</p></div></div><form id="uxFeedbackForm" class="uxFeedbackForm"><label>'+html(t().feedbackCategory)+'<select id="uxFeedbackCategory"><option value="general">'+html(t().general)+'</option><option value="problem">'+html(t().problem)+'</option><option value="idea">'+html(t().idea)+'</option><option value="onboarding">'+html(t().onboarding)+'</option></select></label><div><span class="muted">'+html(t().rating)+'</span><div id="uxRating" class="uxRating">'+[1,2,3,4,5].map(value=>'<button type="button" data-ux-rating="'+value+'" aria-label="'+value+'">'+value+'</button>').join('')+'</div></div><textarea id="uxFeedbackMessage" maxlength="2000" minlength="3" required placeholder="'+html(t().message)+'"></textarea><button id="uxFeedbackSubmit" class="primary" type="submit">'+html(t().sendFeedback)+'</button><div id="uxFeedbackStatus" class="uxFormStatus" role="status" aria-live="polite"></div></form>';
    let rating=null;qa('[data-ux-rating]').forEach(button=>button.onclick=()=>{rating=Number(button.dataset.uxRating);qa('[data-ux-rating]').forEach(item=>item.classList.toggle('active',Number(item.dataset.uxRating)===rating))});
    q('#uxFeedbackForm').onsubmit=async event=>{
      event.preventDefault();const button=q('#uxFeedbackSubmit'),status=q('#uxFeedbackStatus'),message=q('#uxFeedbackMessage').value.trim();if(message.length<3)return;
      button.disabled=true;status.textContent='';
      try{const response=await fetch('/api/feedback',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:workspace?.business?.id,category:q('#uxFeedbackCategory').value,rating,message,context:{screen:String(typeof current!=='undefined'?current:''),language:document.documentElement.lang,viewport:innerWidth+'x'+innerHeight,release:'ux-foundation-v1'}})});const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error('feedback');trackUx('feedback_submitted');status.textContent=t().feedbackSent;q('#uxFeedbackForm').reset();rating=null;qa('[data-ux-rating]').forEach(item=>item.classList.remove('active'))}catch{status.textContent=t().feedbackFailed}finally{button.disabled=false}
    };
  }

  function tourKey(){return 'dabbir_tour_v1_'+String(workspace?.business?.id||'workspace')}
  const tourSteps=()=>[{target:'#dabbirActivation',title:t().tourWelcome,body:t().tourWelcomeBody},{target:'#attentionList',title:t().tourPriority,body:t().tourPriorityBody},{target:matchMedia('(max-width:700px)').matches?'#bottomNav [data-screen="more"]':'#nav [data-screen="more"]',title:t().tourMore,body:t().tourMoreBody}];
  function startTour(){if(!workspace?.business||localStorage.getItem(tourKey())==='done'||q('#uxTour'))return;tourIndex=0;trackUx('tour_started');document.body.insertAdjacentHTML('beforeend','<div id="uxTour" class="uxTour"><div class="uxTourCard"><h2 id="uxTourTitle"></h2><p id="uxTourBody"></p><div class="uxTourActions"><button id="uxTourSkip" class="uxDialogSecondary" type="button"></button><button id="uxTourNext" class="uxDialogPrimary" type="button"></button></div></div></div>');q('#uxTourSkip').onclick=finishTour;q('#uxTourNext').onclick=()=>{tourIndex++;if(tourIndex>=tourSteps().length)finishTour();else renderTour()};renderTour()}
  function renderTour(){qa('.uxTourTarget').forEach(node=>node.classList.remove('uxTourTarget'));const steps=tourSteps(),step=steps[tourIndex],target=q(step.target);if(target){target.classList.add('uxTourTarget');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}q('#uxTourTitle').textContent=step.title;q('#uxTourBody').textContent=step.body;q('#uxTourSkip').textContent=t().skip;q('#uxTourNext').textContent=tourIndex===steps.length-1?t().finish:t().next}
  function finishTour(){qa('.uxTourTarget').forEach(node=>node.classList.remove('uxTourTarget'));q('#uxTour')?.remove();localStorage.setItem(tourKey(),'done');trackUx('tour_completed')}

  function applyCopy(){
    ensureSearchButton();if(q('#uxSearchButtonText'))q('#uxSearchButtonText').textContent=t().search;if(q('#uxSearchTitle'))q('#uxSearchTitle').textContent=t().search;if(q('#uxSearchHint'))q('#uxSearchHint').textContent=t().searchHint;if(q('#uxSearchInput'))q('#uxSearchInput').placeholder=t().searchPlaceholder;if(q('#uxSearchClear'))q('#uxSearchClear').textContent=t().clear;if(q('#uxDashboardButton'))q('#uxDashboardButton').textContent=t().customize;
    ensureFilters();refreshFilters();renderNotificationPreferences();if(q('#uxFeedback'))renderFeedback();
  }
  function afterRender(){ensureUxStart();ensureBase();ensureFilters();enrichEmptyStates();applyDashboardPreferences();renderNotificationPreferences();applyNotificationVisibility();ensureFeedback();loadPreferences();setTimeout(()=>startTour(),450)}

  ensureBase();
  q('#uxConfirmCancel')?.addEventListener('click',()=>settleConfirm(false));q('#uxConfirmAccept')?.addEventListener('click',()=>settleConfirm(true));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(q('#uxSearch')?.classList.contains('open'))closeSearch();else if(q('#uxConfirm')?.classList.contains('open'))settleConfirm(false);return}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();openSearch()}});
  q('#uxSearchClose')?.addEventListener('click',closeSearch);q('#uxSearchInput')?.addEventListener('input',event=>renderSearch(event.target.value));q('#uxSearchClear')?.addEventListener('click',()=>{q('#uxSearchInput').value='';renderSearch('');q('#uxSearchInput').focus()});

  try{
    if(typeof loadRuntime==='function'){const base=loadRuntime;loadRuntime=async function(){setBusy(true);try{return await base.apply(this,arguments)}catch{trackUx('load_error_shown');if(typeof toast==='function')toast(t().loadError);return null}finally{setBusy(false)}}}
    if(typeof renderAll==='function'){const base=renderAll;renderAll=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderDashboard==='function'){const base=renderDashboard;renderDashboard=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderChats==='function'){const base=renderChats;renderChats=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderAppointments==='function'){const base=renderAppointments;renderAppointments=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderCustomers==='function'){const base=renderCustomers;renderCustomers=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderTasks==='function'){const base=renderTasks;renderTasks=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
    if(typeof renderNotices==='function'){const base=renderNotices;renderNotices=function(){const result=base.apply(this,arguments);setTimeout(afterRender,0);return result}}
  }catch{}
  const observer=new MutationObserver(()=>{applyCopy();enrichEmptyStates();refreshFilters()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  afterRender();
  window.__dabbirUxFoundation={version:'ux-foundation-v1',confirm:ask,search:openSearch,refresh:afterRender,startTour:()=>{localStorage.removeItem(tourKey());startTour()}};
})();
(()=>{
  if(window.__dabbirOwnerCopilotUi)return;
  window.__dabbirOwnerCopilotUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loadedBusiness=null,proof=null,proofLoading=false,asking=false,lastScreen='dashboard';

  const style=document.createElement('style');
  style.dataset.dabbirOwnerCopilot='v2';
  style.textContent=[
    '.dabbirCopilot{margin:0 0 14px;border:1px solid #313c59;background:linear-gradient(155deg,#0e1424,#11182b 55%,#101522);border-radius:22px;padding:16px;box-shadow:0 18px 55px #0004}',
    '.dcHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dcIdentity{display:flex;align-items:center;gap:10px;min-width:0}.dcLogo{width:38px;height:38px;border-radius:12px;object-fit:cover;flex:0 0 auto}.dcHead h2{margin:0;font-size:16px}.dcHead p{margin:4px 0 0;color:#98a7bf;font-size:9px;line-height:1.6}.dcMode{white-space:nowrap;border:1px solid #2a594d;background:#10271f;color:#86e0b3;border-radius:999px;padding:6px 8px;font-size:7px;font-weight:900}',
    '.dcProof{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.dcMetric{border:1px solid #293550;background:#0c1220;border-radius:13px;padding:10px}.dcMetric strong{display:block;font-size:17px}.dcMetric span{display:block;margin-top:3px;color:#8e9bb0;font-size:7px;line-height:1.4}',
    '.dcAsk{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.dcInput{width:100%;min-height:48px;border:1px solid #35415f;background:#111a2d;color:#f7f9fc;border-radius:14px;padding:11px 13px;font-size:13px;outline:none}.dcInput:focus{border-color:#5474c8;box-shadow:0 0 0 3px #3b82f622}.dcAsk button{min-width:82px;border:0;border-radius:13px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-weight:900;padding:0 14px}.dcAsk button:disabled{opacity:.55;cursor:wait}',
    '.dcSuggestions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.dcSuggestion{min-height:34px!important;border:1px solid #2e3a57;background:#121a2b;color:#b8c4d7;border-radius:999px;padding:6px 9px;font-size:8px;font-weight:800}.dcSuggestion:hover{border-color:#52668f;color:#fff}',
    '.dcAnswer{display:none;margin-top:10px;border:1px solid #2c3856;background:#0b111e;border-radius:15px;padding:12px}.dcAnswer.show{display:block}.dcAnswerText{font-size:11px;line-height:1.75;color:#eef3fa;white-space:pre-wrap}.dcAnswerActions{display:flex;justify-content:flex-start;margin-top:9px}.dcOpen{min-height:38px;border:1px solid #3a4a70;background:#151f35;color:#eef4ff;border-radius:11px;padding:7px 11px;font-size:8px;font-weight:900}.dcAnswerMeta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #202a41;color:#7f8da5;font-size:7px}.dcAnswerMeta b{color:#8ce6a1;font-weight:850}',
    '@media(max-width:700px){.dabbirCopilot{padding:13px;border-radius:18px;margin-bottom:10px}.dcHead h2{font-size:15px}.dcLogo{width:34px;height:34px}.dcMode{font-size:6.5px}.dcProof{gap:5px}.dcMetric{padding:8px}.dcMetric strong{font-size:15px}.dcAsk{grid-template-columns:1fr}.dcInput{font-size:16px;min-height:50px}.dcAsk button{min-height:48px}.dcSuggestions{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.dcSuggestions::-webkit-scrollbar{display:none}.dcSuggestion{flex:0 0 auto}.dcAnswerText{font-size:10.5px}.dcOpen{min-height:44px}}'
  ].join('');
  document.head.append(style);

  const copy=()=>ar()?{
    title:'اسأل دَبِّر عن عملك',desc:'اسأل بلغتك الطبيعية. الإجابة مبنية على بيانات نشاطك الموثقة فقط.',mode:'قراءة موثقة',actions:'أنجزها اليوم',time:'وقت يدوي مقدر تم توفيره',attention:'يحتاجك الآن',ask:'اسأل',placeholder:'مثال: من يحتاج متابعة اليوم؟',loading:'أراجع بيانات النشاط الموثقة…',error:'تعذر تحليل النشاط الآن. حاول مرة أخرى.',verified:'مبني على بيانات النشاط الموثقة',fallback:'إجابة موثقة بدون AI',unknown:'—',minute:'د',suggestions:['ما الذي يحتاجني اليوم؟','من يحتاج متابعة؟','ماذا أنجزت اليوم؟'],appointment:'ما مواعيد الـ24 ساعة القادمة؟',open:{conversations:'فتح المحادثات',tasks:'فتح المهام',appointments:'فتح المواعيد',operations:'فتح العمليات',integrations:'فتح الربط',settings:'فتح الإعدادات',dashboard:'فتح الرئيسية'}
  }:{
    title:'Ask DABBIR about your business',desc:'Ask naturally. Answers use verified business data only.',mode:'Verified read-only',actions:'Done today',time:'Estimated manual time avoided',attention:'Needs you now',ask:'Ask',placeholder:'Example: Who needs follow-up today?',loading:'Reviewing verified business data…',error:'Business analysis is unavailable right now. Try again.',verified:'Based on verified business data',fallback:'Verified answer without AI',unknown:'—',minute:'m',suggestions:['What needs me today?','Who needs follow-up?','What did you do today?'],appointment:'What appointments are in the next 24 hours?',open:{conversations:'Open conversations',tasks:'Open tasks',appointments:'Open appointments',operations:'Open operations',integrations:'Open integrations',settings:'Open settings',dashboard:'Open dashboard'}
  };

  function currentWorkspace(){
    try{
      if(typeof workspace!=='undefined'&&workspace)return workspace;
    }catch{}
    return window.workspace||null;
  }

  function owner(){return String(currentWorkspace()?.membership?.role||'').toLowerCase()==='owner'}
  function businessId(){return currentWorkspace()?.business?.id||null}
  function exactAttention(){const m=currentWorkspace()?.verified_metrics;return m?.state==='VERIFIED_EXACT_COUNTS'&&Number.isSafeInteger(m.needs_attention)?m.needs_attention:null}
  function suggestions(){const t=copy();const type=String(currentWorkspace()?.business?.business_type||'').toLowerCase();return ['clinic','salon','real_estate','services','creator'].includes(type)?[...t.suggestions,t.appointment]:t.suggestions}
  function reducedMotion(){try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch{return false}}
  function safeScreen(value){return ['dashboard','conversations','tasks','appointments','operations','integrations','settings'].includes(String(value||''))?String(value):'dashboard'}

  function ensure(){
    const dash=q('#screen-dashboard');
    if(!dash||!owner())return null;
    let card=q('#dabbirOwnerCopilot');if(card)return card;
    card=document.createElement('section');card.id='dabbirOwnerCopilot';card.className='dabbirCopilot';
    const activation=q('#dabbirActivation');
    if(activation)activation.insertAdjacentElement('afterend',card);
    else{const hero=dash.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',card);else dash.prepend(card)}
    return card;
  }

  function render(){
    const card=ensure();if(!card)return false;
    const t=copy();const attention=exactAttention();
    const actions=proof?.available?proof.verified_autonomous_actions:null;
    const minutes=proof?.available?proof.estimated_manual_minutes_saved:null;
    const priorAnswer=q('#dcAnswerText')?.textContent||'';
    const priorMeta=q('#dcAnswerMeta')?.dataset.source||'';
    const screen=safeScreen(lastScreen);
    card.innerHTML='<div class="dcHead"><div class="dcIdentity"><img class="dcLogo" src="/dabbir-app-icon.png" alt=""><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.desc)+'</p></div></div><span class="dcMode">'+esc(t.mode)+'</span></div>'+
      '<div class="dcProof"><div class="dcMetric"><strong>'+(actions==null?esc(t.unknown):esc(actions))+'</strong><span>'+esc(t.actions)+'</span></div><div class="dcMetric"><strong>'+(minutes==null?esc(t.unknown):esc(minutes+t.minute))+'</strong><span>'+esc(t.time)+'</span></div><div class="dcMetric"><strong>'+(attention==null?esc(t.unknown):esc(attention))+'</strong><span>'+esc(t.attention)+'</span></div></div>'+
      '<form class="dcAsk" id="dcAskForm"><input class="dcInput" id="dcAskInput" maxlength="800" autocomplete="off" enterkeyhint="send" aria-label="'+esc(t.title)+'" placeholder="'+esc(t.placeholder)+'"><button id="dcAskButton" type="submit" '+(asking?'disabled':'')+'>'+esc(asking?t.loading:t.ask)+'</button></form>'+
      '<div class="dcSuggestions">'+suggestions().map(value=>'<button type="button" class="dcSuggestion" data-dc-suggest="'+esc(value)+'">'+esc(value)+'</button>').join('')+'</div>'+
      '<div class="dcAnswer '+(priorAnswer?'show':'')+'" id="dcAnswer" role="status" aria-live="polite"><div class="dcAnswerText" id="dcAnswerText">'+esc(priorAnswer)+'</div><div class="dcAnswerActions" '+(priorAnswer&&screen!=='dashboard'?'':'hidden')+'><button class="dcOpen" type="button" id="dcOpenScreen" data-screen="'+esc(screen)+'">'+esc(t.open[screen]||t.open.dashboard)+'</button></div><div class="dcAnswerMeta" id="dcAnswerMeta" data-source="'+esc(priorMeta)+'"><b>'+esc(priorMeta==='DETERMINISTIC_VERIFIED_FALLBACK'?t.fallback:t.verified)+'</b><span>Asia/Dubai</span></div></div>';
    q('#dcAskForm').onsubmit=event=>{event.preventDefault();ask(q('#dcAskInput')?.value||'')};
    card.querySelectorAll('[data-dc-suggest]').forEach(button=>button.onclick=()=>ask(button.dataset.dcSuggest||''));
    const open=q('#dcOpenScreen');if(open)open.onclick=()=>{const target=safeScreen(open.dataset.screen);if(typeof showScreen==='function')showScreen(target)};
    return true;
  }

  function showAnswer(answer,source,screen){
    lastScreen=safeScreen(screen);
    render();
    const box=q('#dcAnswer'),text=q('#dcAnswerText'),meta=q('#dcAnswerMeta');if(!box||!text||!meta)return;
    text.textContent=answer||copy().error;meta.dataset.source=source||'';
    const label=meta.querySelector('b');if(label)label.textContent=source==='DETERMINISTIC_VERIFIED_FALLBACK'?copy().fallback:copy().verified;
    const actions=box.querySelector('.dcAnswerActions'),open=q('#dcOpenScreen');
    if(actions)actions.hidden=lastScreen==='dashboard';
    if(open){open.dataset.screen=lastScreen;open.textContent=copy().open[lastScreen]||copy().open.dashboard}
    box.classList.add('show');box.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'nearest'});
  }

  async function timedFetch(url,options={},timeout=9500){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
  }

  async function loadProof(force=false){
    const id=businessId();if(!id||!owner()||proofLoading||(!force&&loadedBusiness===id&&proof))return;
    proofLoading=true;loadedBusiness=id;
    try{const response=await timedFetch('/api/owner-copilot?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}},5000);const body=await response.json().catch(()=>null);proof=response.ok&&body?.ok?body.proof:null}catch{proof=null}finally{proofLoading=false;render()}
  }

  async function ask(message){
    const id=businessId();const text=String(message||'').trim();if(!id||!text||asking)return;
    asking=true;render();const input=q('#dcAskInput');if(input)input.value=text;
    try{
      const response=await timedFetch('/api/owner-copilot',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,message:text,language:ar()?'ar':'en'})});
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body?.ok)throw new Error(body?.error||'OWNER_COPILOT_FAILED');
      if(body.proof)proof=body.proof;
      asking=false;showAnswer(body.answer,body.answer_source,body.recommended_screen);
    }catch(error){asking=false;showAnswer(copy().error,'','dashboard');try{if(typeof toast==='function')toast(copy().error)}catch{}}
  }

  function refresh(force=false){render();loadProof(force)}

  try{
    const base=renderDashboard;renderDashboard=function(){const result=base.apply(this,arguments);refresh(false);return result};
  }catch{}
  try{
    const base=renderAll;renderAll=function(){const result=base.apply(this,arguments);setTimeout(()=>refresh(false),0);return result};
  }catch{}
  try{
    const base=applyLang;applyLang=function(){const result=base.apply(this,arguments);setTimeout(()=>refresh(false),0);return result};
  }catch{}

  setTimeout(()=>refresh(false),0);
  setTimeout(()=>refresh(false),650);
  setTimeout(()=>refresh(false),1600);
  setTimeout(()=>refresh(false),3200);
  window.__dabbirOwnerCopilot={version:'owner-copilot-v2-canonical-workspace',refresh:()=>refresh(true)};
})();
(()=>{
  if(window.__dabbirContextualNavigationUi)return;
  window.__dabbirContextualNavigationUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';

  // index.html owns workspace as a top-level lexical binding, not a window property.
  // Read that canonical binding first; keep window.workspace only as a compatibility fallback.
  function currentWorkspace(){
    try{
      if(typeof workspace!=='undefined'&&workspace)return workspace;
    }catch{}
    return window.workspace||null;
  }

  const businessType=()=>String(currentWorkspace()?.business?.business_type||'').toLowerCase();
  const isStore=()=>businessType()==='store';
  const isServiceBusiness=()=>Boolean(businessType())&&!isStore();
  const isOwner=()=>String(currentWorkspace()?.membership?.role||'').toLowerCase()==='owner';
  const hasBusiness=()=>Boolean(currentWorkspace()?.business?.id);
  const copy=()=>ar()?{
    servicesTitle:'الخدمات',
    servicesDesc:'الخدمات الفعلية التي يقدمها نشاطك. عدّلها عند الحاجة بدون زيادة القوائم الرئيسية.',
    operations:'العمليات',
    teamTitle:'الفريق والموظفون',
    teamDesc:'إدارة أعضاء الفريق والدعوات والصلاحيات من مكان واضح.',
    assistantTitle:'مساعد دبّر',
    assistantDesc:'اسأل دبّر عن نشاطك وما يحتاج انتباهك الآن.'
  }:{
    servicesTitle:'Services',
    servicesDesc:'The real services your business provides. Manage them when needed without adding another primary destination.',
    operations:'Operations',
    teamTitle:'Team & employees',
    teamDesc:'Manage team members, invitations and permissions from one clear place.',
    assistantTitle:'DABBIR Assistant',
    assistantDesc:'Ask DABBIR about your business and what needs attention now.'
  };

  function activitySlots(){
    qa('#nav [data-screen="appointments"],#bottomNav [data-screen="appointments"],#nav [data-screen="operations"],#bottomNav [data-screen="operations"],#nav [data-dabbir-activity-slot="true"],#bottomNav [data-dabbir-activity-slot="true"]').forEach(node=>{
      node.dataset.dabbirActivitySlot='true';
    });
    return qa('[data-dabbir-activity-slot="true"]');
  }

  function setActivitySlot(node,target,label){
    node.dataset.screen=target;
    node.hidden=false;
    node.classList.remove('hidden');
    node.style.removeProperty('display');
    const labelNode=node.querySelector('[data-label]');
    if(labelNode)labelNode.textContent=label;
    node.setAttribute('aria-label',label);
    const icon=node.querySelector(':scope > .d4-nav-icon');
    if(icon&&icon.dataset.routerTarget!==target){
      icon.dataset.routerTarget=target;
      icon.innerHTML=target==='operations'
        ? '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg>'
        : '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>';
    }
  }

  function adaptPrimaryActivitySlot(){
    const t=copy();
    for(const node of activitySlots()){
      if(isStore()){
        setActivitySlot(node,'operations',t.operations);
      }else{
        let appointmentLabel='';
        try{appointmentLabel=String(T()?.appointments||'').trim()}catch{}
        setActivitySlot(node,'appointments',appointmentLabel||(ar()?'المواعيد':'Appointments'));
      }
    }
    if(isStore()&&typeof current!=='undefined'&&current==='appointments'&&typeof showScreen==='function')showScreen('operations');
  }

  function openServices(){
    if(typeof showScreen==='function')showScreen('operations');
    setTimeout(()=>window.__dabbirServiceOperations?.refresh?.(),0);
  }

  function openTeam(){
    window.location.assign('/team.html');
  }

  function openAssistant(){
    if(typeof showScreen==='function')showScreen('dashboard');
    setTimeout(()=>{
      window.__dabbirOwnerCopilot?.refresh?.();
      const card=q('#dabbirOwnerCopilot');
      if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
    },60);
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
    card.innerHTML='<h3>'+t.servicesTitle+'</h3><p>'+t.servicesDesc+'</p>';
  }

  function ensureUtilityCards(){
    const grid=q('#screen-more .moreGrid');
    if(!grid||!hasBusiness())return;
    const t=copy();

    let team=q('#dabbirTeamAccess');
    if(!team){
      team=document.createElement('button');
      team.type='button';
      team.id='dabbirTeamAccess';
      team.className='moreCard';
      team.addEventListener('click',openTeam);
      grid.append(team);
    }
    team.innerHTML='<h3>'+t.teamTitle+'</h3><p>'+t.teamDesc+'</p>';

    const sideTeam=q('#teamLink');
    if(sideTeam){
      sideTeam.hidden=false;
      sideTeam.classList.remove('hidden');
      sideTeam.style.removeProperty('display');
      sideTeam.textContent=t.teamTitle;
      sideTeam.setAttribute('aria-label',t.teamTitle);
    }

    let assistant=q('#dabbirAssistantAccess');
    if(!isOwner()){
      assistant?.remove();
      return;
    }
    if(!assistant){
      assistant=document.createElement('button');
      assistant.type='button';
      assistant.id='dabbirAssistantAccess';
      assistant.className='moreCard';
      assistant.addEventListener('click',openAssistant);
      grid.prepend(assistant);
    }
    assistant.innerHTML='<h3>'+t.assistantTitle+'</h3><p>'+t.assistantDesc+'</p>';
  }

  function bindMobileMenuResync(){
    const menu=q('#menuBtn');
    if(!menu||menu.dataset.dabbirContextRouterBound==='true')return;
    menu.dataset.dabbirContextRouterBound='true';
    menu.addEventListener('click',()=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(enforce);
      else setTimeout(enforce,0);
    });
  }

  function enforce(){
    adaptPrimaryActivitySlot();
    ensureMoreCard();
    ensureUtilityCards();
    bindMobileMenuResync();
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
  setTimeout(enforce,1600);
  window.__dabbirContextualNavigation={refresh:enforce,version:'v6',authority:'primary-context-router',workspace_source:'global-lexical-first',mobile_menu_resync:true,team_access:'more-and-sidebar',owner_assistant_access:'more'};
})();
(()=>{
  if(window.__dabbirCarWashBookingUi)return;window.__dabbirCarWashBookingUi=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  const businessId=()=>workspaceNow()?.business?.id||null;
  const copy=()=>ar()?{title:'كتالوج غسيل السيارات',desc:'صمّم حتى 6 عروض بالأسعار والمدة، ثم شارك رابط الحجز مع العميل.',nav:'كتالوج الحجز',save:'حفظ العرض',newOffer:'عرض جديد',settings:'إعدادات الحجز',open:'الحجز العام مفعّل',closed:'الحجز العام متوقف',enabled:'تفعيل الحجز العام',interval:'الفاصل بين المواعيد',horizon:'عدد الأيام القادمة',openTime:'يفتح',closeTime:'يغلق',days:'أيام العمل',allDays:'كل الأيام',saveSettings:'حفظ الإعدادات',offers:'العروض المنشورة',offerNameAr:'اسم العرض بالعربية',offerNameEn:'اسم العرض بالإنجليزية',descAr:'الوصف بالعربية',descEn:'الوصف بالإنجليزية',duration:'المدة بالدقائق',saloon:'سعر الصالون',station:'سعر الستيشن',active:'نشط',inactive:'متوقف',share:'نسخ رابط الحجز',copied:'تم نسخ رابط الحجز.',bookingLink:'رابط الحجز',bookings:'طلبات الحجز',customer:'العميل',phone:'الهاتف',vehicle:'السيارة',time:'الموعد',location:'الموقع',status:'الحالة',requested:'جديد',confirmed:'مؤكد',declined:'مرفوض',completed:'مكتمل',cancelled:'ملغي',noBookings:'لا توجد طلبات حجز بعد.',loading:'جارٍ تحميل كتالوج الحجز…',failed:'تعذر تحميل كتالوج الحجز.',saved:'تم الحفظ.',settingsSaved:'تم حفظ إعدادات الحجز.',updated:'تم تحديث حالة الطلب.',deactivate:'إيقاف العرض',newOfferHelp:'يمكنك نشر 6 عروض كحد أقصى. لا تحذف عرضًا مستخدمًا؛ أوقفه بدلًا من ذلك.',emptyOffer:'لم تضف عروضًا بعد.',copyLinkHelp:'أرسل هذا الرابط للعميل ليختار السيارة والعرض والموعد ويرسل موقعه.',sun:'الأحد',mon:'الإثنين',tue:'الثلاثاء',wed:'الأربعاء',thu:'الخميس',fri:'الجمعة',sat:'السبت'}:{title:'Car wash booking catalog',desc:'Design up to 6 offers with prices and duration, then share the booking link with customers.',nav:'Booking catalog',save:'Save offer',newOffer:'New offer',settings:'Booking settings',open:'Public booking is on',closed:'Public booking is off',enabled:'Enable public booking',interval:'Slot interval',horizon:'Booking days ahead',openTime:'Opens',closeTime:'Closes',days:'Working days',allDays:'Every day',saveSettings:'Save settings',offers:'Published offers',offerNameAr:'Offer name in Arabic',offerNameEn:'Offer name in English',descAr:'Description in Arabic',descEn:'Description in English',duration:'Duration in minutes',saloon:'Saloon price',station:'Station price',active:'Active',inactive:'Paused',share:'Copy booking link',copied:'Booking link copied.',bookingLink:'Booking link',bookings:'Booking requests',customer:'Customer',phone:'Phone',vehicle:'Vehicle',time:'Time',location:'Location',status:'Status',requested:'New',confirmed:'Confirmed',declined:'Declined',completed:'Completed',cancelled:'Cancelled',noBookings:'No booking requests yet.',loading:'Loading booking catalog…',failed:'Could not load booking catalog.',saved:'Saved.',settingsSaved:'Booking settings saved.',updated:'Booking status updated.',deactivate:'Pause offer',newOfferHelp:'Publish up to 6 offers. Do not delete a used offer; pause it instead.',emptyOffer:'No offers yet.',copyLinkHelp:'Send this link to customers so they can choose a vehicle, offer, time, and share their location.',sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
  const days=()=>[0,1,2,3,4,5,6].map((id,i)=>({id,label:copy()[['sun','mon','tue','wed','thu','fri','sat'][i]]}));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,loading=false;
  const style=document.createElement('style');style.textContent='.cwHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.cwHead h1{margin:0 0 5px;font-size:22px}.cwHead p{margin:0;color:var(--muted);font-size:11px;line-height:1.6}.cwGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}.cwCard{border:1px solid var(--line);background:#111315;border-radius:18px;padding:14px;margin-bottom:12px}.cwCard h2{font-size:14px;margin:0 0 5px}.cwHelp{color:var(--muted);font-size:9px;line-height:1.6;margin:0 0 11px}.cwForm{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cwField{display:flex;flex-direction:column;gap:5px}.cwField.wide{grid-column:1/-1}.cwField label{color:var(--muted);font-size:9px}.cwField input,.cwField textarea,.cwField select{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:8px;font-size:10px;min-height:40px}.cwField textarea{min-height:56px;resize:vertical}.cwOffer{border:1px solid #2c3238;background:#171a1d;border-radius:14px;padding:11px;margin-bottom:9px}.cwOfferTop{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.cwOfferTop strong{font-size:11px}.cwOfferTop span{font-size:8px;color:var(--muted)}.cwActions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.cwDays{display:flex;flex-wrap:wrap;gap:6px}.cwDay{border:1px solid var(--line);background:#181b1f;color:#b9c0c7;border-radius:999px;padding:7px 9px;font-size:9px;cursor:pointer}.cwDay.on{border-color:#65772f;background:#273519;color:#fff}.cwSwitch{display:flex;align-items:center;gap:8px;color:#fff;font-size:10px;margin-bottom:10px}.cwSwitch input{accent-color:var(--accent);width:18px;height:18px}.cwLink{display:flex;align-items:center;gap:7px;border:1px solid #394329;background:#182115;border-radius:12px;padding:9px;margin-top:10px}.cwLink input{flex:1;min-width:0;background:transparent;border:0;color:#c7d4bb;font-size:9px;direction:ltr}.cwTable{overflow:auto;border:1px solid var(--line);border-radius:13px}.cwRow{display:grid;grid-template-columns:1.2fr .9fr .8fr 1.2fr 1.2fr;gap:7px;align-items:center;padding:9px;border-bottom:1px solid #252a2f;font-size:9px;min-width:620px}.cwRow:last-child{border-bottom:0}.cwRow.head{color:var(--muted);background:#171a1d}.cwRow b{display:block;font-size:10px}.cwRow small{color:var(--muted);font-size:8px}.cwStatus{width:100%;min-height:34px!important;padding:5px!important}.cwLocation{color:var(--blue);text-decoration:underline}.cwEmpty{border:1px dashed #333a40;border-radius:12px;padding:20px;text-align:center;color:var(--muted);font-size:10px}.cwError{color:var(--red);font-size:10px;padding:11px}.cwBadge{display:inline-flex;border-radius:999px;padding:5px 8px;background:#15351f;color:var(--green);font-size:9px;font-weight:800}@media(max-width:780px){.cwGrid{grid-template-columns:1fr}.cwForm{grid-template-columns:1fr}.cwField.wide{grid-column:auto}.cwHead{display:block}.cwHead>.primary{margin-top:10px;width:100%}}';document.head.appendChild(style);
  function ensure(){let s=q('#screen-car-wash');if(s)return s;s=document.createElement('section');s.className='screen';s.id='screen-car-wash';s.innerHTML='<div id="cwRoot"></div>';q('.content')?.appendChild(s);return s}
  function show(){ensure();if(typeof showScreen==='function')showScreen('car-wash');q('#pageTitle').textContent=copy().nav;render()}
  function notify(msg){try{if(typeof toast==='function')toast(msg)}catch{}}
  async function request(options={}){const id=businessId();const r=await fetch('/api/car-wash-admin'+(options.method?'':'?business_id='+encodeURIComponent(id||'')),{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||copy().failed);return j}
  async function load(force=false){if(!isCarWash())return;if(loading||(!force&&data))return;loading=true;render();try{data=await request();render()}catch(e){data={error:e.message};render()}finally{loading=false;render()}}
  function value(o,key){return esc(o?.[key]??'')}
  function offerForm(o,index){const c=copy();const id=o?.id||'';return '<form class="cwOffer" data-cw-offer="'+esc(id)+'"><div class="cwOfferTop"><strong>'+(id?esc(c.offers+' #'+(o.sort_order||index+1)):esc(c.newOffer))+'</strong><span>'+esc(o?.active===false?c.inactive:c.active)+'</span></div><div class="cwForm"><div class="cwField"><label>'+esc(c.offerNameAr)+'</label><input name="name_ar" maxlength="120" value="'+value(o,'name_ar')+'" required></div><div class="cwField"><label>'+esc(c.offerNameEn)+'</label><input name="name_en" maxlength="120" value="'+value(o,'name_en')+'" required></div><div class="cwField"><label>'+esc(c.descAr)+'</label><textarea name="description_ar" maxlength="500">'+value(o,'description_ar')+'</textarea></div><div class="cwField"><label>'+esc(c.descEn)+'</label><textarea name="description_en" maxlength="500">'+value(o,'description_en')+'</textarea></div><div class="cwField"><label>'+esc(c.duration)+'</label><input name="duration_minutes" type="number" min="15" max="480" step="15" value="'+esc(o?.duration_minutes||60)+'" required></div><div class="cwField"><label>'+esc(c.saloon)+'</label><input name="saloon_price_aed" type="number" min="0" max="100000" step="0.01" value="'+esc(o?.saloon_price_aed??0)+'" required></div><div class="cwField"><label>'+esc(c.station)+'</label><input name="station_price_aed" type="number" min="0" max="100000" step="0.01" value="'+esc(o?.station_price_aed??0)+'" required></div><div class="cwField"><label>'+esc(c.active)+'</label><select name="active"><option value="true" '+(o?.active!==false?'selected':'')+'>'+esc(c.active)+'</option><option value="false" '+(o?.active===false?'selected':'')+'>'+esc(c.inactive)+'</option></select></div></div><div class="cwActions"><button type="submit" class="primary">'+esc(c.save)+'</button>'+(id?'<button type="button" class="secondary" data-cw-deactivate="'+esc(id)+'">'+esc(c.deactivate)+'</button>':'')+'</div></form>'}
  function render(){const root=q('#cwRoot');if(!root)return;const c=copy();if(!isCarWash()){root.innerHTML='<div class="cwCard cwEmpty">'+esc(ar()?'تظهر هذه الشاشة لنشاط غسيل السيارات فقط.':'This screen is available for car wash businesses only.')+'</div>';return}if(loading&&!data){root.innerHTML='<div class="cwCard cwEmpty">'+esc(c.loading)+'</div>';return}if(data?.error){root.innerHTML='<div class="cwCard cwError">'+esc(c.failed)+' — '+esc(data.error)+'</div>';return}if(!data){root.innerHTML='';return}const settings=data.settings||{};const working=new Set((settings.working_days||[0,1,2,3,4,5,6]).map(Number));const business=data.business||{};const link=location.origin+'/book?slug='+encodeURIComponent(business.slug||'');const offers=data.offers||[];const bookings=data.bookings||[];const offerHtml=offers.map((o,i)=>offerForm(o,i)).join('')+(offers.length<6?offerForm(null,offers.length):'');const daysHtml=days().map(d=>'<button type="button" class="cwDay '+(working.has(d.id)?'on':'')+'" data-cw-day="'+d.id+'">'+esc(d.label)+'</button>').join('');const bookingRows=bookings.length?bookings.map(b=>'<div class="cwRow"><div><b>'+esc(b.customer_name)+'</b><small>'+esc(b.phone||b.customer_phone||'')+'</small></div><span>'+esc(b.vehicle_type==='saloon'?c.saloon:c.station)+'</span><span>'+esc(new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(b.starts_at)))+'</span><a class="cwLocation" target="_blank" rel="noopener" href="https://www.google.com/maps?q='+encodeURIComponent(b.location_lat+','+b.location_lng)+'">'+esc(c.location)+'</a><select class="cwStatus" data-cw-booking="'+esc(b.id)+'"><option value="requested" '+(b.status==='requested'?'selected':'')+'>'+esc(c.requested)+'</option><option value="confirmed" '+(b.status==='confirmed'?'selected':'')+'>'+esc(c.confirmed)+'</option><option value="declined" '+(b.status==='declined'?'selected':'')+'>'+esc(c.declined)+'</option><option value="completed" '+(b.status==='completed'?'selected':'')+'>'+esc(c.completed)+'</option><option value="cancelled" '+(b.status==='cancelled'?'selected':'')+'>'+esc(c.cancelled)+'</option></select></div>').join(''):'<div class="cwEmpty">'+esc(c.noBookings)+'</div>';
    root.innerHTML='<div class="cwHead"><div><div class="eyebrow">'+esc(c.nav)+'</div><h1>'+esc(c.title)+'</h1><p>'+esc(c.desc)+'</p></div><button class="primary" id="cwCopyLink" type="button">'+esc(c.share)+'</button></div><div class="cwLink"><span class="cwBadge">'+esc(settings.public_booking_enabled!==false?c.open:c.closed)+'</span><input readonly value="'+esc(link)+'" aria-label="'+esc(c.bookingLink)+'"><button class="secondary" id="cwCopyLink2" type="button">'+esc(c.share)+'</button></div><div class="cwGrid"><div><section class="cwCard"><h2>'+esc(c.offers)+'</h2><p class="cwHelp">'+esc(c.newOfferHelp)+'</p>'+offerHtml+'</section></div><div><section class="cwCard"><h2>'+esc(c.settings)+'</h2><p class="cwHelp">'+esc(c.copyLinkHelp)+'</p><form id="cwSettings"><label class="cwSwitch"><input type="checkbox" name="public_booking_enabled" '+(settings.public_booking_enabled!==false?'checked':'')+'> '+esc(c.enabled)+'</label><div class="cwForm"><div class="cwField"><label>'+esc(c.interval)+'</label><select name="slot_interval_minutes">'+[15,30,45,60].map(v=>'<option value="'+v+'" '+(Number(settings.slot_interval_minutes)===v?'selected':'')+'>'+v+' min</option>').join('')+'</select></div><div class="cwField"><label>'+esc(c.horizon)+'</label><input name="booking_horizon_days" type="number" min="1" max="60" value="'+esc(settings.booking_horizon_days||14)+'"></div><div class="cwField"><label>'+esc(c.openTime)+'</label><input name="open_time" type="time" value="'+esc(String(settings.open_time||'08:00').slice(0,5))+'"></div><div class="cwField"><label>'+esc(c.closeTime)+'</label><input name="close_time" type="time" value="'+esc(String(settings.close_time||'20:00').slice(0,5))+'"></div><div class="cwField wide"><label>'+esc(c.days)+'</label><div class="cwDays">'+daysHtml+'</div></div></div><div class="cwActions"><button class="primary" type="submit">'+esc(c.saveSettings)+'</button></div></form></section></div></div><section class="cwCard"><h2>'+esc(c.bookings)+'</h2><div class="cwTable"><div class="cwRow head"><span>'+esc(c.customer)+'</span><span>'+esc(c.vehicle)+'</span><span>'+esc(c.time)+'</span><span>'+esc(c.location)+'</span><span>'+esc(c.status)+'</span></div>'+bookingRows+'</div></section>';
    bind();
  }
  function bind(){qa('[data-cw-offer]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const offers=data?.offers||[];const current=offers.find(o=>o.id===form.dataset.cwOffer);const payload={action:'save_offer',business_id:businessId(),offer_id:form.dataset.cwOffer||undefined,sort_order:current?.sort_order||Math.min(offers.length+1,6),name_ar:fd.get('name_ar'),name_en:fd.get('name_en'),description_ar:fd.get('description_ar'),description_en:fd.get('description_en'),duration_minutes:fd.get('duration_minutes'),saloon_price_aed:fd.get('saloon_price_aed'),station_price_aed:fd.get('station_price_aed'),active:fd.get('active')==='true'};try{await request({method:'POST',body:JSON.stringify(payload)});notify(copy().saved);data=null;await load(true)}catch(err){notify(err.message)}});qa('[data-cw-deactivate]').forEach(b=>b.onclick=async()=>{try{await request({method:'POST',body:JSON.stringify({action:'deactivate_offer',business_id:businessId(),offer_id:b.dataset.cwDeactivate})});notify(copy().saved);data=null;await load(true)}catch(err){notify(err.message)}});q('#cwSettings')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const working=qa('[data-cw-day].on').map(b=>Number(b.dataset.cwDay));try{await request({method:'POST',body:JSON.stringify({action:'save_settings',business_id:businessId(),public_booking_enabled:fd.get('public_booking_enabled')==='on',slot_interval_minutes:fd.get('slot_interval_minutes'),booking_horizon_days:fd.get('booking_horizon_days'),open_time:fd.get('open_time'),close_time:fd.get('close_time'),working_days:working})});notify(copy().settingsSaved);data=null;await load(true)}catch(err){notify(err.message)}});qa('[data-cw-day]').forEach(b=>b.onclick=()=>{b.classList.toggle('on')});qa('[data-cw-booking]').forEach(s=>s.onchange=async()=>{try{await request({method:'POST',body:JSON.stringify({action:'update_booking_status',business_id:businessId(),booking_id:s.dataset.cwBooking,status:s.value})});notify(copy().updated)}catch(err){notify(err.message)}});q('#cwCopyLink')?.addEventListener('click',copyLink);q('#cwCopyLink2')?.addEventListener('click',copyLink)}
  async function copyLink(){const link=location.origin+'/book?slug='+encodeURIComponent(data?.business?.slug||'');try{await navigator.clipboard.writeText(link)}catch{const input=q('.cwLink input');input?.select();document.execCommand('copy')}notify(copy().copied)}
  ensure();
  function addMoreCard(){const grid=q('#screen-more .moreGrid');if(!grid||!isCarWash())return;let card=q('#dabbirCarWashCatalog');if(!card){card=document.createElement('button');card.id='dabbirCarWashCatalog';card.className='moreCard';card.type='button';card.onclick=show;grid.prepend(card)}card.innerHTML='<h3>'+esc(copy().nav)+'</h3><p>'+esc(copy().desc)+'</p>'}
  try{const base=showScreen;showScreen=function(name){const r=base(name);if(name==='car-wash'){q('#pageTitle').textContent=copy().nav;load()}return r}}catch{}
  try{const base=renderAll;renderAll=function(){const r=base.apply(this,arguments);addMoreCard();return r}}catch{}
  new MutationObserver(()=>{addMoreCard();if(q('#screen-car-wash')?.classList.contains('active'))render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});setTimeout(()=>{addMoreCard();if(isCarWash())load()},700);
})();
