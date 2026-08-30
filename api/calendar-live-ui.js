import activityProfileHandler from './activity-profile-ui.js';

const liveScript=String.raw`(()=>{
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
  window.__dabbirCalendarLiveUi={sync:()=>sync(true),refreshBusy:()=>businessId()?loadBusy(businessId()):Promise.resolve(),version:'calendar-live-v2-composite'};
})();`;

function captureResponse(){
  return {
    statusCode:200,headers:{},body:'',
    status(code){this.statusCode=Number(code||200);return this},
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    end(body=''){this.body=String(body);return this},
    send(body=''){this.body=String(body);return this},
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  const captured=captureResponse();
  await activityProfileHandler(req,captured);
  if(captured.statusCode!==200||!captured.body) return res.status(500).end('Activity profile UI unavailable');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-calendar-live-ui','v2-composite');
  return res.status(200).send(captured.body+'\n'+liveScript);
}
