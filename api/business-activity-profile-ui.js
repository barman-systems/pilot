const css=String.raw`
.dap-card{margin-top:12px;border:1px solid #30363d;background:linear-gradient(180deg,#15191d,#101214);border-radius:16px;overflow:hidden}.dap-head{padding:15px 16px 13px;border-bottom:1px solid #292e34;background:#15181b}.dap-head-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dap-head h2{font-size:14px;margin:0;color:#fff}.dap-head p{font-size:9px;line-height:1.7;color:var(--muted);margin:5px 0 0}.dap-badge{display:inline-flex;align-items:center;border:1px solid #42502f;background:#1b2415;color:var(--accent);border-radius:999px;padding:5px 8px;font-size:8px;font-weight:900;white-space:nowrap}.dap-form{padding:13px}.dap-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dap-field{display:flex;flex-direction:column;gap:6px;min-width:0}.dap-field.wide{grid-column:1/-1}.dap-field label{font-size:9px;font-weight:800;color:#c5cbd1}.dap-field textarea{width:100%;min-height:84px;border:1px solid #30363d;background:#181b1f;color:#fff;border-radius:12px;padding:10px 12px;resize:vertical;line-height:1.55;font:inherit}.dap-field textarea:focus{outline:none;border-color:#687c37;box-shadow:0 0 0 3px #d7ff5f12}.dap-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px}.dap-msg{font-size:9px;color:var(--muted);min-height:18px}.dap-save{min-width:150px}.dk-field.dabbir-activity-hidden{display:none!important}
@media(max-width:700px){.dap-card{margin-top:9px;border-radius:14px}.dap-head{padding:13px}.dap-head-row{gap:8px}.dap-head h2{font-size:13px}.dap-head p{font-size:9px}.dap-badge{font-size:7px}.dap-form{padding:10px}.dap-grid{grid-template-columns:1fr;gap:9px}.dap-field.wide{grid-column:auto}.dap-field textarea{font-size:16px;min-height:74px}.dap-actions{display:grid;grid-template-columns:1fr;gap:7px}.dap-save{width:100%;min-height:48px}.dap-msg{order:2;text-align:center}}
`;

const profiles={
  salon:{
    hideDelivery:true,
    fields:['service_catalog','pricing_notes','team_specialists','appointment_details','customer_requirements','activity_operations'],
    ar:{name:'الصالون',title:'تفاصيل الصالون',desc:'أضف ما يحتاجه دبّر لفهم خدمات الصالون والحجوزات والعميلات بدقة.',labels:{service_catalog:'الخدمات والأسعار',pricing_notes:'الأسعار والعروض والعربون',team_specialists:'الموظفات / المختصات وتخصصاتهن',appointment_details:'مدة الخدمات والفواصل بين الحجوزات',customer_requirements:'الإلغاء وعدم الحضور وتعليمات قبل الموعد',activity_operations:'ملاحظات تشغيلية مهمة'},placeholders:{service_catalog:'مثال: قص شعر 120 د.إ، مناكير 80 د.إ، صبغة من 250 د.إ',pricing_notes:'العربون، العروض، متى يتغير السعر، وما الذي يشمله السعر',team_specialists:'الأسماء والتخصصات أو المهارات التي يحتاج العميل معرفتها',appointment_details:'مدة كل خدمة، وقت التحضير أو التنظيف، وسياسة التأخير',customer_requirements:'شروط الإلغاء، عدم الحضور، وأي تعليمات قبل الموعد',activity_operations:'أي تفاصيل يومية تساعد دبّر على الرد بشكل صحيح'}},
    en:{name:'Salon',title:'Salon details',desc:'Add the details DABBIR needs to understand salon services, bookings, and clients accurately.',labels:{service_catalog:'Services & prices',pricing_notes:'Pricing, offers & deposits',team_specialists:'Team / specialists and specialties',appointment_details:'Service duration & booking buffers',customer_requirements:'Cancellation, no-show & pre-visit instructions',activity_operations:'Important operating notes'},placeholders:{service_catalog:'Example: Haircut 120 AED, manicure 80 AED, color from 250 AED',pricing_notes:'Deposits, offers, price conditions, and what is included',team_specialists:'Names and specialties or skills customers may need to know',appointment_details:'Service duration, preparation/cleanup time, and lateness policy',customer_requirements:'Cancellation, no-show, and pre-appointment instructions',activity_operations:'Daily details that help DABBIR answer correctly'}}
  },
  clinic:{
    hideDelivery:true,
    fields:['service_catalog','team_specialists','appointment_details','customer_requirements','pricing_notes','activity_operations'],
    ar:{name:'العيادة',title:'تفاصيل العيادة',desc:'معلومات المواعيد والخدمات والمختصين التي يحتاجها دبّر للرد الإداري فقط.',labels:{service_catalog:'أنواع المواعيد والخدمات',team_specialists:'الأطباء / المختصون',appointment_details:'مدة المواعيد والفواصل',customer_requirements:'تعليمات المراجع قبل الموعد',pricing_notes:'الرسوم وطرق التأكيد',activity_operations:'ملاحظات إدارية وتشغيلية'},placeholders:{service_catalog:'أنواع المواعيد أو الخدمات التي يمكن حجزها',team_specialists:'الأسماء والتخصصات ومواعيد التوفر العامة',appointment_details:'مدة الموعد، وقت الحضور المبكر، وسياسة التأخير',customer_requirements:'المستندات أو التعليمات الإدارية المطلوبة قبل الزيارة',pricing_notes:'الرسوم المعلنة، العربون أو شروط التأكيد إن وجدت',activity_operations:'معلومات إدارية غير طبية يحتاجها الرد على العملاء'}},
    en:{name:'Clinic',title:'Clinic details',desc:'Administrative appointment, service, and specialist information DABBIR can use in customer replies.',labels:{service_catalog:'Appointment types & services',team_specialists:'Doctors / specialists',appointment_details:'Appointment duration & buffers',customer_requirements:'Pre-visit instructions',pricing_notes:'Fees & confirmation rules',activity_operations:'Administrative operating notes'},placeholders:{service_catalog:'Appointment or service types that can be booked',team_specialists:'Names, specialties, and general availability',appointment_details:'Duration, early arrival, and lateness policy',customer_requirements:'Administrative documents or instructions required before a visit',pricing_notes:'Published fees, deposits, or confirmation conditions',activity_operations:'Non-medical administrative information for customer replies'}}
  },
  car_wash:{
    hideDelivery:true,
    fields:['service_catalog','pricing_notes','appointment_details','customer_requirements','activity_operations'],
    ar:{name:'غسيل السيارات',title:'تفاصيل غسيل السيارات',desc:'الخدمات والباقات ومدة الحجز وطريقة تنفيذ الخدمة بدون تعقيد إضافي.',labels:{service_catalog:'الخدمات والباقات والأسعار',pricing_notes:'فروقات السعر حسب السيارة والإضافات',appointment_details:'مدة الخدمة والحجز',customer_requirements:'تعليمات العميل قبل الخدمة',activity_operations:'طريقة تنفيذ الخدمة والموقع'},placeholders:{service_catalog:'مثال: غسيل خارجي، داخلي، تلميع، باقات وأسعارها',pricing_notes:'سيدان / SUV / مركبة كبيرة، والإضافات التي تغيّر السعر',appointment_details:'مدة كل باقة ووقت الوصول أو التأخير المسموح',customer_requirements:'مثال: توفر المركبة والمفتاح أو نقطة الكهرباء/الماء إن لزم',activity_operations:'هل الخدمة متنقلة أو في الموقع، وكيف يحدد العميل موقع المركبة'}},
    en:{name:'Car wash',title:'Car wash details',desc:'Services, packages, booking duration, and how the service is delivered without extra complexity.',labels:{service_catalog:'Services, packages & prices',pricing_notes:'Vehicle-size pricing & add-ons',appointment_details:'Service and booking duration',customer_requirements:'Customer preparation instructions',activity_operations:'Service method & location details'},placeholders:{service_catalog:'Example: exterior wash, interior, polish, packages and prices',pricing_notes:'Sedan / SUV / large vehicle differences and paid add-ons',appointment_details:'Duration per package and arrival/lateness rules',customer_requirements:'Example: vehicle/key availability or power/water access if required',activity_operations:'Whether service is mobile or on-site and how the vehicle location is provided'}}
  },
  store:{
    hideDelivery:false,
    fields:['service_catalog','pricing_notes','customer_requirements','activity_operations'],
    ar:{name:'المتجر',title:'تفاصيل المتجر',desc:'المنتجات والطلبات وشروط البيع التي يحتاجها دبّر بجانب سياسة التوصيل.',labels:{service_catalog:'فئات المنتجات والمنتجات المهمة',pricing_notes:'الأسعار والعروض والحد الأدنى',customer_requirements:'متطلبات الطلب من العميل',activity_operations:'طريقة تجهيز ومعالجة الطلبات'},placeholders:{service_catalog:'الفئات أو المنتجات الأكثر طلبًا وأي فروقات مهمة',pricing_notes:'العروض، الحد الأدنى للطلب، أو قواعد التسعير',customer_requirements:'المعلومات المطلوبة لتأكيد الطلب',activity_operations:'خطوات التجهيز والتأكيد والاستلام أو الشحن'}},
    en:{name:'Store',title:'Store details',desc:'Products, orders, and selling rules DABBIR needs alongside the delivery policy.',labels:{service_catalog:'Product categories & key products',pricing_notes:'Pricing, offers & minimums',customer_requirements:'Customer order requirements',activity_operations:'Order preparation & handling'},placeholders:{service_catalog:'Top categories/products and important variations',pricing_notes:'Offers, minimum order, or pricing rules',customer_requirements:'Information required to confirm an order',activity_operations:'Preparation, confirmation, pickup, or shipping flow'}}
  },
  creator:{
    hideDelivery:false,
    fields:['service_catalog','pricing_notes','customer_requirements','activity_operations'],
    ar:{name:'البيع عبر السوشيال',title:'تفاصيل الطلبات والبيع',desc:'معلومات عملية للبائعين عبر Instagram وWhatsApp.',labels:{service_catalog:'المنتجات أو أنواع الطلبات',pricing_notes:'الأسعار والعروض',customer_requirements:'بيانات تأكيد الطلب',activity_operations:'طريقة معالجة الطلبات'},placeholders:{service_catalog:'المنتجات أو الفئات التي تبيعها',pricing_notes:'العروض أو قواعد السعر',customer_requirements:'الاسم، الهاتف، المقاس/اللون أو أي بيانات لازمة',activity_operations:'من استقبال الرسالة حتى تجهيز الطلب وتسليمه'}},
    en:{name:'Social selling',title:'Order & selling details',desc:'Practical information for Instagram and WhatsApp sellers.',labels:{service_catalog:'Products or order types',pricing_notes:'Pricing & offers',customer_requirements:'Order confirmation details',activity_operations:'Order handling flow'},placeholders:{service_catalog:'Products or categories you sell',pricing_notes:'Offers or pricing rules',customer_requirements:'Name, phone, size/color, or other required details',activity_operations:'From incoming message to prepared and handed-off order'}}
  },
  laundry:{
    hideDelivery:false,
    fields:['service_catalog','pricing_notes','appointment_details','customer_requirements','activity_operations'],
    ar:{name:'المغسلة',title:'تفاصيل المغسلة',desc:'أنواع الغسيل والأسعار ومدة الإنجاز والاستلام والتسليم.',labels:{service_catalog:'الخدمات والأسعار',pricing_notes:'التسعير والإضافات',appointment_details:'مدة الإنجاز وأوقات الاستلام',customer_requirements:'تعليمات القطع من العميل',activity_operations:'مسار الاستلام والغسيل والجاهزية'},placeholders:{service_catalog:'غسيل، كي، تنظيف جاف وغيرها مع الأسعار',pricing_notes:'التسعير بالقطعة/الوزن وأي إضافات',appointment_details:'المدة المعتادة ومواعيد الاستلام أو التسليم',customer_requirements:'تعليمات خاصة للبقع أو القطع الحساسة',activity_operations:'كيف ينتقل الطلب من الاستلام حتى الجاهزية'}},
    en:{name:'Laundry',title:'Laundry details',desc:'Cleaning types, pricing, turnaround, intake, and handoff.',labels:{service_catalog:'Services & prices',pricing_notes:'Pricing & add-ons',appointment_details:'Turnaround & handoff timing',customer_requirements:'Garment instructions',activity_operations:'Intake-to-ready workflow'},placeholders:{service_catalog:'Wash, press, dry-cleaning, etc. with prices',pricing_notes:'Per-item/weight pricing and add-ons',appointment_details:'Typical turnaround and pickup/delivery timing',customer_requirements:'Special stain or delicate-item instructions',activity_operations:'How an order moves from received to ready'}}
  },
  services:{
    hideDelivery:true,
    fields:['service_catalog','pricing_notes','appointment_details','customer_requirements','activity_operations'],
    ar:{name:'الخدمات',title:'تفاصيل الخدمات',desc:'الخدمات والأسعار والمواعيد ومتطلبات العميل حسب طبيعة العمل.',labels:{service_catalog:'الخدمات والأسعار',pricing_notes:'التسعير والإضافات',appointment_details:'مدة الخدمة والمواعيد',customer_requirements:'ما يحتاجه العميل قبل الخدمة',activity_operations:'طريقة تنفيذ العمل'},placeholders:{service_catalog:'الخدمات المتاحة وما يشمله كل خيار',pricing_notes:'الأسعار الأساسية والإضافات',appointment_details:'مدة العمل وسياسة الموعد أو التأخير',customer_requirements:'البيانات أو التجهيزات المطلوبة من العميل',activity_operations:'كيف يبدأ العمل وكيف يعتبر مكتملًا'}},
    en:{name:'Services',title:'Service details',desc:'Services, pricing, appointments, and customer requirements for this activity.',labels:{service_catalog:'Services & prices',pricing_notes:'Pricing & add-ons',appointment_details:'Service duration & appointments',customer_requirements:'Customer preparation',activity_operations:'How work is performed'},placeholders:{service_catalog:'Available services and what each includes',pricing_notes:'Base pricing and add-ons',appointment_details:'Work duration and appointment/lateness policy',customer_requirements:'Information or preparation required from the customer',activity_operations:'How work starts and when it is considered complete'}}
  },
  real_estate:{
    hideDelivery:true,
    fields:['service_catalog','team_specialists','appointment_details','customer_requirements','activity_operations'],
    ar:{name:'العقار',title:'تفاصيل النشاط العقاري',desc:'أنواع العقارات والمعاينات والمتابعات ومعلومات العميل المطلوبة.',labels:{service_catalog:'أنواع العقارات والخدمات',team_specialists:'المسؤولون / الوسطاء',appointment_details:'المعاينات والمواعيد',customer_requirements:'بيانات العميل المطلوبة',activity_operations:'المتابعة والتشغيل'},placeholders:{service_catalog:'بيع، إيجار، إدارة أو أنواع العقارات المتاحة',team_specialists:'الأسماء أو الاختصاصات ذات الصلة',appointment_details:'طريقة حجز المعاينة ومدة الموعد',customer_requirements:'الميزانية، المنطقة، نوع العقار أو أي بيانات مطلوبة',activity_operations:'آلية المتابعة بعد الاستفسار أو المعاينة'}},
    en:{name:'Real estate',title:'Real-estate details',desc:'Property types, viewings, follow-ups, and customer requirements.',labels:{service_catalog:'Property types & services',team_specialists:'Agents / responsible team',appointment_details:'Viewings & appointments',customer_requirements:'Required customer details',activity_operations:'Follow-up operations'},placeholders:{service_catalog:'Sale, rent, management, or property types available',team_specialists:'Relevant names or specialties',appointment_details:'How viewings are booked and appointment duration',customer_requirements:'Budget, area, property type, or other required details',activity_operations:'Follow-up flow after an inquiry or viewing'}}
  },
  other:{
    hideDelivery:false,
    fields:['service_catalog','pricing_notes','customer_requirements','activity_operations'],
    ar:{name:'النشاط',title:'تفاصيل إضافية للنشاط',desc:'أضف المعلومات المتكررة التي يحتاجها دبّر لفهم عملك والرد بدقة.',labels:{service_catalog:'المنتجات أو الخدمات',pricing_notes:'الأسعار والعروض',customer_requirements:'متطلبات العميل',activity_operations:'طريقة تشغيل العمل'},placeholders:{service_catalog:'أهم المنتجات أو الخدمات',pricing_notes:'الأسعار أو قواعد التسعير',customer_requirements:'ما يجب أن يقدمه العميل',activity_operations:'أي خطوات تشغيلية مهمة'}},
    en:{name:'Business',title:'Additional business details',desc:'Add recurring information DABBIR needs to understand the business and answer accurately.',labels:{service_catalog:'Products or services',pricing_notes:'Pricing & offers',customer_requirements:'Customer requirements',activity_operations:'Operating flow'},placeholders:{service_catalog:'Key products or services',pricing_notes:'Pricing or pricing rules',customer_requirements:'What the customer must provide',activity_operations:'Important operating steps'}}
  }
};

const client=String.raw`
(()=>{
  if(window.__dabbirBusinessActivityProfile)return;
  window.__dabbirBusinessActivityProfile=true;
  const style=document.createElement('style');style.dataset.dabbirActivityProfile='v1';style.textContent=${JSON.stringify(css)};document.head.append(style);
  const profiles=${JSON.stringify(profiles)};
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const business=()=>{try{if(typeof workspace!=='undefined'&&workspace?.business)return workspace.business}catch{}return window.workspace?.business||null};
  const type=()=>String(business()?.business_type||'other').toLowerCase();
  const profile=()=>profiles[type()]||profiles.other;
  const copy=()=>profile()[ar()?'ar':'en'];
  const esc=value=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let loadedFor='',values={},busy=false,lastRenderKey='';

  function genericCard(){return q('.dabbir-knowledge-card')}
  function applyGenericVisibility(){
    const p=profile();
    const delivery=q('.dk-field[data-key="delivery_policy"]');
    if(delivery)delivery.classList.toggle('dabbir-activity-hidden',Boolean(p.hideDelivery));
  }

  function ensureCard(){
    const base=genericCard();if(!base||!business()?.id)return null;
    applyGenericVisibility();
    let card=q('#dabbirActivityDetailsCard');
    if(!card){card=document.createElement('section');card.id='dabbirActivityDetailsCard';card.className='dap-card';base.insertAdjacentElement('afterend',card)}
    return card;
  }

  function render(){
    const card=ensureCard();if(!card)return;
    const p=profile(),c=copy(),renderKey=[business().id,type(),ar()?'ar':'en',p.fields.join(',')].join('|');
    if(renderKey===lastRenderKey&&card.dataset.ready==='1')return;
    lastRenderKey=renderKey;
    card.innerHTML='<div class="dap-head"><div class="dap-head-row"><div><h2>'+esc(c.title)+'</h2><p>'+esc(c.desc)+'</p></div><span class="dap-badge">'+esc(c.name)+'</span></div></div><form class="dap-form" id="dabbirActivityDetailsForm"><div class="dap-grid">'+p.fields.map((key,index)=>'<div class="dap-field '+(index===p.fields.length-1&&p.fields.length%2?'wide':'')+'" data-activity-key="'+esc(key)+'"><label>'+esc(c.labels[key]||key)+'</label><textarea maxlength="1800" placeholder="'+esc(c.placeholders[key]||'')+'">'+esc(values[key]||'')+'</textarea></div>').join('')+'</div><div class="dap-actions"><div class="dap-msg" id="dabbirActivityDetailsMsg"></div><button class="primary dap-save" type="submit">'+esc(ar()?'حفظ تفاصيل النشاط':'Save activity details')+'</button></div></form>';
    q('#dabbirActivityDetailsForm').onsubmit=save;
    card.dataset.ready='1';
  }

  function message(value,isError=false){const node=q('#dabbirActivityDetailsMsg');if(node){node.textContent=value||'';node.style.color=isError?'#ff9b9b':''}}

  async function load(force=false){
    const id=business()?.id;if(!id||busy)return;
    const key=id+'|'+type();
    if(!force&&loadedFor===key){render();return}
    busy=true;render();message(ar()?'جارٍ تحميل تفاصيل النشاط…':'Loading activity details…');
    try{
      const response=await fetch('/api/business-activity-profile?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_LOAD_FAILED');
      values=body.facts||{};loadedFor=key;lastRenderKey='';render();message('');
    }catch(error){message(ar()?'تعذر تحميل تفاصيل النشاط':'Could not load activity details',true)}finally{busy=false}
  }

  async function save(event){
    event.preventDefault();if(busy)return;
    const id=business()?.id;if(!id)return;
    const form=q('#dabbirActivityDetailsForm');if(!form)return;
    const facts={};form.querySelectorAll('[data-activity-key]').forEach(field=>{facts[field.dataset.activityKey]=field.querySelector('textarea')?.value||''});
    const button=form.querySelector('button[type="submit"]');busy=true;if(button)button.disabled=true;message(ar()?'جارٍ الحفظ…':'Saving…');
    try{
      const response=await fetch('/api/business-activity-profile',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,facts})});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_SAVE_FAILED');
      values=body.facts||facts;loadedFor=id+'|'+type();message(ar()?'تم الحفظ — أصبح دبّر يعرف تفاصيل نشاطك':'Saved — DABBIR now has your activity details');
    }catch(error){message(ar()?'تعذر حفظ تفاصيل النشاط':'Could not save activity details',true)}finally{busy=false;if(button)button.disabled=false}
  }

  function enforce(){
    if(!business()?.id)return;
    applyGenericVisibility();ensureCard();render();load(false);
  }

  const observer=new MutationObserver(()=>{if(genericCard()&&business()?.id)setTimeout(enforce,0)});
  observer.observe(document.body,{subtree:true,childList:true});
  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);setTimeout(enforce,0);return result}}catch{}
  try{const baseApplyLang=applyLang;applyLang=function(){const result=baseApplyLang.apply(this,arguments);lastRenderKey='';setTimeout(enforce,0);return result}}catch{}
  setTimeout(enforce,0);setTimeout(enforce,500);setTimeout(enforce,1500);
  window.__dabbirBusinessActivityProfileApi={refresh:()=>{loadedFor='';lastRenderKey='';enforce()},version:'activity-business-profile-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-business-activity-profile','v1');
  return res.status(200).send(client);
}
