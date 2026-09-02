const script=String.raw`(()=>{
  if(window.__dabbirRouteAuthorityUi)return;
  window.__dabbirRouteAuthorityUi=true;

  function workspaceBusinessType(){
    try{
      if(typeof workspace!=='undefined'&&workspace?.business)return String(workspace.business.business_type||'').toLowerCase();
    }catch{}
    return String(window.workspace?.business?.business_type||'').toLowerCase();
  }

  function canonicalTarget(name){
    const target=String(name||'').trim();
    if(target==='appointments'&&workspaceBusinessType()==='store')return 'operations';
    return target;
  }

  function install(){
    if(window.__dabbirCanonicalShowScreenInstalled)return true;
    if(typeof showScreen!=='function')return false;
    const baseShowScreen=showScreen;
    showScreen=function(name){
      const target=canonicalTarget(name);
      window.__dabbirLastCanonicalNavigation={requested:String(name||''),target,at:new Date().toISOString()};
      return baseShowScreen.call(this,target);
    };
    window.__dabbirCanonicalShowScreenInstalled=true;
    try{window.__dabbirContextualNavigation?.refresh?.()}catch{}
    return true;
  }

  if(!install())setTimeout(install,0);
  setTimeout(install,250);
  setTimeout(()=>{try{window.__dabbirContextualNavigation?.refresh?.()}catch{}},650);

  window.__dabbirRouteAuthority={
    version:'route-authority-v1',
    authority:'context-router-canonical-guard',
    store_appointments_target:'operations',
  };
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-route-authority','v1');
  return res.status(200).send(script);
}
