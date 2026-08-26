const css=String.raw`
.svcHero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.svcHero h1{margin:0 0 5px;font-size:25px}.svcHero p{margin:0;color:var(--muted);font-size:11px;line-height:1.7}.svcTruth{border:1px solid #314132;background:#152019;border-radius:13px;padding:10px 12px;margin-bottom:10px;color:#bfe8c7;font-size:9px}.svcMetrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:11px}.svcMetric{border:1px solid var(--line);background:#111315;border-radius:14px;padding:12px}.svcMetric span{display:block;color:var(--muted);font-size:9px}.svcMetric strong{display:block;font-size:22px;margin-top:5px}.svcTable{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#111315}.svcRow{display:grid;grid-template-columns:minmax(150px,1fr) .55fr .55fr auto;gap:9px;align-items:center;padding:11px;border-bottom:1px solid #24282d;font-size:10px}.svcRow:last-child{border-bottom:0}.svcRow.head{background:#15181b;color:var(--muted);font-size:9px}.svcName b{display:block;font-size:11px}.svcName small{color:var(--muted);font-size:8px}.svcStatus{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900}.svcStatus.on{background:#14331e;color:var(--green)}.svcStatus.off{background:#2b2d31;color:#aab0b7}.svcAction{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:10px;padding:7px 9px;min-height:38px;font-size:9px;font-weight:800}.svcEmpty{padding:22px;text-align:center;color:var(--muted);font-size:10px}.svcNavMark{color:var(--accent)}@media(max-width:700px){.svcHero{align-items:center}.svcHero h1{font-size:20px}.svcRow{grid-template-columns:minmax(120px,1fr) .6fr auto}.svcRow .svcStateCol{display:none}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirServiceOperations)return;
  const style=document.createElement('style');
  style.dataset.dabbirServices='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);

  const q=s=>document.querySelector(s);
  const ar=()=>document.documentElement.lang!=='en';
  const isServiceBusiness=()=>String(workspace?.business?.business_type||'').toLowerCase()!=='store';
  let data=null;
  let loading=false;
  let editingId=null;

  const copy=()=>ar()?{
    nav:'الخدمات',title:'الخدمات',desc:'الخدمات الفعلية التي يقدمها نشاطك. دَبِّر يستخدم الخدمات النشطة عند الرد على العملاء.',truth:'الخدمات النشطة هنا تُعامل كمعلومة تشغيلية حية لدى AI.',add:'إضافة خدمة',name:'اسم الخدمة',duration:'المدة',minutes:'دقيقة',status:'الحالة',active:'نشطة',inactive:'متوقفة',edit:'تعديل',save:'حفظ',cancel:'إلغاء',empty:'لا توجد خدمات بعد.',loading:'جارٍ تحميل الخدمات…',failed:'تعذر تحميل الخدمات.',created:'تمت إضافة الخدمة.',updated:'تم تحديث الخدمة.',activeMetric:'الخدمات النشطة',totalMetric:'إجمالي الخدمات'
  }:{
    nav:'Services',title:'Services',desc:'The real services your business provides. DABBIR uses active services when replying to customers.',truth:'Active services here are treated as live operational facts by AI.',add:'Add service',name:'Service name',duration:'Duration',minutes:'min',status:'Status',active:'Active',inactive:'Inactive',edit:'Edit',save:'Save',cancel:'Cancel',empty:'No services yet.',loading:'Loading services…',failed:'Could not load services.',created:'Service added.',updated:'Service updated.',activeMetric:'Active services',totalMetric:'Total services'
  };

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function notify(message){try{if(typeof toast==='function')toast(message)}catch{}}

  function ensureNav(){
    if(!isServiceBusiness())return;
    const nav=q('#nav');
    if(!nav||q('#dabbirServicesNav'))return;
    const button=document.createElement('button');
    button.id='dabbirServicesNav';
    button.className='navBtn';
    button.dataset.screen='operations';
    button.innerHTML='<span class="svcNavMark">◇</span> <span id="dabbirServicesNavText"></span>';
    button.addEventListener('click',()=>{if(typeof showScreen==='function')showScreen('operations');load(false)});
    const integrations=nav.querySelector('[data-screen="integrations"]');
    nav.insertBefore(button,integrations||null);
  }

  function ensureScreen(){
    if(!isServiceBusiness())return null;
    let screen=q('#screen-operations');
    if(!screen){
      screen=document.createElement('section');
      screen.id='screen-operations';
      screen.className='screen';
      q('.content')?.append(screen);
    }
    if(!q('#dabbirServicesRoot')){
      screen.innerHTML='<div id="dabbirServicesRoot"><div class="svcHero"><div><h1 id="svcTitle"></h1><p id="svcDesc"></p></div><button id="svcAdd" class="primary" type="button"></button></div><div id="svcTruth" class="svcTruth"></div><div id="svcBody"></div></div>';
    }
    return screen;
  }

  function ensureModal(){
    if(q('#svcModal'))return;
    const modal=document.createElement('div');
    modal.id='svcModal';modal.className='modal';
    modal.innerHTML='<form id="svcForm" class="modalBox"><h3 id="svcModalTitle"></h3><div class="field"><label id="svcNameLabel"></label><input id="svcName" maxlength="160" required></div><div class="field"><label id="svcDurationLabel"></label><input id="svcDuration" type="number" min="1" max="1440" step="1" required></div><div class="field" id="svcActiveField"><label id="svcActiveLabel"></label><select id="svcActive"><option value="true"></option><option value="false"></option></select></div><div class="modalActions"><button id="svcCancel" type="button" class="secondary"></button><button id="svcSave" type="submit" class="primary"></button></div></form>';
    document.body.append(modal);
    q('#svcCancel').onclick=()=>modal.classList.remove('open');
    modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')});
    q('#svcForm').onsubmit=saveService;
  }

  function applyCopy(){
    if(!isServiceBusiness())return;
    ensureNav();ensureScreen();ensureModal();
    const t=copy();
    if(q('#dabbirServicesNavText'))q('#dabbirServicesNavText').textContent=t.nav;
    if(q('#svcTitle'))q('#svcTitle').textContent=t.title;
    if(q('#svcDesc'))q('#svcDesc').textContent=t.desc;
    if(q('#svcTruth'))q('#svcTruth').textContent=t.truth;
    if(q('#svcAdd'))q('#svcAdd').textContent=t.add;
    if(q('#svcNameLabel'))q('#svcNameLabel').textContent=t.name;
    if(q('#svcDurationLabel'))q('#svcDurationLabel').textContent=t.duration+' ('+t.minutes+')';
    if(q('#svcActiveLabel'))q('#svcActiveLabel').textContent=t.status;
    if(q('#svcActive option[value="true"]'))q('#svcActive option[value="true"]').textContent=t.active;
    if(q('#svcActive option[value="false"]'))q('#svcActive option[value="false"]').textContent=t.inactive;
    if(q('#svcCancel'))q('#svcCancel').textContent=t.cancel;
    if(q('#svcSave'))q('#svcSave').textContent=t.save;
    if(q('#svcAdd'))q('#svcAdd').onclick=()=>openModal(null);
    if(q('#screen-operations.active')&&q('#pageTitle'))q('#pageTitle').textContent=t.nav;
    render();
  }

  async function request(options={}){
    const id=workspace?.business?.id;
    if(!id)throw new Error('BUSINESS_REQUIRED');
    const response=await fetch('/api/owner-operations?business_id='+encodeURIComponent(id),{cache:'no-store',credentials:'same-origin',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error(payload?.detail||payload?.error||'OWNER_OPERATIONS_FAILED');
    return payload;
  }

  async function load(force=false){
    if(!isServiceBusiness()||loading)return;
    const id=workspace?.business?.id;
    if(!id)return;
    if(!force&&data?.business_id===id)return render();
    loading=true;render();
    try{data=await request();render()}catch(error){data={business_id:id,error:String(error?.message||error)};render()}finally{loading=false;render()}
  }

  function render(){
    const body=q('#svcBody');
    if(!body||!isServiceBusiness())return;
    const t=copy();
    if(loading&&!data){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.loading)+'</div>';return}
    if(data?.error){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.failed)+' — '+escapeHtml(data.error)+'</div>';return}
    if(!data){body.innerHTML='<div class="svcEmpty">'+escapeHtml(t.loading)+'</div>';return}
    const services=Array.isArray(data.services)?data.services:[];
    const active=services.filter(service=>service.active!==false).length;
    const metrics='<div class="svcMetrics"><div class="svcMetric"><span>'+escapeHtml(t.activeMetric)+'</span><strong>'+active+'</strong></div><div class="svcMetric"><span>'+escapeHtml(t.totalMetric)+'</span><strong>'+services.length+'</strong></div></div>';
    const rows=services.length?services.map(service=>'<div class="svcRow"><div class="svcName"><b>'+escapeHtml(service.name)+'</b><small>'+escapeHtml(String(service.id||'').slice(0,8))+'</small></div><span>'+escapeHtml(service.duration_minutes)+' '+escapeHtml(t.minutes)+'</span><span class="svcStateCol"><span class="svcStatus '+(service.active!==false?'on':'off')+'">'+escapeHtml(service.active!==false?t.active:t.inactive)+'</span></span>'+(data.can_manage?'<button class="svcAction" data-svc-edit="'+escapeHtml(service.id)+'">'+escapeHtml(t.edit)+'</button>':'<span></span>')+'</div>').join(''):'<div class="svcEmpty">'+escapeHtml(t.empty)+'</div>';
    body.innerHTML=metrics+'<div class="svcTable"><div class="svcRow head"><span>'+escapeHtml(t.name)+'</span><span>'+escapeHtml(t.duration)+'</span><span class="svcStateCol">'+escapeHtml(t.status)+'</span><span></span></div>'+rows+'</div>';
    if(q('#svcAdd'))q('#svcAdd').style.display=data.can_manage?'inline-flex':'none';
    body.querySelectorAll('[data-svc-edit]').forEach(button=>button.addEventListener('click',()=>openModal(services.find(service=>service.id===button.dataset.svcEdit)||null)));
  }

  function openModal(service){
    const t=copy();editingId=service?.id||null;
    q('#svcModalTitle').textContent=service?t.edit:t.add;
    q('#svcName').value=service?.name||'';
    q('#svcDuration').value=service?.duration_minutes||30;
    q('#svcActive').value=service?.active===false?'false':'true';
    q('#svcActiveField').style.display=service?'block':'none';
    q('#svcModal').classList.add('open');
  }

  async function saveService(event){
    event.preventDefault();
    if(loading)return;
    loading=true;
    const t=copy();
    try{
      const name=q('#svcName').value.trim();
      const duration=Number(q('#svcDuration').value);
      const body=editingId?{action:'update_service',business_id:workspace.business.id,service_id:editingId,name,duration_minutes:duration,active:q('#svcActive').value==='true'}:{action:'create_service',business_id:workspace.business.id,name,duration_minutes:duration};
      const response=await fetch('/api/owner-operations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.detail||payload?.error||'SERVICE_SAVE_FAILED');
      q('#svcModal').classList.remove('open');
      data=null;
      notify(editingId?t.updated:t.created);
      editingId=null;
      await load(true);
    }catch(error){notify(t.failed+' '+String(error?.message||error).slice(0,80))}finally{loading=false;render()}
  }

  function initialize(){
    if(!isServiceBusiness())return;
    applyCopy();
    const screen=ensureScreen();
    if(screen){
      new MutationObserver(()=>{if(screen.classList.contains('active')){applyCopy();load(false)}}).observe(screen,{attributes:true,attributeFilter:['class']});
    }
  }

  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage)setLanguage=function(next){const result=baseSetLanguage(next);applyCopy();return result};
  setTimeout(initialize,500);
  window.__dabbirServiceOperations={refresh:()=>load(true),version:'service-catalog-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-service-operations-ui','v1');
  return res.status(200).send(client);
}
