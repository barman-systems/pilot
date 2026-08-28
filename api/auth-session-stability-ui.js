import { AUTH_SESSION_STAGES, AUTH_SESSION_TRANSITIONS } from './_dabbir-auth-session-state-machine.js';

// The auth state machine observes/validates presentation state. The base
// application remains the sole gate-visibility authority; MFA continuation
// stays inside the already-visible auth gate and never creates a second gate.
const authSessionMachine = JSON.stringify({
  stages: AUTH_SESSION_STAGES,
  transitions: AUTH_SESSION_TRANSITIONS,
});

const script = String.raw`(()=>{
  if(window.__dabbirAuthSessionStabilityV5) return;
  window.__dabbirAuthSessionStabilityV5=true;

  const authMachine=${authSessionMachine};
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
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.status(200).send(script);
}