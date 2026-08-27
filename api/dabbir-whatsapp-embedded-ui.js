const script = String.raw`(()=>{
  if(window.__dabbirWhatsAppEmbeddedUiLoaded) return;
  window.__dabbirWhatsAppEmbeddedUiLoaded=true;

  const SESSION_TIMEOUT_MS=15*60*1000;
  const META_MESSAGE_ORIGINS=new Set([
    'https://www.facebook.com',
    'https://web.facebook.com',
    'https://m.facebook.com',
    'https://business.facebook.com'
  ]);

  const css=document.createElement('style');
  css.textContent=[
    '.dabbirWhatsAppActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.dabbirWhatsAppActions button{min-height:40px;border-radius:10px;padding:8px 11px;font-size:10px;font-weight:850}',
    '.dabbirWhatsAppConnect{border:0;background:#25D366;color:#07140c}',
    '.dabbirWhatsAppChange{border:1px solid #2a2e33;background:#181b1f;color:#fff}',
    '.dabbirWhatsAppDisconnect{border:1px solid #5a2525;background:#2d1717;color:#ffb1b1}',
    '.dabbirWhatsAppHint{display:block;margin-top:7px;color:#979da5;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppBusy{opacity:.65;pointer-events:none}'
  ].join('');
  document.head.appendChild(css);

  let sdkPromise=null;
  let embeddedSession=null;
  let sessionWaiters=[];
  let configCache=null;
  let configBusinessId=null;
  let busy=false;

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function businessId(){try{return String(workspace?.business?.id||'')}catch{return ''}}

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
    if(!META_MESSAGE_ORIGINS.has(String(event.origin||''))) return;
    let data=event.data;
    if(typeof data==='string'){
      try{data=JSON.parse(data)}catch{return}
    }
    if(!data||data.type!=='WA_EMBEDDED_SIGNUP') return;
    if(data.event==='FINISH'){
      const payload=data.data||{};
      embeddedSession={
        waba_id:String(payload.waba_id||payload.whatsapp_business_account_id||''),
        phone_number_id:String(payload.phone_number_id||''),
      };
      report('session_finish',{stage:'meta_session',has_waba:Boolean(embeddedSession.waba_id),has_phone:Boolean(embeddedSession.phone_number_id)});
      settleSession(embeddedSession);
    }else if(data.event==='CANCEL'){
      report('session_cancel',{stage:'meta_session'});
      settleSession(null);
    }else if(data.event==='ERROR'){
      report('session_error',{stage:'meta_session',error:String(data?.data?.error_message||data?.data?.error||'META_EMBEDDED_SIGNUP_ERROR').slice(0,160)});
      settleSession(null);
      tell(ar()?'تعذر إكمال ربط WhatsApp من Meta':'Meta could not complete WhatsApp setup');
    }
  }
  window.addEventListener('message',parseMetaMessage);

  function waitForSession(timeoutMs=SESSION_TIMEOUT_MS){
    if(embeddedSession?.waba_id&&embeddedSession?.phone_number_id) return Promise.resolve(embeddedSession);
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
          if(window.FB){clearInterval(wait);try{window.FB.init({appId:cfg.app_id,cookie:true,xfbml:false,version:cfg.graph_version})}catch{}resolve(window.FB)}
        },100);
        setTimeout(()=>{clearInterval(wait);if(!window.FB)reject(new Error('META_SDK_LOAD_TIMEOUT'))},10000);
        return;
      }
      const metaScript=document.createElement('script');
      metaScript.async=true;metaScript.defer=true;metaScript.crossOrigin='anonymous';
      metaScript.src='https://connect.facebook.net/'+encodeURIComponent(cfg.sdk_locale||'en_US')+'/sdk.js';
      metaScript.setAttribute('data-dabbir-meta-sdk','true');
      metaScript.onerror=()=>reject(new Error('META_SDK_LOAD_FAILED'));
      document.head.appendChild(metaScript);
    });
    return sdkPromise;
  }

  async function loadConfig(force=false){
    const bid=businessId();
    if(!bid) return null;
    if(!force&&configCache&&configBusinessId===bid) return configCache;
    const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{cache:'no-store',headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok) return null;
    configBusinessId=bid;configCache=payload;
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
    report('complete_start',{stage:'server_complete',has_code:Boolean(code),has_waba:Boolean(session?.waba_id),has_phone:Boolean(session?.phone_number_id)});
    const response=await fetch('/api/dabbir-whatsapp-embedded-complete',{
      method:'POST',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({business_id:businessId(),code,waba_id:session.waba_id,phone_number_id:session.phone_number_id})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok) throw new Error(payload.error||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
    report('complete_ok',{stage:'server_complete',has_waba:true,has_phone:true});
    if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
    configCache=null;
    await loadConfig(true).catch(()=>null);
    await refreshTenantStatus();
    tell(ar()?'تم ربط WhatsApp بنجاح':'WhatsApp connected successfully');
  }

  function failureText(key){
    if(key==='META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED') return ar()?'إعداد Meta Embedded Signup الخاص بمنصة DABBIR غير مكتمل بعد':'DABBIR Meta Embedded Signup platform configuration is incomplete';
    if(key==='META_AUTHORIZATION_CODE_MISSING') return ar()?'لم تُرجع Meta رمز التفويض. أغلق نافذة Meta وأعد المحاولة من زر ربط WhatsApp.':'Meta did not return an authorization code. Close the Meta window and retry from Connect WhatsApp.';
    if(key==='META_EMBEDDED_SIGNUP_SESSION_MISSING') return ar()?'لم تصل بيانات حساب WhatsApp والرقم من Meta. لم يتم حفظ أي ربط ناقص.':'Meta did not return the WhatsApp account and phone data. No incomplete connection was saved.';
    if(key==='META_SDK_LOAD_FAILED'||key==='META_SDK_LOAD_TIMEOUT') return ar()?'تعذر تحميل تسجيل الدخول من Meta. أعد المحاولة بعد تحديث الصفحة.':'Meta login could not load. Refresh the page and retry.';
    return ar()?'تعذر ربط WhatsApp. لم يتم حفظ أي ربط غير مكتمل.':'WhatsApp could not be connected. No incomplete connection was saved.';
  }

  async function connectWhatsApp(){
    if(busy) return;
    setBusy(true);
    embeddedSession=null;
    let stage='start';
    report('connect_start',{stage});
    try{
      stage='platform_config';
      const cfg=await loadConfig(true);
      report('config_loaded',{stage,has_code:false,has_waba:false,has_phone:false});
      if(!cfg?.platform_ready||!cfg.app_id||!cfg.config_id) throw new Error('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED');

      stage='sdk_load';
      const FB=await loadSdk(cfg);
      report('sdk_ready',{stage});

      stage='meta_login';
      const auth=await new Promise((resolve,reject)=>{
        try{
          FB.login(response=>{
            report('login_callback',{stage:'meta_login',has_code:Boolean(response?.authResponse?.code)});
            resolve(response);
          },{
            config_id:cfg.config_id,
            response_type:'code',
            override_default_response_type:true,
            extras:{setup:{},featureType:'',sessionInfoVersion:'3'}
          });
        }catch(error){reject(error)}
      });

      const code=String(auth?.authResponse?.code||'');
      if(!code) throw new Error('META_AUTHORIZATION_CODE_MISSING');

      stage='meta_session';
      const session=await waitForSession();
      if(!session?.waba_id||!session?.phone_number_id) throw new Error('META_EMBEDDED_SIGNUP_SESSION_MISSING');

      stage='server_complete';
      await completeSignup(code,session);
    }catch(error){
      const key=String(error?.message||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
      report('connect_error',{stage,error:key,has_waba:Boolean(embeddedSession?.waba_id),has_phone:Boolean(embeddedSession?.phone_number_id)});
      tell(failureText(key));
    }finally{
      setBusy(false);
      renderActions();
    }
  }

  async function disconnectWhatsApp(){
    if(busy) return;
    const accepted=window.confirm(ar()?'فصل رقم WhatsApp عن هذا النشاط؟':'Disconnect WhatsApp from this business?');
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
      if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={connected:false,state:'NOT_CONFIGURED',phone:null,operational:false};
      try{if(typeof renderIntegrations==='function')renderIntegrations()}catch{}
      tell(ar()?'تم فصل WhatsApp':'WhatsApp disconnected');
    }catch{tell(ar()?'تعذر فصل WhatsApp':'WhatsApp could not be disconnected')}
    finally{setBusy(false);renderActions()}
  }

  async function renderActions(){
    const card=whatsappCard();
    if(!card||!businessId()) return;
    let box=card.querySelector('[data-dabbir-whatsapp-actions]');
    if(!box){
      box=document.createElement('div');box.className='dabbirWhatsAppActions';box.setAttribute('data-dabbir-whatsapp-actions','true');card.appendChild(box);
    }
    let cfg=null;
    try{cfg=await loadConfig()}catch{}
    if(!cfg){box.replaceChildren();return}
    box.replaceChildren();
    const connected=Boolean(cfg.connected||workspace?.whatsapp?.connected);
    const primary=document.createElement('button');
    primary.type='button';primary.className=connected?'dabbirWhatsAppChange':'dabbirWhatsAppConnect';
    primary.textContent=connected?(ar()?'تغيير رقم WhatsApp':'Change WhatsApp number'):(ar()?'ربط WhatsApp':'Connect WhatsApp');
    primary.dataset.platformReady=String(Boolean(cfg.platform_ready));
    primary.disabled=busy||!cfg.platform_ready;
    primary.onclick=connectWhatsApp;
    box.appendChild(primary);
    if(connected){
      const disconnect=document.createElement('button');disconnect.type='button';disconnect.className='dabbirWhatsAppDisconnect';disconnect.textContent=ar()?'فصل WhatsApp':'Disconnect WhatsApp';disconnect.onclick=disconnectWhatsApp;disconnect.disabled=busy;box.appendChild(disconnect);
    }
    const hint=document.createElement('span');
    hint.className='dabbirWhatsAppHint';
    hint.textContent=cfg.platform_ready
      ? (ar()?'الربط يتم داخل DABBIR عبر نافذة Meta الرسمية. اترك النافذة مفتوحة حتى تنتهي كل خطوات Meta.':'Connection happens inside DABBIR through Meta’s official window. Keep the window open until every Meta step finishes.')
      : (ar()?'إعداد Meta Embedded Signup للمنصة يحتاج App ID وConfiguration ID قبل فتح نافذة الربط.':'Platform Meta Embedded Signup needs an App ID and Configuration ID before the connection window can open.');
    box.appendChild(hint);
  }

  if(typeof renderIntegrations==='function'&&!window.__dabbirWhatsAppEmbeddedRenderWrapped){
    window.__dabbirWhatsAppEmbeddedRenderWrapped=true;
    const before=renderIntegrations;
    renderIntegrations=function(){const result=before.apply(this,arguments);setTimeout(renderActions,0);return result};
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
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  return res.end(script);
}
