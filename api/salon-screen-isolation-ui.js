const script=String.raw`(()=>{
  if(window.__dabbirSalonScreenIsolation)return;
  const styleId='dabbir-salon-screen-isolation';
  if(!document.getElementById(styleId)){
    const style=document.createElement('style');
    style.id=styleId;
    style.textContent='.salonMode .screen.salonOnly{display:none!important}.salonMode .screen.salonOnly.active{display:block!important}';
    document.head.append(style);
  }
  window.__dabbirSalonScreenIsolation={version:'v1',rule:'active-screen-only'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-salon-screen-isolation','v1');
  return res.status(200).send(script);
}
