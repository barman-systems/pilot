const css=String.raw`
.dabbir-away-btn{min-height:36px;padding:7px 10px;border:1px solid #3d4350;background:#181c23;color:#d8dde6;border-radius:11px;font-size:9px;font-weight:900}
.dabbir-away-btn.active{border-color:#7b67d8;background:#211b35;color:#d9d2ff}
.dabbir-away-overlay{position:fixed;inset:0;z-index:80;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px}
.dabbir-away-dialog{width:min(430px,100%);border:1px solid #323846;background:#11151c;border-radius:20px;padding:17px;box-shadow:0 24px 80px #000a}
.dabbir-away-dialog h3{margin:0;font-size:16px}.dabbir-away-dialog p{color:#a0a8b5;font-size:10px;line-height:1.7;margin:8px 0 14px}.dabbir-away-options{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.dabbir-away-options button,.dabbir-away-stop,.dabbir-away-close{min-height:44px;border-radius:12px;font-weight:900}.dabbir-away-options button{border:1px solid #343b49;background:#191e27;color:#fff}.dabbir-away-stop{width:100%;margin-top:8px;border:1px solid #5b3337;background:#26171a;color:#ffb4b4}.dabbir-away-close{width:100%;margin-top:8px;border:0;background:transparent;color:#9ba4b2}.dabbir-away-state{margin-top:12px;padding:9px;border:1px solid #2e3542;border-radius:11px;color:#bac2cf;font-size:9px}
@media(max-width:700px){.dabbir-away-overlay{align-items:flex-end;padding:10px}.dabbir-away-dialog{border-radius:20px 20px 14px 14px}.dabbir-away-options{grid-template-columns:1fr}.dabbir-away-btn{min-height:40px}}
`;

const client=String.raw`
(()=>{
  if(window.__dabbirOwnerAwayUiLoaded)return;
  window.__dabbirOwnerAwayUiLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirOwnerAway='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.appendChild(style);

  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    if(typeof input==='string'&&input.startsWith('/api/owner-action-center?')){
      input='/api/owner-action-center-away?'+input.split('?')[1];
    }
    return nativeFetch(input,init);
  };

  let mode=null;
  let checkedBusiness=null;
  let modeLoaded=false;
  let loading=false;
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const copy=()=>ar()?{
    button:'وضع غياب',active:'غياب المالك',title:'وضع غياب المالك',desc:'دَبِّر يؤجل التصعيد غير الحرج خلال غيابك، لكنه لا يخفي الحالات الحرجة ولا يتجاوز موافقات المال أو القانون أو الهوية.',d1:'يوم واحد',d3:'3 أيام',d7:'7 أيام',stop:'إيقاف وضع الغياب',close:'إغلاق',saved:'تم تحديث وضع الغياب',failed:'تعذر تحديث وضع الغياب',unavailable:'وضع الغياب غير متاح في هذه البيئة بعد',until:'حتى'
  }:{
    button:'Away Mode',active:'Owner away',title:'Owner Away Mode',desc:'DABBIR holds non-critical escalation while you are away. Critical exceptions stay visible, and money, legal, or identity approvals are never bypassed.',d1:'1 day',d3:'3 days',d7:'7 days',stop:'Turn off Away Mode',close:'Close',saved:'Away Mode updated',failed:'Could not update Away Mode',unavailable:'Away Mode is not available in this environment yet',until:'until'
  };

  function businessId(){return workspace?.business?.id||null}
  function isOwner(){return workspace?.membership?.role==='owner'}
  function notify(text){try{if(typeof toast==='function')toast(text)}catch{}}
  function dateLabel(value){if(!value)return '';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}

  async function refreshMode(force=false){
    const id=businessId();
    if(!id||!isOwner()||loading)return;
    if(!force&&checkedBusiness===id&&modeLoaded)return renderButton();
    loading=true;
    try{
      const response=await nativeFetch('/api/owner-away-mode?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_AWAY_LOOKUP_FAILED');
      mode=payload.mode||null;checkedBusiness=id;modeLoaded=true;renderButton();
    }catch{mode=null;checkedBusiness=id;modeLoaded=true;renderButton()}
    finally{loading=false}
  }

  function renderButton(){
    const panel=document.querySelector('#dabbirActionCenter');
    const head=panel?.querySelector('.dac-head');
    if(!head||!isOwner())return;
    let button=document.querySelector('#dabbirAwayButton');
    if(!button){
      button=document.createElement('button');
      button.id='dabbirAwayButton';button.type='button';button.className='dabbir-away-btn';button.addEventListener('click',openDialog);
      const refresh=head.querySelector('#dacRefresh');
      if(refresh?.parentNode)refresh.parentNode.insertBefore(button,refresh);else head.append(button);
    }
    const t=copy();
    const active=mode?.active===true;
    button.classList.toggle('active',active);
    const nextLabel=active?(t.active+' · '+t.until+' '+dateLabel(mode.ends_at)):t.button;
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
  }

  function closeDialog(){document.querySelector('#dabbirAwayOverlay')?.remove()}
  function openDialog(){
    closeDialog();
    const t=copy();
    const overlay=document.createElement('div');overlay.id='dabbirAwayOverlay';overlay.className='dabbir-away-overlay';
    const dialog=document.createElement('section');dialog.className='dabbir-away-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title=document.createElement('h3');title.textContent=t.title;
    const desc=document.createElement('p');desc.textContent=t.desc;
    const options=document.createElement('div');options.className='dabbir-away-options';
    [[1,t.d1],[3,t.d3],[7,t.d7]].forEach(([days,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>setMode(days));options.append(b)});
    dialog.append(title,desc,options);
    if(mode?.active||mode?.scheduled){const stop=document.createElement('button');stop.type='button';stop.className='dabbir-away-stop';stop.textContent=t.stop;stop.addEventListener('click',()=>setMode(0));dialog.append(stop)}
    if(mode){const state=document.createElement('div');state.className='dabbir-away-state';state.textContent=mode.active?(t.active+' '+t.until+' '+dateLabel(mode.ends_at)):String(mode.state||'');dialog.append(state)}
    const close=document.createElement('button');close.type='button';close.className='dabbir-away-close';close.textContent=t.close;close.addEventListener('click',closeDialog);dialog.append(close);
    overlay.append(dialog);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});document.body.append(overlay);
  }

  async function setMode(days){
    const id=businessId();if(!id||!isOwner()||loading)return;
    loading=true;const t=copy();
    try{
      const now=Date.now();
      const enabled=Number(days)>0;
      const response=await nativeFetch('/api/owner-away-mode',{
        method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({business_id:id,enabled,starts_at:enabled?new Date(now).toISOString():null,ends_at:enabled?new Date(now+Number(days)*24*60*60*1000).toISOString():null,timezone:'Asia/Dubai'})
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||'OWNER_AWAY_UPDATE_FAILED');
      mode=payload.mode;checkedBusiness=id;modeLoaded=true;closeDialog();renderButton();notify(t.saved);
      if(window.__dabbirOwnerActionCenter?.refresh)window.__dabbirOwnerActionCenter.refresh();
    }catch(error){notify(String(error?.message||'').includes('LOOKUP')?t.unavailable:t.failed)}
    finally{loading=false}
  }

  let observerFrame=0;
  function scheduleObservedSync(){
    if(observerFrame)return;
    const run=()=>{
      observerFrame=0;
      if(document.querySelector('#dabbirActionCenter')){renderButton();refreshMode(false)}
    };
    observerFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame(run):setTimeout(run,0);
  }
  const observer=new MutationObserver(scheduleObservedSync);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>refreshMode(true),500);
  window.__dabbirOwnerAway={refresh:()=>refreshMode(true),version:'owner-away-ui-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-owner-away-ui','owner-away-ui-v1');
  return res.end(client);
}
