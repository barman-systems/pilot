import base from './owner-command-center-v28.js';

const PATCH=String.raw`<style id="ownerTabsFixV29">
.ownerLeadTabs29{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0;padding:7px;border:1px solid #2e414c;border-radius:14px;background:#0b1115}.ownerLeadTab29{min-height:46px;border:1px solid #31434d;background:#121b20;color:#b9c4cb;border-radius:11px;padding:9px 12px;font-size:13px;font-weight:900;cursor:pointer}.ownerLeadTab29[aria-selected="true"]{background:#d7ff5f;color:#10130b;border-color:#d7ff5f}.ownerLeadHidden29{display:none!important}.ownerLeadTab29:focus-visible,.ownerMainTab29:focus-visible{outline:3px solid #d7ff5f;outline-offset:2px}.nav .ownerMainTab29{flex:0 0 auto;min-height:46px;border:0;background:transparent;color:#aab1b8;text-align:start;border-radius:11px;padding:9px 14px;font-size:14px;font-weight:850;cursor:pointer;white-space:nowrap}.nav .ownerMainTab29:hover,.nav .ownerMainTab29.on{background:#1a1e21;color:#fff}.top .command{display:none!important}.top{gap:10px}.ops26zone[data-lead29-empty="true"]{display:none!important}
@media(max-width:760px){.ownerLeadTabs29{grid-template-columns:1fr 1fr;position:static}.nav{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}.nav::-webkit-scrollbar{display:none}.nav .ownerMainTab29{font-size:13px;padding-inline:12px}.top .topbtn{min-width:74px}.ops26{margin-top:8px!important}}
@media(max-width:390px){.ownerLeadTabs29{gap:6px;padding:6px}.ownerLeadTab29{font-size:12px;padding-inline:8px}}
</style><script>(()=>{
const $=s=>document.querySelector(s);

// The global header search duplicated the real customer search and did not add a reliable workflow.
const globalSearch=$('#globalSearch')||$('#cmd');
if(globalSearch){const command=globalSearch.closest('.command');if(command)command.remove();else globalSearch.remove()}

const hub=$('#ownerExecutiveOperationsV26');
if(hub&&!$('#ownerLeadTabs29')){
  const tabs=document.createElement('nav');
  tabs.id='ownerLeadTabs29';tabs.className='ownerLeadTabs29';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','تبويبات القيادة');
  const defs=[['overview','الملخص'],['ceo','أوامر CEO'],['executive','الإدارة'],['execute','التنفيذ']];
  tabs.innerHTML=defs.map(x=>'<button type="button" class="ownerLeadTab29" role="tab" data-lead29="'+x[0]+'" aria-selected="false">'+x[1]+'</button>').join('');
  const head=hub.querySelector('.ops26head');if(head)head.insertAdjacentElement('afterend',tabs);else hub.prepend(tabs);
  const overview=[hub.querySelector('.ops26grid'),hub.querySelector('.ops26quick'),hub.querySelector('.ops26note')].filter(Boolean);
  const command=$('#ownerCeoCommandDeskV27');
  const leadership=$('#ops26Leadership');
  const authority=$('#barmanExecutiveOsCeo');
  const executive=$('#ownerExecutiveV23');
  const truth=leadership?.querySelector('.oc22')||$('#customers .oc22');
  const executor=$('#ops26Executor');
  let active='overview';try{const saved=sessionStorage.getItem('dabbir_owner_lead29');if(defs.some(x=>x[0]===saved))active=saved}catch{}
  function show(key){
    active=defs.some(x=>x[0]===key)?key:'overview';
    overview.forEach(el=>el.classList.toggle('ownerLeadHidden29',active!=='overview'));
    if(command)command.classList.toggle('ownerLeadHidden29',active!=='ceo');
    if(executor)executor.classList.toggle('ownerLeadHidden29',active!=='execute');
    if(authority)authority.classList.toggle('ownerLeadHidden29',active!=='executive');
    if(executive)executive.classList.toggle('ownerLeadHidden29',active!=='executive');
    if(truth)truth.classList.toggle('ownerLeadHidden29',active!=='executive');
    if(leadership){const visible=active==='executive'&&[authority,executive,truth].some(Boolean);leadership.classList.toggle('ownerLeadHidden29',!visible);leadership.dataset.lead29Empty=String(!visible)}
    tabs.querySelectorAll('[data-lead29]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.lead29===active)));
    try{sessionStorage.setItem('dabbir_owner_lead29',active)}catch{}
  }
  tabs.addEventListener('click',e=>{const b=e.target.closest('[data-lead29]');if(b)show(b.dataset.lead29)});
  show(active);
  window.__dabbirOwnerLeadershipTabsV29={version:'v29',open:show,current:()=>active};
}

function customerHasContext(){return /DAB-[0-9]{6,}/i.test(String($('#contextCustomer')?.textContent||''))}
function refreshCustomerWorkspace(key){
  if(key==='feedback'){window.__dabbirFeedbackInbox?.refresh();return}
  if(key==='support'){
    if(customerHasContext())$('#oc20Refresh')?.click();
    else{const state=$('#oc20State');if(state){state.textContent='اختر عميلًا من تبويب العملاء أولًا، ثم ارجع إلى الدعم.';state.className='state'}}
  }
}
function openCustomerWorkspace(key){
  location.hash='customers';
  const open=()=>{
    if(window.__dabbirOwnerTabs)window.__dabbirOwnerTabs.open(key);else document.querySelector('[data-tab25="'+key+'"]')?.click();
    refreshCustomerWorkspace(key);
  };
  open();setTimeout(open,80);
}

// Make support and feedback first-class, working navigation targets instead of hidden sub-views.
const nav=$('#nav');
if(nav&&!nav.querySelector('[data-owner-customer29]')){
  const customerLink=nav.querySelector('a[href="#customers"]');if(customerLink)customerLink.textContent='العملاء';
  const support=document.createElement('button');support.type='button';support.className='ownerMainTab29';support.dataset.ownerCustomer29='support';support.textContent='الدعم';
  const feedback=document.createElement('button');feedback.type='button';feedback.className='ownerMainTab29';feedback.dataset.ownerCustomer29='feedback';feedback.textContent='الملاحظات';
  if(customerLink){customerLink.insertAdjacentElement('afterend',feedback);customerLink.insertAdjacentElement('afterend',support)}else{nav.append(support,feedback)}
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-owner-customer29]');if(!b)return;e.preventDefault();openCustomerWorkspace(b.dataset.ownerCustomer29)});
}

// Existing nested customer tabs also refresh their real data path when opened.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-tab25="support"],[data-tab25="feedback"]');if(!b)return;setTimeout(()=>refreshCustomerWorkspace(b.dataset.tab25),0)},true);
window.__dabbirOwnerWorkspaceV29={version:'v29',openCustomer:openCustomerWorkspace,globalSearchRemoved:true};
})();</script>`;

export default function handler(req,res){
 const end=res.end.bind(res);let body='';
 res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};
 return base(req,res);
}
