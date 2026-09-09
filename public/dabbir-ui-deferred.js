/* DABBIR UI bundle: generated from config/dabbir-ui-bundles.json. */
(()=>{
  if(window.__dabbirBranchContextUi)return;
  window.__dabbirBranchContextUi='v5-all-scope-multichannel-runtime';
  const PREFIX='dabbir_active_branch_scope:';
  let activeBusiness=null,context=null,loading=null,apiPatched=false,fetchPatched=false;
  const style=document.createElement('style');style.textContent="\n.dbBranchScope{margin-top:8px}.dbBranchScope label{display:block;color:#8f969e;font-size:8px;margin:0 0 4px}.dbBranchScope select{width:100%;min-height:40px;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:10px;padding:7px 9px;font-size:10px}.dbBranchScope small{display:block;margin-top:4px;color:#767d85;font-size:7px}.dbBranchScope[data-state=\"error\"] small{color:#ffb4ba}\n@media(max-width:700px){.dbBranchScope select{min-height:44px;font-size:12px}}\n";style.dataset.dabbirBranchContext='v5';document.head.append(style);

  function businessId(){try{return String(workspace?.business?.id||'').trim()}catch{return''}}
  function key(id){return PREFIX+String(id||'')}
  function stored(id){try{return localStorage.getItem(key(id))||''}catch{return''}}
  function save(id,value){try{localStorage.setItem(key(id),String(value||''))}catch{}}
  function isAr(){return document.documentElement.lang!=='en'}
  function copy(){return isAr()?{label:'نطاق الفرع',all:'كل الفروع',hint:'ما يظهر هنا يحدد بيانات التشغيل المعروضة.',error:'تعذر تحميل صلاحيات الفروع'}:{label:'Branch scope',all:'All branches',hint:'This controls which operational data is loaded.',error:'Could not load branch permissions'}}
  function parseBody(options){try{return options?.body?JSON.parse(options.body):null}catch{return null}}

  function currentScope(id){
    const value=stored(id);
    if(value)return value;
    if(context?.business_id===id&&context.default_scope)return String(context.default_scope);
    return 'all';
  }

  function routedApi(original,url,options){
    const raw=String(url||'');
    if(!raw.startsWith('/api/dabbir-runtime'))return original(url,options);
    let parsed;
    try{parsed=new URL(raw,location.origin)}catch{return original(url,options)}
    const body=parseBody(options);
    const method=String(options?.method||'GET').toUpperCase();
    const bid=String(parsed.searchParams.get('business_id')||body?.business_id||businessId()||'').trim();
    if(!bid)return original(url,options);
    const scope=currentScope(bid);
    if(!scope)return original(url,options);

    if(method==='GET'){
      const target=new URL('/api/branch-workspace',location.origin);
      target.searchParams.set('business_id',bid);
      if(scope!=='all')target.searchParams.set('branch_id',scope);
      const cid=parsed.searchParams.get('conversation_id');if(cid)target.searchParams.set('conversation_id',cid);
      return original(target.pathname+target.search,options);
    }

    if(scope==='all')return original(url,options);

    if(method==='POST'&&body&&['start_conversation','create_appointment'].includes(String(body.action||''))){
      const next=Object.assign({},body,{business_id:bid,branch_id:scope});
      return original('/api/branch-operations',Object.assign({},options,{body:JSON.stringify(next)}));
    }
    return original(url,options);
  }

  function patchApi(){
    if(apiPatched)return true;
    if(typeof window.api!=='function')return false;
    const original=window.api.bind(window);
    window.api=function(url,options){return routedApi(original,url,options)};
    window.api.__dabbirBranchScoped=true;
    apiPatched=true;
    return true;
  }

  async function persistWhatsAppIntent(original,bid,scope){
    const response=await original('/api/whatsapp-branch-intent',{
      method:'POST',cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json','x-dabbir-client':'web'},
      body:JSON.stringify({business_id:bid,branch_id:scope&&scope!=='all'?scope:null}),
    });
    const payload=await response.clone().json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.error||'WHATSAPP_BRANCH_INTENT_REQUIRED');
    return payload;
  }

  function patchFetch(){
    if(fetchPatched)return true;
    if(typeof window.fetch!=='function')return false;
    const original=window.fetch.bind(window);
    window.fetch=async function(input,options){
      const raw=typeof input==='string'?input:String(input?.url||'');
      let parsed;try{parsed=new URL(raw,location.origin)}catch{return original(input,options)}
      const path=parsed.pathname;
      if(!['/api/dabbir-whatsapp-embedded-complete','/api/dabbir-whatsapp-embedded-config','/api/dabbir-whatsapp-status','/api/dabbir-whatsapp-disconnect'].includes(path)){
        return original(input,options);
      }
      const body=parseBody(options);
      const method=String(options?.method||'GET').toUpperCase();
      const bid=String(parsed.searchParams.get('business_id')||body?.business_id||businessId()||'').trim();
      if(!bid)return original(input,options);
      const scope=currentScope(bid);

      if(path==='/api/dabbir-whatsapp-embedded-complete'&&method==='POST'){
        try{await persistWhatsAppIntent(original,bid,scope)}catch(error){
          return new Response(JSON.stringify({ok:false,error:String(error?.message||'WHATSAPP_BRANCH_INTENT_REQUIRED')}),{
            status:409,headers:{'content-type':'application/json'}
          });
        }
        return original(input,options);
      }

      if(['/api/dabbir-whatsapp-embedded-config','/api/dabbir-whatsapp-status'].includes(path)&&method==='GET'){
        parsed.searchParams.set('business_id',bid);
        if(scope&&scope!=='all')parsed.searchParams.set('branch_id',scope);
        else parsed.searchParams.delete('branch_id');
        return original(parsed.pathname+parsed.search,options);
      }

      if(scope&&scope!=='all'&&path==='/api/dabbir-whatsapp-disconnect'&&method==='POST'&&body){
        const next=Object.assign({},body,{business_id:bid,branch_id:scope});
        return original(input,Object.assign({},options,{body:JSON.stringify(next)}));
      }
      return original(input,options);
    };
    window.fetch.__dabbirWhatsAppBranchScoped=true;
    fetchPatched=true;
    return true;
  }

  async function loadContext(id){
    if(!id)return null;
    if(loading)return loading;
    loading=(async()=>{
      const response=await fetch('/api/branch-context?business_id='+encodeURIComponent(id),{cache:'no-store',headers:{accept:'application/json','x-dabbir-client':'web'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok)throw new Error(payload.error||'BRANCH_CONTEXT_FAILED');
      context=payload;
      const valid=new Set((payload.branches||[]).map(row=>String(row.id)));
      let value=stored(id);
      if(value==='all'&&!payload.all_allowed)value='';
      if(value!=='all'&&value&&!valid.has(value))value='';
      if(!value)value=String(payload.default_scope||payload.branches?.[0]?.id||'');
      if(value)save(id,value);
      document.documentElement.dataset.dabbirBranchScope=value||'unselected';
      return payload;
    })().finally(()=>{loading=null});
    return loading;
  }

  function ensureUi(){
    const host=document.querySelector('.side .workspace');
    if(!host)return null;
    let box=host.querySelector('#dbBranchScope');
    if(!box){
      box=document.createElement('div');box.id='dbBranchScope';box.className='dbBranchScope';
      box.innerHTML='<label></label><select aria-label="Branch scope"></select><small></small>';
      host.append(box);
      box.querySelector('select').addEventListener('change',async event=>{
        const id=businessId();if(!id)return;
        const value=String(event.target.value||'');if(!value)return;
        save(id,value);document.documentElement.dataset.dabbirBranchScope=value;
        window.dispatchEvent(new CustomEvent('dabbir:branch-scope-changed',{detail:{business_id:id,branch_id:value==='all'?null:value,mode:value==='all'?'all':'selected'}}));
        try{if(typeof window.loadRuntime==='function')await window.loadRuntime(id)}catch{}
      });
    }
    return box;
  }

  function render(){
    const box=ensureUi();if(!box)return;
    const t=copy();box.querySelector('label').textContent=t.label;box.querySelector('small').textContent=t.hint;
    const select=box.querySelector('select');
    const id=businessId();
    if(!context||context.business_id!==id){select.innerHTML='';select.disabled=true;return}
    const options=[];
    if(context.all_allowed)options.push('<option value="all">'+t.all+'</option>');
    for(const branch of context.branches||[])options.push('<option value="'+String(branch.id).replace(/"/g,'')+'">'+String(branch.name||'Branch').replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))+'</option>');
    select.innerHTML=options.join('');select.disabled=false;
    const value=currentScope(id);if([...select.options].some(o=>o.value===value))select.value=value;
    box.dataset.state='ready';
  }

  async function sync(force=false){
    patchFetch();patchApi();
    const id=businessId();
    if(!id){activeBusiness=null;context=null;render();return}
    if(id!==activeBusiness||force){
      activeBusiness=id;context=null;render();
      try{await loadContext(id);render()}catch{const box=ensureUi();if(box){box.dataset.state='error';box.querySelector('small').textContent=copy().error}}
    }else render();
  }

  window.dabbirBranchContext={
    scope:()=>{const id=businessId();const value=currentScope(id);return {business_id:id,mode:value==='all'?'all':'selected',branch_id:value==='all'?null:value}},
    query(url){const id=businessId(),value=currentScope(id);if(!id||!value||value==='all')return url;const u=new URL(url,location.origin);u.searchParams.set('branch_id',value);return u.pathname+u.search},
    refresh:()=>sync(true),
  };

  let ticks=0;const timer=setInterval(()=>{sync();ticks++;if(ticks>120&&apiPatched&&fetchPatched&&businessId())clearInterval(timer)},250);
  document.addEventListener('click',()=>setTimeout(sync,0),true);
  window.addEventListener('dabbir:language-changed',render);
  sync();
})();
(()=>{
  if(window.__dabbirWhatsAppEmbeddedUiLoaded) return;
  window.__dabbirWhatsAppEmbeddedUiLoaded=true;

  const SESSION_TIMEOUT_MS=15*60*1000;
  const POST_LOGIN_SESSION_GRACE_MS=5000;
  const CONFIG_CACHE_MS=60*1000;
  const CONFIG_FAILURE_CACHE_MS=10*1000;
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
  let configFetchedAt=0;
  let configFailureBusinessId='';
  let configFailureAt=0;
  let configInFlight=null;
  let configInFlightBusinessId='';
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

  function resetConfigCache(){
    configCache=null;
    configBusinessId=null;
    configFetchedAt=0;
    configFailureBusinessId='';
    configFailureAt=0;
  }

  async function loadConfig(force=false){
    const bid=businessId();
    if(!bid) return null;
    const now=Date.now();
    if(!force&&configCache&&configBusinessId===bid&&now-configFetchedAt<CONFIG_CACHE_MS) return configCache;
    if(!force&&configFailureBusinessId===bid&&now-configFailureAt<CONFIG_FAILURE_CACHE_MS) return null;
    if(configInFlight&&configInFlightBusinessId===bid) return configInFlight;

    configInFlightBusinessId=bid;
    const request=(async()=>{
      try{
        const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{cache:'no-store',headers:{accept:'application/json'}});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok){
          configFailureBusinessId=bid;
          configFailureAt=Date.now();
          return null;
        }
        configBusinessId=bid;
        configCache=payload;
        configFetchedAt=Date.now();
        configFailureBusinessId='';
        configFailureAt=0;
        return payload;
      }catch{
        configFailureBusinessId=bid;
        configFailureAt=Date.now();
        return null;
      }
    })();
    configInFlight=request;
    try{return await request}
    finally{
      if(configInFlight===request){
        configInFlight=null;
        configInFlightBusinessId='';
      }
    }
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
    resetConfigCache();
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
        report('session_missing',{stage:'meta_session',has_code:true,has_waba:false,has_phone:false});
        settleSession(null);
        throw new Error('META_EMBEDDED_SIGNUP_SESSION_MISSING');
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
      resetConfigCache();
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
  let configInFlight=null;
  let configInFlightBusinessId='';
  let patchScheduled=false;
  let patchRunning=false;
  let patchQueued=false;
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

  // This observer also watches these attributes. Writing the same value still
  // queues an attribute mutation in WebKit, so every write must be idempotent
  // or Safari can enter an unbounded patch loop and terminate the page.
  function setDisabled(button,value){
    const next=Boolean(value);
    if(button.disabled!==next) button.disabled=next;
  }

  function setData(button,key,value){
    if(button.dataset[key]!==value) button.dataset[key]=value;
  }

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
    if(configInFlight&&configInFlightBusinessId===bid) return configInFlight;

    configInFlightBusinessId=bid;
    configInFlight=(async()=>{
      try{
        const response=await fetch('/api/dabbir-whatsapp-embedded-config?business_id='+encodeURIComponent(bid),{
          cache:'no-store',headers:{accept:'application/json'}
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok) return null;
        cachedConfig=payload;cachedBusinessId=bid;cachedAt=Date.now();
        return payload;
      }catch{return null}
      finally{
        if(configInFlightBusinessId===bid){
          configInFlight=null;
          configInFlightBusinessId='';
        }
      }
    })();
    return configInFlight;
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

  function integrationSurfaceActive(){
    return Boolean(document.querySelector('#screen-integrations.active'));
  }

  async function patch(){
    patchScheduled=false;
    if(patchRunning){patchQueued=true;return}
    patchRunning=true;
    try{
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
          setDisabled(button,oauthReturnBusy||oauthLaunchBusy);
          button.setAttribute('aria-disabled',(oauthReturnBusy||oauthLaunchBusy)?'true':'false');
          setData(button,'platformReady','true');
          button.dataset.dabbirEmbeddedSignupAuthority='official-message-flow-v1';
          if(hint) hint.textContent=ar()
            ? 'اضغط ربط. سيستخدم دبّر Embedded Signup الرسمي من Meta، وستُعاد معرفات WABA والرقم عبر رسالة Meta الآمنة.'
            : 'Tap Connect. DABBIR will use Meta Embedded Signup, which returns the WABA and phone IDs through its secure message event.';
          return;
        }
        if(button.closest('.dabbirWhatsAppBusy')) return;
        const text=blockedText(missingParts(cfg));
        setDisabled(button,false);
        button.setAttribute('aria-disabled','false');
        button.title=text;
        if(hint&&hint.textContent!==text) hint.textContent=text;
      });
    }finally{
      patchRunning=false;
      if(patchQueued){patchQueued=false;schedulePatch()}
    }
  }

  function schedulePatch(){
    if(patchScheduled){patchQueued=true;return}
    patchScheduled=true;
    setTimeout(patch,0);
  }

  window.addEventListener('focus',()=>setTimeout(resumeOfficialWhatsAppSignup,250));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(resumeOfficialWhatsAppSignup,250)});
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('[data-screen="integrations"]')) setTimeout(schedulePatch,0);
  },true);

  const observer=new MutationObserver(()=>{
    if(integrationSurfaceActive()) schedulePatch();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-platform-ready']});
  setTimeout(()=>{void finishManualOauthReturn();if(integrationSurfaceActive())schedulePatch();resumeOfficialWhatsAppSignup()},200);
})();
(()=>{
  if(window.__dabbirTimezoneLoaded)return;
  window.__dabbirTimezoneLoaded=true;

  function currencyMinorUnits(currency){
    try{return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits??2}catch{return 2}
  }
  function currencyNameAr(currency){
    try{return new Intl.DisplayNames(['ar'],{type:'currency'}).of(currency)||currency}catch{return currency}
  }
  function businessGeo(){
    let business=null;
    try{business=workspace?.business||null}catch{}
    const countryCode=String(business?.country_code||document.documentElement.dataset.dabbirCountry||'AE').toUpperCase();
    const currency=String(business?.currency_code||document.documentElement.dataset.dabbirCurrency||'AED').toUpperCase();
    const timezone=String(business?.timezone||document.documentElement.dataset.dabbirTimezone||'Asia/Dubai');
    const prefix=String(business?.phone_country_prefix||'');
    return {countryCode,currency,timezone,prefix,moneyAr:currencyNameAr(currency),minorUnits:currencyMinorUnits(currency)};
  }

  function locale(){
    const geo=businessGeo();
    try{return typeof lang!=='undefined'&&lang==='en'?'en-'+geo.countryCode:'ar-'+geo.countryCode}catch{return document.documentElement.lang==='en'?'en-'+geo.countryCode:'ar-'+geo.countryCode}
  }

  function businessFormat(value){
    if(!value){
      try{return typeof T==='function'?T().unknown:'—'}catch{return '—'}
    }
    try{
      return new Intl.DateTimeFormat(locale(),{
        dateStyle:'medium',
        timeStyle:'short',
        timeZone:businessGeo().timezone,
      }).format(new Date(value));
    }catch{return String(value)}
  }

  function offsetMinutesAt(instantMs,timeZone){
    const date=new Date(instantMs);
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    return Math.round((represented-Math.floor(instantMs/1000)*1000)/60000);
  }

  function businessLocalToIso(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
      const absolute=new Date(raw);
      return Number.isNaN(absolute.getTime())?null:absolute.toISOString();
    }
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!match)return null;
    const [,year,month,day,hour,minute,second='00']=match;
    const wallUtc=Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute),Number(second));
    const zone=businessGeo().timezone;
    try{
      let offset=offsetMinutesAt(wallUtc,zone);
      let instant=wallUtc-offset*60000;
      const corrected=offsetMinutesAt(instant,zone);
      if(corrected!==offset)instant=wallUtc-corrected*60000;
      const date=new Date(instant);
      return Number.isNaN(date.getTime())?null:date.toISOString();
    }catch{return null}
  }

  function syncAuthorities(){
    const geo=businessGeo();
    window.__dabbirTimeZone=geo.timezone;
    window.dabbirFormatTime=businessFormat;
    window.dabbirLocalTimeToIso=businessLocalToIso;
    try{fmt=businessFormat}catch{}
    window.fmt=businessFormat;
    document.documentElement.dataset.dabbirCountry=geo.countryCode;
    document.documentElement.dataset.dabbirCurrency=geo.currency;
    document.documentElement.dataset.dabbirTimezone=geo.timezone;
  }
  syncAuthorities();

  const appointmentForm=document.querySelector('#appointmentForm');
  const appointmentModal=document.querySelector('#appointmentModal');
  const appointmentTime=document.querySelector('#apptTime');
  const appointmentFields={
    salon:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['specialist','text','الموظفة / المختصة','Specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر','Price'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات','Notes']],
    clinic:[['phone','tel','رقم الهاتف','Phone'],['service','text','نوع الموعد','Appointment type'],['specialist','text','الطبيب / المختص','Doctor / specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات إدارية','Administrative notes']],
    car_wash:[['phone','tel','رقم الهاتف','Phone'],['vehicle','text','نوع السيارة','Vehicle type'],['service','text','الخدمة / الباقة','Service / package'],['location','text','الموقع','Location'],['price','number','السعر','Price'],['notes','text','ملاحظات','Notes']],
    services:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['location','text','الموقع','Location'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر','Price'],['notes','text','ملاحظات','Notes']],
    other:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة / سبب الموعد','Service / purpose'],['notes','text','ملاحظات','Notes']],
  };

  function businessType(){
    try{return workspace?.business?.business_type||'other'}catch{return'other'}
  }
  function isArabic(){return document.documentElement.lang!=='en'}
  function fieldLabel(key,arLabel,enLabel){
    if(key!=='price')return isArabic()?arLabel:enLabel;
    const geo=businessGeo();
    return isArabic()?arLabel+' ('+geo.moneyAr+')':enLabel+' ('+geo.currency+')';
  }
  function renderAdaptiveFields(){
    if(!appointmentForm||!appointmentTime)return;
    syncAuthorities();
    appointmentForm.querySelector('#adaptiveApptFields')?.remove();
    const wrap=document.createElement('div');wrap.id='adaptiveApptFields';
    const optional=document.createElement('details');optional.id='adaptiveApptDetails';optional.className='field';
    const summary=document.createElement('summary');summary.textContent=isArabic()?'تفاصيل الموعد (اختياري)':'Appointment details (optional)';
    summary.style.cssText='cursor:pointer;min-height:44px;padding-block:12px;font-size:14px';
    optional.append(summary);
    const fields=appointmentFields[businessType()]||appointmentFields.other;
    const geo=businessGeo();
    for(const [key,type,arLabel,enLabel] of fields){
      const field=document.createElement('div');field.className='field';
      const label=document.createElement('label');label.textContent=fieldLabel(key,arLabel,enLabel);
      if(key==='phone')label.textContent+=isArabic()?' (اختياري)':' (optional)';
      let input;
      if(type==='select'){
        input=document.createElement('select');
        [['requested','بانتظار التأكيد','Pending'],['confirmed','مؤكد','Confirmed'],['cancelled','ملغي','Cancelled']].forEach(([value,arText,enText])=>{
          const option=document.createElement('option');option.value=value;option.textContent=isArabic()?arText:enText;input.append(option);
        });
      }else{
        input=document.createElement('input');input.type=type;
        if(type==='text')input.maxLength=500;
        if(type==='tel'){input.maxLength=40;input.placeholder=(geo.prefix||'+')+' …';input.inputMode='tel';}
        if(type==='number'){input.min='0';input.step=key==='price'?(geo.minorUnits===0?'1':'0.'+'0'.repeat(Math.max(0,geo.minorUnits-1))+'1'):'5';}
      }
      input.id='apptDetail-'+key;label.htmlFor=input.id;
      if(type==='tel'||type==='number')input.dir='ltr';
      input.dataset.apptKey=key;field.append(label,input);
      if(key==='phone')wrap.append(field);else optional.append(field);
    }
    wrap.append(optional);
    appointmentTime.closest('.field')?.after(wrap);
  }

  if(appointmentModal){
    new MutationObserver(()=>{if(appointmentModal.classList.contains('open'))renderAdaptiveFields()})
      .observe(appointmentModal,{attributes:true,attributeFilter:['class']});
  }

  function fixMobileHeaderSearch(){
    const buttons=[...document.querySelectorAll('.topActions > button,.topActions .iconBtn')];
    const button=buttons.find(node=>{
      const text=String(node.textContent||'').trim();
      const label=String(node.getAttribute('aria-label')||node.getAttribute('title')||'').toLowerCase();
      return text==='م'||text==='⌕'||label.includes('search')||label.includes('بحث');
    });
    if(!button||button.dataset.dabbirSearchIcon==='v1')return;
    button.dataset.dabbirSearchIcon='v1';
    button.setAttribute('aria-label',isArabic()?'بحث':'Search');
    button.setAttribute('title',isArabic()?'بحث':'Search');
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:21px;height:21px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>';
  }

  function ensureSettingsInMore(){
    const grid=document.querySelector('#screen-more .moreGrid');
    if(!grid)return;
    let card=grid.querySelector('[data-screen="settings"],#dabbirMoreSettingsAccess');
    if(!card){
      card=document.createElement('button');
      card.type='button';
      card.id='dabbirMoreSettingsAccess';
      card.className='moreCard';
      card.dataset.screen='settings';
      card.addEventListener('click',()=>{try{if(typeof showScreen==='function')showScreen('settings')}catch{}});
      grid.append(card);
    }
    card.hidden=false;card.classList.remove('hidden');card.style.removeProperty('display');
    const title=isArabic()?'الإعدادات':'Settings';
    const desc=isArabic()?'بيانات النشاط، السياسات، ساعات العمل والحساب.':'Business details, policies, hours and account.';
    if(card.id==='dabbirMoreSettingsAccess'||!card.querySelector('h3'))card.innerHTML='<h3>'+title+'</h3><p>'+desc+'</p>';
    card.setAttribute('aria-label',title);
  }

  function markOwnerCopilotAsAi(){
    const card=document.querySelector('#dabbirOwnerCopilot');
    if(!card)return;
    const mode=card.querySelector('.dcMode');
    if(mode){
      mode.textContent=isArabic()?'AI • بيانات موثقة':'AI • Verified data';
      mode.setAttribute('aria-label',isArabic()?'مساعد ذكاء اصطناعي مبني على بيانات النشاط الموثقة':'AI assistant grounded on verified business data');
    }
    const desc=card.querySelector('.dcHead p');
    if(desc)desc.textContent=isArabic()?'ذكاء اصطناعي يجيب عن أسئلتك اعتمادًا على بيانات نشاطك الموثقة فقط.':'AI answers your questions using your verified business data only.';
    card.dataset.aiAssistant='true';
  }

  function refreshMobileUtilityUi(){syncAuthorities();fixMobileHeaderSearch();ensureSettingsInMore();markOwnerCopilotAsAi()}
  const utilityObserver=new MutationObserver(()=>requestAnimationFrame(refreshMobileUtilityUi));
  if(document.body)utilityObserver.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',event=>{if(event.target?.closest?.('#menuBtn,[data-screen="more"],.topActions,#dabbirOwnerCopilot'))setTimeout(refreshMobileUtilityUi,0)},true);

  if(appointmentForm&&!appointmentForm.dataset.dabbirBusinessTime){
    appointmentForm.dataset.dabbirBusinessTime='v4-market';
    let appointmentSubmitting=false;
    let formRevision=0;
    const formObserver=appointmentModal?new MutationObserver(records=>{formRevision+=records.length;}):null;
    formObserver?.observe(appointmentModal,{attributes:true,attributeFilter:['class']});
    for(const eventName of ['input','change','reset'])appointmentForm.addEventListener(eventName,()=>{formRevision++;});
    const appointmentIntents=new Map();
    function currentContext(){
      const w=typeof workspace!=='undefined'?workspace:null;
      const scope=window.dabbirBranchContext?.scope?.()||w?.branch_scope||null;
      const actorId=String(w?.user?.id||'');
      const businessId=w?.business?.id||null;
      const branchId=scope?.mode==='all'?'all':scope?.branch_id||null;
      return {actorId,businessId,branchId,scope,key:JSON.stringify([actorId,businessId,branchId||'all',scope?.business_id||businessId])};
    }
    function draftState(){
      formRevision+=formObserver?.takeRecords().length||0;
      return JSON.stringify([formRevision,appointmentModal?.classList.contains('open')===true,
        document.querySelector('#apptCustomer')?.value,document.querySelector('#apptTime')?.value,
        [...appointmentForm.querySelectorAll('[data-appt-key]')].map(node=>[node.dataset.apptKey,node.value])]);
    }
    function saveError(payload){
      const message=isArabic()?payload?.message_ar:payload?.message_en;
      return typeof message==='string'&&message.length<=300?message:(isArabic()?'تعذر تأكيد حفظ الموعد. حاول مجددًا من النموذج نفسه.':'The save could not be confirmed. Retry from the same form.');
    }
    appointmentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      if(appointmentSubmitting)return;
      const input=document.querySelector('#apptTime');
      const customer=document.querySelector('#apptCustomer');
      const startsAt=businessLocalToIso(input&&input.value);
      if(!startsAt){
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Invalid time')}catch{}
        return;
      }
      const button=document.querySelector('#saveApptBtn');
      const idleLabel=button?.textContent;
      const wasDisabled=button?.disabled;
      const previousBusy=appointmentForm.getAttribute('aria-busy');
      let stillCurrent=null,busyLabel=null;
      appointmentSubmitting=true;
      appointmentForm.setAttribute('aria-busy','true');
      try{
        if(button){
          button.disabled=true;
          busyLabel=typeof T==='function'?T().savingWorking:(isArabic()?'جارٍ الحفظ…':'Saving…');
          button.textContent=busyLabel;
        }
        const context=currentContext();
        const businessId=context.businessId;
        if(!businessId)return;
        const branchScope=context.scope;
        if(branchScope?.business_id&&branchScope.business_id!==businessId){
          try{if(typeof toast==='function')toast(isArabic()?'تغيّر النشاط. حدّث الصفحة واختر الفرع قبل الحفظ.':'The business changed. Refresh the page and select the branch before saving.')}catch{}
          return;
        }
        const submittedDraft=draftState();
        const sameContext=()=>currentContext().key===context.key&&document.querySelector('#appointmentForm')===appointmentForm&&document.querySelector('#appointmentModal')===appointmentModal;
        stillCurrent=()=>sameContext()&&draftState()===submittedDraft;
        const details={};
        appointmentForm.querySelectorAll('[data-appt-key]').forEach(node=>{details[node.dataset.apptKey]=node.value});
        const booking={
          business_id:businessId,
          branch_id:context.branchId,
          business_type:businessType(),
          customer_name:String(customer&&customer.value||'').trim(),
          starts_at:startsAt,
          details,
        };
        const intent=JSON.stringify({actor_id:context.actorId,...booking});
        let requestKey=appointmentIntents.get(intent);
        if(!requestKey){
          requestKey=window.crypto?.randomUUID?.();
          if(!requestKey){
            try{if(typeof toast==='function')toast(isArabic()?'تعذر تجهيز طلب الحفظ. حدّث الصفحة وحاول مجددًا.':'The save request could not be prepared. Refresh the page and try again.')}catch{}
            return;
          }
          appointmentIntents.set(intent,requestKey);
        }
        const response=await fetch('/api/adaptive-appointment',{
          method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-dabbir-client':'web'},
          body:JSON.stringify({...booking,idempotency_key:requestKey})
        });
        const payload=await response.json().catch(()=>({}));
        // A late result belongs to the original draft. Keep its request key so
        // returning to that draft can read back the saved result without a write.
        if(!stillCurrent())return;
        if(!response.ok||!payload?.ok||!payload.appointment?.id){
          try{if(typeof toast==='function')toast(saveError(payload))}catch{}
          return;
        }
        appointmentIntents.delete(intent);
        document.querySelector('#appointmentModal')?.classList.remove('open');
        appointmentForm.reset();
        try{if(typeof toast==='function')toast(typeof T==='function'?T().saved:'Saved')}catch{}
        const refreshedDraft=draftState();
        const conversationId=typeof selectedConversationId!=='undefined'?selectedConversationId:null;
        stillCurrent=()=>sameContext()&&draftState()===refreshedDraft&&(typeof selectedConversationId!=='undefined'?selectedConversationId:null)===conversationId;
        try{
          if(typeof loadRuntime==='function')await loadRuntime(businessId,conversationId,{isCurrent:stillCurrent});
        }catch{
          try{if(stillCurrent()&&typeof toast==='function')toast(isArabic()?'تم حفظ الموعد، لكن تعذر تحديث القائمة. حدّث الصفحة لعرضه.':'The appointment was saved, but the list could not refresh. Refresh the page to view it.')}catch{}
        }
      }catch{
        try{if((!stillCurrent||stillCurrent())&&typeof toast==='function')toast(saveError())}catch{}
      }finally{
        appointmentSubmitting=false;
        if(button){button.disabled=wasDisabled;if(button.textContent===busyLabel)button.textContent=idleLabel;}
        if(previousBusy===null)appointmentForm.removeAttribute('aria-busy');
        else appointmentForm.setAttribute('aria-busy',previousBusy);
      }
    },true);
  }

  syncAuthorities();
  setTimeout(()=>{
    syncAuthorities();
    try{if(typeof workspace!=='undefined'&&workspace&&typeof renderAll==='function')renderAll()}catch{}
    refreshMobileUtilityUi();
  },0);
  setTimeout(refreshMobileUtilityUi,500);
})();
(()=>{
  if(window.__dabbirBusinessWorkspaces)return;
  window.__dabbirBusinessWorkspaces='v3-owner-control';
  const MARKETS={"AE":{"country_code":"AE","currency":"AED","minorUnits":2,"timezone":"Asia/Dubai","offset":"+04:00","prefix":"+971","vatStatus":"implemented","vatRate":5,"ar":"الإمارات العربية المتحدة","en":"United Arab Emirates","moneyAr":"درهم"},"SA":{"country_code":"SA","currency":"SAR","minorUnits":2,"timezone":"Asia/Riyadh","offset":"+03:00","prefix":"+966","vatStatus":"implemented","vatRate":15,"ar":"السعودية","en":"Saudi Arabia","moneyAr":"ريال سعودي"},"KW":{"country_code":"KW","currency":"KWD","minorUnits":3,"timezone":"Asia/Kuwait","offset":"+03:00","prefix":"+965","vatStatus":"not_implemented","vatRate":null,"ar":"الكويت","en":"Kuwait","moneyAr":"دينار كويتي"},"QA":{"country_code":"QA","currency":"QAR","minorUnits":2,"timezone":"Asia/Qatar","offset":"+03:00","prefix":"+974","vatStatus":"not_implemented","vatRate":null,"ar":"قطر","en":"Qatar","moneyAr":"ريال قطري"},"BH":{"country_code":"BH","currency":"BHD","minorUnits":3,"timezone":"Asia/Bahrain","offset":"+03:00","prefix":"+973","vatStatus":"implemented","vatRate":10,"ar":"البحرين","en":"Bahrain","moneyAr":"دينار بحريني"},"OM":{"country_code":"OM","currency":"OMR","minorUnits":3,"timezone":"Asia/Muscat","offset":"+04:00","prefix":"+968","vatStatus":"implemented","vatRate":5,"ar":"عُمان","en":"Oman","moneyAr":"ريال عماني"}};
  const ACTIVE_KEY='dabbir_active_business_id';
  let portfolio=null,loading=false,menuOpen=false;
  const style=document.createElement('style');
  style.dataset.dabbirBusinessWorkspaces='v3-owner-control';
  style.textContent="\n.dbwSwitch{margin-top:9px}.dbwSwitchBtn{width:100%;min-height:42px;border:1px solid #30363d;background:#1b1e22;color:#fff;border-radius:11px;padding:8px 10px;display:flex;align-items:center;gap:8px;text-align:start}.dbwSwitchBtn .grow{min-width:0;flex:1}.dbwSwitchBtn b{display:block;font-size:10px}.dbwSwitchBtn small{display:block;margin-top:2px;color:#8f969e;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbwMenu{display:none;margin-top:6px;border:1px solid #30363d;background:#111315;border-radius:12px;padding:6px;max-height:300px;overflow:auto}.dbwMenu.open{display:block}.dbwMenu button{width:100%;min-height:43px;border:0;background:transparent;color:#dfe3e7;border-radius:9px;padding:8px;text-align:start}.dbwMenu button:hover,.dbwMenu button.current{background:#1f2327}.dbwMenu button b{display:block;font-size:10px}.dbwMenu button small{display:block;color:#858c94;font-size:8px;margin-top:2px}.dbwMenu .action{color:var(--accent);font-weight:900}.dbwDivider{height:1px;background:#272c31;margin:5px 2px}.dbwMobile{display:none;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:11px;width:40px;height:40px;min-height:40px;padding:0;font-weight:950}.dbwSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.dbwSummary .card span{display:block;color:var(--muted);font-size:9px}.dbwSummary .card strong{display:block;font-size:22px;margin-top:7px}.dbwGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.dbwBusiness{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:17px;padding:14px}.dbwBusiness.current{border-color:#65772f}.dbwHead{display:flex;align-items:flex-start;gap:9px}.dbwHead .grow{min-width:0;flex:1}.dbwHead h3{margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbwType,.dbwCurrent,.dbwBranch{display:inline-flex;border-radius:999px;font-size:8px;padding:5px 8px}.dbwType{margin-top:5px;background:#23272c;color:#b7bdc4}.dbwCurrent{background:#233019;color:var(--accent);font-weight:900}.dbwMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:12px}.dbwMetric{border:1px solid #272c31;background:#171a1d;border-radius:11px;padding:8px}.dbwMetric span{display:block;font-size:7px;color:#858c94}.dbwMetric strong{display:block;font-size:13px;margin-top:4px}.dbwBranches{border-top:1px solid #252a30;margin-top:11px;padding-top:10px}.dbwBranchesHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.dbwBranchesHead b{font-size:9px}.dbwMini{border:1px solid #343a41;background:#191d21;color:#fff;border-radius:9px;min-height:32px;padding:5px 8px;font-size:8px;font-weight:850}.dbwMini.danger,.dbwDanger{border-color:#5c3034;background:#281719;color:#ffb4ba}.dbwBranchList{display:grid;gap:6px;margin-top:8px}.dbwBranchItem{display:flex;align-items:center;gap:5px;min-width:0}.dbwBranchItem .dbwBranch{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dbwBranch{border:1px solid #2d3238;background:#15181b;color:#bfc5cb}.dbwBranch.primary{border-color:#4c592d;color:#dbeab0}.dbwBranchTools{display:flex;gap:4px}.dbwActions{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}.dbwActions button{flex:1;min-width:90px}.dbwEmpty{border:1px dashed #333940;border-radius:16px;padding:26px;text-align:center;color:var(--muted);font-size:10px}.dbwHeroActions{display:flex;gap:8px}.dbwForm{display:grid;grid-template-columns:1fr 1fr;gap:9px}.dbwForm .wide{grid-column:1/-1;margin-top:0}.dbwForm .field{margin-top:0}.dbwMsg{min-height:20px;color:var(--yellow);font-size:9px;margin-top:7px}.dbwMoney{font-variant-numeric:tabular-nums}\n@media(max-width:920px){.dbwGrid{grid-template-columns:1fr}.dbwSummary{grid-template-columns:repeat(2,1fr)}}\n@media(max-width:700px){.dbwMobile{display:inline-grid;place-items:center}.dbwMetrics{grid-template-columns:repeat(2,1fr)}.dbwForm{grid-template-columns:1fr}.dbwForm .wide{grid-column:auto}.dbwHeroActions{width:100%}.dbwHeroActions button{flex:1}.dbwSummary{gap:7px}.dbwSummary .card{padding:11px}.dbwSummary .card strong{font-size:18px}.dbwBranchItem{align-items:flex-start}.dbwBranchTools{flex-direction:column}.dbwMini{min-height:36px}.dbwActions button{min-height:44px}}\n";
  document.head.append(style);

  function ar(){try{return typeof lang!=='undefined'?lang!=='en':document.documentElement.lang!=='en'}catch{return true}}
  function text(){return ar()?{
    my:'أعمالي',switcher:'تبديل النشاط',manage:'إدارة كل الأنشطة',addBusiness:'إضافة نشاط',addBranch:'إضافة فرع',edit:'تعديل',delete:'حذف',editBusiness:'تعديل النشاط',editBranch:'تعديل الفرع',open:'فتح النشاط',current:'الحالي',businesses:'الأنشطة',branches:'الفروع',customers:'العملاء',appointments:'مواعيد اليوم',orders:'طلبات اليوم',revenue:'دخل اليوم',title:'كل أعمالي',desc:'حساب واحد لكل أنشطتك. المالك يملك صلاحية كاملة على مساحته وفروعه.',moreDesc:'عرض كل أنشطتك وفروعك وإدارتها والتبديل بينها من حساب واحد.',empty:'لا توجد أنشطة مرتبطة بهذا الحساب.',businessName:'اسم النشاط',businessType:'نوع النشاط',country:'دولة النشاط',branchName:'اسم الفرع',phone:'رقم الهاتف',address:'العنوان / المنطقة',save:'حفظ',cancel:'إلغاء',working:'جارٍ الحفظ…',created:'تم إنشاء النشاط',businessUpdated:'تم تعديل النشاط',businessDeleted:'تم حذف النشاط',branchCreated:'تمت إضافة الفرع',branchUpdated:'تم تعديل الفرع',branchDeleted:'تم حذف الفرع',failed:'تعذر إكمال العملية',primary:'رئيسي',select:'اختر نشاطًا',branchWord:'فرع',deleteBusinessConfirm:'هل تريد حذف هذا النشاط نهائيًا من حسابك؟ يجب إلغاء الاشتراك المدفوع أولًا إن كان نشطًا.',deleteBranchConfirm:'هل تريد حذف هذا الفرع من النشاط؟ سيبقى السجل السابق محفوظًا.',billingDeleteBlocked:'ألغِ اشتراك هذا النشاط أولًا، ثم يمكن حذفه.',types:{clinic:'عيادة',store:'متجر',creator:'مشهور / صانع محتوى',salon:'صالون',real_estate:'عقارات',services:'خدمات',car_wash:'غسيل سيارات متنقل',laundry:'مغسلة',other:'أخرى'}
  }:{
    my:'My businesses',switcher:'Switch business',manage:'Manage all businesses',addBusiness:'Add business',addBranch:'Add branch',edit:'Edit',delete:'Delete',editBusiness:'Edit business',editBranch:'Edit branch',open:'Open business',current:'Current',businesses:'Businesses',branches:'Branches',customers:'Customers',appointments:'Today appointments',orders:'Today orders',revenue:'Today revenue',title:'All my businesses',desc:'One account for all your businesses. Owners have full authority over their workspace and branches.',moreDesc:'View, manage, and switch every business and branch from one account.',empty:'No businesses are linked to this account.',businessName:'Business name',businessType:'Business type',country:'Business country',branchName:'Branch name',phone:'Phone',address:'Address / area',save:'Save',cancel:'Cancel',working:'Saving…',created:'Business created',businessUpdated:'Business updated',businessDeleted:'Business deleted',branchCreated:'Branch added',branchUpdated:'Branch updated',branchDeleted:'Branch deleted',failed:'Could not complete the operation',primary:'Primary',select:'Choose a business',branchWord:'branch',deleteBusinessConfirm:'Delete this business from your account? Any active paid subscription must be cancelled first.',deleteBranchConfirm:'Delete this branch from the business? Previous history will be preserved.',billingDeleteBlocked:'Cancel this business subscription first, then it can be deleted.',types:{clinic:'Clinic',store:'Store',creator:'Creator',salon:'Salon',real_estate:'Real estate',services:'Services',car_wash:'Mobile car wash',laundry:'Laundry',other:'Other'}
  }}
  function esc(v){return String(v??'').replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]})}
  function typeName(v){var t=text();return t.types[String(v||'').toLowerCase()]||t.types.other}
  function activeId(){try{return workspace&&workspace.business?workspace.business.id:null}catch{return null}}
  function money(v){var n=Number(v||0);try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{maximumFractionDigits:2}).format(n)+' '+(ar()?'د.إ':'AED')}catch{return n.toFixed(2)+' AED'}}
  function tell(v){try{if(typeof toast==='function')return toast(v)}catch{};console.info(v)}
  async function req(url,options){options=options||{};var headers=Object.assign({'content-type':'application/json','x-dabbir-client':'web'},options.headers||{});try{var r=await fetch(url,Object.assign({cache:'no-store'},options,{headers:headers}));var j=await r.json().catch(function(){return {}});return {r:r,j:j}}catch{return {r:{ok:false,status:0},j:{ok:false,error:'NETWORK_ERROR'}}}}
  async function getPortfolio(force){if(portfolio&&!force)return portfolio;if(loading)return portfolio;loading=true;try{var out=await req('/api/business-portfolio');if(out.r.ok&&out.j.ok)portfolio=out.j;return portfolio}finally{loading=false}}
  function addDictionary(){try{if(typeof D==='object'){if(D.ar)D.ar['business-portfolio']='أعمالي';if(D.en)D.en['business-portfolio']='My businesses'}}catch{}}

  function ensureScreen(){var content=document.querySelector('.content');if(!content)return null;var s=document.querySelector('#screen-business-portfolio');if(!s){s=document.createElement('section');s.className='screen';s.id='screen-business-portfolio';s.innerHTML='<div class="hero"><div><h1 id="dbwTitle"></h1><p id="dbwDesc"></p></div><div class="dbwHeroActions"><button type="button" class="primary" id="dbwAddBusiness"></button></div></div><div class="dbwSummary" id="dbwSummary"></div><div class="dbwGrid" id="dbwGrid"></div>';content.append(s);s.querySelector('#dbwAddBusiness').addEventListener('click',function(){openModal('business-create')})}return s}
  function ensureEntry(){var grid=document.querySelector('#screen-more .moreGrid');if(grid&&!grid.querySelector('#dbwMoreCard')){var card=document.createElement('button');card.type='button';card.id='dbwMoreCard';card.className='moreCard';card.innerHTML='<h3 id="dbwMoreTitle"></h3><p id="dbwMoreDesc"></p>';card.addEventListener('click',showPortfolio);grid.prepend(card)}var top=document.querySelector('.topActions');if(top&&!top.querySelector('#dbwMobile')){var m=document.createElement('button');m.type='button';m.id='dbwMobile';m.className='dbwMobile';m.textContent='▦';m.addEventListener('click',showPortfolio);top.prepend(m)}}
  function ensureSwitch(){var box=document.querySelector('.side .workspace');if(!box)return null;var w=box.querySelector('#dbwSwitch');if(!w){w=document.createElement('div');w.id='dbwSwitch';w.className='dbwSwitch';w.innerHTML='<button type="button" class="dbwSwitchBtn" id="dbwSwitchBtn" aria-expanded="false"><span class="grow"><b id="dbwSwitchLabel"></b><small id="dbwSwitchValue"></small></span><span>⌄</span></button><div class="dbwMenu" id="dbwMenu"></div>';box.append(w);w.querySelector('#dbwSwitchBtn').addEventListener('click',function(){menuOpen=!menuOpen;renderSwitch()})}return w}

  async function switchBusiness(id){id=String(id||'');if(!id||id===activeId()){menuOpen=false;renderSwitch();return}if(!(portfolio&&portfolio.businesses||[]).some(function(b){return b.id===id}))return;try{localStorage.setItem(ACTIVE_KEY,id)}catch{}menuOpen=false;if(typeof loadRuntime==='function')await loadRuntime(id);renderSwitch();renderPortfolio()}
  function renderSwitch(){var w=ensureSwitch();if(!w)return;var t=text(),id=activeId(),current=(portfolio&&portfolio.businesses||[]).find(function(b){return b.id===id});w.querySelector('#dbwSwitchLabel').textContent=t.switcher;w.querySelector('#dbwSwitchValue').textContent=current?current.name:t.select;var menu=w.querySelector('#dbwMenu');menu.classList.toggle('open',menuOpen);w.querySelector('#dbwSwitchBtn').setAttribute('aria-expanded',String(menuOpen));var rows=(portfolio&&portfolio.businesses||[]).map(function(b){return '<button type="button" class="'+(b.id===id?'current':'')+'" data-dbw-id="'+esc(b.id)+'"><b>'+esc(b.name)+'</b><small>'+esc(typeName(b.business_type))+' • '+esc((b.branches||[]).length)+' '+esc(t.branchWord)+'</small></button>'}).join('');menu.innerHTML=rows+'<div class="dbwDivider"></div><button type="button" class="action" id="dbwManage">▦ '+esc(t.manage)+'</button><button type="button" class="action" id="dbwAddFromMenu">＋ '+esc(t.addBusiness)+'</button>';menu.querySelectorAll('[data-dbw-id]').forEach(function(n){n.addEventListener('click',function(){switchBusiness(n.dataset.dbwId)})});menu.querySelector('#dbwManage').addEventListener('click',function(){menuOpen=false;showPortfolio()});menu.querySelector('#dbwAddFromMenu').addEventListener('click',function(){menuOpen=false;openModal('business-create')})}

  function renderPortfolio(){var s=ensureScreen();if(!s)return;var t=text(),data=portfolio||{businesses:[],summary:{}},sum=data.summary||{},id=activeId();s.querySelector('#dbwTitle').textContent=t.title;s.querySelector('#dbwDesc').textContent=t.desc;s.querySelector('#dbwAddBusiness').textContent='＋ '+t.addBusiness;var summary=[[t.businesses,sum.businesses||0],[t.branches,sum.branches||0],[t.appointments,sum.appointments_today||0],[t.revenue,money(sum.revenue_today_aed||0)]];s.querySelector('#dbwSummary').innerHTML=summary.map(function(x){return '<div class="card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>'}).join('');var grid=s.querySelector('#dbwGrid');if(!(data.businesses||[]).length){grid.innerHTML='<div class="dbwEmpty">'+esc(t.empty)+'</div>';return}grid.innerHTML=data.businesses.map(function(b){var current=b.id===id,m=b.metrics||{},branches=b.branches||[],can=b.membership&&b.membership.can_manage_business===true,isOwner=b.membership&&b.membership.is_owner===true;var branchHtml=branches.length?branches.map(function(branch){return '<div class="dbwBranchItem"><span class="dbwBranch '+(branch.is_primary?'primary':'')+'">'+esc(branch.name)+(branch.is_primary?' • '+esc(t.primary):'')+'</span>'+(can?'<span class="dbwBranchTools"><button type="button" class="dbwMini" data-dbw-edit-branch="'+esc(branch.id)+'" data-dbw-business="'+esc(b.id)+'">'+esc(t.edit)+'</button><button type="button" class="dbwMini danger" data-dbw-delete-branch="'+esc(branch.id)+'" data-dbw-business="'+esc(b.id)+'">'+esc(t.delete)+'</button></span>':'')+'</div>'}).join(''):'<span class="dbwBranch">—</span>';return '<article class="dbwBusiness '+(current?'current':'')+'"><div class="dbwHead"><div class="grow"><h3>'+esc(b.name)+'</h3><span class="dbwType">'+esc(typeName(b.business_type))+'</span></div>'+(current?'<span class="dbwCurrent">'+esc(t.current)+'</span>':'')+'</div><div class="dbwMetrics"><div class="dbwMetric"><span>'+esc(t.customers)+'</span><strong>'+esc(m.customers_total||0)+'</strong></div><div class="dbwMetric"><span>'+esc(t.appointments)+'</span><strong>'+esc(m.appointments_today||0)+'</strong></div><div class="dbwMetric"><span>'+esc(t.orders)+'</span><strong>'+esc(m.orders_today||0)+'</strong></div><div class="dbwMetric"><span>'+esc(t.revenue)+'</span><strong class="dbwMoney">'+esc(money(m.revenue_today_aed||0))+'</strong></div></div><div class="dbwBranches"><div class="dbwBranchesHead"><b>'+esc(t.branches)+'</b>'+(can?'<button type="button" class="dbwMini" data-dbw-branch="'+esc(b.id)+'">＋ '+esc(t.addBranch)+'</button>':'')+'</div><div class="dbwBranchList">'+branchHtml+'</div></div><div class="dbwActions">'+(current?'<button type="button" class="secondary" disabled>'+esc(t.current)+'</button>':'<button type="button" class="primary" data-dbw-open="'+esc(b.id)+'">'+esc(t.open)+'</button>')+(can?'<button type="button" class="secondary" data-dbw-edit-business="'+esc(b.id)+'">'+esc(t.edit)+'</button>':'')+(isOwner?'<button type="button" class="secondary dbwDanger" data-dbw-delete-business="'+esc(b.id)+'">'+esc(t.delete)+'</button>':'')+'</div></article>'}).join('');grid.querySelectorAll('[data-dbw-open]').forEach(function(n){n.addEventListener('click',function(){switchBusiness(n.dataset.dbwOpen)})});grid.querySelectorAll('[data-dbw-branch]').forEach(function(n){n.addEventListener('click',function(){openModal('branch-create',n.dataset.dbwBranch)})});grid.querySelectorAll('[data-dbw-edit-business]').forEach(function(n){n.addEventListener('click',function(){var b=(portfolio.businesses||[]).find(function(x){return x.id===n.dataset.dbwEditBusiness});openModal('business-edit',n.dataset.dbwEditBusiness,b)})});grid.querySelectorAll('[data-dbw-delete-business]').forEach(function(n){n.addEventListener('click',function(){deleteBusiness(n.dataset.dbwDeleteBusiness)})});grid.querySelectorAll('[data-dbw-edit-branch]').forEach(function(n){n.addEventListener('click',function(){var b=(portfolio.businesses||[]).find(function(x){return x.id===n.dataset.dbwBusiness}),branch=(b&&b.branches||[]).find(function(x){return x.id===n.dataset.dbwEditBranch});openModal('branch-edit',n.dataset.dbwBusiness,branch)})});grid.querySelectorAll('[data-dbw-delete-branch]').forEach(function(n){n.addEventListener('click',function(){deleteBranch(n.dataset.dbwBusiness,n.dataset.dbwDeleteBranch)})})}
  function refresh(){ensureEntry();ensureSwitch();ensureScreen();var t=text();var title=document.querySelector('#dbwMoreTitle'),desc=document.querySelector('#dbwMoreDesc');if(title)title.textContent=t.my;if(desc)desc.textContent=t.moreDesc;var mobile=document.querySelector('#dbwMobile');if(mobile){mobile.title=t.my;mobile.setAttribute('aria-label',t.my)}renderSwitch();renderPortfolio()}
  async function showPortfolio(){await getPortfolio(false);addDictionary();refresh();if(typeof showScreen==='function')showScreen('business-portfolio');var p=document.querySelector('#pageTitle');if(p)p.textContent=text().my;document.querySelector('#side')?.classList.remove('open')}

  function openModal(kind,businessId,entity){document.querySelector('#dbwModal')?.remove();var t=text(),business=kind.indexOf('business')===0,editing=kind.indexOf('-edit')>0,modal=document.createElement('div');modal.id='dbwModal';modal.className='modal open';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');var businessFields='<div class="field wide"><label for="dbwName">'+esc(t.businessName)+'</label><input id="dbwName" maxlength="120" required></div><div class="field wide"><label for="dbwType">'+esc(t.businessType)+'</label><select id="dbwType"><option value="salon">'+esc(t.types.salon)+'</option><option value="clinic">'+esc(t.types.clinic)+'</option><option value="car_wash">'+esc(t.types.car_wash)+'</option><option value="store">'+esc(t.types.store)+'</option><option value="services">'+esc(t.types.services)+'</option><option value="laundry">'+esc(t.types.laundry)+'</option><option value="real_estate">'+esc(t.types.real_estate)+'</option><option value="creator">'+esc(t.types.creator)+'</option><option value="other">'+esc(t.types.other)+'</option></select></div>';if(kind==='business-create')businessFields+='<div class="field wide"><label for="dbwCountry">'+esc(t.country)+'</label><select id="dbwCountry" required autocomplete="country">'+Object.entries(MARKETS).map(function(entry){return '<option value="'+esc(entry[0])+'">'+esc(ar()?entry[1].ar:entry[1].en)+' · '+esc(entry[1].currency)+'</option>'}).join('')+'</select></div>';var branchFields='<div class="field wide"><label>'+esc(t.branchName)+'</label><input id="dbwBranchName" maxlength="120" required></div><div class="field"><label>'+esc(t.phone)+'</label><input id="dbwBranchPhone" maxlength="40" inputmode="tel"></div><div class="field"><label>'+esc(t.address)+'</label><input id="dbwBranchAddress" maxlength="500"></div>';var title=business?(editing?t.editBusiness:t.addBusiness):(editing?t.editBranch:t.addBranch);modal.innerHTML='<form class="modalBox" id="dbwForm"><h3>'+esc(title)+'</h3><div class="dbwForm">'+(business?businessFields:branchFields)+'</div><div class="dbwMsg" id="dbwMsg"></div><div class="modalActions"><button type="button" class="secondary" id="dbwCancel">'+esc(t.cancel)+'</button><button type="submit" class="primary" id="dbwSave">'+esc(t.save)+'</button></div></form>';document.body.append(modal);if(editing&&business){modal.querySelector('#dbwName').value=entity?.name||'';modal.querySelector('#dbwType').value=entity?.business_type||'other'}if(editing&&!business){modal.querySelector('#dbwBranchName').value=entity?.name||'';modal.querySelector('#dbwBranchPhone').value=entity?.phone_e164||'';modal.querySelector('#dbwBranchAddress').value=entity?.address_text||''}modal.querySelector('#dbwCancel').addEventListener('click',function(){modal.remove()});modal.addEventListener('click',function(ev){if(ev.target===modal)modal.remove()});modal.querySelector('#dbwForm').addEventListener('submit',function(ev){submitModal(ev,kind,businessId,entity)});setTimeout(function(){modal.querySelector(business?'#dbwName':'#dbwBranchName')?.focus()},0)}
  async function submitModal(ev,kind,businessId,entity){ev.preventDefault();var modal=document.querySelector('#dbwModal'),save=modal?.querySelector('#dbwSave'),msg=modal?.querySelector('#dbwMsg'),t=text();if(!modal||!save||save.disabled)return;save.disabled=true;save.textContent=t.working;if(msg)msg.textContent='';try{if(kind==='business-create'){var name=String(modal.querySelector('#dbwName')?.value||'').trim(),type=String(modal.querySelector('#dbwType')?.value||'other');if(typeof window.__dabbirCreateBusinessSafely!=='function'){if(msg)msg.textContent=t.failed;return}var out=await window.__dabbirCreateBusinessSafely({action:'create_business',name:name,business_type:type,country_code:String(modal.querySelector('#dbwCountry')?.value||'AE'),locale:ar()?'ar-AE':'en-AE'},{statusElement:msg,onChange:function(){save.textContent=window.__dabbirBusinessCreationLabel?.()||t.save}});if(!out.ok||!out.business_id)return;portfolio=null;await getPortfolio(true);try{localStorage.setItem(ACTIVE_KEY,out.business_id)}catch{}modal.remove();tell(t.created)}else if(kind==='business-edit'){var editName=String(modal.querySelector('#dbwName')?.value||'').trim(),editType=String(modal.querySelector('#dbwType')?.value||'other');var editOut=await req('/api/business-portfolio',{method:'POST',body:JSON.stringify({action:'update_business',business_id:businessId,name:editName,business_type:editType})});if(!editOut.r.ok||!editOut.j.ok){if(msg)msg.textContent=editOut.j.error||t.failed;return}portfolio=null;await getPortfolio(true);modal.remove();tell(t.businessUpdated);if(businessId===activeId()&&typeof loadRuntime==='function')await loadRuntime(businessId)}else{var branch=String(modal.querySelector('#dbwBranchName')?.value||'').trim(),phone=String(modal.querySelector('#dbwBranchPhone')?.value||'').trim(),address=String(modal.querySelector('#dbwBranchAddress')?.value||'').trim(),action=kind==='branch-edit'?'update_branch':'create_branch';var result=await req('/api/business-portfolio',{method:'POST',body:JSON.stringify({action:action,business_id:businessId,branch_id:entity?.id||null,name:branch,phone_e164:phone,address_text:address,timezone:entity?.timezone||'Asia/Dubai'})});if(!result.r.ok||!result.j.ok){if(msg)msg.textContent=result.j.error||t.failed;return}portfolio=null;await getPortfolio(true);modal.remove();tell(kind==='branch-edit'?t.branchUpdated:t.branchCreated)}refresh()}finally{if(document.body.contains(save)){save.disabled=false;save.textContent=kind==='business-create'?(window.__dabbirBusinessCreationLabel?.()||t.save):t.save}}}

  async function deleteBranch(businessId,branchId){var t=text();if(!window.confirm(t.deleteBranchConfirm))return;var out=await req('/api/business-portfolio',{method:'POST',body:JSON.stringify({action:'delete_branch',business_id:businessId,branch_id:branchId})});if(!out.r.ok||!out.j.ok){tell(out.j.error||t.failed);return}portfolio=null;await getPortfolio(true);tell(t.branchDeleted);refresh()}
  async function deleteBusiness(businessId){var t=text();if(!window.confirm(t.deleteBusinessConfirm))return;var out=await req('/api/business-portfolio',{method:'POST',body:JSON.stringify({action:'delete_business',business_id:businessId})});if(!out.r.ok||!out.j.ok){tell(out.j.error==='CANCEL_SUBSCRIPTION_BEFORE_BUSINESS_DELETE'?t.billingDeleteBlocked:(out.j.error||t.failed));return}var wasCurrent=businessId===activeId();portfolio=null;await getPortfolio(true);tell(t.businessDeleted);if(wasCurrent){var next=(portfolio?.businesses||[])[0]?.id||null;if(next){try{localStorage.setItem(ACTIVE_KEY,next)}catch{}if(typeof loadRuntime==='function')await loadRuntime(next)}else{try{localStorage.removeItem(ACTIVE_KEY)}catch{};window.location.reload();return}}refresh()}

  async function restore(){var saved=null;try{saved=localStorage.getItem(ACTIVE_KEY)}catch{}if(!saved||saved===activeId())return;if((portfolio&&portfolio.businesses||[]).some(function(b){return b.id===saved}))await switchBusiness(saved)}
  function patchRuntime(){try{if(typeof loadRuntime!=='function'||loadRuntime.__dbw)return;var original=loadRuntime;var wrapped=async function(businessId,conversationId){var result=await original.apply(this,arguments);var id=activeId();if(id){try{localStorage.setItem(ACTIVE_KEY,id)}catch{}}setTimeout(function(){renderSwitch();renderPortfolio()},0);return result};wrapped.__dbw=true;loadRuntime=wrapped}catch{}}
  async function init(){addDictionary();ensureEntry();ensureSwitch();ensureScreen();patchRuntime();await getPortfolio(true);await restore();refresh()}
  document.addEventListener('click',function(ev){if(menuOpen&&!ev.target?.closest?.('#dbwSwitch')){menuOpen=false;renderSwitch()}},true);
  new MutationObserver(function(){requestAnimationFrame(function(){ensureEntry();ensureSwitch()})}).observe(document.body,{childList:true,subtree:true});
  new MutationObserver(function(){refresh()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(init,0);setTimeout(init,700);
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
      '<div class="crmToolbar"><input id="crmSearch" aria-label="'+escapeHtml(t.search)+'" value="'+escapeHtml(state.query)+'" placeholder="'+escapeHtml(t.search)+'"><select id="crmFilter" aria-label="'+escapeHtml(t.all)+'"><option value="all">'+escapeHtml(t.all)+'</option><option value="new">'+escapeHtml(t.newStatus)+'</option><option value="repeat">'+escapeHtml(t.repeatStatus)+'</option><option value="inactive">'+escapeHtml(t.inactiveStatus)+'</option></select><select id="crmSort" aria-label="'+escapeHtml(t.sortLatest)+'"><option value="latest">'+escapeHtml(t.sortLatest)+'</option><option value="activity">'+escapeHtml(t.sortActivity)+'</option><option value="name">'+escapeHtml(t.sortName)+'</option></select></div>'+
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
  if(window.__dabbirHumanChatUiLoaded)return;
  window.__dabbirHumanChatUiLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirChatUi='v3-readable';
  style.textContent=[
    '#newChatBtn{display:none!important}',
    '.dabbirChatControl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.dabbirOwnerChip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 10px;font-size:12px;line-height:1.4;font-weight:900;border:1px solid #31363c;background:#171a1d;color:#c8cdd3}',
    '.dabbirOwnerChip:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.9;flex:0 0 7px}',
    '.dabbirOwnerChip.ai{border-color:#3d4b27;background:#202918;color:#bfe977}',
    '.dabbirOwnerChip.human{border-color:#244a66;background:#132737;color:#9bd2ff}',
    '.dabbirOwnerChip.action{border-color:#665527;background:#332b16;color:#ffd87a}',
    '.dabbirTakeover{min-height:44px!important;padding:9px 12px!important;border-radius:11px!important;font-size:12px!important;line-height:1.35!important;white-space:nowrap}',
    '.dabbirTakeover.take{border:1px solid #52652c;background:#26331a;color:#d7ff5f;font-weight:900}',
    '.dabbirTakeover.return{border:1px solid #35546b;background:#172b3a;color:#b6dcff;font-weight:900}',
    '#screen-conversations .chatPanel{background:linear-gradient(180deg,#111315,#0d0f11)}',
    '#screen-conversations .chatHead{background:#121416}',
    '#screen-conversations #translateAll{border:1px solid #30363d!important;background:#181b1f!important;color:#d8dde2!important;border-radius:10px!important;font-size:12px!important;padding:9px 11px!important;min-height:44px!important}',
    '#screen-conversations .messages{scrollbar-width:thin;scrollbar-color:#31363c transparent}',
    '#screen-conversations .msgrow{margin:12px 0}',
    '#screen-conversations .bubble{max-width:min(78%,560px);box-shadow:none}',
    '#screen-conversations .bubble .body{font-size:13px;line-height:1.65}',
    '#screen-conversations .bubble .original{font-size:11px;line-height:1.55;opacity:.78}',
    '#screen-conversations .meta{margin-top:7px;gap:6px;font-size:11px;line-height:1.4}',
    '#screen-conversations .meta button{min-height:44px!important;padding:6px 7px!important;font-size:11px!important}',
    '.compose.dabbirHumanLocked{opacity:1!important;background:#0f1210;border-top-color:#242a22!important}',
    '.compose.dabbirHumanLocked input{cursor:not-allowed;background:#141814!important;border-color:#252d22!important;color:#a7b09e!important;text-align:center;font-size:12px}',
    '.compose.dabbirHumanLocked #sendBtn{display:none!important}',
    '.dabbirSenderLabel{font-size:11px;line-height:1.4;font-weight:900;margin:0 6px 5px;color:#9ba2aa;letter-spacing:.01em}',
    '.msgrow.customer .bubble{margin-right:auto!important;margin-left:0!important;background:#191c20!important;border-color:#30353b!important}',
    '.msgrow.customer .dabbirSenderLabel{margin-right:auto!important;margin-left:6px!important}',
    '.msgrow.ai .bubble{margin-left:auto!important;margin-right:0!important;background:#202817!important;border-color:#3a4827!important}',
    '.msgrow.ai .dabbirSenderLabel{margin-left:auto!important;margin-right:6px!important;color:#b9de7d}',
    '.msgrow.human .bubble{margin-left:auto!important;margin-right:0!important;background:#162735!important;border-color:#2e526c!important}',
    '.msgrow.human .dabbirSenderLabel{margin-left:auto!important;margin-right:6px!important;color:#9bcaff}',
    '@media(max-width:700px){'+
      '#screen-conversations .chatGrid{margin-top:0!important}'+
      '#screen-conversations .chatList{max-height:132px!important;margin-bottom:8px!important;border-radius:14px!important}'+
      '#screen-conversations .chatPanel{height:calc(100dvh - 238px);min-height:500px;border-radius:16px!important;overflow:hidden}'+
      '#screen-conversations .chatHead{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:10px!important}'+
      '#screen-conversations .chatHead>.grow{grid-column:1;grid-row:1;min-width:0}'+
      '#screen-conversations .chatHead>.grow b,#screen-conversations #chatName{font-size:14px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #chatState{font-size:11px!important;line-height:1.4!important;color:#9aa2ab!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #translateAll{grid-column:2;grid-row:1;min-height:44px!important;padding:8px 10px!important;font-size:12px!important;white-space:nowrap}'+
      '#screen-conversations .dabbirChatControl{grid-column:1/-1;grid-row:2;width:100%;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}'+
      '#screen-conversations .dabbirOwnerChip{max-width:none!important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:8px 9px;font-size:11px}'+
      '#screen-conversations .dabbirTakeover{min-height:44px!important;padding:8px 10px!important;font-size:12px!important}'+
      '#screen-conversations .messages{min-height:0!important;padding:11px 9px 14px!important}'+
      '#screen-conversations .msgrow{margin:10px 0!important}'+
      '#screen-conversations .bubble{max-width:84%!important;border-radius:15px!important;padding:10px 11px!important}'+
      '#screen-conversations .bubble .body{font-size:14px!important;line-height:1.58!important}'+
      '#screen-conversations .bubble .original{font-size:12px!important;line-height:1.5!important}'+
      '#screen-conversations .meta{font-size:11px!important}'+
      '#screen-conversations .meta button{min-height:44px!important;font-size:11px!important;padding:6px 8px!important}'+
      '#screen-conversations .dabbirSenderLabel{font-size:11px!important}'+
      '#screen-conversations .compose{padding:8px!important;gap:7px!important;background:#101214}'+
      '#screen-conversations .compose input{min-height:46px!important;border-radius:12px!important;font-size:16px!important}'+
      '#screen-conversations .send{width:46px!important;min-width:46px!important;height:46px!important;border-radius:12px!important}'+
      '#screen-conversations .compose.dabbirHumanLocked input{font-size:13px!important;min-height:46px!important}'+
      '#screen-conversations+.truth,#screen-conversations .truth{font-size:12px!important;line-height:1.55!important;padding:10px 11px!important;margin-top:8px!important}'+
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
      clone.dataset.dabbirHumanComposer='v3';
      input.replaceWith(clone);
      clone.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendHumanReply()}});
    }
    const button=q('#sendBtn');
    if(button&&!button.dataset.dabbirHumanComposer){
      const clone=button.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v3';
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

  let refreshQueued=false;
  function queueHumanUi(){
    if(refreshQueued)return;
    refreshQueued=true;
    const run=()=>{refreshQueued=false;updateHumanUi()};
    if(typeof queueMicrotask==='function')queueMicrotask(run);else Promise.resolve().then(run);
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
    finally{if(button)button.disabled=false;queueHumanUi()}
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
      }else if(typeof loadRuntime==='function'){
        await loadRuntime(currentBusinessId(),currentConversationId());
      }
    }catch(error){notify(t.sendFail+(error&&error.message?' — '+error.message:''))}
    finally{sending=false;if(button)button.disabled=false;queueHumanUi();const live=q('#composer');if(live&&!live.disabled)live.focus()}
  }

  ensureControl();
  replaceLegacyComposer();
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterMessages','human-chat-ui',queueHumanUi);
    lifecycle.on('afterChats','human-chat-ui',queueHumanUi);
    lifecycle.on('afterRender','human-chat-ui',queueHumanUi);
    lifecycle.on('afterLanguage','human-chat-ui',queueHumanUi);
  }
  setTimeout(updateHumanUi,0);
  window.__dabbirHumanChatUiVersion='v3-lifecycle';
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
    nav:'العمليات',title:'مركز العمليات',desc:'السلع والمخزون والطلبات من بيانات نشاطك الفعلية.',
    products:'السلع',stock:'المخزون',available:'المتاح',low:'مخزون منخفض',orders:'الطلبات',sales:'المبيعات المؤكدة',
    add:'إضافة سلعة',edit:'تعديل',delete:'حذف',editTitle:'تعديل السلعة',name:'اسم السلعة',price:'القيمة',qty:'الكمية',status:'الحالة',customer:'العميل',date:'التاريخ',
    noProducts:'لا توجد سلع بعد.',noOrders:'لا توجد طلبات فعلية بعد.',lowTitle:'تحتاج انتباه',lowNone:'لا يوجد نقص مخزون حاليًا.',
    simulated:'الطلبات التجريبية مستبعدة من المبيعات.',save:'حفظ',cancel:'إلغاء',update:'تحديث',
    created:'تمت إضافة السلعة.',itemUpdated:'تم تعديل السلعة.',itemDeleted:'تم حذف السلعة.',orderUpdated:'تم تحديث حالة الطلب.',failed:'تعذر إكمال العملية.',
    deleteConfirm:'هل تريد حذف هذه السلعة من النشاط؟',reservedDelete:'لا يمكن حذف السلعة لأن لها كمية محجوزة.',reservedQty:'الكمية لا يمكن أن تكون أقل من الكمية المحجوزة.',
    draft:'مسودة',reservedStatus:'محجوز',confirmed:'مؤكد',cancelled:'ملغي',completed:'مكتمل',loading:'جارٍ تحميل العمليات...'
  }:{
    nav:'Operations',title:'Owner operations',desc:'Items, inventory, and orders from your real business data.',
    products:'Items',stock:'Inventory',available:'Available',low:'Low stock',orders:'Orders',sales:'Recognized sales',
    add:'Add item',edit:'Edit',delete:'Delete',editTitle:'Edit item',name:'Item name',price:'Value',qty:'Quantity',status:'Status',customer:'Customer',date:'Date',
    noProducts:'No items yet.',noOrders:'No real orders yet.',lowTitle:'Needs attention',lowNone:'No low-stock items right now.',
    simulated:'Simulated orders are excluded from recognized sales.',save:'Save',cancel:'Cancel',update:'Update',
    created:'Item added.',itemUpdated:'Item updated.',itemDeleted:'Item deleted.',orderUpdated:'Order status updated.',failed:'Operation failed.',
    deleteConfirm:'Delete this item from the business?',reservedDelete:'This item cannot be deleted while stock is reserved.',reservedQty:'Quantity cannot be lower than reserved stock.',
    draft:'Draft',reservedStatus:'Reserved',confirmed:'Confirmed',cancelled:'Cancelled',completed:'Completed',loading:'Loading operations...'
  };

  const style=document.createElement('style');
  style.textContent=[
    '.opsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}',
    '.opsMetric{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:16px;padding:14px}',
    '.opsMetric span{display:block;color:var(--muted);font-size:12px;line-height:1.45}.opsMetric strong{display:block;font-size:22px;margin-top:6px}',
    '.opsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.opsTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}',
    '.opsRow{display:grid;grid-template-columns:minmax(130px,1.5fr) .8fr .7fr minmax(128px,auto);gap:8px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:12px;line-height:1.45}',
    '.opsRow:last-child{border-bottom:0}.opsRow.head{color:var(--muted);background:#15181b;font-size:11px;font-weight:800}',
    '.opsOrderRow{grid-template-columns:minmax(120px,1.2fr) .9fr .8fr .8fr}',
    '.opsName b{display:block;font-size:13px}',
    '.opsName small{color:var(--muted);font-size:11px;line-height:1.4}',
    '.opsLow{border:1px solid #5b4b20;background:#2b2516;border-radius:14px;padding:11px;margin-bottom:12px;color:#f4d991;font-size:12px;line-height:1.55}',
    '.opsActions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}',
    '.opsAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:8px 10px;min-height:44px;font-size:12px;font-weight:800}',
    '.opsAction.danger{border-color:#5c3034;background:#281719;color:#ffb4ba}',
    '.opsOrderSelect{width:100%;min-height:44px;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;padding:7px;font-size:12px}',
    '.opsSection{margin-top:12px}.opsSection h2{font-size:14px;margin:0 0 9px}',
    '@media(max-width:800px){.opsMetrics{grid-template-columns:repeat(2,1fr)}.opsGrid{grid-template-columns:1fr}.opsRow{grid-template-columns:minmax(105px,1.3fr) .7fr .6fr minmax(112px,auto);gap:6px}.opsOrderRow{grid-template-columns:minmax(105px,1.1fr) .8fr .8fr}.opsOrderRow .opsDate{display:none}.opsAction,.opsOrderSelect{min-height:44px;font-size:12px;padding:8px}.opsActions{gap:4px}}'
  ].join('');
  document.head.appendChild(style);

  let data=null;
  let loading=false;
  let loadGeneration=0;
  let pendingLoad=null;
  let businessId=null;
  let editingProductId=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' '+currencyCode()}catch{return Number(value||0).toFixed(2)+' '+currencyCode()}}
  function date(value){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function isStore(){try{return String(workspace?.business?.business_type||'').toLowerCase()==='store'}catch{return false}}
  function currencyCode(){try{return String(workspace?.business?.currency_code||'AED').trim().toUpperCase()||'AED'}catch{return 'AED'}}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}
  function productSku(){return 'DAB-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
  function errorText(error){
    const t=text();const code=String(error?.message||error||'');
    if(code.includes('PRODUCT_HAS_RESERVED_STOCK'))return t.reservedDelete;
    if(code.includes('QUANTITY_BELOW_RESERVED'))return t.reservedQty;
    return t.failed+' — '+code;
  }

  function ensureScreen(){
    let screen=q('#screen-operations');
    if(!screen){
      screen=document.createElement('section');
      screen.className='screen';
      screen.id='screen-operations';
      q('.content')?.appendChild(screen);
    }
    if(!isStore())return screen;

    if(!q('#opsBody')){
      screen.innerHTML='<div class=\"hero\"><div><h1 id=\"opsTitle\"></h1><p id=\"opsDesc\"></p></div><button class=\"primary\" id=\"opsAddProduct\" type=\"button\"></button></div><div id=\"opsBody\"></div>';
    }
    q('#svcModal')?.classList.remove('open');

    if(!q('#opsProductModal')){
      const productModal=document.createElement('div');
      productModal.className='modal';productModal.id='opsProductModal';
      productModal.innerHTML='<form class=\"modalBox\" id=\"opsProductForm\"><h3 id=\"opsProductModalTitle\"></h3><div class=\"field\"><label id=\"opsNameLabel\"></label><input id=\"opsName\" maxlength=\"160\" required></div><div class=\"field\"><label id=\"opsPriceLabel\"></label><input id=\"opsPrice\" type=\"number\" min=\"0\" max=\"10000000\" step=\"0.01\" required></div><div class=\"field\"><label id=\"opsQtyLabel\"></label><input id=\"opsQty\" type=\"number\" min=\"0\" max=\"1000000\" step=\"1\" required></div><div class=\"modalActions\"><button type=\"button\" class=\"secondary\" id=\"opsProductCancel\"></button><button class=\"primary\" id=\"opsProductSave\" type=\"submit\"></button></div></form>';
      document.body.appendChild(productModal);
      productModal.setAttribute('role','dialog');productModal.setAttribute('aria-modal','true');productModal.setAttribute('aria-labelledby','opsProductModalTitle');
      for(const key of ['Name','Price','Qty'])q('#ops'+key+'Label').setAttribute('for','ops'+key);
      q('#opsProductCancel').onclick=closeProductModal;
      q('#opsProductForm').onsubmit=submitProduct;
      productModal.addEventListener('click',event=>{if(event.target===productModal)closeProductModal()});
    }
    q('#opsAddProduct').onclick=openNewProduct;
    applyCopy();
    return screen;
  }

  function openNewProduct(){
    editingProductId=null;
    q('#opsProductForm')?.reset();
    applyCopy();
    q('#opsProductModal')?.classList.add('open');
  }

  function openEditProduct(product){
    if(!product)return;
    editingProductId=product.id;
    q('#opsName').value=product.name||'';
    q('#opsPrice').value=Number(product.price_aed||0).toFixed(2).replace(/\.00$/,'');
    q('#opsQty').value=Number(product.quantity||0);
    applyCopy();
    q('#opsProductModal')?.classList.add('open');
  }

  function closeProductModal(){
    q('#opsProductModal')?.classList.remove('open');
    q('#opsProductForm')?.reset();
    editingProductId=null;
    applyCopy();
  }

  function applyCopy(){
    if(!isStore())return;
    const t=text();
    if(q('#opsTitle'))q('#opsTitle').textContent=t.title;
    if(q('#opsDesc'))q('#opsDesc').textContent=t.desc;
    if(q('#opsAddProduct'))q('#opsAddProduct').textContent=t.add;
    if(q('#opsProductModalTitle'))q('#opsProductModalTitle').textContent=editingProductId?t.editTitle:t.add;
    if(q('#opsNameLabel'))q('#opsNameLabel').textContent=t.name;
    if(q('#opsPriceLabel'))q('#opsPriceLabel').textContent=t.price+' ('+currencyCode()+')';
    if(q('#opsQtyLabel'))q('#opsQtyLabel').textContent=t.qty;
    if(q('#opsProductCancel'))q('#opsProductCancel').textContent=t.cancel;
    if(q('#opsProductSave'))q('#opsProductSave').textContent=editingProductId?t.update:t.save;
    if(current==='operations'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={},requestedBusinessId=businessId){
    if(!businessId)businessId=workspace?.business?.id||null;
    const url='/api/owner-operations?business_id='+encodeURIComponent(requestedBusinessId||businessId||'');
    const response=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'OWNER_OPERATIONS_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isStore())return;
    businessId=workspace?.business?.id||businessId;
    const requestedBusinessId=businessId;
    if(pendingLoad?.businessId===businessId)return pendingLoad.promise;
    if(!force&&data&&data.business_id===businessId)return;
    const generation=++loadGeneration;
    if(data?.business_id!==businessId)data=null;
    loading=true;render();
    const valid=()=>generation===loadGeneration&&workspace?.business?.id===requestedBusinessId;
    const promise=(async()=>{try{const result=await request({},requestedBusinessId);if(!valid())return;if(result.business_id!==requestedBusinessId)throw new Error('OPERATIONS_CONTEXT_MISMATCH');data=result;render()}catch(error){if(valid()){data={error:error.message};render()}}finally{if(generation===loadGeneration){pendingLoad=null;loading=false;if(valid())render()}}})();
    pendingLoad={businessId,generation,promise};return promise;
  }

  async function openRecord({business_id:requestedBusinessId,type,id,isCurrent=()=>true}){
    if(!id||!isStore()||workspace?.business?.id!==requestedBusinessId)return false;
    const before=current;
    await load(true);
    if(!isCurrent()||workspace?.business?.id!==requestedBusinessId||current!==before||data?.business_id!==requestedBusinessId)return false;
    const collection=type==='order'?data.orders:type==='inventory'?data.products:null;
    if(!Array.isArray(collection)||!collection.some(row=>row.id===id))return false;
    if(typeof showScreen==='function')showScreen('operations');
    const attribute=type==='order'?'data-ops-order-row':'data-ops-product-row';
    const row=qa('['+attribute+']').find(node=>node.getAttribute(attribute)===id);
    if(!row)return false;
    row.setAttribute('tabindex','-1');row.scrollIntoView({behavior:'auto',block:'center'});row.focus({preventScroll:true});
    return true;
  }

  function statusOptions(current){
    const t=text();
    const labels={draft:t.draft,reserved:t.reservedStatus,confirmed:t.confirmed,cancelled:t.cancelled,completed:t.completed};
    return Object.entries(labels).map(([value,label])=>'<option value=\"'+value+'\" '+(value===current?'selected':'')+'>'+escapeHtml(label)+'</option>').join('');
  }

  function render(){
    const body=q('#opsBody');
    if(!body||!isStore())return;
    if(data?.business_id&&data.business_id!==workspace?.business?.id)data=null;
    const t=text();
    if(loading&&!data){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.loading)+'</div>';return}
    const low=(data.low_stock||[]).filter(product=>product.active!==false);
    const realOrders=(data.orders||[]).filter(order=>order.simulated===false);
    const products=(data.products||[]).filter(product=>product.active!==false);
    const inventoryUnits=products.reduce((sum,product)=>sum+Number(product.quantity||0),0);
    if(q('#opsAddProduct'))q('#opsAddProduct').style.display=data.can_manage?'inline-flex':'none';

    const metrics=[
      [t.products,products.length],[t.stock,inventoryUnits],[t.low,low.length],[t.sales,money(data.metrics?.recognized_sales_aed||0)]
    ].map(([label,value])=>'<div class=\"opsMetric\"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>').join('');

    const lowHtml='<div class=\"opsLow\"><b>'+escapeHtml(t.lowTitle)+'</b><div style=\"margin-top:5px\">'+(low.length?low.slice(0,8).map(product=>escapeHtml(product.name)+' · '+escapeHtml(product.available)+' '+escapeHtml(t.available)).join('<br>'):escapeHtml(t.lowNone))+'</div></div>';

    const productRows=products.length?products.map(product=>'<div class=\"opsRow\" data-ops-product-row=\"'+escapeHtml(product.id)+'\"><div class=\"opsName\"><b>'+escapeHtml(product.name)+'</b></div><span>'+escapeHtml(money(product.price_aed))+'</span><span>'+escapeHtml(product.quantity)+'</span>'+(data.can_manage?'<div class=\"opsActions\"><button class=\"opsAction\" type=\"button\" data-ops-edit=\"'+escapeHtml(product.id)+'\">'+escapeHtml(t.edit)+'</button><button class=\"opsAction danger\" type=\"button\" data-ops-delete=\"'+escapeHtml(product.id)+'\">'+escapeHtml(t.delete)+'</button></div>':'<span></span>')+'</div>').join(''):'<div class=\"empty\">'+escapeHtml(t.noProducts)+'</div>';
    const productsHtml='<div class=\"opsSection\"><h2>'+escapeHtml(t.products)+'</h2><div class=\"opsTable\"><div class=\"opsRow head\"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.qty)+'</span><span></span></div>'+productRows+'</div></div>';

    const orderRows=realOrders.length?realOrders.map(order=>'<div class=\"opsRow opsOrderRow\" data-ops-order-row=\"'+escapeHtml(order.id)+'\"><div class=\"opsName\"><b>'+escapeHtml(order.customer_name||t.customer)+'</b></div><span>'+escapeHtml(money(order.total_aed))+'</span>'+(data.can_manage?'<select class=\"opsOrderSelect\" data-ops-order=\"'+escapeHtml(order.id)+'\">'+statusOptions(String(order.status||'draft'))+'</select>':'<span>'+escapeHtml(order.status)+'</span>')+'<span class=\"opsDate\">'+escapeHtml(date(order.created_at))+'</span></div>').join(''):'<div class=\"empty\">'+escapeHtml(t.noOrders)+'</div>';
    const ordersHtml='<div class=\"opsSection\"><h2>'+escapeHtml(t.orders)+'</h2><div class=\"opsTable\"><div class=\"opsRow opsOrderRow head\"><span>'+escapeHtml(t.customer)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.status)+'</span><span class=\"opsDate\">'+escapeHtml(t.date)+'</span></div>'+orderRows+'</div><div class=\"truth\" style=\"margin-top:9px\">'+escapeHtml(t.simulated)+'</div></div>';

    body.innerHTML='<div class=\"opsMetrics\">'+metrics+'</div>'+lowHtml+'<div class=\"opsGrid\"><div>'+productsHtml+'</div><div>'+ordersHtml+'</div></div>';
    qa('[data-ops-edit]').forEach(button=>button.onclick=()=>openEditProduct(products.find(product=>product.id===button.dataset.opsEdit)));
    qa('[data-ops-delete]').forEach(button=>button.onclick=()=>deleteProduct(products.find(product=>product.id===button.dataset.opsDelete)));
    qa('[data-ops-order]').forEach(select=>select.onchange=()=>updateOrder(select.dataset.opsOrder,select.value));
  }

  async function mutate(payload){
    const response=await fetch('/api/owner-operations',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.detail||result.error||'OWNER_OPERATION_FAILED');
    return result;
  }

  async function manageProduct(payload){
    const response=await fetch('/api/owner-product-management',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.error||result.detail||'OWNER_PRODUCT_MANAGEMENT_FAILED');
    return result;
  }

  async function submitProduct(event){
    event.preventDefault();
    const t=text();const button=q('#opsProductSave');if(button)button.disabled=true;
    try{
      const values={name:q('#opsName').value,price_aed:q('#opsPrice').value,quantity:q('#opsQty').value};
      if(editingProductId){
        await manageProduct({action:'update_product',product_id:editingProductId,...values});
        notify(t.itemUpdated);
      }else{
        await mutate({action:'create_product',sku:productSku(),...values});
        notify(t.created);
      }
      closeProductModal();data=null;await load(true);
    }catch(error){notify(errorText(error))}finally{if(button)button.disabled=false}
  }

  async function deleteProduct(product){
    if(!product)return;
    const t=text();
    if(!window.confirm(t.deleteConfirm))return;
    try{
      await manageProduct({action:'delete_product',product_id:product.id});
      if(editingProductId===product.id)closeProductModal();
      notify(t.itemDeleted);data=null;await load(true);
    }catch(error){notify(errorText(error))}
  }

  async function updateOrder(orderId,status){
    const t=text();
    try{await mutate({action:'update_order_status',order_id:orderId,status});notify(t.orderUpdated);data=null;await load(true)}catch(error){notify(t.failed+' — '+error.message);data=null;await load(true)}
  }

  function syncOperationsUi(){
    if(!isStore())return;
    ensureScreen();
    applyCopy();
    if(current==='operations')load();
  }

  function activateOperations({target}={}){
    if(target!=='operations'||!isStore())return;
    ensureScreen();
    if(q('#pageTitle'))q('#pageTitle').textContent=text().nav;
    load();
  }

  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','owner-operations',syncOperationsUi);
    lifecycle.on('afterNavigate','owner-operations',activateOperations);
    lifecycle.on('afterLanguage','owner-operations-language',syncOperationsUi);
  }

  setTimeout(()=>{if(isStore()){ensureScreen();load()}},600);
  window.__dabbirOwnerOperations={openRecord};
})();

(()=>{
  if(window.__dabbirServiceOperations)return;
  const style=document.createElement('style');
  style.dataset.dabbirServices='v1';
  style.textContent="\n.svcHero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.svcHero h1{margin:0 0 5px;font-size:25px}.svcHero p{margin:0;color:var(--muted);font-size:13px;line-height:1.65}.svcTruth{border:1px solid #314132;background:#152019;border-radius:13px;padding:10px 12px;margin-bottom:10px;color:#bfe8c7;font-size:12px;line-height:1.55}.svcMetrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:11px}.svcMetric{border:1px solid var(--line);background:#111315;border-radius:14px;padding:12px}.svcMetric span{display:block;color:var(--muted);font-size:12px;line-height:1.45}.svcMetric strong{display:block;font-size:22px;margin-top:5px}.svcTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}.svcRow{display:grid;grid-template-columns:minmax(150px,1fr) .58fr .55fr .55fr minmax(126px,auto);gap:9px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:12px;line-height:1.45}.svcRow:last-child{border-bottom:0}.svcRow.head{background:#15181b;color:var(--muted);font-size:11px;font-weight:800}.svcName b{display:block;font-size:13px}.svcName small{color:var(--muted);font-size:11px;line-height:1.4}.svcPrice{font-weight:900;white-space:nowrap}.svcStatus{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900;line-height:1.3}.svcStatus.on{background:#14331e;color:var(--green)}.svcStatus.off{background:#2b2d31;color:#aab0b7}.svcActions{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}.svcAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:8px 10px;min-height:44px;font-size:12px;font-weight:800}.svcAction.danger{border-color:#5c3034;background:#281719;color:#ffb4ba}.svcEmpty{padding:22px;text-align:center;color:var(--muted);font-size:12px;line-height:1.55}@media(max-width:700px){.svcHero{align-items:center}.svcHero h1{font-size:20px}.svcRow{grid-template-columns:minmax(105px,1fr) .62fr .62fr minmax(112px,auto);gap:7px;font-size:12px}.svcRow .svcStateCol{display:none}.svcName b{font-size:13px}.svcAction{min-height:44px;font-size:12px;padding:8px}.svcActions{gap:4px}}\n";
  document.head.append(style);

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(workspace?.business?.business_type||'').toLowerCase();
  const isServiceBusiness=()=>Boolean(businessType())&&businessType()!=='store';
  let data=null;
  let loading=false;
  let editingId=null;

  const copy=()=>ar()?{
    nav:'الخدمات',title:'الخدمات',desc:'الخدمات الفعلية التي يقدمها نشاطك. دَبِّر يستخدم الخدمات النشطة عند الرد على العملاء.',truth:'الخدمات النشطة هنا تُعامل كمعلومة تشغيلية حية لدى AI.',add:'إضافة خدمة',name:'اسم الخدمة',price:'قيمة الخدمة',aed:'درهم',duration:'المدة',minutes:'دقيقة',status:'الحالة',active:'نشطة',inactive:'متوقفة',edit:'تعديل',delete:'حذف',deleteConfirm:'هل تريد حذف هذه الخدمة من النشاط؟ سيبقى سجل الحجوزات السابق محفوظًا.',save:'حفظ',cancel:'إلغاء',empty:'لا توجد خدمات بعد.',loading:'جارٍ تحميل الخدمات…',failed:'تعذر تحميل الخدمات.',created:'تمت إضافة الخدمة.',updated:'تم تحديث الخدمة.',deleted:'تم حذف الخدمة.',activeMetric:'الخدمات النشطة',totalMetric:'إجمالي الخدمات'
  }:{
    nav:'Services',title:'Services',desc:'The real services your business provides. DABBIR uses active services when replying to customers.',truth:'Active services here are treated as live operational facts by AI.',add:'Add service',name:'Service name',price:'Service price',aed:'AED',duration:'Duration',minutes:'min',status:'Status',active:'Active',inactive:'Inactive',edit:'Edit',delete:'Delete',deleteConfirm:'Delete this service from the business? Previous booking history will be preserved.',save:'Save',cancel:'Cancel',empty:'No services yet.',loading:'Loading services…',failed:'Could not load services.',created:'Service added.',updated:'Service updated.',deleted:'Service deleted.',activeMetric:'Active services',totalMetric:'Total services'
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
    const rows=services.length?services.map(service=>'<div class="svcRow"><div class="svcName"><b>'+escapeHtml(service.name)+'</b><small>'+escapeHtml(String(service.id||'').slice(0,8))+'</small></div><span class="svcPrice">'+escapeHtml(money(service.price_aed))+' '+escapeHtml(t.aed)+'</span><span>'+escapeHtml(service.duration_minutes)+' '+escapeHtml(t.minutes)+'</span><span class="svcStateCol"><span class="svcStatus '+(service.active!==false?'on':'off')+'">'+escapeHtml(service.active!==false?t.active:t.inactive)+'</span></span>'+(data.can_manage?'<div class="svcActions"><button class="svcAction" type="button" data-svc-edit="'+escapeHtml(service.id)+'">'+escapeHtml(t.edit)+'</button><button class="svcAction danger" type="button" data-svc-delete="'+escapeHtml(service.id)+'">'+escapeHtml(t.delete)+'</button></div>':'<span></span>')+'</div>').join(''):'<div class="svcEmpty">'+escapeHtml(t.empty)+'</div>';
    body.innerHTML=metrics+'<div class="svcTable"><div class="svcRow head"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.duration)+'</span><span class="svcStateCol">'+escapeHtml(t.status)+'</span><span></span></div>'+rows+'</div>';
    if(q('#svcAdd'))q('#svcAdd').style.display=data.can_manage?'inline-flex':'none';
    body.querySelectorAll('[data-svc-edit]').forEach(button=>button.addEventListener('click',()=>openModal(services.find(service=>service.id===button.dataset.svcEdit)||null)));
    body.querySelectorAll('[data-svc-delete]').forEach(button=>button.addEventListener('click',()=>deleteService(services.find(service=>service.id===button.dataset.svcDelete)||null)));
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
      loading=false;
      await load(true);
    }catch(error){notify(t.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}
  }

  async function deleteService(service){
    if(!service||loading)return;
    const t=copy();
    if(!window.confirm(t.deleteConfirm))return;
    loading=true;
    try{
      const response=await fetch('/api/service-catalog',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({action:'delete_service',business_id:workspace.business.id,service_id:service.id})});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.detail||payload?.error||'SERVICE_DELETE_FAILED');
      if(editingId===service.id){q('#svcModal')?.classList.remove('open');editingId=null}
      data=null;notify(t.deleted);loading=false;await load(true);
    }catch(error){notify(t.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}
  }

  function initialize(){
    if(!isServiceBusiness())return;
    applyCopy();
    ensureScreen();
    if(current==='operations')load(false);
  }

  function activateServices({target}={}){
    if(target!=='operations'||!isServiceBusiness())return;
    applyCopy();
    ensureScreen();
    load(false);
  }

  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','service-operations',initialize);
    lifecycle.on('afterNavigate','service-operations',activateServices);
  }

  setTimeout(initialize,500);
  window.__dabbirServiceOperations={refresh:()=>load(true),version:'service-catalog-v5-owner-control'};
})();

(()=>{if(window.__dabbirBookingLifecycle)return;window.__dabbirBookingLifecycle=(function createBookingLifecycle() {
  const terminal = new Set(['completed', 'done', 'cancelled', 'canceled', 'no_show', 'rejected']);
  const views = new Map();
  const status = row => String(row?.status || 'requested').trim().toLowerCase();
  const time = value => value == null || value === '' ? NaN : new Date(value).getTime();
  function timezone(business = {}) {
    const zones = {AE:'Asia/Dubai', SA:'Asia/Riyadh', KW:'Asia/Kuwait', QA:'Asia/Qatar', BH:'Asia/Bahrain', OM:'Asia/Muscat'};
    const country = String(business.country_code || business.locale?.split('-')[1] || 'AE').toUpperCase();
    const zone = business.timezone || zones[country] || 'Asia/Dubai';
    try { new Intl.DateTimeFormat('en', {timeZone:zone}); return zone; } catch { return zones[country] || 'Asia/Dubai'; }
  }
  function dayKey(value, business = {}) {
    const stamp = time(value);
    if (!Number.isFinite(stamp)) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone:timezone(business), year:'numeric', month:'2-digit', day:'2-digit',
    }).formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const wallDate = key => new Date(`${key}T12:00:00.000Z`);
  const wallKey = date => Number.isFinite(time(date)) ? new Date(date).toISOString().slice(0,10) : '';
  function addDays(key, n) { const date = wallDate(key); date.setUTCDate(date.getUTCDate() + n); return wallKey(date); }
  function period(view) {
    const day = view.day;
    if (view.allDates) return null;
    if (view.view === 'month') {
      const from = day.slice(0,7) + '-01', date = wallDate(from);
      date.setUTCMonth(date.getUTCMonth() + 1);
      return {from, to:wallKey(date)};
    }
    if (view.view === 'week') {
      const from = addDays(day, -(wallDate(day).getUTCDay() + 6) % 7);
      return {from, to:addDays(from,7)};
    }
    return {from:day, to:addDays(day,1)};
  }
  function localTimeToIso(raw,business={}) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw||''))return null;
    const target=Date.parse(raw+':00.000Z');if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,16)!==raw)return null;
    let value=target;
    for(let i=0;i<4;i++){
      const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone(business),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
      const observed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),next=value+target-observed;
      if(next===value)return new Date(value).toISOString();value=next;
    }
    return null;
  }
  function classify(row, business = {}, now = Date.now()) {
    if (terminal.has(status(row))) return 'history';
    const start = time(row?.starts_at), end = time(row?.ends_at);
    if (!Number.isFinite(start)) return 'review';
    // Preserve a genuinely running, overnight booking until its scheduled end.
    if (Number.isFinite(end) && end > start) return end <= time(now) ? 'review' : 'current';
    // Missing duration is not a licence to invent an end time.
    return dayKey(start,business) < dayKey(now,business) ? 'review' : 'current';
  }
  function inContext(row, workspace = {}) {
    if (!row?.id) return false;
    if (row.business_id && row.business_id !== workspace.business?.id) return false;
    const scope = workspace.branch_scope;
    if (scope?.branch_id && row.branch_id !== scope.branch_id) return false;
    if (scope?.mode === 'assigned' && Array.isArray(scope.branch_ids) && !scope.branch_ids.includes(row.branch_id)) return false;
    return true;
  }
  function inPeriod(row, range, business = {}) {
    if (!range) return true;
    const first = dayKey(row.starts_at,business);
    const end = time(row.ends_at), start = time(row.starts_at);
    const last = Number.isFinite(end) && end > start ? dayKey(end - 1,business) : first;
    return Boolean(first && first < range.to && last >= range.from);
  }
  const onDay = (row, day, business) => inPeriod(row,{from:day,to:addDays(day,1)},business);
  function select(rows = [], workspace = {}, options = {}) {
    const {scope='current', range=null, now=Date.now()} = options;
    return rows.filter(row => inContext(row,workspace))
      .filter(row => scope === 'all' || classify(row,workspace.business,now) === scope)
      .filter(row => inPeriod(row,range,workspace.business))
      .sort((a,b) => {
        const delta = (time(a.starts_at) || 0) - (time(b.starts_at) || 0);
        return (scope === 'current' ? delta : -delta) || String(a.id).localeCompare(String(b.id));
      });
  }
  function contextKey(workspace = {}) {
    const scope = workspace.branch_scope || {};
    return `${workspace.business?.id || ''}|${scope.branch_id || (scope.branch_ids || []).slice().sort().join(',') || 'all'}`;
  }
  function getView(workspace = {}, now = Date.now()) {
    const key = contextKey(workspace), today = dayKey(now,workspace.business);
    if (!views.has(key)) views.set(key,{scope:'current',view:'day',day:today,allDates:false,followToday:true});
    const state = views.get(key);
    if (state.followToday) state.day = today;
    return {...state};
  }
  function setView(workspace, patch = {}) {
    const state = getView(workspace), next = {...state, ...patch};
    if (!['current','review','history'].includes(next.scope) || !['day','week','month'].includes(next.view) || !/^\d{4}-\d{2}-\d{2}$/.test(next.day)) throw new Error('INVALID_BOOKING_VIEW');
    if (patch.scope && patch.scope !== state.scope && patch.allDates === undefined) next.allDates = patch.scope !== 'current';
    views.set(contextKey(workspace),next);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dabbir:booking-view-changed'));
    return {...next};
  }
  function move(workspace, delta) {
    const state = getView(workspace);
    let day;
    if (state.view === 'month') { const date = wallDate(state.day.slice(0,7)+'-01'); date.setUTCMonth(date.getUTCMonth()+delta); day=wallKey(date); }
    else day = addDays(state.day, delta*(state.view==='week'?7:1));
    return setView(workspace,{day,allDates:false,followToday:false});
  }
  function labels(ar) {
    return ar ? {current:'الحالية',review:'تحتاج حسمًا',history:'السجل',allDates:'كل التواريخ',reviewHint:'انتهى الموعد ولم تُسجَّل النتيجة. حدّد ما حدث؛ لا تُحتسب الخدمة مكتملة تلقائيًا.',historyHint:'سجل محفوظ، وليس أعمالًا مطلوبة الآن.'}
      : {current:'Current',review:'Needs resolution',history:'History',allDates:'All dates',reviewHint:'The scheduled time elapsed without a recorded outcome. Record what happened; elapsed time does not mean completed.',historyHint:'Retained history, not current work.'};
  }
  function controls(workspace, rows, ar) {
    const state=getView(workspace), text=labels(ar);
    return '<div class="dabbirBookingScopes" role="group" aria-label="'+(ar?'عرض الحجوزات':'Booking view')+'">'+['current','review','history'].map(scope=>'<button type="button" data-booking-scope="'+scope+'" aria-pressed="'+(scope===state.scope)+'">'+text[scope]+'</button>').join('')+'</div>';
  }
  return {version:'booking-lifecycle-v1',localTimeToIso,status,terminal:row=>terminal.has(status(row)),timezone,dayKey,wallDate,wallKey,addDays,period,classify,inContext,inPeriod,onDay,select,contextKey,getView,setView,move,labels,controls};
})();const style=document.createElement('style');style.textContent='.dabbirBookingScopes{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.dabbirBookingScopes button{min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel,#15181b);color:inherit}.dabbirBookingScopes button[aria-pressed="true"]{border-color:var(--accent,#6366f1);font-weight:800}.dabbirBookingScopeHint{color:var(--muted);font-size:11px;line-height:1.6;margin:8px 0}';document.head.append(style);const tick=()=>{if(!document.hidden&&document.querySelector('#screen-appointments.active'))window.dispatchEvent(new Event('dabbir:booking-view-changed'))};setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);})();
(()=>{if(!window.__dabbirBookingReader)window.__dabbirBookingReader=(function installBookingReader(lifecycle) {
  const cache=new Map();
  const recordRequests=new Map();
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
  const emit=()=>window.dispatchEvent(new Event('dabbir:booking-data-changed'));
  const key=w=>lifecycle.contextKey(w)+'|'+JSON.stringify(lifecycle.getView(w));
  function entry(w) { const k=key(w); if(!cache.has(k))cache.set(k,{rows:[],customers:[],records:new Map(),recordCustomers:new Map(),ready:false,loading:false,error:null,has_more:false,next_offset:0,total:null,loadedAt:0,epoch:0}); return cache.get(k); }
  async function ensure(w, more=false, force=false) {
    if(!w?.business?.id)return;
    const viewKey=key(w),item=entry(w);
    if(item.loading||(!force&&!more&&item.ready&&Date.now()-item.loadedAt<60000)||(!force&&!more&&item.error&&Date.now()-item.loadedAt<60000))return;
    const state=lifecycle.getView(w),range=lifecycle.period(state),epoch=item.epoch;
    const params=new URLSearchParams({business_id:w.business.id,scope:state.scope,offset:String(more?item.next_offset:0)});
    if(w.branch_scope?.branch_id)params.set('branch_id',w.branch_scope.branch_id);
    else if(w.branch_scope?.mode==='all')params.set('branch_id','all');
    if(range){params.set('from',range.from);params.set('to',range.to)}
    item.loading=true;item.error=null;
    try {
      const response=await fetch('/api/appointment-management?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json();
      if(!response.ok||!body?.ok||!Array.isArray(body.appointments))throw new Error(body?.error||'BOOKING_READ_FAILED');
      if(item.epoch!==epoch)return;
      if(body.business_id!==w.business.id||body.branch_id!==(w.branch_scope?.branch_id||null))throw new Error('BOOKING_CONTEXT_MISMATCH');
      const merge=(a,b)=>[...new Map([...a,...b].map(row=>[row.id,row])).values()];
      item.rows=merge(more?item.rows:[],body.appointments);
      item.customers=merge(more?item.customers:[],body.customers||[]);
      // A successful refresh supersedes direct reads, including ones still in
      // flight. Pagination supersedes only the records in its accepted page.
      // Failed reads retain the last verified data and never advance this fence.
      item.epoch++;
      for(const requestKey of recordRequests.keys())if(requestKey.startsWith(viewKey+'|record:'))recordRequests.delete(requestKey);
      if(!more){item.records.clear();item.recordCustomers.clear()}
      else {
        for(const row of body.appointments)item.records.delete(row.id);
        for(const customer of body.customers||[])item.recordCustomers.delete(customer.id);
      }
      item.ready=true;item.has_more=body.has_more;item.next_offset=body.next_offset;item.total=body.total;
    } catch(error) { if(item.epoch===epoch)item.error=String(error?.message||error); }
    finally { item.loading=false;item.loadedAt=Date.now();emit(); }
  }
  function ensureRecord(w,id) {
    if(!validId(id)||!validId(w?.business?.id))return Promise.reject(new Error('INVALID_APPOINTMENT_ID'));
    const viewKey=key(w),requestKey=viewKey+'|record:'+id,item=entry(w),epoch=item.epoch;
    if(recordRequests.has(requestKey))return recordRequests.get(requestKey);
    const businessId=w.business.id,branchId=w.branch_scope?.branch_id||null;
    const state=lifecycle.getView(w),range=lifecycle.period(state);
    const context={business:{...w.business},branch_scope:{...w.branch_scope}};
    const current=()=>cache.get(viewKey)===item&&item.epoch===epoch&&key(w)===viewKey;
    const params=new URLSearchParams({business_id:businessId,appointment_id:id,scope:state.scope});
    if(branchId)params.set('branch_id',branchId);
    else if(w.branch_scope?.mode==='all')params.set('branch_id','all');
    if(range){params.set('from',range.from);params.set('to',range.to)}
    const request=(async()=>{
      const response=await fetch('/api/appointment-management?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json();
      if(!current())throw new Error('BOOKING_CONTEXT_CHANGED');
      if(!response.ok||!body?.ok)throw new Error(body?.error||'BOOKING_READ_FAILED');
      const row=body.appointment;
      if(body.business_id!==businessId||body.branch_id!==branchId||body.scope!==state.scope||row?.id!==id||row?.business_id!==businessId||!lifecycle.inContext(row,context)||!Array.isArray(body.customers))throw new Error('BOOKING_CONTEXT_MISMATCH');
      // A direct record must not advance or replace the paginated collection.
      item.records.set(id,row);
      for(const customer of body.customers)if(customer.id===row.customer_id)item.recordCustomers.set(customer.id,customer);
      emit();return row;
    })();
    recordRequests.set(requestKey,request);
    // Rejections are passed to the caller; no failed read is cached as success.
    const cleanup=()=>{if(recordRequests.get(requestKey)===request)recordRequests.delete(requestKey)};
    request.then(cleanup,cleanup);
    return request;
  }
  function rows(w) {
    const item=entry(w),state=lifecycle.getView(w);
    return lifecycle.select(item.ready?item.rows:[],w,{scope:state.scope,range:lifecycle.period(state)});
  }
  function status(w,ar) {
    const item=entry(w);
    if(item.error)return '<p class="dabbirBookingScopeHint" role="alert">'+(ar?'تعذر تحميل الحجوزات.':'Bookings could not be loaded.')+' <button type="button" data-booking-retry>'+(ar?'إعادة المحاولة':'Retry')+'</button></p>';
    if(!item.ready||item.loading)return '<p class="dabbirBookingScopeHint" role="status">'+(ar?'جارٍ تحميل الحجوزات…':'Loading bookings…')+'</p>';
    return '<p class="dabbirBookingScopeHint">'+item.rows.length+(item.total===null?'':' / '+item.total)+'</p>'+(item.has_more?'<button type="button" data-booking-more>'+(ar?'عرض المزيد':'Load more')+'</button>':'');
  }
  function bind(host,w) {
    host.querySelector('[data-booking-more]')?.addEventListener('click',()=>{void ensure(w,true);emit()});
    host.querySelector('[data-booking-retry]')?.addEventListener('click',()=>{void ensure(w,false,true);emit()});
  }
  function invalidate(w) {
    const prefix=lifecycle.contextKey(w)+'|';
    for(const [k,item] of cache)if(k.startsWith(prefix)){item.epoch++;cache.delete(k)}
    for(const k of recordRequests.keys())if(k.startsWith(prefix))recordRequests.delete(k);
    emit();
  }
  const customer=(w,id)=>entry(w).recordCustomers.get(id)||entry(w).customers.find(row=>row.id===id);
  // Once the scoped reader is ready, a stale workspace snapshot cannot restore
  // a booking absent from its cache. The caller can request that exact ID again.
  const find=(w,id)=>{const item=entry(w);return item.records.get(id)||item.rows.find(row=>row.id===id)||(!item.ready?(w.appointments||[]).find(row=>row.id===id):undefined)};
  return {entry,ensure,ensureRecord,rows,status,bind,invalidate,customer,find};
})(window.__dabbirBookingLifecycle)})();
(()=>{
  if(window.__dabbirActivityProfile)return;
  const lifecycle=window.__dabbirBookingLifecycle,reader=window.__dabbirBookingReader;
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
  function businessTimezone(){return lifecycle.timezone(workspace?.business)}
  function dayKey(value){return lifecycle.dayKey(value,workspace?.business)}
  function startOfWeek(value){return lifecycle.wallDate(lifecycle.period({view:'week',day:lifecycle.wallKey(value)}).from)}
  function plusDays(value,days){return lifecycle.wallDate(lifecycle.addDays(lifecycle.wallKey(value),days))}
  function fmtTime(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:businessTimezone(),hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
  function fmtDay(value,opts={}){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{...opts,timeZone:'UTC'}).format(value)}catch{return ''}}
  function customerLabel(id){const row=reader.customer(workspace,id)||(workspace?.customers||[]).find(x=>x.id===id);return row?.display_name||(ar()?'عميل':'Customer')}
  function appointmentStatus(value){const t=copy(),s=String(value||'').toLowerCase();if(['cancelled','canceled'].includes(s))return {label:t.statusCancelled,cls:'cancelled'};if(['completed','done'].includes(s))return {label:t.statusCompleted,cls:'completed'};if(s==='no_show')return {label:ar()?'لم يحضر':'No-show',cls:'cancelled'};if(s==='in_progress'||s==='arrived')return {label:ar()?(s==='arrived'?'وصل':'قيد التنفيذ'):(s==='arrived'?'Arrived':'In progress'),cls:'confirmed'};if(['confirmed','approved'].includes(s))return {label:t.statusConfirmed,cls:'confirmed'};return {label:t.statusRequested,cls:'requested'}}
  function appointments(){return reader.rows(workspace)}
  function todayAppointments(){return (workspace?.appointments||[]).filter(a=>lifecycle.inContext(a,workspace)&&!['cancelled','canceled','no_show'].includes(lifecycle.status(a))&&dayKey(a.starts_at)===dayKey(new Date()))}

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
    const view=lifecycle.getView(workspace);if(view.allDates)return lifecycle.labels(ar()).allDates;
    if(calendarView==='month')return fmtDay(calendarCursor,{month:'long',year:'numeric'});
    if(calendarView==='day')return fmtDay(calendarCursor,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const start=startOfWeek(calendarCursor),end=plusDays(start,6);
    return fmtDay(start,{day:'numeric',month:'short'})+' — '+fmtDay(end,{day:'numeric',month:'short',year:'numeric'});
  }

  function eventHtml(a,day){
    const s=appointmentStatus(a.status);
    return '<button type="button" class="dabbirCalEvent '+s.cls+'" data-booking-open="'+esc(a.id)+'" title="'+esc(customerLabel(a.customer_id)+' · '+fmtTime(a.starts_at)+' · '+s.label)+'">'+esc((day?day+' · ':'')+fmtTime(a.starts_at)+' · '+customerLabel(a.customer_id)+' · '+s.label)+'</button>';
  }
  function monthBody(rows){
    const month=calendarCursor.getUTCMonth(),first=new Date(Date.UTC(calendarCursor.getUTCFullYear(),month,1,12)),start=startOfWeek(first),today=dayKey(new Date());
    const weekdays=ar()?['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let cells='';for(let i=0;i<42;i++){
      const date=plusDays(start,i),key=lifecycle.wallKey(date),events=rows.filter(a=>lifecycle.onDay(a,key,workspace.business));
      cells+='<div class="dabbirCalDay '+(date.getUTCMonth()!==month?'out ':'')+(key===today?'today':'')+'"><div class="dabbirCalDate"><span>'+date.getUTCDate()+'</span><span class="dabbirCalCount">'+events.length+'</span></div>'+events.slice(0,3).map(a=>eventHtml(a)).join('')+(events.length>3?'<button type="button" class="dabbirCalEvent" data-calendar-day="'+key+'">+'+(events.length-3)+'</button>':'')+'</div>';
    }
    return '<div class="dabbirMonthWeekdays">'+weekdays.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><div class="dabbirMonthGrid">'+cells+'</div>';
  }
  function agendaBody(rows,allDates=false){
    return rows.length?'<div class="dabbirAgenda">'+rows.map(a=>eventHtml(a,allDates?dayKey(a.starts_at):'')).join('')+'</div>':'<div class="dabbirCalendarEmpty">'+esc(copy().noDayBookings)+'</div>';
  }
  function dayBody(rows){return agendaBody(rows.filter(a=>lifecycle.onDay(a,lifecycle.wallKey(calendarCursor),workspace.business)))}
  function weekBody(rows){
    const start=startOfWeek(calendarCursor),today=dayKey(new Date());let out='<div class="dabbirWeek"><div class="dabbirWeekGrid">';
    for(let i=0;i<7;i++){
      const date=plusDays(start,i),key=lifecycle.wallKey(date),events=rows.filter(a=>lifecycle.onDay(a,key,workspace.business));
      out+='<div class="dabbirWeekDay '+(key===today?'today':'')+'"><div class="dabbirWeekHead">'+esc(fmtDay(date,{weekday:'short',day:'numeric',month:'short'}))+'</div>'+events.map(a=>eventHtml(a)).join('')+'</div>';
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
      if(id!==businessId())return;
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
    shell.querySelectorAll('[data-booking-scope]').forEach(btn=>btn.onclick=()=>lifecycle.setView(workspace,{scope:btn.dataset.bookingScope}));
    shell.querySelectorAll('[data-calendar-view]').forEach(btn=>btn.onclick=()=>lifecycle.setView(workspace,{view:btn.dataset.calendarView,allDates:false}));
    shell.querySelector('[data-calendar-today]')?.addEventListener('click',()=>lifecycle.setView(workspace,{day:dayKey(new Date()),allDates:false,followToday:true}));
    shell.querySelector('[data-calendar-prev]')?.addEventListener('click',()=>lifecycle.move(workspace,-1));
    shell.querySelector('[data-calendar-next]')?.addEventListener('click',()=>lifecycle.move(workspace,1));
    shell.querySelectorAll('[data-calendar-day]').forEach(btn=>btn.onclick=()=>lifecycle.setView(workspace,{day:btn.dataset.calendarDay,view:'day',allDates:false,followToday:false}));
    shell.querySelectorAll('[data-booking-open]').forEach(btn=>btn.onclick=()=>window.__dabbirAppointmentManagement?.open?.(btn.dataset.bookingOpen));
    reader.bind(shell,workspace);
  }

  function renderCalendar(){
    if(!state?.profile?.show_appointments||lastBusiness!==businessId()){q('#dabbirCalendarShell')?.replaceChildren();return}const shell=ensureCalendar();if(!shell)return;
    const selected=lifecycle.getView(workspace);calendarView=selected.view;calendarCursor=lifecycle.wallDate(selected.day);
    if(q('#screen-appointments')?.classList.contains('active'))void reader.ensure(workspace);
    const t=copy(),rows=appointments(),labels=lifecycle.labels(ar());
    const body=selected.allDates?agendaBody(rows,true):calendarView==='month'?monthBody(rows):calendarView==='week'?weekBody(rows):dayBody(rows);
    shell.innerHTML='<section class="dabbirCalendarCard">'+lifecycle.controls(workspace,[],ar())+'<div class="dabbirCalendarToolbar"><div class="dabbirCalendarNav"><button type="button" data-calendar-prev aria-label="'+esc(t.previous)+'">‹</button><button type="button" class="todayBtn" data-calendar-today>'+esc(t.today)+'</button><button type="button" data-calendar-next aria-label="'+esc(t.next)+'">›</button></div><div class="dabbirCalendarTitle">'+esc(calendarTitle())+'</div><div class="dabbirCalendarViews"><button type="button" data-calendar-view="day" class="'+(calendarView==='day'?'on':'')+'">'+esc(t.day)+'</button><button type="button" data-calendar-view="week" class="'+(calendarView==='week'?'on':'')+'">'+esc(t.week)+'</button><button type="button" data-calendar-view="month" class="'+(calendarView==='month'?'on':'')+'">'+esc(t.month)+'</button></div></div>'+(selected.scope==='current'?'':'<p class="dabbirBookingScopeHint">'+esc(selected.scope==='review'?labels.reviewHint:labels.historyHint)+'</p>')+body+reader.status(workspace,ar())+'<div class="dabbirCalendarConnections"><div class="dabbirCalendarConnectionsHead"><div><h3>'+esc(t.calendarSync)+'</h3><p>'+esc(t.calendarSyncDesc)+'</p></div></div><div id="dabbirCalendarConnections"></div></div></section>';
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
    if(p.show_appointments){const todayCount=todayAppointments().length,todayStrong=cards[1]?.querySelector('strong'),nextToday=String(todayCount);if(todayStrong&&todayStrong.textContent!==nextToday)todayStrong.textContent=nextToday}
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
      if(id!==businessId())return;
      state=body;lastBusiness=id;calendarConnections=null;calendarConnectionsBusiness=null;applyProfile();
    }catch(error){console.error('dabbir_activity_profile_failed',String(error?.message||error).slice(0,120))}
    finally{loading=false;renderTasks();if(id!==businessId())setTimeout(()=>load(false),0)}
  }

  let profileApplyQueued=false;
  function scheduleProfileApply(){
    if(profileApplyQueued)return;
    profileApplyQueued=true;
    const run=()=>{profileApplyQueued=false;if(workspace?.business?.id)void load(false)};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
  }
  const profileLanguageObserver=new MutationObserver(scheduleProfileApply);
  profileLanguageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  try{
    const baseRenderAllProfile=renderAll;
    renderAll=function(){const result=baseRenderAllProfile.apply(this,arguments);scheduleProfileApply();return result};
  }catch{}
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);setTimeout(applyProfile,0);return result};
  const baseRenderAppointments=typeof window.renderAppointments==='function'?window.renderAppointments:null;
  if(baseRenderAppointments)window.renderAppointments=function(...args){const result=baseRenderAppointments.apply(this,args);setTimeout(renderCalendar,0);return result};
  const params=new URLSearchParams(location.search);
  if(params.get('calendar')){
    setTimeout(()=>{try{if(typeof showScreen==='function')showScreen('appointments');toast(params.get('calendar')==='connected'?copy().calendarConnected:copy().calendarError)}catch{}const u=new URL(location.href);u.searchParams.delete('calendar');u.searchParams.delete('provider');u.searchParams.delete('code');history.replaceState(null,'',u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash)},900);
  }
  // Business changes are driven by renderAll; do not poll the owner shell every 1.2 seconds.
  setTimeout(()=>load(false),500);
  ['dabbir:booking-view-changed','dabbir:booking-data-changed','dabbir:branch-scope-changed'].forEach(name=>window.addEventListener(name,renderCalendar));
  window.__dabbirActivityProfile={ownsCalendar:true,refresh:()=>load(true),refreshCalendar:()=>{renderCalendar();return loadCalendarConnections(true)},version:'activity-profile-v3-calendar'};
})();
(()=>{
  if(window.__dabbirCalendarLiveUi)return;
  const q=s=>document.querySelector(s);
  const PASSIVE_CACHE_MS=60*1000;
  const AUTH_BACKOFF_MS=60*1000;
  let busy=false,lastBusiness=null,lastSyncAt=0,lastBusy=[],lastBusyLoadAt=0;
  let lastConnectionState=null,lastConnectionCheckAt=0,connectionBlockedUntil=0,connectionBlockedError='';
  let syncInFlight=null,forceQueued=false,passiveSyncTimer=null;
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const businessId=()=>{try{return workspace?.business?.id||null}catch{return null}};
  const businessType=()=>{try{return String(workspace?.business?.business_type||'').toLowerCase()}catch{return ''}};
  const screenActive=()=>q('#screen-appointments')?.classList.contains('active');
  const fmt=value=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return String(value||'')}};

  const style=document.createElement('style');
  style.textContent='.dabbirExternalBusy{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}.dabbirExternalBusy h4{font-size:10px;margin:0 0 7px}.dabbirExternalBusyList{display:grid;gap:5px}.dabbirExternalBusyRow{display:flex;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:9px;padding:7px 8px;font-size:8px}.dabbirExternalBusyRow b{font-size:9px}.dabbirExternalBusyRow span{margin-inline-start:auto;color:var(--muted);white-space:nowrap}.dabbirSyncBtn{border:1px solid #414d2a;background:#252c1d;color:#fff;border-radius:9px;padding:6px 9px;min-height:36px;font-size:9px;font-weight:850}.dabbirSyncBtn:disabled{opacity:.55}.salonMode #dabbirApptManage,.salonMode #dabbirGenericCalendar{display:none!important}';
  document.head.append(style);

  function enforceBusinessModeIsolation(){
    if(businessType()==='salon'){
      q('#dabbirApptManage')?.classList.add('hidden');
      q('#dabbirGenericCalendar')?.setAttribute('hidden','');
      q('#appointmentsTable')?.classList.add('hidden');
      q('#dabbirCalendarShell')?.classList.add('hidden');
      return;
    }
    if(document.body.classList.contains('salonMode'))document.body.classList.remove('salonMode');
    ['#appointmentsTable','#dabbirCalendarShell','#dabbirApptManage','#customersTable'].forEach(selector=>q(selector)?.classList.remove('hidden'));
    q('#dabbirGenericCalendar')?.removeAttribute('hidden');
  }

  function bookingStatusNeedsAttention(value){
    const status=String(value||'requested').toLowerCase();
    return ['requested','pending','new','unconfirmed','awaiting_confirmation'].includes(status);
  }

  function renderResolvedAwareNotices(){
    const list=q('#noticeList');if(!list)return;
    let t=null;try{t=typeof T==='function'?T():null}catch{}
    const items=[],now=Date.now(),day=now+86400000;
    (workspace?.handoffs||[]).forEach(h=>items.push({a:h.route_class,b:h.reason||h.state,type:'handoffs'}));
    const upcoming=(workspace?.appointments||[]).filter(a=>{
      const start=new Date(a?.starts_at).getTime();
      return Number.isFinite(start)&&start>=now&&start<=day&&bookingStatusNeedsAttention(a?.status);
    });
    if(upcoming.length)items.push({a:t?.appointments||(ar()?'الحجوزات':'Bookings'),b:(t?.upcomingNotice||(ar()?'حجوزات قادمة:':'Upcoming bookings:'))+' '+upcoming.length,type:'appointments'});
    if(workspace?.whatsapp?.state!=='OPERATIONAL')items.push({a:t?.whatsapp||'WhatsApp',b:t?.whatsappDesc||(ar()?'قناة WhatsApp غير تشغيلية.':'WhatsApp channel is not operational.'),type:'channel_issues'});
    const emptyLabel=t?.noNotices||(ar()?'لا توجد تنبيهات مهمة.':'No important alerts.');
    list.innerHTML=items.length?items.map(x=>'<div class="item" data-notice-type="'+esc(x.type)+'"><div class="grow"><b>'+esc(x.a)+'</b><small>'+esc(x.b)+'</small></div></div>').join(''):'<div class="empty">'+esc(emptyLabel)+'</div>';
  }

  try{
    if(typeof window.renderNotices==='function')window.renderNotices=renderResolvedAwareNotices;
    if(typeof renderNotices==='function')renderNotices=renderResolvedAwareNotices;
  }catch{}

  function sanitizeResolvedBookingNotice(){
    renderResolvedAwareNotices();
  }

  function removeCancelledFromActiveCalendar(){
    enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();
    const screen=q('#screen-appointments');if(!screen||window.__dabbirBookingLifecycle)return;
    screen.querySelectorAll('.dabbirCalEvent.cancelled').forEach(node=>node.remove());
    screen.querySelectorAll('.dabbirAgendaEvent').forEach(node=>{
      const text=String(node.textContent||'').toLowerCase();
      if(text.includes('ملغي')||text.includes('cancelled')||text.includes('canceled'))node.remove();
    });
    sanitizeResolvedBookingNotice();
  }

  function ensureUi(){
    enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();
    const head=q('.dabbirCalendarConnectionsHead'),host=q('#dabbirCalendarConnections');if(!head||!host)return false;
    let btn=q('#dabbirCalendarSyncNow');
    if(!btn){btn=document.createElement('button');btn.id='dabbirCalendarSyncNow';btn.type='button';btn.className='dabbirSyncBtn';btn.onclick=()=>sync(true);head.append(btn)}
    btn.textContent=busy?(ar()?'جارٍ المزامنة…':'Syncing…'):(ar()?'مزامنة الآن':'Sync now');btn.disabled=busy;
    let panel=q('#dabbirExternalBusy');if(!panel){panel=document.createElement('div');panel.id='dabbirExternalBusy';panel.className='dabbirExternalBusy';host.append(panel)}
    renderBusy();removeCancelledFromActiveCalendar();return true;
  }

  function renderBusy(){
    const panel=q('#dabbirExternalBusy');if(!panel)return;
    const now=Date.now(),rows=lastBusy.filter(x=>new Date(x.ends_at).getTime()>now).slice(0,8);
    panel.innerHTML='<h4>'+(ar()?'الأوقات المشغولة من Google / Outlook':'Busy time from Google / Outlook')+'</h4>'+(rows.length?'<div class=\"dabbirExternalBusyList\">'+rows.map(row=>'<div class=\"dabbirExternalBusyRow\"><b>'+esc(row.summary||(ar()?'مشغول':'Busy'))+'</b><span>'+esc(fmt(row.starts_at))+'</span></div>').join('')+'</div>':'<div style=\"font-size:8px;color:var(--muted)\">'+(ar()?'لا توجد أوقات خارجية مشغولة قادمة.':'No upcoming external busy time.')+'</div>');
  }

  function httpError(response,body,fallback){
    const error=new Error(body?.error||fallback);
    error.status=Number(response?.status||0);
    return error;
  }
  function resetPassiveState(id){lastBusiness=id;lastSyncAt=0;lastBusy=[];lastBusyLoadAt=0;lastConnectionState=null;lastConnectionCheckAt=0;connectionBlockedUntil=0;connectionBlockedError=''}
  async function connectionState(id,force=false){
    const now=Date.now();
    if(!force&&connectionBlockedUntil>now){const error=new Error(connectionBlockedError||'AUTH_REQUIRED');error.status=401;throw error}
    if(!force&&lastConnectionState&&lastBusiness===id&&now-lastConnectionCheckAt<PASSIVE_CACHE_MS)return lastConnectionState;
    const response=await fetch('/api/calendar-connections?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok){const error=httpError(response,body,'CALENDAR_CONNECTIONS_FAILED');if(error.status===401||error.status===403){connectionBlockedUntil=Date.now()+AUTH_BACKOFF_MS;connectionBlockedError=String(error.message||'AUTH_REQUIRED')}throw error}
    lastConnectionState=body;lastConnectionCheckAt=Date.now();connectionBlockedUntil=0;connectionBlockedError='';return body;
  }
  async function loadBusy(id,force=false){
    const now=Date.now();
    if(!force&&lastBusiness===id&&lastBusyLoadAt&&now-lastBusyLoadAt<PASSIVE_CACHE_MS){renderBusy();removeCancelledFromActiveCalendar();return}
    const response=await fetch('/api/calendar-sync?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw httpError(response,body,'CALENDAR_BUSY_FAILED');
    lastBusy=Array.isArray(body.busy_blocks)?body.busy_blocks:[];lastBusyLoadAt=Date.now();renderBusy();removeCancelledFromActiveCalendar();
  }
  async function runSync(force=false){
    enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();
    const id=businessId();if(!id)return;ensureUi();if(id!==lastBusiness)resetPassiveState(id);
    try{
      const connections=await connectionState(id,force),active=(connections.connections||[]).filter(c=>c.status==='active'&&c.sync_enabled!==false);
      if(!active.length){lastBusy=[];lastBusyLoadAt=Date.now();renderBusy();removeCancelledFromActiveCalendar();return}
      const due=force||Date.now()-lastSyncAt>5*60*1000;
      if(due){busy=true;ensureUi();const response=await fetch('/api/calendar-sync',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id})});const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw httpError(response,body,'CALENDAR_SYNC_FAILED');lastSyncAt=Date.now();lastBusyLoadAt=0;try{window.__dabbirActivityProfile?.refresh?.()}catch{}}
      await loadBusy(id,due||force);removeCancelledFromActiveCalendar();if(force)try{toast(ar()?'تمت مزامنة التقويم':'Calendar synced')}catch{}
    }catch(error){const status=Number(error?.status||0);if(force||status>=500||status===0)console.error('dabbir_calendar_live_ui_failed',String(error?.message||error).slice(0,120));if(force)try{toast(ar()?'تعذرت مزامنة التقويم':'Calendar sync failed')}catch{}}
    finally{busy=false;ensureUi();removeCancelledFromActiveCalendar();sanitizeResolvedBookingNotice()}
  }
  async function sync(force=false){if(!businessId())return;if(syncInFlight){if(force)forceQueued=true;return syncInFlight}const request=runSync(force);syncInFlight=request;try{return await request}finally{if(syncInFlight===request)syncInFlight=null;if(forceQueued){forceQueued=false;setTimeout(()=>sync(true),0)}}}
  function schedulePassiveSync(){if(passiveSyncTimer)return;passiveSyncTimer=setTimeout(()=>{passiveSyncTimer=null;enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();if(screenActive()&&businessId()){ensureUi();void sync(false)}},150)}

  const calendarScreen=q('#screen-appointments');
  if(calendarScreen){
    const activationObserver=new MutationObserver(schedulePassiveSync);
    activationObserver.observe(calendarScreen,{attributes:true,attributeFilter:['class']});
  }
  if(calendarScreen){const calendarObserver=new MutationObserver(()=>setTimeout(()=>{removeCancelledFromActiveCalendar();sanitizeResolvedBookingNotice()},0));calendarObserver.observe(calendarScreen,{subtree:true,childList:true})}
  setInterval(()=>{enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();if(screenActive()&&businessId()){removeCancelledFromActiveCalendar();void sync(false)}},60000);
  setTimeout(()=>{enforceBusinessModeIsolation();sanitizeResolvedBookingNotice();if(screenActive()&&businessId()){removeCancelledFromActiveCalendar();void sync(false)}},1200);
  setTimeout(renderResolvedAwareNotices,0);
  window.__dabbirCalendarLiveUi={sync:()=>sync(true),refreshBusy:()=>businessId()?loadBusy(businessId(),true):Promise.resolve(),sanitize:removeCancelledFromActiveCalendar,sanitizeNotices:renderResolvedAwareNotices,version:'calendar-live-v9-salon-single-booking-surface'};
})();
(()=>{
  if(window.__dabbirAppointmentManagementUi)return;
  window.__dabbirAppointmentManagementUi=true;
  const lifecycle=window.__dabbirBookingLifecycle,reader=window.__dabbirBookingReader;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const ws=()=>{try{return typeof workspace!=='undefined'?workspace:null}catch{return null}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    title:'إدارة الحجوزات',desc:'الحجوزات المطابقة للعرض والفترة المختارة في التقويم. السجل السابق محفوظ.',
    customer:'العميل',time:'الموعد',status:'الحالة',edit:'تعديل',del:'إلغاء الحجز',save:'حفظ التعديل',cancel:'إلغاء',
    editTitle:'تعديل الموعد',deleteTitle:'إلغاء الحجز؟',deleteBody:'يُلغى الحجز مع حفظه في السجل، وتُجدول مزامنة التقويم المرتبط.',
    requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',new:'جديد',arrived:'وصل',in_progress:'قيد التنفيذ',no_show:'لم يحضر',details:'تفاصيل الحجز',
    saved:'تم تعديل الموعد.',deleted:'تم إلغاء الحجز وحفظه في السجل.',deletePending:'تم إلغاء الموعد، لكن حذف التقويم الخارجي يحتاج إعادة مزامنة.',
    failed:'تعذر إكمال العملية.',past:'لا يمكن تعديل موعد مضى وقته.',empty:'لا توجد حجوزات لإدارتها.',
    calendar:'التقويم',day:'يومي',week:'أسبوعي',month:'شهري',today:'اليوم',previous:'السابق',next:'التالي',noBookings:'لا توجد حجوزات في هذه الفترة',more:'أخرى'
  }:{
    title:'Manage bookings',desc:'Bookings for the same view and period as the calendar. Historical records are retained.',
    customer:'Customer',time:'Booking',status:'Status',edit:'Edit',del:'Cancel booking',save:'Save changes',cancel:'Cancel',
    editTitle:'Edit booking',deleteTitle:'Cancel booking?',deleteBody:'Cancel the booking, retain its history and queue connected-calendar reconciliation.',
    requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',new:'New',arrived:'Arrived',in_progress:'In progress',no_show:'No-show',details:'Booking details',
    saved:'Booking updated.',deleted:'Booking cancelled and retained in history.',deletePending:'Booking was cancelled, but the external calendar delete still needs reconciliation.',
    failed:'Could not complete the action.',past:'Past bookings cannot be rescheduled.',empty:'No bookings to manage.',
    calendar:'Calendar',day:'Day',week:'Week',month:'Month',today:'Today',previous:'Previous',next:'Next',noBookings:'No bookings in this period',more:'more'
  };

  const style=document.createElement('style');
  style.textContent='.dabbirApptManage{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirApptManageHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.dabbirApptManageHead h3{font-size:13px;margin:0 0 4px}.dabbirApptManageHead p{font-size:9px;color:var(--muted);margin:0;line-height:1.55}.dabbirApptManageList{display:grid;gap:7px}.dabbirApptManageRow{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(135px,1fr) 90px auto;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:11px;padding:9px}.dabbirApptManageRow b{font-size:10px}.dabbirApptManageRow span{font-size:9px;color:var(--muted)}.dabbirApptManageActions{display:flex;gap:6px;justify-content:flex-end}.dabbirApptManageActions button{min-height:34px;border-radius:9px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirApptEdit{border:1px solid #414d2a;background:#252c1d;color:#fff}.dabbirApptDelete{border:1px solid #5b2b2b;background:#32191a;color:#ffb9b9}.dabbirApptEdit:disabled{opacity:.45}.dabbirApptEmpty{border:1px dashed #31363c;border-radius:11px;padding:16px;text-align:center;color:var(--muted);font-size:9px}.dabbirApptModal{position:fixed;inset:0;z-index:90;background:#000b;display:none;align-items:center;justify-content:center;padding:18px}.dabbirApptModal.open{display:flex}.dabbirApptModalBox{width:min(430px,100%);background:#131518;border:1px solid #343940;border-radius:18px;padding:16px}.dabbirApptModalBox h3{margin:0 0 10px;font-size:14px}.dabbirApptField{display:grid;gap:5px;margin-top:9px}.dabbirApptField label{font-size:9px;color:var(--muted)}.dabbirApptField input,.dabbirApptField select{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:9px;min-height:42px}.dabbirApptModalActions{display:flex;gap:7px;justify-content:flex-end;margin-top:13px}.dabbirApptModalActions button{border-radius:10px;padding:8px 11px;font-weight:850}.dabbirApptModalActions .save{border:0;background:var(--accent);color:#10130b}.dabbirApptModalActions .cancel{border:1px solid var(--line);background:#181b1f;color:#fff}.dabbirGenericCalendar{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirGenericCalendar[hidden]{display:none}.dabbirGenericCalendarHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dabbirGenericCalendarTitle{font-size:13px;font-weight:900}.dabbirGenericCalendarControls,.dabbirGenericCalendarViews{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.dabbirGenericCalendar button{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;min-height:36px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirGenericCalendar button.on{background:var(--accent);color:#10130b;border-color:transparent}.dabbirGenericRange{font-size:9px;color:var(--muted);font-weight:800}.dabbirGenericDay{display:grid;gap:8px}.dabbirGenericTimelineRow{display:grid;grid-template-columns:74px 1fr;gap:8px;align-items:start}.dabbirGenericTimelineTime{font-size:9px;color:var(--muted);padding-top:10px}.dabbirGenericEvent{width:100%;border:1px solid #415d76!important;background:#142c43!important;color:#eaf5ff!important;text-align:start;border-radius:10px!important;padding:9px!important;min-height:48px!important}.dabbirGenericEvent.completed{border-color:#366346!important;background:#17311f!important}.dabbirGenericEvent.cancelled{border-color:#6a3434!important;background:#34191b!important}.dabbirGenericEvent b{display:block;font-size:10px}.dabbirGenericEvent small{display:block;margin-top:4px;opacity:.8;font-size:8px}.dabbirGenericWeek{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:6px;min-width:1050px}.dabbirGenericWeekWrap,.dabbirGenericMonthWrap{overflow:auto}.dabbirGenericWeekDay{border:1px solid #292f34;background:#15181b;border-radius:11px;padding:7px;min-height:160px}.dabbirGenericWeekHead{font-size:9px;font-weight:900;margin-bottom:7px}.dabbirGenericWeekEvents{display:grid;gap:5px}.dabbirGenericWeekEvents .dabbirGenericEvent{min-height:42px!important;padding:7px!important}.dabbirGenericMonth{display:grid;grid-template-columns:repeat(7,minmax(105px,1fr));gap:5px;min-width:735px}.dabbirGenericMonthDay{border:1px solid #292f34;background:#15181b;border-radius:10px;min-height:105px;padding:6px}.dabbirGenericMonthDay.out{opacity:.42}.dabbirGenericMonthDay.today{border-color:var(--accent)}.dabbirGenericMonthDate{font-size:9px;font-weight:900;margin-bottom:4px}.dabbirGenericMonthEvent{display:block;width:100%;border:0!important;background:#142c43!important;color:#fff!important;border-radius:6px!important;min-height:0!important;padding:4px!important;margin-top:3px;text-align:start;font-size:8px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dabbirGenericEmpty{border:1px dashed #31363c;border-radius:11px;padding:18px;text-align:center;color:var(--muted);font-size:9px}@media(max-width:700px){.dabbirApptManageRow{grid-template-columns:1fr}.dabbirApptManageActions{justify-content:stretch}.dabbirApptManageActions button{flex:1}.dabbirApptManageHead{display:block}.dabbirGenericCalendarHead{align-items:flex-start}.dabbirGenericTimelineRow{grid-template-columns:58px 1fr}}';
  style.textContent+='.dabbirApptModalBox{box-sizing:border-box;min-width:0;max-height:calc(100dvh - 36px);overflow:auto}.dabbirApptField{min-width:0}.dabbirApptField input,.dabbirApptField select{box-sizing:border-box;min-width:0;max-width:100%;font-size:16px;min-height:44px}.dabbirApptManageActions button{min-height:44px}';
  document.head.append(style);

  let signature='',editingId=null,editingContext=null,busy=false;
  let calendarView=localStorage.getItem('dabbir_generic_calendar_view')||'week';
  if(!['day','week','month'].includes(calendarView))calendarView='week';
  let calendarCursor=new Date();
  function customerName(id){
    const row=reader.customer(ws(),id)||(ws()?.customers||[]).find(x=>x.id===id);
    return row?.display_name||(ar()?'عميل':'Customer');
  }
  function businessTimezone(){const b=ws()?.business||{};if(b.timezone)return String(b.timezone);const loc=String(b.locale||'ar-AE').toUpperCase();if(loc.endsWith('-SA'))return 'Asia/Riyadh';if(loc.endsWith('-KW'))return 'Asia/Kuwait';if(loc.endsWith('-QA'))return 'Asia/Qatar';if(loc.endsWith('-BH'))return 'Asia/Bahrain';if(loc.endsWith('-OM'))return 'Asia/Muscat';return 'Asia/Dubai'}
  function timezoneParts(date){const f=new Intl.DateTimeFormat('en-CA',{timeZone:businessTimezone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});return Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))}
  function timezoneOffsetMinutes(date){const p=timezoneParts(date),asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);return Math.round((asUtc-date.getTime())/60000)}
  function fmt(value){
    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:businessTimezone()}).format(new Date(value))}catch{return String(value||'')}
  }
  function statusLabel(status){
    const c=copy(),s=String(status||'requested').toLowerCase();
    return c[s]||s;
  }
  function dubaiLocalMinute(date=new Date()){
    const p=timezoneParts(date);
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function isoFromDubaiLocal(value){
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return null;
    const [datePart,timePart]=raw.split('T'),[year,month,day]=datePart.split('-').map(Number),[hour,minute]=timePart.split(':').map(Number);
    const wallUtc=Date.UTC(year,month-1,day,hour,minute,0),guess=new Date(wallUtc);
    let offset=timezoneOffsetMinutes(guess),resolved=new Date(wallUtc-offset*60000),refined=timezoneOffsetMinutes(resolved);
    if(refined!==offset)resolved=new Date(wallUtc-refined*60000);
    return Number.isNaN(resolved.getTime())?null:resolved.toISOString();
  }
  function businessType(){return String(ws()?.business?.business_type||'').toLowerCase()}
  function genericCalendarEnabled(){return !window.__dabbirActivityProfile?.ownsCalendar&&!['store','creator','real_estate','salon'].includes(businessType())}
  function calendarDayKey(value){return lifecycle.dayKey(value,ws()?.business)}
  function calendarWallDate(value){return lifecycle.wallDate(calendarDayKey(value))}
  function startDay(value){return calendarWallDate(value)}
  function addDays(value,n){const d=new Date(value);d.setUTCDate(d.getUTCDate()+n);return d}
  function startWeek(value){const d=startDay(value),dow=(d.getUTCDay()+6)%7;return addDays(d,-dow)}
  function startMonth(value){const d=startDay(value);d.setUTCDate(1);return d}
  function sameDay(a,b){return calendarDayKey(a)===calendarDayKey(b)}
  function dayLabel(value,weekday=true){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:'UTC',weekday:weekday?'short':undefined,month:'short',day:'numeric'}).format(value)}catch{return calendarDayKey(value)}}
  function monthLabel(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:'UTC',month:'long',year:'numeric'}).format(value)}catch{return calendarDayKey(value).slice(0,7)}}
  function timeLabel(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:lifecycle.timezone(ws()?.business),hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
  function activeRows(){return reader.rows(ws())}
  function eventClass(a){const s=String(a.status||'requested').toLowerCase();return s==='completed'?' completed':(s==='cancelled'||s==='canceled'?' cancelled':'')}
  function eventButton(a,compact=false){const name=customerName(a.customer_id),meta=timeLabel(a.starts_at)+' · '+statusLabel(a.status);return '<button type="button" class="'+(compact?'dabbirGenericMonthEvent':'dabbirGenericEvent'+eventClass(a))+'" data-calendar-appt="'+esc(a.id)+'" title="'+esc(fmt(a.starts_at))+'"><b>'+esc(name)+'</b>'+(compact?'':'<small>'+esc(meta)+'</small>')+'</button>'}
  function bindCalendarEvents(host){host.querySelectorAll('[data-calendar-appt]').forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.calendarAppt))}
  function ensureCalendar(){
    const screen=q('#screen-appointments');if(!screen)return null;
    let panel=q('#dabbirGenericCalendar');
    if(!panel){panel=document.createElement('section');panel.id='dabbirGenericCalendar';panel.className='dabbirGenericCalendar';const table=q('#appointmentsTable');if(table?.parentNode)table.parentNode.insertBefore(panel,table);else screen.append(panel)}
    return panel;
  }
  function renderDayCalendar(rows){const c=copy(),key=calendarDayKey(calendarCursor),dayRows=rows.filter(a=>calendarDayKey(a.starts_at)===key);return dayRows.length?'<div class="dabbirGenericDay">'+dayRows.map(a=>'<div class="dabbirGenericTimelineRow"><div class="dabbirGenericTimelineTime">'+esc(timeLabel(a.starts_at))+'</div>'+eventButton(a)+'</div>').join('')+'</div>':'<div class="dabbirGenericEmpty">'+esc(c.noBookings)+'</div>'}
  function renderWeekCalendar(rows){const c=copy(),start=startWeek(calendarCursor),days=Array.from({length:7},(_,i)=>addDays(start,i));return '<div class="dabbirGenericWeekWrap"><div class="dabbirGenericWeek">'+days.map(day=>{const key=calendarDayKey(day),dayRows=rows.filter(a=>calendarDayKey(a.starts_at)===key);return '<div class="dabbirGenericWeekDay"><div class="dabbirGenericWeekHead">'+esc(dayLabel(day))+'</div><div class="dabbirGenericWeekEvents">'+(dayRows.length?dayRows.map(a=>eventButton(a)).join(''):'<div class="dabbirGenericEmpty">'+esc(c.noBookings)+'</div>')+'</div></div>'}).join('')+'</div></div>'}
  function renderMonthCalendar(rows){const c=copy(),month=startMonth(calendarCursor),gridStart=startWeek(month),todayKey=calendarDayKey(new Date());const cells=Array.from({length:42},(_,i)=>addDays(gridStart,i));return '<div class="dabbirGenericMonthWrap"><div class="dabbirGenericMonth">'+cells.map(day=>{const key=calendarDayKey(day),dayRows=rows.filter(a=>calendarDayKey(a.starts_at)===key),outside=day.getUTCMonth()!==month.getUTCMonth(),shown=dayRows.slice(0,3),more=Math.max(0,dayRows.length-shown.length);return '<div class="dabbirGenericMonthDay'+(outside?' out':'')+(key===todayKey?' today':'')+'"><div class="dabbirGenericMonthDate">'+esc(String(day.getUTCDate()))+'</div>'+shown.map(a=>eventButton(a,true)).join('')+(more?'<div class="dabbirGenericRange">+'+more+' '+esc(c.more)+'</div>':'')+'</div>'}).join('')+'</div></div>'}
  function calendarRangeLabel(){if(calendarView==='day')return dayLabel(calendarCursor);if(calendarView==='month')return monthLabel(calendarCursor);const start=startWeek(calendarCursor),end=addDays(start,6);return dayLabel(start,false)+' – '+dayLabel(end,false)}
  function moveCalendar(direction){lifecycle.move(ws(),direction)}
  function renderCalendar(rows){
    if(window.__dabbirActivityProfile?.ownsCalendar){q('#dabbirGenericCalendar')?.remove();return}
    const panel=ensureCalendar();if(!panel)return;
    const enabled=genericCalendarEnabled();panel.hidden=!enabled;
    const table=q('#appointmentsTable');if(table)table.style.display=enabled?'none':'';
    if(!enabled)return;
    const c=copy();
    const body=calendarView==='day'?renderDayCalendar(rows):(calendarView==='month'?renderMonthCalendar(rows):renderWeekCalendar(rows));
    panel.innerHTML='<div class="dabbirGenericCalendarHead"><div><div class="dabbirGenericCalendarTitle">'+esc(c.calendar)+'</div><div class="dabbirGenericRange">'+esc(calendarRangeLabel())+'</div></div><div class="dabbirGenericCalendarViews"><button type="button" data-calendar-view="day" class="'+(calendarView==='day'?'on':'')+'">'+esc(c.day)+'</button><button type="button" data-calendar-view="week" class="'+(calendarView==='week'?'on':'')+'">'+esc(c.week)+'</button><button type="button" data-calendar-view="month" class="'+(calendarView==='month'?'on':'')+'">'+esc(c.month)+'</button></div><div class="dabbirGenericCalendarControls"><button type="button" data-calendar-nav="prev" aria-label="'+esc(c.previous)+'">‹</button><button type="button" data-calendar-nav="today">'+esc(c.today)+'</button><button type="button" data-calendar-nav="next" aria-label="'+esc(c.next)+'">›</button></div></div>'+body;
    panel.querySelectorAll('[data-calendar-view]').forEach(btn=>btn.onclick=()=>{lifecycle.setView(ws(),{view:btn.dataset.calendarView,allDates:false})});
    panel.querySelector('[data-calendar-nav="prev"]')?.addEventListener('click',()=>moveCalendar(-1));
    panel.querySelector('[data-calendar-nav="next"]')?.addEventListener('click',()=>moveCalendar(1));
    panel.querySelector('[data-calendar-nav="today"]')?.addEventListener('click',()=>{lifecycle.setView(ws(),{day:lifecycle.dayKey(Date.now(),ws().business),allDates:false,followToday:true})});
    bindCalendarEvents(panel);
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
    const w=ws();if(!w?.business||businessType()==='salon')return;
    const panel=ensurePanel();if(!panel)return;
    if(q('#screen-appointments')?.classList.contains('active'))void reader.ensure(w);
    const selected=lifecycle.getView(w),entry=reader.entry(w),rows=activeRows();
    calendarView=selected.view;calendarCursor=lifecycle.wallDate(selected.day);
    const nextSig=JSON.stringify([lifecycle.contextKey(w),selected,ar(),entry.loading,entry.error,entry.ready,entry.total,rows.map(a=>[a.id,a.starts_at,a.ends_at,a.status,customerName(a.customer_id)])]);
    if(nextSig===signature&&panel.dataset.ready==='1')return;
    signature=nextSig;panel.dataset.ready='1';
    renderCalendar(rows);
    const c=copy(),labels=lifecycle.labels(ar()),primary=window.__dabbirActivityProfile?.ownsCalendar;
    panel.innerHTML='<div class="dabbirApptManageHead"><div><h3>'+esc(c.title+' — '+labels[selected.scope])+'</h3><p>'+esc(c.desc)+'</p></div></div>'+(!primary?lifecycle.controls(w,[],ar()):'')+'<div class="dabbirApptManageList">'+(rows.length?rows.map(a=>{
      const history=lifecycle.terminal(a);
      return '<div class="dabbirApptManageRow" data-appt-row="'+esc(a.id)+'"><b>'+esc(customerName(a.customer_id))+'</b><span>'+esc(fmt(a.starts_at))+'</span><span>'+esc(statusLabel(a.status))+'</span><div class="dabbirApptManageActions"><button type="button" class="dabbirApptEdit" data-appt-edit="'+esc(a.id)+'">'+esc(history?c.details:c.edit)+'</button>'+(!history?'<button type="button" class="dabbirApptDelete" data-appt-delete="'+esc(a.id)+'">'+esc(c.del)+'</button>':'')+'</div></div>';
    }).join(''):entry.ready&&!entry.error?'<div class="dabbirApptEmpty">'+esc(c.empty)+'</div>':'')+'</div>'+(!primary?reader.status(w,ar()):'');
    panel.querySelectorAll('[data-appt-edit]').forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.apptEdit));
    panel.querySelectorAll('[data-appt-delete]').forEach(btn=>btn.onclick=()=>removeAppointment(btn.dataset.apptDelete));
    panel.querySelectorAll('[data-booking-scope]').forEach(btn=>btn.onclick=()=>lifecycle.setView(w,{scope:btn.dataset.bookingScope}));
    reader.bind(panel,w);
  }
  function openEdit(id){
    const w=ws(),a=reader.find(w,id);if(!a||!lifecycle.inContext(a,w))return;
    editingId=id;editingContext={key:lifecycle.contextKey(w),business_id:w.business.id,branch_id:a.branch_id,starts_at:a.starts_at,local_start:a.starts_at?dubaiLocalMinute(new Date(a.starts_at)):'',history:lifecycle.terminal(a)};
    const c=copy(),modal=ensureModal(),readonly=editingContext.history;
    modal.innerHTML='<form class="dabbirApptModalBox" id="dabbirApptEditForm"><h3>'+esc(readonly?c.details:c.editTitle)+'</h3><div class="dabbirApptField"><label>'+esc(c.customer)+'</label><input value="'+esc(customerName(a.customer_id))+'" disabled></div><div class="dabbirApptField"><label for="dabbirApptEditTime">'+esc(c.time)+'</label><input id="dabbirApptEditTime" type="datetime-local" dir="ltr" value="'+esc(a.starts_at?dubaiLocalMinute(new Date(a.starts_at)):'')+'" '+(readonly?'disabled':'required')+'></div><div class="dabbirApptField"><label for="dabbirApptEditStatus">'+esc(c.status)+'</label><select id="dabbirApptEditStatus" '+(readonly?'disabled':'')+'>'+['requested','new','confirmed','rescheduled','arrived','in_progress','completed','cancelled','no_show'].map(status=>'<option value="'+status+'" '+(lifecycle.status(a)===status?'selected':'')+'>'+esc(c[status])+'</option>').join('')+'</select></div><div class="dabbirApptModalActions"><button type="button" class="cancel" id="dabbirApptEditCancel">'+esc(c.cancel)+'</button>'+(!readonly?'<button type="submit" class="save">'+esc(c.save)+'</button>':'')+'</div></form>';
    q('#dabbirApptEditCancel').onclick=closeModal;
    q('#dabbirApptEditForm').onsubmit=saveEdit;
    modal.onclick=e=>{if(e.target===modal)closeModal()};
    modal.classList.add('open');if(!readonly)setTimeout(()=>q('#dabbirApptEditTime')?.focus(),0);
  }
  function closeModal(){q('#dabbirApptEditModal')?.classList.remove('open');editingId=null;editingContext=null}
  async function request(body){
    const response=await fetch('/api/appointment-management',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json','x-dabbir-client':'web'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));return {response,data};
  }
  function applySaved(w,id,row){
    if(!row||row.id!==id||(row.business_id&&row.business_id!==w.business.id))throw new Error('SAVED_BOOKING_MISMATCH');
    const cached=(w.appointments||[]).find(a=>a.id===id);if(cached)Object.assign(cached,row);
    reader.invalidate(w);signature='';render();
  }
  async function saveEdit(event){
    event.preventDefault();if(busy||!editingId||!editingContext||editingContext.history)return;
    const w=ws(),context={...editingContext},id=editingId;
    if(lifecycle.contextKey(w)!==context.key){closeModal();return}
    const localStart=q('#dabbirApptEditTime')?.value,start=isoFromDubaiLocal(localStart),status=q('#dabbirApptEditStatus')?.value;if(!start)return;
    const body={action:'update',business_id:context.business_id,appointment_id:id,status};
    if(context.branch_id)body.branch_id=context.branch_id;
    // datetime-local displays minutes. A status-only edit must preserve the
    // original seconds and must not accidentally reschedule historical work.
    if(localStart!==context.local_start&&new Date(start).getTime()!==new Date(context.starts_at).getTime())body.starts_at=start;
    busy=true;const submit=event.submitter;if(submit)submit.disabled=true;
    try{
      const {response,data}=await request(body);
      if(!response.ok||!data.ok)throw new Error(data.error||copy().failed);
      if(lifecycle.contextKey(ws())!==context.key)return;
      closeModal();applySaved(ws(),id,data.appointment);try{toast(copy().saved)}catch{}
    }catch(error){if(lifecycle.contextKey(ws())===context.key)try{toast(copy().failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false;if(submit)submit.disabled=false}
  }
  async function removeAppointment(id){
    if(busy)return;const w=ws(),a=reader.find(w,id);if(!a||!lifecycle.inContext(a,w)||lifecycle.terminal(a))return;
    const c=copy(),context=lifecycle.contextKey(w),businessId=w.business.id,branchId=a.branch_id;
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:c.deleteTitle,body:c.deleteBody}):window.confirm(c.deleteTitle+'\n'+c.deleteBody);
    if(!confirmed||lifecycle.contextKey(ws())!==context)return;
    busy=true;
    try{
      const {response,data}=await request({action:'delete',business_id:businessId,appointment_id:id,...(branchId?{branch_id:branchId}:{})});
      if(!response.ok||!data.ok)throw new Error(data.error||c.failed);
      if(lifecycle.contextKey(ws())!==context)return;
      applySaved(ws(),id,data.appointment);try{toast(c.deleted)}catch{}
    }catch(error){if(lifecycle.contextKey(ws())===context)try{toast(c.failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false}
  }

  const appointmentScreen=q('#screen-appointments');
  if(appointmentScreen){
    const screenObserver=new MutationObserver(()=>{if(appointmentScreen.classList.contains('active'))setTimeout(render,0)});
    screenObserver.observe(appointmentScreen,{attributes:true,attributeFilter:['class']});
  }
  const appointmentTable=q('#appointmentsTable');
  if(appointmentTable){
    const tableObserver=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});
    tableObserver.observe(appointmentTable,{childList:true});
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#dabbirApptEditModal.open'))closeModal()});
  setTimeout(render,500);
  ['dabbir:booking-view-changed','dabbir:booking-data-changed','dabbir:branch-scope-changed'].forEach(name=>window.addEventListener(name,()=>{if(editingContext&&editingContext.key!==lifecycle.contextKey(ws()))closeModal();render()}));
  window.__dabbirAppointmentManagement={render,open:openEdit,supportsHistoricalEdit:true,version:'appointment-management-v2-generic-calendar'};
})();
(()=>{
  if(window.__dabbirSalonMode)return;
  const lifecycle=window.__dabbirBookingLifecycle,reader=window.__dabbirBookingReader;
  let dataContext=null;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,business=null,loading=false,view=localStorage.getItem('dabbir_salon_calendar_view')||'day',cursor=new Date(),dragAppointment=null,reports=null;
  if(!['day','week','month'].includes(view))view='day';
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    mode:'وضع الصالون',today:'اليوم',calendar:'الحجوزات',customers:'العميلات',team:'الموظفات',services:'الخدمات',reports:'التقارير',reminders:'التذكيرات',quickBooking:'حجز سريع',refresh:'تحديث',loading:'جارٍ تحميل وضع الصالون…',empty:'لا توجد بيانات بعد.',day:'يومي',week:'أسبوعي',month:'شهري',previous:'السابق',next:'التالي',bookings:'حجوزات اليوم',upNext:'القادمة الآن',unconfirmed:'غير مؤكدة',completed:'مكتملة',cancelled:'ملغية',noShow:'لم تحضر',expectedRevenue:'الإيراد المتوقع',realizedRevenue:'الإيراد المحقق',commissions:'العمولات',gaps:'الفراغات',presentTeam:'الموظفات اليوم',attention:'تحتاج انتباهك',conflict:'الموعد يتعارض مع حجز أو وقت غير متاح.',customer:'العميلة',phone:'الهاتف',service:'الخدمة',employee:'الموظفة',time:'الوقت',discount:'الخصم',notes:'ملاحظات',source:'مصدر الحجز',price:'السعر',duration:'المدة',confirmBooking:'تأكيد الحجز',newCustomer:'عميلة جديدة',existingCustomer:'عميلة موجودة',lastVisit:'آخر زيارة',lastService:'آخر خدمة',preferredEmployee:'الموظفة المفضلة',importantNotes:'الملاحظات المهمة',statusNew:'جديد',statusConfirmed:'مؤكد',statusArrived:'وصلت',statusProgress:'جاري',statusCompleted:'مكتمل',statusCancelled:'ملغي',statusNoShow:'لم تحضر',pay:'تسجيل الدفع',paymentMethod:'طريقة الدفع',cash:'نقدي',card:'بطاقة',paymentLink:'رابط دفع',other:'أخرى',unpaid:'غير مدفوع',amount:'المبلغ',save:'حفظ',close:'إغلاق',rebook:'إعادة الحجز',twoWeeks:'بعد أسبوعين',threeWeeks:'بعد 3 أسابيع',fourWeeks:'بعد 4 أسابيع',sixWeeks:'بعد 6 أسابيع',customDate:'اختيار تاريخ',workerName:'اسم الموظفة',jobTitle:'الوظيفة',commissionType:'نوع العمولة',percentage:'نسبة %',fixed:'مبلغ ثابت',commissionValue:'قيمة العمولة',addEmployee:'إضافة موظفة',workingHours:'ساعات العمل',applyDefaultHours:'دوام 9–6 طوال الأسبوع',assignedServices:'الخدمات المقدمة',serviceNameAr:'اسم الخدمة بالعربية',serviceNameEn:'اسم الخدمة بالإنجليزية',category:'الفئة',addService:'إضافة خدمة',customer360:'ملف العميلة 360°',visits:'الزيارات',spend:'إجمالي الإنفاق',noShowRate:'نسبة عدم الحضور',history:'السجل',payments:'المدفوعات',warningNoShow:'هذه العميلة لديها سجل عدم حضور متكرر. يمكن طلب عربون للحجز القادم.',retention:'لم تعد منذ 45 يومًا',revenueReport:'الإيرادات',employeeReport:'أداء الموظفات',servicesReport:'أفضل الخدمات',recurringReport:'العميلات المتكررات',inactiveReport:'العميلات اللاتي لم يعدن',noShowReport:'عدم الحضور',cancellationReport:'الإلغاءات',peakReport:'أوقات الذروة',gapReport:'الفراغات',commissionReport:'العمولات',reminderBooking:'بعد إنشاء الحجز',reminder24:'قبل الموعد بـ24 ساعة',reminder2:'قبل الموعد بساعتين',saved:'تم الحفظ',failed:'تعذر إكمال العملية',waitlist:'قائمة الانتظار',addWaitlist:'إضافة لقائمة الانتظار',date:'التاريخ',from:'من',to:'إلى',expires:'تنتهي في',availableGap:'فترة فارغة',dragHint:'اسحبي الموعد إلى وقت أو موظفة أخرى. استخدمي −/+ لتغيير المدة.',minutes:'دقيقة',showing:'الفترة المعروضة',paymentStatus:'حالة الدفع',noDuplicate:'يُرسل كل تذكير مرة واحدة فقط.',whatsappWorkflow:'تأكيدات وتذكيرات WhatsApp مرتبطة بالحجز، وليست شاشة منفصلة.',appointmentDetails:'تفاصيل الموعد',employeeRequired:'أضيفي موظفة أولًا.',serviceCatalogRequired:'أضيفي خدمة أولًا.',employeeServicesRequired:'أسندي خدمة واحدة على الأقل للموظفة من شاشة الموظفات.',serviceRequired:'اختاري الموظفة أولًا لعرض الخدمات التي تقدمها.',unassigned:'غير مسند',endOfDay:'ملخص اليوم',bestEmployee:'أفضل موظفة',bestService:'أفضل خدمة',rebookCandidates:'عميلات يُفضّل إعادة حجزهن'
  }:{
    mode:'Salon Mode',today:'Today',calendar:'Bookings',customers:'Clients',team:'Team',services:'Services',reports:'Reports',reminders:'Reminders',quickBooking:'Quick booking',refresh:'Refresh',loading:'Loading Salon Mode…',empty:'No data yet.',day:'Day',week:'Week',month:'Month',previous:'Previous',next:'Next',bookings:'Today bookings',upNext:'Up next',unconfirmed:'Unconfirmed',completed:'Completed',cancelled:'Cancelled',noShow:'No-show',expectedRevenue:'Expected revenue',realizedRevenue:'Realized revenue',commissions:'Commissions',gaps:'Gaps',presentTeam:'Team working today',attention:'Needs attention',conflict:'The booking overlaps another appointment or unavailable time.',customer:'Client',phone:'Phone',service:'Service',employee:'Employee',time:'Time',discount:'Discount',notes:'Notes',source:'Booking source',price:'Price',duration:'Duration',confirmBooking:'Confirm booking',newCustomer:'New client',existingCustomer:'Existing client',lastVisit:'Last visit',lastService:'Last service',preferredEmployee:'Preferred employee',importantNotes:'Important notes',statusNew:'New',statusConfirmed:'Confirmed',statusArrived:'Arrived',statusProgress:'In progress',statusCompleted:'Completed',statusCancelled:'Cancelled',statusNoShow:'No-show',pay:'Record payment',paymentMethod:'Payment method',cash:'Cash',card:'Card',paymentLink:'Payment link',other:'Other',unpaid:'Unpaid',amount:'Amount',save:'Save',close:'Close',rebook:'Rebook',twoWeeks:'In 2 weeks',threeWeeks:'In 3 weeks',fourWeeks:'In 4 weeks',sixWeeks:'In 6 weeks',customDate:'Choose date',workerName:'Employee name',jobTitle:'Job title',commissionType:'Commission type',percentage:'Percentage %',fixed:'Fixed amount',commissionValue:'Commission value',addEmployee:'Add employee',workingHours:'Working hours',applyDefaultHours:'Apply 9–6 all week',assignedServices:'Assigned services',serviceNameAr:'Arabic service name',serviceNameEn:'English service name',category:'Category',addService:'Add service',customer360:'Client 360°',visits:'Visits',spend:'Total spend',noShowRate:'No-show rate',history:'History',payments:'Payments',warningNoShow:'This client has repeated no-shows. You can request a deposit for the next booking.',retention:'Has not returned for 45 days',revenueReport:'Revenue',employeeReport:'Employee performance',servicesReport:'Top services',recurringReport:'Repeat clients',inactiveReport:'Clients who did not return',noShowReport:'No-show',cancellationReport:'Cancellations',peakReport:'Peak times',gapReport:'Gaps',commissionReport:'Commissions',reminderBooking:'After booking',reminder24:'24 hours before',reminder2:'2 hours before',saved:'Saved',failed:'The operation could not be completed',waitlist:'Waitlist',addWaitlist:'Add to waitlist',date:'Date',from:'From',to:'To',expires:'Expires',availableGap:'Available gap',dragHint:'Drag a booking to another time or employee. Use −/+ to change duration.',minutes:'minutes',showing:'Showing',paymentStatus:'Payment status',noDuplicate:'Each reminder is sent once only.',whatsappWorkflow:'WhatsApp confirmations and reminders belong to the booking workflow, not a separate screen.',appointmentDetails:'Appointment details',employeeRequired:'Add an employee first.',serviceCatalogRequired:'Add a service first.',employeeServicesRequired:'Assign at least one service to the employee from the Team screen.',serviceRequired:'Choose the employee first to show the services they provide.',unassigned:'Unassigned',endOfDay:'End-of-day summary',bestEmployee:'Top employee',bestService:'Top service',rebookCandidates:'Clients to rebook'
  };
  const money=v=>new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{style:'currency',currency:'AED',maximumFractionDigits:2}).format(Number(v||0));
  const fmt=(v,opts={dateStyle:'medium',timeStyle:'short'})=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{...opts,timeZone:lifecycle.timezone(workspace?.business)}).format(new Date(v))}catch{return String(v||'')}};
  const key=v=>lifecycle.dayKey(v,workspace?.business);
  const startDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
  const plus=(d,days)=>{const x=new Date(d);x.setDate(x.getDate()+days);return x};
  const startWeek=d=>{const x=startDay(d),n=(x.getDay()+6)%7;x.setDate(x.getDate()-n);return x};
  const id=()=>workspace?.business?.id||null;
  const isSalon=()=>String(workspace?.business?.business_type||'').toLowerCase()==='salon';
  const worker=x=>(data?.workers||[]).find(w=>w.id===x);
  const service=x=>(data?.services||[]).find(s=>s.id===x);
  const customer=x=>reader.customer(workspace,x)||(data?.customers||[]).find(c=>c.id===x);
  const appointment=x=>reader.find(workspace,x)||(data?.appointments||[]).find(a=>a.id===x);
  const api=async(resource='',options={})=>{const path='/api/salon-operations'+resource;const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},...options});const body=await response.json().catch(()=>({}));if(!response.ok||!body.ok)throw new Error(body.error||'SALON_OPERATION_FAILED');return body};
  const post=async body=>{const w=workspace,context=lifecycle.contextKey(w),result=await api('',{method:'POST',body:JSON.stringify({business_id:id(),...body})});reader.invalidate(w);if(lifecycle.contextKey(workspace)!==context)throw new Error('BOOKING_CONTEXT_CHANGED');return result};
  function notify(message){try{toast(message)}catch{console.log(message)}}

  const style=document.createElement('style');
  style.textContent='.salonOnly{display:none}.salonMode .salonOnly{display:block}.salonToolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}.salonToolbarGroup{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.salonToolbar button,.salonBtn{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;min-height:38px;padding:7px 10px;font-size:10px;font-weight:850}.salonToolbar button.on,.salonBtn.primary{background:var(--accent);color:#10130b;border-color:transparent}.salonCalendar{border:1px solid var(--line);border-radius:18px;background:#111315;overflow:hidden}.salonCalendarScroll{overflow:auto}.salonDayGrid{display:grid;min-width:760px}.salonCorner,.salonWorkerHead,.salonTime,.salonSlot{border-bottom:1px solid #24282d;border-inline-end:1px solid #24282d}.salonCorner,.salonWorkerHead{position:sticky;top:0;z-index:4;background:#15181b;padding:10px;text-align:center;font-size:10px;font-weight:900}.salonCorner{inset-inline-start:0;z-index:5}.salonTime{position:sticky;inset-inline-start:0;z-index:2;background:#111315;color:var(--muted);font-size:9px;padding:12px 6px;text-align:center;min-height:58px}.salonSlot{min-height:58px;padding:3px;background:#131619}.salonSlot:hover,.salonSlot.dragover{background:#1d2219}.salonEvent{border:1px solid #415d76;background:#142c43;color:#eaf5ff;border-radius:9px;padding:6px;min-height:48px;font-size:9px;cursor:grab}.salonEvent.completed{border-color:#366346;background:#17311f}.salonEvent.cancelled,.salonEvent.no_show{border-color:#6a3434;background:#34191b}.salonEvent.new{border-color:#64572e;background:#3a3014}.salonEvent b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.salonEvent small{display:block;color:#c6ccd2;margin-top:3px}.salonEventActions{display:flex;gap:3px;margin-top:4px}.salonEventActions button{border:0;background:#ffffff18;color:#fff;border-radius:6px;min-height:24px;padding:2px 6px}.salonWeek{display:grid;grid-template-columns:repeat(7,minmax(240px,1fr));gap:7px;min-width:1680px;padding:8px}.salonWeekDay{border:1px solid #292f34;border-radius:12px;background:#15181b;padding:7px}.salonWeekHead{font-size:10px;font-weight:900;margin-bottom:7px}.salonWeekWorker{border-top:1px solid #2b3035;padding-top:6px;margin-top:6px}.salonWeekWorker>span{font-size:8px;color:var(--muted)}.salonMonth{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr));gap:5px;min-width:770px;padding:8px}.salonMonthDay{border:1px solid #292f34;border-radius:10px;background:#15181b;min-height:110px;padding:6px}.salonMonthDay.today{border-color:var(--accent)}.salonMonthDate{font-size:9px;font-weight:900}.salonMonthEvent{display:block;width:100%;border:0;border-radius:6px;background:#142c43;color:#fff;min-height:0;padding:4px;margin-top:4px;text-align:start;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.salonHint{color:var(--muted);font-size:9px;margin:7px 0 0}.salonToday{margin-bottom:12px}.salonMetrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.salonMetric{border:1px solid var(--line);border-radius:14px;background:#15181b;padding:11px}.salonMetric span{font-size:8px;color:var(--muted);display:block}.salonMetric b{font-size:19px;display:block;margin-top:5px}.salonAttention{margin-top:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.salonAttentionItem{border:1px solid #554928;background:#292313;border-radius:11px;padding:9px;font-size:9px}.salonFormGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.salonField label{display:block;font-size:9px;color:var(--muted);margin:0 0 4px}.salonField input,.salonField select,.salonField textarea{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:9px;min-height:44px}.salonField textarea{min-height:74px;resize:vertical}.salonModal{width:min(700px,100%);max-height:90vh;overflow:auto}.salonInsight{border:1px solid #33455a;background:#142334;border-radius:11px;padding:9px;margin:8px 0;font-size:9px}.salonList{display:grid;gap:8px}.salonRow{border:1px solid #292f34;background:#15181b;border-radius:13px;padding:11px}.salonRowHead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.salonRow b{font-size:11px}.salonRow small{display:block;color:var(--muted);font-size:8px;margin-top:3px}.salonRowActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.salonRowActions button{min-height:34px}.salonScreenGrid{display:grid;grid-template-columns:.8fr 1.2fr;gap:10px}.salonChecks{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}.salonCheck{display:flex;align-items:center;gap:5px;border:1px solid #30363c;border-radius:9px;padding:6px;font-size:8px}.salonCheck input{min-height:20px}.salonStatus{display:inline-flex;border-radius:99px;padding:4px 7px;font-size:8px;font-weight:900;background:#25282d}.salonCustomerGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.salonCustomer{border:1px solid var(--line);background:#15181b;border-radius:13px;padding:11px;cursor:pointer}.salonCustomer.warn{border-color:#6a5030}.salonCustomer b{font-size:11px}.salonCustomer small{display:block;color:var(--muted);font-size:8px;margin-top:4px}.salonSummaryGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.salonReportGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.salonReport{border:1px solid var(--line);border-radius:14px;background:#15181b;padding:11px}.salonReport h3{font-size:11px;margin:0 0 8px}.salonReport table{width:100%;border-collapse:collapse;font-size:8px}.salonReport td,.salonReport th{padding:6px;border-bottom:1px solid #292f34;text-align:start}.salonToggle{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #292f34;border-radius:12px;padding:10px;margin-top:7px}.salonToggle input{width:22px;height:22px}.salonRebookButtons{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.salonError{border:1px solid #6a3434;background:#34191b;color:#ffd0d0;border-radius:10px;padding:8px;font-size:9px}.salonGap{border:1px dashed #415237;color:#bad4ad;border-radius:8px;padding:5px;font-size:8px;margin-top:4px}@media(max-width:900px){.salonMetrics{grid-template-columns:repeat(3,1fr)}.salonCustomerGrid{grid-template-columns:repeat(2,1fr)}.salonScreenGrid{grid-template-columns:1fr}}@media(max-width:700px){.salonMetrics{grid-template-columns:repeat(2,1fr)}.salonAttention{grid-template-columns:1fr}.salonFormGrid{grid-template-columns:1fr}.salonCustomerGrid{grid-template-columns:1fr}.salonSummaryGrid{grid-template-columns:repeat(2,1fr)}.salonReportGrid{grid-template-columns:1fr}.salonRebookButtons{grid-template-columns:repeat(2,1fr)}.salonToolbar{align-items:stretch}.salonToolbarGroup{justify-content:center}.salonBtn{min-height:46px}.salonEventActions button{min-width:32px}}';
  document.head.append(style);

  function ensure(){
    if(!isSalon())return false;
    if(!document.body.classList.contains('salonMode'))document.body.classList.add('salonMode');
    business=workspace.business;
    if(!q('#salonToday')){const host=document.createElement('section');host.id='salonToday';host.className='salonToday salonOnly';q('#screen-dashboard .hero')?.after(host)}
    const appt=q('#screen-appointments');
    if(appt&&!q('#salonCalendarHost')){
      const host=document.createElement('div');host.id='salonCalendarHost';host.className='salonOnly';appt.append(host);
      q('#appointmentsTable')?.classList.add('hidden');q('#dabbirCalendarShell')?.classList.add('hidden');q('#dabbirAppointmentManagement')?.classList.add('hidden');
    }
    if(!q('#salonCustomerHost')){const host=document.createElement('div');host.id='salonCustomerHost';host.className='salonOnly';q('#screen-customers')?.append(host);q('#customersTable')?.classList.add('hidden')}
    ensureScreen('salon-team');ensureScreen('salon-services');ensureScreen('salon-reports');ensureScreen('salon-reminders');
    if(!q('#salonMenuCards')){
      const box=document.createElement('div');box.id='salonMenuCards';box.className='moreGrid salonOnly';box.innerHTML=menuCard('salon-team','team')+menuCard('salon-services','services')+menuCard('salon-reports','reports')+menuCard('salon-reminders','reminders');q('#screen-more .moreGrid')?.after(box);
      box.querySelectorAll('[data-salon-open]').forEach(btn=>btn.onclick=()=>openScreen(btn.dataset.salonOpen));
    }
    if(!q('#salonModalHost')){const host=document.createElement('div');host.id='salonModalHost';document.body.append(host)}
    q('#newApptBtn').onclick=openQuickBooking;q('#quickAppt').onclick=openQuickBooking;
    return true;
  }
  function menuCard(screen,keyName){const t=text();return '<button class="moreCard" data-salon-open="'+screen+'"><h3>'+esc(t[keyName])+'</h3><p>'+esc(keyName==='team'?t.workingHours:keyName==='services'?t.assignedServices:keyName==='reports'?t.revenueReport:t.whatsappWorkflow)+'</p></button>'}
  function ensureScreen(name){if(q('#screen-'+name))return;const section=document.createElement('section');section.className='screen salonOnly';section.id='screen-'+name;q('.content')?.append(section)}
  function openScreen(name){if(typeof showScreen==='function')showScreen(name);const titles={'salon-team':'team','salon-services':'services','salon-reports':'reports','salon-reminders':'reminders'};q('#pageTitle').textContent=text()[titles[name]]||text().mode;if(name==='salon-reports')loadReports();renderScreens()}
  function openModal(html){const host=q('#salonModalHost');host.innerHTML='<div class="modal open" id="salonModal"><div class="modalBox salonModal">'+html+'</div></div>';const modal=q('#salonModal');modal.onclick=e=>{if(e.target===modal)closeModal()};qa('[data-salon-close]').forEach(btn=>btn.onclick=closeModal)}
  function closeModal(){q('#salonModalHost').innerHTML=''}

  async function load(force=false){
    if(!ensure()||loading)return;
    const context=lifecycle.contextKey(workspace),businessId=id();
    if(data&&dataContext===context&&!force)return;
    loading=true;q('#salonCalendarHost').innerHTML='<div class="empty">'+esc(text().loading)+'</div>';
    const monthStart=startWeek(new Date(cursor.getFullYear(),cursor.getMonth(),1));
    const from=view==='month'?monthStart:plus(startDay(cursor),-2),to=view==='month'?plus(monthStart,42):plus(startDay(cursor),view==='week'?12:3);
    try{const result=await api('?business_id='+encodeURIComponent(businessId)+'&resource=snapshot&from='+encodeURIComponent(from.toISOString())+'&to='+encodeURIComponent(to.toISOString()));if(context!==lifecycle.contextKey(workspace))return;data=result;dataContext=context;renderAllSalon()}
    catch(error){if(context!==lifecycle.contextKey(workspace))return;q('#salonCalendarHost').innerHTML='<div class="salonError">'+esc(text().failed+' · '+error.message)+'</div>'}
    finally{loading=false;if(isSalon()&&context!==lifecycle.contextKey(workspace))setTimeout(()=>load(false),0)}
  }
  function renderAllSalon(){if(!data)return;renderCalendar();renderToday();renderCustomers();renderScreens();}
  function rangeTitle(){const state=lifecycle.getView(workspace);if(state.allDates)return lifecycle.labels(ar()).allDates;cursor=new Date(lifecycle.localTimeToIso(state.day+'T12:00',workspace.business));if(view==='day')return fmt(cursor,{weekday:'long',day:'numeric',month:'long',year:'numeric'});if(view==='week'){const s=startWeek(cursor);return fmt(s,{day:'numeric',month:'short'})+' — '+fmt(plus(s,6),{day:'numeric',month:'short',year:'numeric'})}return fmt(cursor,{month:'long',year:'numeric'})}
  function calendarRows(){return reader.rows(workspace)}
  function statusCopy(s){const t=text();return {new:t.statusNew,confirmed:t.statusConfirmed,arrived:t.statusArrived,in_progress:t.statusProgress,completed:t.statusCompleted,cancelled:t.statusCancelled,no_show:t.statusNoShow}[s]||s}
  function eventHtml(a){const c=customer(a.customer_id),s=service(a.service_id),duration=Math.max(5,Math.round((new Date(a.ends_at)-new Date(a.starts_at))/60000)||s?.duration_minutes||60);return '<div class="salonEvent '+esc(a.status)+'" draggable="'+(!lifecycle.terminal(a))+'" data-salon-appt="'+esc(a.id)+'"><b>'+esc(c?.display_name||text().customer)+'</b><small>'+esc(fmt(a.starts_at,{hour:'numeric',minute:'2-digit'}))+' · '+esc(ar()?(s?.name_ar||s?.name):(s?.name_en||s?.name))+'</small><small>'+esc(duration+' '+text().minutes+' · '+money(Number(a.quoted_price_aed||0)-Number(a.discount_aed||0)))+'</small><div class="salonEventActions">'+(!lifecycle.terminal(a)?'<button type="button" data-resize="-15" aria-label="-15">−</button><button type="button" data-resize="15" aria-label="+15">+</button>':'')+'<button type="button" data-open-appt="'+esc(a.id)+'">•••</button></div></div>'}
  function bindEvents(){
    qa('[data-salon-appt]').forEach(el=>{el.ondragstart=e=>{dragAppointment=el.dataset.salonAppt;e.dataTransfer.setData('text/plain',dragAppointment)}});
    qa('.salonSlot[data-worker][data-time]').forEach(el=>{el.ondragover=e=>{e.preventDefault();el.classList.add('dragover')};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{e.preventDefault();el.classList.remove('dragover');moveAppointment(e.dataTransfer.getData('text/plain')||dragAppointment,el.dataset.worker,el.dataset.time)}});
    qa('[data-open-appt]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openAppointment(btn.dataset.openAppt)});
    qa('[data-resize]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const a=btn.closest('[data-salon-appt]'),row=appointment(a.dataset.salonAppt);if(!row||lifecycle.terminal(row))return;const duration=Math.max(15,Math.round((new Date(row.ends_at)-new Date(row.starts_at))/60000)+Number(btn.dataset.resize));updateAppointment({action:'resize',appointment_id:row.id,duration_minutes:duration})});
  }
  function visibleWorkers(rows){
    const activeWorkers=(data.workers||[]).filter(w=>w.status==='active');
    const missing=[...new Set(rows.map(a=>a.worker_id).filter(id=>id&&!activeWorkers.some(w=>w.id===id)))].map(id=>({id,display_name:worker(id)?.display_name||text().employee}));
    return [...activeWorkers,...missing,...((rows.some(a=>!a.worker_id)||!activeWorkers.length)?[{id:'',display_name:text().unassigned||text().employee,unassigned:true}]:[])];
  }
  function dayCalendar(){
    const selected=lifecycle.getView(workspace),rows=calendarRows(),workers=visibleWorkers(rows);
    let html='<div class="salonCalendarScroll"><div class="salonDayGrid" style="grid-template-columns:72px repeat('+workers.length+',minmax(150px,1fr))"><div class="salonCorner">'+esc(text().time)+'</div>'+workers.map(w=>'<div class="salonWorkerHead">'+esc(w.display_name)+'</div>').join('');
    const localSlot=a=>key(a.starts_at)<selected.day?'00:00':new Intl.DateTimeFormat('en-GB',{timeZone:lifecycle.timezone(workspace.business),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(a.starts_at));
    for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){
      const clock=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),iso=lifecycle.localTimeToIso(selected.day+'T'+clock,workspace.business);
      html+='<div class="salonTime">'+clock+'</div>';
      for(const w of workers){
        const items=rows.filter(a=>{const [hour,minute]=localSlot(a).split(':').map(Number);return (w.unassigned?!a.worker_id:a.worker_id===w.id)&&hour===h&&minute>=m&&minute<m+30});
        const workerAttr=w.unassigned||selected.scope!=='current'?'':' data-worker="'+esc(w.id)+'"';
        html+='<div class="salonSlot"'+workerAttr+(iso?' data-time="'+esc(iso)+'"':'')+'>'+items.map(eventHtml).join('')+'</div>';
      }
    }
    return html+'</div></div>';
  }
  function weekCalendar(){
    const selected=lifecycle.getView(workspace),start=lifecycle.period(selected).from,rows=calendarRows(),workers=visibleWorkers(rows);let html='<div class="salonCalendarScroll"><div class="salonWeek">';
    for(let i=0;i<7;i++){
      const day=lifecycle.addDays(start,i),dayRows=rows.filter(a=>lifecycle.onDay(a,day,workspace.business));
      html+='<div class="salonWeekDay"><div class="salonWeekHead">'+day+'</div>'+workers.map(w=>'<div class="salonWeekWorker"><span>'+esc(w.display_name)+'</span>'+dayRows.filter(a=>w.unassigned?!a.worker_id:a.worker_id===w.id).map(eventHtml).join('')+'</div>').join('')+'</div>';
    }
    return html+'</div></div>';
  }
  function monthCalendar(){
    const selected=lifecycle.getView(workspace),start=lifecycle.period({view:'week',day:selected.day.slice(0,7)+'-01'}).from,rows=calendarRows(),today=key(new Date());let html='<div class="salonCalendarScroll"><div class="salonMonth">';
    for(let i=0;i<42;i++){
      const day=lifecycle.addDays(start,i),items=rows.filter(a=>lifecycle.onDay(a,day,workspace.business));
      html+='<div class="salonMonthDay '+(day===today?'today':'')+'"><div class="salonMonthDate">'+Number(day.slice(-2))+'</div>'+items.map(a=>'<button class="salonMonthEvent" data-open-appt="'+esc(a.id)+'">'+esc(fmt(a.starts_at,{hour:'numeric',minute:'2-digit'})+' · '+(customer(a.customer_id)?.display_name||text().customer))+'</button>').join('')+'</div>';
    }
    return html+'</div></div>';
  }
  function historyCalendar(){return calendarRows().map(a=>'<div class="salonRow"><small>'+esc(fmt(a.starts_at)+' · '+statusCopy(a.status))+'</small>'+eventHtml(a)+'</div>').join('')}
  function renderCalendar(){
    const t=text(),host=q('#salonCalendarHost');if(!host||!isSalon()||dataContext!==lifecycle.contextKey(workspace))return;
    const selected=lifecycle.getView(workspace),labels=lifecycle.labels(ar());view=selected.view;cursor=lifecycle.wallDate(selected.day);
    if(q('#screen-appointments')?.classList.contains('active'))void reader.ensure(workspace);
    host.innerHTML=lifecycle.controls(workspace,[],ar())+'<div class="salonToolbar"><div class="salonToolbarGroup"><button data-cal-prev aria-label="'+esc(t.previous)+'">‹</button><button data-cal-today>'+esc(t.today)+'</button><button data-cal-next aria-label="'+esc(t.next)+'">›</button></div><b>'+esc(selected.allDates?labels.allDates:rangeTitle())+'</b><div class="salonToolbarGroup"><button data-cal-view="day" class="'+(view==='day'?'on':'')+'">'+esc(t.day)+'</button><button data-cal-view="week" class="'+(view==='week'?'on':'')+'">'+esc(t.week)+'</button><button data-cal-view="month" class="'+(view==='month'?'on':'')+'">'+esc(t.month)+'</button><button class="on" data-quick-book>'+esc(t.quickBooking)+'</button></div></div>'+(selected.scope==='current'?'':'<p class="dabbirBookingScopeHint">'+esc(selected.scope==='review'?labels.reviewHint:labels.historyHint)+'</p>')+'<div class="salonCalendar">'+(selected.allDates?historyCalendar():view==='day'?dayCalendar():view==='week'?weekCalendar():monthCalendar())+'</div>'+reader.status(workspace,ar());
    q('[data-cal-prev]').onclick=()=>lifecycle.move(workspace,-1);q('[data-cal-next]').onclick=()=>lifecycle.move(workspace,1);q('[data-cal-today]').onclick=()=>lifecycle.setView(workspace,{day:key(new Date()),allDates:false,followToday:true});q('[data-quick-book]').onclick=openQuickBooking;
    qa('[data-cal-view]').forEach(btn=>btn.onclick=()=>lifecycle.setView(workspace,{view:btn.dataset.calView,allDates:false}));
    host.querySelectorAll('[data-booking-scope]').forEach(btn=>btn.onclick=()=>lifecycle.setView(workspace,{scope:btn.dataset.bookingScope}));
    reader.bind(host,workspace);bindEvents();
  }
  async function moveAppointment(appointmentId,workerId,startsAt){const row=appointment(appointmentId);if(!row||lifecycle.terminal(row))return;const duration=Math.max(5,Math.round((new Date(row.ends_at)-new Date(row.starts_at))/60000)||60);await updateAppointment({action:'move',appointment_id:appointmentId,worker_id:workerId,starts_at:startsAt,duration_minutes:duration})}
  async function updateAppointment(payload){try{await post(payload);notify(text().saved);await load(true)}catch(error){notify((/CONFLICT|SCHEDULE|UNAVAILABLE|TIME_OFF/.test(error.message)?text().conflict:text().failed)+' · '+error.message)}}

  function customerInsights(customerId){const rows=(data.appointments||[]).filter(a=>a.customer_id===customerId).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at)),last=rows.find(a=>a.status==='completed')||rows[0],counts=new Map();rows.forEach(a=>counts.set(a.worker_id,(counts.get(a.worker_id)||0)+1));const preferred=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];return {last,lastService:service(last?.service_id),preferred:worker(preferred),noShow:rows.filter(a=>a.status==='no_show').length}}
  function openQuickBooking(){
    if(!isSalon())return;const t=text(),services=(data?.services||[]).filter(s=>s.active),workers=(data?.workers||[]).filter(w=>w.status==='active');
    // Booking must remain available even before employees or services are configured.
    openModal('<h3>'+esc(t.quickBooking)+'</h3><form id="salonQuickForm"><div class="salonFormGrid"><div class="salonField"><label>'+esc(t.existingCustomer)+'</label><select id="sqCustomer"><option value="">'+esc(t.newCustomer)+'</option>'+(data.customers||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.display_name+' · '+(c.phone_e164||''))+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.customer)+'</label><input id="sqName" maxlength="120"></div><div class="salonField"><label>'+esc(t.phone)+'</label><input id="sqPhone" maxlength="30"></div><div class="salonField"><label>'+esc(t.employee)+'</label><select id="sqWorker"><option value=""></option>'+workers.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.display_name)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.service)+'</label><select id="sqService"><option value=""></option>'+services.map(s=>'<option value="'+esc(s.id)+'">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.time)+'</label><input id="sqTime" type="datetime-local"></div><div class="salonField"><label>'+esc(t.discount)+'</label><input id="sqDiscount" type="number" min="0" step="0.01" value="0"></div><div class="salonField"><label>'+esc(t.source)+'</label><select id="sqSource"><option value="internal">DABBIR</option><option value="whatsapp">WhatsApp</option><option value="phone">'+esc(t.phone)+'</option><option value="walk_in">Walk-in</option></select></div></div><div id="sqInsight"></div><div class="salonField"><label>'+esc(t.notes)+'</label><textarea id="sqNotes"></textarea></div><div class="modalActions"><button type="button" class="secondary" data-salon-close>'+esc(t.close)+'</button><button class="primary" type="submit">'+esc(t.confirmBooking)+'</button></div></form>');
    const time=new Date(Date.now()+3600000);time.setMinutes(Math.ceil(time.getMinutes()/30)*30,0,0);q('#sqTime').value=new Date(time-time.getTimezoneOffset()*60000).toISOString().slice(0,16);
    // Employee and service are optional and intentionally independent in quick booking.
    q('#sqCustomer').onchange=()=>{const c=customer(q('#sqCustomer').value);if(!c){q('#sqInsight').innerHTML='';return}q('#sqName').value=c.display_name||'';q('#sqPhone').value=c.phone_e164||'';const i=customerInsights(c.id);q('#sqInsight').innerHTML='<div class="salonInsight">'+esc(t.lastVisit)+': '+esc(i.last?fmt(i.last.starts_at):'—')+' · '+esc(t.lastService)+': '+esc(i.lastService?(ar()?(i.lastService.name_ar||i.lastService.name):(i.lastService.name_en||i.lastService.name)):'—')+' · '+esc(t.preferredEmployee)+': '+esc(i.preferred?.display_name||'—')+' · '+esc(t.noShow)+': '+i.noShow+'</div>'};
    q('#salonQuickForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await post({action:'quick_book',customer_name:q('#sqName').value,customer_phone:q('#sqPhone').value,service_id:q('#sqService').value,worker_id:q('#sqWorker').value,starts_at:q('#sqTime').value?new Date(q('#sqTime').value).toISOString():null,discount_aed:q('#sqDiscount').value,notes:q('#sqNotes').value,source:q('#sqSource').value});closeModal();notify(t.saved);await load(true)}catch(error){notify((/CONFLICT|SCHEDULE|UNAVAILABLE/.test(error.message)?t.conflict:t.failed)+' · '+error.message)}finally{btn.disabled=false}}
  }

  function transitionButtons(a){const t=text(),map={new:[['confirmed',t.statusConfirmed],['cancelled',t.statusCancelled],['no_show',t.statusNoShow]],confirmed:[['arrived',t.statusArrived],['cancelled',t.statusCancelled],['no_show',t.statusNoShow]],arrived:[['in_progress',t.statusProgress],['cancelled',t.statusCancelled],['no_show',t.statusNoShow]],in_progress:[['completed',t.statusCompleted],['cancelled',t.statusCancelled]]};return (map[a.status]||[]).map(([s,l])=>'<button type="button" class="salonBtn" data-transition="'+s+'">'+esc(l)+'</button>').join('')}
  function openAppointment(appointmentId){const a=appointment(appointmentId);if(!a)return;const t=text(),c=customer(a.customer_id),s=service(a.service_id),w=worker(a.worker_id);openModal('<h3>'+esc(t.appointmentDetails)+'</h3><div class="salonRow"><div class="salonRowHead"><div><b>'+esc(c?.display_name||t.customer)+'</b><small>'+esc(c?.phone_e164||'')+'</small></div><span class="salonStatus">'+esc(statusCopy(a.status))+'</span></div><small>'+esc(ar()?(s?.name_ar||s?.name):(s?.name_en||s?.name))+' · '+esc(w?.display_name||'')+'</small><small>'+esc(fmt(a.starts_at))+' — '+esc(fmt(a.ends_at))+'</small><small>'+esc(money(Number(a.quoted_price_aed||0)-Number(a.discount_aed||0)))+' · '+esc(t.paymentStatus)+': '+esc(a.payment_status)+'</small></div><div class="salonRowActions">'+transitionButtons(a)+'<button type="button" class="salonBtn" data-pay>'+esc(t.pay)+'</button>'+(a.status==='completed'?'<button type="button" class="salonBtn primary" data-rebook>'+esc(t.rebook)+'</button>':'')+'</div><div class="modalActions"><button class="secondary" data-salon-close>'+esc(t.close)+'</button></div>');
    qa('[data-transition]').forEach(btn=>btn.onclick=async()=>{try{const result=await post({action:'transition',appointment_id:a.id,status:btn.dataset.transition});closeModal();notify(t.saved+(result.waitlist_matches?.length?' · '+t.waitlist+': '+result.waitlist_matches.length:''));await load(true);if(btn.dataset.transition==='completed')setTimeout(()=>openRebook(a.id),120)}catch(error){notify(t.failed+' · '+error.message)}});q('[data-pay]').onclick=()=>openPayment(a);q('[data-rebook]')?.addEventListener('click',()=>openRebook(a.id));
  }
  function openPayment(a){const t=text(),due=Math.max(0,Number(a.quoted_price_aed||0)-Number(a.discount_aed||0));openModal('<h3>'+esc(t.pay)+'</h3><form id="salonPaymentForm"><div class="salonFormGrid"><div class="salonField"><label>'+esc(t.paymentMethod)+'</label><select id="spMethod"><option value="cash">'+esc(t.cash)+'</option><option value="card">'+esc(t.card)+'</option><option value="payment_link">'+esc(t.paymentLink)+'</option><option value="other">'+esc(t.other)+'</option><option value="unpaid">'+esc(t.unpaid)+'</option></select></div><div class="salonField"><label>'+esc(t.amount)+'</label><input id="spAmount" type="number" min="0" step="0.01" value="'+due+'"></div></div><div class="modalActions"><button type="button" class="secondary" data-salon-close>'+esc(t.close)+'</button><button class="primary" type="submit">'+esc(t.save)+'</button></div></form>');q('#salonPaymentForm').onsubmit=async e=>{e.preventDefault();try{await post({action:'record_payment',appointment_id:a.id,method:q('#spMethod').value,amount_aed:q('#spAmount').value,idempotency_key:'ui:'+a.id+':'+q('#spMethod').value+':'+q('#spAmount').value});closeModal();notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}}}
  function openRebook(appointmentId){const t=text(),buttons=[[14,t.twoWeeks],[21,t.threeWeeks],[28,t.fourWeeks],[42,t.sixWeeks]];openModal('<h3>'+esc(t.rebook)+'</h3><div class="salonRebookButtons">'+buttons.map(([d,l])=>'<button class="salonBtn" data-rebook-days="'+d+'">'+esc(l)+'</button>').join('')+'<button class="salonBtn" data-custom-rebook>'+esc(t.customDate)+'</button></div><div id="customRebook"></div><div class="modalActions"><button class="secondary" data-salon-close>'+esc(t.close)+'</button></div>');qa('[data-rebook-days]').forEach(btn=>btn.onclick=()=>saveRebook(appointmentId,Number(btn.dataset.rebookDays)));q('[data-custom-rebook]').onclick=()=>{q('#customRebook').innerHTML='<div class="salonField"><label>'+esc(t.time)+'</label><input id="customRebookTime" type="datetime-local"></div><button class="salonBtn primary" id="saveCustomRebook">'+esc(t.save)+'</button>';q('#saveCustomRebook').onclick=()=>saveRebook(appointmentId,null,q('#customRebookTime').value)}}
  async function saveRebook(appointmentId,days,value){const source=appointment(appointmentId),next=value?new Date(value):plus(new Date(source.starts_at),days);try{await post({action:'rebook',appointment_id:appointmentId,starts_at:next.toISOString()});closeModal();notify(text().saved);await load(true)}catch(error){notify(text().failed+' · '+error.message)}}

  function renderToday(){const host=q('#salonToday'),t=text();if(!host)return;const today=key(new Date()),rows=(data.appointments||[]).filter(a=>key(a.starts_at)===today),completed=rows.filter(a=>a.status==='completed'),cancelled=rows.filter(a=>a.status==='cancelled'),noShow=rows.filter(a=>a.status==='no_show'),expected=rows.filter(a=>!['cancelled','no_show'].includes(a.status)).reduce((n,a)=>n+Number(a.quoted_price_aed||0)-Number(a.discount_aed||0),0),realized=(data.commissions||[]).filter(c=>key(c.generated_at)===today&&c.status==='earned').reduce((n,c)=>n+Number(c.revenue_aed||0),0),comm=(data.commissions||[]).filter(c=>key(c.generated_at)===today&&c.status==='earned').reduce((n,c)=>n+Number(c.commission_aed||0),0),unconfirmed=rows.filter(a=>a.status==='new').length,present=new Set((data.schedules||[]).filter(s=>s.weekday===new Date().getDay()&&s.schedule_type==='work'&&s.active).map(s=>s.worker_id)).size;
    const metrics=[[t.bookings,rows.length],[t.unconfirmed,unconfirmed],[t.completed,completed.length],[t.cancelled,cancelled.length],[t.noShow,noShow.length],[t.expectedRevenue,money(expected)],[t.realizedRevenue,money(realized)],[t.commissions,money(comm)],[t.presentTeam,present]];
    const warnings=[];if(unconfirmed)warnings.push(unconfirmed+' '+t.unconfirmed);const repeatNoShow=(data.customers||[]).filter(c=>customerInsights(c.id).noShow>=(data.settings?.no_show_warning_threshold||2));if(repeatNoShow.length)warnings.push(repeatNoShow.length+' · '+t.warningNoShow);const missingPrice=(data.services||[]).filter(s=>s.active&&Number(s.price_aed||0)<=0);if(missingPrice.length)warnings.push(missingPrice.length+' · '+t.services+' بلا سعر');
    const bestEmployee=[...new Map(completed.map(a=>[a.worker_id,(completed.filter(x=>x.worker_id===a.worker_id).length)])).entries()].sort((a,b)=>b[1]-a[1])[0],bestService=[...new Map(completed.map(a=>[a.service_id,(completed.filter(x=>x.service_id===a.service_id).length)])).entries()].sort((a,b)=>b[1]-a[1])[0];
    host.innerHTML='<div class="salonToolbar"><div><div class="eyebrow">'+esc(t.mode)+'</div><b>'+esc(t.today)+'</b></div><button class="salonBtn primary" data-quick-book>'+esc(t.quickBooking)+'</button></div><div class="salonMetrics">'+metrics.map(([a,b])=>'<div class="salonMetric"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>').join('')+'</div><div class="salonAttention">'+(warnings.map(w=>'<div class="salonAttentionItem"><b>'+esc(t.attention)+'</b><div>'+esc(w)+'</div></div>').join('')||'<div class="salonAttentionItem">'+esc(t.empty)+'</div>')+'</div><div class="salonRow" style="margin-top:8px"><b>'+esc(t.endOfDay)+'</b><small>'+completed.length+' '+esc(t.completed)+' · '+cancelled.length+' '+esc(t.cancelled)+' · '+noShow.length+' '+esc(t.noShow)+' · '+esc(t.realizedRevenue)+': '+esc(money(realized))+' · '+esc(t.commissions)+': '+esc(money(comm))+'</small><small>'+esc(t.bestEmployee)+': '+esc(worker(bestEmployee?.[0])?.display_name||'—')+' · '+esc(t.bestService)+': '+esc(ar()?(service(bestService?.[0])?.name_ar||'—'):(service(bestService?.[0])?.name_en||'—'))+'</small></div>';host.querySelector('[data-quick-book]').onclick=openQuickBooking;
  }

  function renderCustomers(){const host=q('#salonCustomerHost'),t=text();if(!host)return;host.innerHTML='<div class="salonCustomerGrid">'+((data.customers||[]).map(c=>{const i=customerInsights(c.id);return '<button class="salonCustomer '+(i.noShow>=(data.settings?.no_show_warning_threshold||2)?'warn':'')+'" data-customer360="'+esc(c.id)+'"><b>'+esc(c.display_name)+'</b><small>'+esc(c.phone_e164||'')+'</small><small>'+esc(t.visits)+': '+(data.appointments||[]).filter(a=>a.customer_id===c.id&&a.status==='completed').length+' · '+esc(t.noShow)+': '+i.noShow+'</small><small>'+esc(t.lastVisit)+': '+esc(i.last?fmt(i.last.starts_at):'—')+'</small></button>'}).join('')||'<div class="empty">'+esc(t.empty)+'</div>')+'</div>';qa('[data-customer360]').forEach(btn=>btn.onclick=()=>openCustomer360(btn.dataset.customer360))}
  async function openCustomer360(customerId){const t=text();try{const result=await api('?business_id='+encodeURIComponent(id())+'&resource=customer_360&customer_id='+encodeURIComponent(customerId)),p=result.profile||{},s=p.summary||{};openModal('<h3>'+esc(t.customer360)+'</h3><div class="salonSummaryGrid"><div class="salonMetric"><span>'+esc(t.visits)+'</span><b>'+Number(s.visits||0)+'</b></div><div class="salonMetric"><span>'+esc(t.spend)+'</span><b>'+esc(money(s.total_spend_aed))+'</b></div><div class="salonMetric"><span>'+esc(t.noShow)+'</span><b>'+Number(s.no_show||0)+'</b></div><div class="salonMetric"><span>'+esc(t.noShowRate)+'</span><b>'+Number(s.no_show_rate||0)+'%</b></div></div>'+(Number(s.no_show||0)>=(data.settings?.no_show_warning_threshold||2)?'<div class="salonAttentionItem" style="margin-top:8px">'+esc(t.warningNoShow)+'</div>':'')+'<div class="salonRow" style="margin-top:8px"><b>'+esc(t.history)+'</b>'+((p.appointments||[]).slice(0,10).map(a=>'<small>'+esc(fmt(a.starts_at)+' · '+statusCopy(a.status))+'</small>').join('')||'<small>—</small>')+'</div><div class="salonRow"><b>'+esc(t.payments)+'</b>'+((p.payments||[]).slice(0,10).map(x=>'<small>'+esc(fmt(x.created_at)+' · '+money(x.amount_aed)+' · '+x.method)+'</small>').join('')||'<small>—</small>')+'</div><form id="salonNoteForm" class="salonField"><label>'+esc(t.notes)+'</label><textarea id="salonNote"></textarea><label class="salonCheck"><input id="salonImportant" type="checkbox"> '+esc(t.importantNotes)+'</label><button class="salonBtn primary" type="submit">'+esc(t.save)+'</button></form><div class="modalActions"><button class="secondary" data-salon-close>'+esc(t.close)+'</button></div>');q('#salonNoteForm').onsubmit=async e=>{e.preventDefault();await post({action:'add_customer_note',customer_id:customerId,note:q('#salonNote').value,important:q('#salonImportant').checked});notify(t.saved);closeModal()}}catch(error){notify(t.failed+' · '+error.message)}}

  function renderScreens(){if(!data)return;renderTeam();renderServices();renderReminderSettings();if(reports)renderReports()}
  function renderTeam(){const host=q('#screen-salon-team'),t=text();if(!host)return;host.innerHTML='<div class="hero"><div><h1>'+esc(t.team)+'</h1><p>'+esc(t.workingHours)+' · '+esc(t.assignedServices)+'</p></div></div><div class="salonScreenGrid"><form class="card" id="salonWorkerForm"><h3>'+esc(t.addEmployee)+'</h3><div class="salonFormGrid"><div class="salonField"><label>'+esc(t.workerName)+'</label><input id="swName" required></div><div class="salonField"><label>'+esc(t.phone)+'</label><input id="swPhone"></div><div class="salonField"><label>'+esc(t.jobTitle)+'</label><input id="swTitle" value="employee"></div><div class="salonField"><label>'+esc(t.commissionType)+'</label><select id="swCommissionType"><option value="percentage">'+esc(t.percentage)+'</option><option value="fixed">'+esc(t.fixed)+'</option></select></div><div class="salonField"><label>'+esc(t.commissionValue)+'</label><input id="swCommission" type="number" min="0" value="0"></div></div><div class="salonField"><label>'+esc(t.assignedServices)+'</label><div class="salonChecks" id="swServices">'+((data.services||[]).filter(s=>s.active).map(s=>'<label class="salonCheck"><input type="checkbox" data-new-worker-service="'+esc(s.id)+'"> '+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+'</label>').join('')||'<span class="muted">'+esc(t.serviceCatalogRequired)+'</span>')+'</div></div><button class="salonBtn primary" type="submit">'+esc(t.addEmployee)+'</button></form><div class="card"><div class="salonList">'+((data.workers||[]).map(w=>workerRow(w)).join('')||'<div class="empty">'+esc(t.empty)+'</div>')+'</div></div></div>';q('#salonWorkerForm').onsubmit=async e=>{e.preventDefault();try{const saved=await post({action:'save_worker',display_name:q('#swName').value,phone_e164:q('#swPhone').value,job_title:q('#swTitle').value,commission_type:q('#swCommissionType').value,commission_value:q('#swCommission').value}),workerId=saved.worker?.id;if(workerId)for(const input of qa('[data-new-worker-service]:checked'))await post({action:'assign_worker_service',worker_id:workerId,service_id:input.dataset.newWorkerService,active:true});notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}};qa('[data-default-schedule]').forEach(btn=>btn.onclick=()=>saveDefaultSchedule(btn.dataset.defaultSchedule));qa('[data-worker-services]').forEach(btn=>btn.onclick=()=>openWorkerServices(btn.dataset.workerServices))}
  function workerRow(w){const t=text(),assigned=(data.worker_services||[]).filter(x=>x.worker_id===w.id&&x.active).length;return '<div class="salonRow"><div class="salonRowHead"><div><b>'+esc(w.display_name)+'</b><small>'+esc(w.job_title)+' · '+esc(w.phone_e164||'')+'</small></div><span class="salonStatus">'+esc(w.status)+'</span></div><small>'+esc(t.commissions)+': '+esc(w.commission_type==='percentage'?w.commission_value+'%':money(w.commission_value))+' · '+esc(t.assignedServices)+': '+assigned+'</small><div class="salonRowActions"><button class="salonBtn" data-worker-services="'+esc(w.id)+'">'+esc(t.assignedServices)+'</button><button class="salonBtn" data-default-schedule="'+esc(w.id)+'">'+esc(t.applyDefaultHours)+'</button></div></div>'}
  async function saveDefaultSchedule(workerId){const rows=[];for(let weekday=0;weekday<7;weekday++)rows.push({weekday,starts_at:'09:00',ends_at:'18:00',schedule_type:'work',active:true});try{await post({action:'save_schedule',worker_id:workerId,rows});notify(text().saved);await load(true)}catch(error){notify(text().failed+' · '+error.message)}}
  function openWorkerServices(workerId){const t=text(),assigned=new Set((data.worker_services||[]).filter(x=>x.worker_id===workerId&&x.active).map(x=>x.service_id));openModal('<h3>'+esc(t.assignedServices)+'</h3><div class="salonChecks">'+(data.services||[]).filter(s=>s.active).map(s=>'<label class="salonCheck"><input type="checkbox" data-assign-service="'+esc(s.id)+'" '+(assigned.has(s.id)?'checked':'')+'> '+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+'</label>').join('')+'</div><div class="modalActions"><button class="secondary" data-salon-close>'+esc(t.close)+'</button><button class="primary" id="saveWorkerServices">'+esc(t.save)+'</button></div>');q('#saveWorkerServices').onclick=async()=>{try{for(const input of qa('[data-assign-service]'))await post({action:'assign_worker_service',worker_id:workerId,service_id:input.dataset.assignService,active:input.checked});closeModal();notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}}}

  function renderServices(){const host=q('#screen-salon-services'),t=text();if(!host)return;host.innerHTML='<div class="hero"><div><h1>'+esc(t.services)+'</h1><p>'+esc(t.serviceNameAr)+' / '+esc(t.serviceNameEn)+'</p></div></div><div class="salonScreenGrid"><form class="card" id="salonServiceForm"><h3>'+esc(t.addService)+'</h3><div class="salonFormGrid"><div class="salonField"><label>'+esc(t.serviceNameAr)+'</label><input id="ssNameAr" required></div><div class="salonField"><label>'+esc(t.serviceNameEn)+'</label><input id="ssNameEn" required></div><div class="salonField"><label>'+esc(t.category)+'</label><input id="ssCategory" value="general"></div><div class="salonField"><label>'+esc(t.price)+'</label><input id="ssPrice" type="number" min="0" step="0.01" required></div><div class="salonField"><label>'+esc(t.duration)+'</label><input id="ssDuration" type="number" min="5" value="30" required></div><div class="salonField"><label>'+esc(t.commissionType)+'</label><select id="ssCommissionType"><option value="">—</option><option value="percentage">'+esc(t.percentage)+'</option><option value="fixed">'+esc(t.fixed)+'</option></select></div><div class="salonField"><label>'+esc(t.commissionValue)+'</label><input id="ssCommission" type="number" min="0" value="0"></div></div><button class="salonBtn primary" type="submit">'+esc(t.addService)+'</button></form><div class="card"><div class="salonList">'+((data.services||[]).map(s=>'<div class="salonRow"><div class="salonRowHead"><div><b>'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+'</b><small>'+esc(s.category)+' · '+esc(s.duration_minutes+' '+t.minutes)+'</small></div><b>'+esc(money(s.price_aed))+'</b></div></div>').join('')||'<div class="empty">'+esc(t.empty)+'</div>')+'</div></div></div>';q('#salonServiceForm').onsubmit=async e=>{e.preventDefault();try{await post({action:'save_service',name_ar:q('#ssNameAr').value,name_en:q('#ssNameEn').value,category:q('#ssCategory').value,price_aed:q('#ssPrice').value,duration_minutes:q('#ssDuration').value,commission_type:q('#ssCommissionType').value||null,commission_value:q('#ssCommission').value});notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}}}

  async function loadReports(){try{reports=(await api('?business_id='+encodeURIComponent(id())+'&resource=reports&from='+encodeURIComponent(plus(new Date(),-90).toISOString())+'&to='+encodeURIComponent(plus(new Date(),1).toISOString()))).reports;renderReports()}catch(error){notify(text().failed+' · '+error.message)}}
  function table(rows,cols){if(!rows?.length)return '<div class="empty">'+esc(text().empty)+'</div>';return '<table><thead><tr>'+cols.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,12).map(r=>'<tr>'+cols.map(c=>'<td>'+esc(typeof c[1]==='function'?c[1](r):r[c[1]])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
  function renderReports(){const host=q('#screen-salon-reports'),t=text();if(!host||!reports)return;const s=reports.summary||{};host.innerHTML='<div class="hero"><div><h1>'+esc(t.reports)+'</h1><p>'+esc(t.showing)+': 90 '+esc(t.date)+'</p></div><button class="salonBtn" id="refreshSalonReports">'+esc(t.refresh)+'</button></div><div class="salonMetrics"><div class="salonMetric"><span>'+esc(t.revenueReport)+'</span><b>'+esc(money(s.revenue_aed))+'</b></div><div class="salonMetric"><span>'+esc(t.commissionReport)+'</span><b>'+esc(money(s.commissions_aed))+'</b></div><div class="salonMetric"><span>'+esc(t.completed)+'</span><b>'+Number(s.completed||0)+'</b></div><div class="salonMetric"><span>'+esc(t.noShowReport)+'</span><b>'+Number(s.no_show||0)+'</b></div><div class="salonMetric"><span>'+esc(t.cancellationReport)+'</span><b>'+Number(s.cancellations||0)+'</b></div></div><div class="salonReportGrid" style="margin-top:10px"><div class="salonReport"><h3>'+esc(t.revenueReport)+'</h3>'+table(reports.revenue,[[t.date,'date'],[t.amount,r=>money(r.amount_aed)]])+'</div><div class="salonReport"><h3>'+esc(t.employeeReport)+'</h3>'+table(reports.employees,[[t.employee,'name'],[t.completed,'completed'],[t.revenueReport,r=>money(r.revenue_aed)]])+'</div><div class="salonReport"><h3>'+esc(t.servicesReport)+'</h3>'+table(reports.services,[[t.service,'name'],[t.bookings,'bookings'],[t.revenueReport,r=>money(r.revenue_aed)]])+'</div><div class="salonReport"><h3>'+esc(t.peakReport)+'</h3>'+table(reports.peak_hours,[[t.time,r=>String(r.hour)+':00'],[t.bookings,'bookings']])+'</div><div class="salonReport"><h3>'+esc(t.recurringReport)+'</h3>'+table(reports.recurring_customers,[[t.customer,'customer_id'],[t.visits,'completed']])+'</div><div class="salonReport"><h3>'+esc(t.inactiveReport)+'</h3>'+table(reports.inactive_customers,[[t.customer,'customer_id'],[t.lastVisit,r=>fmt(r.last_visit)]])+'</div><div class="salonReport"><h3>'+esc(t.noShowReport)+'</h3><b>'+Number(s.no_show||0)+'</b></div><div class="salonReport"><h3>'+esc(t.cancellationReport)+'</h3><b>'+Number(s.cancellations||0)+'</b></div><div class="salonReport"><h3>'+esc(t.gapReport)+'</h3><p class="muted">'+esc(t.gaps)+' · '+esc(t.availableGap)+'</p></div><div class="salonReport"><h3>'+esc(t.commissionReport)+'</h3><b>'+esc(money(s.commissions_aed))+'</b></div></div>';q('#refreshSalonReports').onclick=loadReports}

  function renderReminderSettings(){const host=q('#screen-salon-reminders'),t=text();if(!host)return;const s=data.settings||{};host.innerHTML='<div class="hero"><div><h1>'+esc(t.reminders)+'</h1><p>'+esc(t.whatsappWorkflow)+' '+esc(t.noDuplicate)+'</p></div></div><form class="card" id="salonReminderForm"><label class="salonToggle"><span>'+esc(t.reminderBooking)+'</span><input id="srBooking" type="checkbox" '+(s.reminder_on_booking?'checked':'')+'></label><label class="salonToggle"><span>'+esc(t.reminder24)+'</span><input id="sr24" type="checkbox" '+(s.reminder_24h?'checked':'')+'></label><label class="salonToggle"><span>'+esc(t.reminder2)+'</span><input id="sr2" type="checkbox" '+(s.reminder_2h?'checked':'')+'></label><button class="salonBtn primary" type="submit">'+esc(t.save)+'</button></form><div class="card"><h3>WhatsApp Workflow</h3><div class="salonList">'+((data.notifications||[]).slice(0,20).map(n=>'<div class="salonRow"><b>'+esc(n.notification_type)+'</b><small>'+esc(fmt(n.scheduled_for)+' · '+n.status)+'</small></div>').join('')||'<div class="empty">'+esc(t.empty)+'</div>')+'</div></div>';q('#salonReminderForm').onsubmit=async e=>{e.preventDefault();try{await post({action:'save_reminder_settings',reminder_on_booking:q('#srBooking').checked,reminder_24h:q('#sr24').checked,reminder_2h:q('#sr2').checked});notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}}}

  const baseSetLanguage=typeof setLang==='function'?setLang:null;if(baseSetLanguage)setLang=function(next){const result=baseSetLanguage(next);setTimeout(renderAllSalon,0);return result};
  const baseRenderAll=typeof renderAll==='function'?renderAll:null;if(baseRenderAll)renderAll=function(...args){const result=baseRenderAll.apply(this,args);if(isSalon())setTimeout(()=>{ensure();load(false)},0);return result};
  setTimeout(()=>load(false),700);
  ['dabbir:booking-view-changed','dabbir:booking-data-changed','dabbir:branch-scope-changed'].forEach(name=>window.addEventListener(name,()=>{if(!isSalon())return;if(dataContext!==lifecycle.contextKey(workspace)){q('#salonCalendarHost')?.replaceChildren();if(q('#salonModalHost'))closeModal();void load(false)}else renderCalendar()}));
  window.__dabbirSalonMode={refresh:()=>load(true),quickBooking:openQuickBooking,openScreen,version:'salon-mode-p0'};
})();
(()=>{
  if(window.__dabbirSalonPaymentIdempotency)return;
  const nativeFetch=window.fetch.bind(window);
  const requestIds=new WeakMap();
  const makeId=()=>{
    if(globalThis.crypto?.randomUUID)return 'ui-payment:'+globalThis.crypto.randomUUID();
    const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);
    return 'ui-payment:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  };
  window.fetch=function(input,init){
    let nextInit=init;
    try{
      const url=typeof input==='string'?input:input?.url;
      const path=new URL(String(url||''),location.origin).pathname;
      if(path==='/api/salon-operations'&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
        const payload=JSON.parse(init.body);
        if(payload?.action==='record_payment'){
          const form=document.querySelector('#salonPaymentForm');
          if(form){
            let requestId=requestIds.get(form);
            if(!requestId){requestId=makeId();requestIds.set(form,requestId)}
            payload.idempotency_key=requestId;
            nextInit={...init,body:JSON.stringify(payload)};
          }
        }
      }
    }catch{}
    return nativeFetch(input,nextInit);
  };
  window.__dabbirSalonPaymentIdempotency={version:'v1',requestIdForCurrentForm:()=>{const form=document.querySelector('#salonPaymentForm');return form?requestIds.get(form)||null:null}};
})();
(()=>{
  if(window.__dabbirClinicModeV1)return;window.__dabbirClinicModeV1=true;
  const $=s=>document.querySelector(s), W=()=>{try{return workspace}catch{return null}}, A=()=>document.documentElement.lang!=='en';
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const C=()=>A()?{title:'عيادة التجميل والليزر',desc:'الجلسات والباقات والأجهزة والموافقات والتنبيه للجلسة القادمة — بدون صور.',locked:'بيانات المرضى الحقيقية مقفلة حتى اكتمال مراجعات الخصوصية والأمان. البيانات التجريبية فقط متاحة حاليًا.',session:'تسجيل جلسة',package:'إضافة باقة',device:'إضافة جهاز',consent:'الموافقات',appt:'الموعد',type:'نوع الجلسة',area:'المنطقة المعالجة',pkg:'الباقة',dev:'الجهاز',settings:'إعدادات الجهاز/الجلسة',before:'ملاحظات قبل الجلسة',after:'ملاحظات بعد الجلسة',next:'الجلسة القادمة',status:'الحالة',customer:'العميل',service:'الخدمة',name:'الاسم',sessions:'عدد الجلسات',price:'السعر',expiry:'الانتهاء',model:'الموديل',template:'نموذج الموافقة',body:'نص الموافقة',version:'الإصدار',record:'تسجيل موافقة العميل',save:'حفظ',none:'بدون',saved:'تم الحفظ',fail:'تعذر الحفظ',rem:'المتبقي'}:{title:'Beauty & Laser Clinic',desc:'Sessions, packages, devices, consents and next-session reminders — no photos.',locked:'Real patient data is locked until privacy and security reviews are complete. Synthetic data only is available now.',session:'Session record',package:'Add package',device:'Add device',consent:'Consents',appt:'Appointment',type:'Session type',area:'Treatment area',pkg:'Package',dev:'Device',settings:'Device/session settings',before:'Before notes',after:'After notes',next:'Next session',status:'Status',customer:'Client',service:'Service',name:'Name',sessions:'Sessions',price:'Price',expiry:'Expiry',model:'Model',template:'Consent template',body:'Consent text',version:'Version',record:'Record client consent',save:'Save',none:'None',saved:'Saved',fail:'Save failed',rem:'Remaining'};
  const isClinic=()=>W()?.business?.business_type==='clinic', bid=()=>W()?.business?.id;
  let D=null,busy=false,loading=false;
  const style=document.createElement('style');style.textContent='.clinicV1{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:18px;background:#111315}.clinicV1 h3{margin:0 0 4px;font-size:14px}.clinicV1>p{margin:0 0 10px;color:var(--muted);font-size:9px}.clinicGate{padding:8px;border:1px solid #6b5326;border-radius:10px;background:#2b2415;color:#ffd98a;font-size:9px;margin-bottom:10px}.clinicGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.clinicCard{padding:10px;border:1px solid #292f34;border-radius:12px;background:#15181b}.clinicCard h4{margin:0 0 8px;font-size:11px}.clinicFields{display:grid;grid-template-columns:1fr 1fr;gap:6px}.clinicField{display:grid;gap:3px}.clinicField.full{grid-column:1/-1}.clinicField label{font-size:8px;color:var(--muted)}.clinicField input,.clinicField select,.clinicField textarea{width:100%;min-height:38px;padding:8px;border:1px solid var(--line);border-radius:9px;background:#181b1f;color:#fff;font-size:10px}.clinicField textarea{min-height:68px}.clinicBtn{margin-top:8px;min-height:36px;padding:7px 11px;border:0;border-radius:9px;background:var(--accent);color:#10130b;font-weight:850}.clinicList{display:grid;gap:4px;margin-top:7px;max-height:150px;overflow:auto}.clinicRow{padding:6px;border:1px solid #292f34;border-radius:8px;font-size:8px}@media(max-width:760px){.clinicGrid,.clinicFields{grid-template-columns:1fr}.clinicField.full{grid-column:auto}}';document.head.append(style);
  const opt=(v,l)=>'<option value="'+E(v)+'">'+E(l)+'</option>', customer=id=>(D?.customers||[]).find(x=>x.id===id), service=id=>(D?.services||[]).find(x=>x.id===id);
  const fmt=v=>{try{return new Intl.DateTimeFormat(A()?'ar-AE':'en-AE',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(v))}catch{return''}};
  const appts=()=>{const c=C();return opt('',c.none)+(D?.appointments||[]).filter(x=>x.customer_id&&x.service_id).map(x=>opt(x.id,(customer(x.customer_id)?.display_name||c.customer)+' · '+(service(x.service_id)?.name_ar||service(x.service_id)?.name||c.service)+' · '+fmt(x.starts_at))).join('')};
  const customers=()=>opt('',C().none)+(D?.customers||[]).map(x=>opt(x.id,x.display_name||C().customer)).join('');
  const services=()=>opt('',C().none)+(D?.services||[]).filter(x=>x.active!==false).map(x=>opt(x.id,x.name_ar||x.name||C().service)).join('');
  const packages=()=>opt('',C().none)+(D?.packages||[]).filter(x=>x.status==='active').map(x=>opt(x.id,x.package_name+' ('+(x.total_sessions-x.used_sessions)+' '+C().rem+')')).join('');
  const devices=()=>opt('',C().none)+(D?.devices||[]).filter(x=>x.active).map(x=>opt(x.id,x.name)).join('');
  const templates=()=>opt('',C().none)+(D?.consent_templates||[]).filter(x=>x.active).map(x=>opt(x.id,x.title_ar+' v'+x.version)).join('');
  async function api(body){const r=await fetch('/api/clinic-operations'+(body?'':'?business_id='+encodeURIComponent(bid())),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:body?JSON.stringify({business_id:bid(),...body}):undefined});const p=await r.json().catch(()=>({}));if(!r.ok||!p.ok){const e=new Error(p.error||'FAILED');e.payload=p;throw e}return p}
  function iso(v){if(!v)return null;const d=new Date(v+':00+04:00');return Number.isNaN(d.getTime())?null:d.toISOString()}
  function render(){if(!isClinic()||!D)return;const c=C(),s=$('#screen-appointments');if(!s)return;let p=$('#clinicV1');if(!p){p=document.createElement('section');p.id='clinicV1';p.className='clinicV1';s.append(p)}const closed=!D.patient_data_gate?.production_patient_data_allowed;
    p.innerHTML='<h3>'+E(c.title)+'</h3><p>'+E(c.desc)+'</p>'+(closed?'<div class="clinicGate">'+E(c.locked)+'</div>':'')+'<div class="clinicGrid">'+
    '<form class="clinicCard" id="cs"><h4>'+E(c.session)+'</h4><div class="clinicFields"><div class="clinicField full"><label>'+E(c.appt)+'</label><select id="ca">'+appts()+'</select></div><div class="clinicField"><label>'+E(c.type)+'</label><select id="ct">'+opt('treatment','Treatment / علاج')+opt('consultation','Consultation / استشارة')+opt('test_patch','Test patch / اختبار')+opt('follow_up','Follow-up / متابعة')+opt('maintenance','Maintenance / صيانة')+'</select></div><div class="clinicField"><label>'+E(c.area)+'</label><input id="car"></div><div class="clinicField"><label>'+E(c.pkg)+'</label><select id="cp">'+packages()+'</select></div><div class="clinicField"><label>'+E(c.dev)+'</label><select id="cd">'+devices()+'</select></div><div class="clinicField full"><label>'+E(c.settings)+'</label><textarea id="cset"></textarea></div><div class="clinicField full"><label>'+E(c.before)+'</label><textarea id="cb"></textarea></div><div class="clinicField full"><label>'+E(c.after)+'</label><textarea id="caf"></textarea></div><div class="clinicField"><label>'+E(c.next)+'</label><input id="cn" type="datetime-local"></div><div class="clinicField"><label>'+E(c.status)+'</label><select id="cst">'+opt('completed','Completed / مكتملة')+opt('planned','Planned / مخططة')+opt('in_progress','In progress / جارية')+opt('cancelled','Cancelled / ملغية')+'</select></div></div><button class="clinicBtn">'+E(c.save)+'</button></form>'+
    '<form class="clinicCard" id="pk"><h4>'+E(c.package)+'</h4><div class="clinicFields"><div class="clinicField"><label>'+E(c.customer)+'</label><select id="pc">'+customers()+'</select></div><div class="clinicField"><label>'+E(c.service)+'</label><select id="ps">'+services()+'</select></div><div class="clinicField full"><label>'+E(c.name)+'</label><input id="pn"></div><div class="clinicField"><label>'+E(c.sessions)+'</label><input id="pt" type="number" min="1" max="100" value="6"></div><div class="clinicField"><label>'+E(c.price)+'</label><input id="pp" type="number" min="0" step="0.01"></div><div class="clinicField full"><label>'+E(c.expiry)+'</label><input id="pe" type="date"></div></div><button class="clinicBtn">'+E(c.save)+'</button><div class="clinicList">'+(D.packages||[]).slice(0,8).map(x=>'<div class="clinicRow">'+E(x.package_name)+' · '+E(c.rem)+': '+Math.max(0,x.total_sessions-x.used_sessions)+'</div>').join('')+'</div></form>'+
    '<form class="clinicCard" id="dv"><h4>'+E(c.device)+'</h4><div class="clinicFields"><div class="clinicField"><label>'+E(c.name)+'</label><input id="dn"></div><div class="clinicField"><label>'+E(c.model)+'</label><input id="dm"></div><div class="clinicField full"><label>Type</label><select id="dt">'+opt('laser','Laser / ليزر')+opt('aesthetic','Aesthetic / تجميل')+opt('other','Other / أخرى')+'</select></div></div><button class="clinicBtn">'+E(c.save)+'</button><div class="clinicList">'+(D.devices||[]).slice(0,8).map(x=>'<div class="clinicRow">'+E(x.name)+' · '+E(x.model||x.device_type)+'</div>').join('')+'</div></form>'+
    '<div class="clinicCard"><h4>'+E(c.consent)+'</h4><form id="tpl"><div class="clinicFields"><div class="clinicField"><label>'+E(c.template)+'</label><input id="tt"></div><div class="clinicField"><label>'+E(c.version)+'</label><input id="tv" value="1.0"></div><div class="clinicField full"><label>'+E(c.body)+'</label><textarea id="tb"></textarea></div></div><button class="clinicBtn">'+E(c.save)+'</button></form><form id="rc"><div class="clinicFields"><div class="clinicField"><label>'+E(c.appt)+'</label><select id="ra">'+appts()+'</select></div><div class="clinicField"><label>'+E(c.template)+'</label><select id="rt">'+templates()+'</select></div></div><button class="clinicBtn">'+E(c.record)+'</button></form></div></div>';
    $('#cs').onsubmit=e=>save(e,{action:'save_session',appointment_id:$('#ca').value,session_type:$('#ct').value,treatment_area:$('#car').value,package_id:$('#cp').value||null,device_id:$('#cd').value||null,device_settings_notes:$('#cset').value,notes_before:$('#cb').value,notes_after:$('#caf').value,next_session_at:iso($('#cn').value),status:$('#cst').value});
    $('#pk').onsubmit=e=>save(e,{action:'save_package',customer_id:$('#pc').value,service_id:$('#ps').value,package_name:$('#pn').value,total_sessions:$('#pt').value,price_aed:$('#pp').value,expires_at:$('#pe').value||null});
    $('#dv').onsubmit=e=>save(e,{action:'save_device',name:$('#dn').value,model:$('#dm').value,device_type:$('#dt').value});
    $('#tpl').onsubmit=e=>save(e,{action:'save_consent_template',title_ar:$('#tt').value,title_en:$('#tt').value,body_ar:$('#tb').value,body_en:'',version:$('#tv').value});
    $('#rc').onsubmit=e=>{const a=(D.appointments||[]).find(x=>x.id===$('#ra').value);save(e,{action:'record_consent',appointment_id:a?.id,customer_id:a?.customer_id,template_id:$('#rt').value,granted:true})};
  }
  async function save(e,b){e.preventDefault();if(busy)return;busy=true;try{await api(b);try{toast(C().saved)}catch{};await load()}catch(x){try{toast(x?.payload?.error==='PATIENT_DATA_GATE_CLOSED'?C().locked:C().fail)}catch{}}finally{busy=false}}
  async function load(){if(!isClinic()||!bid()||busy||loading)return;loading=true;try{D=await api();render()}catch(e){console.error('clinic_mode_load',e)}finally{loading=false}}
  const clinicScreen=$('#screen-appointments');
  if(clinicScreen){
    const clinicActivationObserver=new MutationObserver(()=>{if(isClinic()&&clinicScreen.classList.contains('active'))load()});
    clinicActivationObserver.observe(clinicScreen,{attributes:true,attributeFilter:['class']});
  }
  try{
    const baseRenderAllClinic=renderAll;
    renderAll=function(){const result=baseRenderAllClinic.apply(this,arguments);if(isClinic()&&clinicScreen?.classList.contains('active'))setTimeout(load,0);return result};
  }catch{}
  setTimeout(load,700);window.__dabbirClinicMode={refresh:load,version:'beauty-laser-v2-event-scoped'};
})();

(()=>{
  if(window.__dabbirBusinessActivityProfile)return;
  window.__dabbirBusinessActivityProfile=true;
  const style=document.createElement('style');style.dataset.dabbirActivityProfile='v1';style.textContent="\n.dap-card{margin-top:12px;border:1px solid #30363d;background:linear-gradient(180deg,#15191d,#101214);border-radius:16px;overflow:hidden}.dap-head{padding:15px 16px 13px;border-bottom:1px solid #292e34;background:#15181b}.dap-head-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dap-head h2{font-size:14px;margin:0;color:#fff}.dap-head p{font-size:9px;line-height:1.7;color:var(--muted);margin:5px 0 0}.dap-badge{display:inline-flex;align-items:center;border:1px solid #42502f;background:#1b2415;color:var(--accent);border-radius:999px;padding:5px 8px;font-size:8px;font-weight:900;white-space:nowrap}.dap-form{padding:13px}.dap-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dap-field{display:flex;flex-direction:column;gap:6px;min-width:0}.dap-field.wide{grid-column:1/-1}.dap-field label{font-size:9px;font-weight:800;color:#c5cbd1}.dap-field textarea{width:100%;min-height:84px;border:1px solid #30363d;background:#181b1f;color:#fff;border-radius:12px;padding:10px 12px;resize:vertical;line-height:1.55;font:inherit}.dap-field textarea:focus{outline:none;border-color:#687c37;box-shadow:0 0 0 3px #d7ff5f12}.dap-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px}.dap-msg{font-size:9px;color:var(--muted);min-height:18px}.dap-save{min-width:150px}.dk-field.dabbir-activity-hidden{display:none!important}\n@media(max-width:700px){.dap-card{margin-top:9px;border-radius:14px}.dap-head{padding:13px}.dap-head-row{gap:8px}.dap-head h2{font-size:13px}.dap-head p{font-size:9px}.dap-badge{font-size:7px}.dap-form{padding:10px}.dap-grid{grid-template-columns:1fr;gap:9px}.dap-field.wide{grid-column:auto}.dap-field textarea{font-size:16px;min-height:74px}.dap-actions{display:grid;grid-template-columns:1fr;gap:7px}.dap-save{width:100%;min-height:48px}.dap-msg{order:2;text-align:center}}\n";document.head.append(style);
  const profiles={"salon":{"hideDelivery":true,"fields":["service_catalog","pricing_notes","team_specialists","appointment_details","customer_requirements","activity_operations"],"ar":{"name":"الصالون","title":"تفاصيل الصالون","desc":"أضف ما يحتاجه دبّر لفهم خدمات الصالون والحجوزات والعميلات بدقة.","labels":{"service_catalog":"الخدمات والأسعار","pricing_notes":"الأسعار والعروض والعربون","team_specialists":"الموظفات / المختصات وتخصصاتهن","appointment_details":"مدة الخدمات والفواصل بين الحجوزات","customer_requirements":"الإلغاء وعدم الحضور وتعليمات قبل الموعد","activity_operations":"ملاحظات تشغيلية مهمة"},"placeholders":{"service_catalog":"مثال: قص شعر 120 د.إ، مناكير 80 د.إ، صبغة من 250 د.إ","pricing_notes":"العربون، العروض، متى يتغير السعر، وما الذي يشمله السعر","team_specialists":"الأسماء والتخصصات أو المهارات التي يحتاج العميل معرفتها","appointment_details":"مدة كل خدمة، وقت التحضير أو التنظيف، وسياسة التأخير","customer_requirements":"شروط الإلغاء، عدم الحضور، وأي تعليمات قبل الموعد","activity_operations":"أي تفاصيل يومية تساعد دبّر على الرد بشكل صحيح"}},"en":{"name":"Salon","title":"Salon details","desc":"Add the details DABBIR needs to understand salon services, bookings, and clients accurately.","labels":{"service_catalog":"Services & prices","pricing_notes":"Pricing, offers & deposits","team_specialists":"Team / specialists and specialties","appointment_details":"Service duration & booking buffers","customer_requirements":"Cancellation, no-show & pre-visit instructions","activity_operations":"Important operating notes"},"placeholders":{"service_catalog":"Example: Haircut 120 AED, manicure 80 AED, color from 250 AED","pricing_notes":"Deposits, offers, price conditions, and what is included","team_specialists":"Names and specialties or skills customers may need to know","appointment_details":"Service duration, preparation/cleanup time, and lateness policy","customer_requirements":"Cancellation, no-show, and pre-appointment instructions","activity_operations":"Daily details that help DABBIR answer correctly"}}},"clinic":{"hideDelivery":true,"fields":["service_catalog","team_specialists","appointment_details","customer_requirements","pricing_notes","activity_operations"],"ar":{"name":"العيادة","title":"تفاصيل العيادة","desc":"معلومات المواعيد والخدمات والمختصين التي يحتاجها دبّر للرد الإداري فقط.","labels":{"service_catalog":"أنواع المواعيد والخدمات","team_specialists":"الأطباء / المختصون","appointment_details":"مدة المواعيد والفواصل","customer_requirements":"تعليمات المراجع قبل الموعد","pricing_notes":"الرسوم وطرق التأكيد","activity_operations":"ملاحظات إدارية وتشغيلية"},"placeholders":{"service_catalog":"أنواع المواعيد أو الخدمات التي يمكن حجزها","team_specialists":"الأسماء والتخصصات ومواعيد التوفر العامة","appointment_details":"مدة الموعد، وقت الحضور المبكر، وسياسة التأخير","customer_requirements":"المستندات أو التعليمات الإدارية المطلوبة قبل الزيارة","pricing_notes":"الرسوم المعلنة، العربون أو شروط التأكيد إن وجدت","activity_operations":"معلومات إدارية غير طبية يحتاجها الرد على العملاء"}},"en":{"name":"Clinic","title":"Clinic details","desc":"Administrative appointment, service, and specialist information DABBIR can use in customer replies.","labels":{"service_catalog":"Appointment types & services","team_specialists":"Doctors / specialists","appointment_details":"Appointment duration & buffers","customer_requirements":"Pre-visit instructions","pricing_notes":"Fees & confirmation rules","activity_operations":"Administrative operating notes"},"placeholders":{"service_catalog":"Appointment or service types that can be booked","team_specialists":"Names, specialties, and general availability","appointment_details":"Duration, early arrival, and lateness policy","customer_requirements":"Administrative documents or instructions required before a visit","pricing_notes":"Published fees, deposits, or confirmation conditions","activity_operations":"Non-medical administrative information for customer replies"}}},"car_wash":{"hideDelivery":true,"fields":["service_catalog","pricing_notes","appointment_details","customer_requirements","activity_operations"],"ar":{"name":"غسيل السيارات","title":"تفاصيل غسيل السيارات","desc":"الخدمات والباقات ومدة الحجز وطريقة تنفيذ الخدمة بدون تعقيد إضافي.","labels":{"service_catalog":"الخدمات والباقات والأسعار","pricing_notes":"فروقات السعر حسب السيارة والإضافات","appointment_details":"مدة الخدمة والحجز","customer_requirements":"تعليمات العميل قبل الخدمة","activity_operations":"طريقة تنفيذ الخدمة والموقع"},"placeholders":{"service_catalog":"مثال: غسيل خارجي، داخلي، تلميع، باقات وأسعارها","pricing_notes":"سيدان / SUV / مركبة كبيرة، والإضافات التي تغيّر السعر","appointment_details":"مدة كل باقة ووقت الوصول أو التأخير المسموح","customer_requirements":"مثال: توفر المركبة والمفتاح أو نقطة الكهرباء/الماء إن لزم","activity_operations":"هل الخدمة متنقلة أو في الموقع، وكيف يحدد العميل موقع المركبة"}},"en":{"name":"Car wash","title":"Car wash details","desc":"Services, packages, booking duration, and how the service is delivered without extra complexity.","labels":{"service_catalog":"Services, packages & prices","pricing_notes":"Vehicle-size pricing & add-ons","appointment_details":"Service and booking duration","customer_requirements":"Customer preparation instructions","activity_operations":"Service method & location details"},"placeholders":{"service_catalog":"Example: exterior wash, interior, polish, packages and prices","pricing_notes":"Sedan / SUV / large vehicle differences and paid add-ons","appointment_details":"Duration per package and arrival/lateness rules","customer_requirements":"Example: vehicle/key availability or power/water access if required","activity_operations":"Whether service is mobile or on-site and how the vehicle location is provided"}}},"store":{"hideDelivery":false,"fields":["service_catalog","pricing_notes","customer_requirements","activity_operations"],"ar":{"name":"المتجر","title":"تفاصيل المتجر","desc":"المنتجات والطلبات وشروط البيع التي يحتاجها دبّر بجانب سياسة التوصيل.","labels":{"service_catalog":"فئات المنتجات والمنتجات المهمة","pricing_notes":"الأسعار والعروض والحد الأدنى","customer_requirements":"متطلبات الطلب من العميل","activity_operations":"طريقة تجهيز ومعالجة الطلبات"},"placeholders":{"service_catalog":"الفئات أو المنتجات الأكثر طلبًا وأي فروقات مهمة","pricing_notes":"العروض، الحد الأدنى للطلب، أو قواعد التسعير","customer_requirements":"المعلومات المطلوبة لتأكيد الطلب","activity_operations":"خطوات التجهيز والتأكيد والاستلام أو الشحن"}},"en":{"name":"Store","title":"Store details","desc":"Products, orders, and selling rules DABBIR needs alongside the delivery policy.","labels":{"service_catalog":"Product categories & key products","pricing_notes":"Pricing, offers & minimums","customer_requirements":"Customer order requirements","activity_operations":"Order preparation & handling"},"placeholders":{"service_catalog":"Top categories/products and important variations","pricing_notes":"Offers, minimum order, or pricing rules","customer_requirements":"Information required to confirm an order","activity_operations":"Preparation, confirmation, pickup, or shipping flow"}}},"creator":{"hideDelivery":false,"fields":["service_catalog","pricing_notes","customer_requirements","activity_operations"],"ar":{"name":"البيع عبر السوشيال","title":"تفاصيل الطلبات والبيع","desc":"معلومات عملية للبائعين عبر Instagram وWhatsApp.","labels":{"service_catalog":"المنتجات أو أنواع الطلبات","pricing_notes":"الأسعار والعروض","customer_requirements":"بيانات تأكيد الطلب","activity_operations":"طريقة معالجة الطلبات"},"placeholders":{"service_catalog":"المنتجات أو الفئات التي تبيعها","pricing_notes":"العروض أو قواعد السعر","customer_requirements":"الاسم، الهاتف، المقاس/اللون أو أي بيانات لازمة","activity_operations":"من استقبال الرسالة حتى تجهيز الطلب وتسليمه"}},"en":{"name":"Social selling","title":"Order & selling details","desc":"Practical information for Instagram and WhatsApp sellers.","labels":{"service_catalog":"Products or order types","pricing_notes":"Pricing & offers","customer_requirements":"Order confirmation details","activity_operations":"Order handling flow"},"placeholders":{"service_catalog":"Products or categories you sell","pricing_notes":"Offers or pricing rules","customer_requirements":"Name, phone, size/color, or other required details","activity_operations":"From incoming message to prepared and handed-off order"}}},"laundry":{"hideDelivery":false,"fields":["service_catalog","pricing_notes","appointment_details","customer_requirements","activity_operations"],"ar":{"name":"المغسلة","title":"تفاصيل المغسلة","desc":"أنواع الغسيل والأسعار ومدة الإنجاز والاستلام والتسليم.","labels":{"service_catalog":"الخدمات والأسعار","pricing_notes":"التسعير والإضافات","appointment_details":"مدة الإنجاز وأوقات الاستلام","customer_requirements":"تعليمات القطع من العميل","activity_operations":"مسار الاستلام والغسيل والجاهزية"},"placeholders":{"service_catalog":"غسيل، كي، تنظيف جاف وغيرها مع الأسعار","pricing_notes":"التسعير بالقطعة/الوزن وأي إضافات","appointment_details":"المدة المعتادة ومواعيد الاستلام أو التسليم","customer_requirements":"تعليمات خاصة للبقع أو القطع الحساسة","activity_operations":"كيف ينتقل الطلب من الاستلام حتى الجاهزية"}},"en":{"name":"Laundry","title":"Laundry details","desc":"Cleaning types, pricing, turnaround, intake, and handoff.","labels":{"service_catalog":"Services & prices","pricing_notes":"Pricing & add-ons","appointment_details":"Turnaround & handoff timing","customer_requirements":"Garment instructions","activity_operations":"Intake-to-ready workflow"},"placeholders":{"service_catalog":"Wash, press, dry-cleaning, etc. with prices","pricing_notes":"Per-item/weight pricing and add-ons","appointment_details":"Typical turnaround and pickup/delivery timing","customer_requirements":"Special stain or delicate-item instructions","activity_operations":"How an order moves from received to ready"}}},"services":{"hideDelivery":true,"fields":["service_catalog","pricing_notes","appointment_details","customer_requirements","activity_operations"],"ar":{"name":"الخدمات","title":"تفاصيل الخدمات","desc":"الخدمات والأسعار والمواعيد ومتطلبات العميل حسب طبيعة العمل.","labels":{"service_catalog":"الخدمات والأسعار","pricing_notes":"التسعير والإضافات","appointment_details":"مدة الخدمة والمواعيد","customer_requirements":"ما يحتاجه العميل قبل الخدمة","activity_operations":"طريقة تنفيذ العمل"},"placeholders":{"service_catalog":"الخدمات المتاحة وما يشمله كل خيار","pricing_notes":"الأسعار الأساسية والإضافات","appointment_details":"مدة العمل وسياسة الموعد أو التأخير","customer_requirements":"البيانات أو التجهيزات المطلوبة من العميل","activity_operations":"كيف يبدأ العمل وكيف يعتبر مكتملًا"}},"en":{"name":"Services","title":"Service details","desc":"Services, pricing, appointments, and customer requirements for this activity.","labels":{"service_catalog":"Services & prices","pricing_notes":"Pricing & add-ons","appointment_details":"Service duration & appointments","customer_requirements":"Customer preparation","activity_operations":"How work is performed"},"placeholders":{"service_catalog":"Available services and what each includes","pricing_notes":"Base pricing and add-ons","appointment_details":"Work duration and appointment/lateness policy","customer_requirements":"Information or preparation required from the customer","activity_operations":"How work starts and when it is considered complete"}}},"real_estate":{"hideDelivery":true,"fields":["service_catalog","team_specialists","appointment_details","customer_requirements","activity_operations"],"ar":{"name":"العقار","title":"تفاصيل النشاط العقاري","desc":"أنواع العقارات والمعاينات والمتابعات ومعلومات العميل المطلوبة.","labels":{"service_catalog":"أنواع العقارات والخدمات","team_specialists":"المسؤولون / الوسطاء","appointment_details":"المعاينات والمواعيد","customer_requirements":"بيانات العميل المطلوبة","activity_operations":"المتابعة والتشغيل"},"placeholders":{"service_catalog":"بيع، إيجار، إدارة أو أنواع العقارات المتاحة","team_specialists":"الأسماء أو الاختصاصات ذات الصلة","appointment_details":"طريقة حجز المعاينة ومدة الموعد","customer_requirements":"الميزانية، المنطقة، نوع العقار أو أي بيانات مطلوبة","activity_operations":"آلية المتابعة بعد الاستفسار أو المعاينة"}},"en":{"name":"Real estate","title":"Real-estate details","desc":"Property types, viewings, follow-ups, and customer requirements.","labels":{"service_catalog":"Property types & services","team_specialists":"Agents / responsible team","appointment_details":"Viewings & appointments","customer_requirements":"Required customer details","activity_operations":"Follow-up operations"},"placeholders":{"service_catalog":"Sale, rent, management, or property types available","team_specialists":"Relevant names or specialties","appointment_details":"How viewings are booked and appointment duration","customer_requirements":"Budget, area, property type, or other required details","activity_operations":"Follow-up flow after an inquiry or viewing"}}},"other":{"hideDelivery":false,"fields":["service_catalog","pricing_notes","customer_requirements","activity_operations"],"ar":{"name":"النشاط","title":"تفاصيل إضافية للنشاط","desc":"أضف المعلومات المتكررة التي يحتاجها دبّر لفهم عملك والرد بدقة.","labels":{"service_catalog":"المنتجات أو الخدمات","pricing_notes":"الأسعار والعروض","customer_requirements":"متطلبات العميل","activity_operations":"طريقة تشغيل العمل"},"placeholders":{"service_catalog":"أهم المنتجات أو الخدمات","pricing_notes":"الأسعار أو قواعد التسعير","customer_requirements":"ما يجب أن يقدمه العميل","activity_operations":"أي خطوات تشغيلية مهمة"}},"en":{"name":"Business","title":"Additional business details","desc":"Add recurring information DABBIR needs to understand the business and answer accurately.","labels":{"service_catalog":"Products or services","pricing_notes":"Pricing & offers","customer_requirements":"Customer requirements","activity_operations":"Operating flow"},"placeholders":{"service_catalog":"Key products or services","pricing_notes":"Pricing or pricing rules","customer_requirements":"What the customer must provide","activity_operations":"Important operating steps"}}}};
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const business=()=>{try{if(typeof workspace!=='undefined'&&workspace?.business)return workspace.business}catch{}return window.workspace?.business||null};
  const type=()=>String(business()?.business_type||'other').toLowerCase();
  const profile=()=>profiles[type()]||profiles.other;
  const copy=()=>profile()[ar()?'ar':'en'];
  const esc=value=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let loadedFor='',values={},busy=false,lastRenderKey='';

  function genericCard(){return q('.dabbir-knowledge-card')}
  function applyGenericVisibility(){
    const p=profile();
    const delivery=q('.dk-field[data-key="delivery_policy"]');
    if(delivery)delivery.classList.toggle('dabbir-activity-hidden',Boolean(p.hideDelivery));
  }

  function ensureCard(){
    const base=genericCard();if(!base||!business()?.id)return null;
    applyGenericVisibility();
    let card=q('#dabbirActivityDetailsCard');
    if(!card){card=document.createElement('section');card.id='dabbirActivityDetailsCard';card.className='dap-card';base.insertAdjacentElement('afterend',card)}
    return card;
  }

  function render(){
    const card=ensureCard();if(!card)return;
    const p=profile(),c=copy(),renderKey=[business().id,type(),ar()?'ar':'en',p.fields.join(',')].join('|');
    if(renderKey===lastRenderKey&&card.dataset.ready==='1')return;
    lastRenderKey=renderKey;
    card.innerHTML='<div class="dap-head"><div class="dap-head-row"><div><h2>'+esc(c.title)+'</h2><p>'+esc(c.desc)+'</p></div><span class="dap-badge">'+esc(c.name)+'</span></div></div><form class="dap-form" id="dabbirActivityDetailsForm"><div class="dap-grid">'+p.fields.map((key,index)=>'<div class="dap-field '+(index===p.fields.length-1&&p.fields.length%2?'wide':'')+'" data-activity-key="'+esc(key)+'"><label>'+esc(c.labels[key]||key)+'</label><textarea maxlength="1800" placeholder="'+esc(c.placeholders[key]||'')+'">'+esc(values[key]||'')+'</textarea></div>').join('')+'</div><div class="dap-actions"><div class="dap-msg" id="dabbirActivityDetailsMsg"></div><button class="primary dap-save" type="submit">'+esc(ar()?'حفظ تفاصيل النشاط':'Save activity details')+'</button></div></form>';
    q('#dabbirActivityDetailsForm').onsubmit=save;
    card.dataset.ready='1';
  }

  function message(value,isError=false){const node=q('#dabbirActivityDetailsMsg');if(node){node.textContent=value||'';node.style.color=isError?'#ff9b9b':''}}

  async function load(force=false){
    const id=business()?.id;if(!id||busy)return;
    const key=id+'|'+type();
    if(!force&&loadedFor===key){render();return}
    busy=true;render();message(ar()?'جارٍ تحميل تفاصيل النشاط…':'Loading activity details…');
    try{
      const response=await fetch('/api/business-activity-profile?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_LOAD_FAILED');
      values=body.facts||{};loadedFor=key;lastRenderKey='';render();message('');
    }catch(error){message(ar()?'تعذر تحميل تفاصيل النشاط':'Could not load activity details',true)}finally{busy=false}
  }

  async function save(event){
    event.preventDefault();if(busy)return;
    const id=business()?.id;if(!id)return;
    const form=q('#dabbirActivityDetailsForm');if(!form)return;
    const facts={};form.querySelectorAll('[data-activity-key]').forEach(field=>{facts[field.dataset.activityKey]=field.querySelector('textarea')?.value||''});
    const button=form.querySelector('button[type="submit"]');busy=true;if(button)button.disabled=true;message(ar()?'جارٍ الحفظ…':'Saving…');
    try{
      const response=await fetch('/api/business-activity-profile',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,facts})});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_SAVE_FAILED');
      values=body.facts||facts;loadedFor=id+'|'+type();message(ar()?'تم الحفظ — أصبح دبّر يعرف تفاصيل نشاطك':'Saved — DABBIR now has your activity details');
    }catch(error){message(ar()?'تعذر حفظ تفاصيل النشاط':'Could not save activity details',true)}finally{busy=false;if(button)button.disabled=false}
  }

  function enforce(){
    if(!business()?.id)return;
    applyGenericVisibility();ensureCard();render();load(false);
  }

  let businessProfileQueued=false;
  function scheduleBusinessProfileEnforce(){
    if(businessProfileQueued)return;
    businessProfileQueued=true;
    const run=()=>{businessProfileQueued=false;if(genericCard()&&business()?.id)enforce()};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
  }
  const settingsProfileScreen=q('#screen-settings');
  if(settingsProfileScreen){
    const observer=new MutationObserver(scheduleBusinessProfileEnforce);
    observer.observe(settingsProfileScreen,{subtree:true,childList:true});
  }
  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);scheduleBusinessProfileEnforce();return result}}catch{}
  try{const baseApplyLang=applyLang;applyLang=function(){const result=baseApplyLang.apply(this,arguments);lastRenderKey='';scheduleBusinessProfileEnforce();return result}}catch{}
  setTimeout(enforce,0);setTimeout(enforce,500);setTimeout(enforce,1500);
  window.__dabbirBusinessActivityProfileApi={refresh:()=>{loadedFor='';lastRenderKey='';enforce()},version:'activity-business-profile-v1'};
})();

(()=>{
 if(window.__dabbirActivityIntelligence)return;window.__dabbirActivityIntelligence=true;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ar=()=>document.documentElement.lang!=='en';const t=(a,e)=>ar()?a:e;
 const business=()=>{try{if(typeof workspace!=='undefined'&&workspace?.business)return workspace.business}catch{}return window.workspace?.business||null};
 const modes={AT_BUSINESS:['في الفرع','At the business'],AT_CUSTOMER:['عند العميل','At the customer'],MOBILE:['خدمة متنقلة','Mobile'],REMOTE:['عن بعد','Remote'],PICKUP:['استلام من العميل','Pickup'],DELIVERY:['توصيل','Delivery']};
 const orderLabels={service:['الخدمة','Service'],delivery_mode:['مكان الخدمة','Delivery mode'],vehicle:['المركبة','Vehicle'],location:['الموقع','Location'],property_details:['تفاصيل العقار','Property details'],branch:['الفرع','Branch'],date:['اليوم','Date'],time:['الوقت','Time'],worker:['الموظف','Staff'],slot:['تأكيد الموعد','Slot confirmation']};
 const labels={car_wash:'غسيل سيارات',salon:'صالون',home_cleaning:'تنظيف منازل',clinic:'حجوزات عيادة',maintenance:'صيانة',delivery:'توصيل',consulting:'استشارات',repair_shop:'ورشة إصلاح',pet_grooming:'عناية بالحيوانات',barber:'حلاقة',spa:'سبا',laundry:'مغسلة',tutoring:'تدريس',photography:'تصوير',mobile_services:'خدمات متنقلة',services:'خدمات',other:'نشاط آخر'};
 let current='',branches=[],types=[],profile=null,audit=[],branch='',service='',epoch=0,busy=false;
 const card=()=>document.getElementById('dabbirOperationalServices');
 const selected=()=>profile?.services?.find(x=>x.service_id===service);
 const api=async(data,post=false)=>{
  const response=await fetch('/api/activity-intelligence'+(post?'':'?'+new URLSearchParams(data)),{method:post?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(post?{'content-type':'application/json'}:{})},...(post?{body:JSON.stringify(data)}:{})});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'REQUEST_FAILED');return result;
 };
 const msg=(value,error=false)=>{const node=card()?.querySelector('[data-message]');if(node){node.textContent=value;node.style.color=error?'#ff9b9b':''}};
 function render(){
  const node=card();if(!node)return;const c=selected();const versions=audit.filter(x=>x.service_id===service);const saved=versions.find(x=>x.version===c?.owner_version)?.config||{};
  const ordering=(c?.collection_priority||Object.keys(orderLabels)).map((key,i)=>'<label class="dap-field">'+esc(orderLabels[key]?.[ar()?0:1]||key)+'<select name="priority_'+key+'">'+Object.keys(orderLabels).map((_,n)=>'<option value="'+n+'" '+(i===n?'selected':'')+'>'+(n+1)+'</option>').join('')+'</select></label>').join('');
  const modeInputs=Object.entries(modes).map(([key,copy])=>'<label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" name="mode" value="'+key+'" '+(c?.delivery_modes.includes(key)?'checked':'')+'>'+esc(copy[ar()?0:1])+'</label>').join('');
  node.innerHTML='<div class="dap-head"><h2>'+t('متطلبات كل خدمة','Service requirements')+'</h2><p>'+t('حدد أين تقدم الخدمة والمعلومات التي يحتاجها دبّر قبل الحجز.','Choose where the service is delivered and the details needed before booking.')+'</p></div><form class="dap-form"><div class="dap-grid"><label class="dap-field">'+t('الفرع','Branch')+'<select name="branch"><option value="">'+t('اختر الفرع','Choose a branch')+'</option>'+branches.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===branch?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><label class="dap-field">'+t('الخدمة','Service')+'<select name="service"><option value="">'+t('اختر الخدمة','Choose a service')+'</option>'+(profile?.services||[]).map(x=>'<option value="'+esc(x.service_id)+'" '+(x.service_id===service?'selected':'')+'>'+esc(x.service_name)+'</option>').join('')+'</select></label>'+(c?'<label class="dap-field">'+t('نوع النشاط لهذه الخدمة','Activity for this service')+'<select name="activity" required><option value="" '+(!c.activity_type?'selected':'')+'>'+t('اختر نوع النشاط','Choose an activity')+'</option>'+types.map(x=>'<option value="'+esc(x)+'" '+(c.activity_type===x?'selected':'')+'>'+esc(ar()?labels[x]||x:x.replaceAll('_',' '))+'</option>').join('')+'</select></label><div class="dap-field"><span>'+t('المدة والسعر','Duration and price')+'</span><span>'+esc(c.duration)+' '+t('دقيقة','minutes')+' · '+esc(c.price)+' '+esc(business()?.currency_code||'')+'</span></div><fieldset class="wide" style="border:0;padding:0"><legend>'+t('مكان تقديم الخدمة','Delivery modes')+'</legend>'+modeInputs+'</fieldset><label class="dap-field">'+t('المركبة','Vehicle')+'<select name="vehicle"><option value="default">'+t('حسب نوع الخدمة','Use service defaults')+'</option><option value="required" '+(saved.required_entities?.includes('vehicle')?'selected':'')+'>'+t('مطلوبة','Required')+'</option><option value="optional" '+(saved.optional_entities?.includes('vehicle')?'selected':'')+'>'+t('اختيارية','Optional')+'</option></select></label><label class="dap-field">'+t('اختيار الموظف','Staff selection')+'<select name="worker"><option value="optional">'+t('اختياري','Optional')+'</option><option value="required" '+(saved.required_entities?.includes('worker')?'selected':'')+'>'+t('مطلوب','Required')+'</option></select></label><label style="min-height:44px"><input type="checkbox" name="property" '+(saved.required_entities?.includes('property_details')?'checked':'')+'> '+t('جمع تفاصيل العقار','Collect property details')+'</label><label style="min-height:44px"><input type="checkbox" name="location" '+(saved.required_entities?.includes('location')?'checked':'')+'> '+t('الموقع مطلوب حتى للخدمة في الفرع','Require location for branch services too')+'</label><label style="min-height:44px"><input type="checkbox" name="approval" '+(c.owner_approval||!c.automatic_booking?'checked':'')+'> '+t('أحتاج مراجعة الطلب قبل الحجز','I need to review requests before booking')+'</label><p class="wide">'+t('الخدمات عند العميل تتطلب موقعًا موثقًا تلقائيًا. عدّل السعر والمدة من قائمة الخدمات.','Customer visits always require a verified location. Edit prices and duration in the service catalog.')+'</p><details class="wide"><summary>'+t('منطقة الخدمة','Service area')+'</summary><p>'+t('اتركها فارغة إن لم توجد حدود جغرافية.','Leave empty when there is no geographic restriction.')+'</p><div class="dap-grid"><label class="dap-field">'+t('خط العرض','Latitude')+'<input name="lat" type="number" step="any" min="-90" max="90" value="'+esc(c.service_area?.center?.lat??'')+'"></label><label class="dap-field">'+t('خط الطول','Longitude')+'<input name="lng" type="number" step="any" min="-180" max="180" value="'+esc(c.service_area?.center?.lng??'')+'"></label><label class="dap-field">'+t('نطاق الخدمة بالكيلومتر','Radius in kilometers')+'<input name="radius" type="number" step="any" min="0.1" max="500" value="'+esc(c.service_area?.radius_km??'')+'"></label></div></details><details class="wide"><summary>'+t('ترتيب جمع المعلومات','Question order')+'</summary><p>'+t('الأرقام الأقل تُسأل أولًا عند نقص المعلومة.','Lower numbers are asked first when a detail is missing.')+'</p><div class="dap-grid">'+ordering+'</div></details><div class="dap-actions wide"><button type="submit" class="primary dap-save">'+t('حفظ متطلبات الخدمة','Save requirements')+'</button><button type="button" data-revoke>'+t('استعادة الإعدادات الافتراضية','Restore defaults')+'</button></div><label class="dap-field wide">'+t('استعادة إعداد سابق','Restore a previous configuration')+'<select name="restore"><option value="">'+t('اختر نسخة محفوظة','Choose a saved version')+'</option>'+versions.map(x=>'<option value="'+x.version+'">'+x.version+' · '+esc(x.created_at.slice(0,10))+'</option>').join('')+'</select><button type="button" data-rollback>'+t('استعادة النسخة','Restore version')+'</button></label>':'')+'</div><p role="status" data-message></p></form>';
  const form=node.querySelector('form');for(const el of form.querySelectorAll('select,input[type=number]')){el.style.minHeight='44px';el.style.fontSize='16px';el.style.maxWidth='100%';el.style.width='100%';}
  form.elements.branch.onchange=async e=>{branch=e.target.value;service='';profile=null;render();if(branch)await loadProfile()};
  form.elements.service.onchange=e=>{service=e.target.value;render()};
  form.onsubmit=e=>{e.preventDefault();save('SAVE')};
  node.querySelector('[data-revoke]')?.addEventListener('click',()=>save('REVOKE'));
  node.querySelector('[data-rollback]')?.addEventListener('click',()=>save('ROLLBACK'));
 }
 async function loadProfile(){const revision=++epoch,b=current,br=branch;busy=true;msg(t('جارٍ التحميل…','Loading…'));try{const result=await api({business_id:b,branch_id:br});if(revision!==epoch||current!==b)return;profile=result.profile;audit=result.audit;types=result.activity_types;if(!profile.services.some(x=>x.service_id===service))service=profile.services.length===1?profile.services[0].service_id:'';render()}catch{msg(t('تعذر تحميل متطلبات الخدمة. حاول مجددًا.','Could not load requirements. Please retry.'),true)}finally{busy=false}}
 async function save(action){
  const c=selected(),form=card()?.querySelector('form');if(!c||busy)return;
  const fields=new FormData(form),saved=audit.find(x=>x.service_id===c.service_id&&x.version===c.owner_version)?.config||{},config={...saved,activity_type:fields.get('activity'),delivery_modes:fields.getAll('mode'),required_entities:[],optional_entities:[],owner_approval:fields.has('approval'),automatic_booking:!fields.has('approval')};
  config.collection_priority=Object.keys(orderLabels).sort((a,b)=>Number(fields.get('priority_'+a)??99)-Number(fields.get('priority_'+b)??99));
  for(const key of ['vehicle','worker']){if(fields.get(key)==='required')config.required_entities.push(key);if(fields.get(key)==='optional')config.optional_entities.push(key)}
  if(fields.has('property'))config.required_entities.push('property_details');if(fields.has('location'))config.required_entities.push('location');
  if(action==='SAVE'&&(!types.includes(config.activity_type)||!config.delivery_modes.length)){msg(t('اختر نوع النشاط ومكان تقديم الخدمة.','Choose the activity and delivery mode.'),true);return}
  const geo=['lat','lng','radius'].map(k=>String(fields.get(k)||''));
  if(geo.some(Boolean)&&!geo.every(Boolean)){msg(t('أكمل بيانات منطقة الخدمة.','Complete the service area fields.'),true);return}
  config.service_area=geo.every(Boolean)?{type:'CIRCLE',center:{lat:Number(geo[0]),lng:Number(geo[1])},radius_km:Number(geo[2])}:null;
  if(action==='ROLLBACK'&&!fields.get('restore')){msg(t('اختر النسخة المطلوب استعادتها.','Choose a version to restore.'),true);return}
  const b=current,br=branch;busy=true;for(const button of form.querySelectorAll('button'))button.disabled=true;
  try{await api({business_id:b,branch_id:br,service_id:c.service_id,expected_version:c.owner_version,config,action,restore_version:Number(fields.get('restore'))||null},true);if(current===b&&branch===br){await loadProfile();msg(t('تم حفظ متطلبات الخدمة.','Service requirements saved.'))}}
  catch{msg(t('تعذر الحفظ. أعد تحميل الإعدادات ثم حاول مجددًا.','Could not save. Reload settings and try again.'),true)}finally{busy=false;for(const button of form.querySelectorAll('button'))button.disabled=false}
 }
 async function mount(){const base=document.getElementById('dabbirActivityDetailsCard'),id=business()?.id;if(!base||!id)return;if(!card()){const node=document.createElement('section');node.className='dap-card';node.id='dabbirOperationalServices';base.after(node)}if(current===id)return;current=id;branch='';service='';profile=null;audit=[];branches=[];const revision=++epoch;render();try{const result=await api({business_id:id});if(revision!==epoch||current!==id)return;branches=result.branches;types=result.activity_types;branch=branches.length===1?branches[0].id:'';render();if(branch)await loadProfile()}catch{msg(t('إعدادات الخدمة متاحة لمالك النشاط بعد تحميلها.','Service settings are available to the business owner once loaded.'),true)}}
 let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;mount()},100)}).observe(document.body,{subtree:true,childList:true});setTimeout(mount,0);
})();

(()=>{
  if(document.querySelector('style[data-dabbir-action-center]'))return;
  const style=document.createElement('style');
  style.dataset.dabbirActionCenter='v3';
  style.textContent="\n.dabbir-action-center{margin-bottom:12px;border-color:#343a31;background:linear-gradient(180deg,#171b17,#101311)}\n.dabbir-action-center [hidden]{display:none!important}\n.dac-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.dac-head strong{font-size:16px}.dac-status{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.45}.dac-brief{margin:12px 0;color:#dfe4e7;font-size:13px;line-height:1.7}.dac-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dac-metric{border:1px solid #2b3031;background:#121518;border-radius:13px;padding:10px}.dac-metric strong{display:block;font-size:21px}.dac-metric span{font-size:12px;color:var(--muted);line-height:1.4}.dac-metric.critical strong{color:var(--red)}.dac-metric.warning strong{color:var(--yellow)}.dac-metric.handled strong{color:var(--green)}.dac-items{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dac-item{display:flex;align-items:center;gap:9px;border:1px solid #292e31;background:#15181a;border-radius:13px;padding:10px}.dac-item.critical{border-inline-start:3px solid var(--red)}.dac-item.warning{border-inline-start:3px solid var(--yellow)}.dac-item.info{border-inline-start:3px solid var(--blue)}.dac-item-body{flex:1;min-width:0}.dac-item-body b{display:block;font-size:13px;line-height:1.45}.dac-item-body span{display:block;color:#b6bcc3;font-size:12px;line-height:1.55;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dac-item-body small{display:block;color:#8f99a5;font-size:12px;line-height:1.4;margin-top:4px}.dac-open{min-width:62px;min-height:44px;padding:8px 10px;font-size:12px}.dac-empty{padding:16px;text-align:center;color:var(--green);font-size:13px;border:1px dashed #314034;border-radius:12px;line-height:1.55}.dac-more-wrap{display:flex;justify-content:center;margin-top:9px}.dac-more{min-height:44px;padding:8px 12px;font-size:12px;color:var(--muted)}@media(max-width:700px){.dac-metrics{gap:6px}.dac-metric{padding:9px}.dac-item{align-items:flex-start;gap:8px}.dac-item-body span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dac-open{min-height:44px}.dac-more{min-height:44px}}\n";
  document.head.append(style);

  const CACHE_MS=20000;
  const DEFAULT_VISIBLE=3;
  let lastBusinessId=null;
  let lastScopeKey=null;
  let lastLoadedAt=0;
  let requestGeneration=0;
  let navigationGeneration=0;
  let pending=null;
  let expanded=false;

  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const branchScope=()=>window.dabbirBranchContext?.scope?.()||workspaceNow()?.branch_scope||{mode:'all'};
  const scopeMatches=data=>{
    const expected=branchScope();
    return data?.branch_scope?.mode===(expected.mode||'all')&&(expected.mode!=='selected'||data.branch_scope.branch_id===expected.branch_id);
  };
  const scopeKey=()=>{
    const w=workspaceNow();
    const scope=window.dabbirBranchContext?.scope?.()||w?.branch_scope||{};
    return [w?.user?.id||'',w?.business?.id||'',scope.mode||'',scope.branch_id||''].join('|');
  };
  const notify=value=>{if(typeof toast==='function')toast(value)};
  const businessTimeZone=()=>{
    const business=workspaceNow()?.business||{};
    return String(business.timezone||document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  };

  const text=()=>lang==='ar'?{
    title:'اليوم في دَبِّر',refresh:'تحديث',loading:'دَبِّر يراجع النشاط…',handled:'عالجها دَبِّر',urgent:'يحتاج تدخلك',warning:'راقب اليوم',empty:'لا توجد أولويات في البيانات المتاحة',open:'فتح',error:'تعذر تحميل مركز الأولويات',showLess:'عرض الأهم فقط'
  }:{
    title:'Today in DABBIR',refresh:'Refresh',loading:'DABBIR is reviewing the business…',handled:'Handled by DABBIR',urgent:'Needs you',warning:'Watch today',empty:'No priorities in the available data',open:'Open',error:'Could not load action center',showLess:'Show top 3 only'
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
      const w=workspaceNow();
      if(w?.owner_action_center)render(w.owner_action_center);
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
    try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:businessTimeZone(),day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }

  function moreLabel(hiddenCount,t){
    if(expanded)return t.showLess;
    return lang==='ar'?'عرض بقية الأولويات ('+hiddenCount+')':'Show '+hiddenCount+' more';
  }

  function render(data){
    if(!data?.business_id||data.business_id!==workspaceNow()?.business?.id||!scopeMatches(data))return;
    const panel=ensurePanel();
    if(!panel)return;
    panel.dataset.businessId=data.business_id;
    const t=text();
    panel.querySelector('#dacTitle').textContent=t.title;
    panel.querySelector('#dacRefresh').textContent=t.refresh;
    const status=panel.querySelector('#dacStatus');
    const activity=String(workspaceNow()?.business?.business_type||'').toLowerCase();
    const rows=(Array.isArray(data.items)?data.items:[]).filter(item=>activity==='store'?item.type!=='appointment':!['clinic','salon','real_estate','creator','services','other'].includes(activity)||!['inventory','order'].includes(item.type));
    const filtered=rows.length!==(data.items||[]).length;
    const urgent=filtered?rows.filter(item=>item.severity==='critical').length:data?.metrics?.urgent;
    const warning=filtered?rows.filter(item=>item.severity==='warning').length:data?.metrics?.warning;
    const effectiveStatus=Number(urgent)>0?'needs_attention':Number(warning)>0?'watch':'clear';
    panel.dataset.state=effectiveStatus;
    status.textContent=effectiveStatus==='needs_attention'?(lang==='ar'?'هناك عناصر حرجة':'Critical items need attention'):effectiveStatus==='watch'?(lang==='ar'?'هناك أمور تحتاج متابعة':'Some items need monitoring'):(lang==='ar'?'لا توجد عناصر حرجة':'No critical items');
    const top=rows.slice(0,DEFAULT_VISIBLE).map(item=>lang==='ar'?item.title_ar:item.title_en).filter(Boolean);
    panel.querySelector('#dacBrief').textContent=filtered?(top.join(lang==='ar'?'، ':', ')||t.empty):(lang==='ar'?data?.brief?.ar:data?.brief?.en)||t.empty;
    if(filtered&&data?.truth?.source_limits_reached)panel.querySelector('#dacBrief').textContent+=(lang==='ar'?' قد توجد سجلات إضافية؛ راجع القسم المعني للقائمة الكاملة.':' Additional records may exist; open the relevant section for its full list.');

    const handledAvailable=data?.handled?.available===true;
    const handledValue=handledAvailable?(data?.handled?.verified_autonomous_today??0):'—';
    const metrics=panel.querySelector('#dacMetrics');
    metrics.replaceChildren(
      metric(branchScope().mode==='selected'?(lang==='ar'?'عالجها دَبِّر في النشاط':'Handled across the business'):t.handled,handledValue,'handled'),
      metric(t.urgent,urgent,'critical'),
      metric(t.warning,warning,'warning')
    );

    const list=panel.querySelector('#dacItems');
    list.replaceChildren();
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

    const visibleLimit=expanded?rows.length:DEFAULT_VISIBLE;
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
      when.textContent=(item.scope==='business'&&branchScope().mode==='selected'?(lang==='ar'?'على مستوى النشاط · ':'Across the business · '):'')+formatWhen(item.due_at);
      body.append(title,detail,when);
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary dac-open';
      button.textContent=t.open;
      button.addEventListener('click',async()=>{
        if(button.disabled)return;
        button.disabled=true;
        try{await openItem(item,data.business_id)}finally{button.disabled=false}
      });
      row.append(body,button);
      list.append(row);
    }

    const canExpand=rows.length>DEFAULT_VISIBLE;
    if(moreWrap)moreWrap.hidden=!canExpand;
    if(moreButton&&canExpand){
      const hiddenCount=Math.max(0,rows.length-DEFAULT_VISIBLE);
      moreButton.textContent=moreLabel(hiddenCount,t);
      moreButton.setAttribute('aria-expanded',expanded?'true':'false');
    }
  }

  async function openItem(item,businessId){
    const key=scopeKey();
    const generation=++navigationGeneration;
    const previousScreen=typeof current!=='undefined'?current:null;
    const stillCurrent=()=>scopeKey()===key&&generation===navigationGeneration&&(typeof current==='undefined'||current===previousScreen);
    const unavailable=()=>notify(lang==='ar'?'تعذر فتح السجل المحدد. حدّث الأولويات ثم حاول مجددًا.':'Could not open this record. Refresh priorities and try again.');
    if(!businessId||workspaceNow()?.business?.id!==businessId)return false;
    const id=String(item?.entity_id||'');
    const type=String(item?.type||'');
    try{
      if(['conversation','handoff','followup'].includes(type)){
        if(!id||typeof api!=='function'){unavailable();return false}
        const params=new URLSearchParams({business_id:businessId,conversation_id:id});
        const scope=branchScope();
        if(scope.mode==='selected')params.set('branch_id',scope.branch_id);
        const {r,j}=await api('/api/dabbir-runtime-fast?'+params.toString());
        if(!stillCurrent())return false;
        const conversation=(j?.conversations||[]).find(row=>row.id===id);
        if(!r?.ok||!j?.ok||j.business?.id!==businessId||j.selected_conversation_id!==id||!conversation||(conversation.business_id&&conversation.business_id!==businessId)||(scope.mode==='selected'&&(conversation.branch_id!==scope.branch_id||j.branch_scope?.branch_id!==scope.branch_id))){unavailable();return false}
        workspace=j;
        selectedConversationId=id;
        if(typeof renderAll==='function')renderAll();
        if(typeof showScreen==='function')showScreen('conversations');
        return true;
      }
      if(type==='appointment'){
        const w=workspaceNow(),reader=window.__dabbirBookingReader,lifecycle=window.__dabbirBookingLifecycle;
        if(!id||!reader||!lifecycle){unavailable();return false}
        if(!reader.find(w,id)){
          const day=lifecycle.dayKey(item.due_at,w.business);
          if(day)lifecycle.setView(w,{day,view:'day',scope:item.lifecycle_scope==='review'?'review':'current',allDates:false,followToday:false});
          await reader.ensureRecord(w,id);
        }
        if(!stillCurrent())return false;
        const row=reader?.find?.(w,id);
        if(!id||!row||!lifecycle?.inContext?.(row,w)||!window.__dabbirAppointmentManagement?.open){unavailable();return false}
        if(typeof showScreen==='function')showScreen('appointments');
        if(scopeKey()!==key)return false;
        window.__dabbirAppointmentManagement.open(id);
        return true;
      }
      if(['inventory','order'].includes(type)){
        const opened=await window.__dabbirOwnerOperations?.openRecord?.({business_id:businessId,type,id,isCurrent:stillCurrent});
        if(!opened&&scopeKey()===key)unavailable();
        return opened===true;
      }
      if(type==='channel'&&typeof showScreen==='function'){
        showScreen('integrations');return true;
      }
      unavailable();return false;
    }catch{if(scopeKey()===key)unavailable();return false}
  }

  function clearPanel(panel,state,message){
    if(!panel)return;
    panel.dataset.state=state;
    panel.querySelector('#dacStatus').textContent='';
    panel.querySelector('#dacBrief').textContent=message;
    panel.querySelector('#dacMetrics').replaceChildren();
    panel.querySelector('#dacItems').replaceChildren();
    panel.querySelector('#dacMoreWrap').hidden=true;
  }

  async function loadActionCenter(force=false,recoveredStaleBranch=false){
    const w=workspaceNow();
    const businessId=w?.business?.id;
    const key=scopeKey();
    if(!businessId){requestGeneration++;pending=null;clearPanel(document.querySelector('#dabbirActionCenter'),'unavailable','');return}
    if(pending?.key===key)return pending.promise;
    if(lastScopeKey&&key!==lastScopeKey)expanded=false;
    const now=Date.now();
    if(!force&&key===lastScopeKey&&businessId===lastBusinessId&&now-lastLoadedAt<CACHE_MS&&w?.owner_action_center){
      render(w.owner_action_center);
      return;
    }
    const generation=++requestGeneration;
    const panel=ensurePanel();
    if(panel){
      const t=text();
      panel.querySelector('#dacTitle').textContent=t.title;
      panel.querySelector('#dacRefresh').textContent=t.refresh;
      clearPanel(panel,'loading',t.loading);
    }
    const promise=(async()=>{try{
      const scope=branchScope();
      const params=new URLSearchParams({business_id:businessId,branch_id:scope.mode==='selected'?scope.branch_id:'all'});
      const response=await fetch('/api/owner-action-center?'+params.toString(),{credentials:'same-origin',headers:{accept:'application/json','x-dabbir-client':'web'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(response.status===404&&data?.error==='BRANCH_NOT_FOUND'&&!recoveredStaleBranch&&typeof window.dabbirBranchContext?.refresh==='function'){
        await window.dabbirBranchContext.refresh();
        if(generation!==requestGeneration)return;
        return loadActionCenter(true,true);
      }
      if(generation!==requestGeneration||scopeKey()!==key)return;
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error(data?.error||('ACTION_CENTER_'+response.status));
      if(data.business_id!==businessId||!scopeMatches(data))throw new Error('ACTION_CENTER_CONTEXT_MISMATCH');
      const live=workspaceNow();
      if(live&&live.business?.id===businessId)live.owner_action_center=data;
      lastBusinessId=businessId;
      lastScopeKey=key;
      lastLoadedAt=Date.now();
      render(data);
    }catch(error){
      if(generation!==requestGeneration||scopeKey()!==key)return;
      lastLoadedAt=0;
      delete workspaceNow().owner_action_center;
      console.error('dabbir_action_center_ui_failed',String(error?.message||error).slice(0,120));
      if(panel){
        const t=text();
        clearPanel(panel,'error',t.error);
      }
    }finally{if(pending?.generation===generation)pending=null}})();
    pending={key,generation,promise};
    return promise;
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
      const w=workspaceNow();
      if(w?.owner_action_center)render(w.owner_action_center);
      return result;
    };
  }

  window.__dabbirUiLifecycle?.on?.('afterRender','owner-action-center-context',()=>loadActionCenter(false));
  window.addEventListener?.('dabbir:branch-scope-changed',()=>loadActionCenter(true));
  window.__dabbirUiLifecycle?.on?.('afterLanguage','owner-action-center-language',()=>{const w=workspaceNow();if(w?.owner_action_center)render(w.owner_action_center)});
  window.__dabbirOwnerActionCenter={refresh:()=>loadActionCenter(true),open:openItem,render,version:'owner-action-center-v3'};
})();


(()=>{
 if(window.__dabbirAiBusinessOperatorV3)return;window.__dabbirAiBusinessOperatorV3=true;
 const style=document.createElement('style');style.dataset.dabbirAiBusinessOperator='v3';style.textContent="\n.dabbirOperatorSummary{margin:0 0 12px;border:1px solid #536dfe42;background:linear-gradient(180deg,#101d31,#0d1a2a);border-radius:18px;padding:18px;position:relative;overflow:hidden}.dabbirOperatorSummary:before{content:\"\";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#7c5cff,#4f7cff,#22b8cf)}.doHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.doHead h2{margin:0;font-size:18px}.doHead p{margin:5px 0 0;color:var(--muted);font-size:13px;line-height:1.65}.doState{white-space:nowrap;border:1px solid #2b6150;background:#143328;color:#82e2bd;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:750}.doMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.doMetric{border:1px solid var(--line);background:#ffffff05;border-radius:11px;padding:11px}.doMetric strong{display:block;font-size:22px}.doMetric span{display:block;margin-top:5px;color:var(--muted);font-size:11px}.doCommand{margin-top:14px;border-top:1px solid var(--line);padding-top:13px}.doCommandLabel{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.doCommandLabel strong{font-size:14px}.doCommandLabel span{color:var(--muted);font-size:11px}.doCommandRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.doCommandInput{min-height:50px;border:1px solid var(--line);background:#081525;color:#fff;border-radius:11px;padding:11px 13px;font-size:14px}.doCommandButton,.doApprove,.doCancel{min-width:92px;border:0;border-radius:10px;color:#fff;font-weight:760;padding:10px 14px}.doCommandButton,.doApprove{background:linear-gradient(135deg,#7c5cff,#4f7cff 62%,#22b8cf)}.doCancel{background:#2a3038}.doCommandButton:disabled,.doApprove:disabled{opacity:.55}.doCommandHint,.doReceipt{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.55}.doReceipt{display:none;border:1px solid var(--line);background:#081525;border-radius:10px;padding:10px}.doReceipt.show{display:block}.doReceipt.ok{color:#82e2bd;border-color:#2b6150}.doReceipt.warn{color:#f8d578;border-color:#705723}.doPlan{margin:8px 0;padding-inline-start:20px;color:#fff}.doPlan li{margin:6px 0}.doApprovalActions{display:flex;gap:8px;margin-top:10px}.dabbirOperatorMode #screen-dashboard{display:none}.dabbirOperatorMode #screen-dashboard.active{display:flex;flex-direction:column}.dabbirOperatorMode #screen-dashboard>.hero{order:0;margin-bottom:10px}.dabbirOperatorMode #dabbirOperatorSummary{order:1}.dabbirOperatorMode #dabbirOwnerCopilot{display:none!important}.dabbirOperatorMode #dabbirActionCenter{order:2}.dabbirOperatorMode #dashCards{order:3;margin-top:10px}.dabbirOperatorMode #screen-dashboard>.todayGrid{order:4}.dabbirOperatorMode #setupCard{order:5;opacity:.78}@media(max-width:700px){.dabbirOperatorSummary{padding:14px;border-radius:16px}.doMetrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.doCommandRow{grid-template-columns:1fr}.doCommandInput{font-size:16px}.doCommandButton,.doApprove,.doCancel{min-height:48px}.dabbirOperatorMode #screen-dashboard>.hero h1{display:block!important;font-size:19px!important}}\n";document.head.append(style);document.body?.classList.add('dabbirOperatorMode');
 const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
 const w=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
 const text=()=>ar()?{title:'دبّر يعمل عنك الآن',sub:'حدد الهدف، ودبّر يقرأ وينفذ بعد موافقتك.',active:'وكيل تنفيذي',handled:'أنجزها دبّر',conversations:'المحادثات',appointments:'المواعيد',needs:'تحتاج قرارك',command:'ما الهدف الذي تريد من دبّر إنجازه؟',commandSub:'هدف → قراءة → خطة → موافقة → تنفيذ',placeholder:'مثال: راجع المخزون وسجل المصروف بعد موافقتي',run:'أنشئ الخطة',approve:'أوافق وأنفذ',cancel:'إلغاء',hint:'التغييرات التشغيلية تحتاج موافقتك.',working:'دبّر يراجع الطلب…',done:'اكتمل التنفيذ والتحقق',approval:'الخطة جاهزة وتحتاج موافقتك',failed:'تعذر إكمال الطلب',noReceipt:'لم تُنفذ أي تغييرات.'}:{title:'DABBIR works for you',sub:'Set the goal; DABBIR reads and executes after your approval.',active:'Execution agent',handled:'Handled',conversations:'Conversations',appointments:'Appointments',needs:'Needs you',command:'What outcome should DABBIR accomplish?',commandSub:'Goal → read → plan → approval → execution',placeholder:'Example: inspect inventory and record the expense after approval',run:'Build plan',approve:'Approve & execute',cancel:'Cancel',hint:'Operational changes require your approval.',working:'DABBIR is reviewing the request…',done:'Execution completed and verified',approval:'Plan ready for your approval',failed:'The request could not be completed',noReceipt:'No changes were executed.'};
 function counts(){const x=w()||{},h=(x.handoffs||[]).filter(v=>!['RESOLVED','CLOSED'].includes(String(v.state||'').toUpperCase())).length,f=(x.followups||[]).filter(v=>!['completed','cancelled','sent'].includes(String(v.status||'').toLowerCase())).length;return {handled:x?.owner_action_center?.handled?.available===true?x.owner_action_center.handled.verified_autonomous_today:'—',conversations:(x.conversations||[]).length,appointments:(x.appointments||[]).length,needs:h+f}}
 function metric(label,value){const e=document.createElement('div');e.className='doMetric';e.innerHTML='<strong></strong><span></span>';e.querySelector('strong').textContent=String(value??0);e.querySelector('span').textContent=label;return e}
 async function call(body){return fetch('/api/ai-business-operator',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-dabbir-client':'web'},body:JSON.stringify(body)}).then(async response=>({response,data:await response.json().catch(()=>({}))}))}
 function compactUserText(value){let s=String(value||'').replace(/\*\*|__|\x60|#{1,6}\s*/g,'').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,'').replace(/\((?:[^()]*(?:completed|confirmed|in_progress|requested|pending)[^()]*)\)/gi,'').replace(/\s+/g,' ').trim();if(!s)return '';const parts=s.match(/[^.!؟]+[.!؟]?/g)||[s];s=parts.slice(0,2).join(' ').trim();if(s.length>220){const cut=s.slice(0,220),stop=Math.max(cut.lastIndexOf('،'),cut.lastIndexOf(','),cut.lastIndexOf('.'),cut.lastIndexOf('؟'));s=(stop>90?cut.slice(0,stop):cut).trim()+'…'}return s}
 function showResult(box,data){const receipt=box.querySelector('#doReceipt'),t=text();receipt.replaceChildren();receipt.className='doReceipt show '+(data.state==='completed'?'ok':'warn');const title=document.createElement('strong');title.textContent=data.state==='awaiting_approval'?t.approval:data.state==='completed'?t.done:t.failed;receipt.append(title);if(data.summary||data.error){const p=document.createElement('p');p.textContent=compactUserText(data.summary||data.error);receipt.append(p)}if(Array.isArray(data.approval)&&data.approval.length){const list=document.createElement('ol');list.className='doPlan';for(const step of data.approval){const li=document.createElement('li');li.textContent=compactUserText(step.summary+(step.reason?' — '+step.reason:''));list.append(li)}receipt.append(list);const actions=document.createElement('div');actions.className='doApprovalActions';const approve=document.createElement('button');approve.className='doApprove';approve.type='button';approve.textContent=t.approve;approve.onclick=()=>approvePlan(box,data.approval_token,approve);const cancel=document.createElement('button');cancel.className='doCancel';cancel.type='button';cancel.textContent=t.cancel;cancel.onclick=()=>{receipt.className='doReceipt show warn';receipt.textContent=t.cancel};actions.append(approve,cancel);receipt.append(actions)}if(Array.isArray(data.receipts)&&data.receipts.length){const p=document.createElement('p');p.textContent=ar()?'تم التنفيذ بنجاح.':'Executed successfully.';receipt.append(p)}else if(data.state==='failed'||data.state==='partially_completed'){const p=document.createElement('p');p.textContent=t.noReceipt;receipt.append(p)}}
 async function approvePlan(box,token,button){button.disabled=true;try{const {data}=await call({business_id:w()?.business?.id,action:'approve',approval_token:token,language:ar()?'ar':'en'});showResult(box,data);if(data.executed&&typeof loadRuntime==='function')await loadRuntime(w()?.business?.id,typeof selectedConversationId!=='undefined'?selectedConversationId:null)}catch{showResult(box,{state:'failed'})}finally{button.disabled=false}}
 async function execute(box){const input=box.querySelector('#doCommandInput'),button=box.querySelector('#doCommandButton'),message=String(input.value||'').trim(),businessId=w()?.business?.id;if(!message||!businessId)return;const t=text();button.disabled=true;button.textContent=t.working;box.querySelector('#doReceipt').className='doReceipt show';box.querySelector('#doReceipt').textContent=t.working;try{const {response,data}=await call({business_id:businessId,action:'plan',message,language:ar()?'ar':'en'});if(!response.ok&&!data.error)data.error='HTTP '+response.status;showResult(box,data);if(data.state==='completed')input.value=''}catch(error){showResult(box,{state:'failed',error:String(error?.message||error)})}finally{button.disabled=false;button.textContent=text().run}}
 function ensure(){const dash=document.querySelector('#screen-dashboard');if(!dash)return;let box=document.querySelector('#dabbirOperatorSummary');if(!box){box=document.createElement('section');box.id='dabbirOperatorSummary';box.className='dabbirOperatorSummary';box.innerHTML='<div class="doHead"><div><h2 id="doTitle"></h2><p id="doSubtitle"></p></div><span class="doState" id="doState"></span></div><div class="doMetrics" id="doMetrics"></div><div class="doCommand"><div class="doCommandLabel"><strong id="doCommandTitle"></strong><span id="doCommandSub"></span></div><div class="doCommandRow"><input id="doCommandInput" class="doCommandInput"><button id="doCommandButton" class="doCommandButton" type="button"></button></div><div id="doReceipt" class="doReceipt"></div><div id="doCommandHint" class="doCommandHint"></div></div>';const hero=dash.querySelector(':scope>.hero');hero?hero.insertAdjacentElement('afterend',box):dash.prepend(box);box.querySelector('#doCommandButton').onclick=()=>execute(box);box.querySelector('#doCommandInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();execute(box)}}}const t=text(),c=counts();box.querySelector('#doTitle').textContent=t.title;box.querySelector('#doSubtitle').textContent=t.sub;box.querySelector('#doState').textContent=t.active;box.querySelector('#doCommandTitle').textContent=t.command;box.querySelector('#doCommandSub').textContent=t.commandSub;box.querySelector('#doCommandInput').placeholder=t.placeholder;box.querySelector('#doCommandButton').textContent=t.run;box.querySelector('#doCommandHint').textContent=t.hint;box.querySelector('#doMetrics').replaceChildren(metric(t.handled,c.handled),metric(t.conversations,c.conversations),metric(t.appointments,c.appointments),metric(t.needs,c.needs))}
 function reconcile(){document.body?.classList.add('dabbirOperatorMode');ensure()}
 window.__dabbirUiLifecycle?.on?.('afterRender','ai-business-operator-v4',reconcile);window.__dabbirUiLifecycle?.on?.('afterLanguage','ai-business-operator-v4',reconcile);setTimeout(reconcile,0);setTimeout(reconcile,400);setTimeout(reconcile,1200);window.__dabbirAiBusinessOperator={version:'v4.0-autonomous-daily-operator',reconcile};
})();


(()=>{
  if(window.__dabbirOwnerDecisionMemoryUiLoaded)return;
  window.__dabbirOwnerDecisionMemoryUiLoaded=true;
  const style=document.createElement('style');style.dataset.dabbirOwnerDecisionMemory='v1';style.textContent="\n.dabbir-memory-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}\n.dabbir-memory-btn.has-candidate{border-color:#665fd0;background:#201d35;color:#ddd8ff}\n.dabbir-memory-overlay{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;box-sizing:border-box;background:#000c;color:#e8ebf1;display:flex;align-items:center;justify-content:center;padding:18px}\n.dabbir-memory-overlay::backdrop{background:transparent}.dabbir-memory-dialog{width:min(560px,100%);max-height:84vh;overflow:auto;border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px}\n.dabbir-memory-dialog h3{margin:0;font-size:16px}.dabbir-memory-dialog>p{color:#9fa8b6;font-size:10px;line-height:1.7}\n.dabbir-memory-card{border:1px solid #2e3542;background:#171b23;border-radius:14px;padding:12px;margin-top:9px}\n.dabbir-memory-card b{font-size:11px}.dabbir-memory-card p{font-size:9px;color:#a9b1bf;line-height:1.6;margin:5px 0 8px}.dabbir-memory-card small{display:block;color:#7f8998;font-size:8px;word-break:break-word}\n.dabbir-memory-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dabbir-memory-actions button{min-height:36px;border-radius:10px;padding:7px 10px;font-size:9px;font-weight:900}\n.dabbir-memory-approve{border:1px solid #6c63d8;background:#262047;color:#e2ddff}.dabbir-memory-pause{border:1px solid #5e5637;background:#242117;color:#ffe4a1}.dabbir-memory-revoke{border:1px solid #64373c;background:#29191c;color:#ffb9bd}\n[data-knowledge-correction] summary{cursor:pointer;min-height:44px;padding-top:12px;box-sizing:border-box}.dabbir-memory-field{display:block;margin-top:12px;font-size:12px;color:#d8dde6}.dabbir-memory-field input,.dabbir-memory-field select{display:block;box-sizing:border-box;width:100%;margin-top:6px;min-height:44px;padding:10px;border-radius:10px;border:1px solid #465064;background:#181c23;color:#f3f4f6;font-size:16px}[data-knowledge=\"v2\"] .dabbir-memory-card b{font-size:14px}[data-knowledge=\"v2\"] .dabbir-memory-card p{font-size:12px}[data-knowledge=\"v2\"] .dabbir-memory-card small{font-size:11px}[data-knowledge=\"v2\"] button{min-height:44px;font-size:13px}[data-knowledge=\"v2\"] .dabbir-memory-empty{font-size:12px}.dabbir-memory-status{font-size:12px;color:#bdc7d9;line-height:1.7}.dabbir-memory-actions button:disabled{opacity:.55;cursor:wait}.dabbir-memory-close{width:100%;min-height:42px;margin-top:12px;border:0;background:transparent;color:#9fa8b6;font-weight:800}.dabbir-memory-empty{padding:13px;margin-top:10px;border:1px dashed #343b49;border-radius:13px;color:#929ba8;font-size:10px}.dabbir-memory-section{margin-top:14px;font-size:11px;color:#e8ebf1}\n@media(max-width:700px){.dabbir-memory-overlay{align-items:flex-end;padding:10px}.dabbir-memory-dialog{border-radius:20px 20px 14px 14px;max-height:88vh}.dabbir-memory-btn{min-height:40px}.dabbir-memory-actions button{flex:1}}\n";document.head.appendChild(style);
  const nativeFetch=window.fetch.bind(window);
  const emptyState=id=>({candidates:[],policies:[],proposals:[],services:[],audit:[],draft:{alias:'',target_id:'',correction:''},correctionError:'',loading:false,business:id,knowledgeError:false,policyError:false});
  let state=emptyState(null),generation=0,returnFocus=null;
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
  function current(id,epoch){return isOwner()&&businessId()===id&&state.business===id&&generation===epoch}
  function syncScope(){
    const id=isOwner()?businessId():null;
    if(state.business!==id){generation++;state=emptyState(id);closeDialog()}
    if(!id)document.querySelector('#dabbirMemoryButton')?.remove();
    return id;
  }
  async function load(force=false){
    const id=syncScope();if(!id||state.loading)return;
    if(!force&&state.loaded)return renderButton();
    state.loading=true;const epoch=generation;
    document.querySelectorAll('#dabbirMemoryOverlay button,#dabbirMemoryOverlay input,#dabbirMemoryOverlay select').forEach(el=>el.disabled=true);
    const get=async path=>{
      const response=await nativeFetch(path+'?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error('OWNER_KNOWLEDGE_LOOKUP_FAILED');
      return payload;
    };
    const [policies,knowledge]=await Promise.allSettled([get('/api/owner-decision-memory'),get('/api/understanding-knowledge')]);
    if(!current(id,epoch))return;
    const p=policies.status==='fulfilled'?policies.value:{},k=knowledge.status==='fulfilled'?knowledge.value:{};
    state={...emptyState(id),draft:state.draft,correctionError:state.correctionError,candidates:p.candidates||[],policies:p.policies||[],proposals:k.proposals||[],services:k.services||[],audit:k.audit||[],knowledgeError:knowledge.status!=='fulfilled',policyError:policies.status!=='fulfilled',loaded:true};
    renderButton();if(document.querySelector('#dabbirMemoryOverlay'))openDialog();
  }
  function renderButton(){
    if(!syncScope())return;
    const actionHead=document.querySelector('#dabbirActionCenter .dac-head');
    const autoHero=document.querySelector('#screen-automations .hero');
    const host=actionHead||autoHero;if(!host)return;
    let button=document.querySelector('#dabbirMemoryButton');
    if(!button){button=document.createElement('button');button.id='dabbirMemoryButton';button.type='button';button.className='dabbir-memory-btn';button.addEventListener('click',openDialog);const refresh=actionHead?.querySelector('#dacRefresh');refresh?.parentNode?refresh.parentNode.insertBefore(button,refresh):host.append(button)}
    // The automation screen exists before the asynchronous dashboard mounts.
    // Move the existing control when its authoritative visible host arrives.
    if(button.parentNode!==host)host.append(button);
    const x=copy();
    const pending=state.candidates.length+state.proposals.filter(p=>p.status==='PROPOSED').length;
    const hasCandidate=pending>0;
    button.classList.toggle('has-candidate',hasCandidate);
    const nextLabel=hasCandidate?x.candidate+' · '+pending:x.button;
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
  }
  function closeDialog(){const overlay=document.querySelector('#dabbirMemoryOverlay');if(overlay?.open)overlay.close();overlay?.remove();returnFocus?.focus?.()}
  function policyActions(card,policy,isCandidate){
    const x=copy(),actions=document.createElement('div');actions.className='dabbir-memory-actions';
    const scope=state.business,epoch=generation,mutate=(action,extra)=>mutatePolicy(action,extra,scope,epoch);
    if(isCandidate){const approve=document.createElement('button');approve.className='dabbir-memory-approve';approve.textContent=x.approve;approve.onclick=()=>mutate('activate',{action_key:policy.action_key,decision_key:policy.decision_key,decision_value:policy.decision_value,match_bounds:policy.match_bounds});actions.append(approve)}
    else{
      if(policy.state==='ACTIVE'){const pause=document.createElement('button');pause.className='dabbir-memory-pause';pause.textContent=x.pause;pause.onclick=()=>mutate('pause',{policy_id:policy.id});actions.append(pause)}
      if(policy.state==='PAUSED'){const resume=document.createElement('button');resume.className='dabbir-memory-approve';resume.textContent=x.resume;resume.onclick=()=>mutate('resume',{policy_id:policy.id});actions.append(resume)}
      const revoke=document.createElement('button');revoke.className='dabbir-memory-revoke';revoke.textContent=x.revoke;revoke.onclick=()=>mutate('revoke',{policy_id:policy.id});actions.append(revoke);
    }
    card.append(actions);
  }
  function mutatePolicy(action,extra,scope,epoch){return mutate(action,extra,'/api/owner-decision-memory',scope,epoch)}
  function policyCard(policy,isCandidate=false){
    const x=copy(),card=document.createElement('div');card.className='dabbir-memory-card';
    const title=document.createElement('b');title.textContent=scopeLabel(policy.match_bounds);
    const detail=document.createElement('p');detail.textContent=isCandidate?(policy.decision_value+' · '+policy.observation_count+' '+x.count):(policy.decision_value+' · v'+policy.version+' · '+policy.state);
    const safety=document.createElement('small');safety.textContent='LOW · '+x.exact+' · '+x.privacy+' · '+policy.action_key;
    card.append(title,detail,safety);policyActions(card,policy,isCandidate);return card;
  }
  function openDialog(){
    if(!syncScope())return;
    const hadDialog=Boolean(document.querySelector('#dabbirMemoryOverlay'));
    if(!hadDialog)returnFocus=document.activeElement;
    closeDialog();const x=copy(),overlay=document.createElement('dialog');overlay.id='dabbirMemoryOverlay';overlay.className='dabbir-memory-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-memory-dialog';overlay.setAttribute('aria-labelledby','dabbirMemoryTitle');
    const title=document.createElement('h3');title.id='dabbirMemoryTitle';title.textContent=x.title;const desc=document.createElement('p');desc.textContent=x.desc;dialog.append(title,desc);
    renderKnowledge(dialog);
    if(state.policyError){
      const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=ar()?'تعذر تحميل سياسات المالك. حاول مجددًا.':'Could not load owner policies. Try again.';dialog.append(error);
      const retry=document.createElement('button');retry.textContent=ar()?'إعادة تحميل السياسات':'Retry policies';retry.onclick=()=>load(true);dialog.append(retry);
    }else{
    const suggestions=document.createElement('div');suggestions.className='dabbir-memory-section';suggestions.textContent=x.suggestions;dialog.append(suggestions);
    if(state.candidates.length)state.candidates.forEach(item=>dialog.append(policyCard(item,true)));else{const empty=document.createElement('div');empty.className='dabbir-memory-empty';empty.textContent=x.empty;dialog.append(empty)}
    const active=document.createElement('div');active.className='dabbir-memory-section';active.textContent=x.active;dialog.append(active);
    state.policies.filter(item=>['ACTIVE','PAUSED'].includes(item.state)).forEach(item=>dialog.append(policyCard(item,false)));
    }
    const close=document.createElement('button');close.className='dabbir-memory-close';close.textContent=x.close;close.onclick=closeDialog;dialog.append(close);
    overlay.append(dialog);overlay.onclick=event=>{if(event.target===overlay)closeDialog()};document.body.append(overlay);overlay.showModal();overlay.oncancel=event=>{event.preventDefault();closeDialog()};close.focus();
    overlay.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeDialog()}else if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button,input,select,summary')].filter(el=>!el.disabled);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
  }
  const knowledgeCopy=()=>ar()?{
    title:'معاني الخدمات',desc:'اربط تعبير العميل بخدمة من قائمتك، مثل VIP. حفظ الاقتراح لا يفعّله؛ راجعه ثم اعتمده. يسري داخل هذا النشاط وعلى الفروع التي تقدم الخدمة.',
    alias:'تعبير العميل',service:'الخدمة المقصودة',choose:'اختر الخدمة',propose:'حفظ اقتراح للمراجعة',approve:'اعتماد المعنى',reject:'رفض الاقتراح',revoke:'إلغاء الاعتماد',rollback:'إعادة اعتماد هذا الإصدار',
    correctionTitle:'أو اكتب تصحيحًا للمعنى',correction:'تصحيح المالك',correctionHint:'مثال: VIP يعني الباقة الذهبية. استخدم اسم الخدمة كما يظهر في قائمتك.',correctionSave:'تحويل التصحيح إلى اقتراح',
    CORRECTION_FORMAT_REQUIRED:'اكتب معنى واحدًا بصيغة «VIP يعني اسم الخدمة»، أو اختر الخدمة من النموذج أعلاه.',CORRECTION_SERVICE_NOT_FOUND:'لم نجد خدمة فعالة بهذا الاسم. اختر الخدمة من النموذج أعلاه.',CORRECTION_SERVICE_AMBIGUOUS:'يوجد أكثر من خدمة بهذا الاسم. حدّد الخدمة من النموذج أعلاه.',CORRECTION_USE_SERVICE_PICKER:'حدّد الخدمة من النموذج أعلاه لحفظ هذا المعنى.',
    empty:'لا توجد معانٍ محفوظة بعد.',noServices:'أضف خدمة فعالة إلى قائمة خدماتك أولًا.',unavailable:'الخدمة غير متاحة حاليًا',error:'تعذر تحميل معاني الخدمات. حاول مجددًا.',retry:'إعادة المحاولة',loading:'جارٍ التحميل…',saved:'تم حفظ الاقتراح. يحتاج اعتمادك ليصبح فعالًا.',updated:'تم تحديث المعنى',failed:'تعذر حفظ التغيير. حدّث القائمة قبل المحاولة مجددًا.',audit:'سجل التغييرات',version:'الإصدار',
    PROPOSED:'بانتظار اعتمادك',OWNER_APPROVED:'معتمد',REJECTED:'مرفوض',REVOKED:'ملغى',SUPERSEDED:'استُبدل بإصدار آخر',ROLLBACK:'أعيد اعتماده'
  }:{
    title:'Service meanings',desc:'Map a customer expression, such as VIP, to a service in your catalog. Saving a proposal does not activate it; review and approve it separately. It applies within this business and branches offering the service.',
    alias:'Customer expression',service:'Intended service',choose:'Choose a service',propose:'Save proposal for review',approve:'Approve meaning',reject:'Reject proposal',revoke:'Revoke approval',rollback:'Approve this version again',
    correctionTitle:'Or describe a correction',correction:'Owner correction',correctionHint:'For example: VIP means Gold Wash. Use the service name shown in your catalog.',correctionSave:'Turn correction into proposal',
    CORRECTION_FORMAT_REQUIRED:'Write one meaning as “VIP means service name”, or choose the service in the form above.',CORRECTION_SERVICE_NOT_FOUND:'No active service matches that name. Choose the service in the form above.',CORRECTION_SERVICE_AMBIGUOUS:'More than one service has that name. Choose the intended service in the form above.',CORRECTION_USE_SERVICE_PICKER:'Choose the service in the form above to save this meaning.',
    empty:'No saved meanings yet.',noServices:'Add an active service to your catalog first.',unavailable:'Service currently unavailable',error:'Could not load service meanings. Try again.',retry:'Retry',loading:'Loading…',saved:'Proposal saved. Your approval is required to activate it.',updated:'Meaning updated',failed:'Could not save the change. Refresh the list before trying again.',audit:'Change history',version:'Version',
    PROPOSED:'Awaiting your approval',OWNER_APPROVED:'Approved',REJECTED:'Rejected',REVOKED:'Revoked',SUPERSEDED:'Replaced by another version',ROLLBACK:'Approved again'
  };
  function renderKnowledge(dialog){
    const k=knowledgeCopy(),scope=state.business,epoch=generation;
    const section=document.createElement('section');section.dataset.knowledge='v2';
    const heading=document.createElement('h4');heading.textContent=k.title;
    const desc=document.createElement('p');desc.className='dabbir-memory-status';desc.textContent=k.desc;section.append(heading,desc);dialog.append(section);
    if(state.loading||state.knowledgeError){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=state.loading?k.loading:k.error;section.append(status);if(state.knowledgeError){const retry=document.createElement('button');retry.textContent=k.retry;retry.onclick=()=>load(true);section.append(retry)}return}
    const active=state.services.filter(s=>s.active===true);
    if(active.length){
      const form=document.createElement('form');form.dataset.knowledgeForm='v2';
      const aliasLabel=document.createElement('label');aliasLabel.className='dabbir-memory-field';aliasLabel.textContent=k.alias;
      const alias=document.createElement('input');alias.name='alias';alias.maxLength=80;alias.required=true;alias.autocomplete='off';alias.value=state.draft.alias;alias.oninput=()=>{if(current(scope,epoch))state.draft.alias=alias.value};aliasLabel.append(alias);
      const serviceLabel=document.createElement('label');serviceLabel.className='dabbir-memory-field';serviceLabel.textContent=k.service;
      const service=document.createElement('select');service.name='service';service.required=true;
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=k.choose;service.append(placeholder);
      active.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;service.append(option)});serviceLabel.append(service);
      service.value=active.some(item=>item.id===state.draft.target_id)?state.draft.target_id:'';service.onchange=()=>{if(current(scope,epoch))state.draft.target_id=service.value};
      const submit=document.createElement('button');submit.type='submit';submit.className='dabbir-memory-approve';submit.textContent=k.propose;
      const actions=document.createElement('div');actions.className='dabbir-memory-actions';actions.append(submit);form.append(aliasLabel,serviceLabel,actions);
      form.onsubmit=event=>{event.preventDefault();if(!current(scope,epoch)||!alias.value.trim()||!active.some(s=>s.id===service.value))return;return mutate('propose',{entity_type:'service',alias:alias.value.trim(),target_id:service.value},'/api/understanding-knowledge',scope,epoch)};
      section.append(form);
      const details=document.createElement('details');details.dataset.knowledgeCorrection='v2';details.open=Boolean(state.draft.correction||state.correctionError);
      const summary=document.createElement('summary');summary.textContent=k.correctionTitle;summary.className='dabbir-memory-field';
      const correctionForm=document.createElement('form');correctionForm.dataset.knowledgeCorrectionForm='v2';
      const correctionLabel=document.createElement('label');correctionLabel.className='dabbir-memory-field';correctionLabel.textContent=k.correction;
      const correction=document.createElement('input');correction.name='correction';correction.maxLength=400;correction.required=true;correction.autocomplete='off';correction.value=state.draft.correction;correction.setAttribute('aria-describedby','dabbirCorrectionHint');correction.oninput=()=>{if(current(scope,epoch))state.draft.correction=correction.value};correctionLabel.append(correction);
      const hint=document.createElement('p');hint.id='dabbirCorrectionHint';hint.className='dabbir-memory-status';hint.textContent=k.correctionHint;
      const correctionSave=document.createElement('button');correctionSave.type='submit';correctionSave.className='dabbir-memory-approve';correctionSave.textContent=k.correctionSave;
      const correctionActions=document.createElement('div');correctionActions.className='dabbir-memory-actions';correctionActions.append(correctionSave);correctionForm.append(correctionLabel,hint,correctionActions);
      if(state.correctionError){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=k[state.correctionError]||k.failed;correctionForm.append(error)}
      correctionForm.onsubmit=event=>{event.preventDefault();if(!current(scope,epoch)||!correction.value.trim()||correction.value.length>400)return;return mutate('propose_correction',{correction:correction.value.trim()},'/api/understanding-knowledge',scope,epoch)};
      details.append(summary,correctionForm);section.append(details);
    }else{const p=document.createElement('p');p.textContent=k.noServices;section.append(p)}
    const proposals=state.proposals.filter(p=>p.entity_type==='service');
    if(!proposals.length){const p=document.createElement('p');p.className='dabbir-memory-empty';p.textContent=k.empty;section.append(p)}
    proposals.forEach(p=>{
      const card=document.createElement('article');card.className='dabbir-memory-card';
      const target=state.services.find(s=>s.id===p.target_id),title=document.createElement('b');title.textContent=p.alias+' → '+(target?.name||k.unavailable);
      const status=document.createElement('p');status.textContent=(k[p.status]||k.unavailable)+' · '+k.version+' '+p.version;
      card.append(title,status);
      const actions=document.createElement('div');actions.className='dabbir-memory-actions';
      const add=(action,label)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.className=action==='reject'||action==='revoke'?'dabbir-memory-revoke':'dabbir-memory-approve';button.onclick=()=>mutate(action,{proposal_id:p.id},'/api/understanding-knowledge',scope,epoch);actions.append(button)};
      if(p.status==='PROPOSED'){if(target?.active)add('approve',k.approve);add('reject',k.reject)}
      if(p.status==='OWNER_APPROVED')add('revoke',k.revoke);
      if(['REVOKED','SUPERSEDED'].includes(p.status)&&target?.active)add('rollback',k.rollback);
      card.append(actions);
      const history=state.audit.filter(e=>e.proposal_id===p.id).slice(0,4);
      if(history.length){const list=document.createElement('small');list.textContent=k.audit+': '+history.map(e=>(k[e.event_type]||e.event_type)+' · '+new Date(e.created_at).toLocaleString(ar()?'ar-AE':'en-GB')).join(' / ');card.append(list)}
      section.append(card);
    });
  }
  async function mutate(action,extra,path='/api/owner-decision-memory',scope=state.business,epoch=generation){
    const id=businessId();if(!current(scope,epoch)||id!==scope||state.loading)return;state.loading=true;const k=knowledgeCopy();
    document.querySelectorAll('#dabbirMemoryOverlay button,#dabbirMemoryOverlay input,#dabbirMemoryOverlay select').forEach(el=>el.disabled=true);
    try{
      const response=await nativeFetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json','x-dabbir-client':'web'},body:JSON.stringify({business_id:id,action,...extra})});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(['CORRECTION_FORMAT_REQUIRED','CORRECTION_SERVICE_NOT_FOUND','CORRECTION_SERVICE_AMBIGUOUS','CORRECTION_USE_SERVICE_PICKER'].includes(payload?.error)?payload.error:'OWNER_POLICY_UPDATE_FAILED');
      if(!current(id,epoch))return;
      if(path==='/api/understanding-knowledge'&&action==='propose')state.draft={...state.draft,alias:'',target_id:''};
      if(path==='/api/understanding-knowledge'&&action==='propose_correction'){state.draft={...state.draft,correction:''};state.correctionError=''}
      state.loading=false;await load(true);if(!current(id,epoch))return;
      notify(path==='/api/understanding-knowledge'?(['propose','propose_correction'].includes(action)?k.saved:k.updated):copy().saved);
    }catch(error){if(!current(id,epoch))return;if(action==='propose_correction')state.correctionError=error.message;state.loading=false;await load(true);if(current(id,epoch))notify(action==='propose_correction'?(k[state.correctionError]||k.failed):k.failed)}
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
  setTimeout(()=>load(false),700);window.__dabbirOwnerDecisionMemory={refresh:()=>load(true),version:'owner-decision-memory-ui-v2'};
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
  if(window.__dabbirActivityTaskNavigation)return;
  window.__dabbirActivityTaskNavigation=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const categoryOf=card=>String(card?.querySelector('small')?.textContent||'').split('·')[0].trim().toLowerCase();
  const routeFor=category=>{
    if(['catalog','product','products','inventory','stock','orders','order','sales'].includes(category))return 'operations';
    if(['policy','policies','settings','configuration','permissions'].includes(category))return 'settings';
    if(['customer','customers','crm'].includes(category))return 'customers';
    if(['appointment','appointments','booking','calendar','schedule'].includes(category))return 'appointments';
    if(['conversation','conversations','message','messages','inquiry','inquiries','whatsapp'].includes(category))return 'conversations';
    return null;
  };

  const flash=node=>{
    if(!node)return;
    try{node.scrollIntoView({behavior:'smooth',block:'center'})}catch{node.scrollIntoView?.()}
    node.classList.add('dabbirTaskTarget');
    setTimeout(()=>node.classList.remove('dabbirTaskTarget'),1800);
  };

  const focusDestination=category=>{
    if(category==='catalog'||category==='product'||category==='products'){
      const add=q('#opsAddProduct');
      if(add&&add.offsetParent!==null){add.click();return}
      return flash(q('#opsBody .opsSection'));
    }
    if(category==='inventory'||category==='stock'){
      return flash(q('#opsBody .opsGrid > div:first-child .opsSection')||q('#opsBody .opsLow'));
    }
    if(category==='orders'||category==='order'||category==='sales'){
      return flash(q('#opsBody .opsGrid > div:last-child .opsSection'));
    }
    if(['policy','policies','settings','configuration','permissions'].includes(category)){
      const field=q('.dk-field[data-key="delivery_policy"]')||q('.dk-field[data-key="return_policy"]')||q('#screen-settings .dabbir-knowledge-card');
      flash(field);
      const input=field?.querySelector?.('textarea,input,select');
      if(input)requestAnimationFrame(()=>input.focus({preventScroll:true}));
    }
  };

  const openTask=card=>{
    if(!card)return;
    const category=categoryOf(card);
    const route=routeFor(category);
    if(!route||typeof showScreen!=='function')return;
    showScreen(route);
    requestAnimationFrame(()=>setTimeout(()=>focusDestination(category),90));
  };

  const decorate=()=>{
    qa('#activityTaskCard .activityTask').forEach(card=>{
      const route=routeFor(categoryOf(card));
      if(!route){card.removeAttribute('data-dabbir-task-route');card.removeAttribute('role');card.removeAttribute('tabindex');return}
      card.dataset.dabbirTaskRoute=route;
      card.setAttribute('role','link');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',String(card.querySelector('b')?.textContent||'').trim());
    });
  };

  const style=document.createElement('style');
  style.dataset.dabbirActivityTaskNavigation='v1';
  style.textContent='.activityTask[data-dabbir-task-route]{cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.activityTask[data-dabbir-task-route]:hover{border-color:#40515f;background:#192027}.activityTask[data-dabbir-task-route]:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.activityTask[data-dabbir-task-route]:active{transform:scale(.995)}.dabbirTaskTarget{outline:2px solid var(--accent)!important;outline-offset:3px!important;transition:outline-color .2s ease}';
  document.head.append(style);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(card)openTask(card);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(!card)return;
    event.preventDefault();
    openTask(card);
  });

  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(document.body,{subtree:true,childList:true});
  decorate();
})();

(()=>{
  if(window.__dabbirHomeServiceUi)return;
  window.__dabbirHomeServiceUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(workspace?.business?.business_type||'').toLowerCase();
  const eligible=()=>Boolean(businessType())&&!['store','creator'].includes(businessType());
  let data=null,loading=false,selected=null,observed=null;

  const t=()=>ar()?{
    title:'وضع الخدمة المنزلية',desc:'نفس الموعد، مع عنوان العميل ووقت التنقل ورسوم الزيارة وحالة الفريق في الميدان.',enable:'تفعيل',disable:'إيقاف',settings:'الإعدادات',refresh:'تحديث',enabled:'مفعّل',disabled:'متوقف',upcoming:'القادمة',home:'منزلية',route:'في الطريق',missing:'ينقصها عنوان',empty:'لا توجد مواعيد قادمة خلال 14 يومًا.',loading:'جارٍ تحميل الخدمة المنزلية…',failed:'تعذر تحميل وضع الخدمة المنزلية.',configure:'تجهيز',customer:'العميل',worker:'الموظف',time:'الموعد',atBusiness:'في موقع النشاط',atCustomer:'في موقع العميل',address:'عنوان العميل',lat:'خط العرض (اختياري)',lng:'خط الطول (اختياري)',travel:'وقت التنقل بالدقائق',fee:'رسوم الزيارة (درهم)',fieldStatus:'الحالة الميدانية',scheduled:'مجدول',inRoute:'في الطريق',arrived:'وصل',inService:'بدأت الخدمة',completed:'انتهت',cancelled:'ملغاة',save:'حفظ',close:'إغلاق',defaultFee:'رسوم الزيارة الافتراضية',defaultTravel:'وقت التنقل الافتراضي',requireAddress:'إلزام عنوان العميل',saved:'تم حفظ إعدادات الخدمة المنزلية.',visitSaved:'تم تحديث الموعد الميداني.',addressRequired:'أدخل عنوان العميل قبل الحفظ.',hint:'تقويم دبّر يبقى مصدر الحقيقة. Google/Outlook يظلان تكاملين اختياريين.'
  }:{
    title:'Home service mode',desc:'Keep the same appointment while adding customer location, travel time, visit fee and field status.',enable:'Enable',disable:'Disable',settings:'Settings',refresh:'Refresh',enabled:'Enabled',disabled:'Off',upcoming:'Upcoming',home:'Home visits',route:'In route',missing:'Missing address',empty:'No upcoming appointments in the next 14 days.',loading:'Loading home service…',failed:'Could not load home service mode.',configure:'Configure',customer:'Customer',worker:'Worker',time:'Appointment',atBusiness:'At business',atCustomer:'At customer',address:'Customer address',lat:'Latitude (optional)',lng:'Longitude (optional)',travel:'Travel minutes',fee:'Visit fee (AED)',fieldStatus:'Field status',scheduled:'Scheduled',inRoute:'In route',arrived:'Arrived',inService:'In service',completed:'Completed',cancelled:'Cancelled',save:'Save',close:'Close',defaultFee:'Default visit fee',defaultTravel:'Default travel minutes',requireAddress:'Require customer address',saved:'Home service settings saved.',visitSaved:'Field appointment updated.',addressRequired:'Enter the customer address before saving.',hint:'DABBIR calendar remains the source of truth. Google/Outlook stay optional integrations.'
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const fmt=v=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v||'')}};
  const money=v=>Number(v||0).toLocaleString(ar()?'ar-AE':'en-AE',{minimumFractionDigits:0,maximumFractionDigits:2});

  const style=document.createElement('style');style.dataset.dabbirHomeService='v1';style.textContent="\n.dhsPanel{margin:0 0 12px;border:1px solid #314033;background:linear-gradient(180deg,#151b17,#101311);border-radius:16px;padding:13px}.dhsHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.dhsHead h2{margin:0;font-size:13px}.dhsHead p{margin:4px 0 0;color:var(--muted);font-size:9px;line-height:1.6}.dhsActions{display:flex;gap:6px;flex-wrap:wrap}.dhsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.dhsMetric{border:1px solid #29312b;background:#121614;border-radius:11px;padding:8px}.dhsMetric span{display:block;color:var(--muted);font-size:8px}.dhsMetric strong{display:block;font-size:17px;margin-top:3px}.dhsList{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dhsRow{display:grid;grid-template-columns:minmax(150px,1.3fr) .9fr .75fr auto;gap:8px;align-items:center;border:1px solid #29302c;background:#141816;border-radius:12px;padding:9px;font-size:9px}.dhsRow b{font-size:10px;display:block}.dhsRow small{display:block;color:var(--muted);margin-top:2px}.dhsBadge{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:850;background:#202a22;color:#bfe8c7}.dhsBadge.warn{background:#3a3014;color:var(--yellow)}.dhsEmpty{border:1px dashed #303a32;border-radius:12px;padding:14px;text-align:center;color:var(--muted);font-size:9px;margin-top:9px}.dhsSettingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dhsCheck{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:10px}.dhsCheck input{width:18px;height:18px;min-height:18px}.dhsVisitHint{color:var(--muted);font-size:8px;line-height:1.5;margin-top:8px}@media(max-width:700px){.dhsHead{display:block}.dhsActions{margin-top:8px}.dhsMetrics{grid-template-columns:repeat(2,1fr)}.dhsRow{grid-template-columns:minmax(120px,1fr) .8fr auto}.dhsRow .dhsWorker{display:none}.dhsSettingsGrid{grid-template-columns:1fr}}\n";document.head.append(style);

  function ensureModals(){
    if(!q('#dhsSettingsModal')){
      const modal=document.createElement('div');modal.id='dhsSettingsModal';modal.className='modal';
      modal.innerHTML='<form id="dhsSettingsForm" class="modalBox"><h3 id="dhsSettingsTitle"></h3><label class="dhsCheck"><input id="dhsEnabled" type="checkbox"><span id="dhsEnabledLabel"></span></label><div class="dhsSettingsGrid"><div class="field"><label id="dhsDefaultFeeLabel"></label><input id="dhsDefaultFee" type="number" min="0" max="10000000" step="0.01"></div><div class="field"><label id="dhsDefaultTravelLabel"></label><input id="dhsDefaultTravel" type="number" min="0" max="720" step="1"></div></div><label class="dhsCheck"><input id="dhsRequireAddress" type="checkbox"><span id="dhsRequireAddressLabel"></span></label><div class="modalActions"><button id="dhsSettingsClose" class="secondary" type="button"></button><button id="dhsSettingsSave" class="primary" type="submit"></button></div></form>';
      document.body.append(modal);
      q('#dhsSettingsClose').onclick=()=>modal.classList.remove('open');
      modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
      q('#dhsSettingsForm').onsubmit=saveSettings;
    }
    if(!q('#dhsVisitModal')){
      const modal=document.createElement('div');modal.id='dhsVisitModal';modal.className='modal';
      modal.innerHTML='<form id="dhsVisitForm" class="modalBox"><h3 id="dhsVisitTitle"></h3><div class="field"><label id="dhsLocationTypeLabel"></label><select id="dhsLocationType"><option value="business"></option><option value="customer"></option></select></div><div id="dhsCustomerFields"><div class="field"><label id="dhsAddressLabel"></label><input id="dhsAddress" maxlength="500"></div><div class="dhsSettingsGrid"><div class="field"><label id="dhsLatLabel"></label><input id="dhsLat" type="number" min="-90" max="90" step="any"></div><div class="field"><label id="dhsLngLabel"></label><input id="dhsLng" type="number" min="-180" max="180" step="any"></div><div class="field"><label id="dhsTravelLabel"></label><input id="dhsTravel" type="number" min="0" max="720" step="1"></div><div class="field"><label id="dhsFeeLabel"></label><input id="dhsFee" type="number" min="0" max="10000000" step="0.01"></div></div><div class="field"><label id="dhsStatusLabel"></label><select id="dhsStatus"><option value="scheduled"></option><option value="in_route"></option><option value="arrived"></option><option value="in_service"></option><option value="completed"></option><option value="cancelled"></option></select></div></div><div class="dhsVisitHint" id="dhsHint"></div><div class="modalActions"><button id="dhsVisitClose" class="secondary" type="button"></button><button id="dhsVisitSave" class="primary" type="submit"></button></div></form>';
      document.body.append(modal);
      q('#dhsVisitClose').onclick=()=>modal.classList.remove('open');
      modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
      q('#dhsLocationType').onchange=toggleCustomerFields;
      q('#dhsVisitForm').onsubmit=saveVisit;
    }
  }

  function applyCopy(){
    ensureModals();const x=t();
    const pairs={dhsSettingsTitle:x.settings,dhsEnabledLabel:x.enabled,dhsDefaultFeeLabel:x.defaultFee,dhsDefaultTravelLabel:x.defaultTravel,dhsRequireAddressLabel:x.requireAddress,dhsSettingsClose:x.close,dhsSettingsSave:x.save,dhsVisitTitle:x.title,dhsLocationTypeLabel:x.title,dhsAddressLabel:x.address,dhsLatLabel:x.lat,dhsLngLabel:x.lng,dhsTravelLabel:x.travel,dhsFeeLabel:x.fee,dhsStatusLabel:x.fieldStatus,dhsHint:x.hint,dhsVisitClose:x.close,dhsVisitSave:x.save};
    Object.entries(pairs).forEach(([id,value])=>{const el=q('#'+id);if(el)el.textContent=value});
    const loc=q('#dhsLocationType');if(loc){loc.options[0].textContent=x.atBusiness;loc.options[1].textContent=x.atCustomer}
    const st=q('#dhsStatus');if(st){const labels=[x.scheduled,x.inRoute,x.arrived,x.inService,x.completed,x.cancelled];[...st.options].forEach((o,i)=>o.textContent=labels[i])}
    render();
  }

  function ensurePanel(){
    if(!eligible())return null;
    const screen=q('#screen-appointments');if(!screen)return null;
    let panel=q('#dabbirHomeService');if(panel&&panel.parentNode!==screen)panel.remove();
    panel=q('#dabbirHomeService');
    if(!panel){panel=document.createElement('section');panel.id='dabbirHomeService';panel.className='dhsPanel';screen.prepend(panel)}
    return panel;
  }

  async function request(options={}){
    const id=workspace?.business?.id;if(!id)throw new Error('BUSINESS_REQUIRED');
    const response=await fetch('/api/home-service-operations?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'HOME_SERVICE_FAILED');return payload;
  }
  async function post(body){return request({method:'POST',body:JSON.stringify({business_id:workspace.business.id,...body})})}

  async function load(force=false){
    if(!eligible()||loading)return;const id=workspace?.business?.id;if(!id)return;
    if(!force&&data?.business?.id===id){render();return}
    loading=true;render();try{data=await request();render()}catch(error){data={error:String(error?.message||error)};render()}finally{loading=false;render()}
  }

  function badge(row){const x=t();if(row.location_type!=='customer')return x.atBusiness;if(!row.service_address)return x.missing;return ({scheduled:x.scheduled,in_route:x.inRoute,arrived:x.arrived,in_service:x.inService,completed:x.completed,cancelled:x.cancelled})[row.field_status]||x.scheduled}

  function render(){
    const panel=ensurePanel();if(!panel)return;const x=t();
    if(loading&&!data){panel.innerHTML='<div class="dhsEmpty">'+esc(x.loading)+'</div>';return}
    if(data?.error){panel.innerHTML='<div class="dhsEmpty">'+esc(x.failed)+' — '+esc(data.error)+'</div>';return}
    if(!data){panel.innerHTML='<div class="dhsEmpty">'+esc(x.loading)+'</div>';return}
    const settings=data.settings||{};const rows=Array.isArray(data.appointments)?data.appointments:[];const m=data.metrics||{};
    const actions='<div class="dhsActions">'+(data.can_manage?'<button class="secondary" id="dhsSettingsBtn" type="button">'+esc(x.settings)+'</button>':'')+'<button class="secondary" id="dhsRefresh" type="button">'+esc(x.refresh)+'</button></div>';
    const metrics='<div class="dhsMetrics"><div class="dhsMetric"><span>'+esc(x.upcoming)+'</span><strong>'+Number(m.upcoming_14d||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.home)+'</span><strong>'+Number(m.customer_location||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.route)+'</span><strong>'+Number(m.in_route||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.missing)+'</span><strong>'+Number(m.needs_address||0)+'</strong></div></div>';
    const list=settings.enabled?rows.map(row=>'<div class="dhsRow"><div><b>'+esc(row.customer?.display_name||x.customer)+'</b><small>'+esc(fmt(row.starts_at))+'</small></div><div class="dhsWorker">'+esc(row.worker?.display_name||'—')+'</div><span class="dhsBadge '+(row.location_type==='customer'&&!row.service_address?'warn':'')+'">'+esc(badge(row))+'</span>'+(data.can_update_visits?'<button class="secondary" type="button" data-dhs-visit="'+esc(row.id)+'">'+esc(x.configure)+'</button>':'<span></span>')+'</div>').join(''):'';
    panel.innerHTML='<div class="dhsHead"><div><h2>'+esc(x.title)+' · '+esc(settings.enabled?x.enabled:x.disabled)+'</h2><p>'+esc(x.desc)+'</p></div>'+actions+'</div>'+metrics+(settings.enabled?(list?'<div class="dhsList">'+list+'</div>':'<div class="dhsEmpty">'+esc(x.empty)+'</div>'):'<div class="dhsEmpty">'+esc(x.disabled)+'</div>');
    q('#dhsRefresh')?.addEventListener('click',()=>load(true));q('#dhsSettingsBtn')?.addEventListener('click',openSettings);
    panel.querySelectorAll('[data-dhs-visit]').forEach(button=>button.addEventListener('click',()=>openVisit(rows.find(row=>row.id===button.dataset.dhsVisit))));
  }

  function openSettings(){const s=data?.settings||{};q('#dhsEnabled').checked=s.enabled===true;q('#dhsDefaultFee').value=Number(s.default_visit_fee_aed||0);q('#dhsDefaultTravel').value=Number(s.default_travel_minutes||0);q('#dhsRequireAddress').checked=s.require_customer_address!==false;q('#dhsSettingsModal').classList.add('open')}
  async function saveSettings(event){event.preventDefault();if(loading)return;loading=true;try{await post({action:'save_settings',enabled:q('#dhsEnabled').checked,default_visit_fee_aed:Number(q('#dhsDefaultFee').value||0),default_travel_minutes:Number(q('#dhsDefaultTravel').value||0),require_customer_address:q('#dhsRequireAddress').checked});q('#dhsSettingsModal').classList.remove('open');data=null;notify(t().saved);await load(true)}catch(error){notify(t().failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}}

  function openVisit(row){if(!row)return;selected=row;const s=data?.settings||{};q('#dhsLocationType').value=row.location_type||'business';q('#dhsAddress').value=row.service_address||'';q('#dhsLat').value=row.service_latitude??'';q('#dhsLng').value=row.service_longitude??'';q('#dhsTravel').value=Number(row.travel_minutes??s.default_travel_minutes??0);q('#dhsFee').value=Number(row.visit_fee_aed??s.default_visit_fee_aed??0);q('#dhsStatus').value=row.field_status||'scheduled';toggleCustomerFields();q('#dhsVisitModal').classList.add('open')}
  function toggleCustomerFields(){const home=q('#dhsLocationType')?.value==='customer';if(q('#dhsCustomerFields'))q('#dhsCustomerFields').style.display=home?'block':'none'}
  async function saveVisit(event){event.preventDefault();if(!selected||loading)return;const x=t();const location=q('#dhsLocationType').value;const address=q('#dhsAddress').value.trim();if(location==='customer'&&data?.settings?.require_customer_address!==false&&!address){notify(x.addressRequired);return}loading=true;try{await post({action:'update_visit',appointment_id:selected.id,location_type:location,service_address:address,service_latitude:q('#dhsLat').value||null,service_longitude:q('#dhsLng').value||null,travel_minutes:Number(q('#dhsTravel').value||0),visit_fee_aed:Number(q('#dhsFee').value||0),field_status:q('#dhsStatus').value});q('#dhsVisitModal').classList.remove('open');selected=null;data=null;notify(x.visitSaved);await load(true)}catch(error){notify(x.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}}

  function initialize(){
    if(!eligible())return;applyCopy();const screen=q('#screen-appointments');if(screen&&screen!==observed){observed=screen;new MutationObserver(()=>{if(screen.classList.contains('active')){ensurePanel();load(false)}}).observe(screen,{attributes:true,attributeFilter:['class']})}
    if(typeof current!=='undefined'&&current==='appointments')load(false);
  }
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result};
  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);initialize();return result}}catch{}
  setTimeout(initialize,600);
  window.__dabbirHomeService={refresh:()=>load(true),version:'home-service-v1'};
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
  if(window.__dabbirBillingUiLoaded)return;
  window.__dabbirBillingUiLoaded=true;
  let billingState=null,billingBusiness=null,billingLoading=false;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    title:'اشتراك DABBIR — المالك',price:'بيئة دفع تجريبية؛ ليست عرض اشتراك للبيع',loading:'جارٍ التحقق من حالة الاشتراك…',unavailable:'حالة الاشتراك غير متاحة حاليًا.',start:'اختبار الاشتراك',subscribe:'اختبار الاشتراك',manage:'إدارة الاشتراك والدفع',opening:'جارٍ فتح صفحة Stripe الآمنة…',success:'تم إنشاء الاشتراك في Sandbox وتُحدّث الحالة تلقائيًا.',cancelled:'لم يتم إنشاء اشتراك أو خصم أي مبلغ.',trialEnds:'تنتهي التجربة',periodEnds:'نهاية الفترة',cancelScheduled:'الإلغاء مقرر في نهاية الفترة',sandbox:'Stripe Sandbox فقط',states:{not_subscribed:'غير مشترك',trialing:'فترة تجريبية',active:'نشط',past_due:'الدفع متأخر',unpaid:'غير مدفوع',incomplete:'غير مكتمل',canceled:'ملغي',paused:'موقوف',unknown:'غير معروف'}
  }:{
    title:'DABBIR — Owner subscription',price:'Test billing environment; not a live subscription offer',loading:'Checking subscription status…',unavailable:'Subscription status is currently unavailable.',start:'Test subscription',subscribe:'Test subscription',manage:'Manage subscription & payment',opening:'Opening secure Stripe Sandbox…',success:'Sandbox subscription created; status updates automatically.',cancelled:'No subscription was created and no amount was charged.',trialEnds:'Trial ends',periodEnds:'Period ends',cancelScheduled:'Cancellation scheduled for period end',sandbox:'Stripe Sandbox only',states:{not_subscribed:'Not subscribed',trialing:'Trial',active:'Active',past_due:'Payment past due',unpaid:'Unpaid',incomplete:'Incomplete',canceled:'Canceled',paused:'Paused',unknown:'Unknown'}
  };
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function format(value){if(!value)return '';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value)}}
  function owner(){return String(window.workspace?.membership?.role||'').toLowerCase()==='owner'}
  async function load(){const id=window.workspace?.business?.id;if(!id||!owner()||billingLoading||(billingBusiness===id&&billingState))return;billingLoading=true;billingBusiness=id;billingState=null;renderCard();try{const response=await fetch('/api/billing/status?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const body=await response.json().catch(()=>null);billingState=response.ok&&body?.ok?body.billing:{error:true};}catch{billingState={error:true}}finally{billingLoading=false;renderCard()}}
  async function open(path,button){const id=window.workspace?.business?.id;if(!id||!owner()||button?.disabled)return;button.disabled=true;try{if(typeof toast==='function')toast(text().opening);const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id})});const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok||!body?.url)throw new Error(body?.error||'BILLING_UNAVAILABLE');location.assign(body.url)}catch(error){button.disabled=false;if(typeof toast==='function')toast(text().unavailable)}}
  function cardHtml(){const t=text();if(billingLoading||!billingState)return '<div class="item" id="dabbirBillingCard"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.price)+'<br>'+escape(t.loading)+'</small></div><span class="badge gray">…</span></div>';if(billingState.error)return '<div class="item" id="dabbirBillingCard"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.unavailable)+'</small></div><span class="badge red">!</span></div>';const state=String(billingState.status||'unknown'),label=t.states[state]||t.states.unknown,active=['trialing','active'].includes(state),badge=active?'green':(['past_due','unpaid'].includes(state)?'red':'gray');const date=billingState.trial_ends_at?t.trialEnds+': '+format(billingState.trial_ends_at):(billingState.current_period_ends_at?t.periodEnds+': '+format(billingState.current_period_ends_at):'');const cancel=billingState.cancel_at_period_end?t.cancelScheduled:'';const action=billingState.can_manage?'<button class="secondary" id="dabbirBillingManage">'+escape(t.manage)+'</button>':(billingState.can_subscribe?'<button class="primary" id="dabbirBillingStart">'+escape(billingState.trial_available?t.start:t.subscribe)+'</button>':'');return '<div class="item" id="dabbirBillingCard" data-mode="sandbox"><div class="grow"><b>'+escape(t.title)+'</b><small>'+escape(t.price)+'<br>'+escape(t.sandbox)+(date?'<br>'+escape(date):'')+(cancel?'<br>'+escape(cancel):'')+'</small></div><span class="badge '+badge+'">'+escape(label)+'</span>'+action+'</div>'}
  function renderCard(){const list=q('#settingsList');if(!list||!window.workspace?.business)return;const old=q('#dabbirBillingCard');if(old)old.remove();if(!owner())return;list.insertAdjacentHTML('beforeend',cardHtml());const start=q('#dabbirBillingStart'),manage=q('#dabbirBillingManage');if(start)start.onclick=()=>open('/api/billing/checkout',start);if(manage)manage.onclick=()=>open('/api/billing/portal',manage)}
  if(typeof renderSettings==='function'){const base=renderSettings;renderSettings=function(){const result=base.apply(this,arguments);renderCard();load();return result}}
  if(typeof setLanguage==='function'){const base=setLanguage;setLanguage=function(next){const result=base.apply(this,arguments);setTimeout(renderCard,0);return result}}
  const params=new URLSearchParams(location.search);const billing=params.get('billing');if(billing){setTimeout(()=>{if(typeof toast==='function')toast(billing==='success'?text().success:text().cancelled)},350);const clean=new URL(location.href);clean.searchParams.delete('billing');clean.searchParams.delete('session_id');history.replaceState({},'',clean.pathname+clean.search+clean.hash)}
  setTimeout(()=>{renderCard();load()},250);
  window.__dabbirBillingUi={version:'sandbox-v1',refresh:()=>{billingState=null;billingBusiness=null;return load()}};
})();
(()=>{
  if(window.__dabbirPlatformPnlUi)return;window.__dabbirPlatformPnlUi=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ar=()=>document.documentElement.lang!=='en';
  const T=()=>ar()?{
    title:'أرباح وخسائر DABBIR',desc:'اقتصاد DABBIR نفسه فقط: الإيرادات والتكاليف ومساهمة كل نشاط. لا تشمل أموال زبائن الأنشطة.',month:'الشهر',refresh:'تحديث',
    revenue:'الإيراد المؤكد',ai:'تكلفة AI',other:'تكاليف أخرى',total:'إجمالي التكلفة المؤكدة',known:'النتيجة التشغيلية المعروفة',net:'صافي الربح',
    complete:'حساب مكتمل',partial:'حساب جزئي',missing:'مصادر تكلفة/إيراد غير مكتملة',owner:'تكلفة الموظفين: 0 — المالك يعمل منفردًا، ووقت المالك غير محمّل كمصروف.',
    notFinal:'لا أعرض صافي ربح نهائي لأن بعض المصادر غير مكتملة. الرقم الظاهر هو النتيجة المعروفة فقط.',business:'النشاط',bRevenue:'الإيراد',bAi:'AI',bDirect:'تكاليف مباشرة',bShared:'حصة التكاليف المشتركة',contribution:'المساهمة المعروفة',unpriced:'AI غير مسعّر',
    providers:'التكلفة حسب المزود',categories:'التكلفة حسب النوع',source:'المصدر',state:'الحالة',loading:'جارٍ تحميل الحساب المالي…',unavailable:'تعذر تحميل حساب الأرباح والخسائر.',none:'لا توجد بيانات لهذا الشهر.'
  }:{
    title:'DABBIR profit & loss',desc:'DABBIR economics only: revenue, operating cost and contribution by business. Tenant customer money is excluded.',month:'Month',refresh:'Refresh',
    revenue:'Confirmed revenue',ai:'AI cost',other:'Other costs',total:'Total known cost',known:'Known operating result',net:'Net profit',
    complete:'Complete accounting',partial:'Partial accounting',missing:'Incomplete cost/revenue sources',owner:'Employee cost: 0 — solo owner. Owner time is not charged as an operating expense.',
    notFinal:'Final net profit is not shown while required sources are incomplete. The visible result is the known operating result only.',business:'Business',bRevenue:'Revenue',bAi:'AI',bDirect:'Direct other cost',bShared:'Allocated shared cost',contribution:'Known contribution',unpriced:'Unpriced AI',
    providers:'Cost by provider',categories:'Cost by category',source:'Source',state:'State',loading:'Loading P&L…',unavailable:'P&L could not be loaded.',none:'No data for this month.'
  };
  const aed=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{style:'currency',currency:'AED',minimumFractionDigits:2,maximumFractionDigits:6}).format(Number(v));
  const num=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(ar()?'ar-AE':'en-AE').format(Number(v));
  const currentMonth=()=>new Date().toISOString().slice(0,7);
  let selectedMonth=currentMonth(),data=null,error=false,denied=false,loading=false,capability='unknown',capabilityPromise=null,activeHost=null;
  const style=document.createElement('style');style.dataset.dabbirPnl='v1';style.textContent='.dabbirPnl{border:1px solid var(--line,#2a3442);border-radius:16px;padding:14px;margin:12px 0;background:var(--card,#111820)}.dabbirPnlHead{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.dabbirPnlHead h2{margin:0;font-size:17px}.dabbirPnlHead p{margin:3px 0 0;color:var(--muted,#9aa7b8);font-size:11px}.dabbirPnlTools{display:flex;gap:7px;align-items:center}.dabbirPnlTools input{min-height:40px;border:1px solid var(--line,#2a3442);border-radius:9px;background:#0d131a;color:#fff;padding:6px 8px}.dabbirPnlGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.dabbirPnlStat{border:1px solid var(--line,#2a3442);border-radius:11px;padding:9px;background:#0d141c}.dabbirPnlStat span{display:block;color:var(--muted,#9aa7b8);font-size:9px}.dabbirPnlStat b{display:block;font-size:17px;margin-top:2px;overflow-wrap:anywhere}.dabbirPnlNotice{margin-top:10px;padding:9px;border-radius:10px;background:#191f28;font-size:10px}.dabbirPnlNotice.warn{background:#292214}.dabbirPnlTable{overflow:auto;margin-top:10px}.dabbirPnlTable table{width:100%;border-collapse:collapse;font-size:10px}.dabbirPnlTable th,.dabbirPnlTable td{text-align:start;padding:7px;border-bottom:1px solid var(--line,#2a3442);white-space:nowrap}.dabbirPnlNeg{font-weight:800}.dabbirPnl details{margin-top:8px}.dabbirPnl summary{cursor:pointer;min-height:36px;display:flex;align-items:center}@media(max-width:720px){.dabbirPnlGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dabbirPnlTools{width:100%}.dabbirPnlTools input{flex:1}}';document.head.appendChild(style);
  function host(){
    const platform=document.querySelector('#screen-platform-customers');if(platform)return{parent:platform,anchor:platform.querySelector('#pcBody')};
    return null;
  }
  function resetView(){data=null;error=false;loading=false}
  function ensure(){
    const h=host(),existing=document.querySelector('#dabbirPnlPanel');
    if(!h){if(existing)existing.remove();if(activeHost){activeHost=null;resetView()}return null}
    if(activeHost!==h.parent){activeHost=h.parent;resetView()}
    let el=existing;if(!el){el=document.createElement('section');el.id='dabbirPnlPanel';el.className='dabbirPnl panel';if(h.anchor)h.parent.insertBefore(el,h.anchor);else h.parent.appendChild(el)}return el;
  }
  function rows(items,kind){const t=T();if(!Array.isArray(items)||!items.length)return '<div class="dabbirPnlNotice">'+esc(t.none)+'</div>';if(kind==='business')return '<div class="dabbirPnlTable"><table><thead><tr><th>'+esc(t.business)+'</th><th>'+esc(t.bRevenue)+'</th><th>'+esc(t.bAi)+'</th><th>'+esc(t.bDirect)+'</th><th>'+esc(t.bShared)+'</th><th>'+esc(t.contribution)+'</th><th>'+esc(t.unpriced)+'</th></tr></thead><tbody>'+items.map(r=>'<tr><td>'+esc(r.name||r.business_id)+'</td><td>'+esc(aed(r.revenue_aed))+'</td><td>'+esc(aed(r.ai_cost_aed))+'</td><td>'+esc(aed(r.direct_other_cost_aed))+'</td><td>'+esc(aed(r.allocated_shared_cost_aed))+'</td><td class="'+(Number(r.known_contribution_aed)<0?'dabbirPnlNeg':'')+'">'+esc(aed(r.known_contribution_aed))+'</td><td>'+esc(num(r.unpriced_ai_operations))+'</td></tr>').join('')+'</tbody></table></div>';
    return '<div class="dabbirPnlTable"><table><thead><tr><th>'+(kind==='provider'?esc(t.providers):esc(t.categories))+'</th><th>'+esc(t.total)+'</th></tr></thead><tbody>'+items.map(r=>'<tr><td>'+esc(kind==='provider'?r.provider:r.category)+'</td><td>'+esc(aed(r.amount_aed))+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function render(){const el=ensure();if(!el)return;const t=T();if(denied||capability==='unknown'||capability==='probing'){el.hidden=true;return}el.hidden=false;if(loading){el.innerHTML='<div class="dabbirPnlNotice">'+esc(t.loading)+'</div>';return}if(capability==='error'||error||!data){el.innerHTML='<div class="dabbirPnlNotice warn">'+esc(t.unavailable)+'</div>';return}const p=data,c=p.costs||{},r=p.revenue||{},complete=p.measurement_state==='COMPLETE';const missing=Array.isArray(p.missing_sources)?p.missing_sources:[];
    el.innerHTML='<div class="dabbirPnlHead"><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.desc)+'</p></div><div class="dabbirPnlTools"><label>'+esc(t.month)+' <input id="dabbirPnlMonth" type="month" value="'+esc(selectedMonth)+'"></label><button id="dabbirPnlRefresh" type="button">'+esc(t.refresh)+'</button></div></div><div class="dabbirPnlGrid">'+
      '<div class="dabbirPnlStat"><span>'+esc(t.revenue)+'</span><b>'+esc(aed(r.known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.ai)+'</span><b>'+esc(aed(c.ai_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.other)+'</span><b>'+esc(aed(c.other_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.total)+'</span><b>'+esc(aed(c.total_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.known)+'</span><b>'+esc(aed(p.known_operating_result_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.net)+'</span><b>'+esc(complete?aed(p.net_profit_aed):'—')+'</b></div></div>'+ 
      '<div class="dabbirPnlNotice '+(complete?'':'warn')+'"><b>'+esc(complete?t.complete:t.partial)+'</b> · '+esc(t.owner)+(complete?'':'<br>'+esc(t.notFinal))+'</div>'+ 
      (!complete&&missing.length?'<details open><summary>'+esc(t.missing)+' ('+missing.length+')</summary><div class="dabbirPnlTable"><table><thead><tr><th>'+esc(t.source)+'</th><th>'+esc(t.state)+'</th></tr></thead><tbody>'+missing.map(s=>'<tr><td>'+esc(s.provider||s.source_key)+'</td><td>'+esc(s.state)+'</td></tr>').join('')+'</tbody></table></div></details>':'')+
      '<details open><summary>'+esc(t.business)+'</summary>'+rows(p.businesses,'business')+'</details><details><summary>'+esc(t.providers)+'</summary>'+rows(p.by_provider,'provider')+'</details><details><summary>'+esc(t.categories)+'</summary>'+rows(p.by_category,'category')+'</details>';
    const input=document.querySelector('#dabbirPnlMonth');if(input)input.onchange=()=>{selectedMonth=input.value||currentMonth()};const btn=document.querySelector('#dabbirPnlRefresh');if(btn)btn.onclick=()=>load();
  }
  async function probeCapability(){
    if(capability==='allowed')return true;
    if(capability==='denied'||capability==='error')return false;
    if(capabilityPromise)return capabilityPromise;
    capability='probing';error=false;
    capabilityPromise=(async()=>{
      try{
        const response=await fetch('/api/owner-finance?action=capability',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
        const payload=await response.json().catch(()=>null);
        if(response.ok&&payload?.ok&&payload.allowed===true){capability='allowed';denied=false;error=false;return true}
        if(response.ok&&payload?.ok&&payload.allowed===false){capability='denied';denied=true;error=false;data=null;return false}
        capability='error';denied=false;error=true;data=null;return false;
      }catch{capability='error';denied=false;error=true;data=null;return false}
    })();
    try{return await capabilityPromise}finally{capabilityPromise=null;render()}
  }
  async function load(){
    if(loading||capability!=='allowed'||denied)return;
    loading=true;error=false;render();
    try{
      const response=await fetch('/api/owner-finance?month='+encodeURIComponent(selectedMonth),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      if(response.status===401||response.status===403){denied=true;capability='denied';data=null;return}
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'PNL_LOAD_FAILED');data=payload.pnl||null;denied=false;
    }catch{error=true;data=null}finally{loading=false;render()}
  }
  async function maybeLoad(){const el=ensure();if(!el||loading||data||denied||error)return;if(capability!=='allowed'){const allowed=await probeCapability();if(!allowed)return}if(capability==='allowed'&&!loading&&!data&&!denied&&!error)await load()}
  const observer=new MutationObserver(()=>{void maybeLoad()});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['lang']});
  window.__dabbirUiLifecycle?.on?.('afterNavigate','platform-pnl-v2',()=>{void maybeLoad()});
  window.__dabbirUiLifecycle?.on?.('afterLanguage','platform-pnl-lang-v2',()=>render());
  setTimeout(()=>{void maybeLoad()},0);
})();
(()=>{
  if (window.__dabbirPlatformCustomersUi) return;
  window.__dabbirPlatformCustomersUi = true;

  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const isAr = () => document.documentElement.lang !== 'en';
  const text = () => isAr() ? {
    nav:'إدارة العملاء', title:'إدارة عملاء DABBIR', desc:'حسابات عملاء المنصة والمالية والدعم والتحكم والاسترجاع من مكان واحد.',
    search:'ابحث برقم DAB أو البريد أو الهاتف أو اسم النشاط', find:'بحث', accounts:'الحسابات', businesses:'الأنشطة', active:'نشط', blocked:'موقوف', suspended:'معلّق في DABBIR',
    lastLogin:'آخر دخول', created:'تاريخ التسجيل', phone:'الهاتف', noPhone:'غير مسجل', details:'فتح الحساب', back:'العودة للحسابات',
    customers:'عملاء النشاط', chats:'المحادثات', messages:'الرسائل', orders:'الطلبات', appointments:'المواعيد', tasks:'المهام',
    finance:'مالية DABBIR', financeDesc:'تكلفة DABBIR واشتراك العميل فقط. لا تشمل أموال النشاط أو مدفوعات زبائنه.', month:'الشهر',
    confirmedAiSpend:'مصروف AI المؤكد', unpricedAi:'عمليات AI غير المسعّرة', aiRequests:'طلبات AI', tokens:'التوكنز', subscriptionEvidence:'دليل الاشتراك',
    webBilling:'سجلات اشتراك الويب', storeSubscriptions:'اشتراكات المتجر الفعالة', webBillingEnv:'بيئة فوترة الويب', revenue:'إيراد الاشتراك', margin:'هامش العميل',
    revenueUnavailable:'غير متاح — لا يوجد سجل سعر/إيراد موثّق', partialCost:'القياس جزئي؛ العمليات غير المسعّرة ليست صفراً.', completeCost:'التكلفة المسعّرة مكتملة لهذا المصدر.', noMeteredAi:'لا يوجد استهلاك AI مقاس هذا الشهر.',
    noFinancePermission:'لا توجد صلاحية لعرض البيانات المالية.', financeUnavailable:'تعذر تحميل البيانات المالية دون التأثير على إدارة الحساب.', subscriptionStatus:'حالة الاشتراك', noSubscriptionRecord:'لا يوجد سجل اشتراك', periodEnd:'نهاية الفترة', lastInvoice:'آخر فاتورة',
    waCostPerConversation:'تكلفة واتساب / محادثة', providers:'تفصيل مزودي AI', provider:'المزود', cost:'التكلفة', unpriced:'غير مسعّر', storeEntitlements:'اشتراكات المتجر', none:'لا يوجد',
    sandbox:'تجريبي فقط', liveEvidence:'دليل Live موجود', noProviderEvents:'لا توجد أحداث مزود', verifiedAt:'آخر تحقق', expires:'الانتهاء',
    access:'وصول DABBIR', accessDesc:'تعليق الحساب يوقف وصول هذا العميل إلى DABBIR فقط ولا يحظر هوية Supabase أو أي نظام آخر.',
    suspend:'تعليق الحساب', reactivate:'إعادة تفعيل الحساب', reason:'سبب التعليق', reasonPlaceholder:'مثال: طلب العميل، إساءة استخدام، مشكلة فوترة قيد المراجعة',
    suspendConfirm:'للتعليق اكتب', suspendedAt:'تم التعليق', accessUpdated:'تم تحديث وصول الحساب.', adminProtected:'لا يمكن تعليق حساب Platform Admin.', reasonRequired:'اكتب سببًا واضحًا للتعليق.', confirmRequired:'عبارة التأكيد غير مطابقة.',
    recovery:'استرجاع البيانات', recoveryDesc:'اختر وقتًا سابقًا لمساحة العمل. المعاينة تفصل الاسترجاع الآمن عن البيانات التي تحتاج مصالحة يدوية. يجب تعليق الحساب قبل إنشاء حالة الاسترجاع.', targetTime:'الوقت المراد الرجوع إليه', preview:'معاينة الاسترجاع', prepare:'إنشاء حالة استرجاع', events:'إجمالي التغييرات', safeEvents:'قابلة للاسترجاع الآمن', manualEvents:'تحتاج مصالحة يدوية', confirmLabel:'للتنفيذ اكتب', apply:'تنفيذ الاسترجاع', restored:'تم تنفيذ الاسترجاع.', danger:'سيبقى الحساب معلّقًا بعد الاسترجاع حتى تتم مراجعته وإعادة تفعيله يدويًا.', frozenRequired:'يجب تعليق حساب العميل أولًا قبل إنشاء أو تنفيذ الاسترجاع.', manualRequired:'المعاينة تحتوي بيانات دفع/رسائل/طلبات/خصوصية أو تكاملات. تم منع الاسترجاع التلقائي وتحتاج هذه البيانات مصالحة يدوية.', safeReady:'المعاينة آمنة للاسترجاع التلقائي.',
    empty:'لا توجد نتائج.', loading:'جارٍ التحميل...', failed:'تعذر تحميل لوحة إدارة العملاء.'
  } : {
    nav:'Customer admin', title:'DABBIR customer administration', desc:'Platform customer accounts, finance, support, access control and recovery in one place.',
    search:'Search DAB number, email, phone, or business name', find:'Search', accounts:'Accounts', businesses:'Businesses', active:'Active', blocked:'Blocked', suspended:'Suspended in DABBIR',
    lastLogin:'Last sign-in', created:'Created', phone:'Phone', noPhone:'Not stored', details:'Open account', back:'Back to accounts',
    customers:'Business customers', chats:'Conversations', messages:'Messages', orders:'Orders', appointments:'Appointments', tasks:'Tasks',
    finance:'DABBIR finance', financeDesc:'DABBIR subscription evidence and operating cost only. Business customer payments are excluded.', month:'Month',
    confirmedAiSpend:'Confirmed AI spend', unpricedAi:'Unpriced AI operations', aiRequests:'AI requests', tokens:'Tokens', subscriptionEvidence:'Subscription evidence',
    webBilling:'Web subscription records', storeSubscriptions:'Active store subscriptions', webBillingEnv:'Web billing environment', revenue:'Subscription revenue', margin:'Customer margin',
    revenueUnavailable:'Unavailable — no authoritative price/revenue ledger', partialCost:'Measurement is partial; unpriced operations are not zero.', completeCost:'Priced cost is complete for this source.', noMeteredAi:'No metered AI usage this month.',
    noFinancePermission:'You do not have permission to view financial data.', financeUnavailable:'Financial data could not be loaded; customer administration remains available.', subscriptionStatus:'Subscription status', noSubscriptionRecord:'No subscription record', periodEnd:'Period end', lastInvoice:'Last invoice',
    waCostPerConversation:'WhatsApp cost / conversation', providers:'AI provider breakdown', provider:'Provider', cost:'Cost', unpriced:'Unpriced', storeEntitlements:'Store subscriptions', none:'None',
    sandbox:'Sandbox only', liveEvidence:'Live evidence present', noProviderEvents:'No provider events', verifiedAt:'Last verified', expires:'Expires',
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
  const fmtMonth = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat(isAr() ? 'ar-AE' : 'en-AE', {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value)); }
    catch { return String(value); }
  };
  const num = value => value===null||value===undefined||!Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(isAr()?'ar-AE':'en-AE').format(Number(value));
  const aed = value => {
    if (value===null||value===undefined||!Number.isFinite(Number(value))) return '—';
    try { return new Intl.NumberFormat(isAr()?'ar-AE':'en-AE',{style:'currency',currency:'AED',minimumFractionDigits:Number(value)<1?4:2,maximumFractionDigits:6}).format(Number(value)); }
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
  let financeOverview = null;
  let financeOverviewDenied = false;
  let financeOverviewError = false;
  let selectedFinance = null;
  let selectedFinanceDenied = false;
  let selectedFinanceError = false;

  const style = document.createElement('style');
  style.dataset.dabbirPlatformCustomers = 'v5';
  style.textContent = '.pcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pcToolbar{display:flex;gap:8px;margin-bottom:12px}.pcToolbar input{flex:1;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px}.pcAccount{border:1px solid var(--line);background:#131619;border-radius:16px;padding:13px}.pcAccount b{display:block;font-size:12px}.pcAccount small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.pcCode{direction:ltr;display:inline-block;font-weight:950;letter-spacing:.04em;color:var(--accent)}.pcBiz{border:1px solid var(--line);border-radius:15px;padding:12px;margin-top:10px;background:#121416}.pcCounts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.pcCount{background:#191c20;border-radius:10px;padding:8px}.pcCount span{font-size:8px;color:var(--muted);display:block}.pcCount b{font-size:15px}.pcDanger{border:1px solid #5b3030;background:#2b1717;border-radius:14px;padding:11px;margin-top:12px}.pcAccess{border:1px solid #3d4654;background:#151a20;border-radius:14px;padding:12px;margin-top:12px}.pcAccess.suspended{border-color:#6a4c2c;background:#261d12}.pcAccess input{width:100%;border:1px solid var(--line);background:#101316;color:#fff;border-radius:10px;padding:9px;margin-top:7px}.pcRecoveryResult{margin-top:9px;padding:9px;border:1px solid var(--line);border-radius:11px;font-size:10px}.pcRecoverySafe{border-color:#28583a;background:#12251a}.pcRecoveryBlocked{border-color:#6c4030;background:#2d1d15}.pcMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.pcMetric{border:1px solid var(--line);border-radius:14px;padding:12px;background:#131619}.pcMetric span{font-size:9px;color:var(--muted);display:block}.pcMetric strong{font-size:21px}.pcActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.pcFinance{border:1px solid #344b73;background:#111a28;border-radius:16px;padding:13px;margin-bottom:12px}.pcFinanceHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.pcFinanceHead b{font-size:13px}.pcFinanceHead small{display:block;color:var(--muted);font-size:9px;max-width:760px}.pcFinanceGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.pcFinanceStat{background:#172235;border:1px solid #263a58;border-radius:11px;padding:9px;min-width:0}.pcFinanceStat span{font-size:8px;color:var(--muted);display:block}.pcFinanceStat b{font-size:15px;overflow-wrap:anywhere}.pcFinanceNote{font-size:9px;margin-top:9px;padding:8px 9px;border-radius:9px;background:#1c2430;color:var(--muted)}.pcFinanceNote.warn{background:#2b2416;color:#e8c77c}.pcFinanceDetails{margin-top:9px}.pcFinanceDetails summary{cursor:pointer;font-size:10px;min-height:36px;display:flex;align-items:center}.pcProvider{display:grid;grid-template-columns:1fr auto auto auto;gap:7px;padding:6px 0;border-top:1px solid #27364a;font-size:9px;align-items:center}.pcProvider:first-child{border-top:0}.pcEntitlement{padding:7px;border:1px solid #29394f;border-radius:9px;margin-top:6px;font-size:9px}.pcEntitlement b{font-size:10px}@media(max-width:760px){.pcGrid{grid-template-columns:1fr}.pcMetrics{grid-template-columns:repeat(2,1fr)}.pcToolbar{flex-direction:column}.pcCounts{grid-template-columns:repeat(2,1fr)}.pcFinanceGrid{grid-template-columns:repeat(2,1fr)}}';
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
  function webEnvironmentLabel(value){ const t=text(); return value==='SANDBOX_ONLY'?t.sandbox:value==='LIVE_EVIDENCE_PRESENT'?t.liveEvidence:value==='NO_PROVIDER_EVENTS'?t.noProviderEvents:(value||'—'); }
  function financeStateText(value){ const t=text(); return value==='PARTIAL'?t.partialCost:value==='COMPLETE'?t.completeCost:value==='NO_METERED_AI'?t.noMeteredAi:value||'—'; }

  async function loadAccounts(term){
    if (!enabled) return;
    selected=null; recoveryPreview=null; recoveryCase=null; selectedFinance=null; selectedFinanceDenied=false; selectedFinanceError=false; loading();
    financeOverview=null; financeOverviewDenied=false; financeOverviewError=false;
    const [accountResult,financeResult]=await Promise.all([
      api('/api/platform-customers?action=search&q='+encodeURIComponent(term||'')),
      api('/api/platform-customers?action=finance_overview')
    ]);
    if (!accountResult.response.ok) return failed();
    accounts = accountResult.payload.accounts || [];
    if(financeResult.response.ok) financeOverview=financeResult.payload.finance||null;
    else if(financeResult.response.status===403) financeOverviewDenied=true;
    else financeOverviewError=true;
    renderAccounts();
  }

  async function openAccount(userId){
    loading();
    selectedFinance=null; selectedFinanceDenied=false; selectedFinanceError=false;
    const [detailResult,financeResult]=await Promise.all([
      api('/api/platform-customers?action=detail&user_id='+encodeURIComponent(userId)),
      api('/api/platform-customers?action=finance&user_id='+encodeURIComponent(userId))
    ]);
    if (!detailResult.response.ok) return failed();
    selected=detailResult.payload.customer; recoveryPreview=null; recoveryCase=null;
    if(financeResult.response.ok) selectedFinance=financeResult.payload.finance||null;
    else if(financeResult.response.status===403) selectedFinanceDenied=true;
    else selectedFinanceError=true;
    renderDetail();
  }

  function renderFinanceOverview(){
    const t=text();
    if(financeOverviewDenied)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.noFinancePermission)+'</small></div></div></div>';
    if(financeOverviewError)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeUnavailable)+'</small></div></div></div>';
    if(!financeOverview)return '';
    const ai=financeOverview.ai||{},subs=financeOverview.subscriptions||{};
    const storeActive=Number(subs.apple_production_active||0)+Number(subs.google_production_active||0);
    const note=ai.measurement_state==='PARTIAL'?t.partialCost:t.completeCost;
    return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge gray">'+esc(t.month)+': '+esc(fmtMonth(financeOverview.month_start))+'</span></div><div class="pcFinanceGrid">'+
      '<div class="pcFinanceStat"><span>'+esc(t.confirmedAiSpend)+'</span><b>'+esc(aed(ai.known_cost_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.unpricedAi)+'</span><b>'+esc(num(ai.unpriced_operations))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.aiRequests)+'</span><b>'+esc(num(ai.ai_requests))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.tokens)+'</span><b>'+esc(num(ai.total_tokens))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.webBilling)+'</span><b>'+esc(num(subs.web_records))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.storeSubscriptions)+'</span><b>'+esc(num(storeActive))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.revenue)+'</span><b>—</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div>'+
      '</div><div class="pcFinanceNote '+(ai.measurement_state==='PARTIAL'?'warn':'')+'">'+esc(note)+' · '+esc(t.webBillingEnv)+': '+esc(webEnvironmentLabel(subs.web_billing_environment))+' · '+esc(t.revenueUnavailable)+'</div></div>';
  }

  function renderAccounts(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const active=accounts.filter(a=>!a.deleted_at&&!a.banned_until&&!isSuspended(a)).length;
    const businesses=accounts.reduce((sum,a)=>sum+Number(a.business_count||0),0);
    const cards=accounts.length ? accounts.map(a =>
      '<div class="pcAccount"><span class="pcCode">'+esc(a.customer_no)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small><small>'+esc(t.lastLogin)+': '+esc(fmt(a.last_sign_in_at))+'</small><div class="pcActions"><span class="badge '+badgeClass(a)+'">'+esc(accountLabel(a))+'</span><button class="secondary" data-pc-user="'+esc(a.user_id)+'">'+esc(t.details)+'</button></div></div>'
    ).join('') : '<div class="empty">'+esc(t.empty)+'</div>';
    body.innerHTML='<div class="pcMetrics"><div class="pcMetric"><span>'+esc(t.accounts)+'</span><strong>'+accounts.length+'</strong></div><div class="pcMetric"><span>'+esc(t.active)+'</span><strong>'+active+'</strong></div><div class="pcMetric"><span>'+esc(t.businesses)+'</span><strong>'+businesses+'</strong></div></div>'+renderFinanceOverview()+'<div class="pcToolbar"><input id="pcSearch" placeholder="'+esc(t.search)+'"><button class="primary" id="pcSearchBtn">'+esc(t.find)+'</button></div><div class="pcGrid">'+cards+'</div>';
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

  function renderEntitlements(){
    const t=text();
    if(!selectedFinance)return '';
    const subscriptions=selectedFinance.subscriptions||{};
    const rows=[...(subscriptions.apple||[]).map(row=>({...row,provider:'Apple'})),...(subscriptions.google||[]).map(row=>({...row,provider:'Google'}))];
    if(!rows.length)return '<div class="pcFinanceNote">'+esc(t.storeEntitlements)+': '+esc(t.none)+'</div>';
    return '<details class="pcFinanceDetails"><summary>'+esc(t.storeEntitlements)+' ('+rows.length+')</summary>'+rows.map(row=>'<div class="pcEntitlement"><b>'+esc(row.provider)+' · '+esc(row.product_id||'—')+'</b><div>'+esc(row.status||row.subscription_state||'—')+' · '+esc(row.environment||'—')+'</div><small>'+esc(t.expires)+': '+esc(fmt(row.expires_at))+' · '+esc(t.verifiedAt)+': '+esc(fmt(row.verified_at))+'</small></div>').join('')+'</details>';
  }

  function renderCustomerFinance(){
    const t=text();
    if(selectedFinanceDenied)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.noFinancePermission)+'</small></div></div></div>';
    if(selectedFinanceError)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeUnavailable)+'</small></div></div></div>';
    if(!selectedFinance)return '';
    return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge gray">'+esc(t.month)+': '+esc(fmtMonth(selectedFinance.month_start))+'</span></div><div class="pcFinanceGrid"><div class="pcFinanceStat"><span>'+esc(t.webBillingEnv)+'</span><b>'+esc(webEnvironmentLabel(selectedFinance.web_billing_environment))+'</b></div><div class="pcFinanceStat"><span>'+esc(t.revenue)+'</span><b>—</b></div><div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div></div><div class="pcFinanceNote">'+esc(t.revenueUnavailable)+'</div>'+renderEntitlements()+'</div>';
  }

  function renderBusinessFinance(business){
    const t=text();
    if(!selectedFinance||selectedFinanceDenied||selectedFinanceError)return '';
    const row=(selectedFinance.businesses||[]).find(item=>String(item.id)===String(business.id));
    if(!row)return '';
    const ai=row.ai||{},usage=row.usage||{},billing=row.billing||null,providers=Array.isArray(row.providers)?row.providers:[];
    const state=financeStateText(ai.measurement_state);
    const providerHtml=providers.length?'<details class="pcFinanceDetails"><summary>'+esc(t.providers)+'</summary>'+providers.map(p=>'<div class="pcProvider"><span>'+esc(p.provider||'—')+'</span><span>'+esc(num(p.ai_requests))+'</span><span>'+esc(aed(p.known_cost_aed))+'</span><span>'+esc(num(p.unpriced_operations))+'</span></div>').join('')+'</details>':'';
    return '<div class="pcFinance" style="margin-top:10px;margin-bottom:0"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge '+(ai.measurement_state==='PARTIAL'?'orange':'gray')+'">'+esc(state)+'</span></div><div class="pcFinanceGrid">'+
      '<div class="pcFinanceStat"><span>'+esc(t.confirmedAiSpend)+'</span><b>'+esc(aed(ai.known_cost_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.unpricedAi)+'</span><b>'+esc(num(ai.unpriced_operations))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.aiRequests)+'</span><b>'+esc(num(ai.ai_requests))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.tokens)+'</span><b>'+esc(num(ai.total_tokens))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.waCostPerConversation)+'</span><b>'+esc(aed(usage.known_whatsapp_cost_per_conversation_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.subscriptionStatus)+'</span><b>'+esc(billing?.status||t.noSubscriptionRecord)+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.periodEnd)+'</span><b>'+esc(fmt(billing?.current_period_ends_at))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div>'+
      '</div><div class="pcFinanceNote '+(ai.measurement_state==='PARTIAL'?'warn':'')+'">'+esc(state)+' · '+esc(t.revenueUnavailable)+(billing?.last_invoice_status?' · '+esc(t.lastInvoice)+': '+esc(billing.last_invoice_status):'')+'</div>'+providerHtml+'</div>';
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
    return '<div class="pcBiz"><div class="row space"><div><b>'+esc(business.name)+'</b><small>'+esc(business.business_type)+' · '+esc(business.role)+' · '+esc(business.membership_status)+'</small></div><span class="badge gray">'+esc(business.locale||'')+'</span></div><div class="pcCounts">'+counters+'</div>'+renderBusinessFinance(business)+'<div class="pcDanger"><b>'+esc(t.recovery)+'</b><small style="display:block;color:var(--muted);margin-top:4px">'+esc(t.recoveryDesc)+'</small><div class="field"><label>'+esc(t.targetTime)+'</label><input type="datetime-local" data-pc-time="'+esc(business.id)+'"></div><div class="pcActions"><button class="secondary" data-pc-preview="'+esc(business.id)+'">'+esc(t.preview)+'</button>'+(canPrepare?'<button class="primary" data-pc-open="'+esc(business.id)+'">'+esc(t.prepare)+'</button>':'')+'</div>'+previewHtml+caseHtml+'</div></div>';
  }

  function renderDetail(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const user=selected.user||{}, account=selected.account||{}, businesses=selected.businesses||[];
    const statusObject={...user,access:selected.access};
    body.innerHTML='<button class="secondary" id="pcBack">← '+esc(t.back)+'</button><div class="card" style="margin-top:10px"><div class="row space"><div><span class="pcCode">'+esc(account.customer_no||'')+'</span><h2 style="margin:5px 0">'+esc(user.email||'—')+'</h2></div><span class="badge '+badgeClass(statusObject)+'">'+esc(accountLabel(statusObject))+'</span></div><div class="pcGrid" style="margin-top:10px"><div class="pcAccount"><small>'+esc(t.phone)+'</small><b>'+esc(user.phone||t.noPhone)+'</b></div><div class="pcAccount"><small>'+esc(t.created)+'</small><b>'+esc(fmt(user.created_at))+'</b></div><div class="pcAccount"><small>'+esc(t.lastLogin)+'</small><b>'+esc(fmt(user.last_sign_in_at))+'</b></div></div>'+renderAccess()+'</div>'+renderCustomerFinance()+'<div style="margin-top:12px">'+businesses.map(renderBusiness).join('')+'</div>';
    q('#pcBack').onclick=()=>{selected=null;selectedFinance=null;renderAccounts();};
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
      financeOverview=null; selectedFinance=null;
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
  let requestVersion=0;
  let loadError=false;
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
    title:'جهّز دَبِّر ليعمل عنك',readyTitle:'اكتمل الإعداد الأساسي',desc:'راجع ما اكتمل من إعداد نشاطك وما يحتاج خطوة منك.',readyDesc:'اكتملت معلومات النشاط وربط واتساب وإعداد الردود. تابع النتائج الفعلية وما يحتاج قرارك من أولويات اليوم.',score:'اكتمال الإعداد',next:'الخطوة الأفضل الآن',proof:'نشاطك بالأرقام',intentTitle:'ماذا تريد من دَبِّر الآن؟',readError:'تعذر التحقق من إعداد هذا النشاط الآن. أعد المحاولة؛ لم نغيّر إعداداتك.',retry:'إعادة المحاولة',
    profile:'معلومات النشاط',channel:'واتساب',ai:'ذكاء دَبِّر',profileTodo:'أكمل معلومات نشاطك',profileBody:'أضف الساعات وبيانات التواصل والسياسات الأساسية حتى يرد دَبِّر بمعلومات صحيحة.',profileAction:'إكمال المعلومات',channelTodo:'اربط واتساب',channelBody:'اربط رقم WhatsApp Business من داخل دَبِّر حتى تنتقل من التجربة الداخلية إلى قناة العميل الحقيقية.',channelAction:'ربط واتساب',channelVerifyTodo:'تحقق من تشغيل واتساب',channelVerifyBody:'الرقم مرتبط بـ Meta، لكن دَبِّر لن يعتبره جاهزًا حتى يستقبل رسالة WhatsApp حقيقية ويسجل ردًا حقيقيًا بنتيجة خارجية موثقة.',channelVerifyAction:'اختبار واتساب',aiTodo:'تحقق من جاهزية الذكاء',aiBody:'دَبِّر يحتاج AI تشغيليًا قبل أن يعتمد عليه في الردود والمتابعة.',aiAction:'فتح الحالة',firstAppointment:'سجّل أول موعد',firstAppointmentBody:'أضف موعد عميل ليظهر في جدول نشاطك. يمكنك إكمال معلومات النشاط وربط واتساب لاحقًا.',firstAppointmentAction:'إضافة أول موعد',priorities:'راجع أولويات اليوم',customers:'عملاء',chats:'محادثات',aiReplies:'ردود AI',unverified:'—',loading:'دَبِّر يتحقق من التجهيز الفعلي…',complete:'مكتمل',reply:'الرد على العملاء',follow:'المتابعات',customerRecords:'العملاء',settings:'معلومات النشاط',appointments:'المواعيد',operations:'الطلبات والمخزون',viewings:'المعاينات',schedule:'الجدول'
  }:{
    title:'Get DABBIR working for you',readyTitle:'Basic setup is complete',desc:'Review what is set up for your business and what needs your next step.',readyDesc:'Business information, WhatsApp and reply configuration are set up. Review actual outcomes and decisions in today’s priorities.',score:'Setup completion',next:'Best next step',proof:'Business counts',intentTitle:'What do you want DABBIR to do now?',readError:'We could not verify this business’s setup. Try again; your settings were not changed.',retry:'Try again',
    profile:'Business info',channel:'WhatsApp',ai:'DABBIR AI',profileTodo:'Complete business information',profileBody:'Add hours, contact details and key policies so DABBIR can answer accurately.',profileAction:'Complete info',channelTodo:'Connect WhatsApp',channelBody:'Connect your WhatsApp Business number inside DABBIR to move from internal testing to the real customer channel.',channelAction:'Connect WhatsApp',channelVerifyTodo:'Verify WhatsApp operation',channelVerifyBody:'The number is linked to Meta, but DABBIR will not mark it ready until a real WhatsApp inbound and a real externally verified reply are recorded.',channelVerifyAction:'Test WhatsApp',aiTodo:'Verify AI readiness',aiBody:'DABBIR needs operational AI before replies and follow-ups can be trusted.',aiAction:'Open status',firstAppointment:'Record your first appointment',firstAppointmentBody:'Add a customer appointment to your business schedule. You can finish business information and connect WhatsApp later.',firstAppointmentAction:'Add first appointment',priorities:'Review today’s priorities',customers:'Customers',chats:'Conversations',aiReplies:'AI replies',unverified:'—',loading:'DABBIR is checking verified setup…',complete:'Complete',reply:'Reply to customers',follow:'Follow-ups',customerRecords:'Customers',settings:'Business info',appointments:'Appointments',operations:'Orders & inventory',viewings:'Viewings',schedule:'Schedule'
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

  function syncBusinessScope(id){
    if(businessId===id)return;
    requestVersion++;
    businessId=id;
    profile=null;
    whatsapp=null;
    loading=false;
    loadedAt=0;
    loadError=false;
  }

  function exactMetric(key){
    const m=workspace?.verified_metrics;
    if(!m||m.state!=='VERIFIED_EXACT_COUNTS')return null;
    const value=m[key];
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }

  function openScreen(screen){if(typeof showScreen==='function')showScreen(screen)}
  let pressedBusiness=null,deferredRender=false;
  function finishActivationPress(){
    pressedBusiness=null;
    if(deferredRender){deferredRender=false;setTimeout(render,0)}
  }
  // Keep the pointer target alive until its click is delivered. Background
  // setup reads must not replace a button between pointerdown and click.
  document.addEventListener?.('pointerdown',event=>{
    if(event.button===0&&event.target.closest?.('#dabbirActivation'))pressedBusiness=workspace?.business?.id||null;
  },true);
  document.addEventListener?.('click',finishActivationPress);
  document.addEventListener?.('pointercancel',finishActivationPress);
  document.addEventListener?.('pointerup',event=>{
    if(!event.target.closest?.('#dabbirActivation'))finishActivationPress();
  });
  window.addEventListener?.('blur',finishActivationPress);
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

  function firstWorkStep(){
    // These activities use the existing manual appointment flow; specialized
    // salon, car-wash and commerce setup retain their own prerequisites.
    const type=String(workspace?.business?.business_type||'').toLowerCase();
    if(!['clinic','services','real_estate','creator','other'].includes(type))return null;
    if(workspace?.membership?.role!=='owner'||exactMetric('customers')!==0)return null;
    const control=q('#newApptBtn');
    if(!control||control.disabled||typeof control.click!=='function')return null;
    const t=copy();
    return {title:t.firstAppointment,body:t.firstAppointmentBody,action:t.firstAppointmentAction,screen:'appointments',control:'#newApptBtn'};
  }

  function bindNextStep(next,id){
    const button=q('#daNextAction');
    if(button)button.onclick=()=>{
      if(workspace?.business?.id!==id)return;
      openScreen(next.screen);
      if(next.control){const control=q(next.control);if(control&&!control.disabled)control.click()}
      if(next.target)setTimeout(()=>q(next.target)?.scrollIntoView({behavior:'smooth',block:'start'}),30);
    };
  }

  function nextStep(){
    const t=copy();
    const first=firstWorkStep();if(first)return first;
    if(!profileReady())return {title:t.profileTodo,body:t.profileBody,action:t.profileAction,screen:'settings'};
    if(!whatsappLinked())return {title:t.channelTodo,body:t.channelBody,action:t.channelAction,screen:'integrations'};
    if(!whatsappReady())return {title:t.channelVerifyTodo,body:t.channelVerifyBody,action:t.channelVerifyAction,screen:'integrations'};
    if(!aiReady())return {title:t.aiTodo,body:t.aiBody,action:t.aiAction,screen:'integrations'};
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
    const id=workspace?.business?.id||null;
    syncBusinessScope(id);
    const panel=ensure();if(!panel)return;
    if(pressedBusiness&&pressedBusiness===id){deferredRender=true;return}
    pressedBusiness=null;
    if(!id){panel.innerHTML='';return}
    const t=copy();
    const first=firstWorkStep();
    if(first&&(loading||!loadedAt||loadError)){
      panel.innerHTML='<div class="daHead"><div><h2>'+esc(first.title)+'</h2><p>'+esc(first.body)+'</p></div></div><div class="daActions"><button type="button" class="daPrimary" id="daNextAction">'+esc(first.action)+'</button></div><div class="daLoading" role="status">'+esc(loadError?t.readError:t.loading)+'</div>'+(loadError?'<div class="daActions"><button type="button" class="daSecondary" id="daRetry">'+esc(t.retry)+'</button></div>':'');
      bindNextStep(first,id);
      const retry=q('#daRetry');if(retry)retry.onclick=()=>load(true);
      return;
    }
    if(loading||!loadedAt){panel.innerHTML='<div class="daLoading" role="status">'+esc(t.loading)+'</div>';return}
    if(loadError){
      panel.innerHTML='<div class="daLoading" role="status">'+esc(t.readError)+'</div><div class="daActions"><button type="button" class="daSecondary" id="daRetry">'+esc(t.retry)+'</button></div>';
      const retry=q('#daRetry');if(retry)retry.onclick=()=>load(true);
      return;
    }
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
    bindNextStep(next,id);
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
    const id=workspace?.business?.id||null;
    syncBusinessScope(id);
    if(!id){render();return}
    if(loading)return;
    if(!force&&loadedAt&&Date.now()-loadedAt<CACHE_MS){render();return}
    const version=++requestVersion;
    loading=true;loadError=false;render();
    const [p,w]=await Promise.allSettled([
      fetchJson('/api/business-profile?business_id='+encodeURIComponent(id)),
      fetchJson('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(id))
    ]);
    if(version!==requestVersion||businessId!==id||workspace?.business?.id!==id)return;
    profile=p.status==='fulfilled'?p.value:null;
    whatsapp=w.status==='fulfilled'?w.value:null;
    loadError=p.status!=='fulfilled'||w.status!=='fulfilled';
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
    '.uxOverlay{display:none;position:fixed;inset:0;z-index:110;background:#030405c7;backdrop-filter:blur(8px);padding:18px;align-items:flex-start;justify-content:center}.uxOverlay.open{display:flex}.uxDialog{width:min(620px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;margin-top:min(10vh,90px);border:1px solid #353b43;background:#121416;border-radius:22px;box-shadow:0 28px 90px #000b;color:#f7f8f9}.uxDialogHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #292e34}.uxDialogHead h2{margin:0;font-size:16px}.uxDialogHead p{margin:5px 0 0;color:#979da5;font-size:10px;line-height:1.6}.uxClose{border:1px solid #31363c;background:#191c20;color:#fff;border-radius:10px;min-width:40px;min-height:40px}.uxDialogBody{padding:14px}.uxDialogActions{display:flex;justify-content:flex-end;gap:8px;padding:0 14px 14px}.uxDialogActions button{border-radius:11px;padding:9px 13px;font-weight:850}.uxDialogPrimary{border:0;background:#4961e8;color:#fff}.uxDialogSecondary{border:1px solid #31363c;background:#191c20;color:#fff}',
    '.uxSearchInput{width:100%;min-height:52px;border:1px solid #39414a;background:#0d0f11;color:#fff;border-radius:14px;padding:12px 14px;font-size:16px}.uxSearchMeta{display:flex;justify-content:space-between;gap:8px;margin:9px 2px;color:#8f969e;font-size:9px}.uxResults{display:flex;flex-direction:column;gap:6px}.uxResult{width:100%;display:flex;align-items:center;gap:10px;border:1px solid #292f36;background:#171a1d;color:#fff;border-radius:13px;padding:11px;text-align:start}.uxResult:hover,.uxResult:focus-visible{border-color:#65772f;background:#1d2219}.uxResultIcon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#252a30}.uxResult b{display:block;font-size:11px}.uxResult small{display:block;margin-top:3px;color:#9299a2;font-size:8px}.uxNoResults{padding:24px;text-align:center;color:#9299a2;font-size:10px}',
    '.uxScreenTools{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px);gap:8px;margin:-6px 0 12px}.uxScreenTools input,.uxScreenTools select{width:100%;min-height:44px;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:9px 11px}',
    '.uxEmpty{display:grid;place-items:center;gap:7px;padding:26px 14px}.uxEmptyIcon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:#20251a;color:#d7ff5f;font-size:18px}.uxEmpty b{font-size:12px;color:#f7f8f9}.uxEmpty span{max-width:380px;line-height:1.65}.uxEmpty button{margin-top:5px;border:0;background:#d7ff5f;color:#111;border-radius:11px;padding:9px 13px;font-weight:850}',
    '.uxPrefsGrid{display:grid;gap:8px}.uxPrefRow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #292f35;background:#171a1d;border-radius:13px;padding:11px}.uxPrefRow b{font-size:10px}.uxSwitch{position:relative;width:46px;height:26px;flex:none}.uxSwitch input{position:absolute;opacity:0}.uxSwitch i{display:block;width:100%;height:100%;border-radius:999px;background:#30353b;transition:.16s}.uxSwitch i:after{content:"";display:block;width:20px;height:20px;margin:3px;border-radius:50%;background:#fff;transition:.16s}.uxSwitch input:checked+i{background:#72912c}.uxSwitch input:checked+i:after{transform:translateX(20px)}html[dir=rtl] .uxSwitch input:checked+i:after{transform:translateX(-20px)}',
    '.uxDashboardButton{border:1px solid #30363d;background:#171a1d;color:#fff;border-radius:12px;padding:8px 11px;font-size:9px;font-weight:850}.uxMetricRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;border:1px solid #292f35;border-radius:12px;padding:9px;margin-bottom:7px}.uxMetricRow button{min-height:38px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:9px;padding:6px 8px}.uxMetricRow label{display:flex;gap:7px;align-items:center;font-size:10px}',
    '.uxFeedback{margin-top:12px}.uxFeedbackForm{display:grid;gap:10px}.uxFeedbackForm select,.uxFeedbackForm textarea{width:100%;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:12px;padding:10px}.uxFeedbackForm textarea{min-height:110px;resize:vertical}.uxRating{display:flex;gap:5px}.uxRating button{width:42px;min-height:40px;border:1px solid #30363d;background:#191c20;color:#fff;border-radius:10px}.uxRating button.active{border-color:#7f9f35;background:#273315;color:#d7ff5f}.uxFormStatus{min-height:20px;color:#ffd87a;font-size:9px}',
    '.uxTour{position:fixed;z-index:120;inset:0;pointer-events:none}.uxTourCard{position:absolute;inset-inline:18px;bottom:18px;margin:auto;width:min(480px,calc(100% - 36px));pointer-events:auto;border:1px solid var(--ds-border,#2d3c50);background:var(--ds-surface,#0d1a2a);border-radius:16px;padding:16px;box-shadow:0 12px 32px #0005}.uxTourCard h2{margin:0;font-size:16px}.uxTourCard p{color:#a8b6c9;font-size:14px;line-height:1.7}.uxTourActions{display:flex;justify-content:space-between;gap:8px}.uxTourActions button{border-radius:11px;padding:8px 12px;font-weight:850}.uxTourTarget{position:relative;z-index:119!important;box-shadow:0 0 0 3px #8193ff,0 0 0 9999px #0005!important}',
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
      if(screen==='appointments'&&window.__dabbirBookingLifecycle){q('[data-ux-tools="appointments"]')?.remove();return}
      if(screen==='customers'&&q('#crmSearch')){q('[data-ux-tools="customers"]')?.remove();return}
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
  function startTour(){if(q('.screen.active')?.id!=='screen-dashboard'||!workspace?.business||localStorage.getItem(tourKey())==='done'||q('#uxTour'))return;tourIndex=0;trackUx('tour_started');document.body.insertAdjacentHTML('beforeend','<div id="uxTour" class="uxTour"><div class="uxTourCard"><h2 id="uxTourTitle"></h2><p id="uxTourBody"></p><div class="uxTourActions"><button id="uxTourSkip" class="uxDialogSecondary" type="button"></button><button id="uxTourNext" class="uxDialogPrimary" type="button"></button></div></div></div>');q('#uxTourSkip').onclick=finishTour;q('#uxTourNext').onclick=()=>{tourIndex++;if(tourIndex>=tourSteps().length)finishTour();else renderTour()};renderTour()}
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
  document.addEventListener('click',event=>{const nav=event.target.closest?.('[data-screen]');if(nav&&nav.dataset.screen!=='dashboard'&&q('#uxTour'))finishTour()});
  const observer=new MutationObserver(()=>{applyCopy();enrichEmptyStates();refreshFilters();if(q('#uxTour'))renderTour()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  afterRender();
  window.__dabbirUxFoundation={version:'ux-foundation-v1',confirm:ask,search:openSearch,refresh:afterRender,startTour:()=>{localStorage.removeItem(tourKey());startTour()}};
})();
(()=>{
  if(window.__dabbirContextualNavigationUi)return;
  window.__dabbirContextualNavigationUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const approvedSettingsCss=[
    '@media(max-width:700px){',
    'body.dabbir-settings-approved{--dsa-line:#26374d;--dsa-line-strong:#344a66;--dsa-muted:#8fa1ba;--dsa-text:#f3f7ff;background:radial-gradient(circle at 60% -10%,#10294b 0,#091523 34%,#050b13 72%)!important}',
    'body.dabbir-settings-approved .top{height:78px!important;padding:0 18px!important;background:#07111ff2!important;border-bottom:1px solid #17253a!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important;box-shadow:0 12px 34px #0005!important}',
    'body.dabbir-settings-approved .top>.row{width:100%!important;min-width:0!important;justify-content:center!important;gap:0!important}',
    'body.dabbir-settings-approved #pageTitle{position:absolute!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;max-width:54vw!important;font-size:20px!important;font-weight:900!important;color:var(--dsa-text)!important;text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    'body.dabbir-settings-approved #runtimeChip,body.dabbir-settings-approved .top .statusChip,body.dabbir-settings-approved .top .lang,body.dabbir-settings-approved .topActions,body.dabbir-settings-approved .dabbirTopLogo{display:none!important}',
    'body.dabbir-settings-approved #menuBtn{display:grid!important;place-items:center!important;position:absolute!important;left:17px!important;right:auto!important;top:16px!important;width:46px!important;height:46px!important;border:0!important;background:transparent!important;color:#f5f8ff!important;font-size:0!important;box-shadow:none!important}',
    'body.dabbir-settings-approved #menuBtn:before{content:"☰";font-size:31px!important;line-height:1!important;font-weight:400!important;letter-spacing:-4px!important}',
    'body.dabbir-settings-approved .dsa-header-logo{display:block!important;position:absolute!important;right:18px!important;left:auto!important;top:17px!important;width:44px!important;height:44px!important;border-radius:13px!important;object-fit:contain!important;background:#0c1b2e!important;border:1px solid #29405f!important;padding:4px!important;box-shadow:0 10px 28px #0005!important}',
    'html[dir=ltr] body.dabbir-settings-approved #menuBtn{right:17px!important;left:auto!important}html[dir=ltr] body.dabbir-settings-approved .dsa-header-logo{left:18px!important;right:auto!important}',
    'body.dabbir-settings-approved .content{max-width:760px!important;margin:0 auto!important;padding:14px 14px 126px!important;background:transparent!important}body.dabbir-settings-approved #screen-settings>.hero{display:none!important}body.dabbir-settings-approved #screen-settings.active{padding:0!important}',
    'body.dabbir-settings-approved .dsa-settings-toolbar{display:flex!important;align-items:stretch!important;justify-content:space-between!important;gap:10px!important;margin:0 2px 14px!important;direction:ltr!important}',
    'body.dabbir-settings-approved .dsa-language-control,body.dabbir-settings-approved .dsa-open-state{min-height:60px!important;border:1px solid var(--dsa-line)!important;background:linear-gradient(180deg,#0f1d2f,#0b1625)!important;color:var(--dsa-text)!important;border-radius:17px!important;box-shadow:0 10px 28px #0002!important}',
    'html[dir=rtl] body.dabbir-settings-approved .dsa-language-control,html[dir=rtl] body.dabbir-settings-approved .dsa-open-state{direction:rtl!important}',
    'body.dabbir-settings-approved .dsa-language-control{display:flex!important;align-items:center!important;gap:9px!important;padding:0 14px!important;min-width:132px!important;justify-content:center!important;font-size:14px!important;font-weight:800!important}body.dabbir-settings-approved .dsa-globe{font-size:21px!important;color:#b8c9e3!important}body.dabbir-settings-approved .dsa-chevron{color:#8fa1ba!important}',
    'body.dabbir-settings-approved .dsa-open-state{display:flex!important;align-items:center!important;gap:10px!important;padding:10px 14px!important;flex:1!important;min-width:0!important;max-width:220px!important}body.dabbir-settings-approved .dsa-state-dot{width:9px!important;height:9px!important;border-radius:50%!important;background:#607087!important;flex:0 0 9px!important}body.dabbir-settings-approved .dsa-open-state.is-open .dsa-state-dot{background:#52cf89!important;box-shadow:0 0 0 4px #52cf891a!important}',
    'body.dabbir-settings-approved .dsa-open-state small{display:block!important;color:var(--dsa-muted)!important;font-size:13px!important;margin-bottom:3px!important}body.dabbir-settings-approved .dsa-open-state b{display:block!important;color:var(--dsa-text)!important;font-size:13px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    'body.dabbir-settings-approved .dabbir-knowledge-card{margin:0!important;padding:0!important;overflow:visible!important;border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important}body.dabbir-settings-approved .dk-head{display:none!important}body.dabbir-settings-approved .dk-form{padding:0!important}',
    'body.dabbir-settings-approved .dk-sections{display:flex!important;flex-direction:column!important;gap:14px!important}body.dabbir-settings-approved .dk-section{padding:17px!important;border:1px solid var(--dsa-line)!important;background:linear-gradient(145deg,#0e1b2c,#0a1523)!important;border-radius:20px!important;box-shadow:0 14px 34px #0003!important;overflow:hidden!important}',
    'body.dabbir-settings-approved .dk-section-head{margin:0 0 15px!important;min-height:29px!important;align-items:center!important}body.dabbir-settings-approved .dk-section-head h3{display:flex!important;align-items:center!important;gap:9px!important;margin:0!important;color:var(--dsa-text)!important;font-size:18px!important;font-weight:900!important}',
    'body.dabbir-settings-approved .dk-section-head h3:before{display:grid!important;place-items:center!important;width:30px!important;height:30px!important;border-radius:9px!important;background:#122849!important;border:1px solid #23487c!important;color:#6d99ff!important;font-size:15px!important;flex:0 0 30px!important}body.dabbir-settings-approved .dk-section:nth-child(1) .dk-section-head h3:before{content:"▱"}body.dabbir-settings-approved .dk-section:nth-child(2) .dk-section-head h3:before{content:"▣"}body.dabbir-settings-approved .dk-section:nth-child(3) .dk-section-head h3:before{content:"≡"}',
    'body.dabbir-settings-approved .dk-grid{display:grid!important;grid-template-columns:1fr!important;gap:13px!important}body.dabbir-settings-approved .dk-field{gap:7px!important;min-width:0!important}body.dabbir-settings-approved .dk-field.wide{grid-column:auto!important}body.dabbir-settings-approved .dk-field label{font-size:14px!important;font-weight:800!important;color:#aebdd1!important;margin:0 2px!important}',
    'body.dabbir-settings-approved .dk-field input,body.dabbir-settings-approved .dk-field textarea{width:100%!important;border:1px solid var(--dsa-line-strong)!important;background:#0b1726!important;color:var(--dsa-text)!important;border-radius:15px!important;padding:13px 15px!important;font-size:16px!important;line-height:1.55!important;box-shadow:inset 0 1px 0 #ffffff05!important}body.dabbir-settings-approved .dk-field input{min-height:57px!important}body.dabbir-settings-approved .dk-field textarea{min-height:100px!important}body.dabbir-settings-approved .dk-field[data-key="about_business"] textarea{min-height:128px!important}',
    'body.dabbir-settings-approved .dk-field input::placeholder,body.dabbir-settings-approved .dk-field textarea::placeholder{color:#9aabc1!important;opacity:1!important}body.dabbir-settings-approved .dk-field input:focus,body.dabbir-settings-approved .dk-field textarea:focus{outline:none!important;border-color:#557cf8!important;box-shadow:0 0 0 3px #4f76ff1f!important}',
    'body.dabbir-settings-approved .dk-hours-wrap{padding:0!important;border:0!important;background:transparent!important}body.dabbir-settings-approved .dk-hours-help{font-size:13px!important;line-height:1.6!important;color:#a5b4c8!important;margin:0 0 11px!important}body.dabbir-settings-approved .dk-hours-tools{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;margin:0 0 12px!important}',
    'body.dabbir-settings-approved .dk-hours-tools button{min-height:43px!important;border:1px solid var(--dsa-line-strong)!important;background:#0d1928!important;color:#d7e2f1!important;border-radius:13px!important;padding:7px!important;font-size:13px!important;font-weight:850!important}',
    'body.dabbir-settings-approved .dk-hours-list{display:flex!important;flex-direction:column!important;gap:7px!important}body.dabbir-settings-approved .dk-hours-row{display:grid!important;grid-template-columns:minmax(0,1fr) 76px 76px!important;gap:7px!important;align-items:center!important;min-height:56px!important;border:1px solid var(--dsa-line)!important;background:#0b1726!important;border-radius:14px!important;padding:7px 9px!important}',
    'body.dabbir-settings-approved .dk-day-toggle{grid-column:1!important;grid-row:1!important;display:flex!important;align-items:center!important;gap:9px!important;min-height:40px!important;color:#8798af!important;font-size:13px!important;font-weight:850!important;white-space:nowrap!important}body.dabbir-settings-approved .dk-day-toggle input{appearance:none!important;-webkit-appearance:none!important;width:42px!important;height:24px!important;min-height:24px!important;flex:0 0 42px!important;border:1px solid #44556c!important;border-radius:999px!important;background:#344255!important;padding:0!important;position:relative!important}',
    'body.dabbir-settings-approved .dk-day-toggle input:after{content:""!important;position:absolute!important;width:18px!important;height:18px!important;top:2px!important;inset-inline-start:2px!important;border-radius:50%!important;background:#b8c3d1!important}body.dabbir-settings-approved .dk-day-toggle input:checked{background:linear-gradient(180deg,#4d73ff,#3559e9)!important;border-color:#5c80ff!important}body.dabbir-settings-approved .dk-day-toggle input:checked:after{inset-inline-start:20px!important;background:#fff!important}',
    'body.dabbir-settings-approved .dk-hours-row.is-open .dk-day-name{color:#edf4ff!important}body.dabbir-settings-approved .dk-time{grid-row:1!important;display:block!important;min-width:0!important}body.dabbir-settings-approved .dk-time:nth-of-type(2){grid-column:2!important}body.dabbir-settings-approved .dk-time:nth-of-type(3){grid-column:3!important}body.dabbir-settings-approved .dk-time span{display:none!important}',
    'body.dabbir-settings-approved .dk-time input{width:100%!important;min-height:40px!important;height:40px!important;padding:5px!important;border:0!important;background:transparent!important;color:#aebed5!important;border-radius:10px!important;font-size:13px!important;text-align:center!important;box-shadow:none!important}body.dabbir-settings-approved .dk-time input:disabled{display:none!important}body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{grid-column:2/4!important;grid-row:1!important;justify-self:start!important;color:#7f90a7!important;font-size:12px!important;font-weight:700!important}',
    'html[lang^=ar] body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{content:"مغلق"}html[lang^=en] body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{content:"Closed"}',
    'body.dabbir-settings-approved .dk-payments-wrap{padding:0!important;border:0!important;background:transparent!important}body.dabbir-settings-approved .dk-payments-help{font-size:13px!important;line-height:1.55!important;color:#a5b4c8!important;margin:0 0 11px!important}body.dabbir-settings-approved .dk-payment-options{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}',
    'body.dabbir-settings-approved .dk-payment-option{display:flex!important;align-items:center!important;justify-content:flex-start!important;text-align:start!important;min-height:55px!important;width:100%!important;border:1px solid var(--dsa-line-strong)!important;background:#0d1928!important;color:#d9e3f1!important;border-radius:14px!important;padding:10px 12px!important;font-size:12px!important;font-weight:850!important;white-space:normal!important}body.dabbir-settings-approved .dk-payment-option[aria-pressed="true"]{border-color:#587cff!important;background:linear-gradient(145deg,#1b3975,#173063)!important;color:#fff!important}body.dabbir-settings-approved .dk-payment-option[aria-pressed="true"]:before{content:"✓"!important;color:#fff!important;margin-inline-end:7px!important}',
    'body.dabbir-settings-approved .dk-actions{position:sticky!important;bottom:78px!important;z-index:17!important;display:grid!important;grid-template-columns:1fr!important;gap:7px!important;margin:2px -2px 0!important;padding:12px 2px calc(4px + env(safe-area-inset-bottom))!important;background:linear-gradient(180deg,transparent,#07111fe8 28%,#07111f)!important}body.dabbir-settings-approved .dk-actions .primary{width:100%!important;min-height:58px!important;border:1px solid #5d7eff!important;border-radius:15px!important;background:linear-gradient(135deg,#486dff,#3757ea)!important;color:#fff!important;font-size:15px!important;font-weight:900!important;box-shadow:0 12px 28px #2846d64f!important}',
    'body.dabbir-settings-approved .dk-msg{order:2!important;min-height:0!important;color:#91a3bb!important;font-size:13px!important;text-align:center!important}body.dabbir-settings-approved #bottomNav{background:#08111df2!important;border:1px solid #1c2a3d!important;border-bottom:0!important;border-radius:24px 24px 0 0!important;padding:8px 6px calc(8px + env(safe-area-inset-bottom))!important;box-shadow:0 -18px 44px #000b!important;backdrop-filter:blur(24px)!important;-webkit-backdrop-filter:blur(24px)!important}',
    'body.dabbir-settings-approved #bottomNav>button,body.dabbir-settings-approved #bottomNav>a{min-height:58px!important;border-radius:14px!important;color:#8ca0bb!important;font-size:13px!important;background:transparent!important;box-shadow:none!important}body.dabbir-settings-approved #bottomNav>button.active,body.dabbir-settings-approved #bottomNav>a.active{color:#5f8cff!important;background:transparent!important;box-shadow:none!important}',
    '}',
    '@media(min-width:701px){.dsa-settings-toolbar,.dsa-header-logo{display:none!important}}',
    "@media(max-width:700px){\nbody.dabbir-settings-approved #appShell .top{height:auto!important;min-height:78px!important;padding:calc(12px + env(safe-area-inset-top)) 18px 12px!important;overflow:visible!important}\nbody.dabbir-settings-approved #appShell .top>.row{position:relative!important;min-height:46px!important}\nbody.dabbir-settings-approved #appShell .top .d4-header-mark,body.dabbir-settings-approved #appShell .top .dabbirHeaderMarkV3,body.dabbir-settings-approved #appShell .dabbirHeaderWordV3{display:none!important}\nbody.dabbir-settings-approved #appShell .dabbirHeaderBrandV3,body.dabbir-settings-approved #appShell .dabbirHeaderCopyV3{display:block!important;width:100%!important;min-width:0!important}\nbody.dabbir-settings-approved #appShell #pageTitle{position:static!important;transform:none!important;max-width:none!important;margin-inline:54px!important;white-space:normal!important;overflow:visible!important;line-height:1.4!important;text-align:center!important}\nbody.dabbir-settings-approved #appShell #menuBtn{top:50%!important;transform:translateY(-50%)!important;left:0!important;right:auto!important}\nbody.dabbir-settings-approved #appShell .dsa-header-logo{top:50%!important;transform:translateY(-50%)!important;right:0!important;left:auto!important}\nhtml[dir=ltr] body.dabbir-settings-approved #appShell #menuBtn{right:0!important;left:auto!important}\nhtml[dir=ltr] body.dabbir-settings-approved #appShell .dsa-header-logo{left:0!important;right:auto!important}\n}"
  ].join('');

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

  function openTeam(){window.location.assign('/team.html')}

  function openAssistant(){
    if(typeof showScreen==='function')showScreen('dashboard');
    setTimeout(()=>{
      const command=q('#doCommandInput');
      if(command&&command.getClientRects().length){
        q('#dabbirOperatorSummary')?.scrollIntoView({behavior:'auto',block:'start'});
        command.focus({preventScroll:true});return;
      }
      const card=q('#dabbirOwnerCopilot');
      if(card&&card.getClientRects().length){
        window.__dabbirOwnerCopilot?.refresh?.();
        card.scrollIntoView({behavior:'auto',block:'start'});
        card.querySelector('input,textarea')?.focus({preventScroll:true});
      }
    },60);
  }

  function whatsAppLabel(){
    try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}
  }
  function navigationNotice(message){try{if(typeof toast==='function')toast(message)}catch{}}
  function openWhatsAppSettings(expectedBusinessId){
    if(!expectedBusinessId||String(currentWorkspace()?.business?.id||'')!==expectedBusinessId){
      navigationNotice(ar()?'تغيّر النشاط. افتح تنبيهات النشاط الحالي وحاول مجددًا.':'The business changed. Open its current notifications and try again.');
      return;
    }
    if(typeof showScreen!=='function')return;
    showScreen('integrations');
    setTimeout(()=>{
      if(String(currentWorkspace()?.business?.id||'')!==expectedBusinessId||!q('#screen-integrations.active'))return;
      const wanted=whatsAppLabel();
      const card=qa('#integrationGrid .integration').find(node=>String(node.querySelector('h3')?.textContent||'').trim()===wanted);
      if(!card||!card.getClientRects().length){
        navigationNotice(ar()?'تعذر عرض إعداد واتساب. حدّث الصفحة وحاول مجددًا.':'WhatsApp settings could not be shown. Refresh the page and try again.');
        return;
      }
      card.scrollIntoView({behavior:'auto',block:'start'});
      const heading=card.querySelector('h3');
      heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    },0);
  }
  let observedNoticeList=null;
  let noticeListObserver=null;
  function ensureWhatsAppNoticeAction(){
    const host=q('#noticeList');
    // The calendar refresh also replaces notice rows outside renderAll. Observe only
    // direct row replacement; inserting a button inside a row cannot trigger a loop.
    if(host!==observedNoticeList){
      noticeListObserver?.disconnect();
      noticeListObserver=null;
      observedNoticeList=host;
      if(host&&typeof MutationObserver==='function'){
        noticeListObserver=new MutationObserver(ensureWhatsAppNoticeAction);
        noticeListObserver.observe(host,{childList:true});
      }
    }
    const businessId=String(currentWorkspace()?.business?.id||'');
    for(const row of qa('#noticeList [data-notice-type="channel_issues"]')){
      let button=row.querySelector('[data-dabbir-whatsapp-notice-action]');
      if(!businessId||String(row.querySelector('b')?.textContent||'').trim()!==whatsAppLabel()){
        button?.remove();continue;
      }
      if(!button){
        button=document.createElement('button');button.type='button';button.className='secondary';
        button.dataset.dabbirWhatsappNoticeAction='true';
        button.style.marginBlockStart='8px';button.style.minHeight='44px';
        button.addEventListener('click',()=>openWhatsAppSettings(button.dataset.businessId));
        (row.querySelector('.grow')||row).append(button);
      }
      button.dataset.businessId=businessId;
      button.textContent=ar()?'إعداد واتساب':'WhatsApp settings';
    }
  }

  function ensureMoreCard(){
    const grid=q('#screen-more .moreGrid');
    let card=q('#dabbirContextServices');
    if(!isServiceBusiness()){card?.remove();return}
    if(!grid)return;
    const t=copy();
    if(!card){card=document.createElement('button');card.type='button';card.id='dabbirContextServices';card.className='moreCard';card.addEventListener('click',openServices);grid.prepend(card)}
    card.innerHTML='<h3>'+t.servicesTitle+'</h3><p>'+t.servicesDesc+'</p>';
  }

  function ensureUtilityCards(){
    const grid=q('#screen-more .moreGrid');
    if(!grid||!hasBusiness())return;
    const t=copy();
    let team=q('#dabbirTeamAccess');
    if(!team){team=document.createElement('button');team.type='button';team.id='dabbirTeamAccess';team.className='moreCard';team.addEventListener('click',openTeam);grid.append(team)}
    team.innerHTML='<h3>'+t.teamTitle+'</h3><p>'+t.teamDesc+'</p>';
    const sideTeam=q('#teamLink');
    if(sideTeam){sideTeam.hidden=false;sideTeam.classList.remove('hidden');sideTeam.style.removeProperty('display');sideTeam.textContent=t.teamTitle;sideTeam.setAttribute('aria-label',t.teamTitle)}
    let assistant=q('#dabbirAssistantAccess');
    if(!isOwner()){assistant?.remove();return}
    if(!assistant){assistant=document.createElement('button');assistant.type='button';assistant.id='dabbirAssistantAccess';assistant.className='moreCard';assistant.addEventListener('click',openAssistant);grid.prepend(assistant)}
    assistant.innerHTML='<h3>'+t.assistantTitle+'</h3><p>'+t.assistantDesc+'</p>';
  }

  let mobileMenuSide=null;
  let mobileMenuObserver=null;
  function syncMobileMenuAccessibility(){
    const menu=q('#menuBtn'),side=q('#side');
    if(!menu)return;
    const expanded=Boolean(side?.classList.contains('open')&&!side.hidden&&!side.classList.contains('hidden'));
    menu.setAttribute('aria-label',ar()?'القائمة الرئيسية':'Main navigation');
    menu.setAttribute('aria-controls','side');
    menu.setAttribute('aria-expanded',expanded?'true':'false');
  }
  function bindMobileMenuResync(){
    const menu=q('#menuBtn');
    const side=q('#side');
    syncMobileMenuAccessibility();
    // Observe only this panel's visibility attributes so every close path updates the control.
    if(side!==mobileMenuSide){
      mobileMenuObserver?.disconnect();
      mobileMenuObserver=null;
      mobileMenuSide=side;
      if(side&&typeof MutationObserver==='function'){
        mobileMenuObserver=new MutationObserver(syncMobileMenuAccessibility);
        mobileMenuObserver.observe(side,{attributes:true,attributeFilter:['class','hidden']});
      }
    }
    if(!menu||menu.dataset.dabbirContextRouterBound==='true')return;
    menu.dataset.dabbirContextRouterBound='true';
    menu.addEventListener('click',()=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(enforce);
      else setTimeout(enforce,0);
    });
  }

  function settingsActive(){return !!q('#screen-settings.active')}
  function installApprovedSettingsStyle(){
    if(!settingsActive()||!document.head||typeof document.createElement!=='function')return;
    if(document.head.querySelector?.('[data-dabbir-settings-approved="v1"]'))return;
    const style=document.createElement('style');style.dataset.dabbirSettingsApproved='v1';style.textContent=approvedSettingsCss;document.head.append(style);
  }
  function ensureSettingsHeaderLogo(){
    if(!settingsActive())return;
    const top=q('.top');if(!top||typeof document.createElement!=='function')return;
    let logo=top.querySelector('.dsa-header-logo');
    if(!logo){logo=document.createElement('img');logo.className='dsa-header-logo';logo.src='/dabbir-app-icon.png';logo.alt='DABBIR';logo.decoding='async';top.append(logo)}
  }
  function toggleSettingsLanguage(){
    const buttons=qa('.top .lang button');
    const target=buttons.find(button=>!button.classList.contains('on'));
    if(target){target.click();return}
    try{if(typeof setLanguage==='function')setLanguage(ar()?'en':'ar');else if(typeof applyLang==='function')applyLang(ar()?'en':'ar')}catch{}
  }
  function parseClock(value){const match=String(value||'').match(/^(\d{2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):NaN}
  function businessTimeZone(){
    return String(currentWorkspace()?.business?.timezone||document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  }
  function currentBusinessClock(){
    try{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:businessTimeZone(),weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
      return {day:parts.weekday,minute:Number(parts.hour)*60+Number(parts.minute)};
    }catch{return null}
  }
  function businessOpenNow(){
    const now=currentBusinessClock();if(!now)return false;
    const raw=String(q('#dk-business_hours')?.value||currentWorkspace()?.business?.business_hours||'');
    const line=raw.split(';').map(value=>value.trim()).find(value=>value.startsWith(now.day+' '));
    const match=line?.match(/^[A-Za-z]+\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);if(!match)return false;
    const start=parseClock(match[1]),end=parseClock(match[2]);if(!Number.isFinite(start)||!Number.isFinite(end))return false;
    return end>=start?(now.minute>=start&&now.minute<end):(now.minute>=start||now.minute<end);
  }
  function ensureSettingsToolbar(){
    if(!settingsActive()||typeof document.createElement!=='function')return;
    const screen=q('#screen-settings');const card=screen?.querySelector('.dabbir-knowledge-card');if(!screen||!card)return;
    let toolbar=screen.querySelector('.dsa-settings-toolbar');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.className='dsa-settings-toolbar';
      toolbar.innerHTML='<button type="button" class="dsa-language-control" aria-label="Language"><span class="dsa-globe">◎</span><span class="dsa-language-label"></span><span class="dsa-chevron">⌄</span></button><div class="dsa-open-state"><span class="dsa-state-dot"></span><span><small class="dsa-state-caption"></small><b class="dsa-state-label"></b></span></div>';
      toolbar.querySelector('.dsa-language-control')?.addEventListener('click',()=>{toggleSettingsLanguage();setTimeout(syncApprovedSettings,60)});
      card.before(toolbar);
    }
    const open=businessOpenNow();
    toolbar.querySelector('.dsa-language-label').textContent=ar()?'العربية':'English';
    toolbar.querySelector('.dsa-state-caption').textContent=ar()?'حالة النشاط':'Business status';
    toolbar.querySelector('.dsa-state-label').textContent=ar()?(open?'مفتوح الآن':'مغلق الآن'):(open?'Open now':'Closed now');
    toolbar.querySelector('.dsa-open-state').classList.toggle('is-open',open);
  }
  function syncApprovedSettings(){
    const on=settingsActive();
    document.body?.classList?.toggle('dabbir-settings-approved',on);
    if(!on)return;
    installApprovedSettingsStyle();ensureSettingsHeaderLogo();ensureSettingsToolbar();
  }
  function bindApprovedSettings(){
    if(!document.addEventListener||document.documentElement?.dataset?.dabbirApprovedSettingsBound==='true')return;
    if(document.documentElement?.dataset)document.documentElement.dataset.dabbirApprovedSettingsBound='true';
    document.addEventListener('change',event=>{if(event.target?.matches?.('[id^="dk-day-"],[id^="dk-start-"],[id^="dk-end-"]'))setTimeout(syncApprovedSettings,0)},true);
    document.addEventListener('click',event=>{if(event.target?.closest?.('[data-screen="settings"],#menuBtn,.navBtn,#bottomNav button,#bottomNav a,.dsa-language-control'))setTimeout(syncApprovedSettings,0)},true);
  }

  function enforce(){
    adaptPrimaryActivitySlot();
    ensureMoreCard();
    ensureUtilityCards();
    ensureWhatsAppNoticeAction();
    bindMobileMenuResync();
    bindApprovedSettings();
    syncApprovedSettings();
  }

  function queueEnforce(){setTimeout(enforce,0)}
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','contextual-navigation',queueEnforce);
    lifecycle.on('afterNavigate','contextual-navigation',queueEnforce);
    lifecycle.on('afterLanguage','contextual-navigation',queueEnforce);
  }

  setTimeout(enforce,0);
  setTimeout(enforce,650);
  setTimeout(enforce,1600);
  window.__dabbirContextualNavigation={refresh:enforce,version:'v7',authority:'primary-context-router',workspace_source:'global-lexical-first',mobile_menu_resync:true,team_access:'more-and-sidebar',owner_assistant_access:'more',approved_settings_ui:true,lifecycle_driven:true,business_timezone_status:true};
})();
(()=>{
  if(window.__dabbirNavigationEventBridgeV1) return;
  window.__dabbirNavigationEventBridgeV1=true;

  const NAV_ITEM_SELECTOR='#nav > [data-screen],#bottomNav > [data-screen]';
  const MAX_TAP_DISTANCE=16;
  const MAX_TAP_DURATION=900;
  const SALON_REFRESH_STALE_MS=8000;
  let touchStart=null;
  let suppressClickNode=null;
  let suppressClickUntil=0;
  let navigationEpoch=0;
  let conversationRefreshInFlight=null;
  let conversationRefreshBusinessId=null;
  let salonRefreshInFlight=null;
  let salonLastRefreshAt=0;
  let salonHiddenAt=0;

  function installSalonScreenIsolation(){
    const styleId='dabbir-salon-screen-isolation';
    if(document.getElementById(styleId)) return;
    const style=document.createElement('style');
    style.id=styleId;
    style.textContent='.salonMode .screen.salonOnly{display:none}.salonMode .screen.salonOnly.active{display:block}';
    document.head.append(style);
  }

  function itemFrom(target){
    return target?.closest?.(NAV_ITEM_SELECTOR)||null;
  }

  function refreshContextRoute(){
    try{window.__dabbirContextualNavigation?.refresh?.()}catch{}
  }

  function isSalonActive(){
    return document.body?.classList.contains('salonMode')||document.querySelector('#salonToday')!==null;
  }

  function salonScreen(name){
    return ['dashboard','appointments','salon-team','salon-services','salon-reports','salon-reminders'].includes(String(name||''));
  }

  function refreshSalonSnapshot(force=false){
    if(!isSalonActive()||document.hidden) return Promise.resolve({ok:false,reason:'SALON_INACTIVE'});
    const salon=window.__dabbirSalonMode;
    if(!salon?.refresh) return Promise.resolve({ok:false,reason:'SALON_REFRESH_UNAVAILABLE'});
    if(salonRefreshInFlight) return salonRefreshInFlight;
    const now=Date.now();
    if(!force&&now-salonLastRefreshAt<SALON_REFRESH_STALE_MS) return Promise.resolve({ok:false,reason:'SALON_FRESH'});
    salonRefreshInFlight=Promise.resolve()
      .then(()=>salon.refresh())
      .then(()=>{
        salonLastRefreshAt=Date.now();
        const result={ok:true,reason:'SALON_SERVER_REFRESHED'};
        window.__dabbirLastSalonRefresh={...result,business_id:String(workspace?.business?.id||''),at:new Date().toISOString()};
        return result;
      })
      .catch(error=>{
        const result={ok:false,reason:'SALON_REFRESH_FAILED'};
        window.__dabbirLastSalonRefresh={...result,business_id:String(workspace?.business?.id||''),error:String(error?.message||error),at:new Date().toISOString()};
        return result;
      })
      .finally(()=>{
        salonRefreshInFlight=null;
      });
    return salonRefreshInFlight;
  }

  function queueSalonRefresh(name,force=false){
    if(!isSalonActive()||!salonScreen(name)) return;
    setTimeout(()=>{void refreshSalonSnapshot(force)},0);
  }

  function routedName(name){
    const requested=String(name||'').trim();
    if(requested!=='appointments') return requested;
    refreshContextRoute();
    const slot=document.querySelector('[data-dabbir-activity-slot="true"]');
    const routed=String(slot?.dataset?.screen||'').trim();
    return routed||requested;
  }

  function installShowScreenRouterDelegation(){
    if(window.__dabbirShowScreenRouterDelegation) return true;
    const lifecycle=window.__dabbirUiLifecycle;
    if(lifecycle?.route&&lifecycle?.on){
      lifecycle.route('navigation-event-bridge',routedName);
      lifecycle.on('afterNavigate','navigation-event-bridge',({requested,target})=>{
        window.__dabbirLastCanonicalNavigation={requested:String(requested||''),target:String(target||''),at:new Date().toISOString()};
        queueSalonRefresh(target,true);
      });
      window.__dabbirShowScreenRouterDelegation='lifecycle';
      return true;
    }
    if(typeof showScreen!=='function') return false;
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const target=routedName(name);
      window.__dabbirLastCanonicalNavigation={requested:String(name||''),target,at:new Date().toISOString()};
      const result=baseShowScreen.call(this,target);
      queueSalonRefresh(target,true);
      return result;
    };
    window.__dabbirShowScreenRouterDelegation='legacy-fallback';
    return true;
  }

  function resolve(node){
    if(!node) return null;
    refreshContextRoute();
    const name=String(node.dataset?.screen||'').trim();
    if(!name) return null;
    const screen=document.getElementById('screen-'+name);
    if(!screen) return null;
    return {node,name,screen};
  }

  function renderLoadedScreen(hit){
    if(hit?.name!=='conversations') return;
    try{
      if(typeof renderChats==='function') renderChats();
    }catch(error){
      window.__dabbirLastNavigationPreRender={
        target:hit.name,
        ok:false,
        error:String(error?.message||error),
        at:new Date().toISOString(),
      };
      return;
    }
    window.__dabbirLastNavigationPreRender={
      target:hit.name,
      ok:true,
      source:'workspace',
      at:new Date().toISOString(),
    };
  }

  function refreshConversationWorkspace(){
    const businessId=String(workspace?.business?.id||'').trim();
    if(!businessId||typeof loadRuntime!=='function') return Promise.resolve({ok:false,reason:'RUNTIME_REFRESH_UNAVAILABLE'});
    if(conversationRefreshInFlight&&conversationRefreshBusinessId===businessId) return conversationRefreshInFlight;

    const before=workspace;
    const conversationId=typeof selectedConversationId!=='undefined'?selectedConversationId:null;
    conversationRefreshBusinessId=businessId;
    conversationRefreshInFlight=Promise.resolve()
      .then(()=>loadRuntime(businessId,conversationId))
      .then(()=>{
        const ok=workspace!==before&&String(workspace?.business?.id||'')===businessId;
        const result={ok,reason:ok?'SERVER_REFRESHED':'NO_FRESH_RUNTIME'};
        window.__dabbirLastConversationRefresh={...result,business_id:businessId,at:new Date().toISOString()};
        return result;
      })
      .catch(error=>{
        const result={ok:false,reason:'RUNTIME_REFRESH_FAILED'};
        window.__dabbirLastConversationRefresh={...result,business_id:businessId,error:String(error?.message||error),at:new Date().toISOString()};
        return result;
      })
      .finally(()=>{
        conversationRefreshInFlight=null;
        conversationRefreshBusinessId=null;
      });
    return conversationRefreshInFlight;
  }

  function paint(hit){
    try{current=hit.name}catch{}
    document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen===hit.screen));
    document.querySelectorAll('[data-screen]').forEach(item=>item.classList.toggle('active',item.dataset.screen===hit.name));
    const page=document.querySelector('#pageTitle');
    if(page){
      try{page.textContent=(typeof T==='function'&&T()[hit.name])||hit.name}catch{page.textContent=hit.name}
    }
    document.querySelector('#side')?.classList.remove('open');
  }

  function safeFallback(hit,source,error=null){
    paint(hit);
    window.__dabbirLastNavigationRecovery={
      target:hit.name,
      source,
      recovered:true,
      error:error?String(error?.message||error):null,
      at:new Date().toISOString(),
    };
  }

  function afterPaint(callback){
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(()=>requestAnimationFrame(callback));
      return;
    }
    setTimeout(callback,0);
  }

  function activate(hit,source){
    const epoch=++navigationEpoch;
    const started=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

    // Render the authenticated local workspace immediately so WebKit never shows a blank chat.
    // Then refresh canonical server state after first paint so newly-created conversations appear.
    renderLoadedScreen(hit);
    paint(hit);

    afterPaint(()=>{
      if(epoch!==navigationEpoch) return;

      const finish=(conversationRefresh=null)=>{
        if(epoch!==navigationEpoch) return;
        if(hit.name==='conversations'&&!workspace?.business?.id) return;
        // paint() already completed the navigation and closed its menu. A menu
        // open now is a newer user interaction, not stale navigation state.
        // The canonical render must not undo it when a server refresh finishes.
        const side=document.querySelector('#side');
        const preserveMenu=Boolean(hit.screen.classList.contains('active')&&side?.classList.contains('open'));
        let error=null;
        try{
          if(typeof showScreen==='function') showScreen(hit.name);
        }catch(caught){
          error=caught;
        }
        if(epoch!==navigationEpoch) return;
        if(!hit.screen.classList.contains('active')) safeFallback(hit,source,error||new Error('SCREEN_NOT_ACTIVATED'));
        else if(error) safeFallback(hit,source,error);
        if(preserveMenu&&!error&&document.querySelector('#side')===side&&hit.screen.classList.contains('active')) side.classList.add('open');
        const finished=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
        window.__dabbirLastNavigationTiming={
          target:hit.name,
          source,
          visual_first:true,
          loaded_content_before_activation:hit.name==='conversations',
          server_refresh_after_first_paint:hit.name==='conversations',
          conversation_refreshed:conversationRefresh?.ok===true,
          deferred_render:true,
          total_ms:Math.max(0,Math.round((finished-started)*10)/10),
          at:new Date().toISOString(),
        };
      };

      if(hit.name==='conversations'){
        refreshConversationWorkspace().then(finish).catch(()=>finish({ok:false,reason:'RUNTIME_REFRESH_FAILED'}));
        return;
      }
      finish();
    });
  }

  function refreshSalonAfterRender(){
    if(!isSalonActive())return;
    setTimeout(()=>{
      const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
      if(salonScreen(active))void refreshSalonSnapshot(false);
    },0);
  }

  installSalonScreenIsolation();
  installShowScreenRouterDelegation();
  setTimeout(installShowScreenRouterDelegation,0);
  setTimeout(installShowScreenRouterDelegation,250);

  if(window.__dabbirUiLifecycle?.on){
    window.__dabbirUiLifecycle.on('afterRender','navigation-event-bridge-salon',refreshSalonAfterRender);
  }else{
    try{
      const baseRenderAllSalonFreshness=renderAll;
      renderAll=function(){
        const result=baseRenderAllSalonFreshness.apply(this,arguments);
        refreshSalonAfterRender();
        return result;
      };
    }catch{}
  }

  document.addEventListener('touchstart',event=>{
    const node=itemFrom(event.target);
    const touch=event.touches?.[0];
    if(!node||!touch){touchStart=null;return}
    touchStart={node,x:touch.clientX,y:touch.clientY,at:Date.now()};
  },{capture:true,passive:true});

  document.addEventListener('touchend',event=>{
    const node=itemFrom(event.target);
    const touch=event.changedTouches?.[0];
    const start=touchStart;
    touchStart=null;
    if(!node||!touch||!start||start.node!==node) return;
    const distance=Math.hypot(touch.clientX-start.x,touch.clientY-start.y);
    const duration=Date.now()-start.at;
    if(distance>MAX_TAP_DISTANCE||duration>MAX_TAP_DURATION) return;
    // On real iPhone Safari, elementFromPoint at touchend can resolve to a transient overlay,
    // transformed ancestor, or composited layer even when the touch began and ended on the same
    // navigation control. The same-node + distance + duration checks above already establish a tap.
    // Do not add a second hit-test that can silently discard a valid user navigation action.
    const hit=resolve(node);
    if(!hit) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickNode=node;
    suppressClickUntil=Date.now()+800;
    activate(hit,'touchend');
  },{capture:true,passive:false});

  document.addEventListener('click',event=>{
    const node=itemFrom(event.target);
    const hit=resolve(node);
    if(!hit) return;
    if(typeof event.button==='number'&&event.button!==0) return;
    if(node===suppressClickNode&&Date.now()<suppressClickUntil){
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activate(hit,'click');
  },true);

  document.addEventListener('touchcancel',()=>{touchStart=null},{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){salonHiddenAt=Date.now();return}
    if(isSalonActive()){
      const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
      if(salonScreen(active))void refreshSalonSnapshot(Date.now()-salonHiddenAt>3000);
    }
  });
  window.addEventListener('focus',()=>{
    if(!isSalonActive())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(false);
  });
  window.addEventListener('online',()=>{
    if(!isSalonActive())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(true);
  });
  window.addEventListener('pageshow',event=>{
    if(!isSalonActive())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(event.persisted===true);
  });
  setTimeout(()=>{
    if(!isSalonActive())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(true);
  },1100);

  window.__dabbirNavigationEventBridge={
    version:'navigation-event-bridge-v6-real-iphone-touch',
    delegated_click:true,
    webkit_touch_fallback:true,
    webkit_touch_same_node_validation:true,
    redundant_touch_hit_test:false,
    safe_screen_fallback:true,
    visual_first:true,
    loaded_conversation_content_before_activation:true,
    server_conversation_refresh_after_first_paint:true,
    repeated_refresh_coalescing:true,
    stale_navigation_response_guard:true,
    deferred_render:true,
    destination_authority:'context-router',
    context_resync_before_navigation:true,
    programmatic_show_screen_delegation:true,
    lifecycle_router_authority:window.__dabbirShowScreenRouterDelegation==='lifecycle',
    salon_snapshot_refresh_event_scoped:true,
  };
})();
(()=>{
  if(window.__dabbirCarWashLoader)return;
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  let loading=false,loaded=false,attempts=0;

  function loadGlobalSupport(){
    const modules=[
      {ready:'__dabbirCustomerNameEditor',dataset:'dabbirCustomerNameEditorUi',selector:'script[data-dabbir-customer-name-editor-ui="1"]',src:'/api/customer-name-ui?v=20260908-1',error:'dabbir_customer_name_ui_load_failed'},
      {ready:'__dabbirCustomerSupportUi',dataset:'dabbirCustomerSupportUi',selector:'script[data-dabbir-customer-support-ui="1"]',src:'/api/customer-support-ui?v=20260907-1',error:'dabbir_customer_support_ui_load_failed'},
      {ready:'__dabbirPlatformCustomerSupportThreadUi',dataset:'dabbirPlatformSupportThreadUi',selector:'script[data-dabbir-platform-support-thread-ui="1"]',src:'/api/platform-customer-support-thread-ui?v=20260907-1',error:'dabbir_platform_support_thread_ui_load_failed'},
    ];
    let touched=false;
    for(const item of modules){
      if(window[item.ready]||document.querySelector(item.selector))continue;
      const node=document.createElement('script');
      node.src=item.src;
      node.async=true;
      node.dataset[item.dataset]='1';
      node.onerror=()=>console.error(item.error);
      document.head.appendChild(node);
      touched=true;
    }
    return touched;
  }

  function enforceSingleCalendar(){
    const duplicate=document.querySelector('#dabbirGenericCalendar');
    if(!duplicate)return false;
    if(isCarWash()){
      if(duplicate.dataset.dabbirCarWashDuplicate!=='hidden'){
        duplicate.dataset.dabbirCarWashDuplicate='hidden';
        duplicate.setAttribute('hidden','');
        duplicate.style.setProperty('display','none','important');
      }
      return true;
    }
    if(duplicate.dataset.dabbirCarWashDuplicate==='hidden'){
      duplicate.style.removeProperty('display');
      duplicate.removeAttribute('hidden');
      delete duplicate.dataset.dabbirCarWashDuplicate;
    }
    return false;
  }

  function loadManualBooking(){
    if(!isCarWash()||window.__dabbirCarWashManualBookingEnhancement)return false;
    if(document.querySelector('script[data-dabbir-car-wash-manual-ui="1"]'))return true;
    const node=document.createElement('script');
    node.src='/api/car-wash-manual-booking-ui?v=20260903-3-native-combobox';
    node.async=true;
    node.dataset.dabbirCarWashManualUi='1';
    node.onerror=()=>console.error('dabbir_car_wash_manual_booking_ui_load_failed');
    document.head.appendChild(node);
    return true;
  }

  function loadBookingEdit(){
    if(!isCarWash()||window.__dabbirCarWashBookingEditFix)return false;
    if(document.querySelector('script[data-dabbir-car-wash-booking-edit-ui="1"]'))return true;
    const node=document.createElement('script');
    node.src='/api/car-wash-booking-edit-ui?v=20260903-3-market-timezone';
    node.async=true;
    node.dataset.dabbirCarWashBookingEditUi='1';
    node.onerror=()=>console.error('dabbir_car_wash_booking_edit_ui_load_failed');
    document.head.appendChild(node);
    return true;
  }

  function load(){
    loadGlobalSupport();enforceSingleCalendar();loadManualBooking();loadBookingEdit();
    if(loaded||loading||!isCarWash())return false;
    if(window.__dabbirCarWashBookingUi){loaded=true;return true}
    const existing=document.querySelector('script[data-dabbir-car-wash-ui="1"]');
    if(existing){loading=true;return true}
    loading=true;
    const node=document.createElement('script');
    node.src='/api/car-wash-booking-ui?v=20260831-ops-v1';
    node.async=true;
    node.dataset.dabbirCarWashUi='1';
    node.onload=()=>{loaded=true;loading=false;loadGlobalSupport();enforceSingleCalendar();loadManualBooking();loadBookingEdit()};
    node.onerror=()=>{loading=false;console.error('dabbir_car_wash_ui_load_failed')};
    document.head.appendChild(node);
    return true;
  }

  loadGlobalSupport();
  const timer=setInterval(()=>{attempts+=1;loadGlobalSupport();enforceSingleCalendar();loadManualBooking();loadBookingEdit();if(load()||attempts>=40)clearInterval(timer)},500);
  const loaderObserver=new MutationObserver(()=>{loadGlobalSupport();if(load())loaderObserver.disconnect()});
  loaderObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  const calendarObserver=new MutationObserver(enforceSingleCalendar);
  calendarObserver.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>{loadGlobalSupport();load();enforceSingleCalendar();loadManualBooking();loadBookingEdit();if(attempts>=40)loaderObserver.disconnect()},20000);
  window.addEventListener('focus',()=>{loadGlobalSupport();load();enforceSingleCalendar();loadManualBooking();loadBookingEdit()},{passive:true});
  window.__dabbirCarWashLoader={load,loadGlobalSupport,enforceSingleCalendar,loadManualBooking,loadBookingEdit,get loaded(){return loaded}};
})();
