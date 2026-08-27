const script = String.raw`(()=>{
  if (window.__dabbirPlatformCustomersUi) return;
  window.__dabbirPlatformCustomersUi = true;

  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const isAr = () => document.documentElement.lang !== 'en';
  const text = () => isAr() ? {
    nav:'إدارة العملاء', title:'إدارة عملاء DABBIR', desc:'حسابات عملاء المنصة والدعم والتحكم والاسترجاع من مكان واحد.',
    search:'ابحث برقم DAB أو البريد أو الهاتف أو اسم النشاط', find:'بحث', accounts:'الحسابات', businesses:'الأنشطة', active:'نشط', blocked:'موقوف', suspended:'معلّق في DABBIR',
    lastLogin:'آخر دخول', created:'تاريخ التسجيل', phone:'الهاتف', noPhone:'غير مسجل', details:'فتح الحساب', back:'العودة للحسابات',
    customers:'عملاء النشاط', chats:'المحادثات', messages:'الرسائل', orders:'الطلبات', appointments:'المواعيد', tasks:'المهام',
    access:'وصول DABBIR', accessDesc:'تعليق الحساب يوقف وصول هذا العميل إلى DABBIR فقط ولا يحظر هوية Supabase أو أي نظام آخر.',
    suspend:'تعليق الحساب', reactivate:'إعادة تفعيل الحساب', reason:'سبب التعليق', reasonPlaceholder:'مثال: طلب العميل، إساءة استخدام، مشكلة فوترة قيد المراجعة',
    suspendConfirm:'للتعليق اكتب', suspendedAt:'تم التعليق', accessUpdated:'تم تحديث وصول الحساب.', adminProtected:'لا يمكن تعليق حساب Platform Admin.', reasonRequired:'اكتب سببًا واضحًا للتعليق.', confirmRequired:'عبارة التأكيد غير مطابقة.',
    recovery:'استرجاع البيانات', recoveryDesc:'اختر وقتًا سابقًا لمساحة العمل. لن يتغير شيء قبل المعاينة والتأكيد.', targetTime:'الوقت المراد الرجوع إليه', preview:'معاينة الاسترجاع', prepare:'إنشاء حالة استرجاع', events:'تغييرات سيتم عكسها', confirmLabel:'للتنفيذ اكتب', apply:'تنفيذ الاسترجاع', restored:'تم تنفيذ الاسترجاع.', danger:'هذا الإجراء يعيد بيانات مساحة العمل إلى الوقت المحدد.',
    empty:'لا توجد نتائج.', loading:'جارٍ التحميل...', failed:'تعذر تحميل لوحة إدارة العملاء.'
  } : {
    nav:'Customer admin', title:'DABBIR customer administration', desc:'Platform customer accounts, support, access control and recovery in one place.',
    search:'Search DAB number, email, phone, or business name', find:'Search', accounts:'Accounts', businesses:'Businesses', active:'Active', blocked:'Blocked', suspended:'Suspended in DABBIR',
    lastLogin:'Last sign-in', created:'Created', phone:'Phone', noPhone:'Not stored', details:'Open account', back:'Back to accounts',
    customers:'Business customers', chats:'Conversations', messages:'Messages', orders:'Orders', appointments:'Appointments', tasks:'Tasks',
    access:'DABBIR access', accessDesc:'Suspension blocks this customer from DABBIR only. It does not ban the Supabase identity or other systems.',
    suspend:'Suspend account', reactivate:'Reactivate account', reason:'Suspension reason', reasonPlaceholder:'Example: customer request, abuse, billing review',
    suspendConfirm:'To suspend, type', suspendedAt:'Suspended', accessUpdated:'Account access updated.', adminProtected:'A Platform Admin account cannot be suspended.', reasonRequired:'Enter a clear suspension reason.', confirmRequired:'Confirmation phrase does not match.',
    recovery:'Data recovery', recoveryDesc:'Choose an earlier workspace time. Nothing changes before preview and explicit confirmation.', targetTime:'Restore point', preview:'Preview recovery', prepare:'Create recovery case', events:'Changes to reverse', confirmLabel:'To apply, type', apply:'Apply recovery', restored:'Recovery applied.', danger:'This action returns workspace data to the selected time.',
    empty:'No results.', loading:'Loading...', failed:'Customer administration could not load.'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat(isAr() ? 'ar-AE' : 'en-AE', {dateStyle:'medium', timeStyle:'short'}).format(new Date(value)); }
    catch { return String(value); }
  };
  const api = async (url, options={}) => {
    const response = await fetch(url, {cache:'no-store', credentials:'same-origin', ...options, headers:{'content-type':'application/json', ...(options.headers||{})}});
    const payload = await response.json().catch(()=>({}));
    return {response,payload};
  };
  const notify = message => { try { if (typeof toast === 'function') toast(message); } catch {} };

  let enabled = false;
  let accounts = [];
  let selected = null;
  let recoveryPreview = null;
  let recoveryCase = null;

  const style = document.createElement('style');
  style.dataset.dabbirPlatformCustomers = 'v2';
  style.textContent = '.pcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pcToolbar{display:flex;gap:8px;margin-bottom:12px}.pcToolbar input{flex:1;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px}.pcAccount{border:1px solid var(--line);background:#131619;border-radius:16px;padding:13px}.pcAccount b{display:block;font-size:12px}.pcAccount small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.pcCode{direction:ltr;display:inline-block;font-weight:950;letter-spacing:.04em;color:var(--accent)}.pcBiz{border:1px solid var(--line);border-radius:15px;padding:12px;margin-top:10px;background:#121416}.pcCounts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.pcCount{background:#191c20;border-radius:10px;padding:8px}.pcCount span{font-size:8px;color:var(--muted);display:block}.pcCount b{font-size:15px}.pcDanger{border:1px solid #5b3030;background:#2b1717;border-radius:14px;padding:11px;margin-top:12px}.pcAccess{border:1px solid #3d4654;background:#151a20;border-radius:14px;padding:12px;margin-top:12px}.pcAccess.suspended{border-color:#6a4c2c;background:#261d12}.pcAccess input{width:100%;border:1px solid var(--line);background:#101316;color:#fff;border-radius:10px;padding:9px;margin-top:7px}.pcRecoveryResult{margin-top:9px;padding:9px;border:1px solid var(--line);border-radius:11px;font-size:10px}.pcMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.pcMetric{border:1px solid var(--line);border-radius:14px;padding:12px;background:#131619}.pcMetric span{font-size:9px;color:var(--muted);display:block}.pcMetric strong{font-size:21px}.pcActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}@media(max-width:760px){.pcGrid{grid-template-columns:1fr}.pcMetrics{grid-template-columns:repeat(2,1fr)}.pcToolbar{flex-direction:column}.pcCounts{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(style);

  function ensureScreen(){
    if (q('#screen-platform-customers')) return;
    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.id = 'screen-platform-customers';
    screen.innerHTML = '<div class="hero"><div><h1 id="pcTitle"></h1><p id="pcDesc"></p></div></div><div id="pcBody"></div>';
    q('.content')?.appendChild(screen);
    const nav = document.createElement('button');
    nav.className = 'navBtn';
    nav.dataset.screen = 'platform-customers';
    nav.innerHTML = '♚ <span id="pcNav"></span>';
    q('#nav')?.appendChild(nav);
    nav.onclick = () => { showScreen('platform-customers'); loadAccounts(''); };
    applyLabels();
  }

  function applyLabels(){
    const t = text();
    if (q('#pcTitle')) q('#pcTitle').textContent = t.title;
    if (q('#pcDesc')) q('#pcDesc').textContent = t.desc;
    if (q('#pcNav')) q('#pcNav').textContent = t.nav;
    if (typeof current !== 'undefined' && current === 'platform-customers' && q('#pageTitle')) q('#pageTitle').textContent = t.nav;
  }

  async function capability(){
    const {response,payload} = await api('/api/platform-customers?action=capability');
    if (!response.ok || !payload.allowed) return false;
    enabled = true;
    ensureScreen();
    await loadAccounts('');
    return true;
  }

  function loading(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().loading)+'</div>'; }
  function failed(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().failed)+'</div>'; }
  function isSuspended(account){ return String(account?.access_status || account?.access?.status || 'active') === 'suspended'; }
  function accountLabel(account){ const t=text(); return isSuspended(account) ? t.suspended : (account.deleted_at || account.banned_until ? t.blocked : t.active); }
  function badgeClass(account){ return isSuspended(account) || account.deleted_at || account.banned_until ? 'red' : 'green'; }

  async function loadAccounts(term){
    if (!enabled) return;
    selected=null; recoveryPreview=null; recoveryCase=null; loading();
    const {response,payload} = await api('/api/platform-customers?action=search&q='+encodeURIComponent(term||''));
    if (!response.ok) return failed();
    accounts = payload.accounts || [];
    renderAccounts();
  }

  async function openAccount(userId){
    loading();
    const {response,payload} = await api('/api/platform-customers?action=detail&user_id='+encodeURIComponent(userId));
    if (!response.ok) return failed();
    selected=payload.customer; recoveryPreview=null; recoveryCase=null;
    renderDetail();
  }

  function renderAccounts(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const active=accounts.filter(a=>!a.deleted_at&&!a.banned_until&&!isSuspended(a)).length;
    const businesses=accounts.reduce((sum,a)=>sum+Number(a.business_count||0),0);
    const cards=accounts.length ? accounts.map(a =>
      '<div class="pcAccount"><span class="pcCode">'+esc(a.customer_no)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small><small>'+esc(t.lastLogin)+': '+esc(fmt(a.last_sign_in_at))+'</small><div class="pcActions"><span class="badge '+badgeClass(a)+'">'+esc(accountLabel(a))+'</span><button class="secondary" data-pc-user="'+esc(a.user_id)+'">'+esc(t.details)+'</button></div></div>'
    ).join('') : '<div class="empty">'+esc(t.empty)+'</div>';
    body.innerHTML='<div class="pcMetrics"><div class="pcMetric"><span>'+esc(t.accounts)+'</span><strong>'+accounts.length+'</strong></div><div class="pcMetric"><span>'+esc(t.active)+'</span><strong>'+active+'</strong></div><div class="pcMetric"><span>'+esc(t.businesses)+'</span><strong>'+businesses+'</strong></div></div><div class="pcToolbar"><input id="pcSearch" placeholder="'+esc(t.search)+'"><button class="primary" id="pcSearchBtn">'+esc(t.find)+'</button></div><div class="pcGrid">'+cards+'</div>';
    q('#pcSearchBtn').onclick=()=>loadAccounts(q('#pcSearch').value);
    q('#pcSearch').onkeydown=event=>{ if(event.key==='Enter') loadAccounts(event.target.value); };
    qa('[data-pc-user]').forEach(button=>button.onclick=()=>openAccount(button.dataset.pcUser));
  }

  function renderAccess(){
    const t=text(), account=selected.account||{}, access=selected.access||{status:'active'};
    if(access.status==='suspended'){
      return '<div class="pcAccess suspended"><div class="row space"><div><b>'+esc(t.access)+'</b><small>'+esc(t.accessDesc)+'</small></div><span class="badge red">'+esc(t.suspended)+'</span></div><div class="pcRecoveryResult"><b>'+esc(t.reason)+':</b> '+esc(access.reason||'—')+'<br><small>'+esc(t.suspendedAt)+': '+esc(fmt(access.suspended_at))+'</small></div><div class="pcActions"><button class="primary" id="pcReactivate">'+esc(t.reactivate)+'</button></div></div>';
    }
    const phrase='SUSPEND '+String(account.customer_no||'');
    return '<div class="pcAccess"><div class="row space"><div><b>'+esc(t.access)+'</b><small>'+esc(t.accessDesc)+'</small></div><span class="badge green">'+esc(t.active)+'</span></div><label style="display:block;margin-top:9px;font-size:9px;color:var(--muted)">'+esc(t.reason)+'</label><input id="pcSuspendReason" maxlength="500" placeholder="'+esc(t.reasonPlaceholder)+'"><div style="margin-top:8px;font-size:9px;color:var(--muted)">'+esc(t.suspendConfirm)+' <span class="pcCode">'+esc(phrase)+'</span></div><input id="pcSuspendConfirm" autocomplete="off" placeholder="'+esc(phrase)+'"><div class="pcActions"><button class="danger" id="pcSuspend">'+esc(t.suspend)+'</button></div></div>';
  }

  function renderBusiness(business){
    const t=text(), counts=business.counts||{};
    const preview=recoveryPreview?.business_id===business.id ? recoveryPreview : null;
    const caseId=recoveryCase?.business_id===business.id ? recoveryCase.case_id : null;
    const tableSummary=preview?.tables ? Object.entries(preview.tables).map(([name,count])=>esc(name)+': '+esc(count)).join(' · ') : '';
    const counterPairs=[[t.customers,counts.customers],[t.chats,counts.conversations],[t.messages,counts.messages],[t.orders,counts.orders],[t.appointments,counts.appointments],[t.tasks,counts.tasks]];
    const counters=counterPairs.map(pair=>'<div class="pcCount"><span>'+esc(pair[0])+'</span><b>'+Number(pair[1]||0)+'</b></div>').join('');
    const previewHtml=preview ? '<div class="pcRecoveryResult"><b>'+esc(t.events)+': '+Number(preview.events_to_reverse||0)+'</b><div>'+tableSummary+'</div></div>' : '';
    const caseHtml=caseId ? '<div class="pcRecoveryResult"><div>'+esc(t.confirmLabel)+' <span class="pcCode">RESTORE '+esc(selected.account.customer_no)+'</span></div><input style="width:100%;margin-top:7px" data-pc-confirm="'+esc(business.id)+'" placeholder="RESTORE '+esc(selected.account.customer_no)+'"><button style="margin-top:7px" class="primary" data-pc-apply="'+esc(business.id)+'">'+esc(t.apply)+'</button><small style="display:block;color:var(--red);margin-top:6px">'+esc(t.danger)+'</small></div>' : '';
    return '<div class="pcBiz"><div class="row space"><div><b>'+esc(business.name)+'</b><small>'+esc(business.business_type)+' · '+esc(business.role)+' · '+esc(business.membership_status)+'</small></div><span class="badge gray">'+esc(business.locale||'')+'</span></div><div class="pcCounts">'+counters+'</div><div class="pcDanger"><b>'+esc(t.recovery)+'</b><small style="display:block;color:var(--muted);margin-top:4px">'+esc(t.recoveryDesc)+'</small><div class="field"><label>'+esc(t.targetTime)+'</label><input type="datetime-local" data-pc-time="'+esc(business.id)+'"></div><div class="pcActions"><button class="secondary" data-pc-preview="'+esc(business.id)+'">'+esc(t.preview)+'</button>'+(preview?'<button class="primary" data-pc-open="'+esc(business.id)+'">'+esc(t.prepare)+'</button>':'')+'</div>'+previewHtml+caseHtml+'</div></div>';
  }

  function renderDetail(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const user=selected.user||{}, account=selected.account||{}, businesses=selected.businesses||[];
    const statusObject={...user,access:selected.access};
    body.innerHTML='<button class="secondary" id="pcBack">← '+esc(t.back)+'</button><div class="card" style="margin-top:10px"><div class="row space"><div><span class="pcCode">'+esc(account.customer_no||'')+'</span><h2 style="margin:5px 0">'+esc(user.email||'—')+'</h2></div><span class="badge '+badgeClass(statusObject)+'">'+esc(accountLabel(statusObject))+'</span></div><div class="pcGrid" style="margin-top:10px"><div class="pcAccount"><small>'+esc(t.phone)+'</small><b>'+esc(user.phone||t.noPhone)+'</b></div><div class="pcAccount"><small>'+esc(t.created)+'</small><b>'+esc(fmt(user.created_at))+'</b></div><div class="pcAccount"><small>'+esc(t.lastLogin)+'</small><b>'+esc(fmt(user.last_sign_in_at))+'</b></div></div>'+renderAccess()+'</div><div style="margin-top:12px">'+businesses.map(renderBusiness).join('')+'</div>';
    q('#pcBack').onclick=()=>{selected=null;renderAccounts();};
    if(q('#pcSuspend')) q('#pcSuspend').onclick=suspendAccount;
    if(q('#pcReactivate')) q('#pcReactivate').onclick=reactivateAccount;
    qa('[data-pc-preview]').forEach(button=>button.onclick=()=>previewRecovery(button.dataset.pcPreview));
    qa('[data-pc-open]').forEach(button=>button.onclick=()=>openRecovery(button.dataset.pcOpen));
    qa('[data-pc-apply]').forEach(button=>button.onclick=()=>applyRecovery(button.dataset.pcApply));
  }

  async function suspendAccount(){
    const t=text();
    const reason=String(q('#pcSuspendReason')?.value||'').trim();
    const expected='SUSPEND '+String(selected.account?.customer_no||'');
    const confirmation=String(q('#pcSuspendConfirm')?.value||'').trim();
    if(reason.length<3) return notify(t.reasonRequired);
    if(confirmation!==expected) return notify(t.confirmRequired);
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'set_access',user_id:selected.user.id,status:'suspended',reason})});
    if(!response.ok) return notify(payload.error==='PLATFORM_ADMIN_IMMUTABLE' ? t.adminProtected : (payload.error||t.failed));
    notify(t.accessUpdated);
    await openAccount(selected.user.id);
  }

  async function reactivateAccount(){
    const t=text();
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'set_access',user_id:selected.user.id,status:'active'})});
    if(!response.ok) return notify(payload.error||t.failed);
    notify(t.accessUpdated);
    await openAccount(selected.user.id);
  }

  async function previewRecovery(businessId){
    const input=q('[data-pc-time="'+CSS.escape(businessId)+'"]');
    if(!input?.value) return;
    const target=new Date(input.value).toISOString();
    const {response,payload}=await api('/api/platform-customers?action=recovery_preview&user_id='+encodeURIComponent(selected.user.id)+'&business_id='+encodeURIComponent(businessId)+'&target_at='+encodeURIComponent(target));
    if(!response.ok) return notify(payload.error||text().failed);
    recoveryPreview={...payload.preview,business_id:businessId,target_at:target}; recoveryCase=null; renderDetail();
  }

  async function openRecovery(businessId){
    if(!recoveryPreview||recoveryPreview.business_id!==businessId) return;
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'open_recovery',user_id:selected.user.id,business_id:businessId,target_at:recoveryPreview.target_at,reason:'Platform owner customer support recovery'})});
    if(!response.ok) return notify(payload.error||text().failed);
    recoveryCase={business_id:businessId,case_id:payload.case_id}; renderDetail();
  }

  async function applyRecovery(businessId){
    if(!recoveryCase||recoveryCase.business_id!==businessId) return;
    const input=q('[data-pc-confirm="'+CSS.escape(businessId)+'"]');
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'apply_recovery',user_id:selected.user.id,case_id:recoveryCase.case_id,confirmation:input?.value||''})});
    if(!response.ok) return notify(payload.error||text().failed);
    notify(text().restored); recoveryPreview=null; recoveryCase=null; await openAccount(selected.user.id);
  }

  const langObserver=new MutationObserver(()=>{ if(enabled){ applyLabels(); selected ? renderDetail() : renderAccounts(); } });
  langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  let attempts=0;
  const timer=setInterval(async()=>{ attempts++; if(enabled||attempts>120){clearInterval(timer);return;} await capability(); },1500);
  capability();
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
  res.setHeader('x-dabbir-platform-customer-admin-ui','v2');
  return res.end(script);
}
