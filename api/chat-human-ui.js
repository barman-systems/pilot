const script=String.raw`(()=>{
  if(window.__dabbirHumanChatUiLoaded)return;
  window.__dabbirHumanChatUiLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirChatUi='v2';
  style.textContent=[
    '#newChatBtn{display:none!important}',
    '.dabbirChatControl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.dabbirOwnerChip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;font-size:9px;font-weight:900;border:1px solid #31363c;background:#171a1d;color:#c8cdd3}',
    '.dabbirOwnerChip:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9}',
    '.dabbirOwnerChip.ai{border-color:#3d4b27;background:#202918;color:#bfe977}',
    '.dabbirOwnerChip.human{border-color:#244a66;background:#132737;color:#9bd2ff}',
    '.dabbirOwnerChip.action{border-color:#665527;background:#332b16;color:#ffd87a}',
    '.dabbirTakeover{min-height:38px!important;padding:7px 11px!important;border-radius:11px!important;font-size:9px!important;white-space:nowrap}',
    '.dabbirTakeover.take{border:1px solid #52652c;background:#26331a;color:#d7ff5f;font-weight:900}',
    '.dabbirTakeover.return{border:1px solid #35546b;background:#172b3a;color:#b6dcff;font-weight:900}',
    '#screen-conversations .chatPanel{background:linear-gradient(180deg,#111315,#0d0f11)}',
    '#screen-conversations .chatHead{background:#121416}',
    '#screen-conversations #translateAll{border:1px solid #30363d!important;background:#181b1f!important;color:#d8dde2!important;border-radius:10px!important;font-size:9px!important;padding:7px 10px!important;min-height:38px!important}',
    '#screen-conversations .messages{scrollbar-width:thin;scrollbar-color:#31363c transparent}',
    '#screen-conversations .msgrow{margin:12px 0}',
    '#screen-conversations .bubble{max-width:min(78%,560px);box-shadow:none}',
    '#screen-conversations .bubble .body{font-size:12px;line-height:1.65}',
    '#screen-conversations .bubble .original{font-size:9px;line-height:1.55;opacity:.72}',
    '#screen-conversations .meta{margin-top:6px;gap:5px}',
    '#screen-conversations .meta button{min-height:26px!important;padding:2px 4px!important;font-size:8px!important}',
    '.compose.dabbirHumanLocked{opacity:1!important;background:#0f1210;border-top-color:#242a22!important}',
    '.compose.dabbirHumanLocked input{cursor:not-allowed;background:#141814!important;border-color:#252d22!important;color:#8c9584!important;text-align:center;font-size:10px}',
    '.compose.dabbirHumanLocked #sendBtn{display:none!important}',
    '.dabbirSenderLabel{font-size:8px;font-weight:900;margin:0 5px 4px;color:#8f969e;letter-spacing:.01em}',
    '.msgrow.customer .bubble{margin-right:auto!important;margin-left:0!important;background:#191c20!important;border-color:#30353b!important}',
    '.msgrow.customer .dabbirSenderLabel{margin-right:auto!important;margin-left:5px!important}',
    '.msgrow.ai .bubble{margin-left:auto!important;margin-right:0!important;background:#202817!important;border-color:#3a4827!important}',
    '.msgrow.ai .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#b9de7d}',
    '.msgrow.human .bubble{margin-left:auto!important;margin-right:0!important;background:#162735!important;border-color:#2e526c!important}',
    '.msgrow.human .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#9bcaff}',
    '@media(max-width:700px){'+
      '#screen-conversations .chatGrid{margin-top:0!important}'+
      '#screen-conversations .chatList{max-height:132px!important;margin-bottom:8px!important;border-radius:14px!important}'+
      '#screen-conversations .chatPanel{height:calc(100dvh - 238px);min-height:500px;border-radius:16px!important;overflow:hidden}'+
      '#screen-conversations .chatHead{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:10px!important}'+
      '#screen-conversations .chatHead>.grow{grid-column:1;grid-row:1;min-width:0}'+
      '#screen-conversations .chatHead>.grow b,#screen-conversations #chatName{font-size:12px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #chatState{font-size:8px!important;color:#858c94!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#screen-conversations #translateAll{grid-column:2;grid-row:1;min-height:38px!important;padding:6px 9px!important;white-space:nowrap}'+
      '#screen-conversations .dabbirChatControl{grid-column:1/-1;grid-row:2;width:100%;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}'+
      '#screen-conversations .dabbirOwnerChip{max-width:none!important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 8px;font-size:8px}'+
      '#screen-conversations .dabbirTakeover{min-height:36px!important;padding:6px 9px!important;font-size:8px!important}'+
      '#screen-conversations .messages{min-height:0!important;padding:11px 9px 14px!important}'+
      '#screen-conversations .msgrow{margin:10px 0!important}'+
      '#screen-conversations .bubble{max-width:84%!important;border-radius:15px!important;padding:9px 10px!important}'+
      '#screen-conversations .bubble .body{font-size:13px!important;line-height:1.58!important}'+
      '#screen-conversations .compose{padding:8px!important;gap:7px!important;background:#101214}'+
      '#screen-conversations .compose input{min-height:46px!important;border-radius:12px!important;font-size:16px!important}'+
      '#screen-conversations .send{width:46px!important;min-width:46px!important;height:46px!important;border-radius:12px!important}'+
      '#screen-conversations .compose.dabbirHumanLocked input{font-size:10px!important;min-height:42px!important}'+
      '#screen-conversations+.truth,#screen-conversations .truth{font-size:8px!important;line-height:1.55!important;padding:9px 10px!important;margin-top:8px!important}'+
    '}'
  ].join('');
  document.head.appendChild(style);

  const q=s=>document.querySelector(s);
  const isArabic=()=>document.documentElement.lang!=='en';
  const copy=()=>isArabic()?{
    ai:'DABBIR يتولى المحادثة',human:'رد يدوي من الموظف',action:'تحتاج تدخلًا بشريًا',
    takeover:'استلام يدوي',returnAi:'إعادة إلى DABBIR',locked:'DABBIR يرد تلقائيًا — استلم المحادثة للرد يدويًا',
    reply:'اكتب ردك للعميل...',customer:'العميل',assistant:'DABBIR',staff:'الموظف',
    takeoverOk:'تم استلام المحادثة. توقفت ردود DABBIR التلقائية.',returnOk:'تمت إعادة المحادثة إلى DABBIR.',takeoverConfirmTitle:'استلام المحادثة يدويًا؟',takeoverConfirmBody:'ستتوقف ردود دبّر التلقائية حتى تعيد المحادثة إليه.',returnConfirmTitle:'إعادة المحادثة إلى دبّر؟',returnConfirmBody:'سيستأنف دبّر الرد التلقائي وفق إعدادات النشاط.',continueAction:'متابعة',cancelAction:'إلغاء',
    takeoverFail:'تعذر استلام المحادثة',sendFail:'تعذر إرسال رد الموظف',returnFail:'تعذر إعادة المحادثة إلى DABBIR'
  }:{
    ai:'DABBIR is handling this chat',human:'Staff reply mode',action:'Human attention required',
    takeover:'Take over',returnAi:'Return to DABBIR',locked:'DABBIR replies automatically — take over to reply manually',
    reply:'Write your reply to the customer...',customer:'Customer',assistant:'DABBIR',staff:'Staff',
    takeoverOk:'Conversation taken over. DABBIR auto-replies are paused.',returnOk:'Conversation returned to DABBIR.',takeoverConfirmTitle:'Take over this conversation?',takeoverConfirmBody:'DABBIR automatic replies will pause until you return the conversation.',returnConfirmTitle:'Return this conversation to DABBIR?',returnConfirmBody:'DABBIR will resume automatic replies using the workspace settings.',continueAction:'Continue',cancelAction:'Cancel',
    takeoverFail:'Could not take over conversation',sendFail:'Could not send staff reply',returnFail:'Could not return conversation to DABBIR'
  };

  function currentConversation(){try{return typeof selectedConversation==='function'?selectedConversation():null}catch{return null}}
  function currentBusinessId(){try{return workspace&&workspace.business?workspace.business.id:null}catch{return null}}
  function currentConversationId(){try{return selectedConversationId||((currentConversation()||{}).id)||null}catch{return null}}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}

  function ensureControl(){
    const head=q('.chatHead');
    if(!head)return null;
    let wrap=q('#dabbirChatControl');
    if(wrap)return wrap;
    wrap=document.createElement('div');
    wrap.id='dabbirChatControl';
    wrap.className='dabbirChatControl';
    wrap.innerHTML='<span id="dabbirChatOwner" class="dabbirOwnerChip"></span><button id="dabbirTakeoverBtn" class="dabbirTakeover" type="button"></button>';
    const translate=q('#translateAll');
    if(translate)head.insertBefore(wrap,translate);else head.appendChild(wrap);
    q('#dabbirTakeoverBtn').addEventListener('click',toggleTakeover);
    return wrap;
  }

  function replaceLegacyComposer(){
    const input=q('#composer');
    if(input&&!input.dataset.dabbirHumanComposer){
      const clone=input.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v2';
      input.replaceWith(clone);
      clone.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendHumanReply()}});
    }
    const button=q('#sendBtn');
    if(button&&!button.dataset.dabbirHumanComposer){
      const clone=button.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v2';
      button.replaceWith(clone);
      clone.addEventListener('click',sendHumanReply);
    }
  }

  function normalizeComparable(value){return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()}
  function cleanDuplicateTranslations(){
    const messages=q('#messages');
    if(!messages)return;
    messages.querySelectorAll('.bubble').forEach(bubble=>{
      const body=bubble.querySelector('.body');
      const original=bubble.querySelector('.original');
      if(!body||!original)return;
      if(normalizeComparable(body.textContent)===normalizeComparable(original.textContent))original.remove();
    });
  }

  function labelMessages(){
    const t=copy();
    const messages=q('#messages');
    if(!messages)return;
    messages.querySelectorAll('.msgrow').forEach(row=>{
      const old=row.querySelector('.dabbirSenderLabel');
      if(old)old.remove();
      const label=document.createElement('div');
      label.className='dabbirSenderLabel';
      if(row.classList.contains('customer'))label.textContent=t.customer;
      else if(row.classList.contains('human'))label.textContent=t.staff;
      else if(row.classList.contains('ai'))label.textContent=t.assistant;
      else return;
      row.prepend(label);
    });
    cleanDuplicateTranslations();
  }

  function updateHumanUi(){
    ensureControl();
    replaceLegacyComposer();
    labelMessages();
    const t=copy();
    const conversation=currentConversation();
    const state=String(conversation?conversation.state:'');
    const owner=q('#dabbirChatOwner');
    const control=q('#dabbirTakeoverBtn');
    const input=q('#composer');
    const send=q('#sendBtn');
    const compose=input?input.closest('.compose'):null;
    const stateText=q('#chatState');

    if(!conversation){
      if(owner)owner.textContent='';
      if(control)control.style.display='none';
      if(input){input.disabled=true;input.placeholder=t.locked}
      if(send)send.disabled=true;
      if(compose)compose.classList.add('dabbirHumanLocked');
      return;
    }

    if(control)control.style.display='inline-flex';
    if(state==='human_active'){
      if(owner){owner.textContent=t.human;owner.className='dabbirOwnerChip human'}
      if(control){control.textContent=t.returnAi;control.className='dabbirTakeover return'}
      if(input){input.disabled=false;input.placeholder=t.reply}
      if(send)send.disabled=false;
      if(compose)compose.classList.remove('dabbirHumanLocked');
      if(stateText)stateText.textContent=t.human;
    }else{
      const needsHuman=state==='action_required';
      if(owner){owner.textContent=needsHuman?t.action:t.ai;owner.className='dabbirOwnerChip '+(needsHuman?'action':'ai')}
      if(control){control.textContent=t.takeover;control.className='dabbirTakeover take'}
      if(input){input.disabled=true;input.value='';input.placeholder=t.locked}
      if(send)send.disabled=true;
      if(compose)compose.classList.add('dabbirHumanLocked');
      if(stateText)stateText.textContent=needsHuman?t.action:t.ai;
    }
  }

  async function chatControl(action,message){
    const businessId=currentBusinessId();
    const conversationId=currentConversationId();
    if(!businessId||!conversationId)throw new Error('CONVERSATION_REQUIRED');
    const body={action:action,business_id:businessId,conversation_id:conversationId};
    if(message)body.message=message;
    const response=await fetch('/api/chat-control',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.detail||payload.error||'CHAT_CONTROL_FAILED');
    return payload;
  }

  async function toggleTakeover(){
    const button=q('#dabbirTakeoverBtn');
    const conversation=currentConversation();
    if(!conversation||(button&&button.disabled))return;
    const t=copy();
    const returning=conversation.state==='human_active';
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:returning?t.returnConfirmTitle:t.takeoverConfirmTitle,body:returning?t.returnConfirmBody:t.takeoverConfirmBody,accept:t.continueAction,cancel:t.cancelAction}):window.confirm(returning?t.returnConfirmTitle:t.takeoverConfirmTitle);
    if(!confirmed)return;
    if(button)button.disabled=true;
    try{
      if(returning){
        await chatControl('return_to_ai');
        notify(t.returnOk);
      }else{
        await chatControl('takeover');
        notify(t.takeoverOk);
      }
      if(typeof loadRuntime==='function')await loadRuntime(currentBusinessId(),currentConversationId());
    }catch(error){notify((conversation.state==='human_active'?t.returnFail:t.takeoverFail)+(error&&error.message?' — '+error.message:''))}
    finally{if(button)button.disabled=false;updateHumanUi()}
  }

  let sending=false;
  async function sendHumanReply(){
    const t=copy();
    const conversation=currentConversation();
    const input=q('#composer');
    const button=q('#sendBtn');
    const message=String(input?input.value:'').trim();
    if(sending||!message||!conversation||conversation.state!=='human_active')return;
    sending=true;
    if(button)button.disabled=true;
    try{
      const payload=await chatControl('human_message',message);
      const saved=payload&&payload.result?payload.result.message:null;
      if(input)input.value='';
      if(saved&&typeof workspace!=='undefined'&&workspace){
        workspace.messages=Array.isArray(workspace.messages)?workspace.messages:[];
        workspace.messages.push(saved);
        workspace.messages_loaded=true;
        if(typeof renderMessages==='function')renderMessages();
        labelMessages();
      }else if(typeof loadRuntime==='function'){
        await loadRuntime(currentBusinessId(),currentConversationId());
      }
    }catch(error){notify(t.sendFail+(error&&error.message?' — '+error.message:''))}
    finally{sending=false;if(button)button.disabled=false;updateHumanUi();const live=q('#composer');if(live&&!live.disabled)live.focus()}
  }

  ensureControl();
  replaceLegacyComposer();
  try{
    if(typeof renderMessages==='function'){
      const baseRenderMessages=renderMessages;
      renderMessages=function(){const value=baseRenderMessages.apply(this,arguments);labelMessages();updateHumanUi();return value};
    }
    if(typeof renderChats==='function'){
      const baseRenderChats=renderChats;
      renderChats=function(){const value=baseRenderChats.apply(this,arguments);updateHumanUi();return value};
    }
    if(typeof renderAll==='function'){
      const baseRenderAll=renderAll;
      renderAll=function(){const value=baseRenderAll.apply(this,arguments);updateHumanUi();return value};
    }
  }catch{}
  new MutationObserver(updateHumanUi).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(updateHumanUi,0);
  setTimeout(updateHumanUi,500);
  window.__dabbirHumanChatUiVersion='v2';
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-chat-ui','v2');
  return res.end(script);
}
