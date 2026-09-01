const script = String.raw`(()=>{
  if(window.__dabbirNavigationEventBridgeV1) return;
  window.__dabbirNavigationEventBridgeV1=true;

  const NAV_ITEM_SELECTOR='#nav > [data-screen],#bottomNav > [data-screen]';
  const MAX_TAP_DISTANCE=16;
  const MAX_TAP_DURATION=900;
  let touchStart=null;
  let suppressClickNode=null;
  let suppressClickUntil=0;
  let navigationEpoch=0;

  function itemFrom(target){
    return target?.closest?.(NAV_ITEM_SELECTOR)||null;
  }

  function normalizeName(name){
    try{
      if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') return 'dashboard';
    }catch{}
    return name;
  }

  function resolve(node){
    if(!node) return null;
    const rawName=String(node.dataset?.screen||'').trim();
    if(!rawName) return null;
    const name=normalizeName(rawName);
    const screen=document.getElementById('screen-'+name);
    if(!screen) return null;
    return {node,name,screen};
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

    // Navigation feedback must never wait for screen rendering, data work, or wrapper modules.
    paint(hit);

    afterPaint(()=>{
      if(epoch!==navigationEpoch) return;
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
        deferred_render:true,
        total_ms:Math.max(0,Math.round((finished-started)*10)/10),
        at:new Date().toISOString(),
      };
    });
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
    const top=document.elementFromPoint(touch.clientX,touch.clientY);
    if(!(top===node||node.contains(top))) return;
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

  window.__dabbirNavigationEventBridge={
    version:'navigation-event-bridge-v2-instant-paint',
    delegated_click:true,
    webkit_touch_fallback:true,
    safe_screen_fallback:true,
    visual_first:true,
    deferred_render:true,
  };
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('x-dabbir-navigation-event-bridge','v2-instant-paint');
  return res.status(200).send(script);
}
