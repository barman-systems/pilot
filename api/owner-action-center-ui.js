const script=String.raw`
(()=>{
  const CACHE_MS=20000;
  let lastBusinessId=null;
  let lastLoadedAt=0;
  let loading=false;

  const text=()=>lang==='ar'?{
    title:'اليوم في دَبِّر',refresh:'تحديث',loading:'دَبِّر يراجع النشاط…',urgent:'يحتاج تدخلك',warning:'راقب اليوم',total:'إجمالي الأولويات',empty:'كل شيء تحت السيطرة الآن',open:'فتح',error:'تعذر تحميل مركز الأولويات'
  }:{
    title:'Today in DABBIR',refresh:'Refresh',loading:'DABBIR is reviewing the business…',urgent:'Needs you',warning:'Watch today',total:'Total priorities',empty:'Everything is under control right now',open:'Open',error:'Could not load action center'
  };

  function ensurePanel(){
    const dash=document.querySelector('#screen-dashboard');
    if(!dash)return null;
    let panel=document.querySelector('#dabbirActionCenter');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='dabbirActionCenter';
    panel.className='dabbir-action-center card';
    panel.innerHTML='<div class="dac-head"><div><strong id="dacTitle"></strong><div id="dacStatus" class="dac-status"></div></div><button id="dacRefresh" class="secondary" type="button"></button></div><p id="dacBrief" class="dac-brief"></p><div id="dacMetrics" class="dac-metrics"></div><div id="dacItems" class="dac-items"></div>';
    const cards=document.querySelector('#dashCards');
    if(cards&&cards.parentNode)cards.parentNode.insertBefore(panel,cards);
    else dash.prepend(panel);
    panel.querySelector('#dacRefresh')?.addEventListener('click',()=>loadActionCenter(true));
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
    try{return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-AE',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }

  function render(data){
    const panel=ensurePanel();
    if(!panel)return;
    const t=text();
    panel.querySelector('#dacTitle').textContent=t.title;
    panel.querySelector('#dacRefresh').textContent=t.refresh;
    panel.dataset.state=data?.status||'clear';
    const status=panel.querySelector('#dacStatus');
    status.textContent=data?.status==='needs_attention'?(lang==='ar'?'هناك عناصر حرجة':'Critical items need attention'):data?.status==='watch'?(lang==='ar'?'هناك أمور تحتاج متابعة':'Some items need monitoring'):(lang==='ar'?'لا توجد عناصر حرجة':'No critical items');
    panel.querySelector('#dacBrief').textContent=(lang==='ar'?data?.brief?.ar:data?.brief?.en)||t.empty;

    const metrics=panel.querySelector('#dacMetrics');
    metrics.replaceChildren(
      metric(t.urgent,data?.metrics?.urgent,'critical'),
      metric(t.warning,data?.metrics?.warning,'warning'),
      metric(t.total,data?.metrics?.total,'')
    );

    const list=panel.querySelector('#dacItems');
    list.replaceChildren();
    const rows=Array.isArray(data?.items)?data.items:[];
    if(!rows.length){
      const empty=document.createElement('div');
      empty.className='dac-empty';
      empty.textContent=t.empty;
      list.append(empty);
      return;
    }

    for(const item of rows.slice(0,8)){
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
      button.addEventListener('click',()=>{
        const target=String(item.target||'dashboard');
        if(typeof showScreen==='function')showScreen(target);
      });
      row.append(body,button);
      list.append(row);
    }
  }

  async function loadActionCenter(force=false){
    const businessId=workspace?.business?.id;
    if(!businessId||loading)return;
    const now=Date.now();
    if(!force&&businessId===lastBusinessId&&now-lastLoadedAt<CACHE_MS&&workspace?.owner_action_center){
      render(workspace.owner_action_center);
      return;
    }
    loading=true;
    const panel=ensurePanel();
    if(panel){
      const t=text();
      panel.querySelector('#dacTitle').textContent=t.title;
      panel.querySelector('#dacRefresh').textContent=t.refresh;
      panel.querySelector('#dacBrief').textContent=t.loading;
    }
    try{
      const response=await fetch('/api/owner-action-center?business_id='+encodeURIComponent(businessId),{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||('ACTION_CENTER_'+response.status));
      if(workspace)workspace.owner_action_center=data;
      lastBusinessId=businessId;
      lastLoadedAt=Date.now();
      render(data);
    }catch(error){
      console.error('dabbir_action_center_ui_failed',String(error?.message||error).slice(0,120));
      if(panel){
        const t=text();
        panel.querySelector('#dacBrief').textContent=t.error;
      }
    }finally{loading=false}
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
      if(workspace?.owner_action_center)render(workspace.owner_action_center);
      return result;
    };
  }

  window.__dabbirOwnerActionCenter={refresh:()=>loadActionCenter(true),version:'owner-action-center-v1'};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, s-maxage=300');
  res.setHeader('x-dabbir-owner-action-center-ui','v1');
  return res.status(200).send(String.raw`
<style>
.dabbir-action-center{margin-bottom:12px;border-color:#343a31;background:linear-gradient(180deg,#171b17,#101311)}
.dac-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.dac-head strong{font-size:15px}.dac-status{font-size:9px;color:var(--muted);margin-top:4px}.dac-brief{margin:12px 0;color:#dfe4e7;font-size:11px;line-height:1.75}.dac-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dac-metric{border:1px solid #2b3031;background:#121518;border-radius:13px;padding:10px}.dac-metric strong{display:block;font-size:20px}.dac-metric span{font-size:8px;color:var(--muted)}.dac-metric.critical strong{color:var(--red)}.dac-metric.warning strong{color:var(--yellow)}.dac-items{display:flex;flex-direction:column;gap:7px;margin-top:10px}.dac-item{display:flex;align-items:center;gap:9px;border:1px solid #292e31;background:#15181a;border-radius:13px;padding:10px}.dac-item.critical{border-inline-start:3px solid var(--red)}.dac-item.warning{border-inline-start:3px solid var(--yellow)}.dac-item.info{border-inline-start:3px solid var(--blue)}.dac-item-body{flex:1;min-width:0}.dac-item-body b{display:block;font-size:10px}.dac-item-body span{display:block;color:#b6bcc3;font-size:9px;line-height:1.55;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dac-item-body small{display:block;color:#777f87;font-size:8px;margin-top:4px}.dac-open{min-width:62px;padding:7px 9px;font-size:9px}.dac-empty{padding:16px;text-align:center;color:var(--green);font-size:10px;border:1px dashed #314034;border-radius:12px}@media(max-width:700px){.dac-metrics{gap:6px}.dac-metric{padding:9px}.dac-item{align-items:flex-start}.dac-open{min-height:40px}.dac-item-body span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
</style>
<script>${script.replaceAll('</script>','<\\/script>')}</script>
`);
}
