const css=String.raw`
.dabbir-action-center{margin-bottom:12px;border-color:#343a31;background:linear-gradient(180deg,#171b17,#101311)}
.dabbir-action-center [hidden]{display:none!important}
.dac-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.dac-head strong{font-size:16px}.dac-status{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.45}.dac-brief{margin:12px 0;color:#dfe4e7;font-size:13px;line-height:1.7}.dac-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dac-metric{border:1px solid #2b3031;background:#121518;border-radius:13px;padding:10px}.dac-metric strong{display:block;font-size:21px}.dac-metric span{font-size:12px;color:var(--muted);line-height:1.4}.dac-metric.critical strong{color:var(--red)}.dac-metric.warning strong{color:var(--yellow)}.dac-metric.handled strong{color:var(--green)}.dac-items{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dac-item{display:flex;align-items:center;gap:9px;border:1px solid #292e31;background:#15181a;border-radius:13px;padding:10px}.dac-item.critical{border-inline-start:3px solid var(--red)}.dac-item.warning{border-inline-start:3px solid var(--yellow)}.dac-item.info{border-inline-start:3px solid var(--blue)}.dac-item-body{flex:1;min-width:0}.dac-item-body b{display:block;font-size:13px;line-height:1.45}.dac-item-body span{display:block;color:#b6bcc3;font-size:12px;line-height:1.55;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dac-item-body small{display:block;color:#8f99a5;font-size:12px;line-height:1.4;margin-top:4px}.dac-open{min-width:62px;min-height:44px;padding:8px 10px;font-size:12px}.dac-empty{padding:16px;text-align:center;color:var(--green);font-size:13px;border:1px dashed #314034;border-radius:12px;line-height:1.55}.dac-more-wrap{display:flex;justify-content:center;margin-top:9px}.dac-more{min-height:44px;padding:8px 12px;font-size:12px;color:var(--muted)}@media(max-width:700px){.dac-metrics{gap:6px}.dac-metric{padding:9px}.dac-item{align-items:flex-start;gap:8px}.dac-item-body span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dac-open{min-height:44px}.dac-more{min-height:44px}}
`;

const client=String.raw`
(()=>{
  if(document.querySelector('style[data-dabbir-action-center]'))return;
  const style=document.createElement('style');
  style.dataset.dabbirActionCenter='v3';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);

  const CACHE_MS=20000;
  const DEFAULT_VISIBLE=3;
  let lastBusinessId=null;
  let lastScopeKey=null;
  let lastLoadedAt=0;
  let requestGeneration=0;
  let navigationGeneration=0;
  let pending=null;
  let expanded=false;

  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const scopeKey=()=>{
    const w=workspaceNow();
    const scope=window.dabbirBranchContext?.scope?.()||w?.branch_scope||{};
    return [w?.user?.id||'',w?.business?.id||'',scope.mode||'',scope.branch_id||''].join('|');
  };
  const notify=value=>{if(typeof toast==='function')toast(value)};
  const businessTimeZone=()=>{
    const business=workspaceNow()?.business||{};
    return String(business.timezone||document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  };

  const text=()=>lang==='ar'?{
    title:'اليوم في دَبِّر',refresh:'تحديث',loading:'دَبِّر يراجع النشاط…',handled:'عالجها دَبِّر',urgent:'يحتاج تدخلك',warning:'راقب اليوم',empty:'كل شيء تحت السيطرة الآن',open:'فتح',error:'تعذر تحميل مركز الأولويات',showLess:'عرض الأهم فقط'
  }:{
    title:'Today in DABBIR',refresh:'Refresh',loading:'DABBIR is reviewing the business…',handled:'Handled by DABBIR',urgent:'Needs you',warning:'Watch today',empty:'Everything is under control right now',open:'Open',error:'Could not load action center',showLess:'Show top 3 only'
  };

  function ensurePanel(){
    const dash=document.querySelector('#screen-dashboard');
    if(!dash)return null;
    let panel=document.querySelector('#dabbirActionCenter');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActionCenter';
    panel.className='dabbir-action-center card';
    panel.innerHTML='<div class="dac-head"><div><strong id="dacTitle"></strong><div id="dacStatus" class="dac-status"></div></div><button id="dacRefresh" class="secondary" type="button"></button></div><p id="dacBrief" class="dac-brief"></p><div id="dacMetrics" class="dac-metrics"></div><div id="dacItems" class="dac-items"></div><div id="dacMoreWrap" class="dac-more-wrap" hidden><button id="dacMore" class="secondary dac-more" type="button"></button></div>';
    const cards=document.querySelector('#dashCards');
    if(cards&&cards.parentNode)cards.parentNode.insertBefore(panel,cards);
    else dash.prepend(panel);
    panel.querySelector('#dacRefresh')?.addEventListener('click',()=>loadActionCenter(true));
    panel.querySelector('#dacMore')?.addEventListener('click',()=>{
      expanded=!expanded;
      const w=workspaceNow();
      if(w?.owner_action_center)render(w.owner_action_center);
    });
    return panel;
  }

  function metric(label,value,tone){
    const box=document.createElement('div');
    box.className='dac-metric '+(tone||'');
    const strong=document.createElement('strong');
    strong.textContent=String(value??0);
    const span=document.createElement('span');
    span.textContent=label;
    box.append(strong,span);
    return box;
  }

  function formatWhen(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:businessTimeZone(),day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }

  function moreLabel(hiddenCount,t){
    if(expanded)return t.showLess;
    return lang==='ar'?'عرض بقية الأولويات ('+hiddenCount+')':'Show '+hiddenCount+' more';
  }

  function render(data){
    if(!data?.business_id||data.business_id!==workspaceNow()?.business?.id)return;
    const panel=ensurePanel();
    if(!panel)return;
    panel.dataset.businessId=data.business_id;
    const t=text();
    panel.querySelector('#dacTitle').textContent=t.title;
    panel.querySelector('#dacRefresh').textContent=t.refresh;
    const status=panel.querySelector('#dacStatus');
    const activity=String(workspaceNow()?.business?.business_type||'').toLowerCase();
    const rows=(Array.isArray(data.items)?data.items:[]).filter(item=>activity==='store'?item.type!=='appointment':!['clinic','salon','real_estate','creator','services','other'].includes(activity)||!['inventory','order'].includes(item.type));
    const filtered=rows.length!==(data.items||[]).length;
    const urgent=filtered?rows.filter(item=>item.severity==='critical').length:data?.metrics?.urgent;
    const warning=filtered?rows.filter(item=>item.severity==='warning').length:data?.metrics?.warning;
    const effectiveStatus=Number(urgent)>0?'needs_attention':Number(warning)>0?'watch':'clear';
    panel.dataset.state=effectiveStatus;
    status.textContent=effectiveStatus==='needs_attention'?(lang==='ar'?'هناك عناصر حرجة':'Critical items need attention'):effectiveStatus==='watch'?(lang==='ar'?'هناك أمور تحتاج متابعة':'Some items need monitoring'):(lang==='ar'?'لا توجد عناصر حرجة':'No critical items');
    const top=rows.slice(0,DEFAULT_VISIBLE).map(item=>lang==='ar'?item.title_ar:item.title_en).filter(Boolean);
    panel.querySelector('#dacBrief').textContent=filtered?(top.join(lang==='ar'?'، ':', ')||t.empty):(lang==='ar'?data?.brief?.ar:data?.brief?.en)||t.empty;

    const handledAvailable=data?.handled?.available===true;
    const handledValue=handledAvailable?(data?.handled?.verified_autonomous_today??0):'—';
    const metrics=panel.querySelector('#dacMetrics');
    metrics.replaceChildren(
      metric(t.handled,handledValue,'handled'),
      metric(t.urgent,urgent,'critical'),
      metric(t.warning,warning,'warning')
    );

    const list=panel.querySelector('#dacItems');
    list.replaceChildren();
    const moreWrap=panel.querySelector('#dacMoreWrap');
    const moreButton=panel.querySelector('#dacMore');
    if(!rows.length){
      const empty=document.createElement('div');
      empty.className='dac-empty';
      empty.textContent=t.empty;
      list.append(empty);
      if(moreWrap)moreWrap.hidden=true;
      return;
    }

    const visibleLimit=expanded?rows.length:DEFAULT_VISIBLE;
    for(const item of rows.slice(0,visibleLimit)){
      const row=document.createElement('article');
      row.className='dac-item '+(item.severity||'info');
      const body=document.createElement('div');
      body.className='dac-item-body';
      const title=document.createElement('b');
      title.textContent=lang==='ar'?item.title_ar:item.title_en;
      const detail=document.createElement('span');
      detail.textContent=lang==='ar'?item.detail_ar:item.detail_en;
      const when=document.createElement('small');
      when.textContent=formatWhen(item.due_at);
      body.append(title,detail,when);
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary dac-open';
      button.textContent=t.open;
      button.addEventListener('click',async()=>{
        if(button.disabled)return;
        button.disabled=true;
        try{await openItem(item,data.business_id)}finally{button.disabled=false}
      });
      row.append(body,button);
      list.append(row);
    }

    const canExpand=rows.length>DEFAULT_VISIBLE;
    if(moreWrap)moreWrap.hidden=!canExpand;
    if(moreButton&&canExpand){
      const hiddenCount=Math.max(0,rows.length-DEFAULT_VISIBLE);
      moreButton.textContent=moreLabel(hiddenCount,t);
      moreButton.setAttribute('aria-expanded',expanded?'true':'false');
    }
  }

  async function openItem(item,businessId){
    const key=scopeKey();
    const generation=++navigationGeneration;
    const previousScreen=typeof current!=='undefined'?current:null;
    const stillCurrent=()=>scopeKey()===key&&generation===navigationGeneration&&(typeof current==='undefined'||current===previousScreen);
    const unavailable=()=>notify(lang==='ar'?'تعذر فتح السجل المحدد. حدّث الأولويات ثم حاول مجددًا.':'Could not open this record. Refresh priorities and try again.');
    if(!businessId||workspaceNow()?.business?.id!==businessId)return false;
    const id=String(item?.entity_id||'');
    const type=String(item?.type||'');
    try{
      if(['conversation','handoff','followup'].includes(type)){
        if(!id||typeof api!=='function'){unavailable();return false}
        const params=new URLSearchParams({business_id:businessId,conversation_id:id});
        const {r,j}=await api('/api/dabbir-runtime-fast?'+params.toString());
        if(!stillCurrent())return false;
        const conversation=(j?.conversations||[]).find(row=>row.id===id);
        if(!r?.ok||!j?.ok||j.business?.id!==businessId||j.selected_conversation_id!==id||!conversation||(conversation.business_id&&conversation.business_id!==businessId)){unavailable();return false}
        workspace=j;
        selectedConversationId=id;
        if(typeof renderAll==='function')renderAll();
        if(typeof showScreen==='function')showScreen('conversations');
        return true;
      }
      if(type==='appointment'){
        const w=workspaceNow(),reader=window.__dabbirBookingReader,lifecycle=window.__dabbirBookingLifecycle;
        if(!id||!reader||!lifecycle){unavailable();return false}
        if(!reader.find(w,id)){
          const day=lifecycle.dayKey(item.due_at,w.business);
          if(day)lifecycle.setView(w,{day,view:'day',scope:'current',allDates:false});
          await reader.ensure(w);
        }
        if(!stillCurrent())return false;
        const row=reader?.find?.(w,id);
        if(!id||!row||!lifecycle?.inContext?.(row,w)||!window.__dabbirAppointmentManagement?.open){unavailable();return false}
        if(typeof showScreen==='function')showScreen('appointments');
        if(scopeKey()!==key)return false;
        window.__dabbirAppointmentManagement.open(id);
        return true;
      }
      if(['inventory','order'].includes(type)){
        const opened=await window.__dabbirOwnerOperations?.openRecord?.({business_id:businessId,type,id,isCurrent:stillCurrent});
        if(!opened&&scopeKey()===key)unavailable();
        return opened===true;
      }
      if(type==='channel'&&typeof showScreen==='function'){
        showScreen('integrations');return true;
      }
      unavailable();return false;
    }catch{if(scopeKey()===key)unavailable();return false}
  }

  function clearPanel(panel,state,message){
    if(!panel)return;
    panel.dataset.state=state;
    panel.querySelector('#dacStatus').textContent='';
    panel.querySelector('#dacBrief').textContent=message;
    panel.querySelector('#dacMetrics').replaceChildren();
    panel.querySelector('#dacItems').replaceChildren();
    panel.querySelector('#dacMoreWrap').hidden=true;
  }

  async function loadActionCenter(force=false){
    const w=workspaceNow();
    const businessId=w?.business?.id;
    const key=scopeKey();
    if(!businessId){requestGeneration++;pending=null;clearPanel(document.querySelector('#dabbirActionCenter'),'unavailable','');return}
    if(pending?.key===key)return pending.promise;
    if(lastBusinessId&&businessId!==lastBusinessId)expanded=false;
    const now=Date.now();
    if(!force&&key===lastScopeKey&&businessId===lastBusinessId&&now-lastLoadedAt<CACHE_MS&&w?.owner_action_center){
      render(w.owner_action_center);
      return;
    }
    const generation=++requestGeneration;
    const panel=ensurePanel();
    if(panel){
      const t=text();
      panel.querySelector('#dacTitle').textContent=t.title;
      panel.querySelector('#dacRefresh').textContent=t.refresh;
      clearPanel(panel,'loading',t.loading);
    }
    const promise=(async()=>{try{
      const response=await fetch('/api/owner-action-center?business_id='+encodeURIComponent(businessId),{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(generation!==requestGeneration||scopeKey()!==key)return;
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error(data?.error||('ACTION_CENTER_'+response.status));
      if(data.business_id!==businessId)throw new Error('ACTION_CENTER_CONTEXT_MISMATCH');
      const live=workspaceNow();
      if(live&&live.business?.id===businessId)live.owner_action_center=data;
      lastBusinessId=businessId;
      lastScopeKey=key;
      lastLoadedAt=Date.now();
      render(data);
    }catch(error){
      if(generation!==requestGeneration||scopeKey()!==key)return;
      lastLoadedAt=0;
      delete workspaceNow().owner_action_center;
      console.error('dabbir_action_center_ui_failed',String(error?.message||error).slice(0,120));
      if(panel){
        const t=text();
        clearPanel(panel,'error',t.error);
      }
    }finally{if(pending?.generation===generation)pending=null}})();
    pending={key,generation,promise};
    return promise;
  }

  const baseRenderDashboard=renderDashboard;
  renderDashboard=function(){
    baseRenderDashboard();
    ensurePanel();
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>loadActionCenter(false));
    else setTimeout(()=>loadActionCenter(false),0);
  };

  const baseSetLanguage=typeof setLanguage==='function'?setLanguage:null;
  if(baseSetLanguage){
    setLanguage=function(next){
      const result=baseSetLanguage(next);
      const w=workspaceNow();
      if(w?.owner_action_center)render(w.owner_action_center);
      return result;
    };
  }

  window.__dabbirUiLifecycle?.on?.('afterRender','owner-action-center-context',()=>loadActionCenter(false));
  window.__dabbirUiLifecycle?.on?.('afterLanguage','owner-action-center-language',()=>{const w=workspaceNow();if(w?.owner_action_center)render(w.owner_action_center)});
  window.__dabbirOwnerActionCenter={refresh:()=>loadActionCenter(true),open:openItem,render,version:'owner-action-center-v3'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-owner-action-center-ui','v3');
  return res.status(200).send(client);
}
