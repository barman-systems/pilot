const css=String.raw`
.dhsPanel{margin:0 0 12px;border:1px solid #314033;background:linear-gradient(180deg,#151b17,#101311);border-radius:16px;padding:13px}.dhsHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.dhsHead h2{margin:0;font-size:13px}.dhsHead p{margin:4px 0 0;color:var(--muted);font-size:9px;line-height:1.6}.dhsActions{display:flex;gap:6px;flex-wrap:wrap}.dhsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.dhsMetric{border:1px solid #29312b;background:#121614;border-radius:11px;padding:8px}.dhsMetric span{display:block;color:var(--muted);font-size:8px}.dhsMetric strong{display:block;font-size:17px;margin-top:3px}.dhsList{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dhsRow{display:grid;grid-template-columns:minmax(150px,1.3fr) .9fr .75fr auto;gap:8px;align-items:center;border:1px solid #29302c;background:#141816;border-radius:12px;padding:9px;font-size:9px}.dhsRow b{font-size:10px;display:block}.dhsRow small{display:block;color:var(--muted);margin-top:2px}.dhsBadge{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:850;background:#202a22;color:#bfe8c7}.dhsBadge.warn{background:#3a3014;color:var(--yellow)}.dhsEmpty{border:1px dashed #303a32;border-radius:12px;padding:14px;text-align:center;color:var(--muted);font-size:9px;margin-top:9px}.dhsSettingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dhsCheck{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:10px}.dhsCheck input{width:18px;height:18px;min-height:18px}.dhsVisitHint{color:var(--muted);font-size:8px;line-height:1.5;margin-top:8px}@media(max-width:700px){.dhsHead{display:block}.dhsActions{margin-top:8px}.dhsMetrics{grid-template-columns:repeat(2,1fr)}.dhsRow{grid-template-columns:minmax(120px,1fr) .8fr auto}.dhsRow .dhsWorker{display:none}.dhsSettingsGrid{grid-template-columns:1fr}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirHomeServiceUi)return;
  window.__dabbirHomeServiceUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const businessType=()=>String(workspace?.business?.business_type||'').toLowerCase();
  const eligible=()=>Boolean(businessType())&&!['store','creator'].includes(businessType());
  let data=null,loading=false,selected=null,observed=null;

  const t=()=>ar()?{
    title:'وضع الخدمة المنزلية',desc:'نفس الموعد، مع عنوان العميل ووقت التنقل ورسوم الزيارة وحالة الفريق في الميدان.',enable:'تفعيل',disable:'إيقاف',settings:'الإعدادات',refresh:'تحديث',enabled:'مفعّل',disabled:'متوقف',upcoming:'القادمة',home:'منزلية',route:'في الطريق',missing:'ينقصها عنوان',empty:'لا توجد مواعيد قادمة خلال 14 يومًا.',loading:'جارٍ تحميل الخدمة المنزلية…',failed:'تعذر تحميل وضع الخدمة المنزلية.',configure:'تجهيز',customer:'العميل',worker:'الموظف',time:'الموعد',atBusiness:'في موقع النشاط',atCustomer:'في موقع العميل',address:'عنوان العميل',lat:'خط العرض (اختياري)',lng:'خط الطول (اختياري)',travel:'وقت التنقل بالدقائق',fee:'رسوم الزيارة (درهم)',fieldStatus:'الحالة الميدانية',scheduled:'مجدول',inRoute:'في الطريق',arrived:'وصل',inService:'بدأت الخدمة',completed:'انتهت',cancelled:'ملغاة',save:'حفظ',close:'إغلاق',defaultFee:'رسوم الزيارة الافتراضية',defaultTravel:'وقت التنقل الافتراضي',requireAddress:'إلزام عنوان العميل',saved:'تم حفظ إعدادات الخدمة المنزلية.',visitSaved:'تم تحديث الموعد الميداني.',addressRequired:'أدخل عنوان العميل قبل الحفظ.',hint:'تقويم دبّر يبقى مصدر الحقيقة. Google/Outlook يظلان تكاملين اختياريين.'
  }:{
    title:'Home service mode',desc:'Keep the same appointment while adding customer location, travel time, visit fee and field status.',enable:'Enable',disable:'Disable',settings:'Settings',refresh:'Refresh',enabled:'Enabled',disabled:'Off',upcoming:'Upcoming',home:'Home visits',route:'In route',missing:'Missing address',empty:'No upcoming appointments in the next 14 days.',loading:'Loading home service…',failed:'Could not load home service mode.',configure:'Configure',customer:'Customer',worker:'Worker',time:'Appointment',atBusiness:'At business',atCustomer:'At customer',address:'Customer address',lat:'Latitude (optional)',lng:'Longitude (optional)',travel:'Travel minutes',fee:'Visit fee (AED)',fieldStatus:'Field status',scheduled:'Scheduled',inRoute:'In route',arrived:'Arrived',inService:'In service',completed:'Completed',cancelled:'Cancelled',save:'Save',close:'Close',defaultFee:'Default visit fee',defaultTravel:'Default travel minutes',requireAddress:'Require customer address',saved:'Home service settings saved.',visitSaved:'Field appointment updated.',addressRequired:'Enter the customer address before saving.',hint:'DABBIR calendar remains the source of truth. Google/Outlook stay optional integrations.'
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const fmt=v=>{try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v||'')}};
  const money=v=>Number(v||0).toLocaleString(ar()?'ar-AE':'en-AE',{minimumFractionDigits:0,maximumFractionDigits:2});

  const style=document.createElement('style');style.dataset.dabbirHomeService='v1';style.textContent=${JSON.stringify(css)};document.head.append(style);

  function ensureModals(){
    if(!q('#dhsSettingsModal')){
      const modal=document.createElement('div');modal.id='dhsSettingsModal';modal.className='modal';
      modal.innerHTML='<form id="dhsSettingsForm" class="modalBox"><h3 id="dhsSettingsTitle"></h3><label class="dhsCheck"><input id="dhsEnabled" type="checkbox"><span id="dhsEnabledLabel"></span></label><div class="dhsSettingsGrid"><div class="field"><label id="dhsDefaultFeeLabel"></label><input id="dhsDefaultFee" type="number" min="0" max="10000000" step="0.01"></div><div class="field"><label id="dhsDefaultTravelLabel"></label><input id="dhsDefaultTravel" type="number" min="0" max="720" step="1"></div></div><label class="dhsCheck"><input id="dhsRequireAddress" type="checkbox"><span id="dhsRequireAddressLabel"></span></label><div class="modalActions"><button id="dhsSettingsClose" class="secondary" type="button"></button><button id="dhsSettingsSave" class="primary" type="submit"></button></div></form>';
      document.body.append(modal);
      q('#dhsSettingsClose').onclick=()=>modal.classList.remove('open');
      modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
      q('#dhsSettingsForm').onsubmit=saveSettings;
    }
    if(!q('#dhsVisitModal')){
      const modal=document.createElement('div');modal.id='dhsVisitModal';modal.className='modal';
      modal.innerHTML='<form id="dhsVisitForm" class="modalBox"><h3 id="dhsVisitTitle"></h3><div class="field"><label id="dhsLocationTypeLabel"></label><select id="dhsLocationType"><option value="business"></option><option value="customer"></option></select></div><div id="dhsCustomerFields"><div class="field"><label id="dhsAddressLabel"></label><input id="dhsAddress" maxlength="500"></div><div class="dhsSettingsGrid"><div class="field"><label id="dhsLatLabel"></label><input id="dhsLat" type="number" min="-90" max="90" step="any"></div><div class="field"><label id="dhsLngLabel"></label><input id="dhsLng" type="number" min="-180" max="180" step="any"></div><div class="field"><label id="dhsTravelLabel"></label><input id="dhsTravel" type="number" min="0" max="720" step="1"></div><div class="field"><label id="dhsFeeLabel"></label><input id="dhsFee" type="number" min="0" max="10000000" step="0.01"></div></div><div class="field"><label id="dhsStatusLabel"></label><select id="dhsStatus"><option value="scheduled"></option><option value="in_route"></option><option value="arrived"></option><option value="in_service"></option><option value="completed"></option><option value="cancelled"></option></select></div></div><div class="dhsVisitHint" id="dhsHint"></div><div class="modalActions"><button id="dhsVisitClose" class="secondary" type="button"></button><button id="dhsVisitSave" class="primary" type="submit"></button></div></form>';
      document.body.append(modal);
      q('#dhsVisitClose').onclick=()=>modal.classList.remove('open');
      modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
      q('#dhsLocationType').onchange=toggleCustomerFields;
      q('#dhsVisitForm').onsubmit=saveVisit;
    }
  }

  function applyCopy(){
    ensureModals();const x=t();
    const pairs={dhsSettingsTitle:x.settings,dhsEnabledLabel:x.enabled,dhsDefaultFeeLabel:x.defaultFee,dhsDefaultTravelLabel:x.defaultTravel,dhsRequireAddressLabel:x.requireAddress,dhsSettingsClose:x.close,dhsSettingsSave:x.save,dhsVisitTitle:x.title,dhsLocationTypeLabel:x.title,dhsAddressLabel:x.address,dhsLatLabel:x.lat,dhsLngLabel:x.lng,dhsTravelLabel:x.travel,dhsFeeLabel:x.fee,dhsStatusLabel:x.fieldStatus,dhsHint:x.hint,dhsVisitClose:x.close,dhsVisitSave:x.save};
    Object.entries(pairs).forEach(([id,value])=>{const el=q('#'+id);if(el)el.textContent=value});
    const loc=q('#dhsLocationType');if(loc){loc.options[0].textContent=x.atBusiness;loc.options[1].textContent=x.atCustomer}
    const st=q('#dhsStatus');if(st){const labels=[x.scheduled,x.inRoute,x.arrived,x.inService,x.completed,x.cancelled];[...st.options].forEach((o,i)=>o.textContent=labels[i])}
    render();
  }

  function ensurePanel(){
    if(!eligible())return null;
    const screen=q('#screen-appointments');if(!screen)return null;
    let panel=q('#dabbirHomeService');if(panel&&panel.parentNode!==screen)panel.remove();
    panel=q('#dabbirHomeService');
    if(!panel){panel=document.createElement('section');panel.id='dabbirHomeService';panel.className='dhsPanel';screen.prepend(panel)}
    return panel;
  }

  async function request(options={}){
    const id=workspace?.business?.id;if(!id)throw new Error('BUSINESS_REQUIRED');
    const response=await fetch('/api/home-service-operations?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'HOME_SERVICE_FAILED');return payload;
  }
  async function post(body){return request({method:'POST',body:JSON.stringify({business_id:workspace.business.id,...body})})}

  async function load(force=false){
    if(!eligible()||loading)return;const id=workspace?.business?.id;if(!id)return;
    if(!force&&data?.business?.id===id){render();return}
    loading=true;render();try{data=await request();render()}catch(error){data={error:String(error?.message||error)};render()}finally{loading=false;render()}
  }

  function badge(row){const x=t();if(row.location_type!=='customer')return x.atBusiness;if(!row.service_address)return x.missing;return ({scheduled:x.scheduled,in_route:x.inRoute,arrived:x.arrived,in_service:x.inService,completed:x.completed,cancelled:x.cancelled})[row.field_status]||x.scheduled}

  function render(){
    const panel=ensurePanel();if(!panel)return;const x=t();
    if(loading&&!data){panel.innerHTML='<div class="dhsEmpty">'+esc(x.loading)+'</div>';return}
    if(data?.error){panel.innerHTML='<div class="dhsEmpty">'+esc(x.failed)+' — '+esc(data.error)+'</div>';return}
    if(!data){panel.innerHTML='<div class="dhsEmpty">'+esc(x.loading)+'</div>';return}
    const settings=data.settings||{};const rows=Array.isArray(data.appointments)?data.appointments:[];const m=data.metrics||{};
    const actions='<div class="dhsActions">'+(data.can_manage?'<button class="secondary" id="dhsSettingsBtn" type="button">'+esc(x.settings)+'</button>':'')+'<button class="secondary" id="dhsRefresh" type="button">'+esc(x.refresh)+'</button></div>';
    const metrics='<div class="dhsMetrics"><div class="dhsMetric"><span>'+esc(x.upcoming)+'</span><strong>'+Number(m.upcoming_14d||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.home)+'</span><strong>'+Number(m.customer_location||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.route)+'</span><strong>'+Number(m.in_route||0)+'</strong></div><div class="dhsMetric"><span>'+esc(x.missing)+'</span><strong>'+Number(m.needs_address||0)+'</strong></div></div>';
    const list=settings.enabled?rows.map(row=>'<div class="dhsRow"><div><b>'+esc(row.customer?.display_name||x.customer)+'</b><small>'+esc(fmt(row.starts_at))+'</small></div><div class="dhsWorker">'+esc(row.worker?.display_name||'—')+'</div><span class="dhsBadge '+(row.location_type==='customer'&&!row.service_address?'warn':'')+'">'+esc(badge(row))+'</span>'+(data.can_update_visits?'<button class="secondary" type="button" data-dhs-visit="'+esc(row.id)+'">'+esc(x.configure)+'</button>':'<span></span>')+'</div>').join(''):'';
    panel.innerHTML='<div class="dhsHead"><div><h2>'+esc(x.title)+' · '+esc(settings.enabled?x.enabled:x.disabled)+'</h2><p>'+esc(x.desc)+'</p></div>'+actions+'</div>'+metrics+(settings.enabled?(list?'<div class="dhsList">'+list+'</div>':'<div class="dhsEmpty">'+esc(x.empty)+'</div>'):'<div class="dhsEmpty">'+esc(x.disabled)+'</div>');
    q('#dhsRefresh')?.addEventListener('click',()=>load(true));q('#dhsSettingsBtn')?.addEventListener('click',openSettings);
    panel.querySelectorAll('[data-dhs-visit]').forEach(button=>button.addEventListener('click',()=>openVisit(rows.find(row=>row.id===button.dataset.dhsVisit))));
  }

  function openSettings(){const s=data?.settings||{};q('#dhsEnabled').checked=s.enabled===true;q('#dhsDefaultFee').value=Number(s.default_visit_fee_aed||0);q('#dhsDefaultTravel').value=Number(s.default_travel_minutes||0);q('#dhsRequireAddress').checked=s.require_customer_address!==false;q('#dhsSettingsModal').classList.add('open')}
  async function saveSettings(event){event.preventDefault();if(loading)return;loading=true;try{await post({action:'save_settings',enabled:q('#dhsEnabled').checked,default_visit_fee_aed:Number(q('#dhsDefaultFee').value||0),default_travel_minutes:Number(q('#dhsDefaultTravel').value||0),require_customer_address:q('#dhsRequireAddress').checked});q('#dhsSettingsModal').classList.remove('open');data=null;notify(t().saved);await load(true)}catch(error){notify(t().failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}}

  function openVisit(row){if(!row)return;selected=row;const s=data?.settings||{};q('#dhsLocationType').value=row.location_type||'business';q('#dhsAddress').value=row.service_address||'';q('#dhsLat').value=row.service_latitude??'';q('#dhsLng').value=row.service_longitude??'';q('#dhsTravel').value=Number(row.travel_minutes??s.default_travel_minutes??0);q('#dhsFee').value=Number(row.visit_fee_aed??s.default_visit_fee_aed??0);q('#dhsStatus').value=row.field_status||'scheduled';toggleCustomerFields();q('#dhsVisitModal').classList.add('open')}
  function toggleCustomerFields(){const home=q('#dhsLocationType')?.value==='customer';if(q('#dhsCustomerFields'))q('#dhsCustomerFields').style.display=home?'block':'none'}
  async function saveVisit(event){event.preventDefault();if(!selected||loading)return;const x=t();const location=q('#dhsLocationType').value;const address=q('#dhsAddress').value.trim();if(location==='customer'&&data?.settings?.require_customer_address!==false&&!address){notify(x.addressRequired);return}loading=true;try{await post({action:'update_visit',appointment_id:selected.id,location_type:location,service_address:address,service_latitude:q('#dhsLat').value||null,service_longitude:q('#dhsLng').value||null,travel_minutes:Number(q('#dhsTravel').value||0),visit_fee_aed:Number(q('#dhsFee').value||0),field_status:q('#dhsStatus').value});q('#dhsVisitModal').classList.remove('open');selected=null;data=null;notify(x.visitSaved);await load(true)}catch(error){notify(x.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}}

  function initialize(){
    if(!eligible())return;applyCopy();const screen=q('#screen-appointments');if(screen&&screen!==observed){observed=screen;new MutationObserver(()=>{if(screen.classList.contains('active')){ensurePanel();load(false)}}).observe(screen,{attributes:true,attributeFilter:['class']})}
    if(typeof current!=='undefined'&&current==='appointments')load(false);
  }
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result};
  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);initialize();return result}}catch{}
  setTimeout(initialize,600);
  window.__dabbirHomeService={refresh:()=>load(true),version:'home-service-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-home-service-ui','v1');
  return res.status(200).send(client);
}
