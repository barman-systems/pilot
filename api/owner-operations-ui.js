const script=String.raw`(()=>{
  if(window.__dabbirOwnerOperationsLoaded)return;
  window.__dabbirOwnerOperationsLoaded=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    nav:'العمليات',title:'مركز العمليات',desc:'السلع والمخزون والطلبات من بيانات نشاطك الفعلية.',
    products:'السلع',stock:'المخزون',available:'المتاح',low:'مخزون منخفض',orders:'الطلبات',sales:'المبيعات المؤكدة',
    add:'إضافة سلعة',edit:'تعديل',delete:'حذف',editTitle:'تعديل السلعة',name:'اسم السلعة',price:'القيمة',qty:'الكمية',status:'الحالة',customer:'العميل',date:'التاريخ',
    noProducts:'لا توجد سلع بعد.',noOrders:'لا توجد طلبات فعلية بعد.',lowTitle:'تحتاج انتباه',lowNone:'لا يوجد نقص مخزون حاليًا.',
    simulated:'الطلبات التجريبية مستبعدة من المبيعات.',save:'حفظ',cancel:'إلغاء',update:'تحديث',
    created:'تمت إضافة السلعة.',itemUpdated:'تم تعديل السلعة.',itemDeleted:'تم حذف السلعة.',orderUpdated:'تم تحديث حالة الطلب.',failed:'تعذر إكمال العملية.',
    deleteConfirm:'هل تريد حذف هذه السلعة من النشاط؟',reservedDelete:'لا يمكن حذف السلعة لأن لها كمية محجوزة.',reservedQty:'الكمية لا يمكن أن تكون أقل من الكمية المحجوزة.',
    draft:'مسودة',reservedStatus:'محجوز',confirmed:'مؤكد',cancelled:'ملغي',completed:'مكتمل',loading:'جارٍ تحميل العمليات...'
  }:{
    nav:'Operations',title:'Owner operations',desc:'Items, inventory, and orders from your real business data.',
    products:'Items',stock:'Inventory',available:'Available',low:'Low stock',orders:'Orders',sales:'Recognized sales',
    add:'Add item',edit:'Edit',delete:'Delete',editTitle:'Edit item',name:'Item name',price:'Value',qty:'Quantity',status:'Status',customer:'Customer',date:'Date',
    noProducts:'No items yet.',noOrders:'No real orders yet.',lowTitle:'Needs attention',lowNone:'No low-stock items right now.',
    simulated:'Simulated orders are excluded from recognized sales.',save:'Save',cancel:'Cancel',update:'Update',
    created:'Item added.',itemUpdated:'Item updated.',itemDeleted:'Item deleted.',orderUpdated:'Order status updated.',failed:'Operation failed.',
    deleteConfirm:'Delete this item from the business?',reservedDelete:'This item cannot be deleted while stock is reserved.',reservedQty:'Quantity cannot be lower than reserved stock.',
    draft:'Draft',reservedStatus:'Reserved',confirmed:'Confirmed',cancelled:'Cancelled',completed:'Completed',loading:'Loading operations...'
  };



  let data=null;
  let loading=false;
  let loadGeneration=0;
  let pendingLoad=null;
  let businessId=null;
  let editingProductId=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' '+currencyCode()}catch{return Number(value||0).toFixed(2)+' '+currencyCode()}}
  function date(value){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function isStore(){try{return String(workspace?.business?.business_type||'').toLowerCase()==='store'}catch{return false}}
  function currencyCode(){try{return String(workspace?.business?.currency_code||'AED').trim().toUpperCase()||'AED'}catch{return 'AED'}}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}
  function productSku(){return 'DAB-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
  function errorText(error){
    const t=text();const code=String(error?.message||error||'');
    if(code.includes('PRODUCT_HAS_RESERVED_STOCK'))return t.reservedDelete;
    if(code.includes('QUANTITY_BELOW_RESERVED'))return t.reservedQty;
    return t.failed+' — '+code;
  }

  function ensureScreen(){
    let screen=q('#screen-operations');
    if(!screen){
      screen=document.createElement('section');
      screen.className='screen';
      screen.id='screen-operations';
      q('.content')?.appendChild(screen);
    }
    if(!isStore())return screen;

    if(!q('#opsBody')){
      screen.innerHTML='<div class=\"hero\"><div><h1 id=\"opsTitle\"></h1><p id=\"opsDesc\"></p></div><button class=\"primary\" id=\"opsAddProduct\" type=\"button\"></button></div><div id=\"opsBody\"></div>';
    }
    q('#svcModal')?.classList.remove('open');

    if(!q('#opsProductModal')){
      const productModal=document.createElement('div');
      productModal.className='modal';productModal.id='opsProductModal';
      productModal.innerHTML='<form class=\"modalBox\" id=\"opsProductForm\"><h3 id=\"opsProductModalTitle\"></h3><div class=\"field\"><label id=\"opsNameLabel\"></label><input id=\"opsName\" maxlength=\"160\" required></div><div class=\"field\"><label id=\"opsPriceLabel\"></label><input id=\"opsPrice\" type=\"number\" min=\"0\" max=\"10000000\" step=\"0.01\" required></div><div class=\"field\"><label id=\"opsQtyLabel\"></label><input id=\"opsQty\" type=\"number\" min=\"0\" max=\"1000000\" step=\"1\" required></div><div class=\"modalActions\"><button type=\"button\" class=\"secondary\" id=\"opsProductCancel\"></button><button class=\"primary\" id=\"opsProductSave\" type=\"submit\"></button></div></form>';
      document.body.appendChild(productModal);
      productModal.setAttribute('role','dialog');productModal.setAttribute('aria-modal','true');productModal.setAttribute('aria-labelledby','opsProductModalTitle');
      for(const key of ['Name','Price','Qty'])q('#ops'+key+'Label').setAttribute('for','ops'+key);
      q('#opsProductCancel').onclick=closeProductModal;
      q('#opsProductForm').onsubmit=submitProduct;
      productModal.addEventListener('click',event=>{if(event.target===productModal)closeProductModal()});
    }
    q('#opsAddProduct').onclick=openNewProduct;
    applyCopy();
    return screen;
  }

  function openNewProduct(){
    editingProductId=null;
    q('#opsProductForm')?.reset();
    applyCopy();
    q('#opsProductModal')?.classList.add('open');
  }

  function openEditProduct(product){
    if(!product)return;
    editingProductId=product.id;
    q('#opsName').value=product.name||'';
    q('#opsPrice').value=Number(product.price_aed||0).toFixed(2).replace(/\.00$/,'');
    q('#opsQty').value=Number(product.quantity||0);
    applyCopy();
    q('#opsProductModal')?.classList.add('open');
  }

  function closeProductModal(){
    q('#opsProductModal')?.classList.remove('open');
    q('#opsProductForm')?.reset();
    editingProductId=null;
    applyCopy();
  }

  function applyCopy(){
    if(!isStore())return;
    const t=text();
    if(q('#opsTitle'))q('#opsTitle').textContent=t.title;
    if(q('#opsDesc'))q('#opsDesc').textContent=t.desc;
    if(q('#opsAddProduct'))q('#opsAddProduct').textContent=t.add;
    if(q('#opsProductModalTitle'))q('#opsProductModalTitle').textContent=editingProductId?t.editTitle:t.add;
    if(q('#opsNameLabel'))q('#opsNameLabel').textContent=t.name;
    if(q('#opsPriceLabel'))q('#opsPriceLabel').textContent=t.price+' ('+currencyCode()+')';
    if(q('#opsQtyLabel'))q('#opsQtyLabel').textContent=t.qty;
    if(q('#opsProductCancel'))q('#opsProductCancel').textContent=t.cancel;
    if(q('#opsProductSave'))q('#opsProductSave').textContent=editingProductId?t.update:t.save;
    if(current==='operations'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={},requestedBusinessId=businessId){
    if(!businessId)businessId=workspace?.business?.id||null;
    const url='/api/owner-operations?business_id='+encodeURIComponent(requestedBusinessId||businessId||'');
    const response=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'OWNER_OPERATIONS_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isStore())return;
    businessId=workspace?.business?.id||businessId;
    const requestedBusinessId=businessId;
    if(pendingLoad?.businessId===businessId)return pendingLoad.promise;
    if(!force&&data&&data.business_id===businessId)return;
    const generation=++loadGeneration;
    if(data?.business_id!==businessId)data=null;
    loading=true;render();
    const valid=()=>generation===loadGeneration&&workspace?.business?.id===requestedBusinessId;
    const promise=(async()=>{try{const result=await request({},requestedBusinessId);if(!valid())return;if(result.business_id!==requestedBusinessId)throw new Error('OPERATIONS_CONTEXT_MISMATCH');data=result;render()}catch(error){if(valid()){data={error:error.message};render()}}finally{if(generation===loadGeneration){pendingLoad=null;loading=false;if(valid())render()}}})();
    pendingLoad={businessId,generation,promise};return promise;
  }

  async function openRecord({business_id:requestedBusinessId,type,id,isCurrent=()=>true}){
    if(!id||!isStore()||workspace?.business?.id!==requestedBusinessId)return false;
    const before=current;
    await load(true);
    if(!isCurrent()||workspace?.business?.id!==requestedBusinessId||current!==before||data?.business_id!==requestedBusinessId)return false;
    const collection=type==='order'?data.orders:type==='inventory'?data.products:null;
    if(!Array.isArray(collection)||!collection.some(row=>row.id===id))return false;
    if(typeof showScreen==='function')showScreen('operations');
    const attribute=type==='order'?'data-ops-order-row':'data-ops-product-row';
    const row=qa('['+attribute+']').find(node=>node.getAttribute(attribute)===id);
    if(!row)return false;
    row.setAttribute('tabindex','-1');row.scrollIntoView({behavior:'auto',block:'center'});row.focus({preventScroll:true});
    return true;
  }

  function statusOptions(current){
    const t=text();
    const labels={draft:t.draft,reserved:t.reservedStatus,confirmed:t.confirmed,cancelled:t.cancelled,completed:t.completed};
    return Object.entries(labels).map(([value,label])=>'<option value=\"'+value+'\" '+(value===current?'selected':'')+'>'+escapeHtml(label)+'</option>').join('');
  }

  function render(){
    const body=q('#opsBody');
    if(!body||!isStore())return;
    if(data?.business_id&&data.business_id!==workspace?.business?.id)data=null;
    const t=text();
    if(loading&&!data){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class=\"empty\">'+escapeHtml(t.loading)+'</div>';return}
    const low=(data.low_stock||[]).filter(product=>product.active!==false);
    const realOrders=(data.orders||[]).filter(order=>order.simulated===false);
    const products=(data.products||[]).filter(product=>product.active!==false);
    const inventoryUnits=products.reduce((sum,product)=>sum+Number(product.quantity||0),0);
    if(q('#opsAddProduct'))q('#opsAddProduct').style.display=data.can_manage?'inline-flex':'none';

    const metrics=[
      [t.products,products.length],[t.stock,inventoryUnits],[t.low,low.length],[t.sales,money(data.metrics?.recognized_sales_aed||0)]
    ].map(([label,value])=>'<div class=\"opsMetric\"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>').join('');

    const lowHtml='<div class=\"opsLow\"><b>'+escapeHtml(t.lowTitle)+'</b><div data-ui-part=\"owner-operations-ui-detail-1\">'+(low.length?low.slice(0,8).map(product=>escapeHtml(product.name)+' · '+escapeHtml(product.available)+' '+escapeHtml(t.available)).join('<br>'):escapeHtml(t.lowNone))+'</div></div>';

    const productRows=products.length?products.map(product=>'<div class=\"opsRow\" data-ops-product-row=\"'+escapeHtml(product.id)+'\"><div class=\"opsName\"><b>'+escapeHtml(product.name)+'</b></div><span>'+escapeHtml(money(product.price_aed))+'</span><span>'+escapeHtml(product.quantity)+'</span>'+(data.can_manage?'<div class=\"opsActions\"><button class=\"opsAction\" type=\"button\" data-ops-edit=\"'+escapeHtml(product.id)+'\">'+escapeHtml(t.edit)+'</button><button class=\"opsAction danger\" type=\"button\" data-ops-delete=\"'+escapeHtml(product.id)+'\">'+escapeHtml(t.delete)+'</button></div>':'<span></span>')+'</div>').join(''):'<div class=\"empty\">'+escapeHtml(t.noProducts)+'</div>';
    const productsHtml='<div class=\"opsSection\"><h2>'+escapeHtml(t.products)+'</h2><div class=\"opsTable\"><div class=\"opsRow head\"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.qty)+'</span><span></span></div>'+productRows+'</div></div>';

    const orderRows=realOrders.length?realOrders.map(order=>'<div class=\"opsRow opsOrderRow\" data-ops-order-row=\"'+escapeHtml(order.id)+'\"><div class=\"opsName\"><b>'+escapeHtml(order.customer_name||t.customer)+'</b></div><span>'+escapeHtml(money(order.total_aed))+'</span>'+(data.can_manage?'<select class=\"opsOrderSelect\" data-ops-order=\"'+escapeHtml(order.id)+'\">'+statusOptions(String(order.status||'draft'))+'</select>':'<span>'+escapeHtml(order.status)+'</span>')+'<span class=\"opsDate\">'+escapeHtml(date(order.created_at))+'</span></div>').join(''):'<div class=\"empty\">'+escapeHtml(t.noOrders)+'</div>';
    const ordersHtml='<div class=\"opsSection\"><h2>'+escapeHtml(t.orders)+'</h2><div class=\"opsTable\"><div class=\"opsRow opsOrderRow head\"><span>'+escapeHtml(t.customer)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.status)+'</span><span class=\"opsDate\">'+escapeHtml(t.date)+'</span></div>'+orderRows+'</div><div class=\"truth\" data-ui-part=\"owner-operations-ui-detail-2\">'+escapeHtml(t.simulated)+'</div></div>';

    body.innerHTML='<div class=\"opsMetrics\">'+metrics+'</div>'+lowHtml+'<div class=\"opsGrid\"><div>'+productsHtml+'</div><div>'+ordersHtml+'</div></div>';
    qa('[data-ops-edit]').forEach(button=>button.onclick=()=>openEditProduct(products.find(product=>product.id===button.dataset.opsEdit)));
    qa('[data-ops-delete]').forEach(button=>button.onclick=()=>deleteProduct(products.find(product=>product.id===button.dataset.opsDelete)));
    qa('[data-ops-order]').forEach(select=>select.onchange=()=>updateOrder(select.dataset.opsOrder,select.value));
  }

  async function mutate(payload){
    const response=await fetch('/api/owner-operations',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.detail||result.error||'OWNER_OPERATION_FAILED');
    return result;
  }

  async function manageProduct(payload){
    const response=await fetch('/api/owner-product-management',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.error||result.detail||'OWNER_PRODUCT_MANAGEMENT_FAILED');
    return result;
  }

  async function submitProduct(event){
    event.preventDefault();
    const t=text();const button=q('#opsProductSave');if(button)button.disabled=true;
    try{
      const values={name:q('#opsName').value,price_aed:q('#opsPrice').value,quantity:q('#opsQty').value};
      if(editingProductId){
        await manageProduct({action:'update_product',product_id:editingProductId,...values});
        notify(t.itemUpdated);
      }else{
        await mutate({action:'create_product',sku:productSku(),...values});
        notify(t.created);
      }
      closeProductModal();data=null;await load(true);
    }catch(error){notify(errorText(error))}finally{if(button)button.disabled=false}
  }

  async function deleteProduct(product){
    if(!product)return;
    const t=text();
    if(!window.confirm(t.deleteConfirm))return;
    try{
      await manageProduct({action:'delete_product',product_id:product.id});
      if(editingProductId===product.id)closeProductModal();
      notify(t.itemDeleted);data=null;await load(true);
    }catch(error){notify(errorText(error))}
  }

  async function updateOrder(orderId,status){
    const t=text();
    try{await mutate({action:'update_order_status',order_id:orderId,status});notify(t.orderUpdated);data=null;await load(true)}catch(error){notify(t.failed+' — '+error.message);data=null;await load(true)}
  }

  function syncOperationsUi(){
    if(!isStore())return;
    ensureScreen();
    applyCopy();
    if(current==='operations')load();
  }

  function activateOperations({target}={}){
    if(target!=='operations'||!isStore())return;
    ensureScreen();
    if(q('#pageTitle'))q('#pageTitle').textContent=text().nav;
    load();
  }

  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','owner-operations',syncOperationsUi);
    lifecycle.on('afterNavigate','owner-operations',activateOperations);
    lifecycle.on('afterLanguage','owner-operations-language',syncOperationsUi);
  }

  setTimeout(()=>{if(isStore()){ensureScreen();load()}},600);
  window.__dabbirOwnerOperations={openRecord};
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  return res.end(script);
}
