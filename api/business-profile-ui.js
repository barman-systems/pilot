const css=String.raw`
.dabbir-knowledge-card{margin-top:14px;padding:0!important;overflow:hidden;border-color:#30353b;background:linear-gradient(180deg,#15181b 0%,#0f1113 100%)}
.dk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 15px;border-bottom:1px solid #252a30;background:linear-gradient(180deg,#191c20,#14171a)}
.dk-head-copy{min-width:0;max-width:760px}.dk-head h2{font-size:16px;line-height:1.35;margin:0;color:#fff}.dk-head p{font-size:10px;color:var(--muted);line-height:1.75;margin:6px 0 0}
.dk-state{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:900;color:var(--green);white-space:nowrap;border:1px solid #254a31;background:#12291a;padding:6px 9px;border-radius:999px}.dk-state:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px #8ce6a118}
.dk-form{padding:14px}.dk-sections{display:grid;grid-template-columns:1fr;gap:12px}.dk-section{border:1px solid #292e34;background:#121416;border-radius:16px;padding:14px}.dk-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.dk-section-head h3{font-size:11px;line-height:1.3;margin:0;color:#e9ecef}.dk-section-head span{font-size:8px;color:#707780}
.dk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dk-field{display:flex;flex-direction:column;gap:6px;min-width:0}.dk-field.wide{grid-column:1/-1}.dk-field label{font-size:9px;font-weight:750;color:#bfc5cc}.dk-field input,.dk-field textarea{width:100%;min-height:48px;border:1px solid #30363d;background:#181b1f;color:#fff;border-radius:12px;padding:10px 12px;resize:vertical;line-height:1.55;transition:border-color .16s,box-shadow .16s,background .16s}.dk-field input::placeholder,.dk-field textarea::placeholder{color:#666d75}.dk-field input:focus,.dk-field textarea:focus{outline:none;border-color:#687c37;background:#1b1f22;box-shadow:0 0 0 3px #d7ff5f12}.dk-field textarea{min-height:82px}.dk-field[data-key="about_business"] textarea{min-height:96px}.dk-field[data-key="delivery_policy"] textarea,.dk-field[data-key="return_policy"] textarea,.dk-field[data-key="booking_policy"] textarea{min-height:90px}
.dk-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px}.dk-msg{min-height:18px;font-size:9px;color:var(--muted);line-height:1.6}.dk-actions .primary{min-width:150px}.dk-actions .primary:disabled{opacity:.55;cursor:wait}
@media(max-width:700px){
  #screen-settings.active{padding-bottom:8px}.dabbir-knowledge-card{margin-top:10px;border-radius:16px}.dk-head{padding:15px 14px 13px;gap:10px}.dk-head h2{font-size:15px}.dk-head p{font-size:9px;line-height:1.65}.dk-state{font-size:7px;padding:5px 7px}.dk-form{padding:10px}.dk-sections{gap:9px}.dk-section{padding:12px;border-radius:14px}.dk-section-head{margin-bottom:9px}.dk-grid{grid-template-columns:1fr;gap:9px}.dk-field.wide{grid-column:auto}.dk-field input,.dk-field textarea{font-size:16px;min-height:50px;border-radius:12px;padding:10px 12px}.dk-field textarea{min-height:72px}.dk-field[data-key="about_business"] textarea{min-height:82px}.dk-field[data-key="delivery_policy"] textarea,.dk-field[data-key="return_policy"] textarea,.dk-field[data-key="booking_policy"] textarea{min-height:78px}.dk-actions{position:relative;display:grid;grid-template-columns:1fr;gap:8px;padding-top:11px}.dk-actions .primary{width:100%;min-height:50px}.dk-msg{order:2;text-align:center}
  body.dabbirAppActive>.dabbirMobileBrand{left:50%!important;right:auto!important;inset-inline-start:auto!important;inset-inline-end:auto!important;transform:translateX(-50%)!important;top:11px!important}.dabbirMobileBrand .logo{width:31px!important;height:31px!important}.dabbirMobileBrand b{font-size:11px!important}
}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirBusinessProfile)return;
  const style=document.createElement('style');
  style.dataset.dabbirKnowledge='v2';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);

  const fields=[
    ['about_business','about','basics','textarea','wide'],
    ['business_hours','hours','basics','input',''],
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
    labels:{about:'نبذة عن النشاط',hours:'ساعات الدوام',location:'الموقع / المنطقة',phone:'رقم الهاتف',whatsapp:'واتساب',email:'البريد الإلكتروني',payments:'طرق الدفع المقبولة',delivery:'سياسة التوصيل والشحن',returns:'سياسة الإرجاع والاستبدال',booking:'سياسة الحجز والمواعيد'},
    placeholders:{about:'مثال: متجر إلكتروني لمنتجات المنزل والإكسسوارات',hours:'مثال: يوميًا 8 ص – 10 م',location:'مثال: أبوظبي – الإمارات',phone:'050 000 0000',whatsapp:'نفس الرقم أو رقم واتساب آخر',email:'name@example.com',payments:'مثال: بطاقة، Apple Pay، نقدًا',delivery:'مناطق التوصيل، المدة والتكلفة',returns:'شروط ومدة الإرجاع أو الاستبدال',booking:'طريقة الحجز، التأكيد والإلغاء'}
  }:{
    title:'Business information',desc:'This is the approved reference DABBIR uses when replying to customers. Add only verified information.',saved:'Saved — DABBIR knowledge updated',loading:'Loading business information…',saving:'Saving…',error:'Could not save business information',save:'Save changes',ready:'Owner approved',optional:'Optional',
    sections:{basics:'Business basics',contact:'Contact & payments',policies:'Policies'},
    labels:{about:'About the business',hours:'Business hours',location:'Location / area',phone:'Phone number',whatsapp:'WhatsApp',email:'Email',payments:'Accepted payment methods',delivery:'Delivery & shipping policy',returns:'Returns & exchange policy',booking:'Booking & appointment policy'},
    placeholders:{about:'Example: Online store for home products and accessories',hours:'Example: Daily, 8 AM – 10 PM',location:'Example: Abu Dhabi, UAE',phone:'050 000 0000',whatsapp:'Same number or another WhatsApp number',email:'name@example.com',payments:'Example: Card, Apple Pay, cash',delivery:'Delivery areas, timing and fees',returns:'Return or exchange conditions and window',booking:'Booking, confirmation and cancellation rules'}
  };

  function createField(def){
    const [key,labelKey,,type,width]=def;
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
    control.addEventListener('input',()=>{const msg=document.querySelector('#dkMsg');if(msg&&msg.textContent===copy().saved)msg.textContent='';});
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
      for(const [key] of fields){
        const input=document.querySelector('#dk-'+key);
        if(input)input.value=String(data.facts?.[key]||'');
      }
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
  window.__dabbirBusinessProfile={refresh:()=>load(true),version:'business-knowledge-v2'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-business-profile-ui','v2');
  return res.status(200).send(client);
}
