const script=String.raw`(()=>{
  if(window.__dabbirActivityTaskNavigation)return;
  window.__dabbirActivityTaskNavigation=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const categoryOf=card=>String(card?.querySelector('small')?.textContent||'').split('·')[0].trim().toLowerCase();
  const routeFor=category=>{
    if(['catalog','product','products','inventory','stock','orders','order','sales'].includes(category))return 'operations';
    if(['policy','policies','settings','configuration','permissions'].includes(category))return 'settings';
    if(['customer','customers','crm'].includes(category))return 'customers';
    if(['appointment','appointments','booking','calendar','schedule'].includes(category))return 'appointments';
    if(['conversation','conversations','message','messages','inquiry','inquiries','whatsapp'].includes(category))return 'conversations';
    return null;
  };

  let detailEpoch=0,detailScope='',returnFocus=null;
  const scope=()=>{try{return workspace.business.id+'|'+(workspace.branch_scope?.branch_id||workspace.branch_scope?.mode||'')}catch{return ''}};
  const label=(ar,en)=>document.documentElement.lang==='en'?en:ar;
  function closeTask(discard=false){
    detailEpoch++;q('#dabbirTaskDetail')?.remove();returnFocus?.focus?.();
    if(history.state?.dabbirTaskDetail){if(discard){const state={...history.state};delete state.dabbirTaskDetail;delete state.dabbirRecord;history.replaceState(state,'')}else history.back()}
  }
  async function openTask(card){
    const id=card?.dataset?.taskRecord;if(!id)return;
    const captured=scope(),business=captured.split('|')[0],epoch=++detailEpoch;
    try{
      const response=await fetch('/api/activity-tasks?'+new URLSearchParams({business_id:business,task_id:id}),{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();if(epoch!==detailEpoch||scope()!==captured)return;
      if(!response.ok||!data.ok)throw Error(response.status===404?label('المهمة غير متاحة','Task unavailable'):label('تعذر فتح المهمة','Could not open task'));
      const task=data.tasks?.[0];if(task?.id!==id||data.business_id!==business)throw Error(label('تعذر التحقق من المهمة','Could not verify task'));
      if(!q('#dabbirTaskDetail'))returnFocus=document.activeElement;q('#dabbirTaskDetail')?.remove();detailScope=captured;
      const overlay=document.createElement('div');overlay.id='dabbirTaskDetail';overlay.className='modal open';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','dabbirTaskDetailTitle');
      const box=document.createElement('div');box.className='modalBox';
      const title=document.createElement('h3');title.id='dabbirTaskDetailTitle';title.textContent=label(task.title_ar,task.title_en);box.append(title);
      const status=document.createElement('p');status.textContent=({pending:label('قيد الانتظار','Pending'),in_progress:label('قيد التنفيذ','In progress'),done:label('مكتملة','Done'),dismissed:label('مستبعدة','Dismissed')})[task.status]||task.status;box.append(status);
      const actions=document.createElement('div');actions.className='modalActions';
      const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent=label('رجوع','Back');back.onclick=()=>closeTask();actions.append(back);
      const destination=task.metadata?.module;
      const destinations=['appointments','operations','conversations','customers','tasks','settings'];
      const model=window.__dabbirActivityExperience?.model?.(workspace,document.documentElement.lang==='en'?'en':'ar');
      if(destinations.includes(destination)&&model?.allowed(destination)&&typeof showScreen==='function'){
        const linked=document.createElement('button');linked.type='button';linked.className='secondary';linked.textContent=label('فتح قسم العمل: ','Open work section: ')+model.label(destination);linked.onclick=()=>{if(scope()!==captured){closeTask(true);return}closeTask(true);showScreen(destination)};actions.append(linked);
      }
      if(data.can_manage){const save=document.createElement('button');save.type='button';save.className='primary';save.textContent=task.status==='done'?label('إعادة فتح المهمة','Reopen task'):label('إكمال المهمة','Complete task');actions.append(save);save.onclick=async()=>{
        if(scope()!==captured){closeTask(true);return}save.disabled=true;
        try{const response=await fetch('/api/activity-tasks',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:business,task_id:id,status:task.status==='done'?'pending':'done'})});const result=await response.json();if(scope()!==captured||epoch!==detailEpoch)return;if(!response.ok||!result.ok)throw Error();await openTask(card);await window.__dabbirActivityProfile?.refresh?.()}catch{if(scope()===captured&&epoch===detailEpoch){status.textContent=label('تعذر حفظ التغيير. حاول مجددًا.','Could not save. Try again.');save.disabled=false}}
      }}
      box.append(actions);overlay.append(box);document.body.append(overlay);const entry={...history.state,dabbirTaskDetail:true,dabbirRecord:{type:'task',id,businessId:business,branch:captured.split('|')[1]}};if(!history.state?.dabbirTaskDetail)history.pushState(entry,'');else history.replaceState(entry,'');back.focus();
    }catch(error){if(epoch===detailEpoch&&scope()===captured&&typeof toast==='function')toast(error.message)}
  }
  window.addEventListener('popstate',()=>{if(q('#dabbirTaskDetail'))closeTask()});
  window.__dabbirTaskRecord={openRecord:id=>openTask({dataset:{taskRecord:id}})};
  document.addEventListener('keydown',e=>{const modal=q('#dabbirTaskDetail');if(!modal)return;if(e.key==='Escape'){e.preventDefault();closeTask()}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
  window.__dabbirUiLifecycle?.on?.('afterRender','task-detail-scope',()=>{if(q('#dabbirTaskDetail')&&scope()!==detailScope)closeTask(true)});

  const decorate=()=>{
    qa('#activityTaskCard .activityTask').forEach(card=>{
      const route=routeFor(categoryOf(card));
      if(!card.dataset.taskRecord){card.removeAttribute('data-dabbir-task-route');card.removeAttribute('role');card.removeAttribute('tabindex');return}
      card.dataset.dabbirTaskRoute=route||'tasks';
      card.setAttribute('role','link');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',String(card.querySelector('b')?.textContent||'').trim());
    });
  };

  const style=document.createElement('style');
  style.dataset.dabbirActivityTaskNavigation='v1';
  style.textContent='#dabbirTaskDetail .modalBox{max-height:85dvh;overflow:auto;padding-bottom:calc(20px + env(safe-area-inset-bottom))}#dabbirTaskDetail button{min-height:44px}.activityTask[data-dabbir-task-route]{cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.activityTask[data-dabbir-task-route]:hover{border-color:#40515f;background:#192027}.activityTask[data-dabbir-task-route]:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.activityTask[data-dabbir-task-route]:active{transform:scale(.995)}.dabbirTaskTarget{outline:2px solid var(--accent)!important;outline-offset:3px!important;transition:outline-color .2s ease}';
  document.head.append(style);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(card)openTask(card);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(!card)return;
    event.preventDefault();
    openTask(card);
  });

  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(document.body,{subtree:true,childList:true});
  decorate();
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-activity-task-navigation','v1');
  return res.status(200).send(script);
}
