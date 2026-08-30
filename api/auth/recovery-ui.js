const script = String.raw`(()=>{
  if(window.__dabbirRecoveryUiLoaded) return;
  window.__dabbirRecoveryUiLoaded=true;

  const style=document.createElement('style');
  style.textContent='.dabbirForgotBtn{display:block;margin:7px 0 0 auto;border:0;background:transparent;color:#b9c0c8;min-height:36px;padding:4px 2px;font-size:11px;text-decoration:underline;text-underline-offset:3px}.dabbirRecoveryOverlay{position:fixed;inset:0;z-index:100;background:#08090af7;display:grid;place-items:center;padding:22px}.dabbirRecoveryOverlay.dabbirHidden{display:none!important}.dabbirRecoveryCard{width:min(460px,100%);padding:24px;border:1px solid #2a2e33;border-radius:24px;background:#111315;box-shadow:0 22px 70px #0008;color:#f7f8f9}.dabbirRecoveryCard h2{font-size:24px;margin:18px 0 6px}.dabbirRecoveryCard p{color:#979da5;font-size:12px;line-height:1.7}.dabbirRecoveryCard label{display:block;color:#979da5;font-size:10px;margin:13px 0 6px}.dabbirRecoveryCard input{width:100%;min-height:48px;border:1px solid #2a2e33;background:#181b1f;color:#fff;border-radius:12px;padding:11px;font:inherit}.dabbirRecoveryCard .dabbirPrimary{width:100%;min-height:48px;margin-top:16px;border:0;border-radius:12px;background:#d7ff5f;color:#10130b;font-weight:900}.dabbirRecoveryCard .dabbirSecondary{width:100%;min-height:44px;margin-top:9px;border:1px solid #2a2e33;border-radius:12px;background:#181b1f;color:#fff;font-weight:800}.dabbirRecoveryMsg{min-height:34px;margin-top:12px;color:#ffd87a;font-size:11px;line-height:1.6}.dabbirRecoveryOk{color:#8ce6a1}.dabbirRecoveryBrand{display:flex;gap:11px;align-items:center}.dabbirRecoveryLogo{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:#20242a;border:1px solid #3a4047;font-weight:950}.dabbirPasswordShell{position:relative}.dabbirPasswordShell input{padding-inline-end:76px!important}.dabbirPasswordToggle{position:absolute;inset-inline-end:6px;top:5px;min-height:36px!important;border:0;background:transparent;color:#b9c0c8;padding:4px 7px;font-size:10px;font-weight:800}.dabbirPasswordAssist{margin-top:7px}.dabbirPasswordTrack{height:5px;border-radius:999px;background:#252a30;overflow:hidden}.dabbirPasswordTrack i{display:block;height:100%;width:0;background:#ffaaa9;transition:width .18s ease,background .18s ease}.dabbirPasswordAssist p{margin:5px 0 0!important;font-size:9px!important;line-height:1.5!important}.dabbirFieldError{min-height:18px;margin-top:5px;color:#ffaaa9;font-size:9px}.dabbirResendVerification{display:none;width:100%;margin-top:7px;border:1px solid #34415f;background:#151d2f;color:#e9eef8;border-radius:11px;padding:8px 11px;font-size:10px;font-weight:850}.dabbirResendVerification.show{display:block}@media(prefers-reduced-motion:reduce){.dabbirPasswordTrack i{transition:none}}';
  document.head.appendChild(style);

  const forgot=document.createElement('button');
  forgot.type='button';
  forgot.id='dabbirForgotPassword';
  forgot.className='dabbirForgotBtn';
  const passwordField=document.querySelector('#authPassword')?.closest('.field');
  if(passwordField) passwordField.insertAdjacentElement('afterend',forgot);

  const passwordInput=document.querySelector('#authPassword');
  const passwordShell=document.createElement('div');
  passwordShell.className='dabbirPasswordShell';
  if(passwordInput&&passwordInput.parentElement){
    passwordInput.parentElement.insertBefore(passwordShell,passwordInput);
    passwordShell.appendChild(passwordInput);
  }
  const passwordToggle=document.createElement('button');
  passwordToggle.type='button';
  passwordToggle.id='dabbirPasswordToggle';
  passwordToggle.className='dabbirPasswordToggle';
  passwordShell.appendChild(passwordToggle);
  const passwordAssist=document.createElement('div');
  passwordAssist.id='dabbirPasswordAssist';
  passwordAssist.className='dabbirPasswordAssist';
  passwordAssist.innerHTML='<div class="dabbirPasswordTrack" aria-hidden="true"><i id="dabbirPasswordBar"></i></div><p id="dabbirPasswordHelp"></p><div id="dabbirAuthFieldError" class="dabbirFieldError" role="alert"></div>';
  passwordShell.insertAdjacentElement('afterend',passwordAssist);
  const emailError=document.createElement('div');
  emailError.id='dabbirAuthEmailError';
  emailError.className='dabbirFieldError';
  emailError.setAttribute('role','alert');
  document.querySelector('#authEmail')?.insertAdjacentElement('afterend',emailError);

  const resend=document.createElement('button');
  resend.type='button';
  resend.id='dabbirResendVerification';
  resend.className='dabbirResendVerification';
  const authMessage=document.querySelector('#authMsg');
  if(authMessage)authMessage.insertAdjacentElement('afterend',resend);

  const wrap=document.createElement('div');
  wrap.innerHTML='<section id="dabbirForgotOverlay" class="dabbirRecoveryOverlay dabbirHidden" role="dialog" aria-modal="true"><form id="dabbirForgotForm" class="dabbirRecoveryCard"><div class="dabbirRecoveryBrand"><div class="dabbirRecoveryLogo">D</div><div><b>DABBIR</b><br><small id="dabbirForgotTag"></small></div></div><h2 id="dabbirForgotTitle"></h2><p id="dabbirForgotDesc"></p><label id="dabbirForgotEmailLabel" for="dabbirForgotEmail"></label><input id="dabbirForgotEmail" type="email" autocomplete="email" required><button id="dabbirForgotSubmit" class="dabbirPrimary" type="submit"></button><button id="dabbirForgotCancel" class="dabbirSecondary" type="button"></button><div id="dabbirForgotMsg" class="dabbirRecoveryMsg" role="status" aria-live="polite"></div></form></section><section id="dabbirResetOverlay" class="dabbirRecoveryOverlay dabbirHidden" role="dialog" aria-modal="true"><form id="dabbirResetForm" class="dabbirRecoveryCard"><div class="dabbirRecoveryBrand"><div class="dabbirRecoveryLogo">D</div><div><b>DABBIR</b><br><small id="dabbirResetTag"></small></div></div><h2 id="dabbirResetTitle"></h2><p id="dabbirResetDesc"></p><div id="dabbirResetFields"><label id="dabbirNewPasswordLabel" for="dabbirNewPassword"></label><input id="dabbirNewPassword" type="password" autocomplete="new-password" minlength="12" required><label id="dabbirConfirmPasswordLabel" for="dabbirConfirmPassword"></label><input id="dabbirConfirmPassword" type="password" autocomplete="new-password" minlength="12" required><button id="dabbirResetSubmit" class="dabbirPrimary" type="submit"></button></div><button id="dabbirResetBack" class="dabbirSecondary" type="button"></button><div id="dabbirResetMsg" class="dabbirRecoveryMsg" role="status" aria-live="polite"></div></form></section>';
  while(wrap.firstChild) document.body.appendChild(wrap.firstChild);

  const q=s=>document.querySelector(s);
  let recoveryAccessToken='';

  const copy={
    ar:{forgot:'نسيت كلمة المرور؟',forgotTag:'استعادة الحساب',forgotTitle:'استعادة كلمة المرور',forgotDesc:'أدخل بريدك الإلكتروني. إذا كان مرتبطًا بحساب في DABBIR فسيصلك رابط آمن لتعيين كلمة مرور جديدة.',email:'البريد الإلكتروني',send:'إرسال رابط الاستعادة',cancel:'العودة لتسجيل الدخول',sent:'إذا كان هذا البريد مرتبطًا بحساب، فسيصل رابط الاستعادة إلى البريد خلال لحظات.',invalidEmail:'أدخل بريدًا إلكترونيًا صحيحًا.',resetTag:'تأمين الحساب',resetTitle:'تعيين كلمة مرور جديدة',resetDesc:'اختر كلمة مرور جديدة لا تقل عن 12 حرفًا.',newPassword:'كلمة المرور الجديدة',confirmPassword:'تأكيد كلمة المرور',save:'حفظ كلمة المرور الجديدة',back:'العودة لتسجيل الدخول',mismatch:'كلمتا المرور غير متطابقتين.',tooShort:'يجب أن تكون كلمة المرور 12 حرفًا على الأقل.',updated:'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',expired:'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من شاشة تسجيل الدخول.',resetFailed:'تعذر تغيير كلمة المرور. اطلب رابط استعادة جديدًا وحاول مرة أخرى.',showPassword:'إظهار',hidePassword:'إخفاء',passwordHelp:'12 حرفًا على الأقل؛ أو استخدم عبارة مرور طويلة يسهل تذكرها.',passwordWeak:'كلمة المرور تحتاج تقوية.',passwordGood:'قوة مقبولة؛ تجنب الاسم والبريد والتسلسلات الشائعة.',passwordStrong:'كلمة مرور قوية.',invalidAuthEmail:'أدخل بريدًا إلكترونيًا صحيحًا.',invalidAuthPassword:'أدخل كلمة مرور لا تقل عن 12 حرفًا لإنشاء الحساب.',working:'جارٍ التحقق…',resend:'إعادة إرسال رسالة التحقق',resent:'تم طلب رسالة تحقق جديدة. افحص بريدك.',resendFailed:'تعذر طلب رسالة جديدة الآن. حاول لاحقًا.',wait:'أعد المحاولة بعد'},
    en:{forgot:'Forgot password?',forgotTag:'Account recovery',forgotTitle:'Reset your password',forgotDesc:'Enter your email. If it belongs to a DABBIR account, you will receive a secure link to set a new password.',email:'Email',send:'Send recovery link',cancel:'Back to login',sent:'If this email belongs to an account, a recovery link will arrive shortly.',invalidEmail:'Enter a valid email address.',resetTag:'Secure account',resetTitle:'Set a new password',resetDesc:'Choose a new password with at least 12 characters.',newPassword:'New password',confirmPassword:'Confirm password',save:'Save new password',back:'Back to login',mismatch:'The passwords do not match.',tooShort:'Password must be at least 12 characters.',updated:'Your password was changed successfully. You can now log in with the new password.',expired:'This recovery link is invalid or expired. Request a new link from the login screen.',resetFailed:'Password could not be changed. Request a new recovery link and try again.',showPassword:'Show',hidePassword:'Hide',passwordHelp:'Use at least 12 characters, or a longer memorable passphrase.',passwordWeak:'This password needs to be stronger.',passwordGood:'Acceptable strength; avoid names, email identifiers and common sequences.',passwordStrong:'Strong password.',invalidAuthEmail:'Enter a valid email address.',invalidAuthPassword:'Use at least 12 characters to create an account.',working:'Checking…',resend:'Resend verification email',resent:'A new verification email was requested. Check your inbox.',resendFailed:'A new email could not be requested now. Try again later.',wait:'Try again in'}
  };

  function language(){return document.documentElement.lang==='en'?'en':'ar'}
  function text(){return copy[language()]}
  function authSignupMode(){try{return typeof authMode!=='undefined'&&authMode==='signup'}catch{return false}}
  function passwordScore(value){
    const raw=String(value||'');
    if(!raw)return 0;
    let score=raw.length>=12?1:0;
    if(raw.length>=16)score++;
    if(/[A-Za-z]/.test(raw)&&/\d/.test(raw))score++;
    if(raw.length>=20||/[^A-Za-z0-9]/.test(raw))score++;
    return Math.min(4,score);
  }
  function updatePasswordExperience(){
    const t=text();
    const input=q('#authPassword');
    const assist=q('#dabbirPasswordAssist');
    const bar=q('#dabbirPasswordBar');
    const help=q('#dabbirPasswordHelp');
    if(!input||!assist||!bar||!help)return;
    passwordToggle.textContent=input.type==='password'?t.showPassword:t.hidePassword;
    passwordToggle.setAttribute('aria-label',passwordToggle.textContent);
    assist.style.display=authSignupMode()?'block':'none';
    if(!authSignupMode()){bar.style.width='0';q('#dabbirAuthFieldError').textContent='';return}
    const score=passwordScore(input.value);
    bar.style.width=(score*25)+'%';
    bar.style.background=score>=4?'#8ce6a1':score>=2?'#ffd87a':'#ffaaa9';
    help.textContent=!input.value?t.passwordHelp:score>=4?t.passwordStrong:score>=2?t.passwordGood:t.passwordWeak;
  }
  function setFieldError(message,field='password'){
    const passwordField=field==='password';
    const error=q(passwordField?'#dabbirAuthFieldError':'#dabbirAuthEmailError');
    const input=q(passwordField?'#authPassword':'#authEmail');
    if(error)error.textContent=message||'';
    if(input)input.setAttribute('aria-invalid',message?'true':'false');
  }
  function syncResendVisibility(){
    const message=String(q('#authMsg')?.textContent||'');
    let verification='';
    try{verification=String(typeof T==='function'?T().verification:'')}catch{}
    const visible=authSignupMode()&&(resend.disabled||(Boolean(message)&&Boolean(verification)&&message===verification));
    resend.classList.toggle('show',visible);
    if(visible)resend.dataset.email=String(q('#authEmail')?.value||'').trim();
  }
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
    resend.textContent=t.resend;
    updatePasswordExperience();
    syncForgotVisibility();
    syncResendVisibility();
  }

  function syncForgotVisibility(){
    const loginActive=q('#loginTab')?.classList.contains('on');
    forgot.style.display=loginActive?'block':'none';
    updatePasswordExperience();
    syncResendVisibility();
  }

  passwordToggle.addEventListener('click',()=>{
    if(!passwordInput)return;
    passwordInput.type=passwordInput.type==='password'?'text':'password';
    updatePasswordExperience();
    passwordInput.focus();
  });
  passwordInput?.addEventListener('input',()=>{setFieldError('','password');updatePasswordExperience()});
  q('#authEmail')?.addEventListener('input',()=>{setFieldError('','email');syncResendVisibility()});
  q('#authForm')?.addEventListener('submit',event=>{
    const email=String(q('#authEmail')?.value||'').trim();
    const password=String(passwordInput?.value||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      event.preventDefault();event.stopImmediatePropagation();setFieldError(text().invalidAuthEmail,'email');q('#authEmail')?.focus();return;
    }
    if(authSignupMode()&&password.length<12){
      event.preventDefault();event.stopImmediatePropagation();setFieldError(text().invalidAuthPassword,'password');passwordInput?.focus();return;
    }
    setFieldError('','email');setFieldError('','password');
  },true);

  const authSubmit=q('#authSubmit');
  const syncAuthSubmit=()=>{if(!authSubmit)return;const idle=typeof T==='function'?(authSignupMode()?T().signupBtn:T().loginBtn):'';authSubmit.textContent=authSubmit.disabled?text().working:idle};
  if(authSubmit)new MutationObserver(syncAuthSubmit).observe(authSubmit,{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(syncResendVisibility).observe(q('#authMsg'),{childList:true,subtree:true,characterData:true});
  let resendTimer=null;
  resend.addEventListener('click',async()=>{
    const email=String(resend.dataset.email||q('#authEmail')?.value||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setFieldError(text().invalidAuthEmail,'email');return}
    resend.disabled=true;
    try{
      const response=await fetch('/api/auth/resend-verification',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
      const payload=await response.json().catch(()=>({}));
      q('#authMsg').textContent=response.ok&&payload.ok?text().resent:text().resendFailed;
      let remaining=60;
      clearInterval(resendTimer);
      resendTimer=setInterval(()=>{
        remaining--;
        if(remaining<=0){clearInterval(resendTimer);resend.disabled=false;resend.textContent=text().resend;return}
        resend.textContent=text().wait+' '+remaining+(language()==='ar'?' ثانية':'s');
      },1000);
    }catch{q('#authMsg').textContent=text().resendFailed;resend.disabled=false}
  });

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
})();`;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  return res.end(script);
}
