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
    '.dabbirWhatsAppHint{display:block;width:100%;margin-top:7px;color:#979da5;font-size:9px;line-height:1.55}',
    '.dabbirWhatsAppHint.error{color:#ffb1b1}',
    '.dabbirWhatsAppBusy{opacity:.65;pointer-events:none}'
  ].join('');
  document.head.appendChild(css);

  let sdkPromise=null;
  let embeddedSession=null;
  let sessionWaiters=[];
  let configCache=null;
  let configBusinessId=null;
  let busy=false;
  let stage='idle';

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function tell(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function businessId(){try{return String(workspace?.business?.id||'').trim()}catch{return ''}}

  function report(event,extra={}){
    try{
      fetch('/api/dabbir-whatsapp-client-event',{
        method:'POST',cache:'no-store',keepalive:true,
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({event,stage,...extra})
      }).catch(()=>{});
    }catch{}
  }

  function setStage(next){stage=next;report('stage',{stage:next})}

  function whatsappCard(){
    const grid=document.querySelector('#integrationGrid');
    if(!grid) return null;
    const wanted=(()=>{try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}})();
    return [...grid.querySelectorAll('.integration')].find(card=>String(card.querySelector('h3')?.textContent||'').trim()===wanted)||null;
  }

  function settleSession(value){
    const waiters=sessionWaiters.splice(0);
    for(const resolve of waiters) resolve(value);
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
        waba_id:String(payload.waba_id||payload.whatsapp_business_account_id||'').trim(),
        phone_number_id:String(payload.phone_number_id||'').trim(),
      };
      report('session_finish',{has_waba:Boolean(embeddedSession.waba_id),has_phone:Boolean(embeddedSession.phone_number_id)});
      settleSession(embeddedSession);
      return;
    }
    if(data.event==='CANCEL'){
      report('session_cancel');
      settleSession(null);
      return;
    }
    if(data.event==='ERROR'){
      report('session_error',{error:String(data?.data?.error_message||data?.data?.error||'META_EMBEDDED_SIGNUP_ERROR').slice(0,160)});
      settleSession(null);
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
        report('session_timeout');
        finish(null);
      },timeoutMs);
      sessionWaiters.push(finish);
    });
  }

  function initSdk(FB,cfg){
    FB.init({appId:cfg.app_id,cookie:true,xfbml:false,version:cfg.graph_version});
    return FB;
  }

  async function loadSdk(cfg){
    if(window.FB) return initSdk(window.FB,cfg);
    if(sdkPromise) return sdkPromise;

    sdkPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timeout);fn(value)};
      const timeout=setTimeout(()=>finish(reject,new Error('META_SDK_LOAD_TIMEOUT')),15000);
      const previous=window.fbAsyncInit;
      window.fbAsyncInit=function(){
        try{if(typeof previous==='function')previous()}catch{}
        try{finish(resolve,initSdk(window.FB,cfg))}catch(error){finish(reject,error)}
      };

      const existing=document.querySelector('script[data-dabbir-meta-sdk]');
      if(existing){
        const interval=setInterval(()=>{
          if(!window.FB)return;
          clearInterval(interval);
          try{finish(resolve,initSdk(window.FB,cfg))}catch(error){finish(reject,error)}
        },100);
        setTimeout(()=>clearInterval(interval),15100);
        return;
      }

      const metaScript=document.createElement('script');
      metaScript.async=true;
      metaScript.defer=true;
      metaScript.crossOrigin='anonymous';
      metaScript.src='https://connect.facebook.net/'+encodeURIComponent(cfg.sdk_locale||'en_US')+'/sdk.js';
      metaScript.setAttribute('data-dabbir-meta-sdk','true');
      metaScript.onerror=()=>finish(reject,new Error('META_SDK_LOAD_FAILED'));
      document.head.appendChild(metaScript);
    });

    try{return await sdkPromise}
    catch(error){sdkPromise=null;throw error}
  }

  async function loadConfig(force=false){
    const bid=businessId();
    if(!bid) throw new Error('BUSINESS_REQUIRED');
    if(!force&&configCache&&configBusinessId===bid) return configCache;
    const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{
      cache:'no-store',headers:{accept:'application/json'}
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok) throw new Error(payload.error||'EMBEDDED_CONFIG_LOAD_FAILED');
    configBusinessId=bid;
    configCache=payload;
    return payload;
  }

  async function refreshTenantStatus(){
    const bid=businessId();
    if(!bid)return;
    try{
      const response=await fetch('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(bid),{
        cache:'no-store',headers:{accept:'application/json'}
      });
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
    card?.querySelectorAll('[data-dabbir-whatsapp-actions] button').forEach(button=>{
      button.disabled=value||button.dataset.platformReady==='false';
    });
  }

  async function completeSignup(code,session){
    setStage('server_complete');
    report('complete_start',{has_code:Boolean(code),has_waba:Boolean(session?.waba_id),has_phone:Boolean(session?.phone_number_id)});
    const response=await fetch('/api/dabbir-whatsapp-embedded-complete',{
      method:'POST',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({business_id:businessId(),code,waba_id:session.waba_id,phone_number_id:session.phone_number_id})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){
      const error=new Error(payload.error||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
      error.providerStatus=payload.provider_status||null;
      error.providerCode=payload.provider_code||null;
      throw error;
    }
    report('complete_ok',{has_waba:true,has_phone:true});
    if(typeof workspace!=='undefined'&&workspace) workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
    configCache=null;
    await loadConfig(true).catch(()=>null);
    await refreshTenantStatus();
    tell(ar()?'تم ربط WhatsApp بنجاح':'WhatsApp connected successfully');
  }

  function failureText(key,cfg){
    if(key==='CANONICAL_PRODUCTION_ORIGIN_REQUIRED'||key==='CANONICAL_ORIGIN_REQUIRED'){
      const expected=String(cfg?.expected_origin||'').trim();
      return ar()?('افتح DABBIR من رابط الإنتاج المعتمد'+(expected?' '+expected:'')+' ثم أعد الربط.'):('Open DABBIR from the canonical production URL'+(expected?' '+expected:'')+' and retry.');
    }
    if(key==='META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED') return ar()?'إعداد Meta Embedded Signup غير مكتمل على خادم DABBIR.':'DABBIR Meta Embedded Signup server configuration is incomplete.';
    if(key==='META_AUTHORIZATION_CODE_MISSING') return ar()?'لم تُرجع Meta رمز التفويض. لم يتم حفظ أي ربط.':'Meta did not return an authorization code. No connection was saved.';
    if(key==='META_EMBEDDED_SIGNUP_SESSION_MISSING') return ar()?'لم تصل بيانات حساب WhatsApp والرقم من Meta. لم يتم حفظ أي ربط ناقص.':'Meta did not return the WhatsApp account and phone data. No incomplete connection was saved.';
    if(key==='META_SDK_LOAD_FAILED'||key==='META_SDK_LOAD_TIMEOUT') return ar()?'تعذر تحميل Meta Login. حدّث الصفحة ثم أعد المحاولة.':'Meta Login could not load. Refresh the page and retry.';
    if(key==='BUSINESS_REQUIRED') return ar()?'تعذر تحديد النشاط الحالي. أعد تحميل DABBIR.':'The current business could not be resolved. Reload DABBIR.';
    return ar()?'تعذر إكمال ربط WhatsApp. لم يتم حفظ أي ربط غير مكتمل.':'WhatsApp connection could not be completed. No incomplete connection was saved.';
  }

  async function connectWhatsApp(){
    if(busy)return;
    setBusy(true);
    embeddedSession=null;
    settleSession(null);
    let cfg=null;
    setStage('connect_start');
    report('connect_start');
    try{
      setStage('platform_config');
      cfg=await loadConfig(true);
      report('config_loaded',{canonical_origin_active:Boolean(cfg?.platform_readiness?.canonical_origin_active),platform_ready:Boolean(cfg?.platform_ready)});
      if(cfg?.platform_readiness?.canonical_origin_active!==true) throw new Error('CANONICAL_ORIGIN_REQUIRED');
      if(!cfg?.platform_ready||!cfg.app_id||!cfg.config_id) throw new Error('META_EMBEDDED_SIGNUP_PLATFORM_NOT_CONFIGURED');

      setStage('sdk_load');
      const FB=await loadSdk(cfg);
      report('sdk_ready');

      // Start listening before opening Meta so a fast FINISH postMessage cannot race the callback.
      const sessionPromise=waitForSession();
      setStage('meta_login');
      const auth=await new Promise((resolve,reject)=>{
        try{
          FB.login(response=>{
            report('login_callback',{has_code:Boolean(response?.authResponse?.code)});
            resolve(response||{});
          },{
            config_id:cfg.config_id,
            response_type:'code',
            override_default_response_type:true,
            extras:{setup:{},featureType:'',sessionInfoVersion:'3'}
          });
        }catch(error){reject(error)}
      });

      const code=String(auth?.authResponse?.code||'').trim();
      if(!code) throw new Error('META_AUTHORIZATION_CODE_MISSING');

      setStage('meta_session');
      const session=await sessionPromise;
      if(!session?.waba_id||!session?.phone_number_id) throw new Error('META_EMBEDDED_SIGNUP_SESSION_MISSING');
      await completeSignup(code,session);
      setStage('complete');
    }catch(error){
      const key=String(error?.message||'WHATSAPP_EMBEDDED_SIGNUP_FAILED');
      report('connect_error',{
        error:key.slice(0,160),
        has_waba:Boolean(embeddedSession?.waba_id),
        has_phone:Boolean(embeddedSession?.phone_number_id),
        provider_status:error?.providerStatus||null,
        provider_code:error?.providerCode||null
      });
      tell(failureText(key,cfg));
    }finally{
      setBusy(false);
      setTimeout(renderActions,0);
    }
  }

  async function disconnectWhatsApp(){
    if(busy)return;
    if(!window.confirm(ar()?'فصل رقم WhatsApp عن هذا النشاط؟':'Disconnect WhatsApp from this business?'))return;
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
      await refreshTenantStatus();
      tell(ar()?'تم فصل WhatsApp':'WhatsApp disconnected');
    }catch{tell(ar()?'تعذر فصل WhatsApp':'WhatsApp could not be disconnected')}
    finally{setBusy(false);setTimeout(renderActions,0)}
  }

  async function renderActions(){
    const card=whatsappCard();
    if(!card||!businessId())return;
    let box=card.querySelector('[data-dabbir-whatsapp-actions]');
    if(!box){
      box=document.createElement('div');
      box.className='dabbirWhatsAppActions';
      box.setAttribute('data-dabbir-whatsapp-actions','true');
      card.appendChild(box);
    }

    let cfg=null;
    try{cfg=await loadConfig()}catch{}
    box.replaceChildren();
    if(!cfg)return;

    const connected=Boolean(cfg.connected&&workspace?.whatsapp?.connected!==false);
    const primary=document.createElement('button');
    primary.type='button';
    primary.className=connected?'dabbirWhatsAppChange':'dabbirWhatsAppConnect';
    primary.textContent=connected?(ar()?'تغيير رقم WhatsApp':'Change WhatsApp number'):(ar()?'ربط WhatsApp':'Connect WhatsApp');
    primary.dataset.platformReady=String(Boolean(cfg.platform_ready));
    primary.disabled=busy||!cfg.platform_ready;
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
    if(cfg.platform_readiness?.canonical_origin_active!==true){
      hint.classList.add('error');
      hint.textContent=ar()?('الربط متاح فقط من رابط DABBIR المعتمد: '+String(cfg.expected_origin||'')):('Connection is available only on the canonical DABBIR URL: '+String(cfg.expected_origin||''));
    }else if(!cfg.platform_ready){
      hint.classList.add('error');
      hint.textContent=ar()?'إعداد Meta Embedded Signup على الخادم غير مكتمل.':'Meta Embedded Signup server configuration is incomplete.';
    }else{
      hint.textContent=ar()?'الربط يتم عبر نافذة Meta الرسمية. اتركها مفتوحة حتى تنتهي جميع الخطوات.':'Connection uses Meta’s official window. Keep it open until every step finishes.';
    }
    box.appendChild(hint);
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
    if(card&&!card.querySelector('[data-dabbir-whatsapp-actions]'))setTimeout(renderActions,0);
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
