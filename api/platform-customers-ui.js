const script = String.raw`(()=>{
  if (window.__dabbirPlatformCustomersUi) return;
  window.__dabbirPlatformCustomersUi = true;

  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const isAr = () => document.documentElement.lang !== 'en';
  const text = () => isAr() ? {
    nav:'إدارة العملاء', title:'إدارة عملاء DABBIR', desc:'حسابات عملاء المنصة والمالية والدعم والتحكم والاسترجاع من مكان واحد.',
    search:'ابحث برقم DAB أو البريد أو الهاتف أو اسم النشاط', find:'بحث', accounts:'الحسابات', businesses:'الأنشطة', active:'نشط', blocked:'موقوف', suspended:'معلّق في DABBIR',
    lastLogin:'آخر دخول', created:'تاريخ التسجيل', phone:'الهاتف', noPhone:'غير مسجل', details:'فتح الحساب', back:'العودة للحسابات',
    customers:'عملاء النشاط', chats:'المحادثات', messages:'الرسائل', orders:'الطلبات', appointments:'المواعيد', tasks:'المهام',
    finance:'مالية DABBIR', financeDesc:'تكلفة DABBIR واشتراك العميل فقط. لا تشمل أموال النشاط أو مدفوعات زبائنه.', month:'الشهر',
    confirmedAiSpend:'مصروف AI المؤكد', unpricedAi:'عمليات AI غير المسعّرة', aiRequests:'طلبات AI', tokens:'التوكنز', subscriptionEvidence:'دليل الاشتراك',
    webBilling:'سجلات اشتراك الويب', storeSubscriptions:'اشتراكات المتجر الفعالة', webBillingEnv:'بيئة فوترة الويب', revenue:'إيراد الاشتراك', margin:'هامش العميل',
    revenueUnavailable:'غير متاح — لا يوجد سجل سعر/إيراد موثّق', partialCost:'القياس جزئي؛ العمليات غير المسعّرة ليست صفراً.', completeCost:'التكلفة المسعّرة مكتملة لهذا المصدر.', noMeteredAi:'لا يوجد استهلاك AI مقاس هذا الشهر.',
    noFinancePermission:'لا توجد صلاحية لعرض البيانات المالية.', financeUnavailable:'تعذر تحميل البيانات المالية دون التأثير على إدارة الحساب.', subscriptionStatus:'حالة الاشتراك', noSubscriptionRecord:'لا يوجد سجل اشتراك', periodEnd:'نهاية الفترة', lastInvoice:'آخر فاتورة',
    waCostPerConversation:'تكلفة واتساب / محادثة', providers:'تفصيل مزودي AI', provider:'المزود', cost:'التكلفة', unpriced:'غير مسعّر', storeEntitlements:'اشتراكات المتجر', none:'لا يوجد',
    sandbox:'تجريبي فقط', liveEvidence:'دليل Live موجود', noProviderEvents:'لا توجد أحداث مزود', verifiedAt:'آخر تحقق', expires:'الانتهاء',
    access:'وصول DABBIR', accessDesc:'تعليق الحساب يوقف وصول هذا العميل إلى DABBIR فقط ولا يحظر هوية Supabase أو أي نظام آخر.',
    suspend:'تعليق الحساب', reactivate:'إعادة تفعيل الحساب', reason:'سبب التعليق', reasonPlaceholder:'مثال: طلب العميل، إساءة استخدام، مشكلة فوترة قيد المراجعة',
    suspendConfirm:'للتعليق اكتب', suspendedAt:'تم التعليق', accessUpdated:'تم تحديث وصول الحساب.', adminProtected:'لا يمكن تعليق حساب Platform Admin.', reasonRequired:'اكتب سببًا واضحًا للتعليق.', confirmRequired:'عبارة التأكيد غير مطابقة.',
    recovery:'استرجاع البيانات', recoveryDesc:'اختر وقتًا سابقًا لمساحة العمل. المعاينة تفصل الاسترجاع الآمن عن البيانات التي تحتاج مصالحة يدوية. يجب تعليق الحساب قبل إنشاء حالة الاسترجاع.', targetTime:'الوقت المراد الرجوع إليه', preview:'معاينة الاسترجاع', prepare:'إنشاء حالة استرجاع', events:'إجمالي التغييرات', safeEvents:'قابلة للاسترجاع الآمن', manualEvents:'تحتاج مصالحة يدوية', confirmLabel:'للتنفيذ اكتب', apply:'تنفيذ الاسترجاع', restored:'تم تنفيذ الاسترجاع.', danger:'سيبقى الحساب معلّقًا بعد الاسترجاع حتى تتم مراجعته وإعادة تفعيله يدويًا.', frozenRequired:'يجب تعليق حساب العميل أولًا قبل إنشاء أو تنفيذ الاسترجاع.', manualRequired:'المعاينة تحتوي بيانات دفع/رسائل/طلبات/خصوصية أو تكاملات. تم منع الاسترجاع التلقائي وتحتاج هذه البيانات مصالحة يدوية.', safeReady:'المعاينة آمنة للاسترجاع التلقائي.',
    empty:'لا توجد نتائج.', loading:'جارٍ التحميل...', failed:'تعذر تحميل لوحة إدارة العملاء.'
  } : {
    nav:'Customer admin', title:'DABBIR customer administration', desc:'Platform customer accounts, finance, support, access control and recovery in one place.',
    search:'Search DAB number, email, phone, or business name', find:'Search', accounts:'Accounts', businesses:'Businesses', active:'Active', blocked:'Blocked', suspended:'Suspended in DABBIR',
    lastLogin:'Last sign-in', created:'Created', phone:'Phone', noPhone:'Not stored', details:'Open account', back:'Back to accounts',
    customers:'Business customers', chats:'Conversations', messages:'Messages', orders:'Orders', appointments:'Appointments', tasks:'Tasks',
    finance:'DABBIR finance', financeDesc:'DABBIR subscription evidence and operating cost only. Business customer payments are excluded.', month:'Month',
    confirmedAiSpend:'Confirmed AI spend', unpricedAi:'Unpriced AI operations', aiRequests:'AI requests', tokens:'Tokens', subscriptionEvidence:'Subscription evidence',
    webBilling:'Web subscription records', storeSubscriptions:'Active store subscriptions', webBillingEnv:'Web billing environment', revenue:'Subscription revenue', margin:'Customer margin',
    revenueUnavailable:'Unavailable — no authoritative price/revenue ledger', partialCost:'Measurement is partial; unpriced operations are not zero.', completeCost:'Priced cost is complete for this source.', noMeteredAi:'No metered AI usage this month.',
    noFinancePermission:'You do not have permission to view financial data.', financeUnavailable:'Financial data could not be loaded; customer administration remains available.', subscriptionStatus:'Subscription status', noSubscriptionRecord:'No subscription record', periodEnd:'Period end', lastInvoice:'Last invoice',
    waCostPerConversation:'WhatsApp cost / conversation', providers:'AI provider breakdown', provider:'Provider', cost:'Cost', unpriced:'Unpriced', storeEntitlements:'Store subscriptions', none:'None',
    sandbox:'Sandbox only', liveEvidence:'Live evidence present', noProviderEvents:'No provider events', verifiedAt:'Last verified', expires:'Expires',
    access:'DABBIR access', accessDesc:'Suspension blocks this customer from DABBIR only. It does not ban the Supabase identity or other systems.',
    suspend:'Suspend account', reactivate:'Reactivate account', reason:'Suspension reason', reasonPlaceholder:'Example: customer request, abuse, billing review',
    suspendConfirm:'To suspend, type', suspendedAt:'Suspended', accessUpdated:'Account access updated.', adminProtected:'A Platform Admin account cannot be suspended.', reasonRequired:'Enter a clear suspension reason.', confirmRequired:'Confirmation phrase does not match.',
    recovery:'Data recovery', recoveryDesc:'Choose an earlier workspace time. Preview separates safe automatic recovery from data that requires manual reconciliation. The account must be suspended before a recovery case can be created.', targetTime:'Restore point', preview:'Preview recovery', prepare:'Create recovery case', events:'Total changes', safeEvents:'Safe automatic restore', manualEvents:'Manual reconciliation', confirmLabel:'To apply, type', apply:'Apply recovery', restored:'Recovery applied.', danger:'The account remains suspended after recovery until it is reviewed and manually reactivated.', frozenRequired:'Suspend the customer account before creating or applying recovery.', manualRequired:'This preview includes payment, messaging, order, privacy, workflow, or integration state. Automatic recovery is blocked and manual reconciliation is required.', safeReady:'Preview is safe for automatic recovery.',
    empty:'No results.', loading:'Loading...', failed:'Customer administration could not load.'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat(isAr() ? 'ar-AE' : 'en-AE', {dateStyle:'medium', timeStyle:'short'}).format(new Date(value)); }
    catch { return String(value); }
  };
  const fmtMonth = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat(isAr() ? 'ar-AE' : 'en-AE', {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value)); }
    catch { return String(value); }
  };
  const num = value => value===null||value===undefined||!Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(isAr()?'ar-AE':'en-AE').format(Number(value));
  const aed = value => {
    if (value===null||value===undefined||!Number.isFinite(Number(value))) return '—';
    try { return new Intl.NumberFormat(isAr()?'ar-AE':'en-AE',{style:'currency',currency:'AED',minimumFractionDigits:Number(value)<1?4:2,maximumFractionDigits:6}).format(Number(value)); }
    catch { return String(value); }
  };
  const api = async (url, options={}) => {
    const response = await fetch(url, {cache:'no-store', credentials:'same-origin', ...options, headers:{'content-type':'application/json', ...(options.headers||{})}});
    const payload = await response.json().catch(()=>({}));
    return {response,payload};
  };
  const notify = message => { try { if (typeof toast === 'function') toast(message); } catch {} };

  let enabled = false;
  let capabilityDenied = false;
  let capabilityProbePromise = null;
  let accounts = [];
  let selected = null;
  let recoveryPreview = null;
  let recoveryCase = null;
  let financeOverview = null;
  let financeOverviewDenied = false;
  let financeOverviewError = false;
  let selectedFinance = null;
  let selectedFinanceDenied = false;
  let selectedFinanceError = false;

  const style = document.createElement('style');
  style.dataset.dabbirPlatformCustomers = 'v5';
  style.textContent = '.pcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pcToolbar{display:flex;gap:8px;margin-bottom:12px}.pcToolbar input{flex:1;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px}.pcAccount{border:1px solid var(--line);background:#131619;border-radius:16px;padding:13px}.pcAccount b{display:block;font-size:12px}.pcAccount small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.pcCode{direction:ltr;display:inline-block;font-weight:950;letter-spacing:.04em;color:var(--accent)}.pcBiz{border:1px solid var(--line);border-radius:15px;padding:12px;margin-top:10px;background:#121416}.pcCounts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.pcCount{background:#191c20;border-radius:10px;padding:8px}.pcCount span{font-size:8px;color:var(--muted);display:block}.pcCount b{font-size:15px}.pcDanger{border:1px solid #5b3030;background:#2b1717;border-radius:14px;padding:11px;margin-top:12px}.pcAccess{border:1px solid #3d4654;background:#151a20;border-radius:14px;padding:12px;margin-top:12px}.pcAccess.suspended{border-color:#6a4c2c;background:#261d12}.pcAccess input{width:100%;border:1px solid var(--line);background:#101316;color:#fff;border-radius:10px;padding:9px;margin-top:7px}.pcRecoveryResult{margin-top:9px;padding:9px;border:1px solid var(--line);border-radius:11px;font-size:10px}.pcRecoverySafe{border-color:#28583a;background:#12251a}.pcRecoveryBlocked{border-color:#6c4030;background:#2d1d15}.pcMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.pcMetric{border:1px solid var(--line);border-radius:14px;padding:12px;background:#131619}.pcMetric span{font-size:9px;color:var(--muted);display:block}.pcMetric strong{font-size:21px}.pcActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.pcFinance{border:1px solid #344b73;background:#111a28;border-radius:16px;padding:13px;margin-bottom:12px}.pcFinanceHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.pcFinanceHead b{font-size:13px}.pcFinanceHead small{display:block;color:var(--muted);font-size:9px;max-width:760px}.pcFinanceGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.pcFinanceStat{background:#172235;border:1px solid #263a58;border-radius:11px;padding:9px;min-width:0}.pcFinanceStat span{font-size:8px;color:var(--muted);display:block}.pcFinanceStat b{font-size:15px;overflow-wrap:anywhere}.pcFinanceNote{font-size:9px;margin-top:9px;padding:8px 9px;border-radius:9px;background:#1c2430;color:var(--muted)}.pcFinanceNote.warn{background:#2b2416;color:#e8c77c}.pcFinanceDetails{margin-top:9px}.pcFinanceDetails summary{cursor:pointer;font-size:10px;min-height:36px;display:flex;align-items:center}.pcProvider{display:grid;grid-template-columns:1fr auto auto auto;gap:7px;padding:6px 0;border-top:1px solid #27364a;font-size:9px;align-items:center}.pcProvider:first-child{border-top:0}.pcEntitlement{padding:7px;border:1px solid #29394f;border-radius:9px;margin-top:6px;font-size:9px}.pcEntitlement b{font-size:10px}@media(max-width:760px){.pcGrid{grid-template-columns:1fr}.pcMetrics{grid-template-columns:repeat(2,1fr)}.pcToolbar{flex-direction:column}.pcCounts{grid-template-columns:repeat(2,1fr)}.pcFinanceGrid{grid-template-columns:repeat(2,1fr)}}';
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

  function removeScreen(){
    q('#screen-platform-customers')?.remove();
    q('#nav [data-screen="platform-customers"]')?.remove();
  }

  function applyLabels(){
    const t = text();
    if (q('#pcTitle')) q('#pcTitle').textContent = t.title;
    if (q('#pcDesc')) q('#pcDesc').textContent = t.desc;
    if (q('#pcNav')) q('#pcNav').textContent = t.nav;
    if (typeof current !== 'undefined' && current === 'platform-customers' && q('#pageTitle')) q('#pageTitle').textContent = t.nav;
  }

  async function capability(){
    if(enabled||capabilityDenied)return enabled;
    if(capabilityProbePromise)return capabilityProbePromise;
    capabilityProbePromise=(async()=>{
      const {response,payload} = await api('/api/platform-customers?action=capability');
      if(!response.ok)return false;
      if(!payload.allowed){
        if(payload.reason==='PLATFORM_ADMIN_REQUIRED'||payload.reason==='SERVER_ADMIN_NOT_CONFIGURED')capabilityDenied=true;
        return false;
      }
      enabled = true;
      ensureScreen();
      await loadAccounts('');
      return true;
    })();
    try{return await capabilityProbePromise}finally{capabilityProbePromise=null}
  }

  function loading(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().loading)+'</div>'; }
  function failed(){ const body=q('#pcBody'); if(body) body.innerHTML='<div class="empty">'+esc(text().failed)+'</div>'; }
  function isSuspended(account){ return String(account?.access_status || account?.access?.status || 'active') === 'suspended'; }
  function accountLabel(account){ const t=text(); return isSuspended(account) ? t.suspended : (account.deleted_at || account.banned_until ? t.blocked : t.active); }
  function badgeClass(account){ return isSuspended(account) || account.deleted_at || account.banned_until ? 'red' : 'green'; }
  function webEnvironmentLabel(value){ const t=text(); return value==='SANDBOX_ONLY'?t.sandbox:value==='LIVE_EVIDENCE_PRESENT'?t.liveEvidence:value==='NO_PROVIDER_EVENTS'?t.noProviderEvents:(value||'—'); }
  function financeStateText(value){ const t=text(); return value==='PARTIAL'?t.partialCost:value==='COMPLETE'?t.completeCost:value==='NO_METERED_AI'?t.noMeteredAi:value||'—'; }

  async function loadAccounts(term){
    if (!enabled) return;
    selected=null; recoveryPreview=null; recoveryCase=null; selectedFinance=null; selectedFinanceDenied=false; selectedFinanceError=false; loading();
    financeOverview=null; financeOverviewDenied=false; financeOverviewError=false;
    const [accountResult,financeResult]=await Promise.all([
      api('/api/platform-customers?action=search&q='+encodeURIComponent(term||'')),
      api('/api/platform-customers?action=finance_overview')
    ]);
    if (!accountResult.response.ok) return failed();
    accounts = accountResult.payload.accounts || [];
    if(financeResult.response.ok) financeOverview=financeResult.payload.finance||null;
    else if(financeResult.response.status===403) financeOverviewDenied=true;
    else financeOverviewError=true;
    renderAccounts();
  }

  async function openAccount(userId){
    loading();
    selectedFinance=null; selectedFinanceDenied=false; selectedFinanceError=false;
    const [detailResult,financeResult]=await Promise.all([
      api('/api/platform-customers?action=detail&user_id='+encodeURIComponent(userId)),
      api('/api/platform-customers?action=finance&user_id='+encodeURIComponent(userId))
    ]);
    if (!detailResult.response.ok) return failed();
    selected=detailResult.payload.customer; recoveryPreview=null; recoveryCase=null;
    if(financeResult.response.ok) selectedFinance=financeResult.payload.finance||null;
    else if(financeResult.response.status===403) selectedFinanceDenied=true;
    else selectedFinanceError=true;
    renderDetail();
  }

  function renderFinanceOverview(){
    const t=text();
    if(financeOverviewDenied)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.noFinancePermission)+'</small></div></div></div>';
    if(financeOverviewError)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeUnavailable)+'</small></div></div></div>';
    if(!financeOverview)return '';
    const ai=financeOverview.ai||{},subs=financeOverview.subscriptions||{};
    const storeActive=Number(subs.apple_production_active||0)+Number(subs.google_production_active||0);
    const note=ai.measurement_state==='PARTIAL'?t.partialCost:t.completeCost;
    return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge gray">'+esc(t.month)+': '+esc(fmtMonth(financeOverview.month_start))+'</span></div><div class="pcFinanceGrid">'+
      '<div class="pcFinanceStat"><span>'+esc(t.confirmedAiSpend)+'</span><b>'+esc(aed(ai.known_cost_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.unpricedAi)+'</span><b>'+esc(num(ai.unpriced_operations))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.aiRequests)+'</span><b>'+esc(num(ai.ai_requests))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.tokens)+'</span><b>'+esc(num(ai.total_tokens))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.webBilling)+'</span><b>'+esc(num(subs.web_records))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.storeSubscriptions)+'</span><b>'+esc(num(storeActive))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.revenue)+'</span><b>—</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div>'+
      '</div><div class="pcFinanceNote '+(ai.measurement_state==='PARTIAL'?'warn':'')+'">'+esc(note)+' · '+esc(t.webBillingEnv)+': '+esc(webEnvironmentLabel(subs.web_billing_environment))+' · '+esc(t.revenueUnavailable)+'</div></div>';
  }

  function renderAccounts(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const active=accounts.filter(a=>!a.deleted_at&&!a.banned_until&&!isSuspended(a)).length;
    const businesses=accounts.reduce((sum,a)=>sum+Number(a.business_count||0),0);
    const cards=accounts.length ? accounts.map(a =>
      '<div class="pcAccount"><span class="pcCode">'+esc(a.customer_no)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small><small>'+esc(t.lastLogin)+': '+esc(fmt(a.last_sign_in_at))+'</small><div class="pcActions"><span class="badge '+badgeClass(a)+'">'+esc(accountLabel(a))+'</span><button class="secondary" data-pc-user="'+esc(a.user_id)+'">'+esc(t.details)+'</button></div></div>'
    ).join('') : '<div class="empty">'+esc(t.empty)+'</div>';
    body.innerHTML='<div class="pcMetrics"><div class="pcMetric"><span>'+esc(t.accounts)+'</span><strong>'+accounts.length+'</strong></div><div class="pcMetric"><span>'+esc(t.active)+'</span><strong>'+active+'</strong></div><div class="pcMetric"><span>'+esc(t.businesses)+'</span><strong>'+businesses+'</strong></div></div>'+renderFinanceOverview()+'<div class="pcToolbar"><input id="pcSearch" placeholder="'+esc(t.search)+'"><button class="primary" id="pcSearchBtn">'+esc(t.find)+'</button></div><div class="pcGrid">'+cards+'</div>';
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

  function renderEntitlements(){
    const t=text();
    if(!selectedFinance)return '';
    const subscriptions=selectedFinance.subscriptions||{};
    const rows=[...(subscriptions.apple||[]).map(row=>({...row,provider:'Apple'})),...(subscriptions.google||[]).map(row=>({...row,provider:'Google'}))];
    if(!rows.length)return '<div class="pcFinanceNote">'+esc(t.storeEntitlements)+': '+esc(t.none)+'</div>';
    return '<details class="pcFinanceDetails"><summary>'+esc(t.storeEntitlements)+' ('+rows.length+')</summary>'+rows.map(row=>'<div class="pcEntitlement"><b>'+esc(row.provider)+' · '+esc(row.product_id||'—')+'</b><div>'+esc(row.status||row.subscription_state||'—')+' · '+esc(row.environment||'—')+'</div><small>'+esc(t.expires)+': '+esc(fmt(row.expires_at))+' · '+esc(t.verifiedAt)+': '+esc(fmt(row.verified_at))+'</small></div>').join('')+'</details>';
  }

  function renderCustomerFinance(){
    const t=text();
    if(selectedFinanceDenied)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.noFinancePermission)+'</small></div></div></div>';
    if(selectedFinanceError)return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeUnavailable)+'</small></div></div></div>';
    if(!selectedFinance)return '';
    return '<div class="pcFinance"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge gray">'+esc(t.month)+': '+esc(fmtMonth(selectedFinance.month_start))+'</span></div><div class="pcFinanceGrid"><div class="pcFinanceStat"><span>'+esc(t.webBillingEnv)+'</span><b>'+esc(webEnvironmentLabel(selectedFinance.web_billing_environment))+'</b></div><div class="pcFinanceStat"><span>'+esc(t.revenue)+'</span><b>—</b></div><div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div></div><div class="pcFinanceNote">'+esc(t.revenueUnavailable)+'</div>'+renderEntitlements()+'</div>';
  }

  function renderBusinessFinance(business){
    const t=text();
    if(!selectedFinance||selectedFinanceDenied||selectedFinanceError)return '';
    const row=(selectedFinance.businesses||[]).find(item=>String(item.id)===String(business.id));
    if(!row)return '';
    const ai=row.ai||{},usage=row.usage||{},billing=row.billing||null,providers=Array.isArray(row.providers)?row.providers:[];
    const state=financeStateText(ai.measurement_state);
    const providerHtml=providers.length?'<details class="pcFinanceDetails"><summary>'+esc(t.providers)+'</summary>'+providers.map(p=>'<div class="pcProvider"><span>'+esc(p.provider||'—')+'</span><span>'+esc(num(p.ai_requests))+'</span><span>'+esc(aed(p.known_cost_aed))+'</span><span>'+esc(num(p.unpriced_operations))+'</span></div>').join('')+'</details>':'';
    return '<div class="pcFinance" style="margin-top:10px;margin-bottom:0"><div class="pcFinanceHead"><div><b>'+esc(t.finance)+'</b><small>'+esc(t.financeDesc)+'</small></div><span class="badge '+(ai.measurement_state==='PARTIAL'?'orange':'gray')+'">'+esc(state)+'</span></div><div class="pcFinanceGrid">'+
      '<div class="pcFinanceStat"><span>'+esc(t.confirmedAiSpend)+'</span><b>'+esc(aed(ai.known_cost_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.unpricedAi)+'</span><b>'+esc(num(ai.unpriced_operations))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.aiRequests)+'</span><b>'+esc(num(ai.ai_requests))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.tokens)+'</span><b>'+esc(num(ai.total_tokens))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.waCostPerConversation)+'</span><b>'+esc(aed(usage.known_whatsapp_cost_per_conversation_aed))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.subscriptionStatus)+'</span><b>'+esc(billing?.status||t.noSubscriptionRecord)+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.periodEnd)+'</span><b>'+esc(fmt(billing?.current_period_ends_at))+'</b></div>'+
      '<div class="pcFinanceStat"><span>'+esc(t.margin)+'</span><b>—</b></div>'+
      '</div><div class="pcFinanceNote '+(ai.measurement_state==='PARTIAL'?'warn':'')+'">'+esc(state)+' · '+esc(t.revenueUnavailable)+(billing?.last_invoice_status?' · '+esc(t.lastInvoice)+': '+esc(billing.last_invoice_status):'')+'</div>'+providerHtml+'</div>';
  }

  function renderBusiness(business){
    const t=text(), counts=business.counts||{};
    const preview=recoveryPreview?.business_id===business.id ? recoveryPreview : null;
    const caseId=recoveryCase?.business_id===business.id ? recoveryCase.case_id : null;
    const accountSuspended=String(selected?.access?.status||'active')==='suspended';
    const blocked=preview ? !preview.auto_restore_ready : false;
    const tableSummary=preview?.tables ? Object.entries(preview.tables).map(([name,count])=>esc(name)+': '+esc(count)).join(' · ') : '';
    const reconcileSummary=preview?.reconciliation_tables ? Object.entries(preview.reconciliation_tables).map(([name,value])=>esc(name)+': '+Number(value?.events||0)).join(' · ') : '';
    const counterPairs=[[t.customers,counts.customers],[t.chats,counts.conversations],[t.messages,counts.messages],[t.orders,counts.orders],[t.appointments,counts.appointments],[t.tasks,counts.tasks]];
    const counters=counterPairs.map(pair=>'<div class="pcCount"><span>'+esc(pair[0])+'</span><b>'+Number(pair[1]||0)+'</b></div>').join('');
    const previewHtml=preview ? '<div class="pcRecoveryResult '+(blocked?'pcRecoveryBlocked':'pcRecoverySafe')+'"><b>'+esc(t.events)+': '+Number(preview.events_to_reverse||0)+'</b><div>'+esc(t.safeEvents)+': '+Number(preview.auto_restore_events||0)+' · '+esc(t.manualEvents)+': '+Number(preview.reconciliation_events||0)+'</div>'+(tableSummary?'<div>'+tableSummary+'</div>':'')+(blocked?'<small style="display:block;margin-top:6px;color:var(--red)">'+esc(t.manualRequired)+(reconcileSummary?' · '+reconcileSummary:'')+'</small>':'<small style="display:block;margin-top:6px">'+esc(t.safeReady)+'</small>')+(!accountSuspended?'<small style="display:block;margin-top:6px;color:var(--red)">'+esc(t.frozenRequired)+'</small>':'')+'</div>' : '';
    const canPrepare=preview && !blocked && accountSuspended;
    const caseHtml=caseId ? '<div class="pcRecoveryResult"><div>'+esc(t.confirmLabel)+' <span class="pcCode">RESTORE '+esc(selected.account.customer_no)+'</span></div><input style="width:100%;margin-top:7px" data-pc-confirm="'+esc(business.id)+'" placeholder="RESTORE '+esc(selected.account.customer_no)+'"><button style="margin-top:7px" class="primary" data-pc-apply="'+esc(business.id)+'">'+esc(t.apply)+'</button><small style="display:block;color:var(--red);margin-top:6px">'+esc(t.danger)+'</small></div>' : '';
    return '<div class="pcBiz"><div class="row space"><div><b>'+esc(business.name)+'</b><small>'+esc(business.business_type)+' · '+esc(business.role)+' · '+esc(business.membership_status)+'</small></div><span class="badge gray">'+esc(business.locale||'')+'</span></div><div class="pcCounts">'+counters+'</div>'+renderBusinessFinance(business)+'<div class="pcDanger"><b>'+esc(t.recovery)+'</b><small style="display:block;color:var(--muted);margin-top:4px">'+esc(t.recoveryDesc)+'</small><div class="field"><label>'+esc(t.targetTime)+'</label><input type="datetime-local" data-pc-time="'+esc(business.id)+'"></div><div class="pcActions"><button class="secondary" data-pc-preview="'+esc(business.id)+'">'+esc(t.preview)+'</button>'+(canPrepare?'<button class="primary" data-pc-open="'+esc(business.id)+'">'+esc(t.prepare)+'</button>':'')+'</div>'+previewHtml+caseHtml+'</div></div>';
  }

  function renderDetail(){
    const t=text(), body=q('#pcBody'); if(!body) return;
    const user=selected.user||{}, account=selected.account||{}, businesses=selected.businesses||[];
    const statusObject={...user,access:selected.access};
    body.innerHTML='<button class="secondary" id="pcBack">← '+esc(t.back)+'</button><div class="card" style="margin-top:10px"><div class="row space"><div><span class="pcCode">'+esc(account.customer_no||'')+'</span><h2 style="margin:5px 0">'+esc(user.email||'—')+'</h2></div><span class="badge '+badgeClass(statusObject)+'">'+esc(accountLabel(statusObject))+'</span></div><div class="pcGrid" style="margin-top:10px"><div class="pcAccount"><small>'+esc(t.phone)+'</small><b>'+esc(user.phone||t.noPhone)+'</b></div><div class="pcAccount"><small>'+esc(t.created)+'</small><b>'+esc(fmt(user.created_at))+'</b></div><div class="pcAccount"><small>'+esc(t.lastLogin)+'</small><b>'+esc(fmt(user.last_sign_in_at))+'</b></div></div>'+renderAccess()+'</div>'+renderCustomerFinance()+'<div style="margin-top:12px">'+businesses.map(renderBusiness).join('')+'</div>';
    q('#pcBack').onclick=()=>{selected=null;selectedFinance=null;renderAccounts();};
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
    const t=text();
    if(!recoveryPreview||recoveryPreview.business_id!==businessId) return;
    if(!recoveryPreview.auto_restore_ready) return notify(t.manualRequired);
    if(String(selected?.access?.status||'active')!=='suspended') return notify(t.frozenRequired);
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'open_recovery',user_id:selected.user.id,business_id:businessId,target_at:recoveryPreview.target_at,reason:'Platform owner customer support recovery'})});
    if(!response.ok){
      if(payload.error==='RECOVERY_ACCOUNT_MUST_BE_SUSPENDED') return notify(t.frozenRequired);
      if(payload.error==='RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED') return notify(t.manualRequired);
      return notify(payload.error||t.failed);
    }
    recoveryCase={business_id:businessId,case_id:payload.case_id}; renderDetail();
  }

  async function applyRecovery(businessId){
    const t=text();
    if(!recoveryCase||recoveryCase.business_id!==businessId) return;
    if(String(selected?.access?.status||'active')!=='suspended') return notify(t.frozenRequired);
    const input=q('[data-pc-confirm="'+CSS.escape(businessId)+'"]');
    const {response,payload}=await api('/api/platform-customers',{method:'POST',body:JSON.stringify({action:'apply_recovery',user_id:selected.user.id,case_id:recoveryCase.case_id,confirmation:input?.value||''})});
    if(!response.ok){
      if(payload.error==='RECOVERY_ACCOUNT_MUST_BE_SUSPENDED') return notify(t.frozenRequired);
      if(payload.error==='RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED') return notify(t.manualRequired);
      return notify(payload.error||t.failed);
    }
    notify(t.restored); recoveryPreview=null; recoveryCase=null; await openAccount(selected.user.id);
  }

  const langObserver=new MutationObserver(()=>{ if(enabled){ applyLabels(); selected ? renderDetail() : renderAccounts(); } });
  langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  const authStage=()=>String(document.body?.dataset?.dabbirAuthStage||'');
  const authReady=()=>authStage()==='session_verified'||authStage()==='workspace_ready';
  const probeWhenReady=()=>{ if(authReady()&&!enabled&&!capabilityDenied) capability(); };
  const authObserver=new MutationObserver(()=>{
    if(authStage()==='signed_out'){
      enabled=false;
      capabilityDenied=false;
      capabilityProbePromise=null;
      financeOverview=null; selectedFinance=null;
      removeScreen();
    }
    probeWhenReady();
  });
  if(document.body)authObserver.observe(document.body,{attributes:true,attributeFilter:['data-dabbir-auth-stage']});
  setTimeout(probeWhenReady,0);
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
  res.setHeader('x-dabbir-platform-customer-admin-ui','v5');
  return res.end(script);
}