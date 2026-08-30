/* DABBIR UI bundle: generated from config/dabbir-ui-bundles.json. */
(()=>{
  if(window.__dabbirBrandUiLoaded) return;
  window.__dabbirBrandUiLoaded=true;

  const icon='/dabbir-app-icon.png';
  const style=document.createElement('style');
  style.textContent=[
    '.logo,.dabbirRecoveryLogo{background-image:url("/dabbir-app-icon.png")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:contain!important;background-color:transparent!important;border:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important}',
    '.brand .logo,.dabbirRecoveryLogo{box-shadow:none!important}',
    '#loading{font-size:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important;background-image:url("/dabbir-app-icon.png")!important;background-repeat:no-repeat!important;background-position:center!important;background-size:96px 96px!important}',
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
})();
(()=>{
  if(window.__dabbirRecoveryUiLoaded) return;
  window.__dabbirRecoveryUiLoaded=true;

  const style=document.createElement('style');
  style.textContent='.dabbirForgotBtn{display:block;margin:7px 0 0 auto;border:0;background:transparent;color:#b9c0c8;min-height:36px;padding:4px 2px;font-size:11px;text-decoration:underline;text-underline-offset:3px}.dabbirRecoveryOverlay{position:fixed;inset:0;z-index:100;background:#08090af7;display:grid;place-items:center;padding:22px}.dabbirRecoveryOverlay.dabbirHidden{display:none!important}.dabbirRecoveryCard{width:min(460px,100%);padding:24px;border:1px solid #2a2e33;border-radius:24px;background:#111315;box-shadow:0 22px 70px #0008;color:#f7f8f9}.dabbirRecoveryCard h2{font-size:24px;margin:18px 0 6px}.dabbirRecoveryCard p{color:#979da5;font-size:12px;line-height:1.7}.dabbirRecoveryCard label{display:block;color:#979da5;font-size:10px;margin:13px 0 6px}.dabbirRecoveryCard input{width:100%;min-height:48px;border:1px solid #2a2e33;background:#181b1f;color:#fff;border-radius:12px;padding:11px;font:inherit}.dabbirRecoveryCard .dabbirPrimary{width:100%;min-height:48px;margin-top:16px;border:0;border-radius:12px;background:#d7ff5f;color:#10130b;font-weight:900}.dabbirRecoveryCard .dabbirSecondary{width:100%;min-height:44px;margin-top:9px;border:1px solid #2a2e33;border-radius:12px;background:#181b1f;color:#fff;font-weight:800}.dabbirRecoveryMsg{min-height:34px;margin-top:12px;color:#ffd87a;font-size:11px;line-height:1.6}.dabbirRecoveryOk{color:#8ce6a1}.dabbirRecoveryBrand{display:flex;gap:11px;align-items:center}.dabbirRecoveryLogo{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:#20242a;border:1px solid #3a4047;font-weight:950}';
  document.head.appendChild(style);

  const forgot=document.createElement('button');
  forgot.type='button';
  forgot.id='dabbirForgotPassword';
  forgot.className='dabbirForgotBtn';
  const passwordField=document.querySelector('#authPassword')?.closest('.field');
  if(passwordField) passwordField.insertAdjacentElement('afterend',forgot);

  const wrap=document.createElement('div');
  wrap.innerHTML='<section id="dabbirForgotOverlay" class="dabbirRecoveryOverlay dabbirHidden" role="dialog" aria-modal="true"><form id="dabbirForgotForm" class="dabbirRecoveryCard"><div class="dabbirRecoveryBrand"><div class="dabbirRecoveryLogo">D</div><div><b>DABBIR</b><br><small id="dabbirForgotTag"></small></div></div><h2 id="dabbirForgotTitle"></h2><p id="dabbirForgotDesc"></p><label id="dabbirForgotEmailLabel" for="dabbirForgotEmail"></label><input id="dabbirForgotEmail" type="email" autocomplete="email" required><button id="dabbirForgotSubmit" class="dabbirPrimary" type="submit"></button><button id="dabbirForgotCancel" class="dabbirSecondary" type="button"></button><div id="dabbirForgotMsg" class="dabbirRecoveryMsg" role="status" aria-live="polite"></div></form></section><section id="dabbirResetOverlay" class="dabbirRecoveryOverlay dabbirHidden" role="dialog" aria-modal="true"><form id="dabbirResetForm" class="dabbirRecoveryCard"><div class="dabbirRecoveryBrand"><div class="dabbirRecoveryLogo">D</div><div><b>DABBIR</b><br><small id="dabbirResetTag"></small></div></div><h2 id="dabbirResetTitle"></h2><p id="dabbirResetDesc"></p><div id="dabbirResetFields"><label id="dabbirNewPasswordLabel" for="dabbirNewPassword"></label><input id="dabbirNewPassword" type="password" autocomplete="new-password" minlength="12" required><label id="dabbirConfirmPasswordLabel" for="dabbirConfirmPassword"></label><input id="dabbirConfirmPassword" type="password" autocomplete="new-password" minlength="12" required><button id="dabbirResetSubmit" class="dabbirPrimary" type="submit"></button></div><button id="dabbirResetBack" class="dabbirSecondary" type="button"></button><div id="dabbirResetMsg" class="dabbirRecoveryMsg" role="status" aria-live="polite"></div></form></section>';
  while(wrap.firstChild) document.body.appendChild(wrap.firstChild);

  const q=s=>document.querySelector(s);
  let recoveryAccessToken='';

  const copy={
    ar:{forgot:'نسيت كلمة المرور؟',forgotTag:'استعادة الحساب',forgotTitle:'استعادة كلمة المرور',forgotDesc:'أدخل بريدك الإلكتروني. إذا كان مرتبطًا بحساب في DABBIR فسيصلك رابط آمن لتعيين كلمة مرور جديدة.',email:'البريد الإلكتروني',send:'إرسال رابط الاستعادة',cancel:'العودة لتسجيل الدخول',sent:'إذا كان هذا البريد مرتبطًا بحساب، فسيصل رابط الاستعادة إلى البريد خلال لحظات.',invalidEmail:'أدخل بريدًا إلكترونيًا صحيحًا.',resetTag:'تأمين الحساب',resetTitle:'تعيين كلمة مرور جديدة',resetDesc:'اختر كلمة مرور جديدة لا تقل عن 12 حرفًا.',newPassword:'كلمة المرور الجديدة',confirmPassword:'تأكيد كلمة المرور',save:'حفظ كلمة المرور الجديدة',back:'العودة لتسجيل الدخول',mismatch:'كلمتا المرور غير متطابقتين.',tooShort:'يجب أن تكون كلمة المرور 12 حرفًا على الأقل.',updated:'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',expired:'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من شاشة تسجيل الدخول.',resetFailed:'تعذر تغيير كلمة المرور. اطلب رابط استعادة جديدًا وحاول مرة أخرى.'},
    en:{forgot:'Forgot password?',forgotTag:'Account recovery',forgotTitle:'Reset your password',forgotDesc:'Enter your email. If it belongs to a DABBIR account, you will receive a secure link to set a new password.',email:'Email',send:'Send recovery link',cancel:'Back to login',sent:'If this email belongs to an account, a recovery link will arrive shortly.',invalidEmail:'Enter a valid email address.',resetTag:'Secure account',resetTitle:'Set a new password',resetDesc:'Choose a new password with at least 12 characters.',newPassword:'New password',confirmPassword:'Confirm password',save:'Save new password',back:'Back to login',mismatch:'The passwords do not match.',tooShort:'Password must be at least 12 characters.',updated:'Your password was changed successfully. You can now log in with the new password.',expired:'This recovery link is invalid or expired. Request a new link from the login screen.',resetFailed:'Password could not be changed. Request a new recovery link and try again.'}
  };

  function language(){return document.documentElement.lang==='en'?'en':'ar'}
  function text(){return copy[language()]}
  function setRecoveryLanguage(){
    const t=text();
    forgot.textContent=t.forgot;
    q('#dabbirForgotTag').textContent=t.forgotTag;
    q('#dabbirForgotTitle').textContent=t.forgotTitle;
    q('#dabbirForgotDesc').textContent=t.forgotDesc;
    q('#dabbirForgotEmailLabel').textContent=t.email;
    q('#dabbirForgotSubmit').textContent=t.send;
    q('#dabbirForgotCancel').textContent=t.cancel;
    q('#dabbirResetTag').textContent=t.resetTag;
    q('#dabbirResetTitle').textContent=t.resetTitle;
    q('#dabbirResetDesc').textContent=t.resetDesc;
    q('#dabbirNewPasswordLabel').textContent=t.newPassword;
    q('#dabbirConfirmPasswordLabel').textContent=t.confirmPassword;
    q('#dabbirResetSubmit').textContent=t.save;
    q('#dabbirResetBack').textContent=t.back;
    syncForgotVisibility();
  }

  function syncForgotVisibility(){
    const loginActive=q('#loginTab')?.classList.contains('on');
    forgot.style.display=loginActive?'block':'none';
  }

  function showForgot(){
    const existing=String(q('#authEmail')?.value||'').trim();
    q('#dabbirForgotEmail').value=existing;
    q('#dabbirForgotMsg').textContent='';
    q('#dabbirForgotMsg').classList.remove('dabbirRecoveryOk');
    q('#dabbirForgotOverlay').classList.remove('dabbirHidden');
    setTimeout(()=>q('#dabbirForgotEmail').focus(),0);
  }
  function hideForgot(){q('#dabbirForgotOverlay').classList.add('dabbirHidden')}
  function hideReset(){
    q('#dabbirResetOverlay').classList.add('dabbirHidden');
    if(typeof showGate==='function') showGate('auth');
  }

  forgot.addEventListener('click',showForgot);
  q('#dabbirForgotCancel').addEventListener('click',hideForgot);
  q('#loginTab')?.addEventListener('click',()=>setTimeout(syncForgotVisibility,0));
  q('#signupTab')?.addEventListener('click',()=>setTimeout(syncForgotVisibility,0));

  q('#dabbirForgotForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const email=String(q('#dabbirForgotEmail').value||'').trim();
    const msg=q('#dabbirForgotMsg');
    const button=q('#dabbirForgotSubmit');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      msg.textContent=text().invalidEmail;
      msg.classList.remove('dabbirRecoveryOk');
      return;
    }
    button.disabled=true;
    msg.textContent='';
    try{
      const response=await fetch('/api/auth/forgot-password',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({email:email})});
      if(!response.ok){
        const payload=await response.json().catch(()=>({}));
        if(response.status===400){msg.textContent=text().invalidEmail;msg.classList.remove('dabbirRecoveryOk');return}
      }
      msg.textContent=text().sent;
      msg.classList.add('dabbirRecoveryOk');
    }catch{
      msg.textContent=text().sent;
      msg.classList.add('dabbirRecoveryOk');
    }finally{button.disabled=false}
  });

  const hash=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):location.hash);
  const recoveryType=String(hash.get('type')||'');
  const hashError=String(hash.get('error')||'');
  const queryRecovery=new URLSearchParams(location.search).get('password_recovery')==='1';
  if(recoveryType==='recovery'&&hash.get('access_token')){
    recoveryAccessToken=String(hash.get('access_token'));
    history.replaceState({},document.title,location.pathname+'?password_recovery=1');
    q('#dabbirResetOverlay').classList.remove('dabbirHidden');
    setTimeout(()=>q('#dabbirNewPassword').focus(),0);
  }else if(queryRecovery||hashError){
    history.replaceState({},document.title,location.pathname);
    q('#dabbirResetFields').style.display='none';
    q('#dabbirResetMsg').textContent=text().expired;
    q('#dabbirResetOverlay').classList.remove('dabbirHidden');
  }

  q('#dabbirResetForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const password=String(q('#dabbirNewPassword').value||'');
    const confirm=String(q('#dabbirConfirmPassword').value||'');
    const msg=q('#dabbirResetMsg');
    const button=q('#dabbirResetSubmit');
    msg.classList.remove('dabbirRecoveryOk');
    if(password.length<12){msg.textContent=text().tooShort;return}
    if(password!==confirm){msg.textContent=text().mismatch;return}
    if(!recoveryAccessToken){msg.textContent=text().expired;return}
    button.disabled=true;
    try{
      const response=await fetch('/api/auth/reset-password',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({access_token:recoveryAccessToken,password:password})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok){
        msg.textContent=payload.error==='RECOVERY_LINK_INVALID_OR_EXPIRED'?text().expired:text().resetFailed;
        return;
      }
      recoveryAccessToken='';
      history.replaceState({},document.title,location.pathname);
      q('#dabbirResetFields').style.display='none';
      msg.textContent=text().updated;
      msg.classList.add('dabbirRecoveryOk');
    }catch{msg.textContent=text().resetFailed}
    finally{button.disabled=false}
  });

  q('#dabbirResetBack').addEventListener('click',()=>{
    recoveryAccessToken='';
    history.replaceState({},document.title,location.pathname);
    hideReset();
  });

  let chatRecoveryInFlight=false;
  async function recoverOrphanedChat(){
    if(chatRecoveryInFlight||typeof workspace==='undefined'||!workspace?.business||typeof selectedConversation!=='function') return;
    const conversation=selectedConversation();
    const messages=Array.isArray(workspace.messages)?workspace.messages:[];
    const latest=messages[messages.length-1];
    if(conversation?.state!=='action_required'||latest?.sender_type!=='customer') return;
    chatRecoveryInFlight=true;
    try{
      const response=await fetch('/api/chat-recover',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({business_id:workspace.business.id,conversation_id:conversation.id})});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok&&payload.recovered&&typeof loadRuntime==='function'){
        await loadRuntime(workspace.business.id,conversation.id);
      }
    }catch{}
    finally{chatRecoveryInFlight=false}
  }

  if(typeof renderAll==='function'){
    const renderAllBeforeChatRecovery=renderAll;
    renderAll=function(){
      const result=renderAllBeforeChatRecovery.apply(this,arguments);
      setTimeout(recoverOrphanedChat,0);
      return result;
    };
  }
  setTimeout(recoverOrphanedChat,500);

  new MutationObserver(setRecoveryLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setRecoveryLanguage();
})();
(()=>{
  if(window.__dabbirAuthSessionStabilityV5) return;
  window.__dabbirAuthSessionStabilityV5=true;

  const authMachine={"stages":{"SIGNED_OUT":"signed_out","AUTHENTICATING":"authenticating","MFA_REQUIRED":"mfa_required","SESSION_VERIFIED":"session_verified","WORKSPACE_READY":"workspace_ready","SUSPENDED":"suspended","DEGRADED":"degraded"},"transitions":{"signed_out":["authenticating"],"authenticating":["signed_out","mfa_required","session_verified","suspended","degraded"],"mfa_required":["session_verified","signed_out","suspended","degraded"],"session_verified":["workspace_ready","signed_out","suspended","degraded"],"workspace_ready":["signed_out","suspended","degraded"],"suspended":["signed_out"],"degraded":["signed_out","authenticating"]}};
  let authStage=authMachine.stages.SIGNED_OUT;
  let pendingMfaFactorId=null;
  let pendingMfaFactorType=null;

  function publishAuthStage(stage,reason=null){
    authStage=stage;
    document.body.dataset.dabbirAuthStage=stage;
    window.__dabbirAuthSessionState={stage,reason,updated_at:new Date().toISOString()};
  }

  function setAuthStage(next,reason=null,{bootstrap=false}={}){
    if(next===authStage){
      publishAuthStage(next,reason);
      return true;
    }
    const allowed=authMachine.transitions[authStage]||[];
    if(!bootstrap&&!allowed.includes(next)){
      publishAuthStage(authMachine.stages.DEGRADED,'INVALID_AUTH_TRANSITION:'+authStage+'->'+next);
      return false;
    }
    publishAuthStage(next,reason);
    return true;
  }

  const style=document.createElement('style');
  style.dataset.dabbirAuthGateAuthority='ios-auth-stability-v5';
  style.textContent=[
    '.bottomNav.hidden{display:none!important}',
    '#appShell.hidden{display:none!important}',
    '#authGate:not(.hidden),#onboardingGate:not(.hidden){position:fixed!important;inset:0!important;z-index:90!important;overflow:auto!important;min-height:100dvh!important;overscroll-behavior:contain!important}',
    '#authGate:not(.hidden)~#bottomNav,#onboardingGate:not(.hidden)~#bottomNav{display:none!important}',
    '#mfaContinuation.hidden{display:none!important}',
    '#mfaContinuation .mfaHint{margin-top:10px;color:var(--muted);font-size:11px;line-height:1.7}',
    '#mfaContinuation .mfaActions{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:14px}',
  ].join('');
  document.head.appendChild(style);

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function sessionReady(){
    const delays=[0,80,180,350,700,1100];
    for(const delay of delays){
      if(delay) await sleep(delay);
      try{
        const {r,j}=await api('/api/auth/session',{credentials:'same-origin'});
        if(r.status===423&&j?.authenticated){
          return {ready:false,suspended:true};
        }
        if(r.ok&&j?.authenticated) return {ready:true,suspended:false};
      }catch{}
    }
    return {ready:false,suspended:false};
  }

  async function mfaStatus(){
    const {r,j}=await api('/api/auth/mfa-status',{credentials:'same-origin'});
    if(!r.ok||!j?.ok||j?.authenticated!==true) throw new Error('MFA_STATUS_UNAVAILABLE');
    return j;
  }

  function localized(keyAr,keyEn){
    return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')?keyAr:keyEn;
  }

  function validNumericMfaCode(code){
    return code.length>=6&&code.length<=8&&[...code].every(char=>char>='0'&&char<='9');
  }

  function ensureMfaContinuation(){
    let panel=document.querySelector('#mfaContinuation');
    if(panel) return panel;
    const card=document.querySelector('#authGate .authCard');
    if(!card) return null;
    panel=document.createElement('div');
    panel.id='mfaContinuation';
    panel.className='hidden';
    panel.innerHTML='<div class="field"><label id="mfaCodeLabel" for="mfaCode"></label><input id="mfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" minlength="6" maxlength="8"></div><p class="mfaHint" id="mfaHint"></p><div class="authMsg" id="mfaMsg" role="status" aria-live="polite"></div><div class="mfaActions"><button class="primary" id="mfaSubmit" type="button"></button><button class="secondary" id="mfaCancel" type="button"></button></div>';
    card.appendChild(panel);

    panel.querySelector('#mfaSubmit').onclick=async()=>{
      const submit=panel.querySelector('#mfaSubmit');
      const msg=panel.querySelector('#mfaMsg');
      const code=String(panel.querySelector('#mfaCode')?.value||'').trim();
      if(authStage!==authMachine.stages.MFA_REQUIRED) return;
      if(!pendingMfaFactorId||pendingMfaFactorType!=='totp'){
        if(msg) msg.textContent=localized('تعذر تحديد عامل المصادقة الآمن. أعد تسجيل الدخول.','A supported secure authentication factor is unavailable. Sign in again.');
        return;
      }
      if(!validNumericMfaCode(code)){
        if(msg) msg.textContent=localized('أدخل رمز التحقق الصحيح.','Enter a valid verification code.');
        return;
      }
      submit.disabled=true;
      if(msg) msg.textContent='';
      try{
        const {r,j}=await api('/api/auth/mfa-verify',{
          method:'POST',
          credentials:'same-origin',
          body:JSON.stringify({factor_id:pendingMfaFactorId,code}),
        });
        if(!r.ok||!j?.ok||j?.aal!=='aal2'){
          if(msg) msg.textContent=localized('رمز التحقق غير صحيح أو انتهت صلاحيته.','The verification code is invalid or expired.');
          return;
        }
        const state=await sessionReady();
        if(!state.ready||state.suspended) throw new Error('MFA_SESSION_NOT_READY');
        const status=await mfaStatus();
        if(status.current_level!=='aal2'||status.mfa_required===true) throw new Error('MFA_AAL2_NOT_PROVEN');
        restorePrimaryAuth();
        pendingMfaFactorId=null;
        pendingMfaFactorType=null;
        if(!setAuthStage(authMachine.stages.SESSION_VERIFIED,'MFA_AAL2_VERIFIED')) throw new Error('MFA_STATE_TRANSITION_FAILED');
        await boot();
      }catch{
        if(msg) msg.textContent=localized('تعذر إكمال التحقق الآمن. حاول مرة أخرى.','Secure verification could not be completed. Please try again.');
      }finally{
        submit.disabled=false;
      }
    };

    panel.querySelector('#mfaCancel').onclick=async()=>{
      const cancel=panel.querySelector('#mfaCancel');
      cancel.disabled=true;
      try{await api('/api/auth/logout',{method:'POST',credentials:'same-origin',body:'{}'});}catch{}
      pendingMfaFactorId=null;
      pendingMfaFactorType=null;
      restorePrimaryAuth();
      publishAuthStage(authMachine.stages.SIGNED_OUT,'MFA_CANCELLED');
      const authMsg=document.querySelector('#authMsg');
      if(authMsg) authMsg.textContent='';
      cancel.disabled=false;
    };
    return panel;
  }

  function showMfaContinuation(status){
    const panel=ensureMfaContinuation();
    if(!panel) throw new Error('MFA_PANEL_UNAVAILABLE');
    pendingMfaFactorId=String(status?.factor_id||'').trim()||null;
    pendingMfaFactorType=String(status?.factor_type||'').trim().toLowerCase()||null;
    document.querySelector('#authGate .authTabs')?.classList.add('hidden');
    document.querySelector('#authForm')?.classList.add('hidden');
    panel.classList.remove('hidden');
    const label=panel.querySelector('#mfaCodeLabel');
    const hint=panel.querySelector('#mfaHint');
    const submit=panel.querySelector('#mfaSubmit');
    const cancel=panel.querySelector('#mfaCancel');
    const msg=panel.querySelector('#mfaMsg');
    if(label) label.textContent=localized('رمز المصادقة','Authentication code');
    if(submit) submit.textContent=localized('تحقق وادخل','Verify and continue');
    if(cancel) cancel.textContent=localized('إلغاء','Cancel');
    if(msg) msg.textContent='';
    if(hint){
      hint.textContent=pendingMfaFactorType==='totp'
        ? localized('أدخل الرمز الحالي من تطبيق المصادقة لإكمال تسجيل الدخول.','Enter the current code from your authenticator app to complete sign in.')
        : localized('هذا الحساب يتطلب وسيلة تحقق إضافية غير مدعومة هنا. ألغِ العملية واستخدم وسيلة المصادقة المعتمدة.','This account requires an additional verification method not supported here. Cancel and use the approved authentication method.');
    }
    setTimeout(()=>panel.querySelector('#mfaCode')?.focus(),0);
  }

  function restorePrimaryAuth(){
    const panel=document.querySelector('#mfaContinuation');
    if(panel){
      panel.classList.add('hidden');
      const code=panel.querySelector('#mfaCode');
      if(code) code.value='';
    }
    document.querySelector('#authGate .authTabs')?.classList.remove('hidden');
    document.querySelector('#authForm')?.classList.remove('hidden');
  }

  function syncStageFromGate(name,reason='GATE_RENDERED'){
    if(name==='app'){
      if(authStage===authMachine.stages.MFA_REQUIRED){
        publishAuthStage(authMachine.stages.DEGRADED,'WORKSPACE_BEFORE_MFA_VERIFICATION');
      }else{
        publishAuthStage(authMachine.stages.WORKSPACE_READY,reason);
      }
    }else if(name==='onboarding'){
      if(authStage===authMachine.stages.MFA_REQUIRED){
        publishAuthStage(authMachine.stages.DEGRADED,'ONBOARDING_BEFORE_MFA_VERIFICATION');
      }else{
        publishAuthStage(authMachine.stages.SESSION_VERIFIED,reason);
      }
    }else if(name==='auth'&&authStage!==authMachine.stages.SUSPENDED&&authStage!==authMachine.stages.MFA_REQUIRED){
      publishAuthStage(authMachine.stages.SIGNED_OUT,reason);
      restorePrimaryAuth();
    }
    document.body.dataset.dabbirGate=String(name||'');
    const bottom=document.querySelector('#bottomNav');
    if(bottom&&name!=='app') bottom.classList.add('hidden');
  }

  // IMPORTANT: visibility remains owned by the base application. This wrapper
  // always renders the requested gate first, then only records the resulting
  // state/content. MFA continuation stays inside authGate.
  const baseShowGate=showGate;
  showGate=function(name){
    baseShowGate(name);
    syncStageFromGate(name);
  };

  const form=document.querySelector('#authForm');
  if(form){
    form.onsubmit=async event=>{
      event.preventDefault();
      const btn=document.querySelector('#authSubmit');
      const msg=document.querySelector('#authMsg');
      if(!btn) return;
      btn.disabled=true;
      if(msg) msg.textContent='';

      if(authStage===authMachine.stages.SUSPENDED){
        publishAuthStage(authMachine.stages.SIGNED_OUT,'AUTH_RETRY');
      }
      if(!setAuthStage(authMachine.stages.AUTHENTICATING,authMode==='login'?'LOGIN_SUBMIT':'SIGNUP_SUBMIT')){
        if(msg) msg.textContent=localized('تعذر بدء جلسة آمنة. أعد المحاولة.','A secure session could not be started. Please try again.');
        btn.disabled=false;
        return;
      }

      try{
        const endpoint=authMode==='login'?'/api/auth/login':'/api/auth/signup';
        const {r,j}=await api(endpoint,{
          method:'POST',
          credentials:'same-origin',
          body:JSON.stringify({
            email:document.querySelector('#authEmail')?.value||'',
            password:document.querySelector('#authPassword')?.value||'',
          }),
        });

        if(authMode==='signup'&&j?.verification_required){
          publishAuthStage(authMachine.stages.SIGNED_OUT,'EMAIL_VERIFICATION_REQUIRED');
          if(msg) msg.textContent=T().verification;
          return;
        }
        if(!r.ok||!j?.ok){
          publishAuthStage(authMachine.stages.SIGNED_OUT,'AUTH_REJECTED');
          if(msg) msg.textContent=T().invalid;
          return;
        }

        const state=await sessionReady();
        if(state.suspended){
          publishAuthStage(authMachine.stages.SUSPENDED,'ACCOUNT_SUSPENDED');
          if(msg) msg.textContent=localized('الحساب موقوف. تواصل مع دعم دبّر.','This account is suspended. Contact DABBIR support.');
          return;
        }
        if(!state.ready){
          publishAuthStage(authMachine.stages.DEGRADED,'SESSION_VERIFICATION_FAILED');
          if(msg) msg.textContent=localized('تم قبول البيانات لكن تعذر تثبيت الجلسة. حاول مرة أخرى.','The credentials were accepted but the session could not be established. Please try again.');
          return;
        }

        const status=await mfaStatus();
        if(status.mfa_required===true){
          if(!status.factor_id){
            publishAuthStage(authMachine.stages.DEGRADED,'MFA_FACTOR_MISSING');
            if(msg) msg.textContent=localized('يتطلب الحساب تحققًا إضافيًا لكن عامل المصادقة غير متاح.','This account requires additional verification, but no authentication factor is available.');
            return;
          }
          if(!setAuthStage(authMachine.stages.MFA_REQUIRED,'MFA_REQUIRED_AFTER_PRIMARY_AUTH')) return;
          showMfaContinuation(status);
          return;
        }

        publishAuthStage(authMachine.stages.SESSION_VERIFIED,'SESSION_COOKIE_VERIFIED');
        await boot();
      }catch{
        publishAuthStage(authMachine.stages.DEGRADED,'AUTH_REQUEST_FAILED');
        if(msg) msg.textContent=localized('تعذر الاتصال أو التحقق من متطلبات الأمان. حاول مرة أخرى.','Connection or security verification failed. Please try again.');
      }finally{
        btn.disabled=false;
      }
    };
  }

  const authVisible=document.querySelector('#authGate:not(.hidden)');
  const onboardingVisible=document.querySelector('#onboardingGate:not(.hidden)');
  const appVisible=document.querySelector('#appShell:not(.hidden)');
  if(appVisible){
    publishAuthStage(authMachine.stages.WORKSPACE_READY,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate='app';
  }else if(onboardingVisible){
    publishAuthStage(authMachine.stages.SESSION_VERIFIED,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate='onboarding';
  }else{
    publishAuthStage(authMachine.stages.SIGNED_OUT,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate=authVisible?'auth':'';
  }

  window.__dabbirAuthSessionStability={version:'ios-auth-stability-v5',session_retry:true,gate_isolation:true,state_machine:true,gate_observer_only:true,mfa_continuation:true};
})();
