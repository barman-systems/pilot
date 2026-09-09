export const platformPnlScript=String.raw`(()=>{
  if(window.__dabbirPlatformPnlUi)return;window.__dabbirPlatformPnlUi=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ar=()=>document.documentElement.lang!=='en';
  const T=()=>ar()?{
    title:'أرباح وخسائر DABBIR',desc:'اقتصاد DABBIR نفسه فقط: الإيرادات والتكاليف ومساهمة كل نشاط. لا تشمل أموال زبائن الأنشطة.',month:'الشهر',refresh:'تحديث',
    revenue:'الإيراد المؤكد',ai:'تكلفة AI',other:'تكاليف أخرى',total:'إجمالي التكلفة المؤكدة',known:'النتيجة التشغيلية المعروفة',net:'صافي الربح',
    complete:'حساب مكتمل',partial:'حساب جزئي',missing:'مصادر تكلفة/إيراد غير مكتملة',owner:'تكلفة الموظفين: 0 — المالك يعمل منفردًا، ووقت المالك غير محمّل كمصروف.',
    notFinal:'لا أعرض صافي ربح نهائي لأن بعض المصادر غير مكتملة. الرقم الظاهر هو النتيجة المعروفة فقط.',business:'النشاط',bRevenue:'الإيراد',bAi:'AI',bDirect:'تكاليف مباشرة',bShared:'حصة التكاليف المشتركة',contribution:'المساهمة المعروفة',unpriced:'AI غير مسعّر',
    providers:'التكلفة حسب المزود',categories:'التكلفة حسب النوع',source:'المصدر',state:'الحالة',loading:'جارٍ تحميل الحساب المالي…',unavailable:'تعذر تحميل حساب الأرباح والخسائر.',none:'لا توجد بيانات لهذا الشهر.'
  }:{
    title:'DABBIR profit & loss',desc:'DABBIR economics only: revenue, operating cost and contribution by business. Tenant customer money is excluded.',month:'Month',refresh:'Refresh',
    revenue:'Confirmed revenue',ai:'AI cost',other:'Other costs',total:'Total known cost',known:'Known operating result',net:'Net profit',
    complete:'Complete accounting',partial:'Partial accounting',missing:'Incomplete cost/revenue sources',owner:'Employee cost: 0 — solo owner. Owner time is not charged as an operating expense.',
    notFinal:'Final net profit is not shown while required sources are incomplete. The visible result is the known operating result only.',business:'Business',bRevenue:'Revenue',bAi:'AI',bDirect:'Direct other cost',bShared:'Allocated shared cost',contribution:'Known contribution',unpriced:'Unpriced AI',
    providers:'Cost by provider',categories:'Cost by category',source:'Source',state:'State',loading:'Loading P&L…',unavailable:'P&L could not be loaded.',none:'No data for this month.'
  };
  const aed=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(ar()?'ar-AE':'en-AE',{style:'currency',currency:'AED',minimumFractionDigits:2,maximumFractionDigits:6}).format(Number(v));
  const num=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(ar()?'ar-AE':'en-AE').format(Number(v));
  const currentMonth=()=>new Date().toISOString().slice(0,7);
  let selectedMonth=currentMonth(),data=null,error=false,denied=false,loading=false,capability='unknown',capabilityPromise=null,activeHost=null;
  const style=document.createElement('style');style.dataset.dabbirPnl='v1';style.textContent='.dabbirPnl{border:1px solid var(--line,#2a3442);border-radius:16px;padding:14px;margin:12px 0;background:var(--card,#111820)}.dabbirPnlHead{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.dabbirPnlHead h2{margin:0;font-size:17px}.dabbirPnlHead p{margin:3px 0 0;color:var(--muted,#9aa7b8);font-size:11px}.dabbirPnlTools{display:flex;gap:7px;align-items:center}.dabbirPnlTools input{min-height:40px;border:1px solid var(--line,#2a3442);border-radius:9px;background:#0d131a;color:#fff;padding:6px 8px}.dabbirPnlGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.dabbirPnlStat{border:1px solid var(--line,#2a3442);border-radius:11px;padding:9px;background:#0d141c}.dabbirPnlStat span{display:block;color:var(--muted,#9aa7b8);font-size:9px}.dabbirPnlStat b{display:block;font-size:17px;margin-top:2px;overflow-wrap:anywhere}.dabbirPnlNotice{margin-top:10px;padding:9px;border-radius:10px;background:#191f28;font-size:10px}.dabbirPnlNotice.warn{background:#292214}.dabbirPnlTable{overflow:auto;margin-top:10px}.dabbirPnlTable table{width:100%;border-collapse:collapse;font-size:10px}.dabbirPnlTable th,.dabbirPnlTable td{text-align:start;padding:7px;border-bottom:1px solid var(--line,#2a3442);white-space:nowrap}.dabbirPnlNeg{font-weight:800}.dabbirPnl details{margin-top:8px}.dabbirPnl summary{cursor:pointer;min-height:36px;display:flex;align-items:center}@media(max-width:720px){.dabbirPnlGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dabbirPnlTools{width:100%}.dabbirPnlTools input{flex:1}}';document.head.appendChild(style);
  function host(){
    const platform=document.querySelector('#screen-platform-customers');if(platform)return{parent:platform,anchor:platform.querySelector('#pcBody')};
    return null;
  }
  function resetView(){data=null;error=false;loading=false}
  function ensure(){
    const h=host(),existing=document.querySelector('#dabbirPnlPanel');
    if(!h){if(existing)existing.remove();if(activeHost){activeHost=null;resetView()}return null}
    if(activeHost!==h.parent){activeHost=h.parent;resetView()}
    let el=existing;if(!el){el=document.createElement('section');el.id='dabbirPnlPanel';el.className='dabbirPnl panel';if(h.anchor)h.parent.insertBefore(el,h.anchor);else h.parent.appendChild(el)}return el;
  }
  function rows(items,kind){const t=T();if(!Array.isArray(items)||!items.length)return '<div class="dabbirPnlNotice">'+esc(t.none)+'</div>';if(kind==='business')return '<div class="dabbirPnlTable"><table><thead><tr><th>'+esc(t.business)+'</th><th>'+esc(t.bRevenue)+'</th><th>'+esc(t.bAi)+'</th><th>'+esc(t.bDirect)+'</th><th>'+esc(t.bShared)+'</th><th>'+esc(t.contribution)+'</th><th>'+esc(t.unpriced)+'</th></tr></thead><tbody>'+items.map(r=>'<tr><td>'+esc(r.name||r.business_id)+'</td><td>'+esc(aed(r.revenue_aed))+'</td><td>'+esc(aed(r.ai_cost_aed))+'</td><td>'+esc(aed(r.direct_other_cost_aed))+'</td><td>'+esc(aed(r.allocated_shared_cost_aed))+'</td><td class="'+(Number(r.known_contribution_aed)<0?'dabbirPnlNeg':'')+'">'+esc(aed(r.known_contribution_aed))+'</td><td>'+esc(num(r.unpriced_ai_operations))+'</td></tr>').join('')+'</tbody></table></div>';
    return '<div class="dabbirPnlTable"><table><thead><tr><th>'+(kind==='provider'?esc(t.providers):esc(t.categories))+'</th><th>'+esc(t.total)+'</th></tr></thead><tbody>'+items.map(r=>'<tr><td>'+esc(kind==='provider'?r.provider:r.category)+'</td><td>'+esc(aed(r.amount_aed))+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function render(){const el=ensure();if(!el)return;const t=T();if(denied||capability!=='allowed'){el.hidden=true;return}el.hidden=false;if(loading){el.innerHTML='<div class="dabbirPnlNotice">'+esc(t.loading)+'</div>';return}if(error||!data){el.innerHTML='<div class="dabbirPnlNotice warn">'+esc(t.unavailable)+'</div>';return}const p=data,c=p.costs||{},r=p.revenue||{},complete=p.measurement_state==='COMPLETE';const missing=Array.isArray(p.missing_sources)?p.missing_sources:[];
    el.innerHTML='<div class="dabbirPnlHead"><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.desc)+'</p></div><div class="dabbirPnlTools"><label>'+esc(t.month)+' <input id="dabbirPnlMonth" type="month" value="'+esc(selectedMonth)+'"></label><button id="dabbirPnlRefresh" type="button">'+esc(t.refresh)+'</button></div></div><div class="dabbirPnlGrid">'+
      '<div class="dabbirPnlStat"><span>'+esc(t.revenue)+'</span><b>'+esc(aed(r.known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.ai)+'</span><b>'+esc(aed(c.ai_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.other)+'</span><b>'+esc(aed(c.other_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.total)+'</span><b>'+esc(aed(c.total_known_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.known)+'</span><b>'+esc(aed(p.known_operating_result_aed))+'</b></div><div class="dabbirPnlStat"><span>'+esc(t.net)+'</span><b>'+esc(complete?aed(p.net_profit_aed):'—')+'</b></div></div>'+ 
      '<div class="dabbirPnlNotice '+(complete?'':'warn')+'"><b>'+esc(complete?t.complete:t.partial)+'</b> · '+esc(t.owner)+(complete?'':'<br>'+esc(t.notFinal))+'</div>'+ 
      (!complete&&missing.length?'<details open><summary>'+esc(t.missing)+' ('+missing.length+')</summary><div class="dabbirPnlTable"><table><thead><tr><th>'+esc(t.source)+'</th><th>'+esc(t.state)+'</th></tr></thead><tbody>'+missing.map(s=>'<tr><td>'+esc(s.provider||s.source_key)+'</td><td>'+esc(s.state)+'</td></tr>').join('')+'</tbody></table></div></details>':'')+
      '<details open><summary>'+esc(t.business)+'</summary>'+rows(p.businesses,'business')+'</details><details><summary>'+esc(t.providers)+'</summary>'+rows(p.by_provider,'provider')+'</details><details><summary>'+esc(t.categories)+'</summary>'+rows(p.by_category,'category')+'</details>';
    const input=document.querySelector('#dabbirPnlMonth');if(input)input.onchange=()=>{selectedMonth=input.value||currentMonth()};const btn=document.querySelector('#dabbirPnlRefresh');if(btn)btn.onclick=()=>load();
  }
  async function probeCapability(){
    if(capability==='allowed')return true;
    if(capability==='denied')return false;
    if(capabilityPromise)return capabilityPromise;
    capability='probing';
    capabilityPromise=(async()=>{
      try{
        const response=await fetch('/api/owner-finance?action=capability',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
        const payload=await response.json().catch(()=>null);
        if(!response.ok||!payload?.ok||payload.allowed!==true){capability='denied';denied=true;data=null;return false}
        capability='allowed';denied=false;return true;
      }catch{capability='denied';denied=true;data=null;return false}
    })();
    try{return await capabilityPromise}finally{capabilityPromise=null;render()}
  }
  async function load(){
    if(loading||capability!=='allowed'||denied)return;
    loading=true;error=false;render();
    try{
      const response=await fetch('/api/owner-finance?month='+encodeURIComponent(selectedMonth),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      if(response.status===401||response.status===403){denied=true;capability='denied';data=null;return}
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||'PNL_LOAD_FAILED');data=payload.pnl||null;denied=false;
    }catch{error=true;data=null}finally{loading=false;render()}
  }
  async function maybeLoad(){const el=ensure();if(!el||loading||data||denied||error)return;if(capability!=='allowed'){const allowed=await probeCapability();if(!allowed)return}if(capability==='allowed'&&!loading&&!data&&!denied&&!error)await load()}
  const observer=new MutationObserver(()=>{void maybeLoad()});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['lang']});
  window.__dabbirUiLifecycle?.on?.('afterNavigate','platform-pnl-v2',()=>{void maybeLoad()});
  window.__dabbirUiLifecycle?.on?.('afterLanguage','platform-pnl-lang-v2',()=>render());
  setTimeout(()=>{void maybeLoad()},0);
})();`;

export default function handler(req,res){
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.setHeader('allow','GET, HEAD');return res.end('Method Not Allowed')}
  res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-dabbir-platform-pnl-ui','v2');res.statusCode=200;return res.end(req.method==='HEAD'?'':platformPnlScript);
}
