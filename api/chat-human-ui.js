const script=String.raw`(()=>{
  if(window.__dabbirHumanChatUiLoaded)return;
  window.__dabbirHumanChatUiLoaded=true;

  const style=document.createElement('style');
  style.textContent=[
    '#newChatBtn{display:none!important}',
    '.dabbirChatControl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.dabbirOwnerChip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;font-size:9px;font-weight:900;border:1px solid #31363c;background:#171a1d;color:#c8cdd3}',
    '.dabbirOwnerChip.ai{border-color:#3d4b27;background:#202918;color:#bfe977}',
    '.dabbirOwnerChip.human{border-color:#244a66;background:#132737;color:#9bd2ff}',
    '.dabbirOwnerChip.action{border-color:#665527;background:#332b16;color:#ffd87a}',
    '.dabbirTakeover{min-height:38px!important;padding:7px 11px!important;border-radius:11px!important;font-size:10px!important}',
    '.dabbirTakeover.take{border:1px solid #3b4d25;background:#d7ff5f;color:#10130b;font-weight:900}',
    '.dabbirTakeover.return{border:1px solid #35546b;background:#172b3a;color:#b6dcff;font-weight:900}',
    '.compose.dabbirHumanLocked{opacity:.72}',
    '.compose.dabbirHumanLocked input{cursor:not-allowed}',
    '.dabbirSenderLabel{font-size:8px;font-weight:900;margin:0 5px 4px;color:#8f969e}',
    '.msgrow.customer .bubble{margin-right:auto!important;margin-left:0!important;background:#191c20!important;border-color:#30353b!important}',
    '.msgrow.customer .dabbirSenderLabel{margin-right:auto!important;margin-left:5px!important}',
    '.msgrow.ai .bubble{margin-left:auto!important;margin-right:0!important;background:#252c1d!important;border-color:#414d2a!important}',
    '.msgrow.ai .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#b9de7d}',
    '.msgrow.human .bubble{margin-left:auto!important;margin-right:0!important;background:#172a38!important;border-color:#2e526c!important}',
    '.msgrow.human .dabbirSenderLabel{margin-left:auto!important;margin-right:5px!important;color:#9bcaff}',
    '@media(max-width:700px){.chatHead{align-items:flex-start;flex-wrap:wrap}.dabbirChatControl{width:100%;justify-content:space-between}.dabbirTakeover{flex:0 0 auto}.dabbirOwnerChip{max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}'
  ].join('');
  document.head.appendChild(style);

  const q=s=>document.querySelector(s);
  const isArabic=()=>document.documentElement.lang!=='en';
  const copy=()=>isArabic()?{
    ai:'DABBIR يتولى المحادثة',human:'موظف يتولى المحادثة',action:'تحتاج تدخلًا بشريًا',
    takeover:'استلام المحادثة',returnAi:'إرجاعها إلى DABBIR',locked:'DABBIR يدير المحادثة — استلمها للرد يدويًا',
    reply:'اكتب رد الموظف للعميل...',customer:'العميل',assistant:'DABBIR AI',staff:'الموظف',
    takeoverOk:'تم استلام المحادثة. توقفت ردود DABBIR التلقائية.',returnOk:'تمت إعادة المحادثة إلى DABBIR.',
    takeoverFail:'تعذر استلام المحادثة',sendFail:'تعذر إرسال رد الموظف',returnFail:'تعذر إعادة المحادثة إلى DABBIR'
  }:{
    ai:'DABBIR is handling this chat',human:'Human agent is handling this chat',action:'Human attention required',
    takeover:'Take over',returnAi:'Return to DABBIR',locked:'DABBIR is handling this chat — take over to reply manually',
    reply:'Write a staff reply to the customer...',customer:'Customer',assistant:'DABBIR AI',staff:'Staff',
    takeoverOk:'Conversation taken over. DABBIR auto-replies are paused.',returnOk:'Conversation returned to DABBIR.',
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
      clone.dataset.dabbirHumanComposer='v1';
      input.replaceWith(clone);
      clone.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendHumanReply()}});
    }
    const button=q('#sendBtn');
    if(button&&!button.dataset.dabbirHumanComposer){
      const clone=button.cloneNode(true);
      clone.dataset.dabbirHumanComposer='v1';
      button.replaceWith(clone);
      clone.addEventListener('click',sendHumanReply);
    }
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
    if(button)button.disabled=true;
    try{
      if(conversation.state==='human_active'){
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
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  return res.end(script);
}
