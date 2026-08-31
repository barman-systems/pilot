const script=String.raw`(()=>{
  if(window.__dabbirAppointmentManagementUi)return;
  window.__dabbirAppointmentManagementUi=true;
  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const ws=()=>{try{return typeof workspace!=='undefined'?workspace:null}catch{return null}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{
    title:'إدارة الحجوزات',desc:'يمكنك تعديل موعد العميل أو حذفه. أي تغيير يُحفظ في دبّر ويُزامن مع التقويم المرتبط.',
    customer:'العميل',time:'الموعد',status:'الحالة',edit:'تعديل',del:'حذف',save:'حفظ التعديل',cancel:'إلغاء',
    editTitle:'تعديل الموعد',deleteTitle:'حذف الموعد؟',deleteBody:'سيتم حذف الموعد من دبّر ومن التقويمات المرتبطة إن وُجدت.',
    requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',
    saved:'تم تعديل الموعد.',deleted:'تم حذف الموعد.',deletePending:'تم إلغاء الموعد، لكن حذف التقويم الخارجي يحتاج إعادة مزامنة.',
    failed:'تعذر إكمال العملية.',past:'لا يمكن تعديل موعد مضى وقته.',empty:'لا توجد حجوزات لإدارتها.'
  }:{
    title:'Manage bookings',desc:'Edit or delete a customer booking. Changes are saved in DABBIR and synced to connected calendars.',
    customer:'Customer',time:'Booking',status:'Status',edit:'Edit',del:'Delete',save:'Save changes',cancel:'Cancel',
    editTitle:'Edit booking',deleteTitle:'Delete booking?',deleteBody:'The booking will be removed from DABBIR and connected calendars when available.',
    requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',
    saved:'Booking updated.',deleted:'Booking deleted.',deletePending:'Booking was cancelled, but the external calendar delete still needs reconciliation.',
    failed:'Could not complete the action.',past:'Past bookings cannot be rescheduled.',empty:'No bookings to manage.'
  };

  const style=document.createElement('style');
  style.textContent='.dabbirApptManage{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-top:12px}.dabbirApptManageHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.dabbirApptManageHead h3{font-size:13px;margin:0 0 4px}.dabbirApptManageHead p{font-size:9px;color:var(--muted);margin:0;line-height:1.55}.dabbirApptManageList{display:grid;gap:7px}.dabbirApptManageRow{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(135px,1fr) 90px auto;gap:8px;align-items:center;border:1px solid #292f34;background:#15181b;border-radius:11px;padding:9px}.dabbirApptManageRow b{font-size:10px}.dabbirApptManageRow span{font-size:9px;color:var(--muted)}.dabbirApptManageActions{display:flex;gap:6px;justify-content:flex-end}.dabbirApptManageActions button{min-height:34px;border-radius:9px;padding:6px 9px;font-size:9px;font-weight:850}.dabbirApptEdit{border:1px solid #414d2a;background:#252c1d;color:#fff}.dabbirApptDelete{border:1px solid #5b2b2b;background:#32191a;color:#ffb9b9}.dabbirApptEdit:disabled{opacity:.45}.dabbirApptEmpty{border:1px dashed #31363c;border-radius:11px;padding:16px;text-align:center;color:var(--muted);font-size:9px}.dabbirApptModal{position:fixed;inset:0;z-index:90;background:#000b;display:none;align-items:center;justify-content:center;padding:18px}.dabbirApptModal.open{display:flex}.dabbirApptModalBox{width:min(430px,100%);background:#131518;border:1px solid #343940;border-radius:18px;padding:16px}.dabbirApptModalBox h3{margin:0 0 10px;font-size:14px}.dabbirApptField{display:grid;gap:5px;margin-top:9px}.dabbirApptField label{font-size:9px;color:var(--muted)}.dabbirApptField input,.dabbirApptField select{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:9px;min-height:42px}.dabbirApptModalActions{display:flex;gap:7px;justify-content:flex-end;margin-top:13px}.dabbirApptModalActions button{border-radius:10px;padding:8px 11px;font-weight:850}.dabbirApptModalActions .save{border:0;background:var(--accent);color:#10130b}.dabbirApptModalActions .cancel{border:1px solid var(--line);background:#181b1f;color:#fff}@media(max-width:700px){.dabbirApptManageRow{grid-template-columns:1fr}.dabbirApptManageActions{justify-content:stretch}.dabbirApptManageActions button{flex:1}.dabbirApptManageHead{display:block}}';
  document.head.append(style);

  let signature='',editingId=null,busy=false;
  function customerName(id){
    const row=(ws()?.customers||[]).find(x=>x.id===id);
    return row?.display_name||(ar()?'عميل':'Customer');
  }
  function fmt(value){
    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value||'')}
  }
  function statusLabel(status){
    const c=copy(),s=String(status||'requested').toLowerCase();
    return c[s]||s;
  }
  function dubaiLocalMinute(date=new Date()){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function isoFromDubaiLocal(value){
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return null;
    const d=new Date(raw+':00+04:00');
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  function ensurePanel(){
    const screen=q('#screen-appointments');if(!screen)return null;
    let panel=q('#dabbirApptManage');
    if(panel)return panel;
    panel=document.createElement('section');panel.id='dabbirApptManage';panel.className='dabbirApptManage';
    const table=q('#appointmentsTable');
    if(table?.parentNode)table.parentNode.insertBefore(panel,table);
    else screen.append(panel);
    return panel;
  }
  function ensureModal(){
    let modal=q('#dabbirApptEditModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='dabbirApptEditModal';modal.className='dabbirApptModal';
    document.body.append(modal);return modal;
  }
  function render(){
    const w=ws();if(!w?.business)return;
    const panel=ensurePanel();if(!panel)return;
    const rows=[...(w.appointments||[])].filter(a=>a?.id&&a?.starts_at).sort((a,b)=>{
      const an=new Date(a.starts_at).getTime(),bn=new Date(b.starts_at).getTime(),now=Date.now();
      const af=an>=now,bf=bn>=now;if(af!==bf)return af?-1:1;return af?an-bn:bn-an;
    });
    const nextSig=(ar()?'ar':'en')+'|'+rows.map(a=>[a.id,a.starts_at,a.status].join(':')).join('|');
    if(nextSig===signature&&panel.dataset.ready==='1')return;
    signature=nextSig;panel.dataset.ready='1';
    const c=copy();
    panel.innerHTML='<div class="dabbirApptManageHead"><div><h3>'+esc(c.title)+'</h3><p>'+esc(c.desc)+'</p></div></div><div class="dabbirApptManageList">'+(rows.length?rows.map(a=>{
      const future=new Date(a.starts_at).getTime()>=Date.now();
      return '<div class="dabbirApptManageRow" data-appt-row="'+esc(a.id)+'"><b>'+esc(customerName(a.customer_id))+'</b><span>'+esc(fmt(a.starts_at))+'</span><span>'+esc(statusLabel(a.status))+'</span><div class="dabbirApptManageActions"><button type="button" class="dabbirApptEdit" data-appt-edit="'+esc(a.id)+'" '+(future?'':'disabled title="'+esc(c.past)+'"')+'>'+esc(c.edit)+'</button><button type="button" class="dabbirApptDelete" data-appt-delete="'+esc(a.id)+'">'+esc(c.del)+'</button></div></div>';
    }).join(''):'<div class="dabbirApptEmpty">'+esc(c.empty)+'</div>')+'</div>';
    panel.querySelectorAll('[data-appt-edit]').forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.apptEdit));
    panel.querySelectorAll('[data-appt-delete]').forEach(btn=>btn.onclick=()=>removeAppointment(btn.dataset.apptDelete));
  }
  function openEdit(id){
    const w=ws(),a=(w?.appointments||[]).find(x=>x.id===id);if(!a)return;
    if(new Date(a.starts_at).getTime()<Date.now()){try{toast(copy().past)}catch{};return}
    editingId=id;const c=copy(),modal=ensureModal();
    modal.innerHTML='<form class="dabbirApptModalBox" id="dabbirApptEditForm"><h3>'+esc(c.editTitle)+'</h3><div class="dabbirApptField"><label>'+esc(c.customer)+'</label><input value="'+esc(customerName(a.customer_id))+'" disabled></div><div class="dabbirApptField"><label>'+esc(c.time)+'</label><input id="dabbirApptEditTime" type="datetime-local" min="'+esc(dubaiLocalMinute(new Date(Date.now()+60000)))+'" value="'+esc(dubaiLocalMinute(new Date(a.starts_at)))+'" required></div><div class="dabbirApptField"><label>'+esc(c.status)+'</label><select id="dabbirApptEditStatus"><option value="requested" '+(a.status==='requested'?'selected':'')+'>'+esc(c.requested)+'</option><option value="confirmed" '+(a.status==='confirmed'?'selected':'')+'>'+esc(c.confirmed)+'</option><option value="rescheduled" '+(a.status==='rescheduled'?'selected':'')+'>'+esc(c.rescheduled)+'</option><option value="completed" '+(a.status==='completed'?'selected':'')+'>'+esc(c.completed)+'</option><option value="cancelled" '+(a.status==='cancelled'?'selected':'')+'>'+esc(c.cancelled)+'</option></select></div><div class="dabbirApptModalActions"><button type="button" class="cancel" id="dabbirApptEditCancel">'+esc(c.cancel)+'</button><button type="submit" class="save">'+esc(c.save)+'</button></div></form>';
    q('#dabbirApptEditCancel').onclick=closeModal;
    q('#dabbirApptEditForm').onsubmit=saveEdit;
    modal.onclick=e=>{if(e.target===modal)closeModal()};
    modal.classList.add('open');setTimeout(()=>q('#dabbirApptEditTime')?.focus(),0);
  }
  function closeModal(){const modal=q('#dabbirApptEditModal');modal?.classList.remove('open');editingId=null}
  async function request(body){
    const response=await fetch('/api/appointment-management',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));return {response,data};
  }
  async function refresh(){
    const w=ws();if(!w?.business?.id)return;
    signature='';
    try{if(typeof loadRuntime==='function')await loadRuntime(w.business.id,typeof selectedConversationId!=='undefined'?selectedConversationId:null)}catch{}
    render();
    try{window.__dabbirCalendarLiveUi?.refreshBusy?.()}catch{}
  }
  async function saveEdit(event){
    event.preventDefault();if(busy||!editingId)return;
    const w=ws(),start=isoFromDubaiLocal(q('#dabbirApptEditTime')?.value),status=q('#dabbirApptEditStatus')?.value;
    if(!w?.business?.id||!start)return;
    if(new Date(start).getTime()<Date.now()){try{toast(copy().past)}catch{};return}
    busy=true;const submit=event.submitter;if(submit)submit.disabled=true;
    try{
      const {response,data}=await request({action:'update',business_id:w.business.id,appointment_id:editingId,starts_at:start,status});
      if(!response.ok||!data.ok)throw new Error(data.error||copy().failed);
      closeModal();try{toast(copy().saved)}catch{};await refresh();
    }catch(error){try{toast(copy().failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false;if(submit)submit.disabled=false}
  }
  async function removeAppointment(id){
    if(busy)return;const w=ws();if(!w?.business?.id)return;const c=copy();
    const confirmed=window.__dabbirConfirm?await window.__dabbirConfirm({title:c.deleteTitle,body:c.deleteBody}):window.confirm(c.deleteTitle+'\n'+c.deleteBody);
    if(!confirmed)return;
    busy=true;
    try{
      const {response,data}=await request({action:'delete',business_id:w.business.id,appointment_id:id});
      if(response.ok&&data.ok){try{toast(c.deleted)}catch{};await refresh();return}
      if(data.state==='CANCELLED_PENDING_EXTERNAL_DELETE'){try{toast(c.deletePending)}catch{};await refresh();return}
      throw new Error(data.error||c.failed);
    }catch(error){try{toast(c.failed+' '+String(error?.message||''))}catch{}}
    finally{busy=false}
  }

  const observer=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(q('#screen-appointments')?.classList.contains('active'))render()},1500);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#dabbirApptEditModal.open'))closeModal()});
  setTimeout(render,500);
  window.__dabbirAppointmentManagement={render,version:'appointment-management-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-appointment-management-ui','v1');
  return res.status(200).send(script);
}
