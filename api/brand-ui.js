const script = String.raw`(()=>{
  if(window.__dabbirBrandUiLoaded) return;
  window.__dabbirBrandUiLoaded=true;

  const icon='/dabbir-icon.svg';
  const style=document.createElement('style');
  style.textContent='.logo,.dabbirRecoveryLogo{background-image:url("/dabbir-icon.svg")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:cover!important;background-color:transparent!important;border:0!important;color:transparent!important;text-indent:-9999px!important;overflow:hidden!important}.brand .logo,.dabbirRecoveryLogo{box-shadow:0 8px 24px #0004}';
  document.head.appendChild(style);

  function link(rel,href,type){
    let node=document.head.querySelector('link[rel="'+rel+'"]');
    if(!node){node=document.createElement('link');node.rel=rel;document.head.appendChild(node)}
    node.href=href;
    if(type) node.type=type;
  }
  link('icon',icon,'image/svg+xml');
  link('shortcut icon',icon,'image/svg+xml');
  link('apple-touch-icon',icon);

  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content='#0B0D12';
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300, stale-while-revalidate=86400');
  res.setHeader('x-content-type-options','nosniff');
  return res.end(script);
}
