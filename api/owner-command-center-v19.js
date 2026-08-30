import base from './owner-command-center-v18.js';

const PATCH=String.raw`<script>(()=>{
  const labels={store:'متجر',laundry:'مغسلة',car_wash:'غسيل سيارات',clinic:'عيادة',creator:'منشئ محتوى',salon:'صالون',real_estate:'عقارات',services:'خدمات',other:'أخرى'};
  const allowed=Object.keys(labels);
  function upgrade(){
    const old=document.querySelector('#oc17Type');
    if(!old||old.tagName==='SELECT')return;
    const select=document.createElement('select');
    select.id='oc17Type';select.className=old.className||'field';select.setAttribute('aria-label','نوع النشاط');
    select.innerHTML=allowed.map(v=>'<option value="'+v+'">'+labels[v]+'</option>').join('');
    const current=String(old.value||'').trim();
    if(allowed.includes(current))select.value=current;
    old.replaceWith(select);
    const note=document.createElement('div');note.className='state';note.style.marginTop='6px';note.textContent='نوع النشاط من قائمة دبّر المعتمدة فقط.';
    select.parentElement?.appendChild(note);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(upgrade,0));else setTimeout(upgrade,0);
  new MutationObserver(upgrade).observe(document.documentElement,{childList:true,subtree:true});
})();</script>`;
export default function handler(req,res){const end=res.end.bind(res);let body='';res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};return base(req,res)}
