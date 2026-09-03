// Authoritative DABBIR owner command center entrypoint.
// Production and tests must target this stable file. Numbered owner-command-center files are legacy implementation history/rollback layers only; do not create new numbered production entrypoints.
import dashboard from './owner-command-center-v29.js';

const PATCH=String.raw`<style id="ownerAuthoritativeUx">
/* Stable owner-command-center UX layer. Keep improvements here instead of creating another numbered production entrypoint. */
#nav{align-items:stretch}
#nav a,#nav .ownerMainTab29{min-height:46px;display:flex;align-items:center;justify-content:center}
#nav [data-owner-active="true"]{background:#d7ff5f!important;color:#10130b!important;border-color:#d7ff5f!important}
.hero{margin-block:12px 16px}.hero .eyebrow{letter-spacing:.14em}.hero p{max-width:66ch}
.ownerLeadTabs29{box-shadow:0 10px 28px #0003}
.ceocmd27list,.oc23list{max-height:340px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.ceocmd27list::-webkit-scrollbar,.oc23list::-webkit-scrollbar{width:7px}.ceocmd27list::-webkit-scrollbar-thumb,.oc23list::-webkit-scrollbar-thumb{background:#33464f;border-radius:999px}
.ownerCommandCounter{margin-top:5px;color:#8fa1aa;font-size:12px;text-align:end;font-variant-numeric:tabular-nums}
.ownerSupportCta{margin-top:10px;min-height:46px;border:1px solid #d7ff5f;background:#d7ff5f;color:#10130b;border-radius:11px;padding:9px 14px;font-size:14px;font-weight:900;cursor:pointer}
.ownerSupportCta:focus-visible{outline:3px solid #d7ff5f;outline-offset:3px}
@media(max-width:760px){
  .top{gap:8px}.topActions{gap:8px}
  #nav{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px!important;overflow:visible!important;padding-block:8px 10px!important}
  #nav a,#nav .ownerMainTab29{width:100%;min-width:0!important;min-height:46px!important;padding:8px 6px!important;font-size:13px!important;text-align:center!important;white-space:normal!important;line-height:1.25}
  .hero{margin:8px 0 12px}.hero .eyebrow{font-size:11px!important}.hero h1{font-size:24px!important;margin-block:5px 7px!important}.hero p{font-size:13px!important;line-height:1.65!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .ownerLeadTabs29{margin-top:8px!important}
  .ceocmd27list,.oc23list{max-height:300px}
}
@media(max-width:390px){
  #nav{grid-template-columns:repeat(2,minmax(0,1fr))}
  #nav a,#nav .ownerMainTab29{font-size:13px!important}
  .hero p{-webkit-line-clamp:1}
}
</style><script>(()=>{
const $=s=>document.querySelector(s);

// Arabic-first operating language while preserving technical statuses where they carry operational meaning.
const brand=$('.brand small');if(brand)brand.textContent='مركز قيادة مالك دبّر';
const eye=$('#home .hero .eyebrow');if(eye)eye.textContent='مركز القيادة';
const authorityBadge=$('#ownerExecutiveOperationsV26 .ops26head .ops26badge');if(authorityBadge)authorityBadge.textContent='صلاحية مالك المنصة';
const deskBadge=$('#ownerCeoCommandDeskV27 .ops26badge');if(deskBadge)deskBadge.textContent='مكتب أوامر CEO';

// Make the active primary destination unambiguous, including Support and Feedback which share #customers.
const nav=$('#nav');
function currentPrimary(){
  const hash=(location.hash||'#home').slice(1)||'home';
  if(hash!=='customers')return hash;
  const sub=window.__dabbirOwnerTabs?.current?.();
  return sub==='support'||sub==='feedback'?sub:'customers';
}
function markPrimary(key=currentPrimary()){
  if(!nav)return;
  nav.querySelectorAll('a[href^="#"],[data-owner-customer29]').forEach(el=>{
    const itemKey=el.dataset.ownerCustomer29||(el.getAttribute('href')||'').replace(/^#/,'');
    const active=itemKey===key;
    el.dataset.ownerActive=String(active);
    if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
}
nav?.addEventListener('click',e=>{const el=e.target.closest('a[href^="#"],[data-owner-customer29]');if(!el)return;const key=el.dataset.ownerCustomer29||(el.getAttribute('href')||'').replace(/^#/,'');setTimeout(()=>markPrimary(key),0)},true);
addEventListener('hashchange',()=>setTimeout(()=>markPrimary(),0));
document.addEventListener('click',e=>{const tab=e.target.closest?.('[data-tab25]');if(!tab)return;const key=tab.dataset.tab25;setTimeout(()=>markPrimary(key==='support'||key==='feedback'?key:'customers'),0)},true);
setTimeout(()=>markPrimary(),0);

// Long command/history lists stay usable instead of turning a single tab into another endless page.
const commandText=$('#ceoCommandText27');
if(commandText&&!$('#ownerCommandCounter')){
  const counter=document.createElement('div');counter.id='ownerCommandCounter';counter.className='ownerCommandCounter';counter.setAttribute('aria-live','polite');
  commandText.insertAdjacentElement('afterend',counter);
  const update=()=>{counter.textContent=String(commandText.value.length)+' / 4000';counter.style.color=commandText.value.length>3600?'#ffd87a':'#8fa1aa'};
  commandText.addEventListener('input',update);update();
}

// Support must never look broken when no customer has been selected. Offer the correct next action in place.
function hasCustomer(){return /DAB-[0-9]{6,}/i.test(String($('#contextCustomer')?.textContent||''))}
function ensureSupportCta(){
  const state=$('#oc20State');if(!state)return;
  let cta=$('#ownerSupportChooseCustomer');
  const needs=!hasCustomer()&&/اختر|اختيار/.test(String(state.textContent||''));
  if(needs&&!cta){
    cta=document.createElement('button');cta.type='button';cta.id='ownerSupportChooseCustomer';cta.className='ownerSupportCta';cta.textContent='اختيار عميل الآن';
    cta.addEventListener('click',()=>{location.hash='customers';window.__dabbirOwnerTabs?.open('customers');setTimeout(()=>$('#customers')?.scrollIntoView({behavior:'smooth',block:'start'}),0)});
    state.insertAdjacentElement('afterend',cta);
  }
  if(cta)cta.hidden=!needs;
}
const supportState=$('#oc20State');if(supportState){ensureSupportCta();new MutationObserver(ensureSupportCta).observe(supportState,{childList:true,subtree:true,characterData:true})}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-owner-customer29="support"],[data-tab25="support"]'))setTimeout(ensureSupportCta,60)},true);

// Keyboard navigation for the leadership segmented control.
const lead=$('#ownerLeadTabs29');
lead?.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const buttons=[...lead.querySelectorAll('[data-lead29]')];if(!buttons.length)return;
  const current=Math.max(0,buttons.indexOf(document.activeElement));let next=current;
  if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else if(e.key==='ArrowRight')next=(current+1)%buttons.length;else next=(current-1+buttons.length)%buttons.length;
  e.preventDefault();buttons[next].focus();buttons[next].click();
});

window.__dabbirOwnerCommandCenter={authoritative:true,entrypoint:'owner-command-center.js',refreshPrimary:markPrimary};
})();</script>`;

export default function handler(req,res){
  const end=res.end.bind(res);let body='';
  res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};
  return dashboard(req,res);
}
