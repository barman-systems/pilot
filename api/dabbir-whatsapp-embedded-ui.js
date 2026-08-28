const script = String.raw`(()=>{
  if(window.__dabbirWhatsAppEmbeddedUiLoaded) return;
  window.__dabbirWhatsAppEmbeddedUiLoaded=true;

  const SESSION_TIMEOUT_MS=15*60*1000;
  const POST_LOGIN_SESSION_GRACE_MS=1800;
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
        onboarding_mode:COEXISTENCE_FEATURE
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok) throw new Error(payload.error||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
    report('complete_ok',{stage:'server_complete',onboarding_mode:COEXISTENCE_FEATURE,has_waba:true,has_phone:true});
    if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
    configCache=null;
    await loadConfig(true).catch(()=>null);
    await refreshTenantStatus();
    tell(ar()?'تم ربط رقم WhatsApp Business بنجاح':'WhatsApp Business number connected successfully');
  }

  function failureText(key){
    if(key==='META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED') return ar()?'إعداد ربط WhatsApp Business في Meta غير مكتمل بعد':'Meta WhatsApp Business onboarding is not configured yet';
    if(key==='META_AUTHORIZATION_CODE_MISSING') return ar()?'لم تُرجع Meta رمز التفويض. أغلق نافذة Meta وأعد المحاولة من داخل دبّر.':'Meta did not return an authorization code. Close the Meta window and retry from DABBIR.';
    if(key==='META_EMBEDDED_SIGNUP_SESSION_MISSING') return ar()?'لم يصل تأكيد ربط WhatsApp Business من Meta. لم يتم حفظ أي ربط ناقص.':'Meta did not return the WhatsApp Business connection confirmation. No incomplete connection was saved.';
    if(key==='META_WABA_DISCOVERY_EMPTY') return ar()?'أكملت Meta تسجيل الدخول، لكن لم تشارك أي حساب WhatsApp Business مع دبّر.':'Meta login completed, but no WhatsApp Business Account was shared with DABBIR.';
    if(key==='META_WABA_RESOLUTION_REQUIRED') return ar()?'تمت مشاركة أكثر من حساب WhatsApp Business ولا يمكن اختيار أحدها تلقائيًا بأمان.':'More than one WhatsApp Business Account was shared, so DABBIR cannot safely choose one automatically.';
    if(key==='META_COEXISTENCE_PHONE_RESOLUTION_REQUIRED') return ar()?'يوجد أكثر من رقم داخل حساب WhatsApp Business ولم تتمكن Meta من تحديد الرقم المختار تلقائيًا.':'More than one WhatsApp Business number is available and Meta did not identify the selected number.';
    if(key==='META_SDK_NOT_READY'||key==='META_SDK_LOAD_FAILED'||key==='META_SDK_LOAD_TIMEOUT') return ar()?'جاري تجهيز الربط الآمن من Meta. أعد الضغط بعد أن يصبح الزر جاهزًا.':'Meta secure onboarding is still preparing. Retry when the connect button is ready.';
    return ar()?'تعذر ربط WhatsApp Business. لم يتم حفظ أي ربط غير مكتمل.':'WhatsApp Business could not be connected. No incomplete connection was saved.';
  }

  async function connectWhatsApp(){
    if(busy) return;
    const cfg=configCache;
    const FB=window.FB;
    embeddedSession=null;
    let stage='start';
    report('connect_start',{stage,onboarding_mode:COEXISTENCE_FEATURE});

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
            report('login_callback',{stage:'meta_login',onboarding_mode:COEXISTENCE_FEATURE,has_code:Boolean(response?.authResponse?.code)});
            resolve(response);
          },{
            config_id:cfg.config_id,
            response_type:'code',
            override_default_response_type:true,
            extras:{setup:{},featureType:COEXISTENCE_FEATURE,sessionInfoVersion:'3'}
          });
          report('login_invoked',{stage:'meta_login',onboarding_mode:COEXISTENCE_FEATURE});
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
      report('connect_error',{stage,error:key,onboarding_mode:COEXISTENCE_FEATURE,has_waba:Boolean(embeddedSession?.waba_id),has_phone:Boolean(embeddedSession?.phone_number_id)});
      tell(failureText(key));
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
