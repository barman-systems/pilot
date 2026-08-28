import { AUTH_SESSION_STAGES, AUTH_SESSION_TRANSITIONS } from './_dabbir-auth-session-state-machine.js';

// BAR-30 exact-head preview marker: auth/session state machine v1.
const authSessionMachine = JSON.stringify({
  stages: AUTH_SESSION_STAGES,
  transitions: AUTH_SESSION_TRANSITIONS,
});

const script = String.raw`(()=>{
  if(window.__dabbirAuthSessionStabilityV2) return;
  window.__dabbirAuthSessionStabilityV2=true;

  const authMachine=${authSessionMachine};
  let authStage=authMachine.stages.SIGNED_OUT;
  let gateRecoveryPromise=null;
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
  style.dataset.dabbirAuthGateAuthority='ios-auth-stability-v2';
  style.textContent=[
    '.bottomNav.hidden{display:none!important}',
    '#appShell.hidden{display:none!important}',
    '#authGate:not(.hidden),#onboardingGate:not(.hidden),#mfaGate:not(.hidden){position:fixed!important;inset:0!important;z-index:90!important;overflow:auto!important;min-height:100dvh!important;overscroll-behavior:contain!important}',
    '#authGate:not(.hidden)~#bottomNav,#onboardingGate:not(.hidden)~#bottomNav,#mfaGate:not(.hidden)~#bottomNav{display:none!important}',
    '#mfaGate .mfaHint{margin-top:10px;color:var(--muted);font-size:11px;line-height:1.7}',
    '#mfaGate .mfaActions{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:14px}',
  ].join('');
  document.head.appendChild(style);

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function localized(keyAr,keyEn){
    return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')?keyAr:keyEn;
  }

  function ensureMfaGate(){
    let gate=document.querySelector('#mfaGate');
    if(gate) return gate;
    gate=document.createElement('section');
    gate.id='mfaGate';
    gate.className='authWrap hidden';
    gate.innerHTML='<form class="authCard" id="mfaForm"><div class="brand"><div class="logo">D</div><div><b>DABBIR | دبّر</b><br><small id="mfaTag"></small></div></div><h1 id="mfaTitle"></h1><p class="mfaHint" id="mfaHint"></p><div class="field"><label id="mfaCodeLabel" for="mfaCode"></label><input id="mfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" minlength="6" maxlength="8" required></div><div class="authMsg" id="mfaMsg" role="status" aria-live="polite"></div><div class="mfaActions"><button class="primary" id="mfaSubmit" type="submit"></button><button class="secondary" id="mfaCancel" type="button"></button></div></form>';
    document.body.appendChild(gate);

    const cancel=gate.querySelector('#mfaCancel');
    if(cancel){
      cancel.onclick=async()=>{
        cancel.disabled=true;
        try{await api('/api/auth/logout',{method:'POST',credentials:'same-origin',body:'{}'});}catch{}
        pendingMfaFactorId=null;
        pendingMfaFactorType=null;
        gate.querySelector('#mfaCode').value='';
        gate.classList.add('hidden');
        setAuthStage(authMachine.stages.SIGNED_OUT,'MFA_CANCELLED');
        baseShowGate('auth');
        document.body.dataset.dabbirGate='auth';
        cancel.disabled=false;
      };
    }

    const form=gate.querySelector('#mfaForm');
    if(form){
      form.onsubmit=async event=>{
        event.preventDefault();
        const submit=gate.querySelector('#mfaSubmit');
        const msg=gate.querySelector('#mfaMsg');
        const code=String(gate.querySelector('#mfaCode')?.value||'').trim();
        if(!submit||authStage!==authMachine.stages.MFA_REQUIRED) return;
        if(!pendingMfaFactorId||pendingMfaFactorType!=='totp'){
          if(msg) msg.textContent=localized('تعذر تحديد عامل المصادقة الآمن. أعد تسجيل الدخول.','A supported secure authentication factor is unavailable. Sign in again.');
          return;
        }
        if(!/^\\d{6,8}$/.test(code)){
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
          const session=await sessionReady();
          if(!session.ready||session.suspended) throw new Error('MFA_SESSION_NOT_READY');
          const status=await mfaStatus();
          if(status.current_level!=='aal2'||status.mfa_required===true) throw new Error('MFA_AAL2_NOT_PROVEN');
          pendingMfaFactorId=null;
          pendingMfaFactorType=null;
          gate.classList.add('hidden');
          if(!setAuthStage(authMachine.stages.SESSION_VERIFIED,'MFA_AAL2_VERIFIED')) throw new Error('MFA_STATE_TRANSITION_FAILED');
          await boot();
        }catch{
          if(msg) msg.textContent=localized('تعذر إكمال التحقق الآمن. حاول مرة أخرى.','Secure verification could not be completed. Please try again.');
        }finally{
          submit.disabled=false;
        }
      };
    }
    return gate;
  }

  function showMfaGate(factorId,factorType){
    pendingMfaFactorId=String(factorId||'').trim()||null;
    pendingMfaFactorType=String(factorType||'').trim().toLowerCase()||null;
    const gate=ensureMfaGate();
    ['loading','authGate','onboardingGate','appShell'].forEach(id=>document.querySelector('#'+id)?.classList.add('hidden'));
    document.querySelector('#bottomNav')?.classList.add('hidden');
    gate.classList.remove('hidden');
    const title=gate.querySelector('#mfaTitle');
    const hint=gate.querySelector('#mfaHint');
    const label=gate.querySelector('#mfaCodeLabel');
    const submit=gate.querySelector('#mfaSubmit');
    const cancel=gate.querySelector('#mfaCancel');
    const tag=gate.querySelector('#mfaTag');
    const msg=gate.querySelector('#mfaMsg');
    if(tag) tag.textContent=localized('تحقق أمني','Security verification');
    if(title) title.textContent=localized('أكمل تسجيل الدخول','Complete sign in');
    if(label) label.textContent=localized('رمز المصادقة','Authentication code');
    if(submit) submit.textContent=localized('تحقق وادخل','Verify and continue');
    if(cancel) cancel.textContent=localized('إلغاء','Cancel');
    if(msg) msg.textContent='';
    if(hint){
      hint.textContent=pendingMfaFactorType==='totp'
        ? localized('افتح تطبيق المصادقة وأدخل الرمز الحالي. لن يفتح دبّر بيانات العمل قبل اكتمال التحقق.','Open your authenticator app and enter the current code. DABBIR will not open workspace data until verification is complete.')
        : localized('هذا الحساب يتطلب وسيلة تحقق إضافية غير مدعومة في هذه الشاشة. ألغِ العملية ثم استخدم وسيلة المصادقة المعتمدة.','This account requires an additional verification method that is not supported on this screen. Cancel and use the approved authentication method.');
    }
    document.body.dataset.dabbirGate='mfa';
    setTimeout(()=>gate.querySelector('#mfaCode')?.focus(),0);
  }

  function hideMfaGate(){
    document.querySelector('#mfaGate')?.classList.add('hidden');
  }

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

  function showSessionError(textAr,textEn){
    const msg=document.querySelector('#authMsg');
    if(msg) msg.textContent=localized(textAr,textEn);
  }

  const baseShowGate=showGate;

  async function continueAfterPrimaryAuth(msg){
    let status;
    try{status=await mfaStatus();}
    catch{
      setAuthStage(authMachine.stages.DEGRADED,'MFA_STATUS_UNAVAILABLE');
      if(msg) msg.textContent=localized('تم تسجيل الدخول، لكن تعذر التحقق من متطلبات الأمان. حاول مرة أخرى.','Signed in, but security requirements could not be verified. Please try again.');
      return false;
    }
    if(status.mfa_required===true){
      if(!status.factor_id){
        setAuthStage(authMachine.stages.DEGRADED,'MFA_FACTOR_MISSING');
        if(msg) msg.textContent=localized('يتطلب الحساب تحققًا إضافيًا لكن عامل المصادقة غير متاح.','This account requires additional verification, but no authentication factor is available.');
        return false;
      }
      if(!setAuthStage(authMachine.stages.MFA_REQUIRED,'MFA_REQUIRED_AFTER_PRIMARY_AUTH')) return false;
      showMfaGate(status.factor_id,status.factor_type);
      return false;
    }
    if(!setAuthStage(authMachine.stages.SESSION_VERIFIED,'SESSION_COOKIE_VERIFIED')) return false;
    hideMfaGate();
    await boot();
    return true;
  }

  async function reconcileVerifiedGate(name){
    if(gateRecoveryPromise) return gateRecoveryPromise;
    gateRecoveryPromise=(async()=>{
      const state=await sessionReady();
      if(state.suspended){
        setAuthStage(authMachine.stages.SUSPENDED,'ACCOUNT_SUSPENDED',{bootstrap:true});
        hideMfaGate();
        baseShowGate('auth');
        document.body.dataset.dabbirGate='auth';
        showSessionError('الحساب موقوف. تواصل مع دعم دبّر.','This account is suspended. Contact DABBIR support.');
        return;
      }
      if(!state.ready){
        publishAuthStage(authMachine.stages.DEGRADED,'GATE_SESSION_RECONCILIATION_FAILED');
        hideMfaGate();
        baseShowGate('auth');
        document.body.dataset.dabbirGate='auth';
        showSessionError('تعذر التحقق من الجلسة. سجّل الدخول مرة أخرى.','The session could not be verified. Please log in again.');
        return;
      }

      let status;
      try{status=await mfaStatus();}
      catch{
        publishAuthStage(authMachine.stages.DEGRADED,'MFA_STATUS_RECONCILIATION_FAILED');
        hideMfaGate();
        baseShowGate('auth');
        document.body.dataset.dabbirGate='auth';
        showSessionError('تعذر التحقق من متطلبات الأمان. سجّل الدخول مرة أخرى.','Security requirements could not be verified. Please log in again.');
        return;
      }
      if(status.mfa_required===true){
        setAuthStage(authMachine.stages.MFA_REQUIRED,'MFA_REQUIRED_ON_GATE_RECONCILIATION',{bootstrap:true});
        showMfaGate(status.factor_id,status.factor_type);
        return;
      }

      hideMfaGate();
      setAuthStage(authMachine.stages.SESSION_VERIFIED,'SESSION_RECONCILED_FOR_GATE',{bootstrap:true});
      if(name==='app'){
        setAuthStage(authMachine.stages.WORKSPACE_READY,'WORKSPACE_RENDERED');
      }
      baseShowGate(name);
      document.body.dataset.dabbirGate=String(name||'');
      const bottom=document.querySelector('#bottomNav');
      if(bottom&&name!=='app') bottom.classList.add('hidden');
    })().finally(()=>{gateRecoveryPromise=null});
    return gateRecoveryPromise;
  }

  showGate=function(name){
    if(authStage===authMachine.stages.MFA_REQUIRED){
      showMfaGate(pendingMfaFactorId,pendingMfaFactorType);
      return;
    }
    if(name==='auth'){
      if(authStage!==authMachine.stages.SUSPENDED){
        setAuthStage(authMachine.stages.SIGNED_OUT,'AUTH_GATE_VISIBLE');
      }
    }else if(name==='onboarding'){
      if(authStage!==authMachine.stages.SESSION_VERIFIED){
        if(authStage===authMachine.stages.SIGNED_OUT||authStage===authMachine.stages.DEGRADED){
          void reconcileVerifiedGate('onboarding');
          return;
        }
        publishAuthStage(authMachine.stages.DEGRADED,'ONBOARDING_WITHOUT_VERIFIED_SESSION');
        baseShowGate('auth');
        showSessionError('تعذر التحقق من الجلسة. سجّل الدخول مرة أخرى.','The session could not be verified. Please log in again.');
        return;
      }
    }else if(name==='app'){
      if(authStage===authMachine.stages.SESSION_VERIFIED){
        setAuthStage(authMachine.stages.WORKSPACE_READY,'WORKSPACE_RENDERED');
      }else if(authStage!==authMachine.stages.WORKSPACE_READY){
        if(authStage===authMachine.stages.SIGNED_OUT||authStage===authMachine.stages.DEGRADED){
          void reconcileVerifiedGate('app');
          return;
        }
        publishAuthStage(authMachine.stages.DEGRADED,'WORKSPACE_WITHOUT_VERIFIED_SESSION');
        baseShowGate('auth');
        showSessionError('تعذر التحقق من الجلسة. سجّل الدخول مرة أخرى.','The session could not be verified. Please log in again.');
        return;
      }
    }

    hideMfaGate();
    baseShowGate(name);
    document.body.dataset.dabbirGate=String(name||'');
    const bottom=document.querySelector('#bottomNav');
    if(bottom&&name!=='app') bottom.classList.add('hidden');
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
        setAuthStage(authMachine.stages.SIGNED_OUT,'AUTH_RETRY');
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
          setAuthStage(authMachine.stages.SIGNED_OUT,'EMAIL_VERIFICATION_REQUIRED');
          if(msg) msg.textContent=T().verification;
          return;
        }
        if(!r.ok||!j?.ok){
          setAuthStage(authMachine.stages.SIGNED_OUT,'AUTH_REJECTED');
          if(msg) msg.textContent=T().invalid;
          return;
        }

        const state=await sessionReady();
        if(state.suspended){
          setAuthStage(authMachine.stages.SUSPENDED,'ACCOUNT_SUSPENDED');
          if(msg) msg.textContent=localized('الحساب موقوف. تواصل مع دعم دبّر.','This account is suspended. Contact DABBIR support.');
          return;
        }
        if(!state.ready){
          setAuthStage(authMachine.stages.DEGRADED,'SESSION_VERIFICATION_FAILED');
          if(msg) msg.textContent=localized('تم قبول البيانات لكن تعذر تثبيت الجلسة. حاول مرة أخرى.','The credentials were accepted but the session could not be established. Please try again.');
          return;
        }

        await continueAfterPrimaryAuth(msg);
      }catch{
        setAuthStage(authMachine.stages.DEGRADED,'AUTH_REQUEST_FAILED');
        if(msg) msg.textContent=localized('تعذر الاتصال. حاول مرة أخرى.','Connection failed. Please try again.');
      }finally{
        btn.disabled=false;
      }
    };
  }

  const authVisible=document.querySelector('#authGate:not(.hidden)');
  const onboardingVisible=document.querySelector('#onboardingGate:not(.hidden)');
  const appVisible=document.querySelector('#appShell:not(.hidden)');
  if(appVisible){
    setAuthStage(authMachine.stages.WORKSPACE_READY,'BASE_RUNTIME_BOOTSTRAP',{bootstrap:true});
  }else if(onboardingVisible){
    setAuthStage(authMachine.stages.SESSION_VERIFIED,'BASE_RUNTIME_BOOTSTRAP',{bootstrap:true});
  }else{
    setAuthStage(authMachine.stages.SIGNED_OUT,'BASE_RUNTIME_BOOTSTRAP',{bootstrap:true});
  }
  document.body.dataset.dabbirGate=authVisible?'auth':onboardingVisible?'onboarding':appVisible?'app':'';

  async function enforceExistingMfa(){
    const state=await sessionReady();
    if(!state.ready||state.suspended) return;
    try{
      const status=await mfaStatus();
      if(status.mfa_required===true){
        setAuthStage(authMachine.stages.MFA_REQUIRED,'MFA_REQUIRED_ON_RESUME',{bootstrap:true});
        showMfaGate(status.factor_id,status.factor_type);
      }
    }catch{
      if(appVisible||onboardingVisible){
        publishAuthStage(authMachine.stages.DEGRADED,'MFA_STATUS_RESUME_FAILED');
        hideMfaGate();
        baseShowGate('auth');
        document.body.dataset.dabbirGate='auth';
        showSessionError('تعذر التحقق من متطلبات الأمان. سجّل الدخول مرة أخرى.','Security requirements could not be verified. Please log in again.');
      }
    }
  }
  void enforceExistingMfa();

  window.__dabbirAuthSessionStability={version:'ios-auth-stability-v4',session_retry:true,gate_isolation:true,state_machine:true,gate_reconciliation:true,mfa_continuation:true};
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.status(200).send(script);
}
