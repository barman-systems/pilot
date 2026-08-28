const script=String.raw`(()=>{
  if(window.__dabbirOwnerOperationsLoaded)return;
  window.__dabbirOwnerOperationsLoaded=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const text=()=>ar()?{
    nav:'العمليات',title:'مركز العمليات',desc:'المنتجات والمخزون والطلبات من بيانات نشاطك الفعلية.',
    products:'المنتجات',stock:'المخزون',available:'المتاح',low:'مخزون منخفض',orders:'الطلبات',sales:'المبيعات المؤكدة',
    add:'إضافة منتج',sku:'SKU',name:'اسم المنتج',price:'السعر (درهم)',qty:'الكمية',reserved:'محجوز',status:'الحالة',customer:'العميل',date:'التاريخ',
    noProducts:'لا توجد منتجات بعد.',noOrders:'لا توجد طلبات فعلية بعد.',lowTitle:'تحتاج انتباه',lowNone:'لا يوجد نقص مخزون حاليًا.',
    simulated:'الطلبات التجريبية مستبعدة من المبيعات.',save:'حفظ',cancel:'إلغاء',editStock:'تعديل المخزون',update:'تحديث',
    created:'تمت إضافة المنتج.',updated:'تم تحديث المخزون.',orderUpdated:'تم تحديث حالة الطلب.',failed:'تعذر إكمال العملية.',
    draft:'مسودة',reservedStatus:'محجوز',confirmed:'مؤكد',cancelled:'ملغي',completed:'مكتمل',loading:'جارٍ تحميل العمليات...'
  }:{
    nav:'Operations',title:'Owner operations',desc:'Products, inventory, and orders from your real business data.',
    products:'Products',stock:'Inventory',available:'Available',low:'Low stock',orders:'Orders',sales:'Recognized sales',
    add:'Add product',sku:'SKU',name:'Product name',price:'Price (AED)',qty:'Quantity',reserved:'Reserved',status:'Status',customer:'Customer',date:'Date',
    noProducts:'No products yet.',noOrders:'No real orders yet.',lowTitle:'Needs attention',lowNone:'No low-stock items right now.',
    simulated:'Simulated orders are excluded from recognized sales.',save:'Save',cancel:'Cancel',editStock:'Edit inventory',update:'Update',
    created:'Product added.',updated:'Inventory updated.',orderUpdated:'Order status updated.',failed:'Operation failed.',
    draft:'Draft',reservedStatus:'Reserved',confirmed:'Confirmed',cancelled:'Cancelled',completed:'Completed',loading:'Loading operations...'
  };

  const style=document.createElement('style');
  style.textContent=[
    '.opsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}',
    '.opsMetric{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:16px;padding:14px}',
    '.opsMetric span{display:block;color:var(--muted);font-size:9px}.opsMetric strong{display:block;font-size:22px;margin-top:6px}',
    '.opsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.opsTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}',
    '.opsRow{display:grid;grid-template-columns:minmax(130px,1.5fr) .8fr .7fr .7fr auto;gap:8px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:10px}',
    '.opsRow:last-child{border-bottom:0}.opsRow.head{color:var(--muted);background:#15181b;font-size:9px}',
    '.opsOrderRow{grid-template-columns:minmax(120px,1.2fr) .9fr .8fr .8fr}',
    '.opsName b{display:block;font-size:11px}.opsName small{color:var(--muted);font-size:8px}',
    '.opsLow{border:1px solid #5b4b20;background:#2b2516;border-radius:14px;padding:11px;margin-bottom:12px;color:#f4d991;font-size:10px}',
    '.opsAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:7px 9px;min-height:36px;font-size:9px;font-weight:800}',
    '.opsOrderSelect{width:100%;min-height:38px;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;padding:6px;font-size:9px}',
    '.opsSection{margin-top:12px}.opsSection h2{font-size:13px;margin:0 0 9px}',
    '@media(max-width:800px){.opsMetrics{grid-template-columns:repeat(2,1fr)}.opsGrid{grid-template-columns:1fr}.opsRow{grid-template-columns:minmax(110px,1.4fr) .7fr .7fr auto}.opsRow .opsReserved{display:none}.opsOrderRow{grid-template-columns:minmax(105px,1.1fr) .8fr .8fr}.opsOrderRow .opsDate{display:none}}'
  ].join('');
  document.head.appendChild(style);

  let data=null;
  let loading=false;
  let businessId=null;

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function money(value){try{return new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' AED'}catch{return Number(value||0).toFixed(2)+' AED'}}
  function date(value){if(!value)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium'}).format(new Date(value))}catch{return String(value)}}
  function isStore(){try{return String(workspace?.business?.business_type||'').toLowerCase()==='store'}catch{return false}}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}

  function ensureScreen(){
    let screen=q('#screen-operations');
    if(screen)return screen;
    screen=document.createElement('section');
    screen.className='screen';
    screen.id='screen-operations';
    screen.innerHTML='<div class="hero"><div><h1 id="opsTitle"></h1><p id="opsDesc"></p></div><button class="primary" id="opsAddProduct" type="button"></button></div><div id="opsBody"></div>';
    q('.content')?.appendChild(screen);

    const productModal=document.createElement('div');
    productModal.className='modal';productModal.id='opsProductModal';
    productModal.innerHTML='<form class="modalBox" id="opsProductForm"><h3 id="opsProductModalTitle"></h3><div class="field"><label id="opsSkuLabel"></label><input id="opsSku" maxlength="80" required></div><div class="field"><label id="opsNameLabel"></label><input id="opsName" maxlength="160" required></div><div class="field"><label id="opsPriceLabel"></label><input id="opsPrice" type="number" min="0" step="0.01" required></div><div class="field"><label id="opsQtyLabel"></label><input id="opsQty" type="number" min="0" step="1" required></div><div class="modalActions"><button type="button" class="secondary" id="opsProductCancel"></button><button class="primary" id="opsProductSave" type="submit"></button></div></form>';
    document.body.appendChild(productModal);

    const stockModal=document.createElement('div');
    stockModal.className='modal';stockModal.id='opsStockModal';
    stockModal.innerHTML='<form class="modalBox" id="opsStockForm"><h3 id="opsStockTitle"></h3><input id="opsStockProductId" type="hidden"><div class="field"><label id="opsStockQtyLabel"></label><input id="opsStockQty" type="number" min="0" step="1" required></div><div class="modalActions"><button type="button" class="secondary" id="opsStockCancel"></button><button class="primary" id="opsStockSave" type="submit"></button></div></form>';
    document.body.appendChild(stockModal);

    q('#opsAddProduct').onclick=()=>q('#opsProductModal').classList.add('open');
    q('#opsProductCancel').onclick=()=>q('#opsProductModal').classList.remove('open');
    q('#opsStockCancel').onclick=()=>q('#opsStockModal').classList.remove('open');
    q('#opsProductForm').onsubmit=createProduct;
    q('#opsStockForm').onsubmit=saveStock;
    [productModal,stockModal].forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')}));
    applyCopy();
    return screen;
  }

  function applyCopy(){
    const t=text();
    if(q('#opsTitle'))q('#opsTitle').textContent=t.title;
    if(q('#opsDesc'))q('#opsDesc').textContent=t.desc;
    if(q('#opsAddProduct'))q('#opsAddProduct').textContent=t.add;
    if(q('#opsProductModalTitle'))q('#opsProductModalTitle').textContent=t.add;
    if(q('#opsSkuLabel'))q('#opsSkuLabel').textContent=t.sku;
    if(q('#opsNameLabel'))q('#opsNameLabel').textContent=t.name;
    if(q('#opsPriceLabel'))q('#opsPriceLabel').textContent=t.price;
    if(q('#opsQtyLabel'))q('#opsQtyLabel').textContent=t.qty;
    if(q('#opsProductCancel'))q('#opsProductCancel').textContent=t.cancel;
    if(q('#opsProductSave'))q('#opsProductSave').textContent=t.save;
    if(q('#opsStockTitle'))q('#opsStockTitle').textContent=t.editStock;
    if(q('#opsStockQtyLabel'))q('#opsStockQtyLabel').textContent=t.qty;
    if(q('#opsStockCancel'))q('#opsStockCancel').textContent=t.cancel;
    if(q('#opsStockSave'))q('#opsStockSave').textContent=t.update;
    if(current==='operations'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={}){
    if(!businessId)businessId=workspace?.business?.id||null;
    const url='/api/owner-operations?business_id='+encodeURIComponent(businessId||'');
    const response=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'OWNER_OPERATIONS_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isStore())return;
    businessId=workspace?.business?.id||businessId;
    if(loading||(!force&&data&&data.business_id===businessId))return;
    loading=true;render();
    try{data=await request();render()}catch(error){data={error:error.message};render()}finally{loading=false;render()}
  }

  function statusOptions(current){
    const t=text();
    const labels={draft:t.draft,reserved:t.reservedStatus,confirmed:t.confirmed,cancelled:t.cancelled,completed:t.completed};
    return Object.entries(labels).map(([value,label])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+escapeHtml(label)+'</option>').join('');
  }

  function render(){
    const body=q('#opsBody');
    if(!body)return;
    const t=text();
    if(loading&&!data){body.innerHTML='<div class="empty">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class="empty">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class="empty">'+escapeHtml(t.loading)+'</div>';return}
    const m=data.metrics||{};
    const low=data.low_stock||[];
    const realOrders=(data.orders||[]).filter(order=>order.simulated===false);
    const products=data.products||[];
    if(q('#opsAddProduct'))q('#opsAddProduct').style.display=data.can_manage?'inline-flex':'none';

    const metrics=[
      [t.products,m.active_products||0],[t.stock,m.inventory_units||0],[t.low,m.low_stock_products||0],[t.sales,money(m.recognized_sales_aed||0)]
    ].map(([label,value])=>'<div class="opsMetric"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>').join('');

    const lowHtml='<div class="opsLow"><b>'+escapeHtml(t.lowTitle)+'</b><div style="margin-top:5px">'+(low.length?low.slice(0,8).map(p=>escapeHtml(p.name)+' · '+escapeHtml(p.available)+' '+escapeHtml(t.available)).join('<br>'):escapeHtml(t.lowNone))+'</div></div>';

    const productRows=products.length?products.map(product=>'<div class="opsRow"><div class="opsName"><b>'+escapeHtml(product.name)+'</b><small>'+escapeHtml(product.sku)+'</small></div><span>'+escapeHtml(money(product.price_aed))+'</span><span>'+escapeHtml(product.available)+'</span><span class="opsReserved">'+escapeHtml(product.reserved)+'</span>'+(data.can_manage?'<button class="opsAction" data-ops-stock="'+escapeHtml(product.id)+'" data-ops-qty="'+escapeHtml(product.quantity)+'">'+escapeHtml(t.editStock)+'</button>':'<span></span>')+'</div>').join(''):'<div class="empty">'+escapeHtml(t.noProducts)+'</div>';
    const productsHtml='<div class="opsSection"><h2>'+escapeHtml(t.products)+'</h2><div class="opsTable"><div class="opsRow head"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.available)+'</span><span class="opsReserved">'+escapeHtml(t.reserved)+'</span><span></span></div>'+productRows+'</div></div>';

    const orderRows=realOrders.length?realOrders.map(order=>'<div class="opsRow opsOrderRow"><div class="opsName"><b>'+escapeHtml(order.customer_name||t.customer)+'</b><small>'+escapeHtml(String(order.id||'').slice(0,8))+'</small></div><span>'+escapeHtml(money(order.total_aed))+'</span>'+(data.can_manage?'<select class="opsOrderSelect" data-ops-order="'+escapeHtml(order.id)+'">'+statusOptions(String(order.status||'draft'))+'</select>':'<span>'+escapeHtml(order.status)+'</span>')+'<span class="opsDate">'+escapeHtml(date(order.created_at))+'</span></div>').join(''):'<div class="empty">'+escapeHtml(t.noOrders)+'</div>';
    const ordersHtml='<div class="opsSection"><h2>'+escapeHtml(t.orders)+'</h2><div class="opsTable"><div class="opsRow opsOrderRow head"><span>'+escapeHtml(t.customer)+'</span><span>'+escapeHtml(t.price)+'</span><span>'+escapeHtml(t.status)+'</span><span class="opsDate">'+escapeHtml(t.date)+'</span></div>'+orderRows+'</div><div class="truth" style="margin-top:9px">'+escapeHtml(t.simulated)+'</div></div>';

    body.innerHTML='<div class="opsMetrics">'+metrics+'</div>'+lowHtml+'<div class="opsGrid"><div>'+productsHtml+'</div><div>'+ordersHtml+'</div></div>';
    qa('[data-ops-stock]').forEach(button=>button.onclick=()=>{
      q('#opsStockProductId').value=button.dataset.opsStock;
      q('#opsStockQty').value=button.dataset.opsQty||0;
      q('#opsStockModal').classList.add('open');
    });
    qa('[data-ops-order]').forEach(select=>select.onchange=()=>updateOrder(select.dataset.opsOrder,select.value));
  }

  async function mutate(payload){
    const response=await fetch('/api/owner-operations',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:businessId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.detail||result.error||'OWNER_OPERATION_FAILED');
    return result;
  }

  async function createProduct(event){
    event.preventDefault();
    const t=text();const button=q('#opsProductSave');if(button)button.disabled=true;
    try{
      await mutate({action:'create_product',sku:q('#opsSku').value,name:q('#opsName').value,price_aed:q('#opsPrice').value,quantity:q('#opsQty').value});
      q('#opsProductForm').reset();q('#opsProductModal').classList.remove('open');notify(t.created);data=null;await load(true);
    }catch(error){notify(t.failed+' — '+error.message)}finally{if(button)button.disabled=false}
  }

  async function saveStock(event){
    event.preventDefault();
    const t=text();const button=q('#opsStockSave');if(button)button.disabled=true;
    try{
      await mutate({action:'set_inventory',product_id:q('#opsStockProductId').value,quantity:q('#opsStockQty').value});
      q('#opsStockModal').classList.remove('open');notify(t.updated);data=null;await load(true);
    }catch(error){notify(t.failed+' — '+error.message)}finally{if(button)button.disabled=false}
  }

  async function updateOrder(orderId,status){
    const t=text();
    try{await mutate({action:'update_order_status',order_id:orderId,status});notify(t.orderUpdated);data=null;await load(true)}catch(error){notify(t.failed+' — '+error.message);data=null;await load(true)}
  }

  ensureScreen();

  try{
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const result=baseShowScreen(name);
      if(name==='operations'){
        ensureScreen();if(q('#pageTitle'))q('#pageTitle').textContent=text().nav;load();
      }
      return result;
    };
  }catch{}

  try{
    const baseRenderAll=renderAll;
    renderAll=function(){const result=baseRenderAll.apply(this,arguments);ensureScreen();applyCopy();if(current==='operations')load();return result};
  }catch{}

  new MutationObserver(applyCopy).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(()=>{ensureScreen();if(isStore())load()},600);
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
