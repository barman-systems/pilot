const script = String.raw`(()=>{
  if(window.__dabbirBrandUiLoaded) return;
  window.__dabbirBrandUiLoaded=true;

  const icon='/dabbir-icon.svg';
  const style=document.createElement('style');
  style.textContent='.logo,.dabbirRecoveryLogo{background-image:url("/dabbir-icon.svg")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:cover!important;background-color:transparent!important;border:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important}.brand .logo,.dabbirRecoveryLogo{box-shadow:0 8px 24px #0004}';
  document.head.appendChild(style);

  function link(rel,href,type){
    let node=document.head.querySelector('link[rel="'+rel+'"]');
    if(!node){node=document.createElement('link');node.rel=rel;document.head.appendChild(node)}
    node.href=href;
    if(type) node.type=type;
  }
  link('icon',icon,'image/svg+xml');
  link('shortcut icon',icon,'image/svg+xml');
  link('apple-touch-icon',icon);

  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content='#0B0D12';

  function uiText(key,fallback){
    try{
      if(typeof T==='function') return T()[key]||fallback;
    }catch{}
    return fallback;
  }

  function notify(message){
    try{if(typeof toast==='function') return toast(message)}catch{}
  }

  function installIdempotentConversationStart(){
    const form=document.querySelector('#newChatForm');
    if(!form||form.dataset.dabbirConversationStart==='v2') return;
    form.dataset.dabbirConversationStart='v2';
    form.onsubmit=async event=>{
      event.preventDefault();
      const input=document.querySelector('#newCustomerName');
      const button=document.querySelector('#createChatBtn');
      const name=String(input?.value||'').trim();
      if(!name||typeof workspace==='undefined'||!workspace?.business?.id) return;
      if(button) button.disabled=true;
      try{
        const response=await fetch('/api/start-conversation',{
          method:'POST',
          cache:'no-store',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({business_id:workspace.business.id,display_name:name})
        });
        const payload=await response.json().catch(()=>({}));
        if(response.status===401){
          try{if(typeof showGate==='function')showGate('auth')}catch{}
          notify(uiText('authRequired','Session expired. Log in again.'));
          return;
        }
        if(!response.ok||!payload.ok||!payload.conversation?.id){
          notify(payload.error||uiText('invalid','تعذر إنشاء المحادثة'));
          return;
        }
        document.querySelector('#newChatModal')?.classList.remove('open');
        if(input) input.value='';
        if(typeof loadRuntime==='function') await loadRuntime(workspace.business.id,payload.conversation.id);
        if(typeof showScreen==='function') showScreen('conversations');
      }catch{
        notify(uiText('invalid','تعذر إنشاء المحادثة'));
      }finally{
        if(button) button.disabled=false;
      }
    };
  }

  const repairAttempted=new Set();
  let repairInFlight=false;
  async function repairActionRequiredChats(){
    if(repairInFlight||typeof workspace==='undefined'||!workspace?.business?.id) return;
    const candidates=(Array.isArray(workspace.conversations)?workspace.conversations:[])
      .filter(item=>item?.state==='action_required'&&!repairAttempted.has(item.id))
      .slice(0,4);
    if(!candidates.length) return;

    repairInFlight=true;
    let recovered=false;
    try{
      for(const conversation of candidates){
        repairAttempted.add(conversation.id);
        try{
          const response=await fetch('/api/chat-recover',{
            method:'POST',
            cache:'no-store',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({business_id:workspace.business.id,conversation_id:conversation.id})
          });
          const payload=await response.json().catch(()=>({}));
          if(response.ok&&payload.ok&&payload.recovered) recovered=true;
        }catch{}
      }
      if(recovered&&typeof loadRuntime==='function'){
        const selected=(typeof selectedConversationId!=='undefined'&&selectedConversationId)||null;
        await loadRuntime(workspace.business.id,selected);
      }
    }finally{
      repairInFlight=false;
    }
  }

  installIdempotentConversationStart();

  if(typeof renderAll==='function'&&!window.__dabbirBrandRenderWrapped){
    window.__dabbirBrandRenderWrapped=true;
    const renderBeforeBrandChatFix=renderAll;
    renderAll=function(){
      const result=renderBeforeBrandChatFix.apply(this,arguments);
      setTimeout(()=>{installIdempotentConversationStart();repairActionRequiredChats()},30);
      return result;
    };
  }

  setTimeout(()=>{installIdempotentConversationStart();repairActionRequiredChats()},500);
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  return res.end(script);
}
