const script=String.raw`(()=>{
  if(window.__dabbirCustomerSupportUi)return;
  window.__dabbirCustomerSupportUi=true;

  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(v))}catch{return String(v)}};
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const api=async(url,options={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return{r,j}};

  let businessId=null;
  let state=null;
  let loading=false;
  let contacts={};
  let lastLoadedAt=0;

  const copy=()=>ar()?{
    nav:'الدعم',title:'دعم DABBIR',desc:'تواصل مع فريق دبّر من نفس المكان. كل طلب يحصل على رقم متابعة وسجل واضح حتى الحل.',
    newTicket:'طلب دعم جديد',subject:'الموضوع',subjectPh:'مثال: واتساب متوقف عن استقبال الرسائل',message:'اشرح المشكلة',messagePh:'اكتب ما حدث والنتيجة التي توقعتها. لا ترسل كلمات مرور أو مفاتيح سرية.',category:'نوع المشكلة',priority:'الأولوية',send:'إرسال الطلب',sending:'جارٍ الإرسال…',
    myTickets:'طلبات الدعم',noTickets:'لا توجد طلبات دعم لهذا النشاط.',open:'مفتوحة',waiting:'بانتظار ردك',resolved:'تم الحل',total:'الإجمالي',reply:'إضافة رد',replyPh:'أضف معلومة أو تحديثًا…',sendReply:'إرسال الرد',reopens:'إرسال رد على طلب محلول يعيد فتحه تلقائيًا.',
    supportTeam:'فريق دعم دبّر',customer:'أنت',reference:'رقم الطلب',updated:'آخر تحديث',created:'تاريخ الفتح',officialChannels:'قنوات الدعم الرسمية',inAppPrimary:'مركز الدعم داخل دبّر هو القناة الرئيسية والموثقة.',email:'البريد الإلكتروني',whatsapp:'واتساب الدعم',requestCall:'طلب اتصال من الدعم',refresh:'تحديث',
    createdOk:'تم إنشاء طلب الدعم.',replyOk:'تم إرسال ردك.',failed:'تعذر تحميل الدعم الآن.',sendFailed:'تعذر إرسال الطلب. حاول مرة أخرى.',required:'اكتب موضوعًا ووصفًا واضحين.',urgentHint:'استخدم «عاجلة» فقط عند توقف قناة أساسية أو تعطل تشغيل النشاط.',
    statuses:{open:'مفتوحة',waiting:'بانتظار ردك',resolved:'تم الحل'},priorities:{normal:'عادية',high:'مرتفعة',urgent:'عاجلة'},
    categories:{general:'عام',access:'الدخول والحساب',billing:'الفوترة',data:'البيانات',recovery:'الاسترجاع',whatsapp:'واتساب',integration:'التكاملات',bug:'خلل تقني',privacy:'الخصوصية',other:'أخرى'}
  }:{
    nav:'Support',title:'DABBIR Support',desc:'Contact the DABBIR team in one place. Every request gets a tracking reference and a clear history through resolution.',
    newTicket:'New support request',subject:'Subject',subjectPh:'Example: WhatsApp stopped receiving messages',message:'Describe the issue',messagePh:'Explain what happened and what you expected. Do not send passwords or secret keys.',category:'Issue type',priority:'Priority',send:'Send request',sending:'Sending…',
    myTickets:'Support requests',noTickets:'No support requests for this business.',open:'Open',waiting:'Waiting for you',resolved:'Resolved',total:'Total',reply:'Add reply',replyPh:'Add information or an update…',sendReply:'Send reply',reopens:'Replying to a resolved request automatically reopens it.',
    supportTeam:'DABBIR Support',customer:'You',reference:'Reference',updated:'Last updated',created:'Opened',officialChannels:'Official support channels',inAppPrimary:'The in-app support center is the primary verified support channel.',email:'Email',whatsapp:'Support WhatsApp',requestCall:'Request a support call',refresh:'Refresh',
    createdOk:'Support request created.',replyOk:'Your reply was sent.',failed:'Support is temporarily unavailable.',sendFailed:'Could not send the request. Try again.',required:'Enter a clear subject and description.',urgentHint:'Use Urgent only when a core channel or business operation is stopped.',
    statuses:{open:'Open',waiting:'Waiting for you',resolved:'Resolved'},priorities:{normal:'Normal',high:'High',urgent:'Urgent'},
    categories:{general:'General',access:'Account & access',billing:'Billing',data:'Data',recovery:'Recovery',whatsapp:'WhatsApp',integration:'Integrations',bug:'Technical issue',privacy:'Privacy',other:'Other'}
  };



  function currentBusiness(){return String(window.workspace?.business?.id||'').trim()}
  function currentScreen(){try{return String(typeof current==='undefined'?'':current||'')}catch{return ''}}

  function ensure(){
    if(q('#screen-support'))return q('#screen-support');
    const content=q('.content');if(!content)return null;
    const screen=document.createElement('section');screen.className='screen';screen.id='screen-support';
    screen.innerHTML='<div class="hero dshHero"><div><h1 id="dshTitle"></h1><p id="dshDesc"></p></div><button class="secondary" id="dshRefresh">↻</button></div><div id="dshBody"></div>';
    content.appendChild(screen);
    const nav=q('#nav');
    if(nav&&!q('#nav [data-screen="support"]')){
      const button=document.createElement('button');button.className='navBtn';button.dataset.screen='support';button.innerHTML='? <span id="dshNav"></span>';button.onclick=()=>{if(typeof showScreen==='function')showScreen('support');load(true)};nav.appendChild(button);
    }
    if(!q('#dshFab')){
      const fab=document.createElement('button');fab.id='dshFab';fab.className='dshFab';fab.type='button';fab.setAttribute('aria-label','Support');fab.textContent='?';fab.onclick=()=>{if(typeof showScreen==='function')showScreen('support');load(true)};document.body.appendChild(fab);
    }
    q('#dshRefresh')?.addEventListener('click',()=>load(true));
    applyLabels();return screen;
  }

  function applyLabels(){
    const t=copy();
    if(q('#dshTitle'))q('#dshTitle').textContent=t.title;
    if(q('#dshDesc'))q('#dshDesc').textContent=t.desc;
    if(q('#dshNav'))q('#dshNav').textContent=t.nav;
    if(q('#dshRefresh'))q('#dshRefresh').title=t.refresh;
    if(currentScreen()==='support'&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    if(state)render();
  }

  function contactHtml(t){
    const items=[];
    if(contacts?.whatsapp_url)items.push('<div class="dshContact"><b>'+esc(t.whatsapp)+'</b><small>'+esc('+'+contacts.whatsapp)+'</small><a class="secondary" href="'+esc(contacts.whatsapp_url)+'" target="_blank" rel="noopener noreferrer">'+esc(t.whatsapp)+'</a></div>');
    if(contacts?.email)items.push('<div class="dshContact"><b>'+esc(t.email)+'</b><small>'+esc(contacts.email)+'</small><a class="secondary" href="mailto:'+esc(contacts.email)+'">'+esc(t.email)+'</a></div>');
    return '<div class="dshCard" data-ui-part="customer-support-ui-detail-1"><div class="dshTitle">'+esc(t.officialChannels)+'</div><div class="dshHint">'+esc(t.inAppPrimary)+'</div>'+(items.length?'<div class="dshContacts">'+items.join('')+'</div>':'')+'<div class="dshActions"><button class="secondary" id="dshRequestCall">'+esc(t.requestCall)+'</button></div></div>';
  }

  function ticketHtml(item,t){
    const status=String(item.status||'open');
    const priority=String(item.priority||'normal');
    const badgeClass=(status==='waiting'?' waiting':status==='resolved'?' resolved':'')+(priority==='urgent'?' urgent':'');
    const messages=Array.isArray(item.messages)?item.messages:[];
    const thread=messages.map(m=>'<div class="dshMsg '+(m.author_kind==='customer'?'customer':'support')+'"><b>'+esc(m.author_kind==='customer'?t.customer:t.supportTeam)+'</b>'+esc(m.body)+'<small>'+esc(fmt(m.created_at))+'</small></div>').join('');
    return '<article class="dshTicket" data-dsh-ticket="'+esc(item.id)+'"><div class="dshTicketHead"><div><span class="dshRef">'+esc(item.reference||'—')+'</span><b data-ui-part="customer-support-ui-detail-2">'+esc(item.subject)+'</b><div class="dshMeta">'+esc(t.categories[item.category]||item.category||'—')+' · '+esc(t.priorities[priority]||priority)+'<br>'+esc(t.created)+': '+esc(fmt(item.created_at))+' · '+esc(t.updated)+': '+esc(fmt(item.updated_at))+'</div></div><span class="dshBadge'+badgeClass+'">'+esc(t.statuses[status]||status)+'</span></div><div class="dshThread">'+thread+'</div><div class="dshReply"><textarea class="dshText" data-dsh-reply-input="'+esc(item.id)+'" maxlength="4000" placeholder="'+esc(t.replyPh)+'"></textarea><button class="secondary" data-dsh-reply="'+esc(item.id)+'">'+esc(t.sendReply)+'</button></div>'+(status==='resolved'?'<div class="dshHint">'+esc(t.reopens)+'</div>':'')+'</article>';
  }

  function render(){
    const body=q('#dshBody');if(!body||!state)return;
    const t=copy(),m=state.metrics||{},cases=Array.isArray(state.cases)?state.cases:[];
    const cats=Object.entries(t.categories).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const pris=Object.entries(t.priorities).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const tickets=cases.length?cases.map(item=>ticketHtml(item,t)).join(''):'<div class="dshEmpty">'+esc(t.noTickets)+'</div>';
    body.innerHTML='<div class="dshMetrics"><div class="dshMetric"><span>'+esc(t.open)+'</span><b>'+Number(m.open||0)+'</b></div><div class="dshMetric"><span>'+esc(t.waiting)+'</span><b>'+Number(m.waiting||0)+'</b></div><div class="dshMetric"><span>'+esc(t.resolved)+'</span><b>'+Number(m.resolved||0)+'</b></div><div class="dshMetric"><span>'+esc(t.total)+'</span><b>'+Number(m.total||0)+'</b></div></div><div class="dshGrid"><div><div class="dshCard"><div class="dshTitle">'+esc(t.newTicket)+'</div><div class="dshForm"><label><span>'+esc(t.category)+'</span><select id="dshCategory">'+cats+'</select></label><label><span>'+esc(t.priority)+'</span><select id="dshPriority">'+pris+'</select></label></div><label class="dshLabel" data-ui-part="customer-support-ui-detail-3">'+esc(t.subject)+'</label><input id="dshSubject" maxlength="200" placeholder="'+esc(t.subjectPh)+'"><label class="dshLabel" data-ui-part="customer-support-ui-detail-4">'+esc(t.message)+'</label><textarea id="dshMessage" class="dshText" maxlength="4000" placeholder="'+esc(t.messagePh)+'"></textarea><div class="dshHint">'+esc(t.urgentHint)+'</div><div class="dshActions"><button class="primary" id="dshCreate">'+esc(t.send)+'</button></div></div>'+contactHtml(t)+'</div><div class="dshCard"><div class="dshTitle">'+esc(t.myTickets)+'</div>'+tickets+'</div></div>';
    q('#dshCreate')?.addEventListener('click',createTicket);
    q('#dshRequestCall')?.addEventListener('click',()=>{q('#dshCategory').value='general';q('#dshPriority').value='normal';q('#dshSubject').value=t.requestCall;q('#dshMessage').focus();q('#dshSubject').scrollIntoView({behavior:'smooth',block:'center'})});
    qa('[data-dsh-reply]').forEach(button=>button.onclick=()=>reply(button.dataset.dshReply));
  }

  async function load(force=false){
    ensure();
    const id=currentBusiness();
    if(!id)return;
    if(loading)return;
    if(!force&&businessId===id&&state&&Date.now()-lastLoadedAt<20000)return;
    businessId=id;loading=true;
    const body=q('#dshBody');if(body)body.innerHTML='<div class="dshEmpty">…</div>';
    try{
      const {r,j}=await api('/api/customer-support?business_id='+encodeURIComponent(id));
      if(!r.ok)throw new Error(j?.error||'LOAD_FAILED');
      state=j.support||{metrics:{},cases:[]};contacts=j.contacts||{};lastLoadedAt=Date.now();render();
    }catch{if(body)body.innerHTML='<div class="dshEmpty">'+esc(copy().failed)+'</div>'}
    finally{loading=false}
  }

  async function createTicket(){
    const t=copy(),subject=String(q('#dshSubject')?.value||'').trim(),message=String(q('#dshMessage')?.value||'').trim();
    if(subject.length<3||message.length<2)return notify(t.required);
    const button=q('#dshCreate');if(button?.disabled)return;if(button){button.disabled=true;button.textContent=t.sending}
    try{
      const payload={action:'create',business_id:currentBusiness(),category:q('#dshCategory')?.value||'general',priority:q('#dshPriority')?.value||'normal',subject,message,context:{screen:currentScreen(),pathname:location.pathname}};
      const {r}=await api('/api/customer-support',{method:'POST',body:JSON.stringify(payload)});
      if(!r.ok)throw new Error('CREATE_FAILED');
      notify(t.createdOk);state=null;await load(true);
    }catch{notify(t.sendFailed)}finally{if(button){button.disabled=false;button.textContent=t.send}}
  }

  async function reply(caseId){
    const input=q('[data-dsh-reply-input="'+CSS.escape(String(caseId))+'"]'),message=String(input?.value||'').trim(),t=copy();if(message.length<2)return;
    const button=q('[data-dsh-reply="'+CSS.escape(String(caseId))+'"]');if(button?.disabled)return;if(button)button.disabled=true;
    try{
      const {r}=await api('/api/customer-support',{method:'POST',body:JSON.stringify({action:'reply',case_id:caseId,message})});
      if(!r.ok)throw new Error('REPLY_FAILED');notify(t.replyOk);state=null;await load(true);
    }catch{notify(t.sendFailed)}finally{if(button)button.disabled=false}
  }

  function reconcile(){ensure();const id=currentBusiness();if(id&&id!==businessId){state=null;businessId=null;load(true)}applyLabels()}
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){lifecycle.on('afterRender','customer-support',reconcile);lifecycle.on('afterNavigate','customer-support',payload=>{if(payload?.target==='support')load();});lifecycle.on('afterLanguage','customer-support',applyLabels)}
  else setInterval(reconcile,1800);
  setTimeout(reconcile,350);
  window.__dabbirCustomerSupport={version:'v1',open:()=>{ensure();if(typeof showScreen==='function')showScreen('support');return load(true)},refresh:()=>load(true)};
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed')}
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-support-ui','v1');
  return res.end(script);
}
