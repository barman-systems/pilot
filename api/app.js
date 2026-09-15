import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);

// Phase 2 stabilization: this is the remaining inline runtime/performance authority.
// Business/activity navigation is owned by the authoritative owner journey and activity modules,
// not by an additional legacy businessAdaptive wrapper in this response transformer.
const interfacePerformanceUi = String.raw`

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

const truthVisibilityUi = String.raw`

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
  html = html.replace('</body>', `${interfacePerformanceUi}\n${truthVisibilityUi}\n</body>`);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  // The shell is identical for every visitor; private workspace data arrives via no-store API calls.
  // Cache at Vercel's edge, not in the browser, to remove a cold Lambda from repeat visits.
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.setHeader('x-dabbir-interface', 'operational-runtime-v2-truth');
  res.setHeader('x-dabbir-chat-path', 'channel-aware-composer-authority-v1');
  res.setHeader('x-dabbir-performance', 'interface-fast-v4-truth');
  return res.status(200).send(html);
}