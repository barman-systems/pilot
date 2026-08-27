const script=String.raw`(()=>{
  if(window.__dabbirRecoveryReconciliationUi)return;
  window.__dabbirRecoveryReconciliationUi=true;

  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const copy=()=>ar()?{
    open:'فتح قضية مصالحة',opening:'جارٍ فتح القضية...',created:'تم فتح قضية المصالحة وربطها بالمعاينة الموثقة.',existing:'قضية المصالحة موجودة بالفعل وتم ربطها بنفس المعاينة.',preview:'أعد تشغيل معاينة الاسترجاع ثم افتح قضية المصالحة خلال 30 دقيقة.',notNeeded:'لم تعد المصالحة مطلوبة. أعد تشغيل معاينة الاسترجاع.',failed:'تعذر فتح قضية المصالحة.'
  }:{
    open:'Open reconciliation case',opening:'Opening case...',created:'Reconciliation case opened and bound to the verified preview.',existing:'The reconciliation case already exists for this verified preview.',preview:'Run the recovery preview again, then open the reconciliation case within 30 minutes.',notNeeded:'Reconciliation is no longer required. Run the recovery preview again.',failed:'Could not open the reconciliation case.'
  };
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const customerNo=()=>{for(const n of qa('#pcBody .pcCode')){const v=String(n.textContent||'').trim().toUpperCase();if(/^DAB-[0-9]{6,}$/.test(v))return v}return null};
  const api=async(body)=>{const r=await fetch('/api/platform-customer-support',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));return{r,j}};

  async function ensureCase(button,businessId){
    const t=copy(),no=customerNo();
    if(!no||!businessId)return notify(t.failed);
    button.disabled=true;button.textContent=t.opening;
    const {r,j}=await api({action:'ensure_recovery_reconciliation',customer_no:no,business_id:businessId});
    if(!r.ok){
      button.disabled=false;button.textContent=t.open;
      if(j.error==='RECOVERY_PREVIEW_REQUIRED')return notify(t.preview);
      if(j.error==='RECOVERY_RECONCILIATION_NOT_REQUIRED')return notify(t.notNeeded);
      return notify(j.error||t.failed);
    }
    notify(j.reconciliation?.created?t.created:t.existing);
    q('#pcSupport360')?.remove();
    button.textContent=j.reconciliation?.created?t.created:t.existing;
  }

  function mount(){
    const t=copy();
    for(const blocked of qa('#pcBody .pcRecoveryBlocked')){
      if(blocked.querySelector('[data-pc-reconcile-case]'))continue;
      const business=blocked.closest('.pcBiz');
      const input=business?.querySelector('[data-pc-time]');
      const businessId=String(input?.getAttribute('data-pc-time')||'').trim();
      if(!businessId)continue;
      const actions=document.createElement('div');actions.className='pcActions';
      const button=document.createElement('button');button.className='secondary';button.dataset.pcReconcileCase=businessId;button.textContent=t.open;
      button.onclick=()=>ensureCase(button,businessId);
      actions.appendChild(button);blocked.appendChild(actions);
    }
  }

  const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});
  new MutationObserver(()=>{for(const b of qa('[data-pc-reconcile-case]'))if(!b.disabled)b.textContent=copy().open}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  setInterval(mount,1500);mount();
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed')}
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-recovery-reconciliation-ui','v1');
  return res.end(script);
}
