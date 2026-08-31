const css=String.raw`
.dax-card{margin:0 0 12px;border:1px solid #30363c;background:linear-gradient(180deg,#15191d,#101214);border-radius:18px;padding:14px}.dax-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dax-head h2{font-size:15px;margin:0}.dax-head p{font-size:10px;line-height:1.65;color:var(--muted);margin:5px 0 0}.dax-actions{display:flex;gap:7px;flex-wrap:wrap}.dax-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}.dax-metric{border:1px solid #292e34;background:#131619;border-radius:13px;padding:9px}.dax-metric strong{display:block;font-size:20px}.dax-metric span{display:block;color:var(--muted);font-size:8px;margin-top:3px}.dax-board{display:grid;grid-template-columns:repeat(4,minmax(180px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px}.dax-col{border:1px solid var(--line);background:#101214;border-radius:15px;min-height:160px;padding:9px}.dax-col-head{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-bottom:8px}.dax-col-head b{font-size:10px}.dax-count{font-size:8px;color:var(--muted);border:1px solid #30363d;border-radius:999px;padding:3px 6px}.dax-order{border:1px solid #2b3036;background:#171a1d;border-radius:12px;padding:10px;margin-top:7px}.dax-order b{display:block;font-size:10px}.dax-order small{display:block;color:var(--muted);font-size:8px;line-height:1.55;margin-top:3px}.dax-order-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.dax-order-actions button{min-height:34px;padding:6px 8px;font-size:8px}.dax-empty{padding:18px 8px;text-align:center;color:var(--muted);font-size:9px}.dax-workflow-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.dax-workflow-hero h1{margin:0 0 5px;font-size:25px}.dax-workflow-hero p{margin:0;color:var(--muted);font-size:11px;line-height:1.65}.dax-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dax-form-grid .wide{grid-column:1/-1}.dax-form-grid textarea{width:100%;min-height:80px;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:12px;padding:11px;resize:vertical;font:inherit}.dax-mode-badge{display:inline-flex;align-items:center;border:1px solid #42502f;background:#1b2415;color:var(--accent);border-radius:999px;padding:5px 8px;font-size:8px;font-weight:900;margin-bottom:7px}
@media(max-width:700px){.dax-card{padding:12px}.dax-head{display:block}.dax-actions{margin-top:10px}.dax-actions button{flex:1}.dax-metrics{grid-template-columns:repeat(2,1fr)}.dax-board{grid-template-columns:repeat(4,78vw);scroll-snap-type:x proximity}.dax-col{scroll-snap-align:start}.dax-workflow-hero{align-items:center}.dax-workflow-hero h1{font-size:21px}.dax-form-grid{grid-template-columns:1fr}.dax-form-grid .wide{grid-column:auto}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirActivityExperience)return;
  window.__dabbirActivityExperience=true;
  const style=document.createElement('style');style.dataset.dabbirActivityExperience='v1';style.textContent=${JSON.stringify(css)};document.head.append(style);
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  function ws(){try{if(typeof workspace!=='undefined'&&workspace)return workspace}catch{}return window.workspace||null}
  const type=()=>String(ws()?.business?.business_type||'').toLowerCase();
  const orderTypes=new Set(['creator','laundry','services']);
  const appointmentTypes=new Set(['clinic','salon','car_wash','real_estate']);

  const flows={
    creator:{
      ar:{name:'طلبات البيع',desc:'كل طلب من الرسالة حتى التسليم.',nav:'الطلبات',cta:'+ طلب جديد',open:'فتح الطلبات',states:[['new','جديد'],['confirmed','مؤكد'],['preparing','قيد التجهيز'],['ready','جاهز'],['delivered','تم التسليم']]},
      en:{name:'Sales orders',desc:'Every order from message to delivery.',nav:'Orders',cta:'+ New order',open:'Open orders',states:[['new','New'],['confirmed','Confirmed'],['preparing','Preparing'],['ready','Ready'],['delivered','Delivered']]}
    },
    laundry:{
      ar:{name:'طلبات المغسلة',desc:'من الاستلام إلى الجاهزية والتسليم.',nav:'الغسيل',cta:'+ استلام',open:'فتح الطلبات',states:[['received','تم الاستلام'],['washing','قيد الغسيل'],['ready','جاهز'],['delivered','تم التسليم']]},
      en:{name:'Laundry orders',desc:'From intake to ready and delivered.',nav:'Laundry',cta:'+ Intake',open:'Open orders',states:[['received','Received'],['washing','Washing'],['ready','Ready'],['delivered','Delivered']]}
    },
    services:{
      ar:{name:'الأعمال',desc:'اعرف ما هو جديد وما تحت العمل وما أصبح جاهزًا.',nav:'الأعمال',cta:'+ عمل جديد',open:'فتح الأعمال',states:[['new','جديد'],['in_progress','تحت العمل'],['ready','جاهز'],['completed','مكتمل']]},
      en:{name:'Jobs',desc:'See what is new, in progress, ready, and complete.',nav:'Jobs',cta:'+ New job',open:'Open jobs',states:[['new','New'],['in_progress','In progress'],['ready','Ready'],['completed','Complete']]}
    }
  };

  const appointmentCopy={
    salon:{ar:['حجوزات اليوم','موعدك القادم وسجل العميل في مكان واحد.','+ حجز'],en:['Today’s bookings','Your next appointment and customer history in one place.','+ Booking']},
    clinic:{ar:['مواعيد اليوم','من التالي وما الذي يحتاج متابعة؟','+ موعد'],en:['Today’s appointments','Who is next and what needs follow-up?','+ Appointment']},
    car_wash:{ar:['جدول اليوم','الحجوزات القادمة والوقت المتاح بوضوح.','+ حجز'],en:['Today’s schedule','Upcoming bookings and free time at a glance.','+ Booking']},
    real_estate:{ar:['مواعيد اليوم','المعاينات والمتابعات القادمة في مكان واحد.','+ موعد'],en:['Today’s appointments','Upcoming viewings and follow-ups in one place.','+ Appointment']}
  };

  let workflowData=null,workflowBusinessId=null,loading=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  function localeFlow(){const f=flows[type()];return f?.[ar()?'ar':'en']||null}
  function initialState(){return type()==='laundry'?'received':'new'}
  function money(v){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v||0))+' '+(ar()?'د.إ':'AED')}catch{return String(v||0)}}

  function ensureWorkflowScreen(){
    if(!orderTypes.has(type()))return null;
    let screen=q('#screen-workflow');
    if(!screen){screen=document.createElement('section');screen.id='screen-workflow';screen.className='screen';q('.content')?.append(screen)}
    if(!q('#daxWorkflowRoot'))screen.innerHTML='<div id="daxWorkflowRoot"><div class="dax-workflow-hero"><div><span class="dax-mode-badge" id="daxModeBadge"></span><h1 id="daxWorkflowTitle"></h1><p id="daxWorkflowDesc"></p></div><button class="primary" id="daxNewOrder" type="button"></button></div><div id="daxWorkflowBody"></div></div>';
    q('#daxNewOrder')?.addEventListener('click',openOrderModal,{once:true});
    return screen;
  }

  function ensureOrderModal(){
    if(q('#daxOrderModal'))return;
    const modal=document.createElement('div');modal.className='modal';modal.id='daxOrderModal';
    modal.innerHTML='<form class="modalBox" id="daxOrderForm"><h3 id="daxOrderFormTitle"></h3><div class="dax-form-grid"><div class="field"><label id="daxCustomerLabel"></label><input id="daxCustomer" maxlength="120" required></div><div class="field"><label id="daxPhoneLabel"></label><input id="daxPhone" inputmode="tel" maxlength="40"></div><div class="field"><label id="daxTotalLabel"></label><input id="daxTotal" type="number" inputmode="decimal" min="0" max="10000000" step="0.01" value="0"></div><div class="field wide"><label id="daxNoteLabel"></label><textarea id="daxNote" maxlength="240"></textarea></div></div><div class="modalActions"><button class="secondary" id="daxCancel" type="button"></button><button class="primary" id="daxSave" type="submit"></button></div></form>';
    document.body.append(modal);q('#daxCancel').onclick=()=>modal.classList.remove('open');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});q('#daxOrderForm').onsubmit=createOrder;
  }

  function applyWorkflowCopy(){
    if(!orderTypes.has(type()))return;
    ensureWorkflowScreen();ensureOrderModal();const f=localeFlow();
    q('#daxModeBadge').textContent=ar()?'وضع النشاط':'Business mode';q('#daxWorkflowTitle').textContent=f.name;q('#daxWorkflowDesc').textContent=f.desc;q('#daxNewOrder').textContent=f.cta;
    q('#daxOrderFormTitle').textContent=f.cta.replace(/^\+\s*/, '');q('#daxCustomerLabel').textContent=ar()?'اسم العميل':'Customer name';q('#daxPhoneLabel').textContent=ar()?'الهاتف (اختياري)':'Phone (optional)';q('#daxTotalLabel').textContent=ar()?'القيمة (درهم)':'Amount (AED)';q('#daxNoteLabel').textContent=ar()?'ملاحظة / تفاصيل العمل':'Note / job details';q('#daxCancel').textContent=ar()?'إلغاء':'Cancel';q('#daxSave').textContent=ar()?'حفظ':'Save';
    try{if(typeof current!=='undefined'&&current==='workflow'&&q('#pageTitle'))q('#pageTitle').textContent=f.nav}catch{}
  }

  async function requestWorkflow(options={}){
    const businessId=ws()?.business?.id;if(!businessId)throw new Error('BUSINESS_REQUIRED');
    const response=await fetch('/api/activity-workflow?business_id='+encodeURIComponent(businessId),{credentials:'same-origin',cache:'no-store',...options,headers:{accept:'application/json','content-type':'application/json','x-dabbir-client':'web',...(options.headers||{})}});
    const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'WORKFLOW_FAILED');return payload;
  }

  async function loadWorkflow(force=false){
    if(!orderTypes.has(type())||loading)return;
    const businessId=ws()?.business?.id;if(!businessId)return;
    if(!force&&workflowData&&workflowBusinessId===businessId){renderWorkflow();renderDashboardMode();return}
    loading=true;try{workflowData=await requestWorkflow();workflowBusinessId=businessId}catch(error){workflowData={error:String(error?.message||error)}}finally{loading=false;renderWorkflow();renderDashboardMode()}
  }

  function nextState(state){const states=localeFlow()?.states||[];const i=states.findIndex(([key])=>key===state);return i>=0&&i<states.length-1?states[i+1]:null}
  function stateLabel(state){return (localeFlow()?.states||[]).find(([key])=>key===state)?.[1]||state}
  async function advance(order){const next=nextState(order.workflow_status);if(!next)return;try{await requestWorkflow({method:'POST',body:JSON.stringify({action:'update_workflow',business_id:ws().business.id,order_id:order.id,workflow_status:next})});notify(ar()?'تم تحديث الحالة':'Status updated');workflowData=null;await loadWorkflow(true)}catch(e){notify(ar()?'تعذر تحديث الحالة':'Could not update status')}}
  async function copyStatus(order){const token=String(order.public_status_token||'');if(!token)return notify(ar()?'رابط الحالة غير متاح':'Status link unavailable');const url=location.origin+'/status.html?token='+encodeURIComponent(token);try{await navigator.clipboard.writeText(url);notify(ar()?'تم نسخ رابط العميل':'Customer link copied')}catch{prompt(ar()?'انسخ الرابط':'Copy link',url)}}

  function renderWorkflow(){
    const body=q('#daxWorkflowBody');if(!body||!orderTypes.has(type()))return;const f=localeFlow();
    if(loading&&!workflowData){body.innerHTML='<div class="empty">'+esc(ar()?'جارٍ تحميل الأعمال…':'Loading…')+'</div>';return}
    if(workflowData?.error){body.innerHTML='<div class="empty">'+esc(ar()?'تعذر تحميل الأعمال.':'Could not load workflow.')+'</div>';return}
    const orders=Array.isArray(workflowData?.orders)?workflowData.orders:[];
    body.innerHTML='<div class="dax-board">'+f.states.slice(0,4).map(([key,label])=>{const rows=orders.filter(o=>o.workflow_status===key);return '<section class="dax-col"><div class="dax-col-head"><b>'+esc(label)+'</b><span class="dax-count">'+rows.length+'</span></div>'+(rows.length?rows.map(o=>'<article class="dax-order" data-dax-order="'+esc(o.id)+'"><b>'+esc(o.customer_name|| (ar()?'عميل':'Customer'))+'</b><small>'+esc(money(o.total_aed))+(o.note?' · '+esc(o.note):'')+'</small><div class="dax-order-actions">'+(nextState(o.workflow_status)?'<button class="primary" data-dax-next="'+esc(o.id)+'" type="button">'+esc(ar()?'التالي: ':'Next: ')+esc(stateLabel(nextState(o.workflow_status)))+'</button>':'')+'<button class="secondary" data-dax-link="'+esc(o.id)+'" type="button">'+esc(ar()?'رابط العميل':'Customer link')+'</button></div></article>').join(''):'<div class="dax-empty">'+esc(ar()?'لا يوجد':'Empty')+'</div>')+'</section>'}).join('')+'</div>';
    body.querySelectorAll('[data-dax-next]').forEach(btn=>btn.onclick=()=>advance(orders.find(o=>o.id===btn.dataset.daxNext)));body.querySelectorAll('[data-dax-link]').forEach(btn=>btn.onclick=()=>copyStatus(orders.find(o=>o.id===btn.dataset.daxLink)));
  }

  function openOrderModal(){ensureOrderModal();applyWorkflowCopy();q('#daxOrderForm').reset();q('#daxTotal').value='0';q('#daxOrderModal').classList.add('open');setTimeout(()=>q('#daxCustomer')?.focus(),50)}
  async function createOrder(event){event.preventDefault();if(loading)return;const save=q('#daxSave');save.disabled=true;try{await requestWorkflow({method:'POST',body:JSON.stringify({action:'create_order',business_id:ws().business.id,display_name:q('#daxCustomer').value.trim(),phone:q('#daxPhone').value.trim(),total_aed:Number(q('#daxTotal').value||0),note:q('#daxNote').value.trim(),workflow_status:initialState()})});q('#daxOrderModal').classList.remove('open');notify(ar()?'تم حفظ الطلب':'Order saved');workflowData=null;await loadWorkflow(true)}catch(e){notify(ar()?'تعذر حفظ الطلب':'Could not save order')}finally{save.disabled=false}}

  function ensureDashboardCard(){
    const dash=q('#screen-dashboard');if(!dash||!type())return null;let card=q('#dabbirActivityModeCard');if(!card){card=document.createElement('section');card.id='dabbirActivityModeCard';card.className='dax-card';const action=q('#dabbirActionCenter');if(action?.parentNode)action.parentNode.insertBefore(card,action);else dash.prepend(card)}return card;
  }

  function renderDashboardMode(){
    const card=ensureDashboardCard();if(!card)return;const currentType=type();
    if(orderTypes.has(currentType)){
      const f=localeFlow(),orders=Array.isArray(workflowData?.orders)?workflowData.orders:[];const metrics=f.states.slice(0,4).map(([key,label])=>'<div class="dax-metric"><strong>'+orders.filter(o=>o.workflow_status===key).length+'</strong><span>'+esc(label)+'</span></div>').join('');
      card.innerHTML='<div class="dax-head"><div><span class="dax-mode-badge">'+esc(ar()?'دبّر يفهم نشاطك':'Activity mode')+'</span><h2>'+esc(f.name)+'</h2><p>'+esc(f.desc)+'</p></div><div class="dax-actions"><button class="primary" id="daxDashCreate" type="button">'+esc(f.cta)+'</button><button class="secondary" id="daxDashOpen" type="button">'+esc(f.open)+'</button></div></div><div class="dax-metrics">'+metrics+'</div>';
      q('#daxDashCreate').onclick=openOrderModal;q('#daxDashOpen').onclick=()=>{try{showScreen('workflow')}catch{}};
    }else if(appointmentTypes.has(currentType)){
      const c=appointmentCopy[currentType]?.[ar()?'ar':'en']||appointmentCopy.clinic[ar()?'ar':'en'];
      card.innerHTML='<div class="dax-head"><div><span class="dax-mode-badge">'+esc(ar()?'دبّر يفهم نشاطك':'Activity mode')+'</span><h2>'+esc(c[0])+'</h2><p>'+esc(c[1])+'</p></div><div class="dax-actions"><button class="primary" id="daxDashAppt" type="button">'+esc(c[2])+'</button></div></div>';
      q('#daxDashAppt').onclick=()=>{try{showScreen('appointments');setTimeout(()=>q('#newApptBtn')?.click(),30)}catch{}};
    }else if(currentType==='store'){
      card.innerHTML='<div class="dax-head"><div><span class="dax-mode-badge">'+esc(ar()?'وضع المتجر':'Store mode')+'</span><h2>'+esc(ar()?'بيعك ومخزونك أمامك':'Sales and stock at a glance')+'</h2><p>'+esc(ar()?'ادخل العمليات للوصول إلى البيع والمخزون والطلبات.':'Open operations for sales, stock, and orders.')+'</p></div><div class="dax-actions"><button class="primary" id="daxDashStore" type="button">'+esc(ar()?'فتح العمليات':'Open operations')+'</button></div></div>';q('#daxDashStore').onclick=()=>{try{showScreen('operations')}catch{}};
    }else card.remove();
  }

  function enforce(){if(!ws()?.business?.id)return;ensureWorkflowScreen();applyWorkflowCopy();renderDashboardMode();if(orderTypes.has(type()))loadWorkflow(false)}

  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);setTimeout(enforce,0);return result}}catch{}
  try{const baseApplyLang=applyLang;applyLang=function(){const result=baseApplyLang.apply(this,arguments);setTimeout(enforce,0);return result}}catch{}
  try{const baseShowScreen=showScreen;showScreen=function(name){const result=baseShowScreen.call(this,name);setTimeout(enforce,0);if(name==='workflow')loadWorkflow(false);return result}}catch{}
  setTimeout(enforce,0);setTimeout(enforce,500);setTimeout(enforce,1500);
  window.__dabbirActivityExperienceApi={refresh:()=>{workflowData=null;enforce()},version:'activity-experience-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-activity-experience','v1');
  return res.status(200).send(client);
}
