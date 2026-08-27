const script=String.raw`(()=>{
  if(window.__dabbirPlatformCustomersUi)return;
  window.__dabbirPlatformCustomersUi=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const copy=()=>ar()?{
    nav:'إدارة العملاء',title:'إدارة عملاء DABBIR',desc:'حسابات عملاء المنصة والدعم والاسترجاع من مكان واحد.',search:'ابحث برقم DAB أو البريد أو الهاتف أو اسم النشاط',find:'بحث',accounts:'الحسابات',businesses:'الأنشطة',active:'نشط',blocked:'موقوف',verified:'البريد مؤكد',lastLogin:'آخر دخول',created:'تاريخ التسجيل',phone:'الهاتف',noPhone:'غير مسجل',details:'فتح الحساب',role:'الدور',status:'الحالة',activity:'البيانات التشغيلية',customers:'عملاء النشاط',chats:'المحادثات',messages:'الرسائل',orders:'الطلبات',appointments:'المواعيد',tasks:'المهام',recovery:'استرجاع البيانات',recoveryDesc:'اختر وقتًا سابقًا لمساحة العمل. لن يتغير شيء قبل المعاينة والتأكيد.',targetTime:'الوقت المراد الرجوع إليه',preview:'معاينة الاسترجاع',prepare:'إنشاء حالة استرجاع',events:'تغييرات سيتم عكسها',confirmLabel:'للتنفيذ اكتب',apply:'تنفيذ الاسترجاع',restored:'تم تنفيذ الاسترجاع.',empty:'لا توجد نتائج.',loading:'جارٍ التحميل...',failed:'تعذر تحميل لوحة إدارة العملاء.',back:'العودة للحسابات',platformOwner:'مالك المنصة',danger:'هذا الإجراء يعيد بيانات مساحة العمل إلى الوقت المحدد.'
  }:{
    nav:'Customer admin',title:'DABBIR customer administration',desc:'Platform customer accounts, support and recovery in one place.',search:'Search DAB number, email, phone, or business name',find:'Search',accounts:'Accounts',businesses:'Businesses',active:'Active',blocked:'Blocked',verified:'Email verified',lastLogin:'Last sign-in',created:'Created',phone:'Phone',noPhone:'Not stored',details:'Open account',role:'Role',status:'Status',activity:'Operational data',customers:'Business customers',chats:'Conversations',messages:'Messages',orders:'Orders',appointments:'Appointments',tasks:'Tasks',recovery:'Data recovery',recoveryDesc:'Choose an earlier workspace time. Nothing changes before preview and explicit confirmation.',targetTime:'Restore point',preview:'Preview recovery',prepare:'Create recovery case',events:'Changes to reverse',confirmLabel:'To apply, type',apply:'Apply recovery',restored:'Recovery applied.',empty:'No results.',loading:'Loading...',failed:'Customer administration could not load.',back:'Back to accounts',platformOwner:'Platform owner',danger:'This action returns workspace data to the selected time.'
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const api=async(url,options={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return {r,j}};
  let enabled=false,accounts=[],selected=null,recoveryCase=null,recoveryPreview=null;

  const style=document.createElement('style');
  style.textContent='.pcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pcToolbar{display:flex;gap:8px;margin-bottom:12px}.pcToolbar input{flex:1;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px}.pcAccount{border:1px solid var(--line);background:#131619;border-radius:16px;padding:13px}.pcAccount b{display:block;font-size:12px}.pcAccount small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.pcCode{direction:ltr;display:inline-block;font-weight:950;letter-spacing:.04em;color:var(--accent)}.pcBiz{border:1px solid var(--line);border-radius:15px;padding:12px;margin-top:10px;background:#121416}.pcCounts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.pcCount{background:#191c20;border-radius:10px;padding:8px}.pcCount span{font-size:8px;color:var(--muted);display:block}.pcCount b{font-size:15px}.pcDanger{border:1px solid #5b3030;background:#2b1717;border-radius:14px;padding:11px;margin-top:12px}.pcRecoveryResult{margin-top:9px;padding:9px;border:1px solid var(--line);border-radius:11px;font-size:10px}.pcMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.pcMetric{border:1px solid var(--line);border-radius:14px;padding:12px;background:#131619}.pcMetric span{font-size:9px;color:var(--muted);display:block}.pcMetric strong{font-size:21px}.pcActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}@media(max-width:760px){.pcGrid{grid-template-columns:1fr}.pcMetrics{grid-template-columns:repeat(2,1fr)}.pcToolbar{flex-direction:column}.pcCounts{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(style);

  function ensure(){
    if(q('#screen-platform-customers'))return;
    const screen=document.createElement('section');screen.className='screen';screen.id='screen-platform-customers';
    screen.innerHTML='<div class="hero"><div><h1 id="pcTitle"></h1><p id="pcDesc"></p></div></div><div id="pcBody"></div>';
    q('.content')?.appendChild(screen);
    const nav=document.createElement('button');nav.className='navBtn';nav.dataset.screen='platform-customers';nav.innerHTML='♚ <span id="pcNav"></span>';
    q('#nav')?.appendChild(nav);nav.onclick=()=>{showScreen('platform-customers');loadAccounts('')};
    applyText();
  }
  function applyText(){const t=copy();if(q('#pcTitle'))q('#pcTitle').textContent=t.title;if(q('#pcDesc'))q('#pcDesc').textContent=t.desc;if(q('#pcNav'))q('#pcNav').textContent=t.nav;if(typeof current!=='undefined'&&current==='platform-customers'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;render()}
  async function capability(){
    const {r,j}=await api('/api/platform-customers?action=capability');
    if(r.ok&&j.allowed){enabled=true;ensure();await loadAccounts('');return true}
    return false;
  }
  async function loadAccounts(term){
    if(!enabled)return;selected=null;recoveryCase=null;recoveryPreview=null;renderLoading();
    const url='/api/platform-customers?action=search&q='+encodeURIComponent(term||'');const {r,j}=await api(url);
    if(!r.ok){renderError();return}accounts=j.accounts||[];render();
  }
  async function openAccount(userId){
    renderLoading();const {r,j}=await api('/api/platform-customers?action=detail&user_id='+encodeURIComponent(userId));
    if(!r.ok){renderError();return}selected=j.customer;recoveryCase=null;recoveryPreview=null;render();
  }
  function renderLoading(){const t=copy();if(q('#pcBody'))q('#pcBody').innerHTML='<div class="empty">'+esc(t.loading)+'</div>'}
  function renderError(){const t=copy();if(q('#pcBody'))q('#pcBody').innerHTML='<div class="empty">'+esc(t.failed)+'</div>'}
  function accountStatus(a){return a.deleted_at||a.banned_until?copy().blocked:copy().active}
  function renderAccounts(){
    const t=copy(),body=q('#pcBody');if(!body)return;
    const active=accounts.filter(a=>!a.deleted_at&&!a.banned_until).length,verified=accounts.filter(a=>a.email_confirmed_at).length,biz=accounts.reduce((n,a)=>n+Number(a.business_count||0),0);
    body.innerHTML='<div class="pcMetrics"><div class="pcMetric"><span>'+esc(t.accounts)+'</span><strong>'+accounts.length+'</strong></div><div class="pcMetric"><span>'+esc(t.active)+'</span><strong>'+active+'</strong></div><div class="pcMetric"><span>'+esc(t.businesses)+'</span><strong>'+biz+'</strong></div></div><div class="pcToolbar"><input id="pcSearch" placeholder="'+esc(t.search)+'"><button class="primary" id="pcSearchBtn">'+esc(t.find)+'</button></div><div class="pcGrid">'+(accounts.length?accounts.map(a=>'<div class="pcAccount"><span class="pcCode">'+esc(a.customer_no)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small><small>'+esc(t.lastLogin)+': '+esc(fmt(a.last_sign_in_at))+'</small><div class="pcActions"><span class="badge '+(a.deleted_at||a.banned_until?'red':'green')+'">'+esc(accountStatus(a))+'</span><button class="secondary" data-pc-user="'+esc(a.user_id)+'">'+esc(t.details)+'</button></div></div>').join(''):'<div class="empty">'+esc(t.empty)+'</div>')+'</div>';
    q('#pcSearchBtn').onclick=()=>loadAccounts(q('#pcSearch').value);q('#pcSearch').onkeydown=e=>{if(e.key==='Enter')loadAccounts(e.target.value)};qa('[data-pc-user]').forEach(b=>b.onclick=()=>openAccount(b.dataset.pcUser));
  }
  function renderDetail(){
    const t=copy(),body=q('#pcBody'),u=selected.user||{},a=selected.account||{},businesses=selected.businesses||[];if(!body)return;
    body.innerHTML='<button class="secondary" id="pcBack">← '+esc(t.back)+'</button><div class="card" style="margin-top:10px"><div class="row space"><div><span class="pcCode">'+esc(a.customer_no||'')+'</span><h2 style="margin:5px 0">'+esc(u.email||'—')+'</h2></div><span class="badge '+(u.deleted_at||u.banned_until?'red':'green')+'">'+esc(u.deleted_at||u.banned_until?t.blocked:t.active)+'</span></div><div class="pcGrid" style="margin-top:10px"><div class="pcAccount"><small>'+esc(t.phone)+'</small><b>'+esc(u.phone||t.noPhone)+'</b></div><div class="pcAccount"><small>'+esc(t.created)+'</small><b>'+esc(fmt(u.created_at))+'</b></div><div class="pcAccount"><small>'+esc(t.lastLogin)+'</small><b>'+esc(fmt(u.last_sign_in_at))+'</b></div></div></div><div style="margin-top:12px">'+businesses.map(renderBusiness).join('')+'</div>';
    q('#pcBack').onclick=()=>{selected=null;render()};qa('[data-pc-preview]').forEach(b=>b.onclick=()=>previewRecovery(b.dataset.pcPreview));qa('[data-pc-open]').forEach(b=>b.onclick=()=>openRecovery(b.dataset.pcOpen));qa('[data-pc-apply]').forEach(b=>b.onclick=()=>applyRecovery(b.dataset.pcApply));
  }
  function renderBusiness(b){
    const t=copy(),c=b.counts||{},state=recoveryPreview?.business_id===b.id?recoveryPreview:null,caseId=recoveryCase?.business_id===b.id?recoveryCase.case_id:null;
    const tables=state?.tables?Object.entries(state.tables).map(([k,v])=>esc(k)+': '+esc(v)).join(' · '):'';
    return '<div class="pcBiz"><div class="row space"><div><b>'+esc(b.name)+'</b><small>'+esc(b.business_type)+' · '+esc(b.role)+' · '+esc(b.membership_status)+'</small></div><span class="badge gray">'+esc(b.locale||'')+'</span></div><div class="pcCounts">'+[[t.customers,c.customers],[t.chats,c.conversations],[t.messages,c.messages],[t.orders,c.orders],[t.appointments,c.appointments],[t.tasks,c.tasks]].map(x=>'<div class="pcCount"><span>'+esc(x[0])+'</span><b>'+Number(x[1]||0)+'</b></div>').join('')+'</div><div class="pcDanger"><b>'+esc(t.recovery)+'</b><small style="display:block;color:var(--muted);margin-top:4px">'+esc(t.recoveryDesc)+'</small><div class="field"><label>'+esc(t.targetTime)+'</label><input type="datetime-local" data-pc-time="'+esc(b.id)+'"></div><div class="pcActions"><button class="secondary" data-pc-preview="'+esc(b.id)+'">'+esc(t.preview)+'</button>'+(state?'<button class="primary" data-pc-open="'+esc(b.id)+'">'+esc(t.prepare)+'</button>':'')+'</div>'+(state?'<div class="pcRecoveryResult"><b>'+esc(t.events)+': '+Number(state.events_to_reverse||0)+'</b><div>'+tables+'</div></div>':'')+(caseId?'<div class="pcRecoveryResult"><div>'+esc(t.confirmLabel)+' <span class="pcCode">RESTORE '+esc(selected.account.customer_no)+'</span></div><input style="width:100%;margin-top:7px" data-pc-confirm="'+esc(b.id)+'" placeholder="RESTORE '+esc(selected.account.customer_no)+'"><button style="margin-top:7px" class="primary" data-pc-apply="'+esc(b.id)+'">'+esc(t.apply)+'</button><small style="display:block;color:var(--red);margin-top:6px">'+esc(t.danger)+'</small></div>':'')+'</div></div>';
  }
  async function previewRecovery(businessId){
    const input=q('[data-pc-time="'+CSS.escape(businessId)+'"]');if(!input?.value)return;
    const target=new Date(input.value).toISOString();const {r,j}=await api('/api/platform-customers?action=recovery_preview&user_id='+encodeURIComponent(selected.user.id)+'&business_id='+encodeURIComponent(businessId)+'&target_at='+encodeURIComponent(target));
    if(!r.ok){if(typeof toast==='function')toast(j.error||copy().failed);return}recoveryPreview={...j.preview,business_id:businessId,target_at:target};recoveryCase=null;render();
  }
  async function openRecovery(businessId){
    if(!recoveryPreview||recoveryPreview.business_id!==businessId)return;const {r,j}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'open_recovery',user_id:selected.user.id,business_id:businessId,target_at:recoveryPreview.target_at,reason:'Platform owner customer support recovery'})});
    if(!r.ok){if(typeof toast==='function')toast(j.error||copy().failed);return}recoveryCase={business_id:businessId,case_id:j.case_id};render();
  }
  async function applyRecovery(businessId){
    if(!recoveryCase||recoveryCase.business_id!==businessId)return;const input=q('[data-pc-confirm="'+CSS.escape(businessId)+'"]');const {r,j}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'apply_recovery',user_id:selected.user.id,case_id:recoveryCase.case_id,confirmation:input?.value||''})});
    if(!r.ok){if(typeof toast==='function')toast(j.error||copy().failed);return}if(typeof toast==='function')toast(copy().restored);recoveryCase=null;recoveryPreview=null;await openAccount(selected.user.id);
  }
  function render(){if(!enabled||!q('#pcBody'))return;applyTextOnly();selected?renderDetail():renderAccounts()}
  function applyTextOnly(){const t=copy();if(q('#pcTitle'))q('#pcTitle').textContent=t.title;if(q('#pcDesc'))q('#pcDesc').textContent=t.desc;if(q('#pcNav'))q('#pcNav').textContent=t.nav}
  const langObserver=new MutationObserver(()=>{if(enabled)render()});langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  let attempts=0;const timer=setInterval(async()=>{attempts++;if(enabled||attempts>120){clearInterval(timer);return}await capability()},1500);capability();
})();`;
export default function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed')}
  res.statusCode=200;res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-dabbir-platform-customer-admin-ui','v1');return res.end(script);
}
