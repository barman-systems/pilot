const css=String.raw`
.dabbir-memory-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}
.dabbir-memory-btn.has-candidate{border-color:#665fd0;background:#201d35;color:#ddd8ff}
.dabbir-memory-overlay{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;box-sizing:border-box;background:#000c;color:#e8ebf1;display:flex;align-items:center;justify-content:center;padding:18px}
.dabbir-memory-overlay::backdrop{background:transparent}.dabbir-memory-dialog{width:min(560px,100%);max-height:84vh;overflow:auto;border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px}
.dabbir-memory-dialog h3{margin:0;font-size:16px}.dabbir-memory-dialog>p{color:#9fa8b6;font-size:10px;line-height:1.7}
.dabbir-memory-card{border:1px solid #2e3542;background:#171b23;border-radius:14px;padding:12px;margin-top:9px}
.dabbir-memory-card b{font-size:11px}.dabbir-memory-card p{font-size:9px;color:#a9b1bf;line-height:1.6;margin:5px 0 8px}.dabbir-memory-card small{display:block;color:#7f8998;font-size:8px;word-break:break-word}
.dabbir-memory-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dabbir-memory-actions button{min-height:36px;border-radius:10px;padding:7px 10px;font-size:9px;font-weight:900}
.dabbir-memory-approve{border:1px solid #6c63d8;background:#262047;color:#e2ddff}.dabbir-memory-pause{border:1px solid #5e5637;background:#242117;color:#ffe4a1}.dabbir-memory-revoke{border:1px solid #64373c;background:#29191c;color:#ffb9bd}
[data-knowledge-correction] summary{cursor:pointer;min-height:44px;padding-top:12px;box-sizing:border-box}.dabbir-memory-field{display:block;margin-top:12px;font-size:12px;color:#d8dde6}.dabbir-memory-field input,.dabbir-memory-field select{display:block;box-sizing:border-box;width:100%;margin-top:6px;min-height:44px;padding:10px;border-radius:10px;border:1px solid #465064;background:#181c23;color:#f3f4f6;font-size:16px}[data-knowledge="v2"] .dabbir-memory-card b{font-size:14px}[data-knowledge="v2"] .dabbir-memory-card p{font-size:12px}[data-knowledge="v2"] .dabbir-memory-card small{font-size:11px}[data-knowledge="v2"] button{min-height:44px;font-size:13px}[data-knowledge="v2"] .dabbir-memory-empty{font-size:12px}.dabbir-memory-status{font-size:12px;color:#bdc7d9;line-height:1.7}.dabbir-memory-actions button:disabled{opacity:.55;cursor:wait}.dabbir-memory-close{width:100%;min-height:42px;margin-top:12px;border:0;background:transparent;color:#9fa8b6;font-weight:800}.dabbir-memory-empty{padding:13px;margin-top:10px;border:1px dashed #343b49;border-radius:13px;color:#929ba8;font-size:10px}.dabbir-memory-section{margin-top:14px;font-size:11px;color:#e8ebf1}
@media(max-width:700px){.dabbir-memory-overlay{align-items:flex-end;padding:10px}.dabbir-memory-dialog{border-radius:20px 20px 14px 14px;max-height:88vh}.dabbir-memory-btn{min-height:40px}.dabbir-memory-actions button{flex:1}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirOwnerDecisionMemoryUiLoaded)return;
  window.__dabbirOwnerDecisionMemoryUiLoaded=true;
  const style=document.createElement('style');style.dataset.dabbirOwnerDecisionMemory='v1';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);
  const nativeFetch=window.fetch.bind(window);
  const emptyState=id=>({candidates:[],policies:[],proposals:[],services:[],audit:[],draft:{alias:'',target_id:'',correction:''},correctionError:'',loading:false,business:id,knowledgeError:false,policyError:false});
  let state=emptyState(null),generation=0,returnFocus=null;
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
  function current(id,epoch){return isOwner()&&businessId()===id&&state.business===id&&generation===epoch}
  function syncScope(){
    const id=isOwner()?businessId():null;
    if(state.business!==id){generation++;state=emptyState(id);closeDialog()}
    if(!id)document.querySelector('#dabbirMemoryButton')?.remove();
    return id;
  }
  async function load(force=false){
    const id=syncScope();if(!id||state.loading)return;
    if(!force&&state.loaded)return renderButton();
    state.loading=true;const epoch=generation;
    document.querySelectorAll('#dabbirMemoryOverlay button,#dabbirMemoryOverlay input,#dabbirMemoryOverlay select').forEach(el=>el.disabled=true);
    const get=async path=>{
      const response=await nativeFetch(path+'?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error('OWNER_KNOWLEDGE_LOOKUP_FAILED');
      return payload;
    };
    const [policies,knowledge]=await Promise.allSettled([get('/api/owner-decision-memory'),get('/api/understanding-knowledge')]);
    if(!current(id,epoch))return;
    const p=policies.status==='fulfilled'?policies.value:{},k=knowledge.status==='fulfilled'?knowledge.value:{};
    state={...emptyState(id),draft:state.draft,correctionError:state.correctionError,candidates:p.candidates||[],policies:p.policies||[],proposals:k.proposals||[],services:k.services||[],audit:k.audit||[],knowledgeError:knowledge.status!=='fulfilled',policyError:policies.status!=='fulfilled',loaded:true};
    renderButton();if(document.querySelector('#dabbirMemoryOverlay'))openDialog();
  }
  function renderButton(){
    if(!syncScope())return;
    const actionHead=document.querySelector('#dabbirActionCenter .dac-head');
    const autoHero=document.querySelector('#screen-automations .hero');
    const host=actionHead||autoHero;if(!host)return;
    let button=document.querySelector('#dabbirMemoryButton');
    if(!button){button=document.createElement('button');button.id='dabbirMemoryButton';button.type='button';button.className='dabbir-memory-btn';button.addEventListener('click',openDialog);const refresh=actionHead?.querySelector('#dacRefresh');refresh?.parentNode?refresh.parentNode.insertBefore(button,refresh):host.append(button)}
    // The automation screen exists before the asynchronous dashboard mounts.
    // Move the existing control when its authoritative visible host arrives.
    if(button.parentNode!==host)host.append(button);
    const x=copy();
    const pending=state.candidates.length+state.proposals.filter(p=>p.status==='PROPOSED').length;
    const hasCandidate=pending>0;
    button.classList.toggle('has-candidate',hasCandidate);
    const nextLabel=hasCandidate?x.candidate+' · '+pending:x.button;
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
  }
  function closeDialog(){const overlay=document.querySelector('#dabbirMemoryOverlay');if(overlay?.open)overlay.close();overlay?.remove();returnFocus?.focus?.()}
  function policyActions(card,policy,isCandidate){
    const x=copy(),actions=document.createElement('div');actions.className='dabbir-memory-actions';
    const scope=state.business,epoch=generation,mutate=(action,extra)=>mutatePolicy(action,extra,scope,epoch);
    if(isCandidate){const approve=document.createElement('button');approve.className='dabbir-memory-approve';approve.textContent=x.approve;approve.onclick=()=>mutate('activate',{action_key:policy.action_key,decision_key:policy.decision_key,decision_value:policy.decision_value,match_bounds:policy.match_bounds});actions.append(approve)}
    else{
      if(policy.state==='ACTIVE'){const pause=document.createElement('button');pause.className='dabbir-memory-pause';pause.textContent=x.pause;pause.onclick=()=>mutate('pause',{policy_id:policy.id});actions.append(pause)}
      if(policy.state==='PAUSED'){const resume=document.createElement('button');resume.className='dabbir-memory-approve';resume.textContent=x.resume;resume.onclick=()=>mutate('resume',{policy_id:policy.id});actions.append(resume)}
      const revoke=document.createElement('button');revoke.className='dabbir-memory-revoke';revoke.textContent=x.revoke;revoke.onclick=()=>mutate('revoke',{policy_id:policy.id});actions.append(revoke);
    }
    card.append(actions);
  }
  function mutatePolicy(action,extra,scope,epoch){return mutate(action,extra,'/api/owner-decision-memory',scope,epoch)}
  function policyCard(policy,isCandidate=false){
    const x=copy(),card=document.createElement('div');card.className='dabbir-memory-card';
    const title=document.createElement('b');title.textContent=scopeLabel(policy.match_bounds);
    const detail=document.createElement('p');detail.textContent=isCandidate?(policy.decision_value+' · '+policy.observation_count+' '+x.count):(policy.decision_value+' · v'+policy.version+' · '+policy.state);
    const safety=document.createElement('small');safety.textContent='LOW · '+x.exact+' · '+x.privacy+' · '+policy.action_key;
    card.append(title,detail,safety);policyActions(card,policy,isCandidate);return card;
  }
  function openDialog(){
    if(!syncScope())return;
    const hadDialog=Boolean(document.querySelector('#dabbirMemoryOverlay'));
    if(!hadDialog)returnFocus=document.activeElement;
    closeDialog();const x=copy(),overlay=document.createElement('dialog');overlay.id='dabbirMemoryOverlay';overlay.className='dabbir-memory-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-memory-dialog';overlay.setAttribute('aria-labelledby','dabbirMemoryTitle');
    const title=document.createElement('h3');title.id='dabbirMemoryTitle';title.textContent=x.title;const desc=document.createElement('p');desc.textContent=x.desc;dialog.append(title,desc);
    renderKnowledge(dialog);
    if(state.policyError){
      const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=ar()?'تعذر تحميل سياسات المالك. حاول مجددًا.':'Could not load owner policies. Try again.';dialog.append(error);
      const retry=document.createElement('button');retry.textContent=ar()?'إعادة تحميل السياسات':'Retry policies';retry.onclick=()=>load(true);dialog.append(retry);
    }else{
    const suggestions=document.createElement('div');suggestions.className='dabbir-memory-section';suggestions.textContent=x.suggestions;dialog.append(suggestions);
    if(state.candidates.length)state.candidates.forEach(item=>dialog.append(policyCard(item,true)));else{const empty=document.createElement('div');empty.className='dabbir-memory-empty';empty.textContent=x.empty;dialog.append(empty)}
    const active=document.createElement('div');active.className='dabbir-memory-section';active.textContent=x.active;dialog.append(active);
    state.policies.filter(item=>['ACTIVE','PAUSED'].includes(item.state)).forEach(item=>dialog.append(policyCard(item,false)));
    }
    const close=document.createElement('button');close.className='dabbir-memory-close';close.textContent=x.close;close.onclick=closeDialog;dialog.append(close);
    overlay.append(dialog);overlay.onclick=event=>{if(event.target===overlay)closeDialog()};document.body.append(overlay);overlay.showModal();overlay.oncancel=event=>{event.preventDefault();closeDialog()};close.focus();
    overlay.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeDialog()}else if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button,input,select,summary')].filter(el=>!el.disabled);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
  }
  const knowledgeCopy=()=>ar()?{
    title:'معاني الخدمات',desc:'اربط تعبير العميل بخدمة من قائمتك، مثل VIP. حفظ الاقتراح لا يفعّله؛ راجعه ثم اعتمده. يسري داخل هذا النشاط وعلى الفروع التي تقدم الخدمة.',
    alias:'تعبير العميل',service:'الخدمة المقصودة',choose:'اختر الخدمة',propose:'حفظ اقتراح للمراجعة',approve:'اعتماد المعنى',reject:'رفض الاقتراح',revoke:'إلغاء الاعتماد',rollback:'إعادة اعتماد هذا الإصدار',
    correctionTitle:'أو اكتب تصحيحًا للمعنى',correction:'تصحيح المالك',correctionHint:'مثال: VIP يعني الباقة الذهبية. استخدم اسم الخدمة كما يظهر في قائمتك.',correctionSave:'تحويل التصحيح إلى اقتراح',
    CORRECTION_FORMAT_REQUIRED:'اكتب معنى واحدًا بصيغة «VIP يعني اسم الخدمة»، أو اختر الخدمة من النموذج أعلاه.',CORRECTION_SERVICE_NOT_FOUND:'لم نجد خدمة فعالة بهذا الاسم. اختر الخدمة من النموذج أعلاه.',CORRECTION_SERVICE_AMBIGUOUS:'يوجد أكثر من خدمة بهذا الاسم. حدّد الخدمة من النموذج أعلاه.',CORRECTION_USE_SERVICE_PICKER:'حدّد الخدمة من النموذج أعلاه لحفظ هذا المعنى.',
    empty:'لا توجد معانٍ محفوظة بعد.',noServices:'أضف خدمة فعالة إلى قائمة خدماتك أولًا.',unavailable:'الخدمة غير متاحة حاليًا',error:'تعذر تحميل معاني الخدمات. حاول مجددًا.',retry:'إعادة المحاولة',loading:'جارٍ التحميل…',saved:'تم حفظ الاقتراح. يحتاج اعتمادك ليصبح فعالًا.',updated:'تم تحديث المعنى',failed:'تعذر حفظ التغيير. حدّث القائمة قبل المحاولة مجددًا.',audit:'سجل التغييرات',version:'الإصدار',
    PROPOSED:'بانتظار اعتمادك',OWNER_APPROVED:'معتمد',REJECTED:'مرفوض',REVOKED:'ملغى',SUPERSEDED:'استُبدل بإصدار آخر',ROLLBACK:'أعيد اعتماده'
  }:{
    title:'Service meanings',desc:'Map a customer expression, such as VIP, to a service in your catalog. Saving a proposal does not activate it; review and approve it separately. It applies within this business and branches offering the service.',
    alias:'Customer expression',service:'Intended service',choose:'Choose a service',propose:'Save proposal for review',approve:'Approve meaning',reject:'Reject proposal',revoke:'Revoke approval',rollback:'Approve this version again',
    correctionTitle:'Or describe a correction',correction:'Owner correction',correctionHint:'For example: VIP means Gold Wash. Use the service name shown in your catalog.',correctionSave:'Turn correction into proposal',
    CORRECTION_FORMAT_REQUIRED:'Write one meaning as “VIP means service name”, or choose the service in the form above.',CORRECTION_SERVICE_NOT_FOUND:'No active service matches that name. Choose the service in the form above.',CORRECTION_SERVICE_AMBIGUOUS:'More than one service has that name. Choose the intended service in the form above.',CORRECTION_USE_SERVICE_PICKER:'Choose the service in the form above to save this meaning.',
    empty:'No saved meanings yet.',noServices:'Add an active service to your catalog first.',unavailable:'Service currently unavailable',error:'Could not load service meanings. Try again.',retry:'Retry',loading:'Loading…',saved:'Proposal saved. Your approval is required to activate it.',updated:'Meaning updated',failed:'Could not save the change. Refresh the list before trying again.',audit:'Change history',version:'Version',
    PROPOSED:'Awaiting your approval',OWNER_APPROVED:'Approved',REJECTED:'Rejected',REVOKED:'Revoked',SUPERSEDED:'Replaced by another version',ROLLBACK:'Approved again'
  };
  function renderKnowledge(dialog){
    const k=knowledgeCopy(),scope=state.business,epoch=generation;
    const section=document.createElement('section');section.dataset.knowledge='v2';
    const heading=document.createElement('h4');heading.textContent=k.title;
    const desc=document.createElement('p');desc.className='dabbir-memory-status';desc.textContent=k.desc;section.append(heading,desc);dialog.append(section);
    if(state.loading||state.knowledgeError){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=state.loading?k.loading:k.error;section.append(status);if(state.knowledgeError){const retry=document.createElement('button');retry.textContent=k.retry;retry.onclick=()=>load(true);section.append(retry)}return}
    const active=state.services.filter(s=>s.active===true);
    if(active.length){
      const form=document.createElement('form');form.dataset.knowledgeForm='v2';
      const aliasLabel=document.createElement('label');aliasLabel.className='dabbir-memory-field';aliasLabel.textContent=k.alias;
      const alias=document.createElement('input');alias.name='alias';alias.maxLength=80;alias.required=true;alias.autocomplete='off';alias.value=state.draft.alias;alias.oninput=()=>{if(current(scope,epoch))state.draft.alias=alias.value};aliasLabel.append(alias);
      const serviceLabel=document.createElement('label');serviceLabel.className='dabbir-memory-field';serviceLabel.textContent=k.service;
      const service=document.createElement('select');service.name='service';service.required=true;
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=k.choose;service.append(placeholder);
      active.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;service.append(option)});serviceLabel.append(service);
      service.value=active.some(item=>item.id===state.draft.target_id)?state.draft.target_id:'';service.onchange=()=>{if(current(scope,epoch))state.draft.target_id=service.value};
      const submit=document.createElement('button');submit.type='submit';submit.className='dabbir-memory-approve';submit.textContent=k.propose;
      const actions=document.createElement('div');actions.className='dabbir-memory-actions';actions.append(submit);form.append(aliasLabel,serviceLabel,actions);
      form.onsubmit=event=>{event.preventDefault();if(!current(scope,epoch)||!alias.value.trim()||!active.some(s=>s.id===service.value))return;return mutate('propose',{entity_type:'service',alias:alias.value.trim(),target_id:service.value},'/api/understanding-knowledge',scope,epoch)};
      section.append(form);
      const details=document.createElement('details');details.dataset.knowledgeCorrection='v2';details.open=Boolean(state.draft.correction||state.correctionError);
      const summary=document.createElement('summary');summary.textContent=k.correctionTitle;summary.className='dabbir-memory-field';
      const correctionForm=document.createElement('form');correctionForm.dataset.knowledgeCorrectionForm='v2';
      const correctionLabel=document.createElement('label');correctionLabel.className='dabbir-memory-field';correctionLabel.textContent=k.correction;
      const correction=document.createElement('input');correction.name='correction';correction.maxLength=400;correction.required=true;correction.autocomplete='off';correction.value=state.draft.correction;correction.setAttribute('aria-describedby','dabbirCorrectionHint');correction.oninput=()=>{if(current(scope,epoch))state.draft.correction=correction.value};correctionLabel.append(correction);
      const hint=document.createElement('p');hint.id='dabbirCorrectionHint';hint.className='dabbir-memory-status';hint.textContent=k.correctionHint;
      const correctionSave=document.createElement('button');correctionSave.type='submit';correctionSave.className='dabbir-memory-approve';correctionSave.textContent=k.correctionSave;
      const correctionActions=document.createElement('div');correctionActions.className='dabbir-memory-actions';correctionActions.append(correctionSave);correctionForm.append(correctionLabel,hint,correctionActions);
      if(state.correctionError){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=k[state.correctionError]||k.failed;correctionForm.append(error)}
      correctionForm.onsubmit=event=>{event.preventDefault();if(!current(scope,epoch)||!correction.value.trim()||correction.value.length>400)return;return mutate('propose_correction',{correction:correction.value.trim()},'/api/understanding-knowledge',scope,epoch)};
      details.append(summary,correctionForm);section.append(details);
    }else{const p=document.createElement('p');p.textContent=k.noServices;section.append(p)}
    const proposals=state.proposals.filter(p=>p.entity_type==='service');
    if(!proposals.length){const p=document.createElement('p');p.className='dabbir-memory-empty';p.textContent=k.empty;section.append(p)}
    proposals.forEach(p=>{
      const card=document.createElement('article');card.className='dabbir-memory-card';
      const target=state.services.find(s=>s.id===p.target_id),title=document.createElement('b');title.textContent=p.alias+' → '+(target?.name||k.unavailable);
      const status=document.createElement('p');status.textContent=(k[p.status]||k.unavailable)+' · '+k.version+' '+p.version;
      card.append(title,status);
      const actions=document.createElement('div');actions.className='dabbir-memory-actions';
      const add=(action,label)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.className=action==='reject'||action==='revoke'?'dabbir-memory-revoke':'dabbir-memory-approve';button.onclick=()=>mutate(action,{proposal_id:p.id},'/api/understanding-knowledge',scope,epoch);actions.append(button)};
      if(p.status==='PROPOSED'){if(target?.active)add('approve',k.approve);add('reject',k.reject)}
      if(p.status==='OWNER_APPROVED')add('revoke',k.revoke);
      if(['REVOKED','SUPERSEDED'].includes(p.status)&&target?.active)add('rollback',k.rollback);
      card.append(actions);
      const history=state.audit.filter(e=>e.proposal_id===p.id).slice(0,4);
      if(history.length){const list=document.createElement('small');list.textContent=k.audit+': '+history.map(e=>(k[e.event_type]||e.event_type)+' · '+new Date(e.created_at).toLocaleString(ar()?'ar-AE':'en-GB')).join(' / ');card.append(list)}
      section.append(card);
    });
  }
  async function mutate(action,extra,path='/api/owner-decision-memory',scope=state.business,epoch=generation){
    const id=businessId();if(!current(scope,epoch)||id!==scope||state.loading)return;state.loading=true;const k=knowledgeCopy();
    document.querySelectorAll('#dabbirMemoryOverlay button,#dabbirMemoryOverlay input,#dabbirMemoryOverlay select').forEach(el=>el.disabled=true);
    try{
      const response=await nativeFetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json','x-dabbir-client':'web'},body:JSON.stringify({business_id:id,action,...extra})});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(['CORRECTION_FORMAT_REQUIRED','CORRECTION_SERVICE_NOT_FOUND','CORRECTION_SERVICE_AMBIGUOUS','CORRECTION_USE_SERVICE_PICKER'].includes(payload?.error)?payload.error:'OWNER_POLICY_UPDATE_FAILED');
      if(!current(id,epoch))return;
      if(path==='/api/understanding-knowledge'&&action==='propose')state.draft={...state.draft,alias:'',target_id:''};
      if(path==='/api/understanding-knowledge'&&action==='propose_correction'){state.draft={...state.draft,correction:''};state.correctionError=''}
      state.loading=false;await load(true);if(!current(id,epoch))return;
      notify(path==='/api/understanding-knowledge'?(['propose','propose_correction'].includes(action)?k.saved:k.updated):copy().saved);
    }catch(error){if(!current(id,epoch))return;if(action==='propose_correction')state.correctionError=error.message;state.loading=false;await load(true);if(current(id,epoch))notify(action==='propose_correction'?(k[state.correctionError]||k.failed):k.failed)}
  }
  let observerFrame=0;
  function scheduleObservedSync(){
    if(observerFrame)return;
    const run=()=>{
      observerFrame=0;
      if(document.querySelector('#dabbirActionCenter')||document.querySelector('#screen-automations')){renderButton();load(false)}
    };
    observerFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame(run):setTimeout(run,0);
  }
  const observer=new MutationObserver(scheduleObservedSync);observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>load(false),700);window.__dabbirOwnerDecisionMemory={refresh:()=>load(true),version:'owner-decision-memory-ui-v2'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-dabbir-owner-decision-memory-ui','v1');return res.end(client);
}
