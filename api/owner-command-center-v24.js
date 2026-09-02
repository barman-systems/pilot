import base from './owner-command-center-v23.js';

const PATCH=String.raw`<style>
.ceo24{direction:rtl;border:1px solid #365362;background:linear-gradient(180deg,#0d171d,#0a1116);border-radius:18px;padding:14px;margin:0 0 12px;color:#eef7fb}.ceo24head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ceo24brand{display:flex;gap:10px;align-items:center}.ceo24mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#2e246b,#245fd6 55%,#38c8d9);font-weight:950;font-size:16px;border:1px solid #617dff66}.ceo24 h2{margin:0;font-size:15px}.ceo24 p{margin:3px 0 0;color:#9fb0ba;font-size:8px;line-height:1.6}.ceo24badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 8px;background:#123323;color:#77dba0;font-size:8px;font-weight:900;white-space:nowrap}.ceo24badge:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}.ceo24grid{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:8px;margin-top:10px}.ceo24card{border:1px solid #263d49;background:#101a20;border-radius:13px;padding:10px;min-width:0}.ceo24card h3{margin:0 0 7px;font-size:9px;color:#dfeaf0}.ceo24value{font-size:11px;font-weight:850;line-height:1.55;word-break:break-word}.ceo24muted{font-size:7px;color:#8fa1ac;line-height:1.6;margin-top:5px}.ceo24row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #20323b;font-size:8px}.ceo24row:last-child{border-bottom:0}.ceo24row span{color:#8fa1ac}.ceo24flow{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.ceo24flow b{font-size:7px;padding:3px 5px;border:1px solid #31505e;border-radius:999px;color:#cfe0e8}.ceo24refresh{border:1px solid #34505e;background:#111c22;color:#e8f3f8;border-radius:9px;padding:6px 9px;font-size:8px;cursor:pointer}.ceo24refresh:disabled{opacity:.5}.ceo24error{color:#ff9a9a}.ceo24warn{color:#f2c66d}.ceo24ok{color:#77dba0}
@media(max-width:850px){.ceo24grid{grid-template-columns:1fr 1fr}.ceo24grid>.ceo24card:first-child{grid-column:1/-1}}
@media(max-width:700px){.ceo24{padding:10px;border-radius:14px}.ceo24head{display:block}.ceo24badge{margin-top:8px}.ceo24grid{grid-template-columns:1fr}.ceo24grid>.ceo24card:first-child{grid-column:auto}.ceo24refresh{margin-top:8px;width:100%}}
</style><script>(()=>{
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const closed=new Set(['verified','done','completed','closed','resolved']);
const host=document.querySelector('#customers');if(!host)return;
const root=document.createElement('section');root.className='ceo24';root.id='barmanExecutiveOsCeo';
const executive=document.querySelector('#ownerExecutiveV23');if(executive)executive.insertAdjacentElement('beforebegin',root);else host.prepend(root);
const when=v=>{if(!v)return 'غير متاح';try{return new Date(v).toLocaleString('ar-AE')}catch{return String(v)}};
const actionTitle=a=>a?.description||a?.id||'لا توجد مهمة مسجلة';
function shell(msg='جاري قراءة حالة المدير التنفيذي…'){
 root.innerHTML='<div class="ceo24head"><div class="ceo24brand"><div class="ceo24mark">B</div><div><h2>BARMAN Executive OS <small>· CEO</small></h2><p>المدير التنفيذي المعتمد لدبّر · حالة حية من سجل التنفيذ، وليست بطاقة تجميلية.</p></div></div><span class="ceo24badge">CONNECTED</span></div><div class="ceo24grid"><div class="ceo24card"><h3>الحالة</h3><div class="ceo24value">'+esc(msg)+'</div></div></div>';
}
async function load(){
 const btn=root.querySelector('#ceo24refresh');if(btn)btn.disabled=true;
 try{
  const started=performance.now();
  const r=await fetch('/api/owner-dashboard-data?action=executive',{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const body=await r.json();
  const ex=body.executive||body.data||body;
  const d=ex.decision_center||{};
  const actions=Array.isArray(d.recent_executive_actions)?d.recent_executive_actions:[];
  const current=actions.find(a=>!closed.has(String(a.status||'').toLowerCase()))||null;
  const lastVerified=actions.find(a=>closed.has(String(a.status||'').toLowerCase()))||null;
  const latency=Math.round((performance.now()-started)*10)/10;
  const state=current?'EXECUTING':'READY';
  root.innerHTML='<div class="ceo24head"><div class="ceo24brand"><div class="ceo24mark">B</div><div><h2>BARMAN Executive OS <small>· CEO</small></h2><p>المدير التنفيذي الوحيد المعتمد لدبّر · Observe → Assess → Prioritize → Act → Verify → Record</p></div></div><div><span class="ceo24badge">'+esc(state)+'</span><button id="ceo24refresh" class="ceo24refresh" type="button">تحديث حالة CEO</button></div></div>'+
  '<div class="ceo24grid">'+
  '<article class="ceo24card"><h3>المهمة التنفيذية الحالية</h3><div class="ceo24value '+(current?'ceo24warn':'ceo24ok')+'">'+esc(current?actionTitle(current):'لا توجد مهمة مفتوحة — CEO جاهز للمهمة التالية')+'</div><div class="ceo24muted">الحالة: '+esc(current?.status||'ready')+(current?.started_at?' · بدأت '+esc(when(current.started_at)):'')+'</div></article>'+
  '<article class="ceo24card"><h3>آخر إجراء موثّق</h3><div class="ceo24value">'+esc(actionTitle(lastVerified))+'</div><div class="ceo24muted">'+esc(lastVerified?.status||'لا يوجد إجراء مغلق')+(lastVerified?.completed_at?' · '+esc(when(lastVerified.completed_at)):'')+'</div></article>'+
  '<article class="ceo24card"><h3>صلاحية CEO</h3><div class="ceo24row"><span>AUTO</span><b>التنفيذ الآمن والقابل للعكس</b></div><div class="ceo24row"><span>OWNER_ONLY</span><b>الدفع · القانون · KYC · OTP</b></div><div class="ceo24row"><span>Truth policy</span><b>ACTION → ARTIFACT → TEST → EVIDENCE</b></div></article>'+
  '<article class="ceo24card"><h3>دورة الإدارة</h3><div class="ceo24flow"><b>Observe</b><b>Assess</b><b>Prioritize</b><b>Act</b><b>Verify</b><b>Record</b></div><div class="ceo24muted">لا تُغلق مهمة بلا دليل تحقق.</div></article>'+
  '<article class="ceo24card"><h3>اتصال CEO باللوحة</h3><div class="ceo24row"><span>Executive feed</span><b class="ceo24ok">LIVE</b></div><div class="ceo24row"><span>آخر تحديث</span><b>'+esc(when(ex.generated_at))+'</b></div><div class="ceo24row"><span>قراءة الحالة</span><b>'+esc(latency)+' ms</b></div></article>'+
  '<article class="ceo24card"><h3>قرار المالك</h3><div class="ceo24value">لا يُطلب منك تدخل إلا عند OWNER_ONLY أو blocker حقيقي.</div><div class="ceo24muted">طلبات التنفيذ العادية تبقى ضمن صلاحية BARMAN Executive OS.</div></article>'+
  '</div>';
  root.querySelector('#ceo24refresh')?.addEventListener('click',load);
 }catch(err){
  root.innerHTML='<div class="ceo24head"><div class="ceo24brand"><div class="ceo24mark">B</div><div><h2>BARMAN Executive OS <small>· CEO</small></h2><p>المدير التنفيذي المعتمد لدبّر.</p></div></div><span class="ceo24badge ceo24error">DATA UNAVAILABLE</span></div><div class="ceo24grid"><article class="ceo24card"><h3>حالة الاتصال</h3><div class="ceo24value ceo24error">تعذر قراءة سجل CEO الآن.</div><div class="ceo24muted">لم يتم افتراض أي حالة تنفيذية.</div><button id="ceo24refresh" class="ceo24refresh" type="button">إعادة المحاولة</button></article></div>';
  root.querySelector('#ceo24refresh')?.addEventListener('click',load);
 }
}
shell();load();
})();</script>`;

export default function handler(req,res){
 const end=res.end.bind(res);let body='';
 res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};
 return base(req,res);
}
