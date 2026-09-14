import { bookingBrowser } from './_booking-lifecycle.js';
const script=String.raw`(()=>{
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



  function businessId(){return workspace?.business?.id||null}
  function setText(selector,value){const el=q(selector);if(el&&value!==undefined&&value!==null)el.textContent=value}
  function setLabel(screen,value){qa('[data-screen="'+screen+'"] [data-label]').forEach(el=>{if(value)el.textContent=value})}
  function businessTimezone(){return lifecycle.timezone(workspace?.business)}
  function dayKey(value){return lifecycle.dayKey(value,workspace?.business)}
  function startOfWeek(value){return lifecycle.wallDate(lifecycle.period({view:'week',day:lifecycle.wallKey(value)}).from)}
  function plusDays(value,days){return lifecycle.wallDate(lifecycle.addDays(lifecycle.wallKey(value),days))}
  function fmtTime(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
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
    return '<div class="dabbirProvider"><div class="dabbirProviderTop"><div><b>'+esc(title)+'</b>'+account+'</div>'+badge+'</div><div data-ui-part="activity-profile-ui-detail-1">'+action+'</div></div>';
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
  ['dabbir:booking-view-changed','dabbir:booking-data-changed','dabbir:branch-scope-changed'].forEach(name=>window.addEventListener(name,renderCalendar));
  window.__dabbirActivityProfile={ownsCalendar:true,refresh:()=>load(true),refreshCalendar:()=>{renderCalendar();return loadCalendarConnections(true)},version:'activity-profile-v3-calendar'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-activity-profile-ui','v3-calendar');
  return res.status(200).send(bookingBrowser+'\n'+script);
}
