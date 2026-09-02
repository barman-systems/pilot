import base from './owner-command-center-v24.js';

const PATCH=String.raw`<style>
.ownerTabs25{position:sticky;top:0;z-index:40;display:flex;gap:7px;overflow-x:auto;overscroll-behavior-x:contain;padding:7px;margin:0 0 10px;border:1px solid #2e414c;border-radius:14px;background:#0b1115f2;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);scrollbar-width:none}.ownerTabs25::-webkit-scrollbar{display:none}.ownerTab25{flex:0 0 auto;min-height:42px;border:1px solid #31434d;background:#121b20;color:#aebbc3;border-radius:11px;padding:8px 13px;font-size:10px;font-weight:850;cursor:pointer}.ownerTab25[aria-selected="true"]{background:#d7ff5f;color:#10130b;border-color:#d7ff5f}.ownerTabHidden25{display:none!important}.ownerTab25:focus-visible{outline:3px solid #d7ff5f;outline-offset:2px}@media(max-width:520px){.ownerTabs25{margin-inline:-2px;padding:6px;border-radius:12px}.ownerTab25{min-height:44px;padding:8px 12px}}
</style><script>(()=>{
const host=document.querySelector('#customers');if(!host)return;
const classify=el=>{
 if(el.id==='barmanExecutiveOsCeo'||el.classList?.contains('ceo24'))return'ceo';
 if(el.id==='ownerExecutiveV23'||el.classList?.contains('oc23')||el.classList?.contains('oc22'))return'executive';
 if(el.classList?.contains('oc20')||el.classList?.contains('oc16')||el.classList?.contains('oc15diag'))return'support';
 if(el.classList?.contains('oc21'))return'feedback';
 return'customers';
};
let nav=null,active='ceo';
function apply(){
 if(!nav)return;
 [...host.children].forEach(el=>{if(el===nav)return;const key=classify(el);el.dataset.ownerTab25=key;el.classList.toggle('ownerTabHidden25',key!==active)});
 nav.querySelectorAll('[data-tab25]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab25===active)));
 try{sessionStorage.setItem('dabbir_owner_tab25',active)}catch{}
}
function setTab(key){active=key;apply();host.scrollIntoView({behavior:'smooth',block:'start'});}
function setup(){
 nav=document.createElement('nav');nav.className='ownerTabs25';nav.setAttribute('aria-label','تبويبات مركز مالك دبّر');
 const tabs=[['ceo','CEO'],['executive','الإدارة'],['customers','العملاء'],['support','الدعم'],['feedback','الملاحظات']];
 nav.innerHTML=tabs.map(([k,l])=>'<button type="button" class="ownerTab25" data-tab25="'+k+'" aria-selected="false">'+l+'</button>').join('');
 host.prepend(nav);
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-tab25]');if(b)setTab(b.dataset.tab25)});
 let saved='';try{saved=sessionStorage.getItem('dabbir_owner_tab25')||''}catch{};
 active=tabs.some(x=>x[0]===saved)?saved:'ceo';
 apply();
 new MutationObserver(()=>apply()).observe(host,{childList:true});
 window.__dabbirOwnerTabs={version:'v25',open:setTab,current:()=>active};
}
setup();
})();</script>`;

export default function handler(req,res){
 const end=res.end.bind(res);let body='';
 res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};
 return base(req,res);
}
