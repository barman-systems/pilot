const SALON_PRODUCT_MODEL_PATCHES=[
  {
    name:'salon-copy-ar-employee-owns-services',
    from:`appointmentDetails:'تفاصيل الموعد',serviceRequired:'أضيفي خدمة واربطيها بموظفة أولًا.',endOfDay:'ملخص اليوم'`,
    to:`appointmentDetails:'تفاصيل الموعد',employeeRequired:'أضيفي موظفة أولًا.',serviceCatalogRequired:'أضيفي خدمة أولًا.',employeeServicesRequired:'أسندي خدمة واحدة على الأقل للموظفة من شاشة الموظفات.',serviceRequired:'اختاري الموظفة أولًا لعرض الخدمات التي تقدمها.',unassigned:'غير مسند',endOfDay:'ملخص اليوم'`,
  },
  {
    name:'salon-copy-en-employee-owns-services',
    from:`appointmentDetails:'Appointment details',serviceRequired:'Add a service and assign it to an employee first.',endOfDay:'End-of-day summary'`,
    to:`appointmentDetails:'Appointment details',employeeRequired:'Add an employee first.',serviceCatalogRequired:'Add a service first.',employeeServicesRequired:'Assign at least one service to the employee from the Team screen.',serviceRequired:'Choose the employee first to show the services they provide.',unassigned:'Unassigned',endOfDay:'End-of-day summary'`,
  },
  {
    name:'salon-month-range-stays-within-api-bound',
    from:`    const from=plus(startDay(cursor),view==='month'?-10:view==='week'?-2:-2),to=plus(startDay(cursor),view==='month'?45:view==='week'?12:3);`,
    to:`    const monthStart=startWeek(new Date(cursor.getFullYear(),cursor.getMonth(),1));\n    const from=view==='month'?monthStart:plus(startDay(cursor),-2),to=view==='month'?plus(monthStart,42):plus(startDay(cursor),view==='week'?12:3);`,
  },
  {
    name:'salon-quick-book-has-no-setup-gate',
    from:`    if(!services.length||!workers.length){notify(t.serviceRequired);return}`,
    to:`    // Booking must remain available even before employees or services are configured.`,
  },
  {
    name:'salon-quick-book-employee-and-service-independent',
    from:`<div class="salonField"><label>'+esc(t.service)+'</label><select id="sqService" required><option value=""></option>'+services.map(s=>'<option value="'+esc(s.id)+'">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.employee)+'</label><select id="sqWorker" required><option value=""></option></select></div>`,
    to:`<div class="salonField"><label>'+esc(t.employee)+'</label><select id="sqWorker"><option value=""></option>'+workers.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.display_name)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.service)+'</label><select id="sqService"><option value=""></option>'+services.map(s=>'<option value="'+esc(s.id)+'">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('')+'</select></div>`,
  },
  {
    name:'salon-quick-book-removes-worker-service-dependency',
    from:`    const syncWorkers=()=>{const sid=q('#sqService').value,allowed=new Set((data.worker_services||[]).filter(x=>x.service_id===sid&&x.active).map(x=>x.worker_id));q('#sqWorker').innerHTML='<option value=""></option>'+workers.filter(w=>allowed.has(w.id)).map(w=>'<option value="'+esc(w.id)+'">'+esc(w.display_name)+'</option>').join('')};q('#sqService').onchange=syncWorkers;`,
    to:`    // Employee and service are optional and intentionally independent in quick booking.`,
  },
  {
    name:'salon-quick-book-name-optional',
    from:`<input id="sqName" maxlength="120" required>`,
    to:`<input id="sqName" maxlength="120">`,
  },
  {
    name:'salon-quick-book-phone-optional',
    from:`<input id="sqPhone" maxlength="30" required>`,
    to:`<input id="sqPhone" maxlength="30">`,
  },
  {
    name:'salon-quick-book-time-optional',
    from:`<input id="sqTime" type="datetime-local" required>`,
    to:`<input id="sqTime" type="datetime-local">`,
  },
  {
    name:'salon-quick-book-time-can-default-server-side',
    from:`starts_at:new Date(q('#sqTime').value).toISOString()`,
    to:`starts_at:q('#sqTime').value?new Date(q('#sqTime').value).toISOString():null`,
  },
  {
    name:'salon-day-calendar-shows-unassigned-bookings',
    from:`  function dayCalendar(){\n    const t=text(),workers=(data.workers||[]).filter(w=>w.status==='active'),rows=calendarRows().filter(a=>key(a.starts_at)===key(cursor));\n    if(!workers.length)return '<div class="empty">'+esc(t.addEmployee)+'</div>';\n    let html='<div class="salonCalendarScroll"><div class="salonDayGrid" style="grid-template-columns:72px repeat('+workers.length+',minmax(150px,1fr))"><div class="salonCorner">'+esc(t.time)+'</div>'+workers.map(w=>'<div class="salonWorkerHead">'+esc(w.display_name)+'</div>').join('');\n    for(let h=7;h<=21;h++)for(let m=0;m<60;m+=30){const stamp=new Date(cursor);stamp.setHours(h,m,0,0);const iso=stamp.toISOString();html+='<div class="salonTime">'+esc(fmt(stamp,{hour:'numeric',minute:'2-digit'}))+'</div>';for(const w of workers){const slot=rows.filter(a=>a.worker_id===w.id&&new Date(a.starts_at).getHours()===h&&new Date(a.starts_at).getMinutes()>=m&&new Date(a.starts_at).getMinutes()<m+30);html+='<div class="salonSlot" data-worker="'+esc(w.id)+'" data-time="'+esc(iso)+'">'+slot.map(eventHtml).join('')+'</div>'}}\n    return html+'</div></div>';\n  }`,
    to:`  function dayCalendar(){\n    const t=text(),activeWorkers=(data.workers||[]).filter(w=>w.status==='active'),rows=calendarRows().filter(a=>key(a.starts_at)===key(cursor)),hasUnassigned=rows.some(a=>!a.worker_id),workers=[...activeWorkers,...((hasUnassigned||!activeWorkers.length)?[{id:'',display_name:t.unassigned,unassigned:true}]:[])];\n    let html='<div class="salonCalendarScroll"><div class="salonDayGrid" style="grid-template-columns:72px repeat('+workers.length+',minmax(150px,1fr))"><div class="salonCorner">'+esc(t.time)+'</div>'+workers.map(w=>'<div class="salonWorkerHead">'+esc(w.display_name)+'</div>').join('');\n    for(let h=7;h<=21;h++)for(let m=0;m<60;m+=30){const stamp=new Date(cursor);stamp.setHours(h,m,0,0);const iso=stamp.toISOString();html+='<div class="salonTime">'+esc(fmt(stamp,{hour:'numeric',minute:'2-digit'}))+'</div>';for(const w of workers){const slot=rows.filter(a=>(w.unassigned?!a.worker_id:a.worker_id===w.id)&&new Date(a.starts_at).getHours()===h&&new Date(a.starts_at).getMinutes()>=m&&new Date(a.starts_at).getMinutes()<m+30),workerAttr=w.unassigned?'':' data-worker="'+esc(w.id)+'"';html+='<div class="salonSlot"'+workerAttr+' data-time="'+esc(iso)+'">'+slot.map(eventHtml).join('')+'</div>'}}\n    return html+'</div></div>';\n  }`,
  },
  {
    name:'salon-week-calendar-shows-unassigned-bookings',
    from:`  function weekCalendar(){const start=startWeek(cursor),workers=(data.workers||[]).filter(w=>w.status==='active'),rows=calendarRows();let html='<div class="salonCalendarScroll"><div class="salonWeek">';for(let i=0;i<7;i++){const d=plus(start,i),dayRows=rows.filter(a=>key(a.starts_at)===key(d));html+='<div class="salonWeekDay"><div class="salonWeekHead">'+esc(fmt(d,{weekday:'short',day:'numeric',month:'short'}))+'</div>'+workers.map(w=>'<div class="salonWeekWorker"><span>'+esc(w.display_name)+'</span>'+(dayRows.filter(a=>a.worker_id===w.id).map(eventHtml).join('')||'<div class="salonGap">'+esc(text().availableGap)+'</div>')+'</div>').join('')+'</div>'}return html+'</div></div>'}`,
    to:`  function weekCalendar(){const start=startWeek(cursor),workers=(data.workers||[]).filter(w=>w.status==='active'),rows=calendarRows(),t=text();let html='<div class="salonCalendarScroll"><div class="salonWeek">';for(let i=0;i<7;i++){const d=plus(start,i),dayRows=rows.filter(a=>key(a.starts_at)===key(d)),unassigned=dayRows.filter(a=>!a.worker_id);html+='<div class="salonWeekDay"><div class="salonWeekHead">'+esc(fmt(d,{weekday:'short',day:'numeric',month:'short'}))+'</div>'+workers.map(w=>'<div class="salonWeekWorker"><span>'+esc(w.display_name)+'</span>'+(dayRows.filter(a=>a.worker_id===w.id).map(eventHtml).join('')||'<div class="salonGap">'+esc(t.availableGap)+'</div>')+'</div>').join('')+((unassigned.length||!workers.length)?'<div class="salonWeekWorker"><span>'+esc(t.unassigned)+'</span>'+(unassigned.map(eventHtml).join('')||'<div class="salonGap">'+esc(t.availableGap)+'</div>')+'</div>':'')+'</div>'}return html+'</div></div>'}`,
  },
  {
    name:'salon-new-employee-can-select-services',
    from:`<div class="salonField"><label>'+esc(t.commissionValue)+'</label><input id="swCommission" type="number" min="0" value="0"></div></div><button class="salonBtn primary" type="submit">'+esc(t.addEmployee)+'</button>`,
    to:`<div class="salonField"><label>'+esc(t.commissionValue)+'</label><input id="swCommission" type="number" min="0" value="0"></div></div><div class="salonField"><label>'+esc(t.assignedServices)+'</label><div class="salonChecks" id="swServices">'+((data.services||[]).filter(s=>s.active).map(s=>'<label class="salonCheck"><input type="checkbox" data-new-worker-service="'+esc(s.id)+'"> '+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+'</label>').join('')||'<span class="muted">'+esc(t.serviceCatalogRequired)+'</span>')+'</div></div><button class="salonBtn primary" type="submit">'+esc(t.addEmployee)+'</button>`,
  },
  {
    name:'salon-new-employee-persists-selected-services',
    from:`q('#salonWorkerForm').onsubmit=async e=>{e.preventDefault();try{await post({action:'save_worker',display_name:q('#swName').value,phone_e164:q('#swPhone').value,job_title:q('#swTitle').value,commission_type:q('#swCommissionType').value,commission_value:q('#swCommission').value});notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}};`,
    to:`q('#salonWorkerForm').onsubmit=async e=>{e.preventDefault();try{const saved=await post({action:'save_worker',display_name:q('#swName').value,phone_e164:q('#swPhone').value,job_title:q('#swTitle').value,commission_type:q('#swCommissionType').value,commission_value:q('#swCommission').value}),workerId=saved.worker?.id;if(workerId)for(const input of qa('[data-new-worker-service]:checked'))await post({action:'assign_worker_service',worker_id:workerId,service_id:input.dataset.newWorkerService,active:true});notify(t.saved);await load(true)}catch(error){notify(t.failed+' · '+error.message)}};`,
  },
];

function applySalonProductModelPatches(source){
  let body=String(source||'');
  for(const patch of SALON_PRODUCT_MODEL_PATCHES){
    if(!body.includes(patch.from))throw new Error('DABBIR_SALON_PRODUCT_MODEL_PATTERN_DRIFT_'+patch.name);
    body=body.replace(patch.from,patch.to);
    if(body.includes(patch.from))throw new Error('DABBIR_SALON_PRODUCT_MODEL_PATCH_INCOMPLETE_'+patch.name);
  }
  return body;
}

export {SALON_PRODUCT_MODEL_PATCHES,applySalonProductModelPatches};
