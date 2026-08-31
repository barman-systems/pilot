const script = String.raw`(()=>{
  if(window.__dabbirBusinessWorkspaces)return;
  window.__dabbirBusinessWorkspaces='v1';

  const ACTIVE_KEY='dabbir_active_business_id';
  const RESTORE_KEY='dabbir_business_restore_v1';
  let portfolio=null;
  let loadingPortfolio=false;
  let menuOpen=false;

  const css=document.createElement('style');
  css.dataset.dabbirBusinessWorkspaces='v1';
  css.textContent=\`
    .dbw-switch{margin-top:9px;position:relative}.dbw-switch-btn{width:100%;min-height:40px;border:1px solid #30363d;background:#1b1e22;color:#fff;border-radius:11px;padding:8px 10px;display:flex;align-items:center;gap:8px;text-align:start}.dbw-switch-btn .dbw-grow{min-width:0;flex:1}.dbw-switch-btn b{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbw-switch-btn small{display:block;margin-top:2px;color:#8f969e;font-size:8px}.dbw-chevron{color:#949ba3;font-size:10px}.dbw-menu{display:none;margin-top:6px;border:1px solid #30363d;background:#111315;border-radius:12px;padding:6px;max-height:310px;overflow:auto}.dbw-menu.open{display:block}.dbw-menu-item{width:100%;min-height:45px;border:0;background:transparent;color:#dfe3e7;border-radius:9px;padding:8px;display:flex;align-items:center;gap:8px;text-align:start}.dbw-menu-item:hover,.dbw-menu-item.current{background:#1f2327}.dbw-menu-item .dbw-dot{width:8px;height:8px;border-radius:50%;background:#59616a;flex:0 0 auto}.dbw-menu-item.current .dbw-dot{background:var(--accent)}.dbw-menu-item span{min-width:0;flex:1}.dbw-menu-item b{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbw-menu-item small{display:block;color:#858c94;font-size:8px;margin-top:2px}.dbw-menu-divider{height:1px;background:#252a30;margin:5px 2px}.dbw-add{color:var(--accent)!important;font-weight:900}.dbw-side-nav{margin-top:3px}.dbw-mobile-button{display:none;border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:11px;width:40px;height:40px;min-height:40px;padding:0;font-weight:950}
    .dbw-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.dbw-summary .card span{display:block;color:var(--muted);font-size:9px}.dbw-summary .card strong{display:block;font-size:22px;margin-top:7px}.dbw-business-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.dbw-business{border:1px solid var(--line);background:linear-gradient(180deg,#15181b,#101214);border-radius:17px;padding:14px;min-width:0}.dbw-business.current{border-color:#5c6d2f;box-shadow:inset 0 0 0 1px #d7ff5f18}.dbw-business-head{display:flex;align-items:flex-start;gap:10px}.dbw-business-head .grow{min-width:0;flex:1}.dbw-business h3{font-size:14px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbw-business .dbw-type{display:inline-flex;margin-top:5px;border-radius:999px;background:#23272c;color:#b7bdc4;padding:4px 7px;font-size:8px}.dbw-current{display:inline-flex;border-radius:999px;background:#233019;color:var(--accent);padding:5px 7px;font-size:8px;font-weight:900}.dbw-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:12px}.dbw-metric{border:1px solid #272c31;background:#171a1d;border-radius:11px;padding:8px;min-width:0}.dbw-metric span{display:block;font-size:7px;color:#858c94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dbw-metric strong{display:block;font-size:13px;margin-top:4px}.dbw-branches{margin-top:11px;border-top:1px solid #252a30;padding-top:10px}.dbw-branches-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.dbw-branches-head b{font-size:9px}.dbw-mini-btn{border:1px solid #343a41;background:#191d21;color:#fff;border-radius:9px;min-height:32px;padding:5px 8px;font-size:8px;font-weight:850}.dbw-branch-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.dbw-branch{border:1px solid #2d3238;background:#15181b;color:#bfc5cb;border-radius:999px;padding:5px 8px;font-size:8px}.dbw-branch.primary{border-color:#4c592d;color:#dbeab0}.dbw-card-actions{display:flex;gap:7px;margin-top:12px}.dbw-card-actions button{flex:1}.dbw-empty{border:1px dashed #333940;border-radius:16px;padding:26px;text-align:center;color:var(--muted);font-size:10px}.dbw-portfolio-actions{display:flex;gap:8px}.dbw-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.dbw-form-grid .wide{grid-column:1/-1;margin-top:0}.dbw-form-grid .field{margin-top:0}.dbw-form-grid input,.dbw-form-grid select{font-size:16px}.dbw-modal-msg{min-height:20px;color:var(--yellow);font-size:9px;margin-top:7px}.dbw-money{font-variant-numeric:tabular-nums}
    @media(max-width:920px){.dbw-business-grid{grid-template-columns:1fr}.dbw-summary{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:700px){.dbw-mobile-button{display:inline-grid;place-items:center}.dbw-summary{gap:7px}.dbw-summary .card{padding:11px}.dbw-summary .card strong{font-size:18px}.dbw-business{padding:12px}.dbw-metrics{grid-template-columns:repeat(2,1fr)}.dbw-form-grid{grid-template-columns:1fr}.dbw-form-grid .wide{grid-column:auto}.dbw-portfolio-actions{width:100%}.dbw-portfolio-actions button{flex:1}.dbw-switch-btn{min-height:44px}}
  \`;
  document.head.append(css);

  function isArabic(){
    try{return typeof lang!=='undefined'?lang!=='en':document.documentElement.lang!=='en'}catch{return document.documentElement.lang!=='en'}
  }

  function c(){return isArabic()?{
    myBusinesses:'أعمالي',switchBusiness:'تبديل النشاط',manageBusinesses:'إدارة كل أنشطتك',addBusiness:'إضافة نشاط',addBranch:'إضافة فرع',open:'فتح النشاط',current:'الحالي',businesses:'الأنشطة',branches:'الفروع',customers:'العملاء',appointments:'مواعيد اليوم',orders:'طلبات اليوم',revenue:'دخل اليوم',portfolioTitle:'كل أعمالي',portfolioDesc:'حساب واحد لكل أنشطتك. بيانات كل نشاط مستقلة، ويمكنك التبديل بينها فورًا.',noBusinesses:'لا توجد أنشطة مرتبطة بهذا الحساب.',businessName:'اسم النشاط',businessType:'نوع النشاط',branchName:'اسم الفرع',phone:'رقم الهاتف',address:'العنوان / المنطقة',save:'حفظ',cancel:'إلغاء',creating:'جارٍ الإنشاء…',created:'تم إنشاء النشاط',branchCreated:'تمت إضافة الفرع',failed:'تعذر إكمال العملية',primary:'رئيسي',billing:'الاشتراك',notConfigured:'غير مهيأ',active:'نشط',trialing:'تجريبي',selectBusiness:'اختر نشاطًا',activityCount:'نشاط',branchCount:'فرع',
    types:{clinic:'عيادة',store:'متجر',creator:'مشهور / صانع محتوى',salon:'صالون',real_estate:'عقارات',services:'خدمات',car_wash:'غسيل سيارات متنقل',laundry:'مغسلة',other:'أخرى'}
  }:{
    myBusinesses:'My businesses',switchBusiness:'Switch business',manageBusinesses:'Manage all businesses',addBusiness:'Add business',addBranch:'Add branch',open:'Open business',current:'Current',businesses:'Businesses',branches:'Branches',customers:'Customers',appointments:'Today appointments',orders:'Today orders',revenue:'Today revenue',portfolioTitle:'All my businesses',portfolioDesc:'One account for all your businesses. Each business keeps independent data and can be switched instantly.',noBusinesses:'No businesses are linked to this account.',businessName:'Business name',businessType:'Business type',branchName:'Branch name',phone:'Phone',address:'Address / area',save:'Save',cancel:'Cancel',creating:'Creating…',created:'Business created',branchCreated:'Branch added',failed:'Could not complete the operation',primary:'Primary',billing:'Subscription',notConfigured:'Not configured',active:'Active',trialing:'Trial',selectBusiness:'Choose a business',activityCount:'business',branchCount:'branch',
    types:{clinic:'Clinic',store:'Store',creator:'Creator',salon:'Salon',real_estate:'Real estate',services:'Services',car_wash:'Mobile car wash',laundry:'Laundry',other:'Other'}
  }}

  function e(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function money(value){
    const n=Number(value||0);
    try{return new Intl.NumberFormat(isArabic()?'ar-AE':'en-AE',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n)+' '+(isArabic()?'د.إ':'AED')}catch{return n.toFixed(2)+' AED'}
  }
  function typeName(type){return c().types[String(type||'').toLowerCase()]||String(type||c().types.other)}
  function activeBusinessId(){try{return workspace?.business?.id||null}catch{return null}}
  function notify(text){try{if(typeof toast==='function')return toast(text)}catch{};console.info(text)}

  async function request(url,options={}){
    const headers={'content-type':'application/json','x-dabbir-client':'web',...(options.headers||{})};
    try{
      const response=await fetch(url,{cache:'no-store',...options,headers});
      const data=await response.json().catch(()=>({}));
      return {response,data};
    }catch{return {response:{ok:false,status:0},data:{ok:false,error:'NETWORK_ERROR'}}}
  }

  async function fetchPortfolio(force=false){
    if(portfolio&&!force)return portfolio;
    if(loadingPortfolio)return portfolio;
    loadingPortfolio=true;
    try{
      const {response,data}=await request('/api/business-portfolio');
      if(!response.ok||!data.ok)return portfolio;
      portfolio=data;
      return portfolio;
    }finally{loadingPortfolio=false}
  }

  function addDictionaryKey(){
    try{
      if(typeof D==='object'){
        if(D.ar)D.ar['business-portfolio']='أعمالي';
        if(D.en)D.en['business-portfolio']='My businesses';
      }
    }catch{}
  }

  function ensurePortfolioScreen(){
    const content=document.querySelector('.content');
    if(!content)return null;
    let screen=document.querySelector('#screen-business-portfolio');
    if(!screen){
      screen=document.createElement('section');
      screen.className='screen';
      screen.id='screen-business-portfolio';
      screen.innerHTML='<div class="hero"><div><h1 id="dbwPortfolioTitle"></h1><p id="dbwPortfolioDesc"></p></div><div class="dbw-portfolio-actions"><button type="button" class="primary" id="dbwAddBusiness"></button></div></div><div class="dbw-summary" id="dbwSummary"></div><div class="dbw-business-grid" id="dbwBusinessGrid"></div>';
      content.append(screen);
      screen.querySelector('#dbwAddBusiness')?.addEventListener('click',()=>openBusinessModal());
    }
    return screen;
  }

  function ensureNavigation(){
    const nav=document.querySelector('.side .nav');
    if(nav&&!nav.querySelector('#dbwPortfolioNav')){
      const button=document.createElement('button');
      button.type='button';button.className='navBtn dbw-side-nav';button.id='dbwPortfolioNav';
      button.innerHTML='<span class="navIcon">▦</span><span id="dbwPortfolioNavLabel"></span>';
      button.addEventListener('click',showPortfolio);
      nav.append(button);
    }
    const top=document.querySelector('.topActions');
    if(top&&!top.querySelector('#dbwMobileBusinesses')){
      const button=document.createElement('button');
      button.type='button';button.id='dbwMobileBusinesses';button.className='dbw-mobile-button';button.textContent='▦';
      button.addEventListener('click',showPortfolio);
      top.prepend(button);
    }
  }

  function ensureSwitcher(){
    const workspaceBox=document.querySelector('.side .workspace');
    if(!workspaceBox)return null;
    let wrap=workspaceBox.querySelector('#dbwSwitcher');
    if(!wrap){
      wrap=document.createElement('div');wrap.id='dbwSwitcher';wrap.className='dbw-switch';
      wrap.innerHTML='<button type="button" class="dbw-switch-btn" id="dbwSwitchBtn" aria-expanded="false"><span class="dbw-grow"><b id="dbwSwitchTitle"></b><small id="dbwSwitchSub"></small></span><span class="dbw-chevron">⌄</span></button><div class="dbw-menu" id="dbwMenu"></div>';
      workspaceBox.append(wrap);
      wrap.querySelector('#dbwSwitchBtn')?.addEventListener('click',()=>{
        menuOpen=!menuOpen;renderSwitcher();
      });
    }
    return wrap;
  }

  async function switchBusiness(businessId){
    const id=String(businessId||'');
    if(!id||id===activeBusinessId()){menuOpen=false;renderSwitcher();return}
    const allowed=(portfolio?.businesses||[]).some(b=>b.id===id);
    if(!allowed)return;
    try{localStorage.setItem(ACTIVE_KEY,id)}catch{}
    menuOpen=false;
    if(typeof loadRuntime==='function')await loadRuntime(id);
    renderSwitcher();
    renderPortfolio();
  }

  function renderSwitcher(){
    const wrap=ensureSwitcher();if(!wrap)return;
    const t=c(),currentId=activeBusinessId();
    const current=(portfolio?.businesses||[]).find(b=>b.id===currentId);
    const title=wrap.querySelector('#dbwSwitchTitle'),sub=wrap.querySelector('#dbwSwitchSub'),menu=wrap.querySelector('#dbwMenu'),btn=wrap.querySelector('#dbwSwitchBtn');
    if(title)title.textContent=t.switchBusiness;
    if(sub)sub.textContent=current?.name||t.selectBusiness;
    if(btn)btn.setAttribute('aria-expanded',String(menuOpen));
    if(!menu)return;
    menu.classList.toggle('open',menuOpen);
    const rows=(portfolio?.businesses||[]).map(b=>'<button type="button" class="dbw-menu-item '+(b.id===currentId?'current':'')+'" data-dbw-business="'+e(b.id)+'"><span class="dbw-dot"></span><span><b>'+e(b.name)+'</b><small>'+e(typeName(b.business_type))+' • '+e((b.branches||[]).length)+' '+e(t.branchCount)+'</small></span></button>').join('');
    menu.innerHTML=rows+'<div class="dbw-menu-divider"></div><button type="button" class="dbw-menu-item dbw-add" id="dbwMenuPortfolio">▦ <span>'+e(t.manageBusinesses)+'</span></button><button type="button" class="dbw-menu-item dbw-add" id="dbwMenuAdd">＋ <span>'+e(t.addBusiness)+'</span></button>';
    menu.querySelectorAll('[data-dbw-business]').forEach(node=>node.addEventListener('click',()=>switchBusiness(node.dataset.dbwBusiness)));
    menu.querySelector('#dbwMenuPortfolio')?.addEventListener('click',()=>{menuOpen=false;showPortfolio()});
    menu.querySelector('#dbwMenuAdd')?.addEventListener('click',()=>{menuOpen=false;openBusinessModal()});
  }

  function billingLabel(billing){
    if(!billing)return c().notConfigured;
    const status=String(billing.status||'').toLowerCase();
    if(status==='active')return c().active;
    if(status==='trialing'||status==='trial')return c().trialing;
    return billing.status||c().notConfigured;
  }

  function renderPortfolio(){
    const screen=ensurePortfolioScreen();if(!screen)return;
    const t=c(),data=portfolio||{businesses:[],summary:{}};
    const currentId=activeBusinessId();
    const s=data.summary||{};
    const title=screen.querySelector('#dbwPortfolioTitle'),desc=screen.querySelector('#dbwPortfolioDesc'),add=screen.querySelector('#dbwAddBusiness');
    if(title)title.textContent=t.portfolioTitle;if(desc)desc.textContent=t.portfolioDesc;if(add)add.textContent='＋ '+t.addBusiness;
    const summary=screen.querySelector('#dbwSummary');
    if(summary)summary.innerHTML=[
      [t.businesses,Number(s.businesses||0)],
      [t.branches,Number(s.branches||0)],
      [t.appointments,Number(s.appointments_today||0)],
      [t.revenue,money(s.revenue_today_aed||0)]
    ].map(x=>'<div class="card"><span>'+e(x[0])+'</span><strong class="'+(x[0]===t.revenue?'dbw-money':'')+'">'+e(x[1])+'</strong></div>').join('');

    const grid=screen.querySelector('#dbwBusinessGrid');if(!grid)return;
    if(!(data.businesses||[]).length){grid.innerHTML='<div class="dbw-empty">'+e(t.noBusinesses)+'</div>';return}
    grid.innerHTML=data.businesses.map(b=>{
      const current=b.id===currentId,m=b.metrics||{},branches=b.branches||[],canManage=b.membership?.can_manage_business===true;
      const branchHtml=branches.length?branches.map(branch=>'<span class="dbw-branch '+(branch.is_primary?'primary':'')+'">'+e(branch.name)+(branch.is_primary?' • '+e(t.primary):'')+'</span>').join(''):'<span class="dbw-branch">—</span>';
      return '<article class="dbw-business '+(current?'current':'')+'" data-dbw-card="'+e(b.id)+'"><div class="dbw-business-head"><div class="grow"><h3>'+e(b.name)+'</h3><span class="dbw-type">'+e(typeName(b.business_type))+'</span></div>'+(current?'<span class="dbw-current">'+e(t.current)+'</span>':'')+'</div><div class="dbw-metrics"><div class="dbw-metric"><span>'+e(t.customers)+'</span><strong>'+e(m.customers_total||0)+'</strong></div><div class="dbw-metric"><span>'+e(t.appointments)+'</span><strong>'+e(m.appointments_today||0)+'</strong></div><div class="dbw-metric"><span>'+e(t.orders)+'</span><strong>'+e(m.orders_today||0)+'</strong></div><div class="dbw-metric"><span>'+e(t.revenue)+'</span><strong class="dbw-money">'+e(money(m.revenue_today_aed||0))+'</strong></div></div><div class="dbw-branches"><div class="dbw-branches-head"><b>'+e(t.branches)+' • '+e(billingLabel(b.billing))+'</b>'+(canManage?'<button type="button" class="dbw-mini-btn" data-dbw-add-branch="'+e(b.id)+'">＋ '+e(t.addBranch)+'</button>':'')+'</div><div class="dbw-branch-list">'+branchHtml+'</div></div><div class="dbw-card-actions">'+(current?'<button type="button" class="secondary" disabled>'+e(t.current)+'</button>':'<button type="button" class="primary" data-dbw-open="'+e(b.id)+'">'+e(t.open)+'</button>')+'</div></article>';
    }).join('');
    grid.querySelectorAll('[data-dbw-open]').forEach(node=>node.addEventListener('click',()=>switchBusiness(node.dataset.dbwOpen)));
    grid.querySelectorAll('[data-dbw-add-branch]').forEach(node=>node.addEventListener('click',()=>openBranchModal(node.dataset.dbwAddBranch)));
  }

  function refreshCopy(){
    ensureNavigation();ensureSwitcher();ensurePortfolioScreen();
    const t=c();
    const nav=document.querySelector('#dbwPortfolioNavLabel');if(nav)nav.textContent=t.myBusinesses;
    const mobile=document.querySelector('#dbwMobileBusinesses');if(mobile){mobile.title=t.myBusinesses;mobile.setAttribute('aria-label',t.myBusinesses)}
    renderSwitcher();renderPortfolio();
  }

  async function showPortfolio(){
    await fetchPortfolio(false);
    addDictionaryKey();refreshCopy();
    if(typeof showScreen==='function')showScreen('business-portfolio');
    const page=document.querySelector('#pageTitle');if(page)page.textContent=c().myBusinesses;
    document.querySelector('#side')?.classList.remove('open');
  }

  function makeModal(kind,businessId){
    document.querySelector('#dbwModal')?.remove();
    const t=c(),isBusiness=kind==='business';
    const modal=document.createElement('div');modal.className='modal open';modal.id='dbwModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const businessFields='<div class="field wide"><label>'+e(t.businessName)+'</label><input id="dbwName" maxlength="120" required autocomplete="organization"></div><div class="field wide"><label>'+e(t.businessType)+'</label><select id="dbwType"><option value="salon">'+e(t.types.salon)+'</option><option value="clinic">'+e(t.types.clinic)+'</option><option value="car_wash">'+e(t.types.car_wash)+'</option><option value="store">'+e(t.types.store)+'</option><option value="services">'+e(t.types.services)+'</option><option value="laundry">'+e(t.types.laundry)+'</option><option value="real_estate">'+e(t.types.real_estate)+'</option><option value="creator">'+e(t.types.creator)+'</option><option value="other">'+e(t.types.other)+'</option></select></div>';
    const branchFields='<div class="field wide"><label>'+e(t.branchName)+'</label><input id="dbwBranchName" maxlength="120" required></div><div class="field"><label>'+e(t.phone)+'</label><input id="dbwBranchPhone" maxlength="40" inputmode="tel"></div><div class="field"><label>'+e(t.address)+'</label><input id="dbwBranchAddress" maxlength="500"></div>';
    modal.innerHTML='<form class="modalBox" id="dbwForm"><h3>'+e(isBusiness?t.addBusiness:t.addBranch)+'</h3><div class="dbw-form-grid">'+(isBusiness?businessFields:branchFields)+'</div><div class="dbw-modal-msg" id="dbwMsg"></div><div class="modalActions"><button type="button" class="secondary" id="dbwCancel">'+e(t.cancel)+'</button><button type="submit" class="primary" id="dbwSave">'+e(t.save)+'</button></div></form>';
    document.body.append(modal);
    modal.querySelector('#dbwCancel')?.addEventListener('click',()=>modal.remove());
    modal.addEventListener('click',event=>{if(event.target===modal)modal.remove()});
    modal.querySelector('#dbwForm')?.addEventListener('submit',event=>submitModal(event,kind,businessId));
    setTimeout(()=>modal.querySelector(isBusiness?'#dbwName':'#dbwBranchName')?.focus(),0);
  }

  function openBusinessModal(){makeModal('business',null)}
  function openBranchModal(businessId){makeModal('branch',businessId)}

  async function submitModal(event,kind,businessId){
    event.preventDefault();
    const modal=document.querySelector('#dbwModal'),save=modal?.querySelector('#dbwSave'),msg=modal?.querySelector('#dbwMsg'),t=c();
    if(!modal||!save)return;
    save.disabled=true;save.textContent=t.creating;if(msg)msg.textContent='';
    try{
      if(kind==='business'){
        const name=String(modal.querySelector('#dbwName')?.value||'').trim();
        const businessType=String(modal.querySelector('#dbwType')?.value||'other');
        const {response,data}=await request('/api/dabbir-runtime',{method:'POST',body:JSON.stringify({action:'create_business',name,business_type:businessType,locale:isArabic()?'ar-AE':'en-AE'})});
        if(!response.ok||!data.ok||!data.business_id){if(msg)msg.textContent=data.error||t.failed;return}
        portfolio=null;await fetchPortfolio(true);
        try{localStorage.setItem(ACTIVE_KEY,data.business_id)}catch{}
        modal.remove();notify(t.created);
        if(typeof loadRuntime==='function')await loadRuntime(data.business_id);
      }else{
        const name=String(modal.querySelector('#dbwBranchName')?.value||'').trim();
        const phone=String(modal.querySelector('#dbwBranchPhone')?.value||'').trim();
        const address=String(modal.querySelector('#dbwBranchAddress')?.value||'').trim();
        const {response,data}=await request('/api/business-portfolio',{method:'POST',body:JSON.stringify({action:'create_branch',business_id:businessId,name,phone_e164:phone,address_text:address,timezone:'Asia/Dubai'})});
        if(!response.ok||!data.ok){if(msg)msg.textContent=data.error||t.failed;return}
        portfolio=null;await fetchPortfolio(true);modal.remove();notify(t.branchCreated);
      }
      refreshCopy();
    }finally{if(document.body.contains(save)){save.disabled=false;save.textContent=t.save}}
  }

  async function restoreLastBusiness(){
    let saved=null;try{saved=localStorage.getItem(ACTIVE_KEY)}catch{}
    const current=activeBusinessId();
    if(!saved||saved===current)return;
    const exists=(portfolio?.businesses||[]).some(b=>b.id===saved);
    if(!exists)return;
    try{
      if(sessionStorage.getItem(RESTORE_KEY)===saved)return;
      sessionStorage.setItem(RESTORE_KEY,saved);
    }catch{}
    await switchBusiness(saved);
  }

  function patchRuntimeSelection(){
    try{
      if(typeof loadRuntime!=='function'||loadRuntime.__dbwPatched)return;
      const original=loadRuntime;
      const wrapped=async function(businessId,conversationId){
        const result=await original(businessId,conversationId);
        const current=activeBusinessId();
        if(current){try{localStorage.setItem(ACTIVE_KEY,current)}catch{}}
        setTimeout(()=>{renderSwitcher();renderPortfolio()},0);
        return result;
      };
      wrapped.__dbwPatched=true;
      loadRuntime=wrapped;
    }catch{}
  }

  async function init(){
    addDictionaryKey();ensureNavigation();ensureSwitcher();ensurePortfolioScreen();patchRuntimeSelection();
    await fetchPortfolio(true);
    await restoreLastBusiness();
    refreshCopy();
  }

  document.addEventListener('click',event=>{
    if(menuOpen&&!event.target?.closest?.('#dbwSwitcher')){menuOpen=false;renderSwitcher()}
  },true);
  new MutationObserver(()=>requestAnimationFrame(()=>{ensureNavigation();ensureSwitcher()})).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('dabbir:language-changed',refreshCopy);
  setTimeout(init,0);
  setTimeout(init,700);
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
  return res.end(script);
}
