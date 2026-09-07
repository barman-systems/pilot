export default async function handler(_req, res) {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(`(()=>{
  if(window.__dabbirSentryBridgeInstalled)return;
  window.__dabbirSentryBridgeInstalled=true;
  const sent=new Set();
  function clean(v,n){return String(v==null?'':v).replace(/([?&](?:token|key|secret|code|password|authorization)=)[^&#\\s]+/gi,'$1[redacted]').slice(0,n||6000)}
  function pathOnly(){try{return location.pathname}catch{return '/'}}
  async function report(payload){
    try{
      const sig=clean((payload.name||'Error')+':'+(payload.message||''),500);
      if(sent.has(sig))return;
      sent.add(sig);
      if(sent.size>40)sent.clear();
      await fetch('/api/sentry-browser',{method:'POST',headers:{'content-type':'application/json','x-dabbir-client':'web'},credentials:'same-origin',keepalive:true,body:JSON.stringify({source:clean(payload.source||'window',80),name:clean(payload.name||'Error',120),message:clean(payload.message||'BROWSER_ERROR',1200),stack:clean(payload.stack||'',6000),path:pathOnly()})});
    }catch{}
  }
  addEventListener('error',event=>{
    const err=event.error;
    report({source:'window.error',name:err?.name||'Error',message:err?.message||event.message||'BROWSER_ERROR',stack:err?.stack||''});
  });
  addEventListener('unhandledrejection',event=>{
    const reason=event.reason;
    report({source:'unhandledrejection',name:reason?.name||'UnhandledRejection',message:reason?.message||String(reason||'UNHANDLED_REJECTION'),stack:reason?.stack||''});
  });
})();`);
}
