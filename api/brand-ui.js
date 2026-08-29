const script = String.raw`(()=>{
  if(window.__dabbirBrandUiLoaded) return;
  window.__dabbirBrandUiLoaded=true;

  const icon='/api/dabbir-approved-icon';
  const style=document.createElement('style');
  style.textContent=[
    '.logo,.dabbirRecoveryLogo{background-image:url("/api/dabbir-approved-icon")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:contain!important;background-color:transparent!important;border:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important}',
    '.brand .logo,.dabbirRecoveryLogo{box-shadow:none!important}',
    '#loading{font-size:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important;background-image:url("/api/dabbir-approved-icon")!important;background-repeat:no-repeat!important;background-position:center!important;background-size:96px 96px!important}',
    '.dabbirMobileBrand{display:none!important}',
    '.dabbirWhatsAppIdentity{margin-top:10px;padding:9px 10px;border:1px solid #2a2e33;border-radius:11px;background:#101214;font-size:10px;line-height:1.55;color:#f7f8f9}.dabbirWhatsAppIdentity b{display:block;font-size:9px;color:#979da5;margin-bottom:2px}.dabbirWhatsAppIdentity .number{font-weight:900;font-size:12px;direction:ltr;unicode-bidi:embed}.dabbirWhatsAppIdentity .verifiedName{display:block;margin-top:2px;color:#979da5;font-size:9px}',
    '@media(max-width:700px){#loading{background-size:88px 88px!important}body.dabbirAppActive>.dabbirMobileBrand{display:none!important}}'
  ].join('');
  document.head.appendChild(style);

  function installMobileBrand(){
    // The owner-first shell owns the mobile header mark. Avoid a second
    // fixed brand that can overlap or clip inside an RTL safe area.
    document.body?.querySelectorAll(':scope > .dabbirMobileBrand').forEach(node=>node.remove());
  }

  function syncAppActive(){
    const shell=document.querySelector('#appShell');
    const active=!!shell&&!shell.classList.contains('hidden');
    document.body?.classList.toggle('dabbirAppActive',active);
  }

  installMobileBrand();
  syncAppActive();
  const appShell=document.querySelector('#appShell');
  if(appShell){
    new MutationObserver(syncAppActive).observe(appShell,{attributes:true,attributeFilter:['class']});
  }

  const loading=document.querySelector('#loading');
  if(loading){
    loading.textContent='';
    loading.setAttribute('aria-label','DABBIR');
    loading.setAttribute('role','img');
  }

  function link(rel,href,type){
    let node=document.head.querySelector('link[rel="'+rel+'"]');
    if(!node){node=document.createElement('link');node.rel=rel;document.head.appendChild(node)}
    node.href=href;
    if(type) node.type=type;
  }
  link('icon',icon,'image/png');
  link('shortcut icon',icon,'image/png');
  link('apple-touch-icon',icon,'image/png');

  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content='#0D1426';

  function uiText(key,fallback){
    try{
      if(typeof T==='function') return T()[key]||fallback;
    }catch{}
    return fallback;
  }

  function isArabic(){
    return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
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

  function whatsAppConnected(status){
    if(!status) return false;
    return Boolean(
      status.connected||status.meta_authorized||status.webhook_configured||status.outbound_configured||
      ['META_AUTHORIZED','WEBHOOK_LINKED','CONFIGURED_READY_FOR_VERIFICATION','OUTBOUND_CONFIGURED','OPERATIONAL'].includes(String(status.state||''))
    );
  }

  function whatsAppOperational(status){
    return Boolean(status&&(status.operational||status.state==='OPERATIONAL'));
  }

  function renderWhatsAppIdentity(card,status,ar,connected){
    let identity=card.querySelector('[data-dabbir-whatsapp-identity]');
    if(!identity){
      identity=document.createElement('div');
      identity.className='dabbirWhatsAppIdentity';
      identity.setAttribute('data-dabbir-whatsapp-identity','true');
      card.appendChild(identity);
    }

    const phone=String(status?.phone?.display_phone_number||'').trim();
    const verifiedName=String(status?.phone?.verified_name||'').trim();
    identity.replaceChildren();

    const label=document.createElement('b');
    label.textContent=ar?'رقم WhatsApp المفعّل':'Active WhatsApp number';
    identity.appendChild(label);

    const number=document.createElement('span');
    number.className='number';
    number.textContent=phone||(connected?(ar?'بانتظار تحقق Meta':'Waiting for Meta verification'):(ar?'غير متاح':'Not available'));
    identity.appendChild(number);

    if(verifiedName){
      const name=document.createElement('span');
      name.className='verifiedName';
      name.textContent=(ar?'الاسم الموثق: ':'Verified name: ')+verifiedName;
      identity.appendChild(name);
    }
  }

  function applyWhatsAppCardState(){
    if(typeof workspace==='undefined'||!workspace) return;
    const status=workspace.whatsapp||{};
    const connected=whatsAppConnected(status);
    const operational=whatsAppOperational(status);
    const ar=isArabic();
    const grid=document.querySelector('#integrationGrid');
    if(grid){
      const wanted=uiText('whatsapp','WhatsApp').trim();
      const card=[...grid.querySelectorAll('.integration')].find(item=>String(item.querySelector('h3')?.textContent||'').trim()===wanted);
      if(card){
        const badge=card.querySelector('.badge');
        const description=card.querySelector('p');
        if(badge){
          badge.classList.remove('red','yellow','green','blue','gray');
          if(operational){
            badge.classList.add('green');
            badge.textContent=uiText('operational',ar?'تشغيلي':'Operational');
          }else if(connected){
            badge.classList.add('blue');
            badge.textContent=ar?'مربوط':'Linked';
          }else{
            badge.classList.add('red');
            badge.textContent=ar?'غير مربوط':'Not linked';
          }
        }
        if(description){
          if(operational){
            description.textContent=ar?'تم التحقق من ربط WhatsApp ومسار التشغيل الحقيقي.':'WhatsApp link and live message path are verified.';
          }else if(status.meta_authorized){
            description.textContent=ar?'تم التحقق من تفويض Meta فعليًا. بقي اختبار رسالة حقيقية قبل اعتماد الحالة «تشغيلي».':'Meta authorization is verified. A real message path still must pass before marking it Operational.';
          }else if(connected){
            description.textContent=ar?'تم العثور على ربط Meta / Webhook الفعلي. بقي التحقق من مسار رسالة حقيقية قبل اعتماد التشغيل الكامل.':'The real Meta / webhook link was found. A live message path still needs verification before full Operational status.';
          }else{
            description.textContent=ar?'لم يعثر DABBIR في هذا التشغيل على إعدادات WhatsApp الفعلية.':'DABBIR did not find the WhatsApp connection settings in this runtime.';
          }
        }
        renderWhatsAppIdentity(card,status,ar,connected);
      }
    }

    const helpTitle=document.querySelector('#helpWhatsTitle');
    const helpDesc=document.querySelector('#helpWhatsDesc');
    if(helpTitle&&helpDesc&&connected){
      helpTitle.textContent=ar?'حالة WhatsApp':'WhatsApp status';
      helpDesc.textContent=operational
        ? (ar?'الربط ومسار الرسالة الحقيقي موثقان.':'The connection and real message path are verified.')
        : (ar?'الربط موجود. DABBIR يفصل بين «مربوط» و«تشغيلي» حتى ينجح اختبار رسالة حقيقية.':'The connection exists. DABBIR keeps Linked separate from Operational until a real message test passes.');
    }
  }

  let whatsappStatusInFlight=false;
  let whatsappStatusCheckedAt=0;
  async function refreshWhatsAppStatus(force=false){
    if(whatsappStatusInFlight||typeof workspace==='undefined'||!workspace) return;
    if(!force&&Date.now()-whatsappStatusCheckedAt<60000){applyWhatsAppCardState();return;}
    whatsappStatusInFlight=true;
    try{
      const response=await fetch('/api/dabbir-whatsapp-status',{method:'GET',cache:'no-store',headers:{accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok){
        workspace.whatsapp={...(workspace.whatsapp||{}),...payload};
        whatsappStatusCheckedAt=Date.now();
        applyWhatsAppCardState();
      }
    }catch{}
    finally{whatsappStatusInFlight=false}
  }

  installIdempotentConversationStart();

  if(typeof renderIntegrations==='function'&&!window.__dabbirWhatsAppIntegrationsWrapped){
    window.__dabbirWhatsAppIntegrationsWrapped=true;
    const renderIntegrationsBeforeWhatsAppStatus=renderIntegrations;
    renderIntegrations=function(){
      const result=renderIntegrationsBeforeWhatsAppStatus.apply(this,arguments);
      applyWhatsAppCardState();
      setTimeout(()=>refreshWhatsAppStatus(),0);
      return result;
    };
  }

  if(typeof renderAll==='function'&&!window.__dabbirBrandRenderWrapped){
    window.__dabbirBrandRenderWrapped=true;
    const renderBeforeBrandChatFix=renderAll;
    renderAll=function(){
      const result=renderBeforeBrandChatFix.apply(this,arguments);
      setTimeout(()=>{installIdempotentConversationStart();repairActionRequiredChats();syncAppActive();applyWhatsAppCardState();refreshWhatsAppStatus()},30);
      return result;
    };
  }

  setTimeout(()=>{installMobileBrand();installIdempotentConversationStart();repairActionRequiredChats();syncAppActive();applyWhatsAppCardState();refreshWhatsAppStatus(true)},500);
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
