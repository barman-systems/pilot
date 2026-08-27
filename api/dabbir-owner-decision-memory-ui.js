const css=String.raw`
.dabbir-memory-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}
.dabbir-memory-btn.has-candidate{border-color:#665fd0;background:#201d35;color:#ddd8ff}
.dabbir-memory-overlay{position:fixed;inset:0;z-index:82;background:#000c;display:flex;align-items:center;justify-content:center;padding:18px}
.dabbir-memory-dialog{width:min(560px,100%);max-height:84vh;overflow:auto;border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px}
.dabbir-memory-dialog h3{margin:0;font-size:16px}.dabbir-memory-dialog>p{color:#9fa8b6;font-size:10px;line-height:1.7}
.dabbir-memory-card{border:1px solid #2e3542;background:#171b23;border-radius:14px;padding:12px;margin-top:9px}
.dabbir-memory-card b{font-size:11px}.dabbir-memory-card p{font-size:9px;color:#a9b1bf;line-height:1.6;margin:5px 0 8px}.dabbir-memory-card small{display:block;color:#7f8998;font-size:8px;word-break:break-word}
.dabbir-memory-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dabbir-memory-actions button{min-height:36px;border-radius:10px;padding:7px 10px;font-size:9px;font-weight:900}
.dabbir-memory-approve{border:1px solid #6c63d8;background:#262047;color:#e2ddff}.dabbir-memory-pause{border:1px solid #5e5637;background:#242117;color:#ffe4a1}.dabbir-memory-revoke{border:1px solid #64373c;background:#29191c;color:#ffb9bd}
.dabbir-memory-close{width:100%;min-height:42px;margin-top:12px;border:0;background:transparent;color:#9fa8b6;font-weight:800}.dabbir-memory-empty{padding:13px;margin-top:10px;border:1px dashed #343b49;border-radius:13px;color:#929ba8;font-size:10px}.dabbir-memory-section{margin-top:14px;font-size:11px;color:#e8ebf1}
@media(max-width:700px){.dabbir-memory-overlay{align-items:flex-end;padding:10px}.dabbir-memory-dialog{border-radius:20px 20px 14px 14px;max-height:88vh}.dabbir-memory-btn{min-height:40px}.dabbir-memory-actions button{flex:1}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirOwnerDecisionMemoryUiLoaded)return;
  window.__dabbirOwnerDecisionMemoryUiLoaded=true;
  const style=document.createElement('style');style.dataset.dabbirOwnerDecisionMemory='v1';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);
  const nativeFetch=window.fetch.bind(window);
  let state={candidates:[],policies:[],loading:false,business:null};
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const copy=()=>ar()?{
    button:'سياسات دبّر',candidate:'اقتراح جديد',title:'سياسات المالك',
    desc:'بعد تكرار نفس القرار منخفض المخاطر 3 مرات، يقترح دبّر سياسة. لا تُفعّل إلا بموافقتك الصريحة. المال والقانون والهوية وKYC مستبعدة من التعلّم.',
    suggestions:'اقتراحات تحتاج موافقتك',active:'السياسات المعتمدة',approve:'دع دبّر يتولى هذا النوع',pause:'إيقاف مؤقت',resume:'إعادة التفعيل',revoke:'إلغاء نهائي',close:'إغلاق',empty:'لا توجد اقتراحات جديدة الآن.',count:'قرارات متطابقة',saved:'تم تحديث السياسة',failed:'تعذر تحديث السياسة',exact:'مطابقة دقيقة فقط',privacy:'السبب محفوظ كبصمة، وليس كنص خام'
  }:{
    button:'DABBIR Policies',candidate:'New suggestion',title:'Owner policies',
    desc:'After the same low-risk decision repeats 3 times, DABBIR can suggest a policy. Nothing activates without your explicit approval. Money, legal, identity, and KYC actions are excluded from learning.',
    suggestions:'Suggestions needing approval',active:'Approved policies',approve:'Let DABBIR handle this type',pause:'Pause',resume:'Resume',revoke:'Revoke',close:'Close',empty:'No new suggestions right now.',count:'matching decisions',saved:'Policy updated',failed:'Could not update policy',exact:'Exact match only',privacy:'Reason stored as a fingerprint, not raw text'
  };
  function businessId(){return workspace?.business?.id||null}
  function isOwner(){return workspace?.membership?.role==='owner'}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function scopeLabel(bounds){
    const x=copy();
    if(bounds?.route_class==='OWNER_DECISION')return ar()?'قرار مالك متكرر منخفض الأولوية':'Repeated low-priority owner decision';
    return x.exact;
  }
  async function load(force=false){
    const id=businessId();if(!id||!isOwner()||state.loading)return;
    if(!force&&state.business===id)return renderButton();
    state.loading=true;
    try{
      const response=await nativeFetch('/api/owner-decision-memory?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_POLICY_LOOKUP_FAILED');
      state={candidates:payload.candidates||[],policies:payload.policies||[],loading:false,business:id};renderButton();
    }catch{state={candidates:[],policies:[],loading:false,business:id};renderButton()}
  }
  function renderButton(){
    if(!isOwner())return;
    const actionHead=document.querySelector('#dabbirActionCenter .dac-head');
    const autoHero=document.querySelector('#screen-automations .hero');
    const host=actionHead||autoHero;if(!host)return;
    let button=document.querySelector('#dabbirMemoryButton');
    if(!button){button=document.createElement('button');button.id='dabbirMemoryButton';button.type='button';button.className='dabbir-memory-btn';button.addEventListener('click',openDialog);const refresh=actionHead?.querySelector('#dacRefresh');refresh?.parentNode?refresh.parentNode.insertBefore(button,refresh):host.append(button)}
    const x=copy();button.classList.toggle('has-candidate',state.candidates.length>0);button.textContent=state.candidates.length?x.candidate+' · '+state.candidates.length:x.button;
  }
  function closeDialog(){document.querySelector('#dabbirMemoryOverlay')?.remove()}
  function policyActions(card,policy,isCandidate){
    const x=copy(),actions=document.createElement('div');actions.className='dabbir-memory-actions';
    if(isCandidate){const approve=document.createElement('button');approve.className='dabbir-memory-approve';approve.textContent=x.approve;approve.onclick=()=>mutate('activate',{action_key:policy.action_key,decision_key:policy.decision_key,decision_value:policy.decision_value,match_bounds:policy.match_bounds});actions.append(approve)}
    else{
      if(policy.state==='ACTIVE'){const pause=document.createElement('button');pause.className='dabbir-memory-pause';pause.textContent=x.pause;pause.onclick=()=>mutate('pause',{policy_id:policy.id});actions.append(pause)}
      if(policy.state==='PAUSED'){const resume=document.createElement('button');resume.className='dabbir-memory-approve';resume.textContent=x.resume;resume.onclick=()=>mutate('resume',{policy_id:policy.id});actions.append(resume)}
      const revoke=document.createElement('button');revoke.className='dabbir-memory-revoke';revoke.textContent=x.revoke;revoke.onclick=()=>mutate('revoke',{policy_id:policy.id});actions.append(revoke);
    }
    card.append(actions);
  }
  function policyCard(policy,isCandidate=false){
    const x=copy(),card=document.createElement('div');card.className='dabbir-memory-card';
    const title=document.createElement('b');title.textContent=scopeLabel(policy.match_bounds);
    const detail=document.createElement('p');detail.textContent=isCandidate?(policy.decision_value+' · '+policy.observation_count+' '+x.count):(policy.decision_value+' · v'+policy.version+' · '+policy.state);
    const safety=document.createElement('small');safety.textContent='LOW · '+x.exact+' · '+x.privacy+' · '+policy.action_key;
    card.append(title,detail,safety);policyActions(card,policy,isCandidate);return card;
  }
  function openDialog(){
    closeDialog();const x=copy(),overlay=document.createElement('div');overlay.id='dabbirMemoryOverlay';overlay.className='dabbir-memory-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-memory-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title=document.createElement('h3');title.textContent=x.title;const desc=document.createElement('p');desc.textContent=x.desc;dialog.append(title,desc);
    const suggestions=document.createElement('div');suggestions.className='dabbir-memory-section';suggestions.textContent=x.suggestions;dialog.append(suggestions);
    if(state.candidates.length)state.candidates.forEach(item=>dialog.append(policyCard(item,true)));else{const empty=document.createElement('div');empty.className='dabbir-memory-empty';empty.textContent=x.empty;dialog.append(empty)}
    const active=document.createElement('div');active.className='dabbir-memory-section';active.textContent=x.active;dialog.append(active);
    state.policies.filter(item=>['ACTIVE','PAUSED'].includes(item.state)).forEach(item=>dialog.append(policyCard(item,false)));
    const close=document.createElement('button');close.className='dabbir-memory-close';close.textContent=x.close;close.onclick=closeDialog;dialog.append(close);
    overlay.append(dialog);overlay.onclick=event=>{if(event.target===overlay)closeDialog()};document.body.append(overlay);
  }
  async function mutate(action,extra){
    const id=businessId();if(!id||state.loading)return;state.loading=true;const x=copy();
    try{
      const response=await nativeFetch('/api/owner-decision-memory',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,action,...extra})});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_POLICY_UPDATE_FAILED');
      state.loading=false;await load(true);closeDialog();openDialog();notify(x.saved);
    }catch{state.loading=false;notify(x.failed)}
  }
  const observer=new MutationObserver(()=>{if(document.querySelector('#dabbirActionCenter')||document.querySelector('#screen-automations')){renderButton();load(false)}});observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>load(true),700);window.__dabbirOwnerDecisionMemory={refresh:()=>load(true),version:'owner-decision-memory-ui-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-dabbir-owner-decision-memory-ui','v1');return res.end(client);
}
