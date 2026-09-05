import { createRecordResume } from './_record-resume.js';
export const activityExperienceUi=String.raw`(()=>{
  if(window.__dabbirActivityExperienceUi||!document.head)return;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ws=()=>{try{return workspace}catch{return null}};
  const language=()=>document.documentElement.lang==='en'?'en':'ar';
  const text=(ar,en)=>language()==='ar'?ar:en;
  const registry=window.__dabbirActivityExperience;
  const resumeRecord=(${createRecordResume.toString()})(history.state?.dabbirRecord);
  let business=null,branch=null,signature='',activeRecord=null;
  const style=document.createElement('style');
  style.textContent='.daeHidden{display:none!important}.daeDashboard{order:1;display:grid;gap:12px;margin-bottom:12px}.daeDashboard h2{margin:0;font-size:18px}.daeDashboard p{font-size:14px;color:var(--muted);line-height:1.6}.daeActions{display:flex;gap:8px;flex-wrap:wrap}.daeActions button,.daeRow{min-height:48px;font-size:14px}.daeRow{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:start;padding:12px;margin-top:8px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:inherit}.daeRow span{display:block;font-size:13px;color:var(--muted);margin-top:4px}.daeGroupTitle{grid-column:1/-1;margin:12px 0 4px;font-size:16px}.daeSettings{margin-top:16px}.daeBack{margin-bottom:12px}.daeDetail{position:fixed;inset:0;z-index:200;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px}.daeDetail .modalBox{max-height:85dvh;overflow:auto;width:min(540px,100%);font-size:16px}.daeDetail button{min-height:44px}.daeDetail p{overflow-wrap:anywhere}.daeOwner #dashCards,.daeOwner #screen-dashboard>.todayGrid,.daeOwner #doMetrics{display:none!important}.daeOwner #screen-dashboard>.hero{order:0}.daeOwner #dabbirActionCenter{order:2}.daeOwner #dabbirOperatorSummary{order:4}.daeOwner #setupCard{display:none!important}.daeOwner #dabbirActivation{order:5}.daeOwner #salonToday{order:3}.daeOwner .daeDashboard{order:1}.daeOwner #screen-dashboard.active{display:flex;flex-direction:column}#bottomNav{grid-template-columns:repeat(var(--dae-primary-count,5),minmax(0,1fr))!important}#bottomNav [hidden],#nav [hidden]{display:none!important}@media(max-width:700px){.daeDashboard h2{font-size:17px}.daeActions button{flex:1 1 42%}.daeDetail{align-items:flex-end;padding:0}.daeDetail .modalBox{width:100%;max-height:85dvh;border-radius:20px 20px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom))}.daeRow{min-width:0}.daeRow b{overflow-wrap:anywhere}}';
  document.head.append(style);
  function button(label,action){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.onclick=action;return b}
  function navigate(target){const m=registry.model(ws(),language());if(m.allowed(target)&&typeof showScreen==='function')showScreen(target)}
  function closeDetail(){if(history.state?.daeDetail){const state={...history.state};delete state.daeDetail;history.replaceState(state,'')}const box=q('#daeDetail');if(!box)return;box.remove();activeRecord=null;const origin=q('[data-dae-return="true"]');origin?.focus();origin?.removeAttribute('data-dae-return')}
  function openRecord(row){
    const w=ws(),m=registry.model(w,language());if(!m.allowed(row.target))return;
    if(row.type==='appointment'&&window.__dabbirAppointmentManagement?.openRecord){void window.__dabbirAppointmentManagement.openRecord(row.id);return}
    if(row.type==='order'&&window.__dabbirOwnerOperations?.openOrderRecord){void window.__dabbirOwnerOperations.openOrderRecord(row.id);return}
    if(row.type==='inventory'&&window.__dabbirOwnerOperations?.openProductRecord){void window.__dabbirOwnerOperations.openProductRecord(row.id);return}
    closeDetail();document.activeElement?.setAttribute?.('data-dae-return','true');
    if(row.target==='conversations'){
      navigate(row.target);if(row.id&&typeof loadRuntime==='function')void loadRuntime(w.business.id,row.id);return;
    }
    // A missing native detail must not silently fall back to an unrelated loaded row.
    if(['appointment','inventory','order'].includes(row.type)){
      if(typeof toast==='function')toast(text('تعذر تحميل تفاصيل السجل. أعد المحاولة.','Record details could not be loaded. Please retry.'));
      return;
    }
    navigate(row.target);
  }

  function format(value){if(!value)return '';if(/^\d{4}-\d\d-\d\dT/.test(String(value))){try{return new Intl.DateTimeFormat(language()==='ar'?'ar-AE':'en-AE',{timeZone:ws()?.business?.timezone||'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{}}return String(value)}
  function refresh(){
    const w=ws();if(!w?.business?.id)return;
    const m=registry.model(w,language());
    resumeRecord({businessId:w.business.id,branch:w.branch_scope?.branch_id||w.branch_scope?.mode||''},{
      appointment:m.allowed('appointments')?window.__dabbirAppointmentManagement?.openRecord:null,
      order:m.allowed('operations')?window.__dabbirOwnerOperations?.openOrderRecord:null,
      inventory:m.allowed('operations')?window.__dabbirOwnerOperations?.openProductRecord:null,
      task:m.allowed('tasks')?window.__dabbirTaskRecord?.openRecord:null
    });
    const nextBranch=w.branch_scope?.branch_id||w.branch_scope?.mode||'';
    if(business!==w.business.id||branch!==nextBranch){business=w.business.id;branch=nextBranch;signature='';closeDetail();q('#doReceipt')?.replaceChildren();const command=q('#doCommandInput');if(command)command.value='';}
    document.body.classList.toggle('daeOwner',m.owner);
    for(const id of ['#dabbirOperatorSummary','#dabbirActionCenter'])q(id)?.classList.toggle('daeHidden',!m.owner);
    for(const nav of [q('#nav'),q('#bottomNav')]){
      if(!nav)continue;
      nav.style.setProperty('--dae-primary-count',String(m.primary.length));
      for(const target of m.primary){const node=nav.querySelector('[data-screen="'+target+'"]');if(node&&node.parentElement===nav)nav.append(node)}
      [...nav.querySelectorAll('[data-screen]')].forEach(node=>{
        const target=node.dataset.screen;node.hidden=!m.primary.includes(target);node.classList.toggle('daeHidden',node.hidden);
        const label=node.querySelector('[data-label]');if(label)label.textContent=m.label(target);
        node.setAttribute('aria-label',m.label(target));
        const screen=typeof current==='string'?current:'dashboard',active=target===screen||(target==='more'&&!m.primary.includes(screen));node.classList.toggle('active',active);if(active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
      });
    }
    const currentScreen=typeof current==='string'?current:'dashboard';
    if(!m.allowed(currentScreen)&&['appointments','operations','customers','conversations','analytics','tasks','automations','integrations'].includes(currentScreen))navigate('dashboard');
    if(q('#pageTitle'))q('#pageTitle').textContent=m.label(typeof current==='string'?current:'dashboard');
    const grid=q('#screen-more .moreGrid'),settings=q('#screen-settings');
    if(grid&&settings){
      let utility=q('#daeSettings');if(!utility){utility=document.createElement('div');utility.id='daeSettings';utility.className='moreGrid daeSettings';settings.insertBefore(utility,settings.children[1]||null)}
      for(const target of ['integrations','automations','help']){
        const card=q('#screen-more .moreCard[data-screen="'+target+'"]')||utility.querySelector('[data-screen="'+target+'"]');
        if(card){utility.append(card);card.classList.toggle('daeHidden',!m.allowed(target));const h=card.querySelector('h3');if(h)h.textContent=m.label(target)}
      }
      grid.querySelectorAll('.moreCard[data-screen]').forEach(card=>{const target=card.dataset.screen;card.classList.toggle('daeHidden',!m.allowed(target));const h=card.querySelector('h3');if(h)h.textContent=m.label(target)});
      const services=q('#dabbirContextServices');services?.classList.toggle('daeHidden',!m.profile.services||!m.allowed('operations'));
      for(const id of ['#teamLink','#dabbirTeamAccess'])q(id)?.classList.toggle('daeHidden',!['owner','admin'].includes(m.role));
      // The existing assistant shortcut scrolls to a permanently hidden copilot. Route to the real command form instead.
      const assistant=q('#dabbirAssistantAccess');if(assistant){assistant.classList.toggle('daeHidden',!m.owner);const h=assistant.querySelector('h3');if(h)h.textContent=text('تنفيذ إجراء','Run an action');assistant.onclick=()=>{navigate('dashboard');q('#doCommandInput')?.scrollIntoView({block:'center'});q('#doCommandInput')?.focus()}}
    }
    if(!m.owner){q('#daeDashboard')?.remove();return}
    let panel=q('#daeDashboard');if(!panel){panel=document.createElement('section');panel.id='daeDashboard';panel.className='daeDashboard card';q('#screen-dashboard')?.prepend(panel)}
    const rows=registry.workRows(w,language());
    const sig=JSON.stringify([business,m.type,language(),rows,w.membership?.permissions,w.owner_action_center?.handled]);
    if(sig===signature)return;signature=sig;const resultsOpen=panel.querySelector('details')?.open;panel.replaceChildren();
    const title=document.createElement('h2');title.textContent=m.name+' — '+text('اليوم','Today');panel.append(title);
    const actions=document.createElement('div');actions.className='daeActions';
    for(const route of [m.profile.activity,'tasks','conversations','analytics'].filter(m.allowed))actions.append(button(m.label(route),()=>navigate(route)));
    panel.append(actions);
    const heading=document.createElement('h3');heading.textContent=m.work;panel.append(heading);
    if(!rows.length){const empty=document.createElement('p');empty.textContent=m.type==='store'&&!w.owner_action_center?text('تعذر تحميل أولويات المتجر بعد.','Store priorities are not loaded yet.'):text('لا توجد عناصر في البيانات المتاحة.','No items in the available data.');panel.append(empty)}
    for(const row of rows.slice(0,5)){const b=button('',()=>openRecord(row));b.className='daeRow';const copy=document.createElement('div'),name=document.createElement('b'),detail=document.createElement('span');name.textContent=row.title;detail.textContent=format(row.detail);copy.append(name,detail);b.append(copy);panel.append(b)}
    const results=document.createElement('details');results.open=!!resultsOpen;const summary=document.createElement('summary');summary.textContent=text('آخر ما أنجزه دبّر','Latest DABBIR results');summary.style.minHeight='44px';results.append(summary);
    const handled=w.owner_action_center?.handled;
    if(handled?.available===true){const latest=Array.isArray(handled.latest)?handled.latest:[];if(!latest.length){const note=document.createElement('p');note.textContent=text('لا توجد نتائج تنفيذ موثقة في السجل المتاح.','No verified execution results in the available record.');results.append(note)}for(const item of latest.slice(0,5)){const result=document.createElement('p');result.textContent=(language()==='ar'?item.title_ar:item.title_en||item.title_ar||text('إجراء مكتمل وموثق','Verified completed action'))+' — '+format(item.completed_at);results.append(result)}}else{const note=document.createElement('p');note.textContent=text('تعذر التحقق من سجل التنفيذ.','Execution history could not be verified.');results.append(note)}
    panel.append(results);
    if(rows.length){const note=document.createElement('p');note.textContent=text('عرض '+Math.min(rows.length,5)+' من العناصر المحمّلة.','Showing '+Math.min(rows.length,5)+' loaded items.');panel.append(note)}
  }
  document.addEventListener('keydown',event=>{
    const modal=q('#daeDetail');if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();history.back()}
    if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  });
  window.addEventListener('popstate',()=>closeDetail());
  window.__dabbirActivityExperienceUi={refresh,openRecord,closeDetail};
  const lifecycle=window.__dabbirUiLifecycle;
  for(const event of ['afterRender','afterNavigate','afterLanguage'])lifecycle?.on?.(event,'activity-experience',()=>setTimeout(refresh,0));
  refresh();
})();`;
