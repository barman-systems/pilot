const script=String.raw`(()=>{
  if(window.__dabbirTimezoneLoaded)return;
  window.__dabbirTimezoneLoaded=true;
  const DABBIR_TIME_ZONE='Asia/Dubai';
  const DABBIR_UTC_OFFSET='+04:00';
  window.__dabbirTimeZone=DABBIR_TIME_ZONE;

  function locale(){
    try{return typeof lang!=='undefined'&&lang==='en'?'en-AE':'ar-AE'}catch{return document.documentElement.lang==='en'?'en-AE':'ar-AE'}
  }

  function dubaiFormat(value){
    if(!value){
      try{return typeof T==='function'?T().unknown:'—'}catch{return '—'}
    }
    try{
      return new Intl.DateTimeFormat(locale(),{
        dateStyle:'medium',
        timeStyle:'short',
        timeZone:DABBIR_TIME_ZONE,
      }).format(new Date(value));
    }catch{return String(value)}
  }

  function dubaiLocalToIso(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
      const absolute=new Date(raw);
      return Number.isNaN(absolute.getTime())?null:absolute.toISOString();
    }
    const normalized=raw.length===16?raw+':00':raw;
    const date=new Date(normalized+DABBIR_UTC_OFFSET);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }

  try{fmt=dubaiFormat}catch{}
  window.fmt=dubaiFormat;
  window.dabbirFormatTime=dubaiFormat;
  window.dabbirLocalTimeToIso=dubaiLocalToIso;

  const appointmentForm=document.querySelector('#appointmentForm');
  const appointmentModal=document.querySelector('#appointmentModal');
  const appointmentTime=document.querySelector('#apptTime');
  const appointmentFields={
    salon:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['specialist','text','الموظفة / المختصة','Specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر (درهم)','Price (AED)'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات','Notes']],
    clinic:[['phone','tel','رقم الهاتف','Phone'],['service','text','نوع الموعد','Appointment type'],['specialist','text','الطبيب / المختص','Doctor / specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات إدارية','Administrative notes']],
    car_wash:[['phone','tel','رقم الهاتف','Phone'],['vehicle','text','نوع السيارة','Vehicle type'],['service','text','الخدمة / الباقة','Service / package'],['location','text','الموقع','Location'],['price','number','السعر (درهم)','Price (AED)'],['notes','text','ملاحظات','Notes']],
    services:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['location','text','الموقع','Location'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر (درهم)','Price (AED)'],['notes','text','ملاحظات','Notes']],
    other:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة / سبب الموعد','Service / purpose'],['notes','text','ملاحظات','Notes']],
  };

  function businessType(){
    try{return workspace?.business?.business_type||'other'}catch{return'other'}
  }
  function isArabic(){return document.documentElement.lang!=='en'}
  function renderAdaptiveFields(){
    if(!appointmentForm||!appointmentTime)return;
    appointmentForm.querySelector('#adaptiveApptFields')?.remove();
    const wrap=document.createElement('div');wrap.id='adaptiveApptFields';
    const fields=appointmentFields[businessType()]||appointmentFields.other;
    for(const [key,type,arLabel,enLabel] of fields){
      const field=document.createElement('div');field.className='field';
      const label=document.createElement('label');label.textContent=isArabic()?arLabel:enLabel;
      let input;
      if(type==='select'){
        input=document.createElement('select');
        [['requested','بانتظار التأكيد','Pending'],['confirmed','مؤكد','Confirmed'],['cancelled','ملغي','Cancelled']].forEach(([value,arText,enText])=>{
          const option=document.createElement('option');option.value=value;option.textContent=isArabic()?arText:enText;input.append(option);
        });
      }else{
        input=document.createElement('input');input.type=type;
        if(type==='text')input.maxLength=500;
        if(type==='tel')input.maxLength=40;
        if(type==='number'){input.min='0';input.step=key==='price'?'0.01':'5';}
      }
      input.dataset.apptKey=key;field.append(label,input);wrap.append(field);
    }
    appointmentTime.closest('.field')?.after(wrap);
  }

  if(appointmentModal){
    new MutationObserver(()=>{if(appointmentModal.classList.contains('open'))renderAdaptiveFields()})
      .observe(appointmentModal,{attributes:true,attributeFilter:['class']});
  }

  if(appointmentForm&&!appointmentForm.dataset.dabbirDubaiTime){
    appointmentForm.dataset.dabbirDubaiTime='v2-adaptive';
    appointmentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const input=document.querySelector('#apptTime');
      const customer=document.querySelector('#apptCustomer');
      const startsAt=dubaiLocalToIso(input&&input.value);
      if(!startsAt){
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Invalid time')}catch{}
        return;
      }
      try{
        const businessId=typeof workspace!=='undefined'&&workspace&&workspace.business?workspace.business.id:null;
        if(!businessId)return;
        const details={};
        appointmentForm.querySelectorAll('[data-appt-key]').forEach(node=>{details[node.dataset.apptKey]=node.value});
        const response=await fetch('/api/adaptive-appointment',{
          method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
          body:JSON.stringify({
            business_id:businessId,
            business_type:businessType(),
            customer_name:String(customer&&customer.value||'').trim(),
            starts_at:startsAt,
            details,
          })
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok){
          try{if(typeof toast==='function')toast(payload.error||(typeof T==='function'?T().invalid:'Save failed'))}catch{}
          return;
        }
        document.querySelector('#appointmentModal')?.classList.remove('open');
        appointmentForm.reset();
        try{if(typeof toast==='function')toast(typeof T==='function'?T().saved:'Saved')}catch{}
        if(typeof loadRuntime==='function')await loadRuntime(businessId,typeof selectedConversationId!=='undefined'?selectedConversationId:null);
      }catch{
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Save failed')}catch{}
      }
    },true);
  }

  document.documentElement.dataset.dabbirTimezone=DABBIR_TIME_ZONE;
  setTimeout(()=>{
    try{if(typeof workspace!=='undefined'&&workspace&&typeof renderAll==='function')renderAll()}catch{}
  },0);
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-timezone','Asia/Dubai');
  return res.end(script);
}