export default function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.statusCode=405;
    res.setHeader('allow','GET, HEAD');
    return res.end('Method Not Allowed');
  }
  res.statusCode=302;
  res.setHeader('location','/owner-dashboard');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-dabbir-legacy-owner-dashboard','retired');
  return res.end('Redirecting to canonical owner dashboard...');
}
