const script=String.raw`(()=>{
  if(window.__dabbirActivityTaskNavigation)return;
  window.__dabbirActivityTaskNavigation=true;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const categoryOf=card=>String(card?.querySelector('small')?.textContent||'').split('·')[0].trim().toLowerCase();
  const routeFor=category=>{
    if(['catalog','product','products','inventory','stock','orders','order','sales'].includes(category))return 'operations';
    if(['policy','policies','settings','configuration','permissions'].includes(category))return 'settings';
    if(['customer','customers','crm'].includes(category))return 'customers';
    if(['appointment','appointments','booking','calendar','schedule'].includes(category))return 'appointments';
    if(['conversation','conversations','message','messages','inquiry','inquiries','whatsapp'].includes(category))return 'conversations';
    return null;
  };

  const flash=node=>{
    if(!node)return;
    try{node.scrollIntoView({behavior:'smooth',block:'center'})}catch{node.scrollIntoView?.()}
    node.classList.add('dabbirTaskTarget');
    setTimeout(()=>node.classList.remove('dabbirTaskTarget'),1800);
  };

  const focusDestination=category=>{
    if(category==='catalog'||category==='product'||category==='products'){
      const add=q('#opsAddProduct');
      if(add&&add.offsetParent!==null){add.click();return}
      return flash(q('#opsBody .opsSection'));
    }
    if(category==='inventory'||category==='stock'){
      return flash(q('#opsBody .opsGrid > div:first-child .opsSection')||q('#opsBody .opsLow'));
    }
    if(category==='orders'||category==='order'||category==='sales'){
      return flash(q('#opsBody .opsGrid > div:last-child .opsSection'));
    }
    if(['policy','policies','settings','configuration','permissions'].includes(category)){
      const field=q('.dk-field[data-key="delivery_policy"]')||q('.dk-field[data-key="return_policy"]')||q('#screen-settings .dabbir-knowledge-card');
      flash(field);
      const input=field?.querySelector?.('textarea,input,select');
      if(input)requestAnimationFrame(()=>input.focus({preventScroll:true}));
    }
  };

  const openTask=card=>{
    if(!card)return;
    const category=categoryOf(card);
    const route=routeFor(category);
    if(!route||typeof showScreen!=='function')return;
    showScreen(route);
    requestAnimationFrame(()=>setTimeout(()=>focusDestination(category),90));
  };

  const decorate=()=>{
    qa('#activityTaskCard .activityTask').forEach(card=>{
      const route=routeFor(categoryOf(card));
      if(!route){card.removeAttribute('data-dabbir-task-route');card.removeAttribute('role');card.removeAttribute('tabindex');return}
      card.dataset.dabbirTaskRoute=route;
      card.setAttribute('role','link');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',String(card.querySelector('b')?.textContent||'').trim());
    });
  };

  const style=document.createElement('style');
  style.dataset.dabbirActivityTaskNavigation='v1';
  style.textContent='.activityTask[data-dabbir-task-route]{cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.activityTask[data-dabbir-task-route]:hover{border-color:#40515f;background:#192027}.activityTask[data-dabbir-task-route]:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.activityTask[data-dabbir-task-route]:active{transform:scale(.995)}.dabbirTaskTarget{outline:2px solid var(--accent)!important;outline-offset:3px!important;transition:outline-color .2s ease}';
  document.head.append(style);

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(card)openTask(card);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    if(event.target?.closest?.('[data-activity-task]'))return;
    const card=event.target?.closest?.('#activityTaskCard .activityTask[data-dabbir-task-route]');
    if(!card)return;
    event.preventDefault();
    openTask(card);
  });

  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(document.body,{subtree:true,childList:true});
  decorate();
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-activity-task-navigation','v1');
  return res.status(200).send(script);
}
