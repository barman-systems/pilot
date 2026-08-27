const script=String.raw`(()=>{
  if(window.__dabbirCustomerActivationUi)return;
  window.__dabbirCustomerActivationUi=true;

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let businessId=null;
  let profile=null;
  let whatsapp=null;
  let loading=false;
  let loadedAt=0;
  const CACHE_MS=30000;

  const style=document.createElement('style');
  style.dataset.dabbirCustomerActivation='v1';
  style.textContent=[
    '.dabbirActivation{margin:0 0 14px;border:1px solid #334061;background:linear-gradient(145deg,#12182b 0%,#101526 54%,#111827 100%);border-radius:22px;padding:16px;box-shadow:0 18px 55px #0005}',
    '.daHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.daHead h2{margin:0;font-size:16px;line-height:1.35}.daHead p{margin:5px 0 0;color:#a9b4c8;font-size:10px;line-height:1.65}',
    '.daScore{min-width:66px;text-align:center;border:1px solid #3d4d73;background:#151e35;border-radius:16px;padding:9px}.daScore strong{display:block;font-size:20px}.daScore span{font-size:8px;color:#94a2bc}',
    '.daProgress{height:7px;border-radius:999px;background:#202941;overflow:hidden;margin:12px 0}.daProgress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#3b82f6,#22d3ee);transition:width .25s ease}',
    '.daGrid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr);gap:10px}.daNext,.daProof{border:1px solid #2b3655;background:#0d1322;border-radius:16px;padding:12px}',
    '.daLabel{font-size:8px;font-weight:900;letter-spacing:.04em;color:#8ca0c3}.daNext b{display:block;margin-top:5px;font-size:12px}.daNext p{margin:5px 0 10px;color:#99a7bd;font-size:9px;line-height:1.6}',
    '.daActions{display:flex;gap:7px;flex-wrap:wrap}.daActions button{min-height:40px;border-radius:11px;padding:8px 11px;font-size:9px;font-weight:900}',
    '.daPrimary{border:0;color:white;background:linear-gradient(135deg,#7c3aed,#2563eb)}.daSecondary{border:1px solid #34415f;background:#151d2f;color:#e9eef8}',
    '.daProofGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.daProofItem{border:1px solid #26324e;background:#11192a;border-radius:12px;padding:9px}.daProofItem strong{display:block;font-size:16px}.daProofItem span{display:block;margin-top:3px;color:#8f9db2;font-size:7px}',
    '.daSteps{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.daStep{display:inline-flex;align-items:center;gap:5px;border:1px solid #303c5c;background:#121a2b;border-radius:999px;padding:6px 8px;font-size:8px;color:#aab6ca}.daStep.done{border-color:#285d4a;background:#10261f;color:#8ce6a1}.daStep:before{content:"•";font-size:14px;line-height:0}.daStep.done:before{content:"✓";font-size:9px}',
    '.daLoading{padding:12px;color:#9aa8bd;font-size:9px}',
    '@media(max-width:700px){.dabbirActivation{padding:13px;border-radius:18px;margin-bottom:10px}.daHead h2{font-size:15px}.daScore{min-width:58px;padding:8px}.daGrid{grid-template-columns:1fr}.daProofGrid{gap:5px}.daProofItem{padding:8px}.daActions button{flex:1;min-width:120px;min-height:44px}.daSteps{gap:5px}}',
    '@media(prefers-reduced-motion:reduce){.daProgress i{transition:none}}'
  ].join('');
  document.head.append(style);

  function copy(){return ar()?{
    title:'جهّز دَبِّر ليعمل عنك',readyTitle:'دَبِّر جاهز للعمل',desc:'دقيقة واحدة هنا تختصر عليك البحث داخل الإعدادات. نعرض فقط ما تم التحقق منه فعليًا.',readyDesc:'الأساسيات التشغيلية جاهزة. راقب ما أنجزه دَبِّر وما يحتاج قرارك فقط.',score:'الجاهزية',next:'الخطوة الأفضل الآن',proof:'دليل القيمة',
    profile:'معلومات النشاط',channel:'واتساب',ai:'ذكاء دَبِّر',profileTodo:'أكمل معلومات نشاطك',profileBody:'أضف الساعات وبيانات التواصل والسياسات الأساسية حتى يرد دَبِّر بمعلومات صحيحة.',profileAction:'إكمال المعلومات',channelTodo:'اربط واتساب',channelBody:'اربط رقم WhatsApp Business من داخل دَبِّر حتى تنتقل من التجربة الداخلية إلى قناة العميل الحقيقية.',channelAction:'ربط واتساب',aiTodo:'تحقق من جاهزية الذكاء',aiBody:'دَبِّر يحتاج AI تشغيليًا قبل أن يعتمد عليه في الردود والمتابعة.',aiAction:'فتح الحالة',testTodo:'جرّب أول محادثة',testBody:'أرسل محادثة اختبار حقيقية داخل دَبِّر وشاهد الرد والحفظ قبل الاعتماد اليومي.',testAction:'فتح المحادثات',priorities:'راجع أولويات اليوم',customers:'عملاء',chats:'محادثات',aiReplies:'ردود AI',unverified:'—',loading:'دَبِّر يتحقق من التجهيز الفعلي…',complete:'مكتمل'
  }:{
    title:'Get DABBIR working for you',readyTitle:'DABBIR is ready to operate',desc:'One minute here saves hunting through settings. Only verified setup state is shown.',readyDesc:'Core operations are ready. Focus on what DABBIR completed and what actually needs your decision.',score:'Readiness',next:'Best next step',proof:'Proof of value',
    profile:'Business info',channel:'WhatsApp',ai:'DABBIR AI',profileTodo:'Complete business information',profileBody:'Add hours, contact details and key policies so DABBIR can answer accurately.',profileAction:'Complete info',channelTodo:'Connect WhatsApp',channelBody:'Connect your WhatsApp Business number inside DABBIR to move from internal testing to the real customer channel.',channelAction:'Connect WhatsApp',aiTodo:'Verify AI readiness',aiBody:'DABBIR needs operational AI before replies and follow-ups can be trusted.',aiAction:'Open status',testTodo:'Try the first conversation',testBody:'Run a real in-app conversation and verify the reply and persistence before daily use.',testAction:'Open conversations',priorities:'Review today’s priorities',customers:'Customers',chats:'Conversations',aiReplies:'AI replies',unverified:'—',loading:'DABBIR is checking verified setup…',complete:'Complete'
  }}

  function profileReady(){
    const f=profile?.facts||{};
    const core=Boolean(String(f.about_business||'').trim()&&String(f.business_hours||'').trim());
    const contact=Boolean(String(f.contact_phone||'').trim()||String(f.contact_whatsapp||'').trim()||String(f.contact_email||'').trim());
    return core&&contact;
  }

  function whatsappReady(){
    const w=whatsapp||workspace?.whatsapp||{};
    return Boolean(w.operational||w.connected||w.meta_authorized||['META_AUTHORIZED','WEBHOOK_LINKED','CONFIGURED_READY_FOR_VERIFICATION','OUTBOUND_CONFIGURED','OPERATIONAL'].includes(String(w.state||'')));
  }

  function aiReady(){return Boolean(workspace?.ai?.configured)}
  function exactMetric(key){
    const m=workspace?.verified_metrics;
    if(!m||m.state!=='VERIFIED_EXACT_COUNTS')return null;
    const value=m[key];
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }

  function openScreen(screen){if(typeof showScreen==='function')showScreen(screen)}
  function ensure(){
    const dash=q('#screen-dashboard');
    if(!dash)return null;
    let panel=q('#dabbirActivation');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActivation';
    panel.className='dabbirActivation';
    const hero=dash.querySelector('.hero');
    if(hero?.nextSibling)dash.insertBefore(panel,hero.nextSibling);else dash.prepend(panel);
    return panel;
  }

  function nextStep(){
    const t=copy();
    if(!profileReady())return {title:t.profileTodo,body:t.profileBody,action:t.profileAction,screen:'settings'};
    if(!whatsappReady())return {title:t.channelTodo,body:t.channelBody,action:t.channelAction,screen:'integrations'};
    if(!aiReady())return {title:t.aiTodo,body:t.aiBody,action:t.aiAction,screen:'integrations'};
    const chats=exactMetric('active_chats');
    if(chats===0)return {title:t.testTodo,body:t.testBody,action:t.testAction,screen:'conversations'};
    return {title:t.priorities,body:t.readyDesc,action:t.priorities,screen:'dashboard',target:'#dabbirActionCenter'};
  }

  function render(){
    const panel=ensure();if(!panel||!workspace?.business)return;
    const t=copy();
    if(loading&&(!profile||!whatsapp)){panel.innerHTML='<div class="daLoading">'+esc(t.loading)+'</div>';return}
    const states=[profileReady(),whatsappReady(),aiReady()];
    const done=states.filter(Boolean).length;
    const score=Math.round(done/states.length*100);
    const ready=done===states.length;
    const next=nextStep();
    const customers=exactMetric('customers');
    const chats=exactMetric('active_chats');
    const aiReplies=exactMetric('ai_messages');
    const metric=(value,label)=>'<div class="daProofItem"><strong>'+esc(value==null?t.unverified:value)+'</strong><span>'+esc(label)+'</span></div>';
    const step=(label,value)=>'<span class="daStep '+(value?'done':'')+'">'+esc(label)+'</span>';
    panel.innerHTML='<div class="daHead"><div><h2>'+esc(ready?t.readyTitle:t.title)+'</h2><p>'+esc(ready?t.readyDesc:t.desc)+'</p></div><div class="daScore"><strong>'+score+'%</strong><span>'+esc(t.score)+'</span></div></div><div class="daProgress" aria-label="'+esc(t.score)+' '+score+'%"><i style="width:'+score+'%"></i></div><div class="daGrid"><div class="daNext"><span class="daLabel">'+esc(t.next)+'</span><b>'+esc(next.title)+'</b><p>'+esc(next.body)+'</p><div class="daActions"><button type="button" class="daPrimary" id="daNextAction">'+esc(next.action)+'</button><button type="button" class="daSecondary" id="daPriorities">'+esc(t.priorities)+'</button></div><div class="daSteps">'+step(t.profile,states[0])+step(t.channel,states[1])+step(t.ai,states[2])+'</div></div><div class="daProof"><span class="daLabel">'+esc(t.proof)+'</span><div class="daProofGrid">'+metric(customers,t.customers)+metric(chats,t.chats)+metric(aiReplies,t.aiReplies)+'</div></div></div>';
    const nextButton=q('#daNextAction');if(nextButton)nextButton.onclick=()=>{openScreen(next.screen);if(next.target)setTimeout(()=>q(next.target)?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
    const priorities=q('#daPriorities');if(priorities)priorities.onclick=()=>{openScreen('dashboard');setTimeout(()=>q('#dabbirActionCenter')?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
  }

  async function fetchJson(url){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVATION_READ_FAILED');
    return body;
  }

  async function load(force=false){
    const id=workspace?.business?.id;if(!id||loading)return;
    if(!force&&businessId===id&&Date.now()-loadedAt<CACHE_MS){render();return}
    businessId=id;loading=true;render();
    const [p,w]=await Promise.allSettled([
      fetchJson('/api/business-profile?business_id='+encodeURIComponent(id)),
      fetchJson('/api/dabbir-whatsapp-status?business_id='+encodeURIComponent(id))
    ]);
    profile=p.status==='fulfilled'?p.value:null;
    whatsapp=w.status==='fulfilled'?w.value:(workspace?.whatsapp||null);
    loadedAt=Date.now();loading=false;render();
  }

  if(typeof renderDashboard==='function'){
    const base=renderDashboard;
    renderDashboard=function(){const result=base.apply(this,arguments);render();load(false);return result};
  }
  if(typeof renderAll==='function'){
    const base=renderAll;
    renderAll=function(){const result=base.apply(this,arguments);setTimeout(()=>{render();load(false)},0);return result};
  }
  if(typeof setLanguage==='function'){
    const base=setLanguage;
    setLanguage=function(next){const result=base(next);setTimeout(render,0);return result};
  }
  setTimeout(()=>{render();load(false)},500);
  window.__dabbirCustomerActivation={version:'customer-activation-v1',refresh:()=>load(true)};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-activation','v1');
  return res.end(script);
}
