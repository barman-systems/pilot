const script=String.raw`(()=>{
  if(window.__dabbirCarWashManualBookingEnhancement)return;
  window.__dabbirCarWashManualBookingEnhancement=true;
  const q=s=>document.querySelector(s);
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const businessId=()=>workspaceNow()?.business?.id||null;
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  const ar=()=>document.documentElement.lang!=='en';
  let cache={business_id:null,customers:[],offers:[],services:[]};
  let pending=null;

  function cleanPhone(customer){return String(customer?.phone_e164||customer?.phone||customer?.metadata?.phone||'').trim()}
  function customerRows(admin){
    const rows=[...(Array.isArray(workspaceNow()?.customers)?workspaceNow().customers:[]),...(Array.isArray(admin?.operations?.customers)?admin.operations.customers:[])];
    const byId=new Map();
    for(const row of rows){if(row?.id&&!byId.has(row.id))byId.set(row.id,row)}
    return [...byId.values()].filter(row=>String(row?.display_name||'').trim()).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),ar()?'ar':'en'));
  }
  async function jsonFetch(url){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error(payload?.error||'LOOKUP_FAILED');
    return payload;
  }
  async function loadData(force=false){
    const id=businessId();if(!id||!isCarWash())return cache;
    if(!force&&cache.business_id===id&&(cache.customers.length||cache.offers.length||cache.services.length))return cache;
    if(pending)return pending;
    pending=(async()=>{
      const [adminResult,serviceResult]=await Promise.allSettled([
        jsonFetch('/api/car-wash-admin?business_id='+encodeURIComponent(id)),
        jsonFetch('/api/service-catalog?business_id='+encodeURIComponent(id)),
      ]);
      const admin=adminResult.status==='fulfilled'?adminResult.value:null;
      const catalog=serviceResult.status==='fulfilled'?serviceResult.value:null;
      cache={
        business_id:id,
        customers:customerRows(admin),
        offers:(Array.isArray(admin?.offers)?admin.offers:[]).filter(row=>row.active!==false),
        services:(Array.isArray(catalog?.services)?catalog.services:[]).filter(row=>row.active!==false),
      };
      return cache;
    })().finally(()=>{pending=null});
    return pending;
  }

  function ensureCustomerPicker(){
    const input=q('#apptCustomer');if(!input||!isCarWash())return;
    let list=q('#dabbirCarWashCustomerOptions');
    if(!list){list=document.createElement('datalist');list.id='dabbirCarWashCustomerOptions';document.body.append(list)}
    input.setAttribute('list',list.id);input.setAttribute('autocomplete','off');input.setAttribute('placeholder',ar()?'ابحث عن عميل دائم أو اكتب اسمًا جديدًا':'Search a saved customer or enter a new name');
    list.replaceChildren();
    for(const customer of cache.customers){
      const option=document.createElement('option');
      option.value=String(customer.display_name||'').trim();
      const phone=cleanPhone(customer);if(phone)option.label=phone;
      list.append(option);
    }
    let hidden=q('#dabbirCarWashCustomerId');
    if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.id='dabbirCarWashCustomerId';hidden.dataset.apptKey='customer_id';input.after(hidden)}
    const sync=()=>{
      const value=String(input.value||'').trim().toLocaleLowerCase();
      const matches=cache.customers.filter(row=>String(row.display_name||'').trim().toLocaleLowerCase()===value);
      const customer=matches.length===1?matches[0]:null;
      hidden.value=customer?.id||'';
      if(customer){const phone=q('[data-appt-key="phone"]');if(phone&&!String(phone.value||'').trim())phone.value=cleanPhone(customer)}
    };
    if(input.dataset.dabbirSavedCustomerPicker!=='v1'){
      input.dataset.dabbirSavedCustomerPicker='v1';
      input.addEventListener('input',sync);input.addEventListener('change',sync);
    }
    sync();
  }

  function option(select,value,text){const item=document.createElement('option');item.value=value;item.textContent=text;select.append(item);return item}
  function findSelection(value){
    const [kind,id]=String(value||'').split(':');
    if(kind==='offer')return {kind,row:cache.offers.find(row=>String(row.id)===id)||null};
    if(kind==='service')return {kind,row:cache.services.find(row=>String(row.id)===id)||null};
    return {kind:'other',row:null};
  }
  function vehicleLooksStation(value){return /(station|suv|4x4|ستيشن|دفع رباعي)/i.test(String(value||''))}

  function enhanceServicePicker(){
    if(!isCarWash())return;
    const original=q('#adaptiveApptFields [data-appt-key="service"]');
    if(!original||original.dataset.dabbirCatalogBacking==='v1')return;
    original.dataset.dabbirCatalogBacking='v1';original.type='hidden';
    const field=original.closest('.field');if(!field)return;
    const select=document.createElement('select');select.id='dabbirCarWashServicePicker';select.dataset.dabbirServicePicker='v1';
    option(select,'',ar()?'اختر الباقة / الخدمة':'Choose package / service').disabled=true;
    if(cache.offers.length){const group=document.createElement('optgroup');group.label=ar()?'الباقات المحفوظة':'Saved packages';for(const row of cache.offers){const item=document.createElement('option');item.value='offer:'+row.id;item.textContent=ar()?(row.name_ar||row.name_en):(row.name_en||row.name_ar);group.append(item)}select.append(group)}
    if(cache.services.length){const group=document.createElement('optgroup');group.label=ar()?'الخدمات المحفوظة':'Saved services';for(const row of cache.services){const item=document.createElement('option');item.value='service:'+row.id;item.textContent=row.name;group.append(item)}select.append(group)}
    option(select,'other',ar()?'أخرى — ليست ضمن الباقات / الخدمات':'Other — not in saved packages / services');
    const other=document.createElement('input');other.type='text';other.maxLength=500;other.placeholder=ar()?'اكتب الخدمة أو الباقة':'Enter service or package';other.hidden=true;other.id='dabbirCarWashOtherService';
    field.insertBefore(select,original);field.insertBefore(other,original);
    let duration=q('#dabbirCarWashDuration');if(!duration){duration=document.createElement('input');duration.type='hidden';duration.id='dabbirCarWashDuration';duration.dataset.apptKey='duration';field.append(duration)}

    const apply=()=>{
      const picked=findSelection(select.value);const price=q('[data-appt-key="price"]');const vehicle=q('[data-appt-key="vehicle"]');
      if(picked.kind==='other'){other.hidden=false;original.value=String(other.value||'').trim();duration.value='';return}
      other.hidden=true;
      if(!picked.row){original.value='';duration.value='';return}
      original.value=picked.kind==='offer'?(ar()?(picked.row.name_ar||picked.row.name_en):(picked.row.name_en||picked.row.name_ar)):String(picked.row.name||'');
      duration.value=String(picked.row.duration_minutes||'');
      if(price){
        const amount=picked.kind==='offer'?(vehicleLooksStation(vehicle?.value)?picked.row.station_price_aed:picked.row.saloon_price_aed):picked.row.price_aed;
        if(amount!==null&&amount!==undefined&&Number.isFinite(Number(amount)))price.value=String(Number(amount));
      }
    };
    select.addEventListener('change',apply);other.addEventListener('input',apply);
    q('[data-appt-key="vehicle"]')?.addEventListener('input',()=>{if(select.value.startsWith('offer:'))apply()});
  }

  async function enhance(force=false){
    if(!isCarWash())return;
    await loadData(force).catch(()=>cache);
    ensureCustomerPicker();enhanceServicePicker();
  }
  const modal=q('#appointmentModal');
  if(modal)new MutationObserver(()=>{if(modal.classList.contains('open')){setTimeout(()=>enhance(false),0);setTimeout(()=>enhance(false),120)}}).observe(modal,{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{if(q('#appointmentModal.open'))setTimeout(()=>enhance(false),0)}).observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('focus',()=>{if(q('#appointmentModal.open'))void enhance(false)},{passive:true});
  window.__dabbirCarWashManualBooking={refresh:()=>enhance(true),version:'car-wash-manual-booking-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-car-wash-manual-booking-ui','v1');
  return res.status(200).send(script);
}
