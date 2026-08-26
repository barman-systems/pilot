import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);
const settingsNav = '<button class="navBtn" data-screen="settings">⚙ <span data-label="settings"></span></button>';
const teamNav = '<a class="navBtn" data-pilot-team-nav="true" href="/team.html" style="text-decoration:none">♟ <span data-label="team"></span></a>';
const legacyTeamLink = '<div class="sideFoot"><a class="secondary" href="/team.html" style="display:block;text-align:center;text-decoration:none" id="teamLink"></a></div>';
const settingsBottom = '<button data-screen="settings">⚙<br><span data-label="settings"></span></button>';
const teamBottom = '<a data-pilot-team-mobile="true" href="/team.html" style="border:0;background:transparent;color:#9298a1;font-size:8px;border-radius:10px;text-align:center;text-decoration:none;display:flex;flex-direction:column;align-items:center;justify-content:center">♟<br><span data-label="team"></span></a>';
const legacyTeamLanguageWrite = "$('#teamLink').textContent=t.team;";
const safeTeamLanguageWrite = "$('#teamLink')&&($('#teamLink').textContent=t.team);";

const businessAdaptiveUi = String.raw`
<style>
@media(max-width:700px){.bottomNav.pilot-store-nav{grid-template-columns:repeat(5,1fr)!important}}
</style>
<script>
(()=>{
  function applyBusinessProfile(){
    if(!workspace?.business) return;
    const isStore=String(workspace.business.business_type||'').toLowerCase()==='store';
    document.body.classList.toggle('pilot-store',isStore);
    if(!isStore) return;

    document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display='none'});
    document.querySelector('#bottomNav')?.classList.add('pilot-store-nav');

    if(current==='appointments') showScreen('dashboard');

    const cards=document.querySelectorAll('#dashCards .card.metric');
    if(cards[1]){
      const label=cards[1].querySelector('span');
      const value=cards[1].querySelector('strong');
      if(label) label.textContent=lang==='ar'?'المتابعات':'Follow-ups';
      if(value) value.textContent=String((workspace.followups||[]).length);
    }

    const state=document.querySelector('#workspaceState');
    if(state) state.textContent=lang==='ar'?'متجر • تشغيلي':'Store • Operational';
  }

  const baseRenderAll=renderAll;
  renderAll=function(){
    baseRenderAll();
    applyBusinessProfile();
  };
  setTimeout(applyBusinessProfile,0);
})();
</script>`;

const conversationPerformanceUi = String.raw`
<style>
#sendBtn:disabled{opacity:.6;cursor:wait}
.msgrow[data-pilot-pending="true"] .bubble{opacity:.72}
.msgrow[data-pilot-typing="true"] .bubble{min-width:52px;text-align:center;animation:pilotPulse 1s ease-in-out infinite}
@keyframes pilotPulse{0%,100%{opacity:.45}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.msgrow[data-pilot-typing="true"] .bubble{animation:none}}
</style>
<script>
(()=>{
  let pilotSending=false;

  function renderFastMessages(){
    renderMessages();
    const list=document.querySelector('#messages');
    if(!list) return;
    list.querySelectorAll('.msgrow').forEach(row=>{
      const body=row.querySelector('.bubble .body');
      if(!body) return;
      if(body.textContent==='PILOT_TYPING'){
        row.dataset.pilotTyping='true';
        body.textContent='…';
      }
    });
  }

  async function fastSendMessage(){
    const input=document.querySelector('#composer');
    const btn=document.querySelector('#sendBtn');
    const text=(input?.value||'').trim();
    if(!input||!btn||!text||!selectedConversationId||pilotSending) return;

    pilotSending=true;
    btn.disabled=true;
    input.value='';

    const stamp=Date.now();
    const tempId='pilot-local-'+stamp;
    const typingId='pilot-typing-'+stamp;
    const now=new Date().toISOString();
    const baseMessages=Array.isArray(workspace?.messages)?workspace.messages:[];
    workspace.messages=baseMessages.concat([
      {id:tempId,conversation_id:selectedConversationId,sender_type:'customer',body:text,intent:'PENDING',simulated:false,created_at:now},
      {id:typingId,conversation_id:selectedConversationId,sender_type:'ai',body:'PILOT_TYPING',intent:'PENDING',simulated:false,created_at:now}
    ]);
    renderFastMessages();

    try{
      const result=await api('/api/pilot-runtime',{
        method:'POST',
        body:JSON.stringify({action:'send_message',business_id:workspace.business.id,conversation_id:selectedConversationId,message:text})
      });
      const r=result.r,j=result.j||{};

      workspace.messages=(workspace.messages||[]).filter(m=>m.id!==tempId&&m.id!==typingId);

      if(!r.ok||!j.ok){
        toast(j.error||T().sendFailed);
        await loadRuntime(workspace.business.id,selectedConversationId);
        return;
      }

      if(j.customer_message) workspace.messages.push(j.customer_message);
      if(j.ai_message) workspace.messages.push(j.ai_message);
      const conversation=(workspace.conversations||[]).find(c=>c.id===selectedConversationId);
      if(conversation) conversation.state='waiting_customer';
      translations.clear();
      translationMode=false;
      renderMessages();
      renderDashboard();
      renderAnalytics();
    }catch{
      workspace.messages=(workspace.messages||[]).filter(m=>m.id!==typingId);
      toast(T().sendFailed);
      await loadRuntime(workspace.business.id,selectedConversationId);
    }finally{
      pilotSending=false;
      btn.disabled=false;
      input.focus();
    }
  }

  const sendBtn=document.querySelector('#sendBtn');
  if(sendBtn) sendBtn.onclick=fastSendMessage;
  const composer=document.querySelector('#composer');
  if(composer){
    composer.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey){
        event.preventDefault();
        event.stopImmediatePropagation();
        fastSendMessage();
      }
    },true);
  }
  window.pilotFastSendMessage=fastSendMessage;
})();
</script>`;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Keep employee management discoverable in primary navigation on desktop and mobile.
  // Invitation, membership and RLS behavior are unchanged.
  if (!html.includes('data-pilot-team-nav="true"') && html.includes(settingsNav)) {
    html = html.replace(settingsNav, `${teamNav}\n    ${settingsNav}`);
  }
  if (!html.includes('data-pilot-team-mobile="true"') && html.includes(settingsBottom)) {
    html = html.replace(settingsBottom, `${teamBottom}${settingsBottom}`);
    html = html.replace('grid-template-columns:repeat(5,1fr);bottom:0', 'grid-template-columns:repeat(6,1fr);bottom:0');
  }
  html = html.replace(legacyTeamLanguageWrite, safeTeamLanguageWrite);
  html = html.replace(legacyTeamLink, '');
  html = html.replace('</body>', `${businessAdaptiveUi}\n${conversationPerformanceUi}\n</body>`);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-pilot-interface', 'operational-runtime-v1');
  return res.status(200).send(html);
}
