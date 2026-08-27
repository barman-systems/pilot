const script=String.raw`(()=>{
  if(window.__dabbirPlatformCustomerSupportUi)return;
  window.__dabbirPlatformCustomerSupportUi=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const copy=()=>ar()?{
    title:'الدعم الداخلي',desc:'قضايا وملاحظات الدعم الخاصة بهذا العميل. هذه البيانات لا تظهر للعميل.',open:'مفتوحة',waiting:'انتظار',resolved:'محلولة',total:'الإجمالي',
    newCase:'فتح قضية دعم',subject:'الموضوع',subjectPh:'وصف مختصر للمشكلة',category:'التصنيف',priority:'الأولوية',business:'النشاط',allAccount:'الحساب بالكامل',note:'ملاحظة داخلية',notePh:'ما الذي حدث؟ وما الإجراء التالي؟',create:'إنشاء القضية',
    cases:'قضايا الدعم',noCases:'لا توجد قضايا دعم لهذا العميل.',addNote:'إضافة ملاحظة',saveNote:'حفظ الملاحظة',markWaiting:'بانتظار متابعة',resolve:'إغلاق كمحلولة',reopen:'إعادة فتح',
    timeline:'سجل إدارة الحساب',noTimeline:'لا توجد إجراءات إدارية مسجلة.',loading:'جارٍ تحميل الدعم...',failed:'تعذر تحميل سجل الدعم.',saved:'تم تحديث سجل الدعم.',
    categories:{general:'عام',access:'الوصول',billing:'الفوترة',data:'البيانات',recovery:'الاسترجاع',whatsapp:'واتساب',integration:'الربط',bug:'خلل تقني',abuse:'إساءة استخدام',privacy:'الخصوصية',other:'أخرى'},
    priorities:{low:'منخفضة',normal:'عادية',high:'عالية',urgent:'عاجلة'},statuses:{open:'مفتوحة',waiting:'انتظار',resolved:'محلولة'}
  }:{
    title:'Internal support',desc:'Support cases and internal notes for this customer. Customers cannot see this data.',open:'Open',waiting:'Waiting',resolved:'Resolved',total:'Total',
    newCase:'Open support case',subject:'Subject',subjectPh:'Short description of the issue',category:'Category',priority:'Priority',business:'Business',allAccount:'Whole account',note:'Internal note',notePh:'What happened and what is the next action?',create:'Create case',
    cases:'Support cases',noCases:'No support cases for this customer.',addNote:'Add note',saveNote:'Save note',markWaiting:'Mark waiting',resolve:'Resolve',reopen:'Reopen',
    timeline:'Account administration timeline',noTimeline:'No administration events recorded.',loading:'Loading support...',failed:'Support history could not load.',saved:'Support history updated.',
    categories:{general:'General',access:'Access',billing:'Billing',data:'Data',recovery:'Recovery',whatsapp:'WhatsApp',integration:'Integration',bug:'Bug',abuse:'Abuse',privacy:'Privacy',other:'Other'},
    priorities:{low:'Low',normal:'Normal',high:'High',urgent:'Urgent'},statuses:{open:'Open',waiting:'Waiting',resolved:'Resolved'}
  };
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const api=async(url,options={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return{r,j}};
  const style=document.createElement('style');
  style.dataset.dabbirCustomerSupport='v1';
  style.textContent='.pcsCard{border:1px solid var(--line);background:#111417;border-radius:18px;padding:15px;margin-top:14px}.pcsHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.pcsHead h3{margin:0}.pcsHead p{margin:4px 0 0;color:var(--muted);font-size:10px}.pcsMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.pcsMetric{background:#171a1e;border:1px solid var(--line);border-radius:12px;padding:9px}.pcsMetric span{display:block;color:var(--muted);font-size:8px}.pcsMetric b{font-size:18px}.pcsForm{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}.pcsForm input,.pcsForm select,.pcsNote{width:100%;border:1px solid var(--line);background:#0f1215;color:#fff;border-radius:10px;padding:9px;min-height:42px}.pcsNote{margin-top:8px;min-height:74px;resize:vertical}.pcsCase{border:1px solid var(--line);border-radius:14px;padding:11px;margin-top:9px;background:#15181b}.pcsMeta{color:var(--muted);font-size:9px}.pcsNotes{margin-top:8px}.pcsNoteItem{border-inline-start:2px solid var(--line);padding:6px 9px;margin-top:5px;font-size:10px}.pcsTimeline{border-top:1px solid var(--line);padding:8px 0;font-size:10px}.pcsActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pcsActions button{min-height:36px}.pcsSectionTitle{margin:15px 0 7px;font-size:12px}.pcsBadge{display:inline-flex;border-radius:99px;padding:4px 7px;font-size:8px;font-weight:900;background:#20252a}.pcsUrgent{background:#3b1717;color:#ffaaaa}.pcsHigh{background:#3c2a14;color:#ffd28c}.pcsResolved{background:#14331e;color:#8ce6a1}@media(max-width:760px){.pcsForm{grid-template-columns:1fr 1fr}.pcsMetrics{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(style);

  function customerNo(){for(const n of qa('#pcBody .pcCode')){const v=String(n.textContent||'').trim().toUpperCase();if(/^DAB-[0-9]{6,}$/.test(v))return v}return null}
  function businessOptions(){const seen=new Set(),out=[];for(const n of qa('#pcBody [data-pc-time]')){const id=String(n.getAttribute('data-pc-time')||'');if(!id||seen.has(id))continue;seen.add(id);const name=n.closest('.pcBiz')?.querySelector('b')?.textContent?.trim()||id;out.push({id,name})}return out}
  function eventLabel(action){const map=ar()?{customer_detail:'فتح بيانات الحساب',account_access_changed:'تغيير وصول الحساب',support_case_created:'فتح قضية دعم',support_note_added:'إضافة ملاحظة دعم',support_case_status_changed:'تغيير حالة قضية',recovery_case_opened:'فتح حالة استرجاع',recovery_applied:'تنفيذ استرجاع'}:{customer_detail:'Account opened',account_access_changed:'Account access changed',support_case_created:'Support case opened',support_note_added:'Support note added',support_case_status_changed:'Support case status changed',recovery_case_opened:'Recovery case opened',recovery_applied:'Recovery applied'};return map[action]||String(action||'—').replaceAll('_',' ')}
  function badgeCase(c,t){const cls=c.status==='resolved'?' pcsResolved':c.priority==='urgent'?' pcsUrgent':c.priority==='high'?' pcsHigh':'';return '<span class="pcsBadge'+cls+'">'+esc(t.statuses[c.status]||c.status)+' · '+esc(t.priorities[c.priority]||c.priority)+'</span>'}

  async function load(panel,no){
    panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(copy().title)+'</h3><p>'+esc(copy().loading)+'</p></div></div>';
    const {r,j}=await api('/api/platform-customer-support?customer_no='+encodeURIComponent(no));
    if(!r.ok){panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(copy().title)+'</h3><p>'+esc(copy().failed)+'</p></div></div>';return}
    render(panel,no,j.support||{});
  }
  function render(panel,no,data){
    const t=copy(),m=data.metrics||{},cases=Array.isArray(data.cases)?data.cases:[],timeline=Array.isArray(data.timeline)?data.timeline:[],biz=businessOptions();
    const catOptions=Object.entries(t.categories).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const priOptions=Object.entries(t.priorities).map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
    const bizOptions='<option value="">'+esc(t.allAccount)+'</option>'+biz.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');
    const casesHtml=cases.length?cases.map(c=>'<div class="pcsCase" data-pcs-case="'+esc(c.id)+'"><div class="pcsHead"><div><b>'+esc(c.subject)+'</b><div class="pcsMeta">'+esc(t.categories[c.category]||c.category)+' · '+esc(fmt(c.created_at))+'</div></div>'+badgeCase(c,t)+'</div><div class="pcsNotes">'+((c.notes||[]).map(n=>'<div class="pcsNoteItem">'+esc(n.note)+'<div class="pcsMeta">'+esc(fmt(n.created_at))+'</div></div>').join('')||'')+'</div><textarea class="pcsNote" data-pcs-note-input="'+esc(c.id)+'" placeholder="'+esc(t.addNote)+'"></textarea><div class="pcsActions"><button class="secondary" data-pcs-add-note="'+esc(c.id)+'">'+esc(t.saveNote)+'</button>'+(c.status!=='waiting'?'<button class="secondary" data-pcs-status="waiting" data-pcs-id="'+esc(c.id)+'">'+esc(t.markWaiting)+'</button>':'')+(c.status!=='resolved'?'<button class="primary" data-pcs-status="resolved" data-pcs-id="'+esc(c.id)+'">'+esc(t.resolve)+'</button>':'<button class="secondary" data-pcs-status="open" data-pcs-id="'+esc(c.id)+'">'+esc(t.reopen)+'</button>')+'</div></div>').join(''):'<div class="pcsMeta">'+esc(t.noCases)+'</div>';
    const timelineHtml=timeline.length?timeline.slice(0,20).map(e=>'<div class="pcsTimeline"><b>'+esc(eventLabel(e.action))+'</b><div class="pcsMeta">'+esc(fmt(e.created_at))+'</div></div>').join(''):'<div class="pcsMeta">'+esc(t.noTimeline)+'</div>';
    panel.innerHTML='<div class="pcsHead"><div><h3>'+esc(t.title)+'</h3><p>'+esc(t.desc)+'</p></div><span class="pcCode">'+esc(no)+'</span></div><div class="pcsMetrics"><div class="pcsMetric"><span>'+esc(t.open)+'</span><b>'+Number(m.open||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.waiting)+'</span><b>'+Number(m.waiting||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.resolved)+'</span><b>'+Number(m.resolved||0)+'</b></div><div class="pcsMetric"><span>'+esc(t.total)+'</span><b>'+Number(m.total||0)+'</b></div></div><div class="pcsSectionTitle">'+esc(t.newCase)+'</div><div class="pcsForm"><input id="pcsSubject" maxlength="200" placeholder="'+esc(t.subjectPh)+'"><select id="pcsCategory">'+catOptions+'</select><select id="pcsPriority">'+priOptions+'</select><select id="pcsBusiness">'+bizOptions+'</select></div><textarea id="pcsInitialNote" class="pcsNote" maxlength="4000" placeholder="'+esc(t.notePh)+'"></textarea><div class="pcsActions"><button class="primary" id="pcsCreate">'+esc(t.create)+'</button></div><div class="pcsSectionTitle">'+esc(t.cases)+'</div>'+casesHtml+'<div class="pcsSectionTitle">'+esc(t.timeline)+'</div>'+timelineHtml;
    q('#pcsCreate')?.addEventListener('click',async()=>{const subject=String(q('#pcsSubject')?.value||'').trim();if(subject.length<3)return;const body={action:'create_case',customer_no:no,business_id:q('#pcsBusiness')?.value||null,category:q('#pcsCategory')?.value||'general',priority:q('#pcsPriority')?.value||'normal',subject,note:String(q('#pcsInitialNote')?.value||'').trim()};const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify(body)});if(r.ok){notify(t.saved);await load(panel,no)}});
    qa('[data-pcs-add-note]').forEach(b=>b.onclick=async()=>{const id=b.dataset.pcsAddNote,input=q('[data-pcs-note-input="'+CSS.escape(id)+'"]'),note=String(input?.value||'').trim();if(note.length<2)return;const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify({action:'add_note',customer_no:no,case_id:id,note})});if(r.ok){notify(t.saved);await load(panel,no)}});
    qa('[data-pcs-status]').forEach(b=>b.onclick=async()=>{const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify({action:'set_status',customer_no:no,case_id:b.dataset.pcsId,status:b.dataset.pcsStatus})});if(r.ok){notify(t.saved);await load(panel,no)}});
  }

  let mounting=false,lastNo='';
  async function mount(){
    const no=customerNo(),body=q('#pcBody');
    if(!no||!body)return;
    const existing=q('#pcSupport360');
    if(existing&&existing.dataset.customerNo===no)return;
    if(mounting)return;
    mounting=true;lastNo=no;
    existing?.remove();
    const panel=document.createElement('section');panel.id='pcSupport360';panel.className='pcsCard';panel.dataset.customerNo=no;body.appendChild(panel);
    await load(panel,no);mounting=false;
  }
  const observer=new MutationObserver(()=>{const no=customerNo();if(no&&no!==lastNo)lastNo='';mount()});
  observer.observe(document.body,{childList:true,subtree:true});
  setInterval(mount,1800);mount();
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed')}
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-platform-customer-support-ui','v1');
  return res.end(script);
}
