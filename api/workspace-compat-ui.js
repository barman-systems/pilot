const script=String.raw`(()=>{
  if(window.__dabbirWorkspaceCompatUi)return;
  window.__dabbirWorkspaceCompatUi=true;
  try{
    if(!Object.prototype.hasOwnProperty.call(window,'workspace')){
      Object.defineProperty(window,'workspace',{
        configurable:true,
        enumerable:false,
        get(){try{return workspace}catch{return null}}
      });
    }
  }catch{}
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-workspace-compat','v1');
  return res.end(script);
}
