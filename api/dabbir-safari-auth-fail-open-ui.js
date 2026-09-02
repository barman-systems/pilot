const script = String.raw`(()=>{
  if(window.__dabbirSafariAuthFailOpenV2) return;
  window.__dabbirSafariAuthFailOpenV2=true;

  var VERSION='safari-auth-fail-open-v2';
  var recovered=false;

  function node(id){return document.getElementById(id)}
  function isHidden(el){return !el||el.hidden===true||el.classList.contains('hidden')}
  function gateMissing(){
    var loading=node('loading');
    return Boolean(loading&&!isHidden(loading)&&isHidden(node('authGate'))&&isHidden(node('onboardingGate'))&&isHidden(node('appShell')));
  }
  function publish(reason,status){
    window.__dabbirSafariAuthFailOpen={version:VERSION,recovered:recovered,reason:reason||null,status:Number(status||0),updated_at:new Date().toISOString()};
    try{document.body.dataset.dabbirSafariAuthRecovery=recovered?'recovered':'armed'}catch(_e){}
  }
  function installAbortSignalTimeoutFallback(){
    try{
      if(globalThis.AbortSignal&&typeof globalThis.AbortSignal.timeout!=='function'&&globalThis.AbortController){
        globalThis.AbortSignal.timeout=function(ms){
          var controller=new AbortController();
          setTimeout(function(){try{controller.abort()}catch(_e){}},Math.max(0,Number(ms)||0));
          return controller.signal;
        };
      }
    }catch(_e){}
  }
  function revealAuth(reason,status){
    if(!gateMissing()) return false;
    try{
      var loading=node('loading');
      var auth=node('authGate');
      var onboarding=node('onboardingGate');
      var app=node('appShell');
      var bottom=node('bottomNav');
      if(loading){loading.hidden=true;loading.classList.add('hidden');loading.style.display='none'}
      if(auth){auth.hidden=false;auth.classList.remove('hidden');auth.style.removeProperty('display')}
      if(onboarding){onboarding.hidden=true;onboarding.classList.add('hidden')}
      if(app){app.hidden=true;app.classList.add('hidden')}
      if(bottom) bottom.classList.add('hidden');
      recovered=true;
      publish(reason,status||0);
      return true;
    }catch(_e){return false}
  }
  function watchdog(reason){
    if(!gateMissing()) return;
    revealAuth(reason||'BOOT_STALL_FAIL_OPEN',0);
  }

  installAbortSignalTimeoutFallback();
  publish('ARMED',0);
  setTimeout(function(){watchdog('BOOT_STALL_FAIL_OPEN')},900);
  setTimeout(function(){watchdog('BOOT_STALL_FAIL_OPEN_RETRY')},2200);
  window.addEventListener('error',function(){setTimeout(function(){watchdog('WINDOW_ERROR_FAIL_OPEN')},0)});
  window.addEventListener('unhandledrejection',function(){setTimeout(function(){watchdog('UNHANDLED_REJECTION_FAIL_OPEN')},0)});
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('surrogate-control','no-store');
  res.setHeader('x-dabbir-safari-auth-fail-open','v2');
  res.status(200).send(script);
}
