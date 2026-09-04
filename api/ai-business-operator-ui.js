const css=String.raw`
.dabbirOperatorSummary{margin:0 0 12px;border:1px solid #536dfe42;background:linear-gradient(180deg,#101d31,#0d1a2a);border-radius:18px;padding:18px;position:relative;overflow:hidden}.dabbirOperatorSummary:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#7c5cff,#4f7cff,#22b8cf)}.doHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.doHead h2{margin:0;font-size:18px;line-height:1.35}.doHead p{margin:5px 0 0;color:var(--muted);font-size:13px;line-height:1.65}.doState{white-space:nowrap;border:1px solid #2b6150;background:#143328;color:#82e2bd;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:750}.doMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.doMetric{border:1px solid var(--line);background:#ffffff05;border-radius:11px;padding:11px}.doMetric strong{display:block;font-size:22px;line-height:1.2}.doMetric span{display:block;margin-top:5px;color:var(--muted);font-size:11px;line-height:1.45}.doCommand{margin-top:14px;border-top:1px solid var(--line);padding-top:13px}.doCommandLabel{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.doCommandLabel strong{font-size:14px}.doCommandLabel span{color:var(--muted);font-size:11px}.doCommandRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.doCommandInput{min-height:50px;border:1px solid var(--ds-border-strong,var(--line));background:#081525;color:#fff;border-radius:11px;padding:11px 13px;font-size:14px}.doCommandButton{min-width:92px;border:0;border-radius:10px;background:linear-gradient(135deg,#7c5cff,#4f7cff 62%,#22b8cf);color:#fff;font-weight:760;padding:0 14px}.doCommandHint{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.55}.dabbirOperatorMode #setupCard{opacity:.78}.dabbirOperatorMode #screen-dashboard>.hero{margin-bottom:10px}.dabbirOperatorMode #screen-dashboard>.hero .eyebrow{display:none}.dabbirOperatorMode #screen-dashboard>.hero h1{font-size:23px!important}.dabbirOperatorMode #screen-dashboard>.hero p{max-width:760px}.dabbirOperatorMode #dashCards{margin-top:10px}.dabbirOperatorMode #dabbirActionCenter{order:2}.dabbirOperatorMode #dashCards{order:3}.dabbirOperatorMode #screen-dashboard>.todayGrid{order:4}.dabbirOperatorMode #setupCard{order:5}.dabbirOperatorMode #screen-dashboard{display:none}.dabbirOperatorMode #screen-dashboard.active{display:flex;flex-direction:column}.dabbirOperatorMode #screen-dashboard>.hero{order:0}.dabbirOperatorMode #dabbirOperatorSummary{order:1}.dabbirOperatorMode #dabbirOwnerCopilot{order:1}.dabbirOperatorMode #dabbirActionCenter{order:2}.dabbirOperatorMode #dashCards{order:3}.dabbirOperatorMode #screen-dashboard>.todayGrid{order:4}.dabbirOperatorMode #setupCard{order:5}.dabbirOperatorMode #screen-dashboard .quickActions{grid-template-columns:1fr 1fr}.dabbirOperatorMode .navBtn[data-screen="tasks"] .d4-nav-icon,.dabbirOperatorMode #bottomNav [data-screen="tasks"] .d4-nav-icon{color:#ffcf73}.dabbirOperatorMode .navBtn[data-screen="conversations"] .d4-nav-icon,.dabbirOperatorMode #bottomNav [data-screen="conversations"] .d4-nav-icon{color:#9db0ff}@media(max-width:700px){.dabbirOperatorSummary{padding:14px;border-radius:16px;margin-bottom:10px}.doHead{gap:8px}.doHead h2{font-size:16px}.doHead p{font-size:12px}.doState{font-size:10px;padding:5px 7px}.doMetrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.doMetric{padding:9px}.doMetric strong{font-size:20px}.doCommandRow{grid-template-columns:1fr}.doCommandInput{font-size:16px}.doCommandButton{min-height:48px}.dabbirOperatorMode #screen-dashboard>.hero h1{display:block!important;font-size:19px!important}.dabbirOperatorMode #screen-dashboard>.hero p{display:block!important}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirAiBusinessOperatorV1)return;
  window.__dabbirAiBusinessOperatorV1=true;
  const style=document.createElement('style');
  style.dataset.dabbirAiBusinessOperator='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);
  document.body?.classList.add('dabbirOperatorMode');

  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const w=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const copy=()=>ar()?{
    home:'الرئيسية',needs:'يحتاجك',log:'السجل',customers:'العملاء',more:'المزيد',
    hero:'دبّر يدير نشاطك، وأنت تتدخل فقط عند الحاجة.',heroDesc:'شاهد ما أنجزه دبّر، وما يحتاج قرارك، ثم اطلب منه النتيجة التي تريدها.',
    title:'دبّر يعمل عنك الآن',subtitle:'ملخص مباشر لما تم التعامل معه وما بقي بحاجة إلى قرارك.',active:'يعمل الآن',
    handled:'أنجزها دبّر',conversations:'محادثات اليوم',appointments:'مواعيد اليوم',needsYou:'تحتاج قرارك',
    command:'ماذا تريد من دبّر؟',commandSub:'اطلب النتيجة مباشرة بدل التنقل بين الشاشات.',placeholder:'مثال: تابع العملاء الذين لم يحضروا وحاول إعادة حجزهم',run:'اطلب من دبّر',hint:'سيحوّل دبّر طلبك إلى خطوات باستخدام الأدوات المتاحة، ولن ينفذ إجراءً حساسًا دون الضوابط الموجودة.',
    noCopilot:'مساعد دبّر غير متاح في هذه الجلسة حاليًا.'
  }:{
    home:'Home',needs:'Needs you',log:'Activity',customers:'Customers',more:'More',
    hero:'DABBIR runs the business; you step in only when needed.',heroDesc:'See what DABBIR handled, what needs your decision, then ask for the outcome you want.',
    title:'DABBIR is working for you',subtitle:'A live summary of what was handled and what still needs your decision.',active:'Working now',
    handled:'Handled by DABBIR',conversations:'Conversations today',appointments:'Appointments today',needsYou:'Needs your decision',
    command:'What do you want DABBIR to do?',commandSub:'Ask for the outcome instead of navigating the system.',placeholder:'Example: follow up with no-shows and try to rebook them',run:'Ask DABBIR',hint:'DABBIR will turn your request into steps using available tools and keep existing safeguards for sensitive actions.',
    noCopilot:'DABBIR assistant is not available in this session yet.'
  };

  function counts(){
    const x=w()||{};
    const handled=x?.owner_action_center?.handled?.available===true?x.owner_action_center.handled.verified_autonomous_today:'—';
    const handoffs=(x.handoffs||[]).filter(h=>!['RESOLVED','CLOSED'].includes(String(h.state||'').toUpperCase())).length;
    const followups=(x.followups||[]).filter(f=>!['completed','cancelled','sent'].includes(String(f.status||'').toLowerCase())).length;
    return {handled,conversations:(x.conversations||[]).length,appointments:(x.appointments||[]).length,needs:handoffs+followups};
  }

  function metric(label,value){
    const box=document.createElement('div'); box.className='doMetric';
    const strong=document.createElement('strong'); strong.textContent=String(value??0);
    const span=document.createElement('span'); span.textContent=label;
    box.append(strong,span); return box;
  }

  function forwardCommand(value){
    const text=String(value||'').trim(); if(!text)return;
    const copilot=document.querySelector('#dabbirOwnerCopilot');
    const input=copilot?.querySelector('.dcInput,input,textarea');
    const button=copilot?.querySelector('.dcAsk button,button[type="submit"],button');
    if(input){
      input.value=text;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      copilot?.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>button?.click(),120);
      return;
    }
    try{if(typeof toast==='function')toast(copy().noCopilot)}catch{}
  }

  function ensureSummary(){
    const dash=document.querySelector('#screen-dashboard'); if(!dash)return;
    let box=document.querySelector('#dabbirOperatorSummary');
    if(!box){
      box=document.createElement('section'); box.id='dabbirOperatorSummary'; box.className='dabbirOperatorSummary';
      box.innerHTML='<div class="doHead"><div><h2 id="doTitle"></h2><p id="doSubtitle"></p></div><span class="doState" id="doState"></span></div><div class="doMetrics" id="doMetrics"></div><div class="doCommand"><div class="doCommandLabel"><strong id="doCommandTitle"></strong><span id="doCommandSub"></span></div><div class="doCommandRow"><input id="doCommandInput" class="doCommandInput"><button id="doCommandButton" class="doCommandButton" type="button"></button></div><div class="doCommandHint" id="doCommandHint"></div></div>';
      const hero=dash.querySelector(':scope>.hero');
      if(hero)hero.insertAdjacentElement('afterend',box); else dash.prepend(box);
      box.querySelector('#doCommandButton')?.addEventListener('click',()=>forwardCommand(box.querySelector('#doCommandInput')?.value));
      box.querySelector('#doCommandInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();forwardCommand(e.currentTarget.value)}});
    }
    const t=copy(),c=counts();
    box.querySelector('#doTitle').textContent=t.title;
    box.querySelector('#doSubtitle').textContent=t.subtitle;
    box.querySelector('#doState').textContent=t.active;
    box.querySelector('#doCommandTitle').textContent=t.command;
    box.querySelector('#doCommandSub').textContent=t.commandSub;
    box.querySelector('#doCommandInput').placeholder=t.placeholder;
    box.querySelector('#doCommandButton').textContent=t.run;
    box.querySelector('#doCommandHint').textContent=t.hint;
    box.querySelector('#doMetrics').replaceChildren(metric(t.handled,c.handled),metric(t.conversations,c.conversations),metric(t.appointments,c.appointments),metric(t.needsYou,c.needs));
  }

  function relabelNav(){
    const t=copy();
    const side=[...document.querySelectorAll('#nav .navBtn')];
    const bottom=[...document.querySelectorAll('#bottomNav>[data-screen]')];
    const apply=(items)=>{
      const dash=items.find(x=>x.dataset.screen==='dashboard');
      const conv=items.find(x=>x.dataset.screen==='conversations');
      const appt=items.find(x=>x.dataset.screen==='appointments');
      const cust=items.find(x=>x.dataset.screen==='customers');
      const more=items.find(x=>x.dataset.screen==='more');
      if(dash){dash.dataset.screen='dashboard'; const l=dash.querySelector('[data-label]'); if(l)l.textContent=t.home;}
      if(conv){conv.dataset.screen='tasks'; const l=conv.querySelector('[data-label]'); if(l)l.textContent=t.needs; conv.setAttribute('aria-label',t.needs);}
      if(appt){appt.dataset.screen='conversations'; const l=appt.querySelector('[data-label]'); if(l)l.textContent=t.log; appt.setAttribute('aria-label',t.log);}
      if(cust){const l=cust.querySelector('[data-label]'); if(l)l.textContent=t.customers;}
      if(more){const l=more.querySelector('[data-label]'); if(l)l.textContent=t.more;}
    };
    apply(side); apply(bottom);
  }

  function tuneDashboardCopy(){
    const t=copy();
    const title=document.querySelector('#dashTitle');
    const desc=document.querySelector('#dashDesc');
    if(title)title.textContent=t.hero;
    if(desc)desc.textContent=t.heroDesc;
  }

  function reconcile(){
    document.body?.classList.add('dabbirOperatorMode');
    relabelNav(); tuneDashboardCopy(); ensureSummary();
  }

  const lifecycle=window.__dabbirUiLifecycle;
  lifecycle?.on?.('afterRender','ai-business-operator-v1',reconcile);
  lifecycle?.on?.('afterNavigate','ai-business-operator-v1',reconcile);
  lifecycle?.on?.('afterLanguage','ai-business-operator-v1',reconcile);
  const mo=new MutationObserver(()=>requestAnimationFrame(reconcile));
  const shell=document.querySelector('#appShell'); if(shell)mo.observe(shell,{subtree:true,childList:true});
  setTimeout(()=>mo.disconnect(),6000);
  setTimeout(reconcile,0); setTimeout(reconcile,350); setTimeout(reconcile,1200);
  window.__dabbirAiBusinessOperator={version:'v1',reconcile};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-ai-business-operator','v1');
  return res.status(200).send(client);
}
