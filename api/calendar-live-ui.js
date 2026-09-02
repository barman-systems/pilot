import activityProfileHandler from './activity-profile-ui.js';
import appointmentManagementUiHandler from './appointment-management-ui.js';
import salonModeUiHandler from './salon-mode-ui.js';
import clinicModeUiHandler from './clinic-mode-ui.js';
import businessActivityProfileUiHandler from './business-activity-profile-ui.js';

const liveScript=String.raw`(()=>{
  if(window.__dabbirCalendarLiveUi)return;
  const q=s=>document.querySelector(s);
  const PASSIVE_CACHE_MS=60*1000;
  const AUTH_BACKOFF_MS=60*1000;
  let busy=false,lastBusiness=null,lastSyncAt=0,lastBusy=[],lastBusyLoadAt=0;
  let lastConnectionState=null,lastConnectionCheckAt=0,connectionBlockedUntil=0,connectionBlockedError='';
  let syncInFlight=null,forceQueued=false,passiveSyncTimer=null;
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const businessId=()=>{try{return workspace?.business?.id||null}catch{return null}};
  const screenActive=()=>q('#screen-appointments')?.classList.contains('active');
  const fmt=value=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return String(value||'')}};

  const style=document.createElement('style');
  style.textContent='.dabbirExternalBusy{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}.dabbirExternalBusy h4{font-size:10px;margin:0 0 7px}.dabbirExternalBusyList{display:grid;gap:5px}.dabbirExternalBusyRow{display:flex;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:9px;padding:7px 8px;font-size:8px}.dabbirExternalBusyRow b{font-size:9px}.dabbirExternalBusyRow span{margin-inline-start:auto;color:var(--muted);white-space:nowrap}.dabbirSyncBtn{border:1px solid #414d2a;background:#252c1d;color:#fff;border-radius:9px;padding:6px 9px;min-height:36px;font-size:9px;font-weight:850}.dabbirSyncBtn:disabled{opacity:.55}';
  document.head.append(style);

  function removeCancelledFromActiveCalendar(){
    const screen=q('#screen-appointments');if(!screen)return;
    screen.querySelectorAll('.dabbirCalEvent.cancelled').forEach(node=>node.remove());
    screen.querySelectorAll('.dabbirAgendaEvent').forEach(node=>{
      const text=String(node.textContent||'').toLowerCase();
      if(text.includes('ملغي')||text.includes('cancelled')||text.includes('canceled'))node.remove();
    });
  }

  function ensureUi(){
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
    panel.innerHTML='<h4>'+(ar()?'الأوقات المشغولة من Google / Outlook':'Busy time from Google / Outlook')+'</h4>'+(rows.length?'<div class="dabbirExternalBusyList">'+rows.map(row=>'<div class="dabbirExternalBusyRow"><b>'+esc(row.summary||(ar()?'مشغول':'Busy'))+'</b><span>'+esc(fmt(row.starts_at))+'</span></div>').join('')+'</div>':'<div style="font-size:8px;color:var(--muted)">'+(ar()?'لا توجد أوقات خارجية مشغولة قادمة.':'No upcoming external busy time.')+'</div>');
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
    const id=businessId();if(!id)return;ensureUi();if(id!==lastBusiness)resetPassiveState(id);
    try{
      const connections=await connectionState(id,force),active=(connections.connections||[]).filter(c=>c.status==='active'&&c.sync_enabled!==false);
      if(!active.length){lastBusy=[];lastBusyLoadAt=Date.now();renderBusy();removeCancelledFromActiveCalendar();return}
      const due=force||Date.now()-lastSyncAt>5*60*1000;
      if(due){busy=true;ensureUi();const response=await fetch('/api/calendar-sync',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id})});const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw httpError(response,body,'CALENDAR_SYNC_FAILED');lastSyncAt=Date.now();lastBusyLoadAt=0;try{window.__dabbirActivityProfile?.refresh?.()}catch{}}
      await loadBusy(id,due||force);removeCancelledFromActiveCalendar();if(force)try{toast(ar()?'تمت مزامنة التقويم':'Calendar synced')}catch{}
    }catch(error){const status=Number(error?.status||0);if(force||status>=500||status===0)console.error('dabbir_calendar_live_ui_failed',String(error?.message||error).slice(0,120));if(force)try{toast(ar()?'تعذرت مزامنة التقويم':'Calendar sync failed')}catch{}}
    finally{busy=false;ensureUi();removeCancelledFromActiveCalendar()}
  }
  async function sync(force=false){if(!businessId())return;if(syncInFlight){if(force)forceQueued=true;return syncInFlight}const request=runSync(force);syncInFlight=request;try{return await request}finally{if(syncInFlight===request)syncInFlight=null;if(forceQueued){forceQueued=false;setTimeout(()=>sync(true),0)}}}
  function schedulePassiveSync(){if(passiveSyncTimer)return;passiveSyncTimer=setTimeout(()=>{passiveSyncTimer=null;if(screenActive()&&businessId()){ensureUi();void sync(false)}},150)}

  const observer=new MutationObserver(schedulePassiveSync);
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  const calendarScreen=q('#screen-appointments');
  if(calendarScreen){const calendarObserver=new MutationObserver(()=>setTimeout(removeCancelledFromActiveCalendar,0));calendarObserver.observe(calendarScreen,{subtree:true,childList:true})}
  setInterval(()=>{if(screenActive()&&businessId()){removeCancelledFromActiveCalendar();void sync(false)}},60000);
  setTimeout(()=>{if(screenActive()&&businessId()){removeCancelledFromActiveCalendar();void sync(false)}},1200);
  window.__dabbirCalendarLiveUi={sync:()=>sync(true),refreshBusy:()=>businessId()?loadBusy(businessId(),true):Promise.resolve(),sanitize:removeCancelledFromActiveCalendar,version:'calendar-live-v5-request-coalescing'};
})();`;

function captureResponse(){return {statusCode:200,headers:{},body:'',status(code){this.statusCode=Number(code||200);return this},setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},end(body=''){this.body=String(body);return this},send(body=''){this.body=String(body);return this}}}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  const activityCaptured=captureResponse(),managementCaptured=captureResponse(),salonCaptured=captureResponse(),clinicCaptured=captureResponse(),businessActivityCaptured=captureResponse();
  await activityProfileHandler(req,activityCaptured);await appointmentManagementUiHandler(req,managementCaptured);await salonModeUiHandler(req,salonCaptured);await clinicModeUiHandler(req,clinicCaptured);await businessActivityProfileUiHandler(req,businessActivityCaptured);
  if(activityCaptured.statusCode!==200||!activityCaptured.body)return res.status(500).end('Activity profile UI unavailable');
  if(managementCaptured.statusCode!==200||!managementCaptured.body)return res.status(500).end('Appointment management UI unavailable');
  if(salonCaptured.statusCode!==200||!salonCaptured.body)return res.status(500).end('Salon Mode UI unavailable');
  if(clinicCaptured.statusCode!==200||!clinicCaptured.body)return res.status(500).end('Clinic Mode UI unavailable');
  if(businessActivityCaptured.statusCode!==200||!businessActivityCaptured.body)return res.status(500).end('Business activity profile UI unavailable');
  res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','public, max-age=300');res.setHeader('x-dabbir-calendar-live-ui','v8-request-coalescing');
  return res.status(200).send(activityCaptured.body+'\n'+liveScript+'\n'+managementCaptured.body+'\n'+salonCaptured.body+'\n'+clinicCaptured.body+'\n'+businessActivityCaptured.body);
}
