const script=String.raw`(()=>{
  if(window.__dabbirAppointmentManagementUi)return;
  window.__dabbirAppointmentManagementUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const ws=()=>{try{return typeof workspace!=='undefined'?workspace:null}catch{return null}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    title:'إدارة الحجوزات',desc:'يمكنك تعديل موعد العميل أو حذفه. أي تغيير يُحفظ في دبّر ويُزامن مع التقويم المرتبط.',
    customer:'العميل',time:'الموعد',status:'الحالة',edit:'تعديل',del:'حذف',save:'حفظ التعديل',cancel:'إلغاء',
    editTitle:'تعديل الموعد',deleteTitle:'حذف الموعد؟',deleteBody:'سيتم حذف الموعد من دبّر ومن التقويمات المرتبطة إن وُجدت.',
    requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',
    saved:'تم تعديل الموعد.',deleted:'تم حذف الموعد.',deletePending:'تم إلغاء الموعد، لكن حذف التقويم الخارجي يحتاج إعادة مزامنة.',
    failed:'تعذر إكمال العملية.',past:'لا يمكن تعديل موعد مضى وقته.',empty:'لا توجد حجوزات لإدارتها.',
    calendar:'التقويم',day:'يومي',week:'أسبوعي',month:'شهري',today:'اليوم',previous:'السابق',next:'التالي',noBookings:'لا توجد حجوزات في هذه الفترة',more:'أخرى'
  }:{
    title:'Manage bookings',desc:'Edit or delete a customer booking. Changes are saved in DABBIR and synced to connected calendars.',
    customer:'Customer',time:'Booking',status:'Status',edit:'Edit',del:'Delete',save:'Save changes',cancel:'Cancel',
    editTitle:'Edit booking',deleteTitle:'Delete booking?',deleteBody:'The booking will be removed from DABBIR and connected calendars when available.',
    requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',
    saved:'Booking updated.',deleted:'Booking deleted.',deletePending:'Booking was cancelled, but the external calendar delete still needs reconciliation.',
    failed:'Could not complete the action.',past:'Past bookings cannot be rescheduled.',empty:'No bookings to manage.',
    calendar:'Calendar',day:'Day',week:'Week',month:'Month',today:'Today',previous:'Previous',next:'Next',noBookings:'No bookings in this period',more:'more'
  };

  const style=document.createElement('style');
  style.textContent='.dabbirApptManage{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirApptManageHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.dabbirApptManageHead h3{font-size:13px;margin:0 0 4px}.dabbirApptManageHead p{font-size:9px;color:var(--muted);margin:0;line-height:1.55}.dabbirApptManageList{display:grid;gap:7px}.dabbirApptManageRow{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(135px,1fr) 90px auto;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:11px;padding:9px}.dabbirApptManageRow b{font-size:10px}.dabbirApptManageRow span{font-size:9px;color:var(--muted)}.dabbirApptManageActions{display:flex;gap:6px;justify-content:flex-end}.dabbirApptManageActions button{min-height:34px;border-radius:9px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirApptEdit{border:1px solid #414d2a;background:#252c1d;color:#fff}.dabbirApptDelete{border:1px solid #5b2b2b;background:#32191a;color:#ffb9b9}.dabbirApptEdit:disabled{opacity:.45}.dabbirApptEmpty{border:1px dashed #31363c;border-radius:11px;padding:16px;text-align:center;color:var(--muted);font-size:9px}.dabbirApptModal{position:fixed;inset:0;z-index:90;background:#000b;display:none;align-items:center;justify-content:center;padding:18px}.dabbirApptModal.open{display:flex}.dabbirApptModalBox{width:min(430px,100%);background:#131518;border:1px solid #343940;border-radius:18px;padding:16px}.dabbirApptModalBox h3{margin:0 0 10px;font-size:14px}.dabbirApptField{display:grid;gap:5px;margin-top:9px}.dabbirApptField label{font-size:9px;color:var(--muted)}.dabbirApptField input,.dabbirApptField select{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:9px;min-height:42px}.dabbirApptModalActions{display:flex;gap:7px;justify-content:flex-end;margin-top:13px}.dabbirApptModalActions button{border-radius:10px;padding:8px 11px;font-weight:850}.dabbirApptModalActions .save{border:0;background:var(--accent);color:#10130b}.dabbirApptModalActions .cancel{border:1px solid var(--line);background:#181b1f;color:#fff}.dabbirGenericCalendar{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirGenericCalendar[hidden]{display:none}.dabbirGenericCalendarHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dabbirGenericCalendarTitle{font-size:13px;font-weight:900}.dabbirGenericCalendarControls,.dabbirGenericCalendarViews{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.dabbirGenericCalendar button{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;min-height:36px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirGenericCalendar button.on{background:var(--accent);color:#10130b;border-color:transparent}.dabbirGenericRange{font-size:9px;color:var(--muted);font-weight:800}.dabbirGenericDay{display:grid;gap:8px}.dabbirGenericTimelineRow{display:grid;grid-template-columns:74px 1fr;gap:8px;align-items:start}.dabbirGenericTimelineTime{font-size:9px;color:var(--muted);padding-top:10px}.dabbirGenericEvent{width:100%;border:1px solid #415d76!important;background:#142c43!important;color:#eaf5ff!important;text-align:start;border-radius:10px!important;padding:9px!important;min-height:48px!important}.dabbirGenericEvent.completed{border-color:#366346!important;background:#17311f!important}.dabbirGenericEvent.cancelled{border-color:#6a3434!important;background:#34191b!important}.dabbirGenericEvent b{display:block;font-size:10px}.dabbirGenericEvent small{display:block;margin-top:4px;opacity:.8;font-size:8px}.dabbirGenericWeek{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:6px;min-width:1050px}.dabbirGenericWeekWrap,.dabbirGenericMonthWrap{overflow:auto}.dabbirGenericWeekDay{border:1px solid #292f34;background:#15181b;border-radius:11px;padding:7px;min-height:160px}.dabbirGenericWeekHead{font-size:9px;font-weight:900;margin-bottom:7px}.dabbirGenericWeekEvents{display:grid;gap:5px}.dabbirGenericWeekEvents .dabbirGenericEvent{min-height:42px!important;padding:7px!important}.dabbirGenericMonth{display:grid;grid-template-columns:repeat(7,minmax(105px,1fr));gap:5px;min-width:735px}.dabbirGenericMonthDay{border:1px solid #292f34;background:#15181b;border-radius:10px;min-height:105px;padding:6px}.dabbirGenericMonthDay.out{opacity:.42}.dabbirGenericMonthDay.today{border-color:var(--accent)}.dabbirGenericMonthDate{font-size:9px;font-weight:900;margin-bottom:4px}.dabbirGenericMonthEvent{display:block;width:100%;border:0!important;background:#142c43!important;color:#fff!important;border-radius:6px!important;min-height:0!important;padding:4px!important;margin-top:3px;text-align:start;font-size:8px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dabbirGenericEmpty{border:1px dashed #31363c;border-radius:11px;padding:18px;text-align:center;color:var(--muted);font-size:9px}@media(max-width:700px){.dabbirApptManageRow{grid-template-columns:1fr}.dabbirApptManageActions{justify-content:stretch}.dabbirApptManageActions button{flex:1}.dabbirApptManageHead{display:block}.dabbirGenericCalendarHead{align-items:flex-start}.dabbirGenericTimelineRow{grid-template-columns:58px 1fr}}';
  document.head.append(style);

  let signature='',editingId=null,busy=false,editingBusiness=null,editingBranch=null,openEpoch=0,returnFocus=null;
  let calendarView=localStorage.getItem('dabbir_generic_calendar_view')||'week';
  if(!['day','week','month'].includes(calendarView))calendarView='week';
  let calendarCursor=new Date();
  function customerName(id){
    const row=(ws()?.customers||[]).find(x=>x.id===id);
    return row?.display_name||(ar()?'عميل':'Customer');
  }
  function fmt(value){
    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value||'')}
  }
  function statusLabel(status){
    const c=copy(),s=String(status||'requested').toLowerCase();
    return c[s]||s;
  }
  function dubaiLocalMinute(date=new Date()){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function isoFromDubaiLocal(value){
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return null;
    const d=new Date(raw+':00+04:00');
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  function businessType(){return String(ws()?.business?.business_type||'').toLowerCase()}
  function genericCalendarEnabled(){return !['store','creator','real_estate','salon'].includes(businessType())}
  function calendarDayKey(value){const raw=dubaiLocalMinute(value instanceof Date?value:new Date(value));return raw.slice(0,10)}
  function calendarWallDate(value){const key=calendarDayKey(value);const d=new Date(key+'T12:00:00');return Number.isNaN(d.getTime())?new Date(value):d}
  function startDay(value){const d=calendarWallDate(value);d.setHours(12,0,0,0);return d}
  function addDays(value,n){const d=new Date(value);d.setDate(d.getDate()+n);return d}
  function startWeek(value){const d=startDay(value),dow=(d.getDay()+6)%7;return addDays(d,-dow)}
  function startMonth(value){const d=startDay(value);d.setDate(1);return d}
  function sameDay(a,b){return calendarDayKey(a)===calendarDayKey(b)}
  function dayLabel(value,weekday=true){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{weekday:weekday?'short':undefined,month:'short',day:'numeric'}).format(value)}catch{return calendarDayKey(value)}}
  function monthLabel(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{month:'long',year:'numeric'}).format(value)}catch{return calendarDayKey(value).slice(0,7)}}
  function timeLabel(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
  function activeRows(){return [...(ws()?.appointments||[])].filter(a=>a?.id&&a?.starts_at&&!['cancelled','canceled'].includes(String(a.status||'').toLowerCase())).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}
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
  function renderMonthCalendar(rows){const c=copy(),month=startMonth(calendarCursor),gridStart=startWeek(month),todayKey=calendarDayKey(new Date());const cells=Array.from({length:42},(_,i)=>addDays(gridStart,i));return '<div class="dabbirGenericMonthWrap"><div class="dabbirGenericMonth">'+cells.map(day=>{const key=calendarDayKey(day),dayRows=rows.filter(a=>calendarDayKey(a.starts_at)===key),outside=day.getMonth()!==month.getMonth(),shown=dayRows.slice(0,3),more=Math.max(0,dayRows.length-shown.length);return '<div class="dabbirGenericMonthDay'+(outside?' out':'')+(key===todayKey?' today':'')+'"><div class="dabbirGenericMonthDate">'+esc(String(day.getDate()))+'</div>'+shown.map(a=>eventButton(a,true)).join('')+(more?'<div class="dabbirGenericRange">+'+more+' '+esc(c.more)+'</div>':'')+'</div>'}).join('')+'</div></div>'}
  function calendarRangeLabel(){if(calendarView==='day')return dayLabel(calendarCursor);if(calendarView==='month')return monthLabel(calendarCursor);const start=startWeek(calendarCursor),end=addDays(start,6);return dayLabel(start,false)+' – '+dayLabel(end,false)}
  function moveCalendar(delta){if(calendarView==='day')calendarCursor=addDays(calendarCursor,delta);else if(calendarView==='week')calendarCursor=addDays(calendarCursor,delta*7);else{const d=startDay(calendarCursor);d.setMonth(d.getMonth()+delta,1);calendarCursor=d}signature='';render()}
  function renderCalendar(rows){
    const panel=ensureCalendar();if(!panel)return;
    const enabled=genericCalendarEnabled();panel.hidden=!enabled;
    const table=q('#appointmentsTable');if(table)table.style.display=enabled?'none':'';
    if(!enabled)return;
    const c=copy();
    const body=calendarView==='day'?renderDayCalendar(rows):(calendarView==='month'?renderMonthCalendar(rows):renderWeekCalendar(rows));
    panel.innerHTML='<div class="dabbirGenericCalendarHead"><div><div class="dabbirGenericCalendarTitle">'+esc(c.calendar)+'</div><div class="dabbirGenericRange">'+esc(calendarRangeLabel())+'</div></div><div class="dabbirGenericCalendarViews"><button type="button" data-calendar-view="day" class="'+(calendarView==='day'?'on':'')+'">'+esc(c.day)+'</button><button type="button" data-calendar-view="week" class="'+(calendarView==='week'?'on':'')+'">'+esc(c.week)+'</button><button type="button" data-calendar-view="month" class="'+(calendarView==='month'?'on':'')+'">'+esc(c.month)+'</button></div><div class="dabbirGenericCalendarControls"><button type="button" data-calendar-nav="prev" aria-label="'+esc(c.previous)+'">‹</button><button type="button" data-calendar-nav="today">'+esc(c.today)+'</button><button type="button" data-calendar-nav="next" aria-label="'+esc(c.next)+'">›</button></div></div>'+body;
    panel.querySelectorAll('[data-calendar-view]').forEach(btn=>btn.onclick=()=>{calendarView=btn.dataset.calendarView;localStorage.setItem('dabbir_generic_calendar_view',calendarView);signature='';render()});
    panel.querySelector('[data-calendar-nav="prev"]')?.addEventListener('click',()=>moveCalendar(-1));
    panel.querySelector('[data-calendar-nav="next"]')?.addEventListener('click',()=>moveCalendar(1));
    panel.querySelector('[data-calendar-nav="today"]')?.addEventListener('click',()=>{calendarCursor=new Date();signature='';render()});
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
    modal=document.createElement('div');modal.id='dabbirApptEditModal';modal.className='dabbirApptModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',copy().editTitle);
    document.body.append(modal);return modal;
  }
  function render(){
    const w=ws();if(!w?.business)return;
    const panel=ensurePanel();if(!panel)return;
    const rows=[...(w.appointments||[])].filter(a=>a?.id&&a?.starts_at).sort((a,b)=>{
      const an=new Date(a.starts_at).getTime(),bn=new Date(b.starts_at).getTime(),now=Date.now();
      const af=an>=now,bf=bn>=now;if(af!==bf)return af?-1:1;return af?an-bn:bn-an;
    });
    const nextSig=(ar()?'ar':'en')+'|'+calendarView+'|'+calendarDayKey(calendarCursor)+'|'+businessType()+'|'+rows.map(a=>[a.id,a.starts_at,a.status].join(':')).join('|');
    if(nextSig===signature&&panel.dataset.ready==='1')return;
    signature=nextSig;panel.dataset.ready='1';
    renderCalendar(activeRows());
    const c=copy();
    panel.innerHTML='<div class="dabbirApptManageHead"><div><h3>'+esc(c.title)+'</h3><p>'+esc(c.desc)+'</p></div></div><div class="dabbirApptManageList">'+(rows.length?rows.map(a=>{
      const future=new Date(a.starts_at).getTime()>=Date.now();
      return '<div class="dabbirApptManageRow" data-appt-row="'+esc(a.id)+'"><b>'+esc(customerName(a.customer_id))+'</b><span>'+esc(fmt(a.starts_at))+'</span><span>'+esc(statusLabel(a.status))+'</span><div class="dabbirApptManageActions"><button type="button" class="dabbirApptEdit" data-appt-edit="'+esc(a.id)+'" '+(future?'':'disabled title="'+esc(c.past)+'"')+'>'+esc(c.edit)+'</button><button type="button" class="dabbirApptDelete" data-appt-delete="'+esc(a.id)+'">'+esc(c.del)+'</button></div></div>';
    }).join(''):'<div class="dabbirApptEmpty">'+esc(c.empty)+'</div>')+'</div>';
    panel.querySelectorAll('[data-appt-edit]').forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.apptEdit));
    panel.querySelectorAll('[data-appt-delete]').forEach(btn=>btn.onclick=()=>removeAppointment(btn.dataset.apptDelete));
  }
  function openEdit(id,record=null,readOnly=false){
    const w=ws(),a=record||(w?.appointments||[]).find(x=>x.id===id);if(!a)return;
    editingBusiness=w.business.id;editingBranch=w?.branch_scope?.branch_id||w?.branch_scope?.mode||'';returnFocus=document.activeElement;
    if(new Date(a.starts_at).getTime()<Date.now())readOnly=true;
    editingId=id;const c=copy(),modal=ensureModal();
    modal.innerHTML='<form class="dabbirApptModalBox" id="dabbirApptEditForm"><h3>'+esc(c.editTitle)+'</h3><div class="dabbirApptField"><label>'+esc(c.customer)+'</label><input value="'+esc(customerName(a.customer_id))+'" disabled></div><div class="dabbirApptField"><label>'+esc(c.time)+'</label><input id="dabbirApptEditTime" type="datetime-local" min="'+esc(dubaiLocalMinute(new Date(Date.now()+60000)))+'" value="'+esc(dubaiLocalMinute(new Date(a.starts_at)))+'" required></div><div class="dabbirApptField"><label>'+esc(c.status)+'</label><select id="dabbirApptEditStatus"><option value="requested" '+(a.status==='requested'?'selected':'')+'>'+esc(c.requested)+'</option><option value="confirmed" '+(a.status==='confirmed'?'selected':'')+'>'+esc(c.confirmed)+'</option><option value="rescheduled" '+(a.status==='rescheduled'?'selected':'')+'>'+esc(c.rescheduled)+'</option><option value="completed" '+(a.status==='completed'?'selected':'')+'>'+esc(c.completed)+'</option><option value="cancelled" '+(a.status==='cancelled'?'selected':'')+'>'+esc(c.cancelled)+'</option></select></div><div class="dabbirApptModalActions"><button type="button" class="cancel" id="dabbirApptEditCancel">'+esc(c.cancel)+'</button><button type="submit" class="save">'+esc(c.save)+'</button></div></form>';
    q('#dabbirApptEditCancel').onclick=closeModal;
    q('#dabbirApptEditForm').onsubmit=readOnly?e=>e.preventDefault():saveEdit;
    if(readOnly){modal.querySelectorAll('input,select,button[type="submit"]').forEach(n=>n.disabled=true)}
    modal.onclick=e=>{if(e.target===modal)closeModal()};
    modal.classList.add('open');history.pushState({...history.state,dabbirAppointmentDetail:true},'');setTimeout(()=>q('#dabbirApptEditModal button:not(:disabled)')?.focus(),0);
  }
  function closeModal(discardHistory=false){const ownsEntry=history.state?.dabbirAppointmentDetail;openEpoch++;const modal=q('#dabbirApptEditModal');modal?.classList.remove('open');editingId=null;editingBusiness=null;returnFocus?.focus?.();if(ownsEntry){if(discardHistory===true){const state={...history.state};delete state.dabbirAppointmentDetail;history.replaceState(state,'')}else history.back()}}
  async function request(body){
    const response=await fetch('/api/appointment-management',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));return {response,data};
  }
  async function refresh(){
    const w=ws();if(!w?.business?.id)return;
    signature='';
    try{if(typeof loadRuntime==='function')await loadRuntime(w.business.id,typeof selectedConversationId!=='undefined'?selectedConversationId:null)}catch{}
    render();
    try{window.__dabbirCalendarLiveUi?.refreshBusy?.()}catch{}
  }
  async function saveEdit(event){
    event.preventDefault();if(busy||!editingId)return;
    const w=ws(),start=isoFromDubaiLocal(q('#dabbirApptEditTime')?.value),status=q('#dabbirApptEditStatus')?.value;
    if(!w?.business?.id||!start||w.business.id!==editingBusiness||(w?.branch_scope?.branch_id||w?.branch_scope?.mode||'')!==editingBranch){closeModal(true);return}
    if(new Date(start).getTime()<Date.now()){try{toast(copy().past)}catch{};return}
    busy=true;const submit=event.submitter;if(submit)submit.disabled=true;
    try{
      const capturedBusiness=w.business.id,capturedBranch=editingBranch;
      const {response,data}=await request({action:'update',business_id:capturedBusiness,branch_id:capturedBranch||undefined,appointment_id:editingId,starts_at:start,status});
      if(ws()?.business?.id!==capturedBusiness||(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')!==capturedBranch)return;
      if(!response.ok||!data.ok)throw new Error(data.error||copy().failed);
      closeModal();try{toast(copy().saved)}catch{};await refresh();
    }catch(error){try{toast(copy().failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false;if(submit)submit.disabled=false}
  }
  async function removeAppointment(id){
    if(busy)return;const w=ws();if(!w?.business?.id)return;const c=copy();
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:c.deleteTitle,body:c.deleteBody}):window.confirm(c.deleteTitle+'\n'+c.deleteBody);
    if(!confirmed||ws()?.business?.id!==w.business.id||(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')!==(w?.branch_scope?.branch_id||w?.branch_scope?.mode||''))return;
    busy=true;
    try{
      const {response,data}=await request({action:'delete',business_id:w.business.id,branch_id:w?.branch_scope?.branch_id||w?.branch_scope?.mode||undefined,appointment_id:id});
      if(ws()?.business?.id!==w.business.id||(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')!==(w?.branch_scope?.branch_id||w?.branch_scope?.mode||''))return;
      if(response.ok&&data.ok){try{toast(c.deleted)}catch{};await refresh();return}
      if(data.state==='CANCELLED_PENDING_EXTERNAL_DELETE'){try{toast(c.deletePending)}catch{};await refresh();return}
      throw new Error(data.error||c.failed);
    }catch(error){try{toast(c.failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false}
  }

  const observer=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(q('#screen-appointments')?.classList.contains('active'))render()},1500);
  window.addEventListener('popstate',()=>{if(q('#dabbirApptEditModal.open'))closeModal()});
  document.addEventListener('keydown',e=>{const modal=q('#dabbirApptEditModal.open');if(!modal)return;if(e.key==='Escape'){e.preventDefault();history.back()}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
  setTimeout(render,500);
  async function openRecord(id){
    const w=ws(),businessId=w?.business?.id;if(!businessId)return;
    const epoch=++openEpoch,branch=w?.branch_scope?.branch_id||w?.branch_scope?.mode||'';
    try{
      const params=new URLSearchParams({business_id:businessId,appointment_id:id});if(branch)params.set('branch_id',branch);
      const response=await fetch('/api/appointment-management?'+params,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if(epoch!==openEpoch||ws()?.business?.id!==businessId||(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')!==branch)return;
      if(!response.ok||!data.ok)throw new Error(response.status===404?(ar()?'الموعد غير متاح.':'Appointment unavailable.'):response.status===403?(ar()?'لا تملك صلاحية هذا الموعد.':'You do not have access to this appointment.'):copy().failed);
      if(data.appointment?.id!==id||data.appointment?.business_id!==businessId)throw new Error(copy().failed);
      openEdit(id,data.appointment,!data.can_manage);
    }catch(error){if(epoch===openEpoch&&ws()?.business?.id===businessId&&(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')===branch){try{toast(String(error.message||copy().failed))}catch{}}}
  }
  window.__dabbirUiLifecycle?.on?.('afterRender','appointment-record-scope',()=>{if(editingBusiness&&(editingBusiness!==ws()?.business?.id||editingBranch!==(ws()?.branch_scope?.branch_id||ws()?.branch_scope?.mode||'')))closeModal(true)});
  window.__dabbirAppointmentManagement={render,openRecord,closeModal,version:'appointment-management-v3-direct-record'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-appointment-management-ui','v2-generic-calendar');
  return res.status(200).send(script);
}