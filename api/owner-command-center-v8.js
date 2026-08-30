import base from './owner-command-center-v7.js';

const ENHANCE=String.raw`<script>(()=>{const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function bridge(id){const r=await fetch('/api/owner-platform-bridge?business_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/owner';return null}if(!r.ok||!j.ok)throw new Error(j.error||'OWNER_BRIDGE_FAILED');return j}
function currentId(){return String($('#businessId')?.value||$('#oc7Business')?.value||$('#oc7ActionBusiness')?.value||'').trim()}
async function renderBridge(id){
  let data;try{data=await bridge(id)}catch(e){if($('#oc7Billing'))$('#oc7Billing').innerHTML='<span class="oc7bad">Bridge غير متاح</span> · '+esc(e.message);if($('#oc7Whatsapp'))$('#oc7Whatsapp').innerHTML='<span class="oc7bad">Bridge غير متاح</span>';if($('#oc7ActionStatus'))$('#oc7ActionStatus').innerHTML='<span class="oc7bad">تعذر تحميل الأولويات عبر منصة المالك.</span>';return}
  const b=data.billing||{},w=data.whatsapp||{},p=data.priorities||{},m=p.metrics||{},items=Array.isArray(p.items)?p.items:[];
  if($('#oc7Billing'))$('#oc7Billing').innerHTML='<b class="'+(['active','trialing'].includes(String(b.status))?'oc7good':'oc7warn')+'">'+esc(b.status||'unknown')+'</b><br>قراءة منصة المالك · بدون انتحال جلسة العميل'+(b.trial_ends_at?'<br>نهاية التجربة: '+esc(b.trial_ends_at):'')+(b.current_period_ends_at?'<br>نهاية الفترة: '+esc(b.current_period_ends_at):'')+(b.last_invoice_status?'<br>آخر فاتورة: '+esc(b.last_invoice_status):'');
  if($('#oc7Whatsapp'))$('#oc7Whatsapp').innerHTML='<b class="'+(w.connected?'oc7good':w.configured?'oc7warn':'oc7bad')+'">'+esc(w.status||'not_linked')+'</b><br>مهيأ: '+(w.configured?'نعم':'لا')+' · متصل: '+(w.connected?'نعم':'لا')+(w.display_phone_number?'<br>الرقم: '+esc(w.display_phone_number):'')+(w.verified_name?'<br>الاسم: '+esc(w.verified_name):'')+(w.last_verified_at?'<br>آخر تحقق: '+esc(w.last_verified_at):'')+(w.last_error?'<br><span class="oc7warn">'+esc(w.last_error)+'</span>':'');
  if($('#oc7ActionStatus'))$('#oc7ActionStatus').innerHTML='Bridge المالك · حرج: <b>'+Number(m.urgent||0)+'</b> · متابعة: <b>'+Number(m.warning||0)+'</b> · الإجمالي: <b>'+Number(m.total||items.length)+'</b>';
  if($('#oc7Actions'))$('#oc7Actions').innerHTML=items.slice(0,20).map(x=>'<div class="oc7item"><b>'+esc(x.title_ar||x.type)+'</b><small>'+esc(x.detail_ar||'')+'</small><span class="oc7pill">'+esc(x.severity||'info')+'</span></div>').join('')||'<div class="oc7item oc7good">لا توجد عناصر تحتاج تدخلًا الآن.</div>';
}
const load=$('#oc7Load');if(load)load.onclick=()=>{const id=currentId();if(id){$('#oc7Business').value=id;renderBridge(id)}};
const actions=$('#oc7ActionLoad');if(actions)actions.onclick=()=>{const id=currentId();if(id){$('#oc7ActionBusiness').value=id;renderBridge(id)}};
window.addEventListener('hashchange',()=>{const id=currentId();if(id&&(location.hash==='#system'||location.hash==='#governance'))renderBridge(id)});
const note=document.createElement('div');note.className='notice';note.style.marginTop='10px';note.innerHTML='<b>Owner Platform Bridge v1:</b> قراءة مركزية فقط للفوترة وWhatsApp والأولويات. لا تنفيذ مالي ولا تغيير اتصال ولا تجاوز لصلاحيات صاحب النشاط.';$('#system')?.appendChild(note);
})();</script>`;

export default function handler(req,res){const end=res.end.bind(res);let body='';res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',ENHANCE+'</body>'):body,...args)};return base(req,res)}
