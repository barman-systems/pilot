const client=String.raw`
(()=>{
  if(window.__dabbirBusinessProfile)return;


  const dayDefs=[
    ['Sunday','sun'],['Monday','mon'],['Tuesday','tue'],['Wednesday','wed'],['Thursday','thu'],['Friday','fri'],['Saturday','sat']
  ];
  const paymentDefs=[
    ['cash','Cash'],['cards','Cards'],['apple_pay','Apple Pay'],['google_pay','Google Pay'],['bank_transfer','Bank transfer'],['payment_link','Payment link'],['tabby','Tabby'],['tamara','Tamara'],['paypal','PayPal']
  ];
  const paymentAliases={
    cash:['cash','cod','cash on delivery','نقد','نقدا','نقداً','كاش','الدفع عند الاستلام'],
    cards:['card','cards','visa','mastercard','بطاق','فيزا','ماستركارد'],
    apple_pay:['apple pay','ابل باي','أبل باي','آبل باي'],
    google_pay:['google pay','جوجل باي','قوقل باي'],
    bank_transfer:['bank transfer','bank','تحويل بنكي','تحويل مصرفي'],
    payment_link:['payment link','pay link','رابط دفع','رابط الدفع'],
    tabby:['tabby','تابي'],
    tamara:['tamara','تمارا'],
    paypal:['paypal','pay pal','باي بال','بايبال']
  };
  const fields=[
    ['about_business','about','basics','textarea','wide'],
    ['business_hours','hours','basics','schedule','wide'],
    ['business_location','location','basics','input',''],
    ['contact_phone','phone','contact','input',''],
    ['contact_whatsapp','whatsapp','contact','input',''],
    ['contact_email','email','contact','input',''],
    ['payment_methods','payments','contact','payments','wide'],
    ['delivery_policy','delivery','policies','textarea','wide'],
    ['return_policy','returns','policies','textarea','wide'],
    ['booking_policy','booking','policies','textarea','wide'],
  ];
  const groupOrder=['basics','contact','policies'];
  let loadedBusiness=null;
  let loading=false;

  const copy=()=>lang==='ar'?{
    title:'معلومات النشاط',desc:'هذه المعلومات هي المرجع المعتمد الذي يستخدمه دَبِّر عند الرد على العملاء. اكتب فقط المعلومات المؤكدة.',saved:'تم الحفظ — تم تحديث معرفة دَبِّر',loading:'جاري تحميل المعلومات…',saving:'جاري الحفظ…',error:'تعذر حفظ معلومات النشاط',save:'حفظ التغييرات',ready:'معتمد من المالك',optional:'اختياري',
    sections:{basics:'أساسيات النشاط',contact:'التواصل والدفع',policies:'السياسات'},
    labels:{about:'نبذة عن النشاط',hours:'أيام وساعات العمل',location:'الموقع / المنطقة',phone:'رقم الهاتف',whatsapp:'واتساب',email:'البريد الإلكتروني',payments:'طرق الدفع المقبولة',delivery:'سياسة التوصيل والشحن',returns:'سياسة الإرجاع والاستبدال',booking:'سياسة الحجز والمواعيد'},
    placeholders:{about:'مثال: متجر إلكتروني لمنتجات المنزل والإكسسوارات',location:'مثال: أبوظبي – الإمارات',phone:'050 000 0000',whatsapp:'نفس الرقم أو رقم واتساب آخر',email:'name@example.com',delivery:'مناطق التوصيل، المدة والتكلفة',returns:'شروط ومدة الإرجاع أو الاستبدال',booking:'طريقة الحجز، التأكيد والإلغاء'},
    paymentHelp:'اختر كل طرق الدفع التي يقبلها نشاطك. يمكن اختيار أكثر من خيار.',paymentOptions:{cash:'نقدًا / عند الاستلام',cards:'بطاقات ائتمان أو خصم',apple_pay:'Apple Pay',google_pay:'Google Pay',bank_transfer:'تحويل بنكي',payment_link:'رابط دفع',tabby:'Tabby',tamara:'Tamara',paypal:'PayPal'},
    days:{sun:'الأحد',mon:'الإثنين',tue:'الثلاثاء',wed:'الأربعاء',thu:'الخميس',fri:'الجمعة',sat:'السبت'},hoursHelp:'حدد أيام العمل ثم اختر وقت الفتح والإغلاق. لا حاجة لكتابة ساعات الدوام يدويًا.',open:'يفتح',close:'يغلق',allDays:'كل الأيام',workweek:'الأحد–الخميس',clearDays:'مسح',legacyHours:'توجد ساعات دوام قديمة مكتوبة كنص. اختر الأيام والأوقات هنا لتحويلها إلى جدول منظم.'
  }:{
    title:'Business information',desc:'This is the approved reference DABBIR uses when replying to customers. Add only verified information.',saved:'Saved — DABBIR knowledge updated',loading:'Loading business information…',saving:'Saving…',error:'Could not save business information',save:'Save changes',ready:'Owner approved',optional:'Optional',
    sections:{basics:'Business basics',contact:'Contact & payments',policies:'Policies'},
    labels:{about:'About the business',hours:'Working days & hours',location:'Location / area',phone:'Phone number',whatsapp:'WhatsApp',email:'Email',payments:'Accepted payment methods',delivery:'Delivery & shipping policy',returns:'Returns & exchange policy',booking:'Booking & appointment policy'},
    placeholders:{about:'Example: Online store for home products and accessories',location:'Example: Abu Dhabi, UAE',phone:'050 000 0000',whatsapp:'Same number or another WhatsApp number',email:'name@example.com',delivery:'Delivery areas, timing and fees',returns:'Return or exchange conditions and window',booking:'Booking, confirmation and cancellation rules'},
    paymentHelp:'Select every payment method your business accepts. You can choose more than one.',paymentOptions:{cash:'Cash / cash on delivery',cards:'Credit or debit cards',apple_pay:'Apple Pay',google_pay:'Google Pay',bank_transfer:'Bank transfer',payment_link:'Payment link',tabby:'Tabby',tamara:'Tamara',paypal:'PayPal'},
    days:{sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'},hoursHelp:'Select working days, then choose opening and closing times. No manual hours text is needed.',open:'Opens',close:'Closes',allDays:'Every day',workweek:'Sun–Thu',clearDays:'Clear',legacyHours:'Legacy hours are saved as free text. Choose days and times here to convert them into a structured schedule.'
  };

  function dirty(){const msg=document.querySelector('#dkMsg');if(msg&&msg.textContent===copy().saved)msg.textContent=''}

  function canonicalHours(){
    const parts=[];
    for(const [english,key] of dayDefs){
      const enabled=document.querySelector('#dk-day-'+key)?.checked;
      if(!enabled)continue;
      const start=document.querySelector('#dk-start-'+key)?.value||'08:00';
      const end=document.querySelector('#dk-end-'+key)?.value||'18:00';
      parts.push(english+' '+start+'-'+end);
    }
    return parts.join('; ');
  }

  function syncHoursValue(){
    const hidden=document.querySelector('#dk-business_hours');
    if(hidden)hidden.value=canonicalHours();
    document.querySelector('#dkHoursLegacy')?.classList.remove('show');
    dirty();
  }

  function setDay(key,enabled,start='08:00',end='18:00',silent=false){
    const checkbox=document.querySelector('#dk-day-'+key);
    const startInput=document.querySelector('#dk-start-'+key);
    const endInput=document.querySelector('#dk-end-'+key);
    const row=document.querySelector('[data-hours-day="'+key+'"]');
    if(!checkbox||!startInput||!endInput)return;
    checkbox.checked=!!enabled;
    startInput.disabled=!enabled;
    endInput.disabled=!enabled;
    if(start)startInput.value=start;
    if(end)endInput.value=end;
    row?.classList.toggle('is-open',!!enabled);
    if(!silent)syncHoursValue();
  }

  function hydrateHours(value){
    for(const [,key] of dayDefs)setDay(key,false,'08:00','18:00',true);
    const text=String(value||'').trim();
    const hidden=document.querySelector('#dk-business_hours');
    if(hidden)hidden.value=text;
    if(!text){document.querySelector('#dkHoursLegacy')?.classList.remove('show');return}
    let matched=0;
    for(const [english,key] of dayDefs){
      const re=new RegExp('(?:^|;\\s*)'+english+'\\s+(\\d{2}:\\d{2})-(\\d{2}:\\d{2})(?=;|$)','i');
      const hit=text.match(re);
      if(hit){setDay(key,true,hit[1],hit[2],true);matched++}
    }
    const legacy=document.querySelector('#dkHoursLegacy');
    if(matched){if(hidden)hidden.value=canonicalHours();legacy?.classList.remove('show')}
    else legacy?.classList.add('show');
  }

  function canonicalPayments(){
    const values=[];
    for(const [key,value] of paymentDefs){
      const button=document.querySelector('[data-payment-key="'+key+'"]');
      if(button?.getAttribute('aria-pressed')==='true')values.push(value);
    }
    return values.join('; ');
  }

  function syncPaymentsValue(){
    const hidden=document.querySelector('#dk-payment_methods');
    if(hidden)hidden.value=canonicalPayments();
    dirty();
  }

  function setPayment(key,enabled,silent=false){
    const button=document.querySelector('[data-payment-key="'+key+'"]');
    if(!button)return;
    button.setAttribute('aria-pressed',enabled?'true':'false');
    if(!silent)syncPaymentsValue();
  }

  function hydratePayments(value){
    const text=String(value||'').trim().toLowerCase();
    let matched=0;
    for(const [key,canonical] of paymentDefs){
      const aliases=[canonical.toLowerCase(),...(paymentAliases[key]||[])];
      const selected=!!text&&aliases.some(alias=>text.includes(alias));
      setPayment(key,selected,true);
      if(selected)matched++;
    }
    const hidden=document.querySelector('#dk-payment_methods');
    if(hidden)hidden.value=matched?canonicalPayments():'';
  }

  function createScheduleField(def){
    const [key,labelKey,,,width]=def;
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.dataset.labelKey=labelKey;
    label.htmlFor='dk-day-sun';
    const hidden=document.createElement('input');
    hidden.type='hidden';hidden.id='dk-'+key;hidden.name=key;
    const box=document.createElement('div');
    box.className='dk-hours-wrap';
    box.innerHTML='<p class="dk-hours-help" id="dkHoursHelp"></p><div class="dk-hours-tools"><button type="button" data-hours-preset="all"></button><button type="button" data-hours-preset="workweek"></button><button type="button" data-hours-preset="clear"></button></div><div class="dk-hours-list" id="dkHoursList"></div><div class="dk-hours-legacy" id="dkHoursLegacy"></div>';
    const list=box.querySelector('#dkHoursList');
    for(const [,dayKey] of dayDefs){
      const row=document.createElement('div');
      row.className='dk-hours-row';row.dataset.hoursDay=dayKey;
      row.innerHTML='<label class="dk-day-toggle"><input type="checkbox" id="dk-day-'+dayKey+'"><span class="dk-day-name" data-day-key="'+dayKey+'"></span></label><label class="dk-time"><span data-hours-open></span><input type="time" id="dk-start-'+dayKey+'" value="08:00" disabled></label><label class="dk-time"><span data-hours-close></span><input type="time" id="dk-end-'+dayKey+'" value="18:00" disabled></label>';
      list.append(row);
      row.querySelector('#dk-day-'+dayKey).addEventListener('change',e=>setDay(dayKey,e.target.checked));
      row.querySelector('#dk-start-'+dayKey).addEventListener('change',syncHoursValue);
      row.querySelector('#dk-end-'+dayKey).addEventListener('change',syncHoursValue);
    }
    box.querySelector('[data-hours-preset="all"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,true,'08:00','18:00',true);syncHoursValue()});
    box.querySelector('[data-hours-preset="workweek"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,['sun','mon','tue','wed','thu'].includes(d),'08:00','18:00',true);syncHoursValue()});
    box.querySelector('[data-hours-preset="clear"]').addEventListener('click',()=>{for(const [,d] of dayDefs)setDay(d,false,'08:00','18:00',true);syncHoursValue()});
    wrap.append(label,hidden,box);
    return wrap;
  }

  function createPaymentsField(def){
    const [key,labelKey,,,width]=def;
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.dataset.labelKey=labelKey;
    const hidden=document.createElement('input');
    hidden.type='hidden';hidden.id='dk-'+key;hidden.name=key;
    const box=document.createElement('div');
    box.className='dk-payments-wrap';
    box.innerHTML='<p class="dk-payments-help" data-payments-help></p><div class="dk-payment-options" role="group"></div>';
    const options=box.querySelector('.dk-payment-options');
    for(const [paymentKey] of paymentDefs){
      const button=document.createElement('button');
      button.type='button';
      button.className='dk-payment-option';
      button.dataset.paymentKey=paymentKey;
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>setPayment(paymentKey,button.getAttribute('aria-pressed')!=='true'));
      options.append(button);
    }
    wrap.append(label,hidden,box);
    return wrap;
  }

  function createField(def){
    const [key,labelKey,,type,width]=def;
    if(type==='schedule')return createScheduleField(def);
    if(type==='payments')return createPaymentsField(def);
    const wrap=document.createElement('div');
    wrap.className='dk-field '+width;
    wrap.dataset.key=key;
    const label=document.createElement('label');
    label.htmlFor='dk-'+key;
    label.dataset.labelKey=labelKey;
    const control=document.createElement(type==='textarea'?'textarea':'input');
    control.id='dk-'+key;
    control.name=key;
    control.autocomplete='off';
    control.dataset.placeholderKey=labelKey;
    if(type==='textarea')control.rows=3;
    if(key==='contact_email'){control.type='email';control.autocomplete='email'}
    if(key==='contact_phone'||key==='contact_whatsapp'){control.type='tel';control.inputMode='tel';control.autocomplete='tel'}
    control.maxLength=key==='contact_phone'||key==='contact_whatsapp'?120:key==='contact_email'?180:1200;
    control.addEventListener('input',dirty);
    wrap.append(label,control);
    return wrap;
  }

  function ensure(){
    const screen=document.querySelector('#screen-settings');
    if(!screen)return null;
    let card=document.querySelector('#dabbirBusinessKnowledge');
    if(card)return card;
    card=document.createElement('section');
    card.id='dabbirBusinessKnowledge';
    card.className='card dabbir-knowledge-card';
    card.innerHTML='<div class="dk-head"><div class="dk-head-copy"><h2 id="dkTitle"></h2><p id="dkDesc"></p></div><span id="dkState" class="dk-state"></span></div><form id="dkForm" class="dk-form"><div id="dkSections" class="dk-sections"></div><div class="dk-actions"><span id="dkMsg" class="dk-msg" role="status" aria-live="polite"></span><button id="dkSave" class="primary" type="submit"></button></div></form>';
    screen.append(card);
    const sections=card.querySelector('#dkSections');
    for(const group of groupOrder){
      const section=document.createElement('section');
      section.className='dk-section';
      section.dataset.group=group;
      section.innerHTML='<div class="dk-section-head"><h3 data-section-key="'+group+'"></h3><span data-optional></span></div><div class="dk-grid"></div>';
      const grid=section.querySelector('.dk-grid');
      for(const field of fields.filter(item=>item[2]===group))grid.append(createField(field));
      sections.append(section);
    }
    card.querySelector('#dkForm').addEventListener('submit',save);
    applyCopy();
    return card;
  }

  function applyCopy(){
    const card=document.querySelector('#dabbirBusinessKnowledge')||ensure();
    if(!card)return;
    const t=copy();
    card.querySelector('#dkTitle').textContent=t.title;
    card.querySelector('#dkDesc').textContent=t.desc;
    card.querySelector('#dkState').textContent=t.ready;
    card.querySelector('#dkSave').textContent=t.save;
    for(const node of card.querySelectorAll('[data-section-key]'))node.textContent=t.sections[node.dataset.sectionKey]||node.dataset.sectionKey;
    for(const node of card.querySelectorAll('[data-optional]'))node.textContent=t.optional;
    for(const label of card.querySelectorAll('[data-label-key]'))label.textContent=t.labels[label.dataset.labelKey]||label.dataset.labelKey;
    for(const control of card.querySelectorAll('[data-placeholder-key]'))control.placeholder=t.placeholders[control.dataset.placeholderKey]||'';
    for(const node of card.querySelectorAll('[data-payment-key]'))node.textContent=t.paymentOptions[node.dataset.paymentKey]||node.dataset.paymentKey;
    const paymentHelp=card.querySelector('[data-payments-help]');if(paymentHelp)paymentHelp.textContent=t.paymentHelp;
    for(const node of card.querySelectorAll('[data-day-key]'))node.textContent=t.days[node.dataset.dayKey]||node.dataset.dayKey;
    for(const node of card.querySelectorAll('[data-hours-open]'))node.textContent=t.open;
    for(const node of card.querySelectorAll('[data-hours-close]'))node.textContent=t.close;
    const help=card.querySelector('#dkHoursHelp');if(help)help.textContent=t.hoursHelp;
    const legacy=card.querySelector('#dkHoursLegacy');if(legacy)legacy.textContent=t.legacyHours;
    const all=card.querySelector('[data-hours-preset="all"]');if(all)all.textContent=t.allDays;
    const week=card.querySelector('[data-hours-preset="workweek"]');if(week)week.textContent=t.workweek;
    const clear=card.querySelector('[data-hours-preset="clear"]');if(clear)clear.textContent=t.clearDays;
  }

  function businessId(){return workspace?.business?.id||null}
  function setMessage(value){const el=document.querySelector('#dkMsg');if(el)el.textContent=value||''}

  async function load(force=false){
    const id=businessId();
    const card=ensure();
    if(!id||!card||loading)return;
    if(!force&&loadedBusiness===id)return;
    loading=true;
    setMessage(copy().loading);
    try{
      const response=await fetch('/api/business-profile?business_id='+encodeURIComponent(id),{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('BUSINESS_PROFILE_'+response.status));
      for(const [key,,,type] of fields){
        if(type==='schedule')continue;
        if(type==='payments'){hydratePayments(data.facts?.[key]||'');continue}
        const input=document.querySelector('#dk-'+key);
        if(input)input.value=String(data.facts?.[key]||'');
      }
      hydrateHours(data.facts?.business_hours||'');
      loadedBusiness=id;
      setMessage('');
    }catch(error){
      console.error('dabbir_business_knowledge_load_failed',String(error?.message||error).slice(0,120));
      setMessage(copy().error);
    }finally{loading=false}
  }

  async function save(event){
    event.preventDefault();
    const id=businessId();
    if(!id||loading)return;
    loading=true;
    const button=document.querySelector('#dkSave');
    const t=copy();
    if(button)button.disabled=true;
    setMessage(t.saving);
    try{
      const facts={};
      for(const [key] of fields)facts[key]=document.querySelector('#dk-'+key)?.value||'';
      const response=await fetch('/api/business-profile',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,facts})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('BUSINESS_PROFILE_SAVE_'+response.status));
      hydrateHours(data.facts?.business_hours||facts.business_hours||'');
      hydratePayments(data.facts?.payment_methods||facts.payment_methods||'');
      loadedBusiness=id;
      setMessage(t.saved);
    }catch(error){
      console.error('dabbir_business_knowledge_save_failed',String(error?.message||error).slice(0,120));
      setMessage(t.error);
    }finally{
      loading=false;
      if(button)button.disabled=false;
    }
  }

  ensure();
  const screen=document.querySelector('#screen-settings');
  if(screen){
    const observer=new MutationObserver(()=>{
      applyCopy();
      if(screen.classList.contains('active'))load(false);
    });
    observer.observe(screen,{attributes:true,attributeFilter:['class']});
  }
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage){
    setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result;};
  }
  setTimeout(()=>{applyCopy();if(document.querySelector('#screen-settings.active'))load(false)},500);
  window.__dabbirBusinessProfile={refresh:()=>load(true),version:'business-knowledge-v4'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-business-profile-ui','v4');
  return res.status(200).send(client);
}