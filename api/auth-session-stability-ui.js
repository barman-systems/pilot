import { AUTH_SESSION_STAGES, AUTH_SESSION_TRANSITIONS } from './_dabbir-auth-session-state-machine.js';

// The auth state machine is observability/validation only. The base application
// owns gate visibility so a valid session can never be hidden by a second UI
// authority after login.
const authSessionMachine = JSON.stringify({
  stages: AUTH_SESSION_STAGES,
  transitions: AUTH_SESSION_TRANSITIONS,
});

const script = String.raw`(()=>{
  if(window.__dabbirAuthSessionStabilityV4) return;
  window.__dabbirAuthSessionStabilityV4=true;

  const authMachine=${authSessionMachine};
  let authStage=authMachine.stages.SIGNED_OUT;

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
  style.dataset.dabbirAuthGateAuthority='ios-auth-stability-v4';
  style.textContent=[
    '.bottomNav.hidden{display:none!important}',
    '#appShell.hidden{display:none!important}',
    '#authGate:not(.hidden),#onboardingGate:not(.hidden){position:fixed!important;inset:0!important;z-index:90!important;overflow:auto!important;min-height:100dvh!important;overscroll-behavior:contain!important}',
    '#authGate:not(.hidden)~#bottomNav,#onboardingGate:not(.hidden)~#bottomNav{display:none!important}',
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

  function localized(keyAr,keyEn){
    return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')?keyAr:keyEn;
  }

  function syncStageFromGate(name,reason='GATE_RENDERED'){
    if(name==='app'){
      publishAuthStage(authMachine.stages.WORKSPACE_READY,reason);
    }else if(name==='onboarding'){
      publishAuthStage(authMachine.stages.SESSION_VERIFIED,reason);
    }else if(name==='auth'&&authStage!==authMachine.stages.SUSPENDED){
      publishAuthStage(authMachine.stages.SIGNED_OUT,reason);
    }
    document.body.dataset.dabbirGate=String(name||'');
    const bottom=document.querySelector('#bottomNav');
    if(bottom&&name!=='app') bottom.classList.add('hidden');
  }

  // IMPORTANT: visibility is owned by the base application. This wrapper must
  // never delay, veto, reconcile, or redirect a requested gate. It only records
  // the state after the base gate has been rendered.
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

        publishAuthStage(authMachine.stages.SESSION_VERIFIED,'SESSION_COOKIE_VERIFIED');
        await boot();
      }catch{
        publishAuthStage(authMachine.stages.DEGRADED,'AUTH_REQUEST_FAILED');
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
    publishAuthStage(authMachine.stages.WORKSPACE_READY,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate='app';
  }else if(onboardingVisible){
    publishAuthStage(authMachine.stages.SESSION_VERIFIED,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate='onboarding';
  }else{
    publishAuthStage(authMachine.stages.SIGNED_OUT,'BASE_RUNTIME_BOOTSTRAP');
    document.body.dataset.dabbirGate=authVisible?'auth':'';
  }

  window.__dabbirAuthSessionStability={version:'ios-auth-stability-v4',session_retry:true,gate_isolation:true,state_machine:true,gate_observer_only:true};
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.status(200).send(script);
}