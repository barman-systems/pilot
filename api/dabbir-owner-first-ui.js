const script = String.raw`(()=>{
  if(window.__dabbirOwnerFirstUiV4) return;
  window.__dabbirOwnerFirstUiV4=true;

  const ICON='/dabbir-app-icon.png';
  const isArabic=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};



  const icons={
    dashboard:'<svg viewBox="0 0 24 24"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    conversations:'<svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>',
    appointments:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>',
    customers:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 6.5c2.5.2 4 1.6 4 3.5 0 1.7-1.1 2.9-2.8 3.3M15.5 14.5c2.8.4 4.5 1.9 5 4.5"/></svg>',
    tasks:'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/><path d="M5 5h8M5 19h14"/></svg>',
    automations:'<svg viewBox="0 0 24 24"><path d="M19 7V3l-2 2a8 8 0 1 0 2.3 8"/><path d="M12 8v4l3 2"/></svg>',
    analytics:'<svg viewBox="0 0 24 24"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></svg>',
    integrations:'<svg viewBox="0 0 24 24"><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="9"/></svg>',
    notifications:'<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 7H4c0-1 2-1 2-7"/><path d="M10 19h4"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3H9.6l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
    help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.3 1-1.3 2M12 17h.01"/></svg>'
  };

  const iconSvg=name=>icons[name]||icons.tasks;

  function installHeaderMark(){
    const row=q('.top>.row');
    if(!row||row.querySelector('.d4-header-mark'))return;
    const img=document.createElement('img');
    img.className='d4-header-mark';
    img.src=ICON;
    img.alt='DABBIR';
    img.decoding='async';
    img.loading='eager';
    const menu=q('#menuBtn');
    if(menu?.nextSibling)row.insertBefore(img,menu.nextSibling);else row.append(img);
  }

  function decorateNav(){
    qa('#nav .navBtn,#bottomNav>button,#bottomNav>a').forEach(button=>{
      const key=String(button.dataset.screen||'settings');
      const label=button.querySelector('[data-label]');
      if(!label)return;
      [...button.childNodes].forEach(node=>{
        if(node.nodeType===3&&String(node.textContent||'').trim())node.remove();
        if(node.nodeName==='BR')node.remove();
      });
      let icon=button.querySelector(':scope > .d4-nav-icon');
      if(!icon){
        icon=document.createElement('span');
        icon.className='d4-nav-icon';
        button.insertBefore(icon,label);
      }
      icon.innerHTML=iconSvg(key);
      button.setAttribute('aria-label',String(label.textContent||key).trim());
    });
  }

  function decorateMetrics(){
    const metricIcons=['analytics','appointments','customers','notifications'];
    qa('#dashCards > .card.metric').forEach((card,index)=>{
      if(card.querySelector(':scope > .d4-metric-icon'))return;
      const icon=document.createElement('span');
      icon.className='d4-metric-icon';
      icon.innerHTML=iconSvg(metricIcons[index]||'analytics');
      card.prepend(icon);
    });
  }


  function localizeMachineText(){
    const map=isArabic()
      ? {SUPPORT:'دعم / تدخل بشري',manual_takeover:'استلام يدوي',RETURNED_TO_AI:'أُعيدت إلى دبّر',returned_to_ai:'أُعيدت إلى دبّر',OPEN:'مفتوح',RESOLVED:'مكتمل',CLOSED:'مغلق',PENDING:'قيد المتابعة',waiting_customer:'بانتظار العميل',ai_active:'دبّر يتولى المحادثة',human_active:'تدخل بشري',action_required:'تحتاج تدخلك'}
      : {SUPPORT:'Human support',manual_takeover:'Manual takeover',RETURNED_TO_AI:'Returned to DABBIR',returned_to_ai:'Returned to DABBIR',OPEN:'Open',RESOLVED:'Resolved',CLOSED:'Closed',PENDING:'Pending',waiting_customer:'Waiting for customer',ai_active:'DABBIR is handling it',human_active:'Human takeover',action_required:'Needs your attention'};
    qa('#screen-tasks .item b,#screen-tasks .item small,#screen-tasks .badge,#screen-conversations .chatContact span').forEach(el=>{
      const current=String(el.textContent||'').trim();
      const raw=el.dataset.d4RawText||current;
      if(!el.dataset.d4RawText)el.dataset.d4RawText=raw;
      const key=Object.keys(map).find(k=>raw===k||raw.endsWith('• '+k)||raw.endsWith('· '+k));
      if(!key)return;
      const prefix=raw.includes('•')?raw.slice(0,raw.lastIndexOf('•')+1)+' ':raw.includes('·')?raw.slice(0,raw.lastIndexOf('·')+1)+' ':'';
      el.textContent=prefix+map[key];
    });
  }

  // The action center owns its data, scoped links, expansion, and verified metrics.
  // Presentation layers must not rebuild or truncate its operational list.

  function tuneWhatsappCard(){
    const grid=q('#integrationGrid');if(!grid)return;
    const wanted=(()=>{try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}})();
    const card=qa('#integrationGrid .integration').find(item=>String(item.querySelector('h3')?.textContent||'').trim()===wanted);
    qa('#integrationGrid .integration').forEach(item=>item.classList.toggle('d4-whatsapp-card',item===card));
  }

  function reorderDashboard(){
    const dash=q('#screen-dashboard');
    const hero=dash?.querySelector(':scope > .hero');
    const action=q('#dabbirActionCenter');
    const cards=q('#dashCards');
    if(!dash||!hero||!cards)return;
    let anchor=hero;
    if(action&&action.parentElement===dash){if(anchor.nextElementSibling!==action)anchor.insertAdjacentElement('afterend',action);anchor=action}
    if(anchor.nextElementSibling!==cards)anchor.insertAdjacentElement('afterend',cards);
    dash.dataset.dabbirExecutiveOrder='command-attention-metrics';
  }

  let actionObserver=null;
  function bindActionObserver(){
    const panel=q('#dabbirActionCenter');
    if(!panel||panel.dataset.d4Observed==='true')return Boolean(panel);
    panel.dataset.d4Observed='true';
    actionObserver=new MutationObserver(()=>schedulePolish());
    actionObserver.observe(panel,{subtree:true,childList:true,characterData:true});
    return true;
  }

  let frame=0;
  function schedulePolish(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;polish()});
  }
  function polish(){
    installHeaderMark();decorateNav();decorateMetrics();localizeMachineText();tuneWhatsappCard();reorderDashboard();bindActionObserver();
    document.body?.setAttribute('data-dabbir-ui','owner-first-v4');
    document.body?.setAttribute('data-dabbir-design','executive-calm-v1');
  }

  if(typeof renderAll==='function'&&!window.__d4RenderAllWrapped){
    window.__d4RenderAllWrapped=true;const base=renderAll;renderAll=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderMessages==='function'&&!window.__d4RenderMessagesWrapped){
    window.__d4RenderMessagesWrapped=true;const base=renderMessages;renderMessages=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderDashboard==='function'&&!window.__d4RenderDashboardWrapped){
    window.__d4RenderDashboardWrapped=true;const base=renderDashboard;renderDashboard=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderIntegrations==='function'&&!window.__d4RenderIntegrationsWrapped){
    window.__d4RenderIntegrationsWrapped=true;const base=renderIntegrations;renderIntegrations=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof applyLang==='function'&&!window.__d4ApplyLangWrapped){
    window.__d4ApplyLangWrapped=true;const base=applyLang;applyLang=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }

  const bootstrapObserver=new MutationObserver(()=>{
    schedulePolish();
    if(bindActionObserver())bootstrapObserver.disconnect();
  });
  if(document.body)bootstrapObserver.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>bootstrapObserver.disconnect(),5000);
  setTimeout(schedulePolish,0);
  setTimeout(schedulePolish,350);
  setTimeout(schedulePolish,1200);

  window.__dabbirUiAuthority={version:'owner-first-v4',designSystem:'executive-calm-v1',pollingLoops:0,presentationObservers:1};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-ui-authority','owner-first-v4');
  res.setHeader('x-dabbir-design-system','executive-calm-v1');
  return res.status(200).send(script);
}