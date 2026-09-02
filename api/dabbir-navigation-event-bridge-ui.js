const script = String.raw`(()=>{
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

  function isSalonBusiness(){
    return String(workspace?.business?.business_type||'').toLowerCase()==='salon';
  }

  function salonScreen(name){
    return ['dashboard','appointments','salon-team','salon-services','salon-reports','salon-reminders'].includes(String(name||''));
  }

  function salonCopy(){
    return document.documentElement.lang==='en'?{refresh:'Refresh',refreshing:'Refreshing…'}:{refresh:'تحديث',refreshing:'جارٍ التحديث…'};
  }

  function ensureSalonRefreshControl(){
    if(!isSalonBusiness()) return null;
    const toolbar=document.querySelector('#salonToday .salonToolbar');
    if(!toolbar) return null;
    let button=toolbar.querySelector('[data-salon-live-refresh]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='salonBtn';
      button.dataset.salonLiveRefresh='1';
      button.textContent=salonCopy().refresh;
      button.addEventListener('click',event=>{
        event.preventDefault();
        void refreshSalonSnapshot(true,button);
      });
      toolbar.append(button);
    }else if(!button.disabled){
      button.textContent=salonCopy().refresh;
    }
    return button;
  }

  function refreshSalonSnapshot(force=false,button=null){
    if(!isSalonBusiness()||document.hidden) return Promise.resolve({ok:false,reason:'SALON_INACTIVE'});
    const salon=window.__dabbirSalonMode;
    if(!salon?.refresh) return Promise.resolve({ok:false,reason:'SALON_REFRESH_UNAVAILABLE'});
    if(salonRefreshInFlight) return salonRefreshInFlight;
    const now=Date.now();
    if(!force&&now-salonLastRefreshAt<SALON_REFRESH_STALE_MS){
      ensureSalonRefreshControl();
      return Promise.resolve({ok:false,reason:'SALON_FRESH'});
    }
    const control=button||ensureSalonRefreshControl();
    if(control){control.disabled=true;control.textContent=salonCopy().refreshing}
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
        if(control){control.disabled=false;control.textContent=salonCopy().refresh}
        setTimeout(ensureSalonRefreshControl,0);
      });
    return salonRefreshInFlight;
  }

  function queueSalonRefresh(name,force=false){
    if(!isSalonBusiness()||!salonScreen(name)) return;
    setTimeout(()=>{
      ensureSalonRefreshControl();
      void refreshSalonSnapshot(force);
    },0);
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
    if(typeof showScreen!=='function') return false;
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const target=routedName(name);
      window.__dabbirLastCanonicalNavigation={requested:String(name||''),target,at:new Date().toISOString()};
      const result=baseShowScreen.call(this,target);
      queueSalonRefresh(target,true);
      return result;
    };
    window.__dabbirShowScreenRouterDelegation=true;
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
        let error=null;
        try{
          if(typeof showScreen==='function') showScreen(hit.name);
        }catch(caught){
          error=caught;
        }
        if(epoch!==navigationEpoch) return;
        if(!hit.screen.classList.contains('active')) safeFallback(hit,source,error||new Error('SCREEN_NOT_ACTIVATED'));
        else if(error) safeFallback(hit,source,error);
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

  installSalonScreenIsolation();
  installShowScreenRouterDelegation();
  setTimeout(installShowScreenRouterDelegation,0);
  setTimeout(installShowScreenRouterDelegation,250);

  try{
    const baseRenderAllSalonFreshness=renderAll;
    renderAll=function(){
      const result=baseRenderAllSalonFreshness.apply(this,arguments);
      if(isSalonBusiness())setTimeout(()=>{
        ensureSalonRefreshControl();
        const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
        if(salonScreen(active))void refreshSalonSnapshot(false);
      },0);
      return result;
    };
  }catch{}

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
    if(isSalonBusiness()){
      const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
      if(salonScreen(active))void refreshSalonSnapshot(Date.now()-salonHiddenAt>3000);
    }
  });
  window.addEventListener('focus',()=>{
    if(!isSalonBusiness())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(false);
  });
  window.addEventListener('online',()=>{
    if(!isSalonBusiness())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(true);
  });
  window.addEventListener('pageshow',event=>{
    if(!isSalonBusiness())return;
    const active=document.querySelector('.screen.active')?.id?.replace(/^screen-/,'')||'';
    if(salonScreen(active))void refreshSalonSnapshot(event.persisted===true);
  });
  setTimeout(()=>{
    if(!isSalonBusiness())return;
    ensureSalonRefreshControl();
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
    salon_snapshot_refresh_event_scoped:true,
    salon_manual_refresh_control:true,
  };
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('x-dabbir-navigation-event-bridge','v6-real-iphone-touch');
  return res.status(200).send(script);
}
