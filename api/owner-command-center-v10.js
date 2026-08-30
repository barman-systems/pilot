import base from './owner-command-center-v9.js';

const ENHANCE=String.raw`<style>
.oc10grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.oc10full{grid-column:1/-1}.oc10box{border:1px solid var(--line);background:#121619;border-radius:14px;padding:12px;margin-top:10px}.oc10box h3{margin:0 0 9px;font-size:12px}.oc10box input,.oc10box select,.oc10box textarea{width:100%;box-sizing:border-box}.oc10box textarea{min-height:72px;resize:vertical}.oc10state{font-size:9px;color:var(--muted);margin-top:8px;line-height:1.7}@media(max-width:760px){.oc10grid{grid-template-columns:1fr}.oc10full{grid-column:auto}}</style>
<script>(()=>{const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const generic=$('#oc9Action');if(generic&&!Array.from(generic.options).some(o=>o.value==='set_service_active'))generic.insertAdjacentHTML('beforeend','<option value="set_service_active">تفعيل / إيقاف خدمة</option>');
const genericValue=$('#oc9Value');if(generic&&genericValue){generic.addEventListener('change',()=>{if(generic.value==='set_service_active')genericValue.placeholder='true أو false'});}
async function call(body){const r=await fetch('/api/owner-action-bridge',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/owner';return null}if(!r.ok||!j.ok)throw new Error(j.error||'OWNER_ACTION_FAILED');return j}
function businessId(){return String($('#businessId')?.value||$('#oc7Business')?.value||$('#oc7ActionBusiness')?.value||'').trim()}
const gov=$('#governance');if(!gov)return;
const panel=document.createElement('div');panel.className='oc10box';panel.innerHTML='<h3>الدعم 360 — تنفيذ مدقّق</h3><div class="oc10grid">'+
'<input id="oc10Business" placeholder="Business ID">'+
'<input id="oc10Customer" placeholder="Customer No مثال DAB-000001">'+
'<select id="oc10Category"><option value="general">عام</option><option value="access">دخول</option><option value="billing">فوترة</option><option value="data">بيانات</option><option value="recovery">استعادة</option><option value="whatsapp">WhatsApp</option><option value="integration">تكامل</option><option value="bug">خلل</option><option value="privacy">خصوصية</option><option value="other">أخرى</option></select>'+
'<select id="oc10Priority"><option value="normal">عادي</option><option value="low">منخفض</option><option value="high">مرتفع</option><option value="urgent">عاجل</option></select>'+
'<input class="oc10full" id="oc10Subject" placeholder="موضوع القضية">'+
'<textarea class="oc10full" id="oc10Initial" placeholder="ملاحظة أولية اختيارية"></textarea>'+
'<input class="oc10full" id="oc10Reason" placeholder="سبب التنفيذ — إلزامي">'+
'<input id="oc10Confirm" placeholder="اكتب EXECUTE">'+
'<button class="btn primary" id="oc10Create">فتح قضية</button></div><div id="oc10CreateState" class="oc10state"></div>'+
'<hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><div class="oc10grid"><input id="oc10Case" placeholder="Case ID"><select id="oc10Status"><option value="waiting">waiting</option><option value="open">open</option><option value="resolved">resolved</option></select><textarea class="oc10full" id="oc10Note" placeholder="ملاحظة جديدة"></textarea><input class="oc10full" id="oc10Reason2" placeholder="سبب التنفيذ — إلزامي"><input id="oc10Confirm2" placeholder="اكتب EXECUTE"><button class="btn" id="oc10NoteBtn">إضافة ملاحظة</button><button class="btn" id="oc10StatusBtn">تغيير الحالة</button></div><div id="oc10CaseState" class="oc10state"></div>';
gov.appendChild(panel);
async function execute(action,entity,payload,reason,confirmation,state){const id=businessId()||String($('#oc10Business').value||'').trim();if(!id){state.textContent='Business ID مطلوب.';return}state.textContent='جارٍ التنفيذ…';try{const j=await call({business_id:id,action,entity_id:entity||null,payload,reason,confirmation});if(!j)return;const result=j.result||{};state.innerHTML='<span class="oc7good">تم التنفيذ وتسجيله.</span> '+(result.entity_id?'ID: <code>'+esc(result.entity_id)+'</code>':'');if(result.entity_id&&action==='support_create_case')$('#oc10Case').value=result.entity_id;if(typeof window.oc9LoadAudit==='function')window.oc9LoadAudit(id)}catch(e){state.innerHTML='<span class="oc7bad">رفض التنفيذ:</span> '+esc(e.message)}}
$('#oc10Create').onclick=()=>execute('support_create_case',null,{customer_no:$('#oc10Customer').value,category:$('#oc10Category').value,priority:$('#oc10Priority').value,subject:$('#oc10Subject').value,initial_note:$('#oc10Initial').value},$('#oc10Reason').value,$('#oc10Confirm').value,$('#oc10CreateState'));
$('#oc10NoteBtn').onclick=()=>execute('support_add_note',$('#oc10Case').value,{note:$('#oc10Note').value},$('#oc10Reason2').value,$('#oc10Confirm2').value,$('#oc10CaseState'));
$('#oc10StatusBtn').onclick=()=>execute('support_set_status',$('#oc10Case').value,{status:$('#oc10Status').value},$('#oc10Reason2').value,$('#oc10Confirm2').value,$('#oc10CaseState'));
})();</script>`;

export default function handler(req,res){const end=res.end.bind(res);let body='';res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',ENHANCE+'</body>'):body,...args)};return base(req,res)}
