import base from './owner-command-center-v10.js';

const PATCH=String.raw`<style>
.oc11biz{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.oc11biz .btn{min-height:34px;padding:5px 9px}.oc11meta{direction:ltr;text-align:right}
</style>
<script>(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function businesses(x){return Array.isArray(x?.businesses)?x.businesses.filter(b=>b&&b.id):[]}
function render(rows){
 const box=$('#customerResults'),status=$('#customerStatus'); if(!box||!status)return;
 box.innerHTML='';
 if(!rows.length){box.innerHTML='<div class="item muted">لا توجد نتائج مطابقة.</div>';status.textContent='لا توجد نتائج.';return}
 status.textContent='النتائج: '+rows.length;
 rows.forEach(x=>{
   const bs=businesses(x), el=document.createElement('div');el.className='item';
   const no=x.customer_no||'—', email=x.email||'', phone=x.phone||'', access=x.access_status||'active';
   const names=bs.map(b=>b.name).filter(Boolean).join('، ');
   el.innerHTML='<b>'+esc(no)+(names?' · '+esc(names):'')+'</b><small class="oc11meta">'+esc(email)+(phone?' · '+esc(phone):'')+'</small><div class="chips"><span class="chip">'+esc(access)+'</span><span class="chip">أنشطة: '+bs.length+'</span></div><div class="oc11biz">'+bs.map(b=>'<button class="btn" data-biz="'+esc(b.id)+'">إدارة '+esc(b.name||'النشاط')+'</button>').join('')+'</div>';
   box.appendChild(el);
 });
 box.querySelectorAll('[data-biz]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.biz;if($('#businessId'))$('#businessId').value=id;if($('#oc9Business'))$('#oc9Business').value=id;if($('#oc10Business'))$('#oc10Business').value=id;location.hash='operations';$('#loadOps')?.click()});
}
async function search(){
 const input=$('#customerQuery'),status=$('#customerStatus');if(!input||!status)return;
 const q=String(input.value||'').trim();if(!q){status.textContent='أدخل رقم DAB أو البريد أو الهاتف أو اسم النشاط.';input.focus();return}
 status.textContent='جاري البحث…';
 try{
   const r=await fetch('/api/owner-dashboard-data?action=search&q='+encodeURIComponent(q),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
   const p=await r.json().catch(()=>({}));
   if(r.status===401){location.replace('/owner');return}
   if(!r.ok||!p.ok)throw new Error(p.error||('HTTP_'+r.status));
   const rows=Array.isArray(p.accounts)?p.accounts:[];
   render(rows);
 }catch(e){status.textContent='تعذر البحث: '+String(e?.message||'SEARCH_FAILED');$('#customerResults').innerHTML=''}
}
const btn=$('#customerSearch');if(btn)btn.onclick=search;
const input=$('#customerQuery');if(input)input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search()}});
const global=$('#globalSearch');if(global){global.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();location.hash='customers';if(input)input.value=global.value;search()}});}
})();</script>`;

export default function handler(req,res){const end=res.end.bind(res);let body='';res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};return base(req,res)}
