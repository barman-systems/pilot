const PAGE = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090a">
<title>DABBIR — Owner Control Center</title>
<style>
:root{color-scheme:dark;--bg:#08090a;--panel:#111315;--card:#171a1d;--line:#2a2f34;--text:#f7f8f9;--muted:#969da6;--accent:#d7ff5f;--green:#8ce6a1;--amber:#ffd87a;--red:#ffaaa9;--blue:#9bcaff;--r:18px}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:radial-gradient(circle at 50% -15%,#20252b 0,#0c0e10 36%,var(--bg) 68%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}button,input{font:inherit}button,input,a{min-height:44px}.wrap{max-width:1180px;margin:auto;padding:18px 16px 70px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.brand{display:flex;align-items:center;gap:11px}.logo{width:45px;height:45px;border:1px solid #3a4047;border-radius:14px;display:grid;place-items:center;font-weight:950;background:#20242a}.brand b{font-size:15px}.brand small,.muted{color:var(--muted)}.actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.btn{border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer}.btn.primary{border-color:var(--accent);background:var(--accent);color:#10130b}.btn:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.hero{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin:14px 0 16px}.hero h1{font-size:25px;margin:0 0 5px}.hero p{font-size:12px;line-height:1.7;color:var(--muted);margin:0;max-width:720px}.truth{border:1px solid #33402b;background:#151c13;border-radius:14px;padding:10px 12px;font-size:10px;color:#cae9b8}.truth.warn{border-color:#5a4925;background:#251f13;color:#f5d996}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:var(--r);padding:14px}.metric span{font-size:9px;color:var(--muted);display:block}.metric strong{font-size:27px;display:block;margin-top:7px}.metric small{font-size:8px;color:var(--muted)}.section{border:1px solid var(--line);background:#111315;border-radius:20px;padding:14px;margin-top:12px}.sectionHead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:11px}.sectionHead h2{font-size:14px;margin:0}.tabs{display:flex;gap:6px;flex-wrap:wrap}.tab{border:1px solid var(--line);background:#15181b;color:#aeb4bb;border-radius:999px;padding:7px 10px;min-height:36px;font-size:9px;font-weight:850;cursor:pointer}.tab.on{color:#111;background:var(--accent);border-color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.workspace{border:1px solid var(--line);background:#15181b;border-radius:15px;padding:12px}.workspaceTop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.workspace b{font-size:12px;display:block}.workspace small{color:var(--muted);font-size:9px}.badge{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:8px;font-weight:950;white-space:nowrap}.live{background:#14331e;color:var(--green)}.unverified{background:#3a3014;color:var(--amber)}.qa{background:#25282d;color:#c7ccd2}.demo{background:#15283a;color:var(--blue)}.counts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}.count{background:#101214;border-radius:10px;padding:7px}.count span{font-size:8px;color:var(--muted);display:block}.count b{font-size:14px}.evidence{margin-top:9px;border-top:1px solid #262b30;padding-top:8px;font-size:9px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap}.quality{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}.qualityBox{border:1px solid var(--line);background:#15181b;border-radius:15px;padding:12px}.qualityBox strong{font-size:20px}.qualityBox p{font-size:10px;line-height:1.6;color:var(--muted)}.search{display:flex;gap:7px}.search input,.loginCard input{border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:12px;padding:10px 11px;min-width:0}.search input{flex:1}.accountGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}.account{border:1px solid var(--line);background:#15181b;border-radius:14px;padding:11px}.account .no{direction:ltr;color:var(--accent);font-size:10px;font-weight:950}.account b{font-size:11px;display:block;margin-top:4px}.account small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.hidden{display:none!important}.gate{min-height:70vh;display:grid;place-items:center}.loginCard{width:min(430px,100%);border:1px solid var(--line);background:#111315e8;border-radius:22px;padding:20px}.loginCard h1{font-size:21px;margin:18px 0 5px}.loginCard p{font-size:11px;color:var(--muted);line-height:1.6}.field{margin-top:11px}.field label{display:block;color:var(--muted);font-size:9px;margin-bottom:5px}.field input{width:100%}.msg{min-height:26px;color:var(--amber);font-size:10px;margin-top:9px}.stamp{font-size:8px;color:var(--muted);direction:ltr}.empty{border:1px dashed #31363c;border-radius:14px;padding:18px;text-align:center;color:var(--muted);font-size:10px}@media(max-width:760px){.wrap{padding:12px 10px 60px}.top{align-items:flex-start}.hero{display:block}.metrics{grid-template-columns:repeat(2,1fr)}.metric strong{font-size:24px}.grid,.accountGrid,.quality{grid-template-columns:1fr}.search{flex-direction:column}.workspaceTop{align-items:center}.counts{grid-template-columns:repeat(3,1fr)}}@media(max-width:360px){.metrics{grid-template-columns:1fr}.counts{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand"><div class="logo">D</div><div><b>DABBIR</b><br><small id="brandSub">لوحة المالك</small></div></div>
    <div class="actions"><button class="btn" id="langBtn" type="button">EN</button><button class="btn hidden" id="refreshBtn" type="button">تحديث</button><button class="btn hidden" id="logoutBtn" type="button">خروج</button></div>
  </div>

  <section id="loading" class="gate"><div class="muted">DABBIR · VERIFYING</div></section>

  <section id="loginGate" class="gate hidden">
    <form class="loginCard" id="loginForm">
      <div class="brand"><div class="logo">D</div><div><b>DABBIR</b><br><small>Owner Control Center</small></div></div>
      <h1 id="loginTitle">دخول المالك</h1>
      <p id="loginDesc">نفس حساب DABBIR. لن تظهر أي بيانات إدارية قبل التحقق من صلاحية Platform Admin.</p>
      <div class="field"><label id="emailLabel">البريد الإلكتروني</label><input id="email" type="email" autocomplete="email" required></div>
      <div class="field"><label id="passwordLabel">كلمة المرور</label><input id="password" type="password" autocomplete="current-password" minlength="8" required></div>
      <button class="btn primary" id="loginBtn" type="submit" style="width:100%;margin-top:14px">دخول</button>
      <div class="msg" id="loginMsg" role="status" aria-live="polite"></div>
    </form>
  </section>

  <main id="dashboard" class="hidden">
    <div class="hero">
      <div><h1 id="title">مركز تحكم المالك</h1><p id="desc">الأرقام الرئيسية هنا Fail-closed: لا نعتبر أي عميل أو نشاط Live إلا مع دليل تكامل خارجي حي وموثّق. بيانات QA وDemo معزولة ولا تدخل في مؤشرات Live.</p></div>
      <div class="stamp" id="stamp"></div>
    </div>
    <div class="truth" id="policyBox"></div>

    <div class="metrics" style="margin-top:11px">
      <div class="metric"><span id="mLiveCustomersLabel">عملاء Live موثّقون</span><strong id="mLiveCustomers">—</strong><small id="mLiveCustomersNote">QA/Demo مستبعدة</small></div>
      <div class="metric"><span id="mLiveBusinessesLabel">أنشطة Live موثّقة</span><strong id="mLiveBusinesses">—</strong><small id="mLiveBusinessesNote">بدليل خارجي</small></div>
      <div class="metric"><span id="mUnverifiedLabel">أنشطة غير موثّقة</span><strong id="mUnverified">—</strong><small id="mUnverifiedNote">لا تُحسب Live</small></div>
      <div class="metric"><span id="mQaExcludedLabel">عملاء QA مستبعدون</span><strong id="mQaExcluded">—</strong><small id="mQaExcludedNote">تنظيف المؤشرات</small></div>
    </div>

    <section class="section">
      <div class="sectionHead"><h2 id="integrationsTitle">الدليل الخارجي الحي</h2></div>
      <div class="metrics">
        <div class="metric"><span>WhatsApp Live</span><strong id="mWhatsApp">—</strong><small id="waNote">Connections verified</small></div>
        <div class="metric"><span>Payments Live</span><strong id="mPayments">—</strong><small id="payNote">Live + charges enabled</small></div>
        <div class="metric"><span id="mLiveConvLabel">محادثات Live</span><strong id="mLiveConv">—</strong><small>Verified workspaces only</small></div>
        <div class="metric"><span id="mLiveOrdersLabel">طلبات Live</span><strong id="mLiveOrders">—</strong><small>Verified workspaces only</small></div>
      </div>
    </section>

    <section class="section">
      <div class="sectionHead"><h2 id="workspacesTitle">حقيقة مساحات العمل</h2><div class="tabs" id="workspaceTabs"><button class="tab on" data-filter="business" type="button">تشغيلي</button><button class="tab" data-filter="verified_live" type="button">Live</button><button class="tab" data-filter="unverified" type="button">غير موثّق</button><button class="tab" data-filter="qa" type="button">QA</button><button class="tab" data-filter="demo" type="button">Demo</button><button class="tab" data-filter="all" type="button">الكل</button></div></div>
      <div class="grid" id="workspaceGrid"></div>
    </section>

    <section class="section">
      <div class="sectionHead"><h2 id="qualityTitle">جودة البيانات</h2></div>
      <div class="quality">
        <div class="qualityBox"><span class="badge qa">QA ISOLATION</span><h3 id="qualityHeading">منع تلوث مؤشرات المالك</h3><p id="qualityText"></p></div>
        <div class="qualityBox"><span id="rawLabel" class="muted">Raw database</span><div style="margin-top:8px"><strong id="rawCustomers">—</strong> <span id="rawCustomersLabel" class="muted">عملاء خام</span></div><div style="margin-top:6px"><strong id="rawConversations">—</strong> <span id="rawConversationsLabel" class="muted">محادثات خام</span></div></div>
      </div>
    </section>

    <section class="section">
      <div class="sectionHead"><h2 id="accountsTitle">حسابات المنصة</h2><span class="muted" id="accountSummary"></span></div>
      <div class="search"><input id="accountSearch" placeholder="رقم DAB أو البريد أو الهاتف أو اسم النشاط"><button class="btn primary" id="searchBtn" type="button">بحث</button></div>
      <div class="accountGrid" id="accountGrid"></div>
    </section>
  </main>
</div>
<script>
(()=>{
  const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  let lang='ar', overview=null, accounts=[], filter='business';
  const tr={
    ar:{brandSub:'لوحة المالك',refresh:'تحديث',logout:'خروج',loginTitle:'دخول المالك',loginDesc:'نفس حساب DABBIR. لن تظهر أي بيانات إدارية قبل التحقق من صلاحية Platform Admin.',email:'البريد الإلكتروني',password:'كلمة المرور',login:'دخول',badLogin:'بيانات الدخول غير صحيحة أو تعذر التحقق.',notAdmin:'هذا الحساب ليس Platform Admin فعالًا.',title:'مركز تحكم المالك',desc:'الأرقام الرئيسية هنا Fail-closed: لا نعتبر أي عميل أو نشاط Live إلا مع دليل تكامل خارجي حي وموثّق. بيانات QA وDemo معزولة ولا تدخل في مؤشرات Live.',policy:'قاعدة Live: نشاط غير QA/Demo + WhatsApp حي موثّق أو Payment Account حي ومفعّل.',liveCustomers:'عملاء Live موثّقون',liveBusinesses:'أنشطة Live موثّقة',unverified:'أنشطة غير موثّقة',qaExcluded:'عملاء QA مستبعدون',integrations:'الدليل الخارجي الحي',liveConv:'محادثات Live',liveOrders:'طلبات Live',workspaces:'حقيقة مساحات العمل',quality:'جودة البيانات',qualityHeading:'منع تلوث مؤشرات المالك',raw:'Raw database',rawCustomers:'عملاء خام',rawConversations:'محادثات خام',accounts:'حسابات المنصة',searchPlaceholder:'رقم DAB أو البريد أو الهاتف أو اسم النشاط',search:'بحث',empty:'لا توجد نتائج.',business:'تشغيلي',all:'الكل',verified_live:'Live',qa:'QA',demo:'Demo',customers:'عملاء',conversations:'محادثات',messages:'رسائل',whatsapp:'واتساب حي',payment:'دفع حي',generated:'آخر تحقق'},
    en:{brandSub:'Owner dashboard',refresh:'Refresh',logout:'Sign out',loginTitle:'Owner sign in',loginDesc:'Use your DABBIR account. Administrative data remains hidden until Platform Admin authorization is verified.',email:'Email',password:'Password',login:'Sign in',badLogin:'Invalid credentials or verification failed.',notAdmin:'This account is not an active Platform Admin.',title:'Owner Control Center',desc:'Primary metrics are fail-closed: a customer or workspace is never counted as Live without verified external evidence. QA and Demo data are isolated from Live metrics.',policy:'Live rule: non-QA/Demo workspace + verified live WhatsApp or live enabled payment account.',liveCustomers:'Verified Live customers',liveBusinesses:'Verified Live businesses',unverified:'Unverified businesses',qaExcluded:'QA customers excluded',integrations:'Verified external evidence',liveConv:'Live conversations',liveOrders:'Live orders',workspaces:'Workspace truth',quality:'Data quality',qualityHeading:'Protect owner metrics from QA pollution',raw:'Raw database',rawCustomers:'raw customers',rawConversations:'raw conversations',accounts:'Platform accounts',searchPlaceholder:'DAB number, email, phone, or business name',search:'Search',empty:'No results.',business:'Operational',all:'All',verified_live:'Live',qa:'QA',demo:'Demo',customers:'Customers',conversations:'Conversations',messages:'Messages',whatsapp:'Live WhatsApp',payment:'Live payment',generated:'Verified at'}
  };
  const t=()=>tr[lang];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=async(url,opt={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const p=await r.json().catch(()=>({}));return {r,p}};
  const badge=(cls)=>cls==='verified_live'?'live':cls==='unverified'?'unverified':cls==='demo'?'demo':'qa';
  const label=(cls)=>cls==='verified_live'?'VERIFIED LIVE':cls==='unverified'?'UNVERIFIED':cls==='demo'?'DEMO':'QA';
  const classifyAccount=a=>{
    const classes=(a.businesses||[]).map(b=>(overview?.workspaces||[]).find(w=>w.id===b.id)?.truth_class).filter(Boolean);
    if(classes.includes('verified_live'))return 'verified_live';
    if(classes.includes('unverified'))return 'unverified';
    if(classes.includes('qa'))return 'qa';
    if(classes.includes('demo'))return 'demo';
    return 'unverified';
  };
  function applyLanguage(){
    document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    q('#langBtn').textContent=lang==='ar'?'EN':'عربي';q('#brandSub').textContent=t().brandSub;q('#refreshBtn').textContent=t().refresh;q('#logoutBtn').textContent=t().logout;
    q('#loginTitle').textContent=t().loginTitle;q('#loginDesc').textContent=t().loginDesc;q('#emailLabel').textContent=t().email;q('#passwordLabel').textContent=t().password;q('#loginBtn').textContent=t().login;
    q('#title').textContent=t().title;q('#desc').textContent=t().desc;q('#mLiveCustomersLabel').textContent=t().liveCustomers;q('#mLiveBusinessesLabel').textContent=t().liveBusinesses;q('#mUnverifiedLabel').textContent=t().unverified;q('#mQaExcludedLabel').textContent=t().qaExcluded;
    q('#integrationsTitle').textContent=t().integrations;q('#mLiveConvLabel').textContent=t().liveConv;q('#mLiveOrdersLabel').textContent=t().liveOrders;q('#workspacesTitle').textContent=t().workspaces;q('#qualityTitle').textContent=t().quality;q('#qualityHeading').textContent=t().qualityHeading;q('#rawLabel').textContent=t().raw;q('#rawCustomersLabel').textContent=t().rawCustomers;q('#rawConversationsLabel').textContent=t().rawConversations;q('#accountsTitle').textContent=t().accounts;q('#accountSearch').placeholder=t().searchPlaceholder;q('#searchBtn').textContent=t().search;
    qa('#workspaceTabs [data-filter]').forEach(b=>{const f=b.dataset.filter;b.textContent=f==='business'?t().business:f==='all'?t().all:(f==='unverified'?t().unverified:t()[f]||f)});
    if(overview){renderOverview();renderWorkspaces();renderAccounts();}
  }
  function renderOverview(){
    const s=overview.summary||{}, dq=overview.data_quality||{};
    q('#mLiveCustomers').textContent=Number(s.verified_live_customers||0).toLocaleString();q('#mLiveBusinesses').textContent=Number(s.businesses_verified_live||0).toLocaleString();q('#mUnverified').textContent=Number(s.businesses_unverified||0).toLocaleString();q('#mQaExcluded').textContent=Number(s.qa_customers_excluded||0).toLocaleString();
    q('#mWhatsApp').textContent=Number(s.live_whatsapp_connections||0);q('#mPayments').textContent=Number(s.live_payment_accounts||0);q('#mLiveConv').textContent=Number(s.verified_live_conversations||0).toLocaleString();q('#mLiveOrders').textContent=Number(s.verified_live_orders||0).toLocaleString();
    q('#rawCustomers').textContent=Number(s.raw_customers||0).toLocaleString();q('#rawConversations').textContent=Number(s.raw_conversations||0).toLocaleString();
    q('#policyBox').textContent=t().policy;
    q('#qualityText').textContent=lang==='ar'?'تم اكتشاف '+Number(dq.qa_businesses||0)+' مساحات QA تحتوي '+Number(dq.qa_customers||0).toLocaleString()+' عميل اختبار و '+Number(dq.qa_conversations||0).toLocaleString()+' محادثة اختبار. هذه البيانات مستبعدة بالكامل من مؤشرات Live.':'Detected '+Number(dq.qa_businesses||0)+' QA workspaces containing '+Number(dq.qa_customers||0).toLocaleString()+' test customers and '+Number(dq.qa_conversations||0).toLocaleString()+' test conversations. They are fully excluded from Live metrics.';
    q('#accountSummary').textContent=(lang==='ar'?'Live '+Number(s.accounts_verified_live||0)+' · غير موثّق '+Number(s.accounts_unverified||0)+' · QA '+Number(s.accounts_qa||0):'Live '+Number(s.accounts_verified_live||0)+' · Unverified '+Number(s.accounts_unverified||0)+' · QA '+Number(s.accounts_qa||0));
    try{q('#stamp').textContent=t().generated+' · '+new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(overview.generated_at));}catch{q('#stamp').textContent=String(overview.generated_at||'')}
  }
  function renderWorkspaces(){
    const items=(overview?.workspaces||[]).filter(w=>filter==='all'?true:filter==='business'?['verified_live','unverified'].includes(w.truth_class):w.truth_class===filter);
    q('#workspaceGrid').innerHTML=items.length?items.map(w=>{
      const c=w.counts||{},e=w.evidence||{};
      return '<article class="workspace"><div class="workspaceTop"><div><b>'+esc(w.name)+'</b><small>'+esc(w.business_type||'')+'</small></div><span class="badge '+badge(w.truth_class)+'">'+label(w.truth_class)+'</span></div><div class="counts"><div class="count"><span>'+t().customers+'</span><b>'+Number(c.customers||0).toLocaleString()+'</b></div><div class="count"><span>'+t().conversations+'</span><b>'+Number(c.conversations||0).toLocaleString()+'</b></div><div class="count"><span>'+t().messages+'</span><b>'+Number(c.messages||0).toLocaleString()+'</b></div></div><div class="evidence"><span>'+t().whatsapp+': '+(e.whatsapp_live?'✓':'—')+'</span><span>'+t().payment+': '+(e.payment_live?'✓':'—')+'</span></div></article>';
    }).join(''):'<div class="empty">'+t().empty+'</div>';
  }
  function renderAccounts(){
    const visible=accounts.filter(a=>{const cls=classifyAccount(a);return filter==='all'?true:filter==='business'?['verified_live','unverified'].includes(cls):cls===filter});
    q('#accountGrid').innerHTML=visible.length?visible.map(a=>{const cls=classifyAccount(a);return '<div class="account"><span class="no">'+esc(a.customer_no)+'</span><span class="badge '+badge(cls)+'" style="float:inline-end">'+label(cls)+'</span><b>'+esc(a.email||'—')+'</b><small>'+esc((a.businesses||[]).map(b=>b.name).join(' · ')||'—')+'</small></div>'}).join(''):'<div class="empty">'+t().empty+'</div>';
  }
  async function loadOverview(){
    const {r,p}=await api('/api/platform-customers?action=overview');if(!r.ok)throw new Error(p.error||'OVERVIEW_FAILED');overview=p.overview;renderOverview();renderWorkspaces();
  }
  async function loadAccounts(term=''){
    const {r,p}=await api('/api/platform-customers?action=search&q='+encodeURIComponent(term));if(!r.ok)throw new Error(p.error||'SEARCH_FAILED');accounts=p.accounts||[];renderAccounts();
  }
  async function boot(){
    q('#loading').classList.remove('hidden');q('#loginGate').classList.add('hidden');q('#dashboard').classList.add('hidden');
    const {r:sr,p:sp}=await api('/api/auth/session');
    if(!sr.ok||!sp.authenticated){q('#loading').classList.add('hidden');q('#loginGate').classList.remove('hidden');return;}
    const {r:cr,p:cp}=await api('/api/platform-customers?action=capability');
    if(!cr.ok||!cp.allowed){q('#loading').classList.add('hidden');q('#loginGate').classList.remove('hidden');q('#loginMsg').textContent=t().notAdmin;return;}
    await Promise.all([loadOverview(),loadAccounts('')]);
    q('#loading').classList.add('hidden');q('#dashboard').classList.remove('hidden');q('#refreshBtn').classList.remove('hidden');q('#logoutBtn').classList.remove('hidden');
  }
  q('#loginForm').addEventListener('submit',async e=>{e.preventDefault();q('#loginMsg').textContent='';const {r}=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:q('#email').value,password:q('#password').value})});if(!r.ok){q('#loginMsg').textContent=t().badLogin;return;}await boot().catch(()=>{q('#loginMsg').textContent=t().badLogin})});
  q('#refreshBtn').addEventListener('click',()=>Promise.all([loadOverview(),loadAccounts(q('#accountSearch').value||'')]).catch(()=>{}));
  q('#logoutBtn').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.reload()});
  q('#langBtn').addEventListener('click',()=>{lang=lang==='ar'?'en':'ar';applyLanguage()});
  q('#searchBtn').addEventListener('click',()=>loadAccounts(q('#accountSearch').value||'').catch(()=>{}));q('#accountSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadAccounts(e.target.value||'').catch(()=>{})});
  qa('#workspaceTabs [data-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.filter;qa('#workspaceTabs .tab').forEach(x=>x.classList.toggle('on',x===btn));renderWorkspaces();renderAccounts()}));
  applyLanguage();boot().catch(()=>{q('#loading').classList.add('hidden');q('#loginGate').classList.remove('hidden');q('#loginMsg').textContent=t().badLogin});
})();
</script>
</body>
</html>`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','text/html; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-frame-options','DENY');
  res.setHeader('referrer-policy','same-origin');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('x-dabbir-owner-dashboard','truth-v1');
  return res.end(PAGE);
}
