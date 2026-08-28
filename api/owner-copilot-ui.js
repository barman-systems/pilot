const script=String.raw`(()=>{
  if(window.__dabbirOwnerCopilotUi)return;
  window.__dabbirOwnerCopilotUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loadedBusiness=null,proof=null,proofLoading=false,asking=false,lastScreen='dashboard';

  const style=document.createElement('style');
  style.dataset.dabbirOwnerCopilot='v1';
  style.textContent=[
    '.dabbirCopilot{margin:0 0 14px;border:1px solid #313c59;background:linear-gradient(155deg,#0e1424,#11182b 55%,#101522);border-radius:22px;padding:16px;box-shadow:0 18px 55px #0004}',
    '.dcHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dcIdentity{display:flex;align-items:center;gap:10px;min-width:0}.dcLogo{width:38px;height:38px;border-radius:12px;object-fit:cover;flex:0 0 auto}.dcHead h2{margin:0;font-size:16px}.dcHead p{margin:4px 0 0;color:#98a7bf;font-size:9px;line-height:1.6}.dcMode{white-space:nowrap;border:1px solid #2a594d;background:#10271f;color:#86e0b3;border-radius:999px;padding:6px 8px;font-size:7px;font-weight:900}',
    '.dcProof{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.dcMetric{border:1px solid #293550;background:#0c1220;border-radius:13px;padding:10px}.dcMetric strong{display:block;font-size:17px}.dcMetric span{display:block;margin-top:3px;color:#8e9bb0;font-size:7px;line-height:1.4}',
    '.dcAsk{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.dcInput{width:100%;min-height:48px;border:1px solid #35415f;background:#111a2d;color:#f7f9fc;border-radius:14px;padding:11px 13px;font-size:13px;outline:none}.dcInput:focus{border-color:#5474c8;box-shadow:0 0 0 3px #3b82f622}.dcAsk button{min-width:82px;border:0;border-radius:13px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-weight:900;padding:0 14px}.dcAsk button:disabled{opacity:.55;cursor:wait}',
    '.dcSuggestions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.dcSuggestion{min-height:34px!important;border:1px solid #2e3a57;background:#121a2b;color:#b8c4d7;border-radius:999px;padding:6px 9px;font-size:8px;font-weight:800}.dcSuggestion:hover{border-color:#52668f;color:#fff}',
    '.dcAnswer{display:none;margin-top:10px;border:1px solid #2c3856;background:#0b111e;border-radius:15px;padding:12px}.dcAnswer.show{display:block}.dcAnswerText{font-size:11px;line-height:1.75;color:#eef3fa;white-space:pre-wrap}.dcAnswerActions{display:flex;justify-content:flex-start;margin-top:9px}.dcOpen{min-height:38px;border:1px solid #3a4a70;background:#151f35;color:#eef4ff;border-radius:11px;padding:7px 11px;font-size:8px;font-weight:900}.dcAnswerMeta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #202a41;color:#7f8da5;font-size:7px}.dcAnswerMeta b{color:#8ce6a1;font-weight:850}',
    '@media(max-width:700px){.dabbirCopilot{padding:13px;border-radius:18px;margin-bottom:10px}.dcHead h2{font-size:15px}.dcLogo{width:34px;height:34px}.dcMode{font-size:6.5px}.dcProof{gap:5px}.dcMetric{padding:8px}.dcMetric strong{font-size:15px}.dcAsk{grid-template-columns:1fr}.dcInput{font-size:16px;min-height:50px}.dcAsk button{min-height:48px}.dcSuggestions{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.dcSuggestions::-webkit-scrollbar{display:none}.dcSuggestion{flex:0 0 auto}.dcAnswerText{font-size:10.5px}.dcOpen{min-height:44px}}'
  ].join('');
  document.head.append(style);

  const copy=()=>ar()?{
    title:'اسأل دَبِّر عن عملك',desc:'اسأل بلغتك الطبيعية. الإجابة مبنية على بيانات نشاطك الموثقة فقط.',mode:'قراءة موثقة',actions:'أنجزها اليوم',time:'وقت يدوي مقدر تم توفيره',attention:'يحتاجك الآن',ask:'اسأل',placeholder:'مثال: من يحتاج متابعة اليوم؟',loading:'أراجع بيانات النشاط الموثقة…',error:'تعذر تحليل النشاط الآن. حاول مرة أخرى.',verified:'مبني على بيانات النشاط الموثقة',fallback:'إجابة موثقة بدون AI',unknown:'—',minute:'د',suggestions:['ما الذي يحتاجني اليوم؟','من يحتاج متابعة؟','ماذا أنجزت اليوم؟'],appointment:'ما مواعيد الـ24 ساعة القادمة؟',open:{conversations:'فتح المحادثات',tasks:'فتح المهام',appointments:'فتح المواعيد',operations:'فتح العمليات',integrations:'فتح الربط',settings:'فتح الإعدادات',dashboard:'فتح الرئيسية'}
  }:{
    title:'Ask DABBIR about your business',desc:'Ask naturally. Answers use verified business data only.',mode:'Verified read-only',actions:'Done today',time:'Estimated manual time avoided',attention:'Needs you now',ask:'Ask',placeholder:'Example: Who needs follow-up today?',loading:'Reviewing verified business data…',error:'Business analysis is unavailable right now. Try again.',verified:'Based on verified business data',fallback:'Verified answer without AI',unknown:'—',minute:'m',suggestions:['What needs me today?','Who needs follow-up?','What did you do today?'],appointment:'What appointments are in the next 24 hours?',open:{conversations:'Open conversations',tasks:'Open tasks',appointments:'Open appointments',operations:'Open operations',integrations:'Open integrations',settings:'Open settings',dashboard:'Open dashboard'}
  };

  function owner(){return String(window.workspace?.membership?.role||'').toLowerCase()==='owner'}
  function businessId(){return window.workspace?.business?.id||null}
  function exactAttention(){const m=window.workspace?.verified_metrics;return m?.state==='VERIFIED_EXACT_COUNTS'&&Number.isSafeInteger(m.needs_attention)?m.needs_attention:null}
  function suggestions(){const t=copy();const type=String(window.workspace?.business?.business_type||'').toLowerCase();return ['clinic','salon','real_estate','services','creator'].includes(type)?[...t.suggestions,t.appointment]:t.suggestions}
  function reducedMotion(){try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch{return false}}
  function safeScreen(value){return ['dashboard','conversations','tasks','appointments','operations','integrations','settings'].includes(String(value||''))?String(value):'dashboard'}

  function ensure(){
    const dash=q('#screen-dashboard');if(!dash||!owner())return null;
    let card=q('#dabbirOwnerCopilot');if(card)return card;
    card=document.createElement('section');card.id='dabbirOwnerCopilot';card.className='dabbirCopilot';
    const activation=q('#dabbirActivation');
    if(activation)activation.insertAdjacentElement('afterend',card);
    else{const hero=dash.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',card);else dash.prepend(card)}
    return card;
  }

  function render(){
    const card=ensure();if(!card)return;
    const t=copy();const attention=exactAttention();
    const actions=proof?.available?proof.verified_autonomous_actions:null;
    const minutes=proof?.available?proof.estimated_manual_minutes_saved:null;
    const priorAnswer=q('#dcAnswerText')?.textContent||'';
    const priorMeta=q('#dcAnswerMeta')?.dataset.source||'';
    const screen=safeScreen(lastScreen);
    card.innerHTML='<div class="dcHead"><div class="dcIdentity"><img class="dcLogo" src="/api/dabbir-approved-icon" alt=""><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.desc)+'</p></div></div><span class="dcMode">'+esc(t.mode)+'</span></div>'+
      '<div class="dcProof"><div class="dcMetric"><strong>'+(actions==null?esc(t.unknown):esc(actions))+'</strong><span>'+esc(t.actions)+'</span></div><div class="dcMetric"><strong>'+(minutes==null?esc(t.unknown):esc(minutes+t.minute))+'</strong><span>'+esc(t.time)+'</span></div><div class="dcMetric"><strong>'+(attention==null?esc(t.unknown):esc(attention))+'</strong><span>'+esc(t.attention)+'</span></div></div>'+
      '<form class="dcAsk" id="dcAskForm"><input class="dcInput" id="dcAskInput" maxlength="800" autocomplete="off" enterkeyhint="send" aria-label="'+esc(t.title)+'" placeholder="'+esc(t.placeholder)+'"><button id="dcAskButton" type="submit" '+(asking?'disabled':'')+'>'+esc(asking?t.loading:t.ask)+'</button></form>'+
      '<div class="dcSuggestions">'+suggestions().map(value=>'<button type="button" class="dcSuggestion" data-dc-suggest="'+esc(value)+'">'+esc(value)+'</button>').join('')+'</div>'+
      '<div class="dcAnswer '+(priorAnswer?'show':'')+'" id="dcAnswer" role="status" aria-live="polite"><div class="dcAnswerText" id="dcAnswerText">'+esc(priorAnswer)+'</div><div class="dcAnswerActions" '+(priorAnswer&&screen!=='dashboard'?'':'hidden')+'><button class="dcOpen" type="button" id="dcOpenScreen" data-screen="'+esc(screen)+'">'+esc(t.open[screen]||t.open.dashboard)+'</button></div><div class="dcAnswerMeta" id="dcAnswerMeta" data-source="'+esc(priorMeta)+'"><b>'+esc(priorMeta==='DETERMINISTIC_VERIFIED_FALLBACK'?t.fallback:t.verified)+'</b><span>Asia/Dubai</span></div></div>';
    q('#dcAskForm').onsubmit=event=>{event.preventDefault();ask(q('#dcAskInput')?.value||'')};
    card.querySelectorAll('[data-dc-suggest]').forEach(button=>button.onclick=()=>ask(button.dataset.dcSuggest||''));
    const open=q('#dcOpenScreen');if(open)open.onclick=()=>{const target=safeScreen(open.dataset.screen);if(typeof showScreen==='function')showScreen(target)};
  }

  function showAnswer(answer,source,screen){
    lastScreen=safeScreen(screen);
    render();
    const box=q('#dcAnswer'),text=q('#dcAnswerText'),meta=q('#dcAnswerMeta');if(!box||!text||!meta)return;
    text.textContent=answer||copy().error;meta.dataset.source=source||'';
    const label=meta.querySelector('b');if(label)label.textContent=source==='DETERMINISTIC_VERIFIED_FALLBACK'?copy().fallback:copy().verified;
    const actions=box.querySelector('.dcAnswerActions'),open=q('#dcOpenScreen');
    if(actions)actions.hidden=lastScreen==='dashboard';
    if(open){open.dataset.screen=lastScreen;open.textContent=copy().open[lastScreen]||copy().open.dashboard}
    box.classList.add('show');box.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'nearest'});
  }

  async function timedFetch(url,options={},timeout=9500){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
  }

  async function loadProof(force=false){
    const id=businessId();if(!id||!owner()||proofLoading||(!force&&loadedBusiness===id&&proof))return;
    proofLoading=true;loadedBusiness=id;
    try{const response=await timedFetch('/api/owner-copilot?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}},5000);const body=await response.json().catch(()=>null);proof=response.ok&&body?.ok?body.proof:null}catch{proof=null}finally{proofLoading=false;render()}
  }

  async function ask(message){
    const id=businessId();const text=String(message||'').trim();if(!id||!text||asking)return;
    asking=true;render();const input=q('#dcAskInput');if(input)input.value=text;
    try{
      const response=await timedFetch('/api/owner-copilot',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,message:text,language:ar()?'ar':'en'})});
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body?.ok)throw new Error(body?.error||'OWNER_COPILOT_FAILED');
      if(body.proof)proof=body.proof;
      asking=false;showAnswer(body.answer,body.answer_source,body.recommended_screen);
    }catch(error){asking=false;showAnswer(copy().error,'','dashboard');try{if(typeof toast==='function')toast(copy().error)}catch{}}
  }

  if(typeof renderDashboard==='function'){
    const base=renderDashboard;renderDashboard=function(){const result=base.apply(this,arguments);render();loadProof(false);return result};
  }
  if(typeof renderAll==='function'){
    const base=renderAll;renderAll=function(){const result=base.apply(this,arguments);setTimeout(()=>{render();loadProof(false)},0);return result};
  }
  if(typeof setLanguage==='function'){
    const base=setLanguage;setLanguage=function(next){const result=base.apply(this,arguments);setTimeout(render,0);return result};
  }
  setTimeout(()=>{render();loadProof(false)},650);
  window.__dabbirOwnerCopilot={version:'owner-copilot-v1',refresh:()=>loadProof(true)};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-owner-copilot-ui','v1');
  return res.end(script);
}
