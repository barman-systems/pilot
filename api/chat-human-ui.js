const script=String.raw`(()=>{
  if(window.__dabbirHumanChatUiLoaded)return;
  window.__dabbirHumanChatUiLoaded=true;

  // Presentation is statically owned by public/dabbir-chat.css.

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
    wrap.innerHTML='<span id="dabbirChatOwner" class="dabbirOwnerChip"></span><button id="dabbirTakeoverBtn" class="dabbirTakeover" type="button"></button><button id="dabbirReturnToAiBtn" class="dabbirTakeover return" type="button" hidden></button>';
    const translate=q('#translateAll');
    if(translate)head.insertBefore(wrap,translate);else head.appendChild(wrap);
    q('#dabbirTakeoverBtn').addEventListener('click',toggleTakeover);
    q('#dabbirReturnToAiBtn').addEventListener('click',()=>toggleTakeover(true));
    return wrap;
  }

  function replaceLegacyComposer(){
    const input=q('#composer');
    if(input&&!input.dataset.dabbirHumanComposer){
      const clone=input.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v3';
      input.replaceWith(clone);
      clone.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendHumanReply()}});
    }
    const button=q('#sendBtn');
    if(button&&!button.dataset.dabbirHumanComposer){
      const clone=button.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v3';
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
      row.querySelectorAll(':scope > .dabbirSenderLabel,:scope > .d4-sender,:scope > .dabbirAiIdentity').forEach(node=>node.remove());
      const label=document.createElement('div');
      label.className='dabbirSenderLabel';
      if(row.classList.contains('customer'))label.textContent=t.customer;
      else if(row.classList.contains('human'))label.textContent=t.staff;
      else if(row.classList.contains('ai')){label.classList.add('d4-sender');const img=document.createElement('img');img.src='/dabbir-app-icon.png';img.alt='';img.decoding='async';const name=document.createElement('span');name.textContent=t.assistant;label.append(img,name);}
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
    const directReturn=q('#dabbirReturnToAiBtn');
    if(directReturn){directReturn.textContent=t.returnAi;directReturn.hidden=state!=='action_required';}
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

  let refreshQueued=false;
  function queueHumanUi(){
    if(refreshQueued)return;
    refreshQueued=true;
    const run=()=>{refreshQueued=false;updateHumanUi()};
    if(typeof queueMicrotask==='function')queueMicrotask(run);else Promise.resolve().then(run);
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

  async function toggleTakeover(forceReturn=false){
    const directReturn=forceReturn===true;
    const button=q(directReturn?'#dabbirReturnToAiBtn':'#dabbirTakeoverBtn');
    const conversation=currentConversation();
    if(!conversation||(button&&button.disabled))return;
    if(directReturn&&conversation.state!=='action_required')return;
    const selectedBusiness=currentBusinessId(),selectedConversation=currentConversationId();
    const t=copy();
    const returning=directReturn||conversation.state==='human_active';
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:returning?t.returnConfirmTitle:t.takeoverConfirmTitle,body:returning?t.returnConfirmBody:t.takeoverConfirmBody,accept:t.continueAction,cancel:t.cancelAction}):window.confirm(returning?t.returnConfirmTitle:t.takeoverConfirmTitle);
    if(!confirmed)return;
    if(currentBusinessId()!==selectedBusiness||currentConversationId()!==selectedConversation)return;
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
    }catch(error){notify((returning?t.returnFail:t.takeoverFail)+(error&&error.message?' — '+error.message:''))}
    finally{if(button)button.disabled=false;queueHumanUi()}
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
      }else if(typeof loadRuntime==='function'){
        await loadRuntime(currentBusinessId(),currentConversationId());
      }
    }catch(error){notify(t.sendFail+(error&&error.message?' — '+error.message:''))}
    finally{sending=false;if(button)button.disabled=false;queueHumanUi();const live=q('#composer');if(live&&!live.disabled)live.focus()}
  }

  ensureControl();
  replaceLegacyComposer();
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterMessages','human-chat-ui',queueHumanUi);
    lifecycle.on('afterChats','human-chat-ui',queueHumanUi);
    lifecycle.on('afterRender','human-chat-ui',queueHumanUi);
    lifecycle.on('afterLanguage','human-chat-ui',queueHumanUi);
  }
  setTimeout(updateHumanUi,0);
  window.__dabbirHumanChatUiVersion='v3-lifecycle';
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-chat-ui','v3-lifecycle-readable');
  return res.end(script);
}
