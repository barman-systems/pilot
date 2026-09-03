const script=String.raw`(()=>{
  if(window.__dabbirCarWashBookingEditFix)return;
  window.__dabbirCarWashBookingEditFix=true;
  const q=s=>document.querySelector(s);
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=()=>ar()?{title:'تعديل الحجز',customer:'العميل',time:'الموعد',status:'الحالة',save:'حفظ التعديل',cancel:'إلغاء',requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',saved:'تم تعديل الحجز.',failed:'تعذر تعديل الحجز.'}:{title:'Edit booking',customer:'Customer',time:'Booking',status:'Status',save:'Save changes',cancel:'Cancel',requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',saved:'Booking updated.',failed:'Could not update booking.'};
  let busy=false;

  function dubaiLocalMinute(value){
    const date=value instanceof Date?value:new Date(value);
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
  }
  function isoFromDubaiLocal(value){
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))return null;
    const date=new Date(raw+':00+04:00');
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }
  function customerName(id){
    const customer=(workspaceNow()?.customers||[]).find(row=>row?.id===id);
    return customer?.display_name||(ar()?'عميل':'Customer');
  }
  function appointment(id){return (workspaceNow()?.appointments||[]).find(row=>row?.id===id)||null}
  function isHistorical(row){const time=new Date(row?.starts_at||0).getTime();return Number.isFinite(time)&&time<Date.now()}

  function ensureStyle(){
    if(q('#dabbirCarWashPastEditStyle'))return;
    const style=document.createElement('style');style.id='dabbirCarWashPastEditStyle';
    style.textContent='#dabbirCarWashPastEditModal{position:fixed;inset:0;z-index:140;background:#000c;display:none;align-items:center;justify-content:center;padding:18px}#dabbirCarWashPastEditModal.open{display:flex}.dabbirCarWashPastEditBox{width:min(430px,100%);background:#131922;border:1px solid #34445b;border-radius:18px;padding:16px;color:#fff}.dabbirCarWashPastEditBox h3{margin:0 0 12px;font-size:18px}.dabbirCarWashPastEditField{display:grid;gap:6px;margin-top:10px}.dabbirCarWashPastEditField label{font-size:12px;color:#9eacc0}.dabbirCarWashPastEditField input,.dabbirCarWashPastEditField select{width:100%;min-height:46px;border:1px solid #34445b;border-radius:11px;background:#182233;color:#fff;padding:10px;font:inherit}.dabbirCarWashPastEditActions{display:flex;gap:8px;margin-top:14px}.dabbirCarWashPastEditActions button{flex:1;min-height:44px;border-radius:11px;font-weight:800}.dabbirCarWashPastEditCancel{border:1px solid #34445b;background:#182233;color:#fff}.dabbirCarWashPastEditSave{border:0;background:#4f7cff;color:#fff}.dabbirCarWashPastEditSave:disabled{opacity:.5}';
    document.head.append(style);
  }
  function ensureModal(){
    ensureStyle();let modal=q('#dabbirCarWashPastEditModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='dabbirCarWashPastEditModal';document.body.append(modal);return modal;
  }
  function close(){q('#dabbirCarWashPastEditModal')?.classList.remove('open')}
  function toast(message){try{if(typeof window.toast==='function')window.toast(message)}catch{}}

  function openEditor(id){
    if(!isCarWash())return;
    const row=appointment(id),w=workspaceNow();if(!row||!w?.business?.id)return;
    const c=copy(),modal=ensureModal(),status=String(row.status||'requested').toLowerCase();
    modal.innerHTML='<form class="dabbirCarWashPastEditBox" id="dabbirCarWashPastEditForm"><h3>'+esc(c.title)+'</h3><div class="dabbirCarWashPastEditField"><label>'+esc(c.customer)+'</label><input value="'+esc(customerName(row.customer_id))+'" disabled></div><div class="dabbirCarWashPastEditField"><label>'+esc(c.time)+'</label><input id="dabbirCarWashPastEditTime" type="datetime-local" value="'+esc(dubaiLocalMinute(row.starts_at))+'" required></div><div class="dabbirCarWashPastEditField"><label>'+esc(c.status)+'</label><select id="dabbirCarWashPastEditStatus"><option value="requested" '+(status==='requested'?'selected':'')+'>'+esc(c.requested)+'</option><option value="confirmed" '+(status==='confirmed'?'selected':'')+'>'+esc(c.confirmed)+'</option><option value="rescheduled" '+(status==='rescheduled'?'selected':'')+'>'+esc(c.rescheduled)+'</option><option value="completed" '+(status==='completed'?'selected':'')+'>'+esc(c.completed)+'</option><option value="cancelled" '+(status==='cancelled'?'selected':'')+'>'+esc(c.cancelled)+'</option></select></div><div class="dabbirCarWashPastEditActions"><button type="button" class="dabbirCarWashPastEditCancel" id="dabbirCarWashPastEditCancel">'+esc(c.cancel)+'</button><button type="submit" class="dabbirCarWashPastEditSave">'+esc(c.save)+'</button></div></form>';
    q('#dabbirCarWashPastEditCancel').onclick=close;
    modal.onclick=event=>{if(event.target===modal)close()};
    q('#dabbirCarWashPastEditForm').onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const start=isoFromDubaiLocal(q('#dabbirCarWashPastEditTime')?.value),nextStatus=q('#dabbirCarWashPastEditStatus')?.value;
      if(!start)return;
      busy=true;const submit=event.submitter;if(submit)submit.disabled=true;
      try{
        const response=await fetch('/api/appointment-management',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({action:'update',business_id:w.business.id,appointment_id:id,starts_at:start,status:nextStatus})});
        const data=await response.json().catch(()=>({}));if(!response.ok||!data?.ok)throw new Error(data?.detail||data?.error||'APPOINTMENT_UPDATE_FAILED');
        close();toast(c.saved);setTimeout(()=>location.reload(),180);
      }catch(error){toast(c.failed+' '+String(error?.message||''))}
      finally{busy=false;if(submit)submit.disabled=false}
    };
    modal.classList.add('open');setTimeout(()=>q('#dabbirCarWashPastEditTime')?.focus(),0);
  }

  function repairButtons(){
    if(!isCarWash())return;
    document.querySelectorAll('#dabbirApptManage [data-appt-edit][disabled]').forEach(button=>{
      button.disabled=false;button.removeAttribute('title');button.dataset.dabbirHistoricalEdit='1';
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-appt-edit][data-dabbir-historical-edit="1"],[data-calendar-appt]');if(!button||!isCarWash())return;
    const id=button.dataset.apptEdit||button.dataset.calendarAppt,row=appointment(id);
    if(!row||!isHistorical(row))return;
    event.preventDefault();event.stopImmediatePropagation();openEditor(id);
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
  const observer=new MutationObserver(repairButtons);observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('focus',repairButtons,{passive:true});
  setTimeout(repairButtons,0);setTimeout(repairButtons,700);
  window.__dabbirCarWashBookingEdit={repairButtons,openEditor,version:'car-wash-booking-edit-v2-historical-calendar'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-car-wash-booking-edit-ui','v2-historical-calendar');
  return res.status(200).send(script);
}
