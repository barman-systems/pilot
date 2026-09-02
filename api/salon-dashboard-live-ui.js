const script=String.raw`(()=>{
  if(window.__dabbirSalonDashboardLive)return;
  const q=s=>document.querySelector(s);
  const isSalon=()=>String(workspace?.business?.business_type||'').toLowerCase()==='salon';
  const activeSurface=()=>['screen-dashboard','screen-appointments','screen-salon-team','screen-salon-services','screen-salon-reports','screen-salon-reminders'].some(id=>q('#'+id)?.classList.contains('active'));
  const copy=()=>document.documentElement.lang==='en'?{refresh:'Refresh',refreshing:'Refreshing…'}:{refresh:'تحديث',refreshing:'جارٍ التحديث…'};
  const STALE_MS=8000;
  let refreshing=false,lastRefresh=0,lastHiddenAt=0;

  function ensureRefreshButton(){
    if(!isSalon())return;
    const toolbar=q('#salonToday .salonToolbar');
    if(!toolbar)return;
    let button=toolbar.querySelector('[data-salon-live-refresh]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='salonBtn';
      button.dataset.salonLiveRefresh='1';
      button.addEventListener('click',()=>void refresh(true,button));
      toolbar.append(button);
    }
    if(!refreshing)button.textContent=copy().refresh;
  }

  async function refresh(force=false,button=null){
    if(!isSalon()||document.hidden||refreshing)return false;
    const salon=window.__dabbirSalonMode;
    if(!salon?.refresh)return false;
    const now=Date.now();
    if(!force&&now-lastRefresh<STALE_MS){ensureRefreshButton();return false}
    refreshing=true;
    const target=button||q('[data-salon-live-refresh]');
    if(target){target.disabled=true;target.textContent=copy().refreshing}
    try{
      await salon.refresh();
      lastRefresh=Date.now();
      return true;
    }catch(error){
      console.error('dabbir_salon_dashboard_refresh_failed',error);
      return false;
    }finally{
      refreshing=false;
      if(target){target.disabled=false;target.textContent=copy().refresh}
      setTimeout(ensureRefreshButton,0);
    }
  }

  function refreshActive(force=false){
    ensureRefreshButton();
    if(activeSurface())void refresh(force);
  }

  try{
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const result=baseShowScreen.apply(this,arguments);
      if(isSalon()&&['dashboard','appointments','salon-team','salon-services','salon-reports','salon-reminders'].includes(String(name||'')))setTimeout(()=>refreshActive(true),0);
      return result;
    };
  }catch{}

  try{
    const baseRenderAll=renderAll;
    renderAll=function(){
      const result=baseRenderAll.apply(this,arguments);
      if(isSalon())setTimeout(()=>refreshActive(false),0);
      return result;
    };
  }catch{}

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){lastHiddenAt=Date.now();return}
    refreshActive(Date.now()-lastHiddenAt>3000);
  });
  window.addEventListener('focus',()=>refreshActive(false));
  window.addEventListener('online',()=>refreshActive(true));
  setTimeout(()=>refreshActive(true),1100);

  window.__dabbirSalonDashboardLive={refresh:()=>refresh(true),version:'v1-event-scoped'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=60');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-salon-dashboard-live-ui','v1-event-scoped');
  return res.status(200).send(script);
}
