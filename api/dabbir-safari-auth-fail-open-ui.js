const script = String.raw`(()=>{
  if(window.__dabbirSafariAuthFailOpenV1) return;
  window.__dabbirSafariAuthFailOpenV1=true;

  var VERSION='safari-auth-fail-open-v1';
  var probeRunning=false;
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
  function revealAuth(reason){
    if(!gateMissing()) return false;
    try{
      if(typeof window.showGate==='function'){
        window.showGate('auth');
      }else{
        var loading=node('loading');
        var auth=node('authGate');
        var onboarding=node('onboardingGate');
        var app=node('appShell');
        var bottom=node('bottomNav');
        if(loading) loading.hidden=true;
        if(auth){auth.hidden=false;auth.classList.remove('hidden')}
        if(onboarding){onboarding.hidden=true;onboarding.classList.add('hidden')}
        if(app){app.hidden=true;app.classList.add('hidden')}
        if(bottom) bottom.classList.add('hidden');
      }
      recovered=true;
      publish(reason,401);
      return true;
    }catch(_e){return false}
  }
  function probe(reason){
    if(probeRunning||recovered||!gateMissing()) return;
    probeRunning=true;
    var timeout=new Promise(function(resolve){setTimeout(function(){resolve(null)},4000)});
    var request;
    try{
      request=fetch('/api/dabbir-runtime-fast?summary=1',{credentials:'same-origin',cache:'no-store'}).catch(function(){return null});
    }catch(_e){request=Promise.resolve(null)}
    Promise.race([request,timeout]).then(function(response){
      if(response&&response.status===401&&gateMissing()) revealAuth(reason||'AUTH_REQUIRED_RECOVERY');
      else publish(reason||'PROBE_COMPLETE',response&&response.status);
    }).finally(function(){probeRunning=false});
  }

  publish('ARMED',0);
  setTimeout(function(){probe('BOOT_WATCHDOG')},1200);
  setTimeout(function(){probe('BOOT_WATCHDOG_RETRY')},3200);
  window.addEventListener('error',function(){setTimeout(function(){probe('WINDOW_ERROR')},0)});
  window.addEventListener('unhandledrejection',function(){setTimeout(function(){probe('UNHANDLED_REJECTION')},0)});
})();`;

export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('surrogate-control','no-store');
  res.setHeader('x-dabbir-safari-auth-fail-open','v1');
  res.status(200).send(script);
}
