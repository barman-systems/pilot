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
  if(appointmentForm&&!appointmentForm.dataset.dabbirDubaiTime){
    appointmentForm.dataset.dabbirDubaiTime='v1';
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
        const response=await fetch('/api/dabbir-runtime-fast',{
          method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
          body:JSON.stringify({action:'create_appointment',business_id:businessId,customer_name:String(customer&&customer.value||'').trim(),starts_at:startsAt})
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
