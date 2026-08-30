const script=String.raw`(()=>{
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
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-activity-profile-ui','v3-calendar');
  return res.status(200).send(script);
}
