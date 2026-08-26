const script=String.raw`(()=>{
  if(window.__dabbirActivityProfile)return;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  let state=null,loading=false,lastBusiness=null;
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    operational:'تشغيلي',activityTasks:'مهام خاصة بهذا النشاط',activityDesc:'دَبِّر يغيّر الأولويات والوحدات حسب نوع نشاطك، وليس بنفس القالب لكل الأعمال.',pending:'مطلوبة',progress:'قيد التنفيذ',done:'مكتملة',complete:'تم',reopen:'إعادة فتح',priority:'الأولوية',followups:'المتابعات',handoffs:'التدخل البشري',loading:'جارٍ تحميل مهام النشاط…',empty:'لا توجد مهام نشاط مفتوحة.',customersDesc:'السجلات المرتبطة بهذا النوع من النشاط.',appointmentsDesc:'المواعيد والجدول التشغيلي لهذا النشاط.',tasksDesc:'المهام التشغيلية الخاصة بنوع نشاطك، إضافة إلى المتابعات والتدخلات البشرية.',dashboardDesc:'لوحة تشغيل مخصصة لهذا النوع من النشاط من بياناتك الفعلية.'
  }:{
    operational:'Operational',activityTasks:'Activity-specific tasks',activityDesc:'DABBIR changes priorities and modules by business type instead of using one template for every business.',pending:'Pending',progress:'In progress',done:'Done',complete:'Done',reopen:'Reopen',priority:'Priority',followups:'Follow-ups',handoffs:'Human intervention',loading:'Loading activity tasks…',empty:'No open activity tasks.',customersDesc:'Records relevant to this business type.',appointmentsDesc:'The operational schedule for this business type.',tasksDesc:'Operational tasks for this business type, plus follow-ups and human handoffs.',dashboardDesc:'An operations dashboard tailored to this business type using live data.'
  };

  const style=document.createElement('style');
  style.textContent='.activityIdentity{display:flex;align-items:center;gap:8px;margin:8px 0 0}.activityPill{display:inline-flex;align-items:center;border:1px solid #3a4330;background:#172016;color:var(--accent);padding:5px 9px;border-radius:999px;font-size:9px;font-weight:900}.activityTaskCard{margin-bottom:12px}.activityTaskGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.activityTask{border:1px solid #292f34;background:#15181b;border-radius:14px;padding:11px;display:flex;gap:10px;align-items:flex-start}.activityTask .grow{flex:1;min-width:0}.activityTask b{display:block;font-size:11px;line-height:1.5}.activityTask small{display:block;color:var(--muted);font-size:8px;margin-top:4px}.activityTask button{min-height:34px;padding:6px 9px}.activityDone{opacity:.58}.activityPriority{font-size:8px;color:var(--yellow);font-weight:900}@media(max-width:700px){.activityTaskGrid{grid-template-columns:1fr}}';
  document.head.append(style);

  function businessId(){return workspace?.business?.id||null}
  function setText(selector,value){const el=q(selector);if(el&&value!==undefined&&value!==null)el.textContent=value}
  function setLabel(screen,value){qa('[data-screen="'+screen+'"] [data-label], [data-screen="'+screen+'"] span').forEach(el=>{if(value)el.textContent=value})}

  function ensureTaskCard(){
    const screen=q('#screen-tasks');if(!screen)return null;
    let card=q('#activityTaskCard');if(card)return card;
    card=document.createElement('section');card.id='activityTaskCard';card.className='card activityTaskCard';
    const grid=screen.querySelector('.grid2');screen.insertBefore(card,grid||screen.firstChild);
    return card;
  }

  function applyProfile(){
    if(!state?.profile||!workspace?.business)return;
    const p=state.profile,t=copy();
    document.body.dataset.dabbirActivity=state.business_type;
    const activityName=ar()?p.name_ar:p.name_en;
    const customerLabel=ar()?p.customer_ar:p.customer_en;
    const appointmentLabel=ar()?p.appointments_ar:p.appointments_en;
    const taskLabel=ar()?p.tasks_ar:p.tasks_en;
    const dashboardLabel=ar()?p.dashboard_ar:p.dashboard_en;

    setText('#workspaceState',activityName+' • '+t.operational);
    setText('#dashTitle',dashboardLabel);
    setText('#dashDesc',t.dashboardDesc);
    setText('#tasksTitle',taskLabel);
    setText('#tasksDesc',t.tasksDesc);
    setText('#custTitle',customerLabel);
    setText('#custDesc',t.customersDesc);
    setText('#handoffTitle',t.handoffs);
    setText('#followupsTitle',t.followups);
    setLabel('customers',customerLabel);
    setLabel('tasks',taskLabel);

    qa('[data-screen="appointments"]').forEach(el=>{el.style.display=p.show_appointments?'':'none'});
    if(p.show_appointments){
      setLabel('appointments',appointmentLabel);
      setText('#apptTitle',appointmentLabel);
      setText('#apptDesc',t.appointmentsDesc);
      if(q('#newApptBtn'))q('#newApptBtn').textContent=ar()?('إضافة '+appointmentLabel):('Add '+appointmentLabel.toLowerCase());
    }else if(current==='appointments'&&typeof showScreen==='function')showScreen('dashboard');

    let identity=q('#activityIdentity');
    if(!identity&&q('#screen-dashboard .hero>div')){
      identity=document.createElement('div');identity.id='activityIdentity';identity.className='activityIdentity';
      q('#screen-dashboard .hero>div').append(identity);
    }
    if(identity)identity.innerHTML='<span class="activityPill">'+esc(activityName)+'</span>';
    renderTasks();
  }

  function renderTasks(){
    const card=ensureTaskCard();if(!card)return;
    const t=copy();
    if(loading&&!state){card.innerHTML='<div class="empty">'+esc(t.loading)+'</div>';return}
    if(!state){card.innerHTML='';return}
    const tasks=(state.tasks||[]).filter(x=>x.status!=='dismissed');
    const open=tasks.filter(x=>x.status!=='done');
    const done=tasks.filter(x=>x.status==='done');
    const rows=(open.length?open:done.slice(0,4));
    card.innerHTML='<div class="sectionHead"><div><h2>'+esc(t.activityTasks)+'</h2><small class="muted">'+esc(t.activityDesc)+'</small></div></div>'+(rows.length?'<div class="activityTaskGrid">'+rows.map(task=>{
      const title=ar()?task.title_ar:task.title_en;
      const status=task.status==='in_progress'?t.progress:task.status==='done'?t.done:t.pending;
      const button=state.can_manage?'<button class="secondary" data-activity-task="'+esc(task.id)+'" data-next="'+(task.status==='done'?'pending':'done')+'">'+esc(task.status==='done'?t.reopen:t.complete)+'</button>':'';
      return '<div class="activityTask '+(task.status==='done'?'activityDone':'')+'"><div class="grow"><b>'+esc(title)+'</b><small>'+esc(task.category)+' · '+esc(status)+'</small><span class="activityPriority">'+esc(t.priority)+' '+esc(task.priority)+'</span></div>'+button+'</div>';
    }).join('')+'</div>':'<div class="empty">'+esc(t.empty)+'</div>');
    card.querySelectorAll('[data-activity-task]').forEach(btn=>btn.onclick=()=>setTask(btn.dataset.activityTask,btn.dataset.next));
  }

  async function setTask(taskId,status){
    const id=businessId();if(!id)return;
    try{
      const response=await fetch('/api/activity-tasks',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({business_id:id,task_id:taskId,status})});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'TASK_UPDATE_FAILED');
      const task=state.tasks.find(x=>x.id===taskId);if(task)task.status=status;renderTasks();
    }catch(error){try{toast(ar()?'تعذر تحديث المهمة':'Could not update task')}catch{}}
  }

  async function load(force=false){
    const id=businessId();if(!id||loading)return;
    if(!force&&lastBusiness===id&&state)return applyProfile();
    loading=true;renderTasks();
    try{
      const response=await fetch('/api/activity-tasks?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok)throw new Error(body?.error||'ACTIVITY_PROFILE_FAILED');
      state=body;lastBusiness=id;applyProfile();
    }catch(error){console.error('dabbir_activity_profile_failed',String(error?.message||error).slice(0,120))}
    finally{loading=false;renderTasks()}
  }

  const observer=new MutationObserver(()=>{if(workspace?.business?.id){applyProfile();load(false)}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);setTimeout(applyProfile,0);return result};
  setInterval(()=>{if(workspace?.business?.id&&workspace.business.id!==lastBusiness)load(true)},1200);
  setTimeout(()=>load(false),500);
  window.__dabbirActivityProfile={refresh:()=>load(true),version:'activity-profile-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-activity-profile-ui','v1');
  return res.status(200).send(script);
}
