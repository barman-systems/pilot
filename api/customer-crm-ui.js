const script=String.raw`(()=>{
  if(window.__dabbirCustomerCrmUi)return;
  window.__dabbirCustomerCrmUi=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const copy=()=>ar()?{
    total:'إجمالي العملاء',newCustomers:'عملاء جدد',repeat:'عملاء متكررون',inactive:'غير نشطين',
    search:'ابحث بالاسم أو رقم الهاتف…',all:'كل العملاء',newStatus:'جديد',repeatStatus:'متكرر',inactiveStatus:'غير نشط',
    sortLatest:'الأحدث نشاطًا',sortActivity:'الأكثر تعاملًا',sortName:'الاسم',
    appointments:'الحجوزات',conversations:'المحادثات',orders:'الطلبات',spent:'إجمالي التعاملات',
    lastActivity:'آخر تعامل',created:'منذ',phone:'الهاتف',noPhone:'لا يوجد رقم محفوظ',
    call:'اتصال',whatsapp:'واتساب',newBooking:'حجز جديد',newOrder:'طلب جديد',close:'إغلاق',
    customerHistory:'سجل العميل',recentAppointments:'آخر الحجوزات',recentOrders:'آخر الطلبات',notes:'ملاحظات',noNotes:'لا توجد ملاحظات.',
    noResults:'لا توجد نتائج مطابقة.',merged:'سجلات موحّدة لنفس الرقم',
    orderProduct:'المنتج',orderQty:'الكمية',payment:'طريقة الدفع',cash:'نقدي',card:'بطاقة',transfer:'تحويل',credit:'آجل',other:'أخرى',saveOrder:'تأكيد الطلب',cancel:'إلغاء',orderSaved:'تم إنشاء الطلب وربطه بالعميل.',orderFailed:'تعذر إنشاء الطلب.',loadingOrders:'جارٍ تحميل سجل الطلبات…',
    statuses:{new:'جديد',active:'نشط',qualified:'مهتم',converted:'عميل',won:'عميل',closed:'مغلق',inactive:'غير نشط',lost:'غير نشط'}
  }:{
    total:'Total customers',newCustomers:'New customers',repeat:'Repeat customers',inactive:'Inactive',
    search:'Search name or phone…',all:'All customers',newStatus:'New',repeatStatus:'Repeat',inactiveStatus:'Inactive',
    sortLatest:'Latest activity',sortActivity:'Most activity',sortName:'Name',
    appointments:'Bookings',conversations:'Conversations',orders:'Orders',spent:'Total value',
    lastActivity:'Last activity',created:'Since',phone:'Phone',noPhone:'No phone stored',
    call:'Call',whatsapp:'WhatsApp',newBooking:'New booking',newOrder:'New order',close:'Close',
    customerHistory:'Customer history',recentAppointments:'Recent bookings',recentOrders:'Recent orders',notes:'Notes',noNotes:'No notes.',
    noResults:'No matching customers.',merged:'records merged for the same number',
    orderProduct:'Product',orderQty:'Quantity',payment:'Payment method',cash:'Cash',card:'Card',transfer:'Transfer',credit:'Credit',other:'Other',saveOrder:'Confirm order',cancel:'Cancel',orderSaved:'Order created and linked to customer.',orderFailed:'Could not create order.',loadingOrders:'Loading order history…',
    statuses:{new:'New',active:'Active',qualified:'Qualified',converted:'Customer',won:'Customer',closed:'Closed',inactive:'Inactive',lost:'Inactive'}
  };



  let state={query:'',filter:'all',sort:'latest',selected:null};
  let operationsCache=null;
  let operationsBusinessId=null;
  let operationsLoading=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function lower(value){return String(value||'').trim().toLocaleLowerCase()}
  function date(value,withTime=false){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{style:'currency',currency:'AED',maximumFractionDigits:2}).format(Number(value||0))}catch{return Number(value||0).toFixed(2)+' AED'}}
  function metadata(customer){const value=customer?.metadata;if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return{}}}
  function phoneOf(customer){const m=metadata(customer);const candidates=[m.phone,m.phone_number,m.whatsapp,m.whatsapp_number,m.wa_id,m.sender_phone,m.sender,m.mobile,m.contact_phone];for(const value of candidates){const raw=String(value||'').trim();if(raw){const digits=raw.replace(/\D/g,'');if(digits.length>=7)return{raw,digits}}}return null}
  function noteOf(customer){const m=metadata(customer);return String(m.note||m.notes||m.customer_note||m.internal_note||'').trim()}
  function statusLabel(value){const key=String(value||'new').toLowerCase();return copy().statuses[key]||key}
  function maxDate(values){let best=null,bestMs=-Infinity;for(const value of values){if(!value)continue;const ms=new Date(value).getTime();if(Number.isFinite(ms)&&ms>bestMs){best=value;bestMs=ms}}return best}
  function isRecent(value,days){const ms=new Date(value||0).getTime();return Number.isFinite(ms)&&Date.now()-ms<=days*86400000}

  function buildCustomers(){
    const rows=Array.isArray(workspace?.customers)?workspace.customers:[];
    const groups=[];
    const byPhone=new Map();
    for(const customer of rows){
      const phone=phoneOf(customer);
      if(phone){
        const key=phone.digits;
        if(byPhone.has(key)){byPhone.get(key).members.push(customer);continue}
        const group={members:[customer],phone};byPhone.set(key,group);groups.push(group);
      }else groups.push({members:[customer],phone:null});
    }
    const conversations=Array.isArray(workspace?.conversations)?workspace.conversations:[];
    const appointments=Array.isArray(workspace?.appointments)?workspace.appointments:[];
    return groups.map(group=>{
      const ids=new Set(group.members.map(item=>item.id));
      const conv=conversations.filter(item=>ids.has(item.customer_id));
      const appts=appointments.filter(item=>ids.has(item.customer_id));
      const memberLatest=maxDate(group.members.map(item=>item.created_at));
      const last=maxDate([...conv.map(item=>item.updated_at||item.created_at),...appts.map(item=>item.starts_at||item.created_at),memberLatest]);
      const newest=[...group.members].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||group.members[0];
      const name=group.members.map(item=>String(item.display_name||'').trim()).find(Boolean)||'—';
      const activityCount=conv.length+appts.length;
      const rawStatus=String(newest?.lead_status||'new').toLowerCase();
      const inactive=rawStatus==='inactive'||rawStatus==='lost'||(!isRecent(last,60)&&!isRecent(memberLatest,60));
      const repeat=activityCount>=2;
      const isNew=rawStatus==='new'||isRecent(memberLatest,30);
      return {
        key:group.phone?'phone:'+group.phone.digits:'id:'+String(newest?.id||Math.random()),
        id:newest?.id||null,ids:[...ids],name,phone:group.phone,status:rawStatus,created:memberLatest,last,conversations:conv,appointments:appts,activityCount,repeat,inactive,isNew,merged:group.members.length,notes:group.members.map(noteOf).filter(Boolean).join('\n'),members:group.members
      };
    });
  }

  async function loadOperations(){
    const businessId=workspace?.business?.id||null;
    if(!businessId)return null;
    if(operationsCache&&operationsBusinessId===businessId)return operationsCache;
    if(operationsLoading)return operationsLoading;
    operationsBusinessId=businessId;
    operationsLoading=(async()=>{
      try{
        const response=await fetch('/api/owner-operations?business_id='+encodeURIComponent(businessId),{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'}});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok)return null;
        operationsCache=payload;
        return payload;
      }catch{return null}finally{operationsLoading=null}
    })();
    return operationsLoading;
  }

  function ordersFor(customer,ops){
    if(!ops||!Array.isArray(ops.orders))return[];
    const ids=new Set(customer.ids);
    return ops.orders.filter(order=>ids.has(order.customer_id)&&order.simulated===false);
  }

  function metrics(customers){
    return {total:customers.length,newCustomers:customers.filter(c=>c.isNew).length,repeat:customers.filter(c=>c.repeat).length,inactive:customers.filter(c=>c.inactive).length};
  }

  function filtered(customers){
    const query=lower(state.query);
    let rows=customers.filter(customer=>{
      if(query&&!lower(customer.name+' '+(customer.phone?.raw||customer.phone?.digits||'')).includes(query))return false;
      if(state.filter==='new'&&!customer.isNew)return false;
      if(state.filter==='repeat'&&!customer.repeat)return false;
      if(state.filter==='inactive'&&!customer.inactive)return false;
      return true;
    });
    if(state.sort==='activity')rows.sort((a,b)=>b.activityCount-a.activityCount||new Date(b.last||0)-new Date(a.last||0));
    else if(state.sort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name,ar()?'ar':'en'));
    else rows.sort((a,b)=>new Date(b.last||b.created||0)-new Date(a.last||a.created||0));
    return rows;
  }

  function customerBadges(customer){
    const t=copy();
    const badges=[];
    badges.push('<span class="crmBadge '+(customer.inactive?'inactive':customer.isNew?'new':'')+'">'+escapeHtml(customer.inactive?t.inactiveStatus:statusLabel(customer.status))+'</span>');
    if(customer.repeat)badges.push('<span class="crmBadge repeat">'+escapeHtml(t.repeatStatus)+'</span>');
    if(customer.merged>1)badges.push('<span class="crmBadge">'+escapeHtml(customer.merged+' '+t.merged)+'</span>');
    return badges.join('');
  }

  function card(customer){
    const t=copy();
    return '<button type="button" class="crmCard" data-crm-customer="'+escapeHtml(customer.key)+'">'+
      '<div class="crmCardTop"><div class="crmIdentity"><b>'+escapeHtml(customer.name)+'</b><small>'+escapeHtml(customer.phone?.raw||customer.phone?.digits||t.noPhone)+'</small></div><div class="crmBadges">'+customerBadges(customer)+'</div></div>'+
      '<div class="crmStats"><div class="crmStat"><span>'+escapeHtml(t.appointments)+'</span><b>'+customer.appointments.length+'</b></div><div class="crmStat"><span>'+escapeHtml(t.conversations)+'</span><b>'+customer.conversations.length+'</b></div><div class="crmStat"><span>'+escapeHtml(t.lastActivity)+'</span><b>'+escapeHtml(date(customer.last))+'</b></div></div>'+
      '<div class="crmLast"><span>'+escapeHtml(t.created)+': '+escapeHtml(date(customer.created))+'</span><span>'+escapeHtml(statusLabel(customer.status))+'</span></div></button>';
  }

  function bindToolbar(customers){
    const input=q('#crmSearch');
    if(input){input.oninput=()=>{state.query=input.value;const pos=input.selectionStart;renderCustomersEnhanced();requestAnimationFrame(()=>{const next=q('#crmSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch{}}})}}
    const filter=q('#crmFilter');if(filter)filter.onchange=()=>{state.filter=filter.value;renderCustomersEnhanced()};
    const sort=q('#crmSort');if(sort)sort.onchange=()=>{state.sort=sort.value;renderCustomersEnhanced()};
    qa('[data-crm-customer]').forEach(button=>button.onclick=()=>openDetail(customers.find(item=>item.key===button.dataset.crmCustomer)));
  }

  function ensureDetailModal(){
    if(q('#crmDetailModal'))return;
    const modal=document.createElement('div');
    modal.id='crmDetailModal';modal.className='modal crmModal';
    modal.innerHTML='<div class="modalBox"><div id="crmDetailBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeDetail()});

    const order=document.createElement('div');
    order.id='crmOrderModal';order.className='modal crmOrderModal';
    order.innerHTML='<form class="modalBox" id="crmOrderForm"><h3 id="crmOrderTitle"></h3><div class="field"><label id="crmOrderProductLabel"></label><select id="crmOrderProduct" required></select></div><div class="field"><label id="crmOrderQtyLabel"></label><input id="crmOrderQty" type="number" min="1" step="1" value="1" required></div><div class="field"><label id="crmOrderPaymentLabel"></label><select id="crmOrderPayment"><option value="cash"></option><option value="card"></option><option value="transfer"></option><option value="credit"></option><option value="other"></option></select></div><div class="modalActions"><button type="button" class="secondary" id="crmOrderCancel"></button><button class="primary" type="submit" id="crmOrderSave"></button></div></form>';
    document.body.appendChild(order);
    q('#crmOrderCancel').onclick=()=>order.classList.remove('open');
    order.addEventListener('click',event=>{if(event.target===order)order.classList.remove('open')});
    q('#crmOrderForm').onsubmit=saveQuickOrder;
  }

  function closeDetail(){q('#crmDetailModal')?.classList.remove('open');state.selected=null}

  async function openDetail(customer){
    if(!customer)return;
    state.selected=customer;
    ensureDetailModal();
    q('#crmDetailModal').classList.add('open');
    renderDetail(customer,null,true);
    const ops=await loadOperations();
    if(state.selected?.key===customer.key)renderDetail(customer,ops,false);
  }

  function renderDetail(customer,ops,loadingOps){
    const body=q('#crmDetailBody');if(!body)return;
    const t=copy();
    const orders=ordersFor(customer,ops);
    const total=orders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase())).reduce((sum,order)=>sum+Number(order.total_aed||0),0);
    const phoneDigits=customer.phone?.digits||'';
    const phoneHref=phoneDigits?'tel:+'+phoneDigits:'';
    const waHref=phoneDigits?'https://wa.me/'+phoneDigits:'';
    const canOrder=Boolean(ops?.can_operate&&Array.isArray(ops?.products)&&ops.products.some(p=>p.active!==false&&Number(p.available||0)>0));
    const quick=[
      phoneDigits?'<a href="'+escapeHtml(phoneHref)+'">☎ '+escapeHtml(t.call)+'</a>':'',
      phoneDigits?'<a href="'+escapeHtml(waHref)+'" target="_blank" rel="noopener noreferrer">◉ '+escapeHtml(t.whatsapp)+'</a>':'',
      '<button type="button" class="secondary" id="crmNewBooking">＋ '+escapeHtml(t.newBooking)+'</button>',
      canOrder?'<button type="button" class="primary" id="crmNewOrder">＋ '+escapeHtml(t.newOrder)+'</button>':''
    ].join('');
    const apptRows=customer.appointments.slice().sort((a,b)=>new Date(b.starts_at||b.created_at||0)-new Date(a.starts_at||a.created_at||0)).slice(0,6).map(item=>'<div class="crmHistoryRow"><b>'+escapeHtml(date(item.starts_at,true))+'</b><span>'+escapeHtml(statusLabel(item.status))+'</span></div>').join('');
    const orderRows=orders.slice(0,6).map(item=>'<div class="crmHistoryRow"><div><b>'+escapeHtml(money(item.total_aed))+'</b><span data-ui-part="customer-crm-ui-detail-1">'+escapeHtml(date(item.created_at))+'</span></div><span>'+escapeHtml(statusLabel(item.status))+'</span></div>').join('');
    body.innerHTML='<div class="crmDetailHead"><div><h3>'+escapeHtml(customer.name)+'</h3><small>'+escapeHtml(customer.phone?.raw||customer.phone?.digits||t.noPhone)+'</small></div><div class="crmBadges">'+customerBadges(customer)+'</div></div>'+
      '<div class="crmQuick">'+quick+'</div>'+
      '<div class="crmDetailGrid"><div class="crmDetailMetric"><span>'+escapeHtml(t.appointments)+'</span><b>'+customer.appointments.length+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.conversations)+'</span><b>'+customer.conversations.length+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.orders)+'</span><b>'+(loadingOps?'…':orders.length)+'</b></div><div class="crmDetailMetric"><span>'+escapeHtml(t.spent)+'</span><b>'+(loadingOps?'…':escapeHtml(money(total)))+'</b></div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.lastActivity)+'</h4><div class="crmHistoryRow"><b>'+escapeHtml(date(customer.last,true))+'</b><span>'+escapeHtml(t.created)+': '+escapeHtml(date(customer.created))+'</span></div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.recentAppointments)+'</h4><div class="crmHistory">'+(apptRows||'<div class="crmHistoryRow"><span>—</span></div>')+'</div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.recentOrders)+'</h4><div class="crmHistory">'+(loadingOps?'<div class="crmHistoryRow"><span>'+escapeHtml(t.loadingOrders)+'</span></div>':orderRows||'<div class="crmHistoryRow"><span>—</span></div>')+'</div></div>'+
      '<div class="crmSection"><h4>'+escapeHtml(t.notes)+'</h4><div class="crmNotes">'+escapeHtml(customer.notes||t.noNotes)+'</div></div>'+
      '<div class="modalActions"><button type="button" class="secondary" id="crmDetailClose">'+escapeHtml(t.close)+'</button></div>';
    q('#crmDetailClose').onclick=closeDetail;
    q('#crmNewBooking').onclick=()=>{const input=q('#apptCustomer');if(input)input.value=customer.name;q('#appointmentModal')?.classList.add('open');requestAnimationFrame(()=>q('#apptTime')?.focus())};
    const orderButton=q('#crmNewOrder');if(orderButton)orderButton.onclick=()=>openQuickOrder(customer,ops);
  }

  function openQuickOrder(customer,ops){
    if(!customer||!ops)return;
    state.selected=customer;
    ensureDetailModal();
    const t=copy();
    q('#crmOrderTitle').textContent=t.newOrder+' — '+customer.name;
    q('#crmOrderProductLabel').textContent=t.orderProduct;
    q('#crmOrderQtyLabel').textContent=t.orderQty;
    q('#crmOrderPaymentLabel').textContent=t.payment;
    q('#crmOrderCancel').textContent=t.cancel;
    q('#crmOrderSave').textContent=t.saveOrder;
    const productSelect=q('#crmOrderProduct');
    productSelect.innerHTML=(ops.products||[]).filter(p=>p.active!==false&&Number(p.available||0)>0).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+' · '+escapeHtml(money(p.price_aed))+' · '+escapeHtml(String(p.available))+'</option>').join('');
    const payment=q('#crmOrderPayment');
    const labels={cash:t.cash,card:t.card,transfer:t.transfer,credit:t.credit,other:t.other};
    [...payment.options].forEach(option=>option.textContent=labels[option.value]||option.value);
    q('#crmOrderQty').value='1';
    q('#crmOrderModal').classList.add('open');
  }

  async function saveQuickOrder(event){
    event.preventDefault();
    const t=copy(),customer=state.selected,button=q('#crmOrderSave');
    if(!customer?.id||!workspace?.business?.id)return;
    const productId=q('#crmOrderProduct').value;
    const quantity=Math.max(1,Math.trunc(Number(q('#crmOrderQty').value||1)));
    const paymentMethod=q('#crmOrderPayment').value;
    button.disabled=true;
    try{
      const response=await fetch('/api/owner-operations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete_sale',business_id:workspace.business.id,customer_id:customer.id,payment_method:paymentMethod,items:[{product_id:productId,quantity}]})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok)throw new Error(payload.error||t.orderFailed);
      operationsCache=null;
      q('#crmOrderModal').classList.remove('open');
      try{if(typeof toast==='function')toast(t.orderSaved)}catch{}
      const ops=await loadOperations();
      if(state.selected)renderDetail(state.selected,ops,false);
    }catch(error){try{if(typeof toast==='function')toast(error.message||t.orderFailed)}catch{}}
    finally{button.disabled=false}
  }

  function renderCustomersEnhanced(){
    const host=q('#customersTable');if(!host||typeof workspace==='undefined'||!workspace)return;
    host.classList.add('crmHost');
    const t=copy(),customers=buildCustomers(),m=metrics(customers),rows=filtered(customers);
    host.innerHTML='<div class="crmMetrics"><div class="crmMetric"><span>'+escapeHtml(t.total)+'</span><strong>'+m.total+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.newCustomers)+'</span><strong>'+m.newCustomers+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.repeat)+'</span><strong>'+m.repeat+'</strong></div><div class="crmMetric"><span>'+escapeHtml(t.inactive)+'</span><strong>'+m.inactive+'</strong></div></div>'+
      '<div class="crmToolbar"><input id="crmSearch" aria-label="'+escapeHtml(t.search)+'" value="'+escapeHtml(state.query)+'" placeholder="'+escapeHtml(t.search)+'"><select id="crmFilter" aria-label="'+escapeHtml(t.all)+'"><option value="all">'+escapeHtml(t.all)+'</option><option value="new">'+escapeHtml(t.newStatus)+'</option><option value="repeat">'+escapeHtml(t.repeatStatus)+'</option><option value="inactive">'+escapeHtml(t.inactiveStatus)+'</option></select><select id="crmSort" aria-label="'+escapeHtml(t.sortLatest)+'"><option value="latest">'+escapeHtml(t.sortLatest)+'</option><option value="activity">'+escapeHtml(t.sortActivity)+'</option><option value="name">'+escapeHtml(t.sortName)+'</option></select></div>'+
      '<div class="crmList">'+(rows.length?rows.map(card).join(''):'<div class="crmEmpty">'+escapeHtml(t.noResults)+'</div>')+'</div>';
    q('#crmFilter').value=state.filter;
    q('#crmSort').value=state.sort;
    bindToolbar(customers);
  }

  const previous=typeof window.renderCustomers==='function'?window.renderCustomers:(typeof renderCustomers==='function'?renderCustomers:null);
  window.renderCustomers=renderCustomersEnhanced;
  try{renderCustomers=renderCustomersEnhanced}catch{}
  ensureDetailModal();
  try{renderCustomersEnhanced()}catch{}
  document.documentElement.dataset.dabbirCustomerCrm='v1';
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
  res.setHeader('x-dabbir-customer-crm-ui','v1');
  return res.end(script);
}
