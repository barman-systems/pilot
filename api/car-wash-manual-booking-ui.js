const script=String.raw`(()=>{
  if(window.__dabbirCarWashManualBookingEnhancement)return;
  window.__dabbirCarWashManualBookingEnhancement=true;
  const q=s=>document.querySelector(s);
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const businessId=()=>workspaceNow()?.business?.id||null;
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  const ar=()=>document.documentElement.lang!=='en';
  let cache={business_id:null,customers:[],offers:[],services:[],loaded:false};
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
    if(!force&&cache.business_id===id&&cache.loaded)return cache;
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
        loaded:true,
      };
      return cache;
    })().finally(()=>{pending=null});
    return pending;
  }

  function ensureCustomerPicker(){
    const input=q('#apptCustomer');if(!input||!isCarWash())return;
    input.removeAttribute('list');
    q('#dabbirCarWashCustomerOptions')?.remove();
    input.setAttribute('autocomplete','off');
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls','dabbirCarWashCustomerMenu');
    input.setAttribute('placeholder',ar()?'ابحث عن عميل دائم أو اكتب اسمًا جديدًا':'Search a saved customer or enter a new name');
    const field=input.closest('.field');if(!field)return;
    field.style.position='relative';

    if(!q('#dabbirCarWashCustomerPickerStyle')){
      const style=document.createElement('style');style.id='dabbirCarWashCustomerPickerStyle';
      style.textContent='#dabbirCarWashCustomerMenu{position:absolute;z-index:90;inset-inline:0;top:calc(100% + 6px);max-height:min(38vh,280px);overflow:auto;background:#111a2a;border:1px solid #33445f;border-radius:14px;box-shadow:0 18px 40px #000a;padding:6px;-webkit-overflow-scrolling:touch}#dabbirCarWashCustomerMenu[hidden]{display:none!important}.dabbirCustomerChoice{width:100%;border:0;background:transparent;color:#fff;text-align:start;padding:12px 11px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;font:inherit}.dabbirCustomerChoice:active,.dabbirCustomerChoice:focus{background:#253653;outline:none}.dabbirCustomerChoiceName{font-weight:800}.dabbirCustomerChoicePhone{font-size:12px;color:#9aabc1;direction:ltr;unicode-bidi:embed}.dabbirCustomerNew{color:#79d8ff;border-top:1px solid #2a3950;margin-top:4px;padding-top:12px}';
      document.head.append(style);
    }

    let hidden=q('#dabbirCarWashCustomerId');
    if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.id='dabbirCarWashCustomerId';hidden.dataset.apptKey='customer_id';input.after(hidden)}
    let menu=q('#dabbirCarWashCustomerMenu');
    if(!menu){menu=document.createElement('div');menu.id='dabbirCarWashCustomerMenu';menu.hidden=true;menu.setAttribute('role','listbox');field.append(menu)}

    const normalize=value=>String(value||'').trim().toLocaleLowerCase();
    const exactCustomer=()=>{
      const value=normalize(input.value);
      const matches=cache.customers.filter(row=>normalize(row.display_name)===value);
      return matches.length===1?matches[0]:null;
    };
    const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false')};
    const syncIdentity=()=>{
      const customer=exactCustomer();
      hidden.value=customer?.id||'';
      if(customer){const phone=q('[data-appt-key="phone"]');if(phone&&!String(phone.value||'').trim())phone.value=cleanPhone(customer)}
      return customer;
    };
    const choose=customer=>{
      input.value=String(customer?.display_name||'').trim();
      hidden.value=customer?.id||'';
      const phone=q('[data-appt-key="phone"]');if(phone&&!String(phone.value||'').trim())phone.value=cleanPhone(customer);
      close();input.focus();
      input.dispatchEvent(new Event('change',{bubbles:true}));
    };
    const render=()=>{
      const term=normalize(input.value);
      const rows=cache.customers.filter(row=>{
        if(!term)return true;
        return normalize(row.display_name).includes(term)||normalize(cleanPhone(row)).includes(term);
      }).slice(0,12);
      const fragment=document.createDocumentFragment();
      for(const customer of rows){
        const button=document.createElement('button');button.type='button';button.className='dabbirCustomerChoice';button.setAttribute('role','option');button.dataset.customerId=customer.id;
        const name=document.createElement('span');name.className='dabbirCustomerChoiceName';name.textContent=String(customer.display_name||'').trim();
        const phoneText=cleanPhone(customer);const phone=document.createElement('span');phone.className='dabbirCustomerChoicePhone';phone.textContent=phoneText;
        button.append(name,phone);
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.addEventListener('click',()=>choose(customer));
        fragment.append(button);
      }
      if(term&&!exactCustomer()){
        const button=document.createElement('button');button.type='button';button.className='dabbirCustomerChoice dabbirCustomerNew';button.setAttribute('role','option');
        button.textContent=(ar()?'استخدام «':'Use “')+String(input.value||'').trim()+(ar()?'» كعميل جديد':'” as a new customer');
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.addEventListener('click',()=>{hidden.value='';close();input.focus()});
        fragment.append(button);
      }
      if(!rows.length&&!term){
        const empty=document.createElement('div');empty.className='dabbirCustomerChoice';empty.textContent=ar()?'لا يوجد عملاء دائمون بعد — اكتب اسم العميل الجديد':'No saved customers yet — enter a new customer name';fragment.append(empty);
      }
      menu.replaceChildren(fragment);
      menu.hidden=false;input.setAttribute('aria-expanded','true');
    };

    if(input.dataset.dabbirSavedCustomerPicker!=='v3-combobox'){
      input.dataset.dabbirSavedCustomerPicker='v3-combobox';
      input.addEventListener('focus',()=>{syncIdentity();render()});
      input.addEventListener('input',()=>{syncIdentity();render()});
      input.addEventListener('change',syncIdentity);
      input.addEventListener('keydown',event=>{
        if(event.key==='Escape'){close();return}
        if(event.key==='ArrowDown'&&!menu.hidden){event.preventDefault();menu.querySelector('button')?.focus()}
      });
      input.addEventListener('blur',()=>setTimeout(()=>{if(!menu.contains(document.activeElement))close()},120));
      document.addEventListener('pointerdown',event=>{if(!field.contains(event.target))close()},true);
    }
    syncIdentity();
    if(document.activeElement===input)render();
  }

  function option(select,value,text){const item=document.createElement('option');item.value=value;item.textContent=text;select.append(item);return item}
  function findSelection(value){
    const [kind,id]=String(value||'').split(':');
    if(kind==='offer')return {kind,row:cache.offers.find(row=>String(row.id)===id)||null};
    if(kind==='service')return {kind,row:cache.services.find(row=>String(row.id)===id)||null};
    return {kind:'other',row:null};
  }
  function vehicleLooksStation(value){return /(station|suv|4x4|ستيشن|دفع رباعي)/i.test(String(value||''))}
  function serviceSignature(){return JSON.stringify({offers:cache.offers.map(row=>[row.id,row.name_ar,row.name_en,row.duration_minutes,row.saloon_price_aed,row.station_price_aed]),services:cache.services.map(row=>[row.id,row.name,row.duration_minutes,row.price_aed])})}
  function renderServiceOptions(select){
    const signature=serviceSignature();if(select.dataset.dabbirSignature===signature)return;
    const previous=select.value;select.replaceChildren();
    option(select,'',ar()?'اختر الباقة / الخدمة':'Choose package / service').disabled=true;
    if(cache.offers.length){const group=document.createElement('optgroup');group.label=ar()?'الباقات المحفوظة':'Saved packages';for(const row of cache.offers){const item=document.createElement('option');item.value='offer:'+row.id;item.textContent=ar()?(row.name_ar||row.name_en):(row.name_en||row.name_ar);group.append(item)}select.append(group)}
    if(cache.services.length){const group=document.createElement('optgroup');group.label=ar()?'الخدمات المحفوظة':'Saved services';for(const row of cache.services){const item=document.createElement('option');item.value='service:'+row.id;item.textContent=row.name;group.append(item)}select.append(group)}
    option(select,'other',ar()?'أخرى — ليست ضمن الباقات / الخدمات':'Other — not in saved packages / services');
    if([...select.options].some(item=>item.value===previous))select.value=previous;
    select.dataset.dabbirSignature=signature;
  }

  function enhanceServicePicker(){
    if(!isCarWash())return;
    const original=q('#adaptiveApptFields [data-appt-key="service"]');if(!original)return;
    const field=original.closest('.field');if(!field)return;
    let select=q('#dabbirCarWashServicePicker');
    let other=q('#dabbirCarWashOtherService');
    let duration=q('#dabbirCarWashDuration');
    if(original.dataset.dabbirCatalogBacking!=='v2'){
      original.dataset.dabbirCatalogBacking='v2';original.type='hidden';
      select=document.createElement('select');select.id='dabbirCarWashServicePicker';select.dataset.dabbirServicePicker='v2';
      other=document.createElement('input');other.type='text';other.maxLength=500;other.placeholder=ar()?'اكتب الخدمة أو الباقة':'Enter service or package';other.hidden=true;other.id='dabbirCarWashOtherService';
      field.insertBefore(select,original);field.insertBefore(other,original);
      duration=document.createElement('input');duration.type='hidden';duration.id='dabbirCarWashDuration';duration.dataset.apptKey='duration';field.append(duration);
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
    renderServiceOptions(select);
  }

  async function enhance(force=false){
    if(!isCarWash())return;
    await loadData(force).catch(()=>cache);
    ensureCustomerPicker();enhanceServicePicker();
  }
  const modal=q('#appointmentModal');
  if(modal)new MutationObserver(()=>{
    if(!modal.classList.contains('open'))return;
    setTimeout(()=>enhance(true),0);
    setTimeout(()=>enhance(false),120);
  }).observe(modal,{attributes:true,attributeFilter:['class']});
  window.addEventListener('focus',()=>{if(q('#appointmentModal.open'))void enhance(false)},{passive:true});
  window.__dabbirCarWashManualBooking={refresh:()=>enhance(true),version:'car-wash-manual-booking-v3-native-combobox'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-car-wash-manual-booking-ui','v3-native-combobox');
  return res.status(200).send(script);
}
