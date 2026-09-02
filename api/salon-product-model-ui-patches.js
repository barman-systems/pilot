const SALON_PRODUCT_MODEL_PATCHES=[
  {
    name:'salon-copy-ar-employee-owns-services',
    from:`appointmentDetails:'تفاصيل الموعد',serviceRequired:'أضيفي خدمة واربطيها بموظفة أولًا.',endOfDay:'ملخص اليوم'`,
    to:`appointmentDetails:'تفاصيل الموعد',employeeRequired:'أضيفي موظفة أولًا.',serviceCatalogRequired:'أضيفي خدمة أولًا.',employeeServicesRequired:'أسندي خدمة واحدة على الأقل للموظفة من شاشة الموظفات.',serviceRequired:'اختاري الموظفة أولًا لعرض الخدمات التي تقدمها.',endOfDay:'ملخص اليوم'`,
  },
  {
    name:'salon-copy-en-employee-owns-services',
    from:`appointmentDetails:'Appointment details',serviceRequired:'Add a service and assign it to an employee first.',endOfDay:'End-of-day summary'`,
    to:`appointmentDetails:'Appointment details',employeeRequired:'Add an employee first.',serviceCatalogRequired:'Add a service first.',employeeServicesRequired:'Assign at least one service to the employee from the Team screen.',serviceRequired:'Choose the employee first to show the services they provide.',endOfDay:'End-of-day summary'`,
  },
  {
    name:'salon-month-range-stays-within-api-bound',
    from:`    const from=plus(startDay(cursor),view==='month'?-10:view==='week'?-2:-2),to=plus(startDay(cursor),view==='month'?45:view==='week'?12:3);`,
    to:`    const monthStart=startWeek(new Date(cursor.getFullYear(),cursor.getMonth(),1));\n    const from=view==='month'?monthStart:plus(startDay(cursor),-2),to=view==='month'?plus(monthStart,42):plus(startDay(cursor),view==='week'?12:3);`,
  },
  {
    name:'salon-quick-book-readiness-is-explicit',
    from:`    if(!services.length||!workers.length){notify(t.serviceRequired);return}`,
    to:`    if(!workers.length){notify(t.employeeRequired);return}\n    if(!services.length){notify(t.serviceCatalogRequired);return}\n    if(!(data.worker_services||[]).some(x=>x.active&&workers.some(w=>w.id===x.worker_id)&&services.some(s=>s.id===x.service_id))){notify(t.employeeServicesRequired);return}`,
  },
  {
    name:'salon-quick-book-employee-before-service',
    from:`<div class="salonField"><label>'+esc(t.service)+'</label><select id="sqService" required><option value=""></option>'+services.map(s=>'<option value="'+esc(s.id)+'">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.employee)+'</label><select id="sqWorker" required><option value=""></option></select></div>`,
    to:`<div class="salonField"><label>'+esc(t.employee)+'</label><select id="sqWorker" required><option value=""></option>'+workers.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.display_name)+'</option>').join('')+'</select></div><div class="salonField"><label>'+esc(t.service)+'</label><select id="sqService" required><option value=""></option></select></div>`,
  },
  {
    name:'salon-quick-book-services-follow-employee',
    from:`    const syncWorkers=()=>{const sid=q('#sqService').value,allowed=new Set((data.worker_services||[]).filter(x=>x.service_id===sid&&x.active).map(x=>x.worker_id));q('#sqWorker').innerHTML='<option value=""></option>'+workers.filter(w=>allowed.has(w.id)).map(w=>'<option value="'+esc(w.id)+'">'+esc(w.display_name)+'</option>').join('')};q('#sqService').onchange=syncWorkers;`,
    to:`    const syncServices=()=>{const wid=q('#sqWorker').value,allowed=new Set((data.worker_services||[]).filter(x=>x.worker_id===wid&&x.active).map(x=>x.service_id));q('#sqService').innerHTML='<option value=""></option>'+services.filter(s=>allowed.has(s.id)).map(s=>'<option value="'+esc(s.id)+'">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('')};q('#sqWorker').onchange=syncServices;`,
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
