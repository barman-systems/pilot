const replacements=[
  {
    name:'salon-empty-state-ar',
    from:'أضيفي خدمة واربطيها بموظفة أولًا.',
    to:'أضيفي موظفة وحددي الخدمات التي تقدمها، ثم أنشئي الحجز.',
  },
  {
    name:'salon-empty-state-en',
    from:'Add a service and assign it to an employee first.',
    to:'Add an employee, assign the services they provide, then create the booking.',
  },
  {
    name:'salon-month-range',
    from:"    const from=plus(startDay(cursor),view==='month'?-10:view==='week'?-2:-2),to=plus(startDay(cursor),view==='month'?45:view==='week'?12:3);",
    to:"    const monthStart=startWeek(new Date(cursor.getFullYear(),cursor.getMonth(),1)),from=view==='month'?monthStart:plus(startDay(cursor),view==='week'?-2:-2),to=view==='month'?plus(monthStart,42):plus(startDay(cursor),view==='week'?12:3);",
  },
  {
    name:'salon-quick-book-prerequisites',
    from:"    if(!services.length||!workers.length){notify(t.serviceRequired);return}",
    to:"    if(!workers.length){notify(ar()?'أضيفي موظفة أولًا، ثم حددي الخدمات التي تقدمها.':'Add an employee first, then assign the services they provide.');return}if(!services.length){notify(ar()?'أضيفي الخدمات أولًا، ثم حددي لكل موظفة خدماتها.':'Add services first, then assign them to employees.');return}",
  },
  {
    name:'salon-employee-first-service-filter',
    from:"    const syncWorkers=()=>{const sid=q('#sqService').value,allowed=new Set((data.worker_services||[]).filter(x=>x.service_id===sid&&x.active).map(x=>x.worker_id));q('#sqWorker').innerHTML='<option value=\"\"></option>'+workers.filter(w=>allowed.has(w.id)).map(w=>'<option value=\"'+esc(w.id)+'\">'+esc(w.display_name)+'</option>').join('')};q('#sqService').onchange=syncWorkers;",
    to:"    const workerSelect=q('#sqWorker'),serviceSelect=q('#sqService'),workerField=workerSelect?.closest('.salonField'),serviceField=serviceSelect?.closest('.salonField');if(workerField&&serviceField)serviceField.parentElement?.insertBefore(workerField,serviceField);workerSelect.innerHTML='<option value=\"\"></option>'+workers.map(w=>'<option value=\"'+esc(w.id)+'\">'+esc(w.display_name)+'</option>').join('');const syncServices=()=>{const wid=workerSelect.value,allowed=new Set((data.worker_services||[]).filter(x=>x.worker_id===wid&&x.active).map(x=>x.service_id)),eligible=services.filter(s=>allowed.has(s.id));serviceSelect.innerHTML='<option value=\"\"></option>'+eligible.map(s=>'<option value=\"'+esc(s.id)+'\">'+esc(ar()?(s.name_ar||s.name):(s.name_en||s.name))+' · '+money(s.price_aed)+'</option>').join('');if(wid&&!eligible.length)serviceSelect.innerHTML='<option value=\"\">'+esc(ar()?'لا توجد خدمات مسندة لهذه الموظفة':'No services are assigned to this employee')+'</option>'};workerSelect.onchange=syncServices;serviceSelect.innerHTML='<option value=\"\"></option>';",
  },
];

export function applySalonBookingContractPatch(source){
  let body=String(source||'');
  for(const patch of replacements){
    if(!body.includes(patch.from))throw new Error('DABBIR_SALON_BOOKING_CONTRACT_PATTERN_DRIFT_'+patch.name);
    body=body.replace(patch.from,patch.to);
    if(body.includes(patch.from))throw new Error('DABBIR_SALON_BOOKING_CONTRACT_PATCH_INCOMPLETE_'+patch.name);
  }
  return body;
}

export const salonBookingContractVersion='employee-services-v1';
