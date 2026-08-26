const css=String.raw`
.dabbir-knowledge-card{margin-top:14px;padding:0!important;overflow:hidden;border-color:#30353b;background:linear-gradient(180deg,#15181b 0%,#0f1113 100%)}
.dk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 15px;border-bottom:1px solid #252a30;background:linear-gradient(180deg,#191c20,#14171a)}
.dk-head-copy{min-width:0;max-width:760px}.dk-head h2{font-size:16px;line-height:1.35;margin:0;color:#fff}.dk-head p{font-size:10px;color:var(--muted);line-height:1.75;margin:6px 0 0}
.dk-state{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:900;color:var(--green);white-space:nowrap;border:1px solid #254a31;background:#12291a;padding:6px 9px;border-radius:999px}.dk-state:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px #8ce6a118}
.dk-form{padding:14px}.dk-sections{display:grid;grid-template-columns:1fr;gap:12px}.dk-section{border:1px solid #292e34;background:#121416;border-radius:16px;padding:14px}.dk-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.dk-section-head h3{font-size:11px;line-height:1.3;margin:0;color:#e9ecef}.dk-section-head span{font-size:8px;color:#707780}
.dk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dk-field{display:flex;flex-direction:column;gap:6px;min-width:0}.dk-field.wide{grid-column:1/-1}.dk-field label{font-size:9px;font-weight:750;color:#bfc5cc}.dk-field input,.dk-field textarea{width:100%;min-height:48px;border:1px solid #30363d;background:#181b1f;color:#fff;border-radius:12px;padding:10px 12px;resize:vertical;line-height:1.55;transition:border-color .16s,box-shadow .16s,background .16s}.dk-field input::placeholder,.dk-field textarea::placeholder{color:#666d75}.dk-field input:focus,.dk-field textarea:focus{outline:none;border-color:#687c37;background:#1b1f22;box-shadow:0 0 0 3px #d7ff5f12}.dk-field textarea{min-height:82px}.dk-field[data-key="about_business"] textarea{min-height:96px}.dk-field[data-key="delivery_policy"] textarea,.dk-field[data-key="return_policy"] textarea,.dk-field[data-key="booking_policy"] textarea{min-height:90px}
.dk-hours-wrap{border:1px solid #2d3339;background:#101214;border-radius:14px;padding:10px}.dk-hours-help{font-size:8px;line-height:1.6;color:#7f8790;margin:0 0 9px}.dk-hours-tools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.dk-hours-tools button{min-height:34px;border:1px solid #343a41;background:#191d21;color:#c9ced4;border-radius:10px;padding:5px 9px;font-size:8px;font-weight:800}.dk-hours-tools button:hover{border-color:#59623c;color:#fff}.dk-hours-list{display:flex;flex-direction:column;gap:6px}.dk-hours-row{display:grid;grid-template-columns:116px minmax(0,1fr) minmax(0,1fr);gap:7px;align-items:center;border:1px solid #262b30;background:#15181b;border-radius:12px;padding:7px}.dk-day-toggle{display:flex;align-items:center;gap:7px;min-height:38px;color:#8f969e;font-size:9px;font-weight:850;cursor:pointer;user-select:none}.dk-day-toggle input{appearance:none;-webkit-appearance:none;width:34px;height:20px;min-height:20px;border:1px solid #444b53;border-radius:999px;background:#24282d;padding:0;position:relative;flex:0 0 auto}.dk-day-toggle input:after{content:'';position:absolute;width:14px;height:14px;top:2px;inset-inline-start:2px;border-radius:50%;background:#8e959d;transition:.16s}.dk-day-toggle input:checked{background:#2a3719;border-color:#6d8234}.dk-day-toggle input:checked:after{inset-inline-start:16px;background:var(--accent)}html[dir=ltr] .dk-day-toggle input:checked:after{left:16px}.dk-hours-row.is-open .dk-day-name{color:#fff}.dk-time{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px}.dk-time span{font-size:7px;color:#737b84;white-space:nowrap}.dk-time input{min-height:38px!important;height:38px;padding:5px 7px!important;font-size:12px!important;border-radius:9px!important}.dk-time input:disabled{opacity:.35;background:#121416;color:#777}.dk-hours-legacy{display:none;margin-top:8px;padding:8px 9px;border:1px solid #4a4026;background:#241f14;color:#e8cf87;border-radius:10px;font-size:8px;line-height:1.55}.dk-hours-legacy.show{display:block}
.dk-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px}.dk-msg{min-height:18px;font-size:9px;color:var(--muted);line-height:1.6}.dk-actions .primary{min-width:150px}.dk-actions .primary:disabled{opacity:.55;cursor:wait}
@media(max-width:700px){
  #screen-settings.active{padding-bottom:8px}.dabbir-knowledge-card{margin-top:10px;border-radius:16px}.dk-head{padding:15px 14px 13px;gap:10px}.dk-head h2{font-size:15px}.dk-head p{font-size:9px;line-height:1.65}.dk-state{font-size:7px;padding:5px 7px}.dk-form{padding:10px}.dk-sections{gap:9px}.dk-section{padding:12px;border-radius:14px}.dk-section-head{margin-bottom:9px}.dk-grid{grid-template-columns:1fr;gap:9px}.dk-field.wide{grid-column:auto}.dk-field input,.dk-field textarea{font-size:16px;min-height:50px;border-radius:12px;padding:10px 12px}.dk-field textarea{min-height:72px}.dk-field[data-key="about_business"] textarea{min-height:82px}.dk-field[data-key="delivery_policy"] textarea,.dk-field[data-key="return_policy"] textarea,.dk-field[data-key="booking_policy"] textarea{min-height:78px}.dk-hours-wrap{padding:8px}.dk-hours-row{grid-template-columns:1fr 1fr;gap:6px;padding:8px}.dk-day-toggle{grid-column:1/-1;min-height:30px}.dk-time{grid-template-columns:42px 1fr}.dk-time input{font-size:16px!important;min-height:44px!important;height:44px}.dk-actions{position:relative;display:grid;grid-template-columns:1fr;gap:8px;padding-top:11px}.dk-actions .primary{width:100%;min-height:50px}.dk-msg{order:2;text-align:center}
  body.dabbirAppActive>.dabbirMobileBrand{left:50%!important;right:auto!important;inset-inline-start:auto!important;inset-inline-end:auto!important;transform:translateX(-50%)!important;top:11px!important}.dabbirMobileBrand .logo{width:31px!important;height:31px!important}.dabbirMobileBrand b{font-size:11px!important}
}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirBusinessProfile)return;
  const style=document.createElement('style');
  style.dataset.dabbirKnowledge='v3';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);

  const dayDefs=[
    ['Sunday','sun'],['Monday','mon'],['Tuesday','tue'],['Wednesday','wed'],['Thursday','thu'],['Friday','fri'],['Saturday','sat']
  ];
  const fields=[
    ['about_business','about','basics','textarea','wide'],
    ['business_hours','hours','basics','schedule','wide'],
    ['business_location','location','basics','input',''],
    ['contact_phone','phone','contact','input',''],
    ['contact_whatsapp','whatsapp','contact','input',''],
    ['contact_email','email','contact','input',''],
    ['payment_methods','payments','contact','input',''],
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
    placeholders:{about:'مثال: متجر إلكتروني لمنتجات المنزل والإكسسوارات',location:'مثال: أبوظبي – الإمارات',phone:'050 000 0000',whatsapp:'نفس الرقم أو رقم واتساب آخر',email:'name@example.com',payments:'مثال: بطاقة، Apple Pay، نقدًا',delivery:'مناطق التوصيل، المدة والتكلفة',returns:'شروط ومدة الإرجاع أو الاستبدال',booking:'طريقة الحجز، التأكيد والإلغاء'},
    days:{sun:'الأحد',mon:'الإثنين',tue:'الثلاثاء',wed:'الأربعاء',thu:'الخميس',fri:'الجمعة',sat:'السبت'},hoursHelp:'حدد أيام العمل ثم اختر وقت الفتح والإغلاق. لا حاجة لكتابة ساعات الدوام يدويًا.',open:'يفتح',close:'يغلق',allDays:'كل الأيام',workweek:'الأحد–الخميس',clearDays:'مسح',legacyHours:'توجد ساعات دوام قديمة مكتوبة كنص. اختر الأيام والأوقات هنا لتحويلها إلى جدول منظم.'
  }:{
    title:'Business information',desc:'This is the approved reference DABBIR uses when replying to customers. Add only verified information.',saved:'Saved — DABBIR knowledge updated',loading:'Loading business information…',saving:'Saving…',error:'Could not save business information',save:'Save changes',ready:'Owner approved',optional:'Optional',
    sections:{basics:'Business basics',contact:'Contact & payments',policies:'Policies'},
    labels:{about:'About the business',hours:'Working days & hours',location:'Location / area',phone:'Phone number',whatsapp:'WhatsApp',email:'Email',payments:'Accepted payment methods',delivery:'Delivery & shipping policy',returns:'Returns & exchange policy',booking:'Booking & appointment policy'},
    placeholders:{about:'Example: Online store for home products and accessories',location:'Example: Abu Dhabi, UAE',phone:'050 000 0000',whatsapp:'Same number or another WhatsApp number',email:'name@example.com',payments:'Example: Card, Apple Pay, cash',delivery:'Delivery areas, timing and fees',returns:'Return or exchange conditions and window',booking:'Booking, confirmation and cancellation rules'},
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

  function createField(def){
    const [key,labelKey,,type,width]=def;
    if(type==='schedule')return createScheduleField(def);
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
  window.__dabbirBusinessProfile={refresh:()=>load(true),version:'business-knowledge-v3'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-business-profile-ui','v3');
  return res.status(200).send(client);
}
