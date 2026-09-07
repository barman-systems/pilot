const script=String.raw`(()=>{
  if(window.__dabbirPlatformCustomerSupportThreadUi)return;
  window.__dabbirPlatformCustomerSupportThreadUi=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(v))}catch{return String(v)}};
  const copy=()=>ar()?{visible:'محادثة مرئية للعميل',customer:'العميل',support:'فريق الدعم',reply:'رد على العميل',replyPh:'اكتب الرد الذي سيظهر للعميل…',sent:'تم إرسال الرد للعميل.',failed:'تعذر إرسال الرد.'}:{visible:'Customer-visible thread',customer:'Customer',support:'Support team',reply:'Reply to customer',replyPh:'Write the reply the customer will see…',sent:'Reply sent to customer.',failed:'Could not send reply.'};
  const notify=m=>{try{if(typeof toast==='function')toast(m)}catch{}};
  const api=async(url,options={})=>{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return{r,j}};
  let busy=false,lastNo='',lastFetch=0,data=null;

  const style=document.createElement('style');
  style.dataset.dabbirPlatformSupportThread='v1';
  style.textContent='.pcst{border:1px solid #31405d;background:#101725;border-radius:12px;padding:10px;margin-top:9px}.pcstHead{display:flex;justify-content:space-between;gap:8px;font-size:9px;font-weight:900}.pcstRef{direction:ltr;color:var(--accent)}.pcstMsg{border-radius:10px;background:#171d27;padding:8px;margin-top:6px;font-size:9px;line-height:1.55}.pcstMsg.customer{background:#17243a}.pcstMsg b{display:block;font-size:8px}.pcstMsg small{display:block;color:var(--muted);font-size:7px;margin-top:3px}.pcstReply{display:flex;gap:6px;margin-top:8px}.pcstReply textarea{flex:1;border:1px solid var(--line);background:#0e1116;color:#fff;border-radius:9px;padding:8px;min-height:48px;resize:vertical}@media(max-width:700px){.pcstReply{flex-direction:column}}';
  document.head.appendChild(style);

  function customerNo(){for(const n of qa('#pcBody .pcCode')){const v=String(n.textContent||'').trim().toUpperCase();if(/^DAB-[0-9]{6,}$/.test(v))return v}return null}

  async function fetchData(no,force=false){
    if(busy)return data;
    if(!force&&data&&lastNo===no&&Date.now()-lastFetch<10000)return data;
    busy=true;
    try{const {r,j}=await api('/api/platform-customer-support?customer_no='+encodeURIComponent(no));if(!r.ok)return null;data=j.support||{};lastNo=no;lastFetch=Date.now();return data}finally{busy=false}
  }

  function renderCase(card,c,no){
    card.querySelector('.pcst')?.remove();
    if(!c.customer_visible)return;
    const t=copy(),messages=Array.isArray(c.messages)?c.messages:[];
    const thread=messages.map(m=>'<div class="pcstMsg '+(m.author_kind==='customer'?'customer':'support')+'"><b>'+esc(m.author_kind==='customer'?t.customer:t.support)+'</b>'+esc(m.body)+'<small>'+esc(fmt(m.created_at))+'</small></div>').join('');
    const box=document.createElement('div');box.className='pcst';box.innerHTML='<div class="pcstHead"><span>'+esc(t.visible)+'</span><span class="pcstRef">'+esc(c.reference||'—')+'</span></div>'+thread+'<div class="pcstReply"><textarea maxlength="4000" placeholder="'+esc(t.replyPh)+'"></textarea><button class="primary">'+esc(t.reply)+'</button></div>';
    const head=card.querySelector('.pcsHead');if(head?.nextSibling)card.insertBefore(box,head.nextSibling);else card.prepend(box);
    const input=box.querySelector('textarea'),button=box.querySelector('button');
    button.onclick=async()=>{const message=String(input.value||'').trim();if(message.length<2||button.disabled)return;button.disabled=true;const {r}=await api('/api/platform-customer-support',{method:'POST',body:JSON.stringify({action:'reply_customer',customer_no:no,case_id:c.id,message})});if(r.ok){notify(t.sent);input.value='';data=null;await mount(true)}else notify(t.failed);button.disabled=false};
  }

  async function mount(force=false){
    const no=customerNo();if(!no||!q('#pcSupport360'))return;
    const support=await fetchData(no,force);if(!support)return;
    const cases=Array.isArray(support.cases)?support.cases:[];
    for(const c of cases){const card=q('[data-pcs-case="'+CSS.escape(String(c.id))+'"]');if(card)renderCase(card,c,no)}
  }

  let timer=null;
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>mount(false),80)});
  observer.observe(document.body,{childList:true,subtree:true});
  setInterval(()=>mount(false),2500);
  setTimeout(()=>mount(true),500);
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed')}
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-platform-support-thread-ui','v1');
  return res.end(script);
}
