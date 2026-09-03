const script=String.raw`(()=>{
  if(window.__dabbirTimezoneLoaded)return;
  window.__dabbirTimezoneLoaded=true;

  const GCC=Object.freeze({
    AE:{currency:'AED',timezone:'Asia/Dubai',offset:'+04:00',prefix:'+971',moneyAr:'درهم'},
    SA:{currency:'SAR',timezone:'Asia/Riyadh',offset:'+03:00',prefix:'+966',moneyAr:'ريال سعودي'},
    KW:{currency:'KWD',timezone:'Asia/Kuwait',offset:'+03:00',prefix:'+965',moneyAr:'دينار كويتي'},
    QA:{currency:'QAR',timezone:'Asia/Qatar',offset:'+03:00',prefix:'+974',moneyAr:'ريال قطري'},
    BH:{currency:'BHD',timezone:'Asia/Bahrain',offset:'+03:00',prefix:'+973',moneyAr:'دينار بحريني'},
    OM:{currency:'OMR',timezone:'Asia/Muscat',offset:'+04:00',prefix:'+968',moneyAr:'ريال عماني'},
  });

  function businessGeo(){
    let business=null;
    try{business=workspace?.business||null}catch{}
    const code=String(business?.country_code||document.documentElement.dataset.dabbirCountry||'AE').toUpperCase();
    const base=GCC[code]||GCC.AE;
    return {
      countryCode:GCC[code]?code:'AE',
      currency:String(business?.currency_code||base.currency),
      timezone:String(business?.timezone||base.timezone),
      offset:base.offset,
      prefix:String(business?.phone_country_prefix||base.prefix),
      moneyAr:base.moneyAr,
    };
  }

  function locale(){
    const geo=businessGeo();
    try{return typeof lang!=='undefined'&&lang==='en'?`en-${geo.countryCode}`:`ar-${geo.countryCode}`}catch{return document.documentElement.lang==='en'?`en-${geo.countryCode}`:`ar-${geo.countryCode}`}
  }

  function businessFormat(value){
    if(!value){
      try{return typeof T==='function'?T().unknown:'—'}catch{return '—'}
    }
    try{
      return new Intl.DateTimeFormat(locale(),{
        dateStyle:'medium',
        timeStyle:'short',
        timeZone:businessGeo().timezone,
      }).format(new Date(value));
    }catch{return String(value)}
  }

  function businessLocalToIso(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
      const absolute=new Date(raw);
      return Number.isNaN(absolute.getTime())?null:absolute.toISOString();
    }
    const normalized=raw.length===16?raw+':00':raw;
    const date=new Date(normalized+businessGeo().offset);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }

  function syncAuthorities(){
    const geo=businessGeo();
    window.__dabbirTimeZone=geo.timezone;
    window.dabbirFormatTime=businessFormat;
    window.dabbirLocalTimeToIso=businessLocalToIso;
    try{fmt=businessFormat}catch{}
    window.fmt=businessFormat;
    document.documentElement.dataset.dabbirCountry=geo.countryCode;
    document.documentElement.dataset.dabbirCurrency=geo.currency;
    document.documentElement.dataset.dabbirTimezone=geo.timezone;
  }
  syncAuthorities();

  const appointmentForm=document.querySelector('#appointmentForm');
  const appointmentModal=document.querySelector('#appointmentModal');
  const appointmentTime=document.querySelector('#apptTime');
  const appointmentFields={
    salon:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['specialist','text','الموظفة / المختصة','Specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر','Price'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات','Notes']],
    clinic:[['phone','tel','رقم الهاتف','Phone'],['service','text','نوع الموعد','Appointment type'],['specialist','text','الطبيب / المختص','Doctor / specialist'],['duration','number','المدة بالدقائق','Duration (minutes)'],['status','select','حالة الموعد','Status'],['notes','text','ملاحظات إدارية','Administrative notes']],
    car_wash:[['phone','tel','رقم الهاتف','Phone'],['vehicle','text','نوع السيارة','Vehicle type'],['service','text','الخدمة / الباقة','Service / package'],['location','text','الموقع','Location'],['price','number','السعر','Price'],['notes','text','ملاحظات','Notes']],
    services:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة','Service'],['location','text','الموقع','Location'],['duration','number','المدة بالدقائق','Duration (minutes)'],['price','number','السعر','Price'],['notes','text','ملاحظات','Notes']],
    other:[['phone','tel','رقم الهاتف','Phone'],['service','text','الخدمة / سبب الموعد','Service / purpose'],['notes','text','ملاحظات','Notes']],
  };

  function businessType(){
    try{return workspace?.business?.business_type||'other'}catch{return'other'}
  }
  function isArabic(){return document.documentElement.lang!=='en'}
  function fieldLabel(key,arLabel,enLabel){
    if(key!=='price')return isArabic()?arLabel:enLabel;
    const geo=businessGeo();
    return isArabic()?`${arLabel} (${geo.moneyAr})`:`${enLabel} (${geo.currency})`;
  }
  function renderAdaptiveFields(){
    if(!appointmentForm||!appointmentTime)return;
    syncAuthorities();
    appointmentForm.querySelector('#adaptiveApptFields')?.remove();
    const wrap=document.createElement('div');wrap.id='adaptiveApptFields';
    const fields=appointmentFields[businessType()]||appointmentFields.other;
    const geo=businessGeo();
    for(const [key,type,arLabel,enLabel] of fields){
      const field=document.createElement('div');field.className='field';
      const label=document.createElement('label');label.textContent=fieldLabel(key,arLabel,enLabel);
      let input;
      if(type==='select'){
        input=document.createElement('select');
        [['requested','بانتظار التأكيد','Pending'],['confirmed','مؤكد','Confirmed'],['cancelled','ملغي','Cancelled']].forEach(([value,arText,enText])=>{
          const option=document.createElement('option');option.value=value;option.textContent=isArabic()?arText:enText;input.append(option);
        });
      }else{
        input=document.createElement('input');input.type=type;
        if(type==='text')input.maxLength=500;
        if(type==='tel'){input.maxLength=40;input.placeholder=`${geo.prefix} …`;input.inputMode='tel';}
        if(type==='number'){input.min='0';input.step=key==='price'?'0.001':'5';}
      }
      input.dataset.apptKey=key;field.append(label,input);wrap.append(field);
    }
    appointmentTime.closest('.field')?.after(wrap);
  }

  if(appointmentModal){
    new MutationObserver(()=>{if(appointmentModal.classList.contains('open'))renderAdaptiveFields()})
      .observe(appointmentModal,{attributes:true,attributeFilter:['class']});
  }

  function fixMobileHeaderSearch(){
    const buttons=[...document.querySelectorAll('.topActions > button,.topActions .iconBtn')];
    const button=buttons.find(node=>{
      const text=String(node.textContent||'').trim();
      const label=String(node.getAttribute('aria-label')||node.getAttribute('title')||'').toLowerCase();
      return text==='م'||text==='⌕'||label.includes('search')||label.includes('بحث');
    });
    if(!button||button.dataset.dabbirSearchIcon==='v1')return;
    button.dataset.dabbirSearchIcon='v1';
    button.setAttribute('aria-label',isArabic()?'بحث':'Search');
    button.setAttribute('title',isArabic()?'بحث':'Search');
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:21px;height:21px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>';
  }

  function ensureSettingsInMore(){
    const grid=document.querySelector('#screen-more .moreGrid');
    if(!grid)return;
    let card=grid.querySelector('[data-screen="settings"],#dabbirMoreSettingsAccess');
    if(!card){
      card=document.createElement('button');
      card.type='button';
      card.id='dabbirMoreSettingsAccess';
      card.className='moreCard';
      card.dataset.screen='settings';
      card.addEventListener('click',()=>{try{if(typeof showScreen==='function')showScreen('settings')}catch{}});
      grid.append(card);
    }
    card.hidden=false;card.classList.remove('hidden');card.style.removeProperty('display');
    const title=isArabic()?'الإعدادات':'Settings';
    const desc=isArabic()?'بيانات النشاط، السياسات، ساعات العمل والحساب.':'Business details, policies, hours and account.';
    if(card.id==='dabbirMoreSettingsAccess'||!card.querySelector('h3'))card.innerHTML='<h3>'+title+'</h3><p>'+desc+'</p>';
    card.setAttribute('aria-label',title);
  }

  function markOwnerCopilotAsAi(){
    const card=document.querySelector('#dabbirOwnerCopilot');
    if(!card)return;
    const mode=card.querySelector('.dcMode');
    if(mode){
      mode.textContent=isArabic()?'AI • بيانات موثقة':'AI • Verified data';
      mode.setAttribute('aria-label',isArabic()?'مساعد ذكاء اصطناعي مبني على بيانات النشاط الموثقة':'AI assistant grounded on verified business data');
    }
    const desc=card.querySelector('.dcHead p');
    if(desc)desc.textContent=isArabic()?'ذكاء اصطناعي يجيب عن أسئلتك اعتمادًا على بيانات نشاطك الموثقة فقط.':'AI answers your questions using your verified business data only.';
    card.dataset.aiAssistant='true';
  }

  function refreshMobileUtilityUi(){syncAuthorities();fixMobileHeaderSearch();ensureSettingsInMore();markOwnerCopilotAsAi()}
  const utilityObserver=new MutationObserver(()=>requestAnimationFrame(refreshMobileUtilityUi));
  if(document.body)utilityObserver.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',event=>{if(event.target?.closest?.('#menuBtn,[data-screen="more"],.topActions,#dabbirOwnerCopilot'))setTimeout(refreshMobileUtilityUi,0)},true);

  if(appointmentForm&&!appointmentForm.dataset.dabbirBusinessTime){
    appointmentForm.dataset.dabbirBusinessTime='v3-gcc';
    appointmentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const input=document.querySelector('#apptTime');
      const customer=document.querySelector('#apptCustomer');
      const startsAt=businessLocalToIso(input&&input.value);
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

  syncAuthorities();
  setTimeout(()=>{
    syncAuthorities();
    try{if(typeof workspace!=='undefined'&&workspace&&typeof renderAll==='function')renderAll()}catch{}
    refreshMobileUtilityUi();
  },0);
  setTimeout(refreshMobileUtilityUi,500);
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
  res.setHeader('x-dabbir-timezone','business-profile');
  return res.end(script);
}