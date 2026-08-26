const css=String.raw`
.dabbir-knowledge-card{margin-top:12px}.dk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dk-head h2{font-size:14px;margin:0}.dk-head p{font-size:9px;color:var(--muted);line-height:1.65;margin:4px 0 0}.dk-state{font-size:8px;color:var(--green);white-space:nowrap}.dk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.dk-field{display:flex;flex-direction:column;gap:5px}.dk-field.wide{grid-column:1/-1;margin:0}.dk-field label{font-size:9px;color:#c4cad0}.dk-field input,.dk-field textarea{width:100%;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px;resize:vertical}.dk-field textarea{min-height:76px}.dk-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.dk-msg{font-size:9px;color:var(--muted)}@media(max-width:700px){.dk-grid{grid-template-columns:1fr}.dk-field.wide{grid-column:auto}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirBusinessProfile)return;
  const style=document.createElement('style');
  style.dataset.dabbirKnowledge='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);

  const fields=[
    ['about_business','about','wide','textarea'],
    ['business_hours','hours','', 'textarea'],
    ['business_location','location','', 'textarea'],
    ['contact_phone','phone','', 'input'],
    ['contact_whatsapp','whatsapp','', 'input'],
    ['contact_email','email','', 'input'],
    ['payment_methods','payments','', 'textarea'],
    ['delivery_policy','delivery','wide','textarea'],
    ['return_policy','returns','wide','textarea'],
    ['booking_policy','booking','wide','textarea'],
  ];
  let loadedBusiness=null;
  let loading=false;

  const copy=()=>lang==='ar'?{
    title:'معلومات النشاط التي يعتمد عليها AI',desc:'أي معلومة تحفظها هنا تصبح حقيقة معتمدة يستخدمها دَبِّر في الرد على العملاء. اترك الحقل فارغًا إذا لم تكن المعلومة مؤكدة.',saved:'تم الحفظ — AI سيستخدم المعلومات المعتمدة',loading:'جاري تحميل المعلومات…',saving:'جاري الحفظ…',error:'تعذر حفظ معلومات النشاط',save:'حفظ المعلومات',ready:'Owner-approved',
    labels:{about:'نبذة عن النشاط',hours:'ساعات الدوام',location:'الموقع / المنطقة',phone:'رقم الهاتف',whatsapp:'واتساب',email:'البريد الإلكتروني',payments:'طرق الدفع المقبولة',delivery:'سياسة التوصيل والشحن',returns:'سياسة الإرجاع والاستبدال',booking:'سياسة الحجز والمواعيد'}
  }:{
    title:'Business knowledge used by AI',desc:'Anything saved here becomes owner-approved information DABBIR can use when replying to customers. Leave a field blank if it is not verified.',saved:'Saved — AI will use the approved information',loading:'Loading business information…',saving:'Saving…',error:'Could not save business information',save:'Save information',ready:'Owner-approved',
    labels:{about:'About the business',hours:'Business hours',location:'Location / area',phone:'Phone number',whatsapp:'WhatsApp',email:'Email',payments:'Accepted payment methods',delivery:'Delivery & shipping policy',returns:'Returns & exchange policy',booking:'Booking & appointment policy'}
  };

  function ensure(){
    const screen=document.querySelector('#screen-settings');
    if(!screen)return null;
    let card=document.querySelector('#dabbirBusinessKnowledge');
    if(card)return card;
    card=document.createElement('section');
    card.id='dabbirBusinessKnowledge';
    card.className='card dabbir-knowledge-card';
    card.innerHTML='<div class="dk-head"><div><h2 id="dkTitle"></h2><p id="dkDesc"></p></div><span id="dkState" class="dk-state"></span></div><form id="dkForm"><div id="dkGrid" class="dk-grid"></div><div class="dk-actions"><span id="dkMsg" class="dk-msg"></span><button id="dkSave" class="primary" type="submit"></button></div></form>';
    screen.append(card);
    const grid=card.querySelector('#dkGrid');
    for(const [key,labelKey,width,type] of fields){
      const wrap=document.createElement('div');
      wrap.className='dk-field '+width;
      const label=document.createElement('label');
      label.htmlFor='dk-'+key;
      label.dataset.labelKey=labelKey;
      const control=document.createElement(type==='textarea'?'textarea':'input');
      control.id='dk-'+key;
      control.name=key;
      control.autocomplete='off';
      if(key==='contact_email')control.type='email';
      control.maxLength=key==='contact_phone'||key==='contact_whatsapp'?120:key==='contact_email'?180:1200;
      wrap.append(label,control);
      grid.append(wrap);
    }
    card.querySelector('#dkForm').addEventListener('submit',save);
    applyCopy();
    return card;
  }

  function applyCopy(){
    const card=ensure();
    if(!card)return;
    const t=copy();
    card.querySelector('#dkTitle').textContent=t.title;
    card.querySelector('#dkDesc').textContent=t.desc;
    card.querySelector('#dkState').textContent=t.ready;
    card.querySelector('#dkSave').textContent=t.save;
    for(const label of card.querySelectorAll('[data-label-key]'))label.textContent=t.labels[label.dataset.labelKey]||label.dataset.labelKey;
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
  setTimeout(()=>{applyCopy();if(document.querySelector('#screen-settings.active'))load(false)},800);
  window.__dabbirBusinessProfile={refresh:()=>load(true),version:'business-knowledge-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-business-profile-ui','v1');
  return res.status(200).send(client);
}
