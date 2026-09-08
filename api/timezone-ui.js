const script=String.raw`(()=>{
  if(window.__dabbirTimezoneLoaded)return;
  window.__dabbirTimezoneLoaded=true;

  function currencyMinorUnits(currency){
    try{return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits??2}catch{return 2}
  }
  function currencyNameAr(currency){
    try{return new Intl.DisplayNames(['ar'],{type:'currency'}).of(currency)||currency}catch{return currency}
  }
  function businessGeo(){
    let business=null;
    try{business=workspace?.business||null}catch{}
    const countryCode=String(business?.country_code||document.documentElement.dataset.dabbirCountry||'AE').toUpperCase();
    const currency=String(business?.currency_code||document.documentElement.dataset.dabbirCurrency||'AED').toUpperCase();
    const timezone=String(business?.timezone||document.documentElement.dataset.dabbirTimezone||'Asia/Dubai');
    const prefix=String(business?.phone_country_prefix||'');
    return {countryCode,currency,timezone,prefix,moneyAr:currencyNameAr(currency),minorUnits:currencyMinorUnits(currency)};
  }

  function locale(){
    const geo=businessGeo();
    try{return typeof lang!=='undefined'&&lang==='en'?'en-'+geo.countryCode:'ar-'+geo.countryCode}catch{return document.documentElement.lang==='en'?'en-'+geo.countryCode:'ar-'+geo.countryCode}
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

  function offsetMinutesAt(instantMs,timeZone){
    const date=new Date(instantMs);
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    return Math.round((represented-Math.floor(instantMs/1000)*1000)/60000);
  }

  function businessLocalToIso(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
      const absolute=new Date(raw);
      return Number.isNaN(absolute.getTime())?null:absolute.toISOString();
    }
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!match)return null;
    const [,year,month,day,hour,minute,second='00']=match;
    const wallUtc=Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute),Number(second));
    const zone=businessGeo().timezone;
    try{
      let offset=offsetMinutesAt(wallUtc,zone);
      let instant=wallUtc-offset*60000;
      const corrected=offsetMinutesAt(instant,zone);
      if(corrected!==offset)instant=wallUtc-corrected*60000;
      const date=new Date(instant);
      return Number.isNaN(date.getTime())?null:date.toISOString();
    }catch{return null}
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
    return isArabic()?arLabel+' ('+geo.moneyAr+')':enLabel+' ('+geo.currency+')';
  }
  function renderAdaptiveFields(){
    if(!appointmentForm||!appointmentTime)return;
    syncAuthorities();
    appointmentForm.querySelector('#adaptiveApptFields')?.remove();
    const wrap=document.createElement('div');wrap.id='adaptiveApptFields';
    const optional=document.createElement('details');optional.id='adaptiveApptDetails';optional.className='field';
    const summary=document.createElement('summary');summary.textContent=isArabic()?'تفاصيل الموعد (اختياري)':'Appointment details (optional)';
    summary.style.cssText='cursor:pointer;min-height:44px;padding-block:12px;font-size:14px';
    optional.append(summary);
    const fields=appointmentFields[businessType()]||appointmentFields.other;
    const geo=businessGeo();
    for(const [key,type,arLabel,enLabel] of fields){
      const field=document.createElement('div');field.className='field';
      const label=document.createElement('label');label.textContent=fieldLabel(key,arLabel,enLabel);
      if(key==='phone')label.textContent+=isArabic()?' (اختياري)':' (optional)';
      let input;
      if(type==='select'){
        input=document.createElement('select');
        [['requested','بانتظار التأكيد','Pending'],['confirmed','مؤكد','Confirmed'],['cancelled','ملغي','Cancelled']].forEach(([value,arText,enText])=>{
          const option=document.createElement('option');option.value=value;option.textContent=isArabic()?arText:enText;input.append(option);
        });
      }else{
        input=document.createElement('input');input.type=type;
        if(type==='text')input.maxLength=500;
        if(type==='tel'){input.maxLength=40;input.placeholder=(geo.prefix||'+')+' …';input.inputMode='tel';}
        if(type==='number'){input.min='0';input.step=key==='price'?(geo.minorUnits===0?'1':'0.'+'0'.repeat(Math.max(0,geo.minorUnits-1))+'1'):'5';}
      }
      input.id='apptDetail-'+key;label.htmlFor=input.id;
      if(type==='tel'||type==='number')input.dir='ltr';
      input.dataset.apptKey=key;field.append(label,input);
      if(key==='phone')wrap.append(field);else optional.append(field);
    }
    wrap.append(optional);
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
    appointmentForm.dataset.dabbirBusinessTime='v4-market';
    let appointmentSubmitting=false;
    let formRevision=0;
    const formObserver=appointmentModal?new MutationObserver(records=>{formRevision+=records.length;}):null;
    formObserver?.observe(appointmentModal,{attributes:true,attributeFilter:['class']});
    for(const eventName of ['input','change','reset'])appointmentForm.addEventListener(eventName,()=>{formRevision++;});
    const appointmentIntents=new Map();
    function currentContext(){
      const w=typeof workspace!=='undefined'?workspace:null;
      const scope=window.dabbirBranchContext?.scope?.()||w?.branch_scope||null;
      const actorId=String(w?.user?.id||'');
      const businessId=w?.business?.id||null;
      const branchId=scope?.mode==='all'?'all':scope?.branch_id||null;
      return {actorId,businessId,branchId,scope,key:JSON.stringify([actorId,businessId,branchId||'all',scope?.business_id||businessId])};
    }
    function draftState(){
      formRevision+=formObserver?.takeRecords().length||0;
      return JSON.stringify([formRevision,appointmentModal?.classList.contains('open')===true,
        document.querySelector('#apptCustomer')?.value,document.querySelector('#apptTime')?.value,
        [...appointmentForm.querySelectorAll('[data-appt-key]')].map(node=>[node.dataset.apptKey,node.value])]);
    }
    function saveError(payload){
      const message=isArabic()?payload?.message_ar:payload?.message_en;
      return typeof message==='string'&&message.length<=300?message:(isArabic()?'تعذر تأكيد حفظ الموعد. حاول مجددًا من النموذج نفسه.':'The save could not be confirmed. Retry from the same form.');
    }
    appointmentForm.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      if(appointmentSubmitting)return;
      const input=document.querySelector('#apptTime');
      const customer=document.querySelector('#apptCustomer');
      const startsAt=businessLocalToIso(input&&input.value);
      if(!startsAt){
        try{if(typeof toast==='function')toast(typeof T==='function'?T().invalid:'Invalid time')}catch{}
        return;
      }
      const button=document.querySelector('#saveApptBtn');
      const idleLabel=button?.textContent;
      const wasDisabled=button?.disabled;
      const previousBusy=appointmentForm.getAttribute('aria-busy');
      let stillCurrent=null,busyLabel=null;
      appointmentSubmitting=true;
      appointmentForm.setAttribute('aria-busy','true');
      try{
        if(button){
          button.disabled=true;
          busyLabel=typeof T==='function'?T().savingWorking:(isArabic()?'جارٍ الحفظ…':'Saving…');
          button.textContent=busyLabel;
        }
        const context=currentContext();
        const businessId=context.businessId;
        if(!businessId)return;
        const branchScope=context.scope;
        if(branchScope?.business_id&&branchScope.business_id!==businessId){
          try{if(typeof toast==='function')toast(isArabic()?'تغيّر النشاط. حدّث الصفحة واختر الفرع قبل الحفظ.':'The business changed. Refresh the page and select the branch before saving.')}catch{}
          return;
        }
        const submittedDraft=draftState();
        const sameContext=()=>currentContext().key===context.key&&document.querySelector('#appointmentForm')===appointmentForm&&document.querySelector('#appointmentModal')===appointmentModal;
        stillCurrent=()=>sameContext()&&draftState()===submittedDraft;
        const details={};
        appointmentForm.querySelectorAll('[data-appt-key]').forEach(node=>{details[node.dataset.apptKey]=node.value});
        const booking={
          business_id:businessId,
          branch_id:context.branchId,
          business_type:businessType(),
          customer_name:String(customer&&customer.value||'').trim(),
          starts_at:startsAt,
          details,
        };
        const intent=JSON.stringify({actor_id:context.actorId,...booking});
        let requestKey=appointmentIntents.get(intent);
        if(!requestKey){
          requestKey=window.crypto?.randomUUID?.();
          if(!requestKey){
            try{if(typeof toast==='function')toast(isArabic()?'تعذر تجهيز طلب الحفظ. حدّث الصفحة وحاول مجددًا.':'The save request could not be prepared. Refresh the page and try again.')}catch{}
            return;
          }
          appointmentIntents.set(intent,requestKey);
        }
        const response=await fetch('/api/adaptive-appointment',{
          method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-dabbir-client':'web'},
          body:JSON.stringify({...booking,idempotency_key:requestKey})
        });
        const payload=await response.json().catch(()=>({}));
        // A late result belongs to the original draft. Keep its request key so
        // returning to that draft can read back the saved result without a write.
        if(!stillCurrent())return;
        if(!response.ok||!payload?.ok||!payload.appointment?.id){
          try{if(typeof toast==='function')toast(saveError(payload))}catch{}
          return;
        }
        appointmentIntents.delete(intent);
        document.querySelector('#appointmentModal')?.classList.remove('open');
        appointmentForm.reset();
        try{if(typeof toast==='function')toast(typeof T==='function'?T().saved:'Saved')}catch{}
        const refreshedDraft=draftState();
        const conversationId=typeof selectedConversationId!=='undefined'?selectedConversationId:null;
        stillCurrent=()=>sameContext()&&draftState()===refreshedDraft&&(typeof selectedConversationId!=='undefined'?selectedConversationId:null)===conversationId;
        try{
          if(typeof loadRuntime==='function')await loadRuntime(businessId,conversationId,{isCurrent:stillCurrent});
        }catch{
          try{if(stillCurrent()&&typeof toast==='function')toast(isArabic()?'تم حفظ الموعد، لكن تعذر تحديث القائمة. حدّث الصفحة لعرضه.':'The appointment was saved, but the list could not refresh. Refresh the page to view it.')}catch{}
        }
      }catch{
        try{if((!stillCurrent||stillCurrent())&&typeof toast==='function')toast(saveError())}catch{}
      }finally{
        appointmentSubmitting=false;
        if(button){button.disabled=wasDisabled;if(button.textContent===busyLabel)button.textContent=idleLabel;}
        if(previousBusy===null)appointmentForm.removeAttribute('aria-busy');
        else appointmentForm.setAttribute('aria-busy',previousBusy);
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
  res.setHeader('x-dabbir-timezone','market-agnostic-business-profile');
  return res.end(script);
}
