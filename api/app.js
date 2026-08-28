import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);

// Phase 2 stabilization: this is the remaining inline runtime/performance authority.
// Business/activity navigation is owned by the authoritative owner journey and activity modules,
// not by an additional legacy businessAdaptive wrapper in this response transformer.
const interfacePerformanceUi = String.raw`
<style>
button,a,[data-screen],[data-cid]{touch-action:manipulation}
.screen.active{contain:layout paint style}
.card,.chatList,.chatPanel,.table,.integration,.item{contain:layout paint}
.messages{-webkit-overflow-scrolling:touch;overscroll-behavior:contain;contain:layout paint}
.side{will-change:transform}
@media(max-width:700px){
  html,body{background:#08090a!important}
  .top{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:#08090af7!important}
  .authCard,.side,.modalBox{box-shadow:none!important}
  .side{transition:transform .14s ease-out!important}
  .content{contain:layout style}
  .card,.chatList,.chatPanel,.table,.integration{box-shadow:none!important}
}
</style>
<script>
(()=>{
  function applyFastBusinessProfile(){
    if(!workspace?.business) return;
    const isStore=String(workspace.business.business_type||'').toLowerCase()==='store';
    document.body.classList.toggle('dabbir-store',isStore);
    document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display=isStore?'none':''});
    document.querySelector('#bottomNav')?.classList.toggle('dabbir-store-nav',isStore);
    const state=document.querySelector('#workspaceState');
    if(state) state.textContent=isStore?(lang==='ar'?'متجر • تشغيلي':'Store • Operational'):T().operational;
  }

  function renderShellFast(){
    if(!workspace?.business) return;
    const name=document.querySelector('#workspaceName');
    const page=document.querySelector('#pageTitle');
    if(name) name.textContent=workspace.business.name;
    if(page) page.textContent=T()[current]||T().dashboard;
    applyFastBusinessProfile();
  }

  function renderCurrentFast(){
    if(!workspace?.business) return;
    if(current==='dashboard') renderDashboard();
    else if(current==='conversations') renderChats();
    else if(current==='appointments') renderAppointments();
    else if(current==='customers') renderCustomers();
    else if(current==='tasks'||current==='automations') renderTasks();
    else if(current==='analytics') renderAnalytics();
    else if(current==='integrations') renderIntegrations();
    else if(current==='notifications') renderNotices();
    else if(current==='settings') renderSettings();
  }

  function ensureConversationLoaded(){
    if(current!=='conversations'||!workspace?.business?.id||!selectedConversationId||workspace.messages_loaded!==false) return;
    workspace.messages_loaded='loading';
    loadRuntime(workspace.business.id,selectedConversationId).catch(()=>{if(workspace)workspace.messages_loaded=false});
  }

  renderAll=function(){
    renderShellFast();
    renderCurrentFast();
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(ensureConversationLoaded);
    else setTimeout(ensureConversationLoaded,0);
  };

  showScreen=function(name){
    if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') name='dashboard';
    current=name;
    renderCurrentFast();
    applyFastBusinessProfile();
    ensureConversationLoaded();
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+name));
    document.querySelectorAll('[data-screen]').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));
    const page=document.querySelector('#pageTitle');
    if(page) page.textContent=T()[name]||name;
    document.querySelector('#side')?.classList.remove('open');
  };

  window.__dabbirInterfacePerformance='fast-v4-truth';
})();
</script>`;

const conversationPerformanceUi = String.raw`
<style>
#sendBtn:disabled{opacity:.6;cursor:wait}
.msgrow[data-dabbir-pending="true"] .bubble{opacity:.72}
.msgrow[data-dabbir-typing="true"] .bubble{min-width:52px;text-align:center;animation:dabbirPulse 1s ease-in-out infinite}
@keyframes dabbirPulse{0%,100%{opacity:.45}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.msgrow[data-dabbir-typing="true"] .bubble{animation:none}}
</style>
<script>
(()=>{
  let dabbirSending=false;
  const WA_KEY_RE=/^[A-Za-z0-9:_-]{16,160}$/;

  function renderFastMessages(){
    renderMessages();
    const list=document.querySelector('#messages');
    if(!list) return;
    list.querySelectorAll('.msgrow').forEach(row=>{
      const body=row.querySelector('.bubble .body');
      if(body?.textContent==='DABBIR_TYPING'){
        row.dataset.dabbirTyping='true';
        body.textContent='…';
      }
    });
  }

  function selectedConversation(){
    return (workspace?.conversations||[]).find(c=>c.id===selectedConversationId)||null;
  }

  function localConversationState(state){
    const conversation=selectedConversation();
    if(conversation) conversation.state=state;
  }

  function whatsappStorageKey(conversation){
    return 'dabbir-wa-pending:'+String(workspace?.business?.id||'')+':'+String(conversation?.id||'');
  }

  async function whatsappPayloadHash(conversation,text){
    const source=String(workspace.business.id)+'\u0000'+String(conversation.id)+'\u0000'+String(text);
    if(!globalThis.crypto?.subtle) throw new Error('CRYPTO_UNAVAILABLE');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function newWhatsAppIdempotencyKey(){
    if(globalThis.crypto?.randomUUID) return 'wa_'+crypto.randomUUID();
    const bytes=new Uint8Array(24);
    if(!globalThis.crypto?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
    crypto.getRandomValues(bytes);
    return 'wa_'+[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function readPendingWhatsApp(conversation){
    try{return JSON.parse(localStorage.getItem(whatsappStorageKey(conversation))||'null')}catch{return null}
  }

  function writePendingWhatsApp(conversation,pending){
    try{localStorage.setItem(whatsappStorageKey(conversation),JSON.stringify(pending))}catch{}
  }

  function clearPendingWhatsApp(conversation){
    try{localStorage.removeItem(whatsappStorageKey(conversation))}catch{}
  }

  async function whatsappOperation(conversation,text){
    const payloadHash=await whatsappPayloadHash(conversation,text);
    const pending=readPendingWhatsApp(conversation);
    if(pending&&pending.payload_hash===payloadHash&&WA_KEY_RE.test(String(pending.idempotency_key||''))){
      return {idempotency_key:pending.idempotency_key,payload_hash:payloadHash,reused:true};
    }
    const operation={idempotency_key:newWhatsAppIdempotencyKey(),payload_hash:payloadHash,reused:false};
    writePendingWhatsApp(conversation,operation);
    return operation;
  }

  async function sendApprovedWhatsAppReply({text,conversation}){
    let operation;
    try{operation=await whatsappOperation(conversation,text)}catch{
      toast(lang==='ar'?'تعذر إنشاء معرف إرسال آمن؛ لم يتم الإرسال':'Could not create a safe send identifier; nothing was sent');
      return;
    }

    try{
      const {r,j={}}=await api('/api/dabbir-whatsapp-reply',{
        method:'POST',
        body:JSON.stringify({
          business_id:workspace.business.id,
          conversation_id:conversation.id,
          message:text,
          idempotency_key:operation.idempotency_key
        })
      });
      workspace.last_action_truth=j.truth||{state:'UNVERIFIED'};

      if(!r.ok||!j.ok){
        localConversationState('action_required');
        const needsReconciliation=j.automatic_resend_blocked===true&&(j.state==='AMBIGUOUS'||j.state==='SENDING'||j.state==='AMBIGUOUS_NO_AUTOMATIC_RESEND'||j.external_side_effects_possible===true);
        if(j.retry_requires_new_operation===true||(!needsReconciliation&&j.state==='FAILED')) clearPendingWhatsApp(conversation);
        if(needsReconciliation){
          toast(lang==='ar'?'حالة الإرسال تحتاج تحقق؛ دبّر لن يعيد الإرسال تلقائيًا':'Send status needs verification; DABBIR will not resend automatically');
        }else{
          toast(lang==='ar'?'لم يتم تأكيد إرسال رد واتساب':'WhatsApp reply was not confirmed');
        }
        if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
        return;
      }

      clearPendingWhatsApp(conversation);
      if(j.message){
        workspace.messages=(workspace.messages||[]).filter(m=>m.id!==j.message.id);
        workspace.messages.push(j.message);
      }
      localConversationState('waiting_customer');
      workspace.messages_loaded=true;
      translations.clear();
      translationMode=false;
      renderMessages();
      if(current==='dashboard') renderDashboard();
      if(current==='analytics') renderAnalytics();
      if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
      toast(j.provider_status_verified===true
        ? (lang==='ar'?'تم التحقق من تسليم رد واتساب':'WhatsApp reply delivery verified')
        : (lang==='ar'?'قبلت Meta الرد؛ بانتظار تأكيد التسليم':'Meta accepted the reply; awaiting delivery confirmation'));
    }catch{
      workspace.last_action_truth={state:'UNVERIFIED'};
      localConversationState('action_required');
      if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
      toast(lang==='ar'?'الاتصال انقطع؛ لن يعيد دبّر الإرسال تلقائيًا حتى نتحقق':'Connection dropped; DABBIR will not resend until the attempt is verified');
    }
  }

  async function sendWebConversation({text}){
    const stamp=Date.now();
    const tempId='dabbir-local-'+stamp;
    const typingId='dabbir-typing-'+stamp;
    const now=new Date().toISOString();
    const baseMessages=Array.isArray(workspace?.messages)?workspace.messages:[];
    workspace.messages=baseMessages.concat([
      {id:tempId,conversation_id:selectedConversationId,sender_type:'customer',body:text,intent:'PENDING',simulated:false,created_at:now},
      {id:typingId,conversation_id:selectedConversationId,sender_type:'ai',body:'DABBIR_TYPING',intent:'PENDING',simulated:false,created_at:now}
    ]);
    renderFastMessages();

    try{
      const {r,j={}}=await api('/api/chat-send',{
        method:'POST',
        body:JSON.stringify({business_id:workspace.business.id,conversation_id:selectedConversationId,message:text})
      });

      workspace.messages=(workspace.messages||[]).filter(m=>m.id!==tempId&&m.id!==typingId);
      workspace.last_action_truth=j.truth||{state:'UNVERIFIED'};

      if(j.customer_message) workspace.messages.push(j.customer_message);
      else if(!j.customer_message_persisted) workspace.messages.push({id:tempId,conversation_id:selectedConversationId,sender_type:'customer',body:text,intent:'UNVERIFIED',simulated:false,created_at:now});

      if(!r.ok||!j.ok){
        localConversationState('action_required');
        renderMessages();
        if(current==='dashboard') renderDashboard();
        if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
        toast(lang==='ar'?(j.customer_message_persisted?'تم حفظ رسالتك، وتعذر رد AI مؤقتًا':'تعذر إرسال الرسالة'):(j.customer_message_persisted?'Message saved; AI reply is temporarily unavailable':'Message could not be sent'));
        return;
      }

      if(j.ai_message) workspace.messages.push(j.ai_message);
      localConversationState('waiting_customer');
      workspace.messages_loaded=true;
      translations.clear();
      translationMode=false;
      renderMessages();
      if(current==='dashboard') renderDashboard();
      if(current==='analytics') renderAnalytics();
      if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
    }catch{
      workspace.last_action_truth={state:'UNVERIFIED'};
      workspace.messages=(workspace.messages||[]).filter(m=>m.id!==typingId);
      renderMessages();
      if(typeof window.__dabbirRenderTruth==='function') window.__dabbirRenderTruth();
      toast(lang==='ar'?'تعذر الاتصال؛ حاول مرة أخرى':'Connection failed; try again');
    }
  }

  async function fastSendMessage(){
    const input=document.querySelector('#composer');
    const btn=document.querySelector('#sendBtn');
    const text=(input?.value||'').trim();
    const conversation=selectedConversation();
    if(!input||!btn||!text||!selectedConversationId||!conversation||dabbirSending) return;

    dabbirSending=true;
    btn.disabled=true;
    input.value='';

    try{
      if(String(conversation.channel_type||'').toLowerCase()==='whatsapp'){
        await sendApprovedWhatsAppReply({text,conversation});
      }else{
        await sendWebConversation({text});
      }
    }finally{
      dabbirSending=false;
      btn.disabled=false;
      input.focus();
    }
  }

  const sendBtn=document.querySelector('#sendBtn');
  if(sendBtn) sendBtn.onclick=fastSendMessage;
  const composer=document.querySelector('#composer');
  if(composer){
    composer.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();fastSendMessage()}
    },true);
  }
  window.dabbirFastSendMessage=fastSendMessage;
})();
</script>`;

const truthVisibilityUi = String.raw`
<style>
.dabbirTruthBadge{display:inline-flex;align-items:center;gap:6px;margin-inline-start:8px;padding:4px 8px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.04);font-size:10px;font-weight:700;letter-spacing:.01em;color:#bfc5cf;vertical-align:middle;white-space:nowrap}
.dabbirTruthBadge[data-state="verified"]{color:#bfe7cf;border-color:rgba(137,214,170,.22);background:rgba(137,214,170,.07)}
.dabbirTruthBadge[data-state="unverified"]{color:#f0cf9a;border-color:rgba(240,207,154,.20);background:rgba(240,207,154,.06)}
.dabbirTruthBadge .dot{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
@media(max-width:700px){.dabbirTruthBadge{font-size:9px;padding:3px 7px;margin-inline-start:5px}}
</style>
<script>
(()=>{
  function exactTime(value){
    if(!value) return '';
    try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value))}catch{return ''}
  }

  function renderTruth(){
    const anchor=document.querySelector('#workspaceState');
    if(!anchor) return;
    let badge=document.querySelector('#dabbirTruthBadge');
    if(!badge){
      badge=document.createElement('span');
      badge.id='dabbirTruthBadge';
      badge.className='dabbirTruthBadge';
      badge.innerHTML='<span class="dot"></span><span class="label"></span>';
      anchor.insertAdjacentElement('afterend',badge);
    }
    const data=workspace?.data_truth;
    const action=workspace?.last_action_truth;
    const verified=data?.state==='VERIFIED_TENANT_READ';
    const actionUnverified=action&&action.state!=='VERIFIED';
    const state=actionUnverified?'unverified':(verified?'verified':'unverified');
    badge.dataset.state=state;
    const label=badge.querySelector('.label');
    if(label){
      if(actionUnverified) label.textContent=lang==='ar'?'آخر إجراء يحتاج تحقق':'Last action needs verification';
      else if(verified) label.textContent=lang==='ar'?'بيانات موثقة':'Verified data';
      else label.textContent=lang==='ar'?'حالة البيانات غير مؤكدة':'Data status unverified';
    }
    const readAt=exactTime(data?.read_at);
    badge.title=verified
      ? (lang==='ar'?'المصدر: بيانات النشاط المعزولة • آخر قراءة '+(readAt||'الآن'):'Source: isolated tenant data • last read '+(readAt||'now'))
      : (lang==='ar'?'لا يوجد دليل قراءة موثقة لهذه الحالة':'No verified read evidence is available for this state');
  }

  const baseRenderAllTruth=renderAll;
  renderAll=function(){baseRenderAllTruth();renderTruth()};
  window.__dabbirRenderTruth=renderTruth;
  setTimeout(renderTruth,0);
})();
</script>`;

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replaceAll('/api/dabbir-runtime', '/api/dabbir-runtime-fast');
  html = html.replace("const {r,j}=await api('/api/dabbir-runtime-fast');if(r.status===401)", "const {r,j}=await api('/api/dabbir-runtime-fast?summary=1');if(r.status===401)");
  html = html.replace('</body>', `${interfacePerformanceUi}\n${conversationPerformanceUi}\n${truthVisibilityUi}\n</body>`);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-dabbir-interface', 'operational-runtime-v2-truth');
  res.setHeader('x-dabbir-chat-path', 'chat-send-truth-v4-whatsapp-reserve-v2');
  res.setHeader('x-dabbir-performance', 'interface-fast-v4-truth');
  return res.status(200).send(html);
}
