function sendJson(res,status,payload,extraHeaders={}){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  for(const [key,value] of Object.entries(extraHeaders))res.setHeader(key,value);
  res.end(JSON.stringify(payload));
}

export default function handler(req,res){
  if(req.method!=='GET'){
    return sendJson(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  }

  const commitSha=String(process.env.VERCEL_GIT_COMMIT_SHA||'').trim();
  const deploymentId=String(process.env.VERCEL_DEPLOYMENT_ID||'').trim();
  const environment=String(process.env.VERCEL_TARGET_ENV||process.env.VERCEL_ENV||'').trim();
  const gitRef=String(process.env.VERCEL_GIT_COMMIT_REF||'').trim();

  if(!/^[a-f0-9]{40}$/i.test(commitSha)){
    return sendJson(res,503,{
      ok:false,
      error:'RELEASE_COMMIT_EVIDENCE_UNAVAILABLE',
      environment:environment||null,
    });
  }

  return sendJson(res,200,{
    ok:true,
    commit_sha:commitSha.toLowerCase(),
    deployment_id:deploymentId||null,
    environment:environment||null,
    git_ref:gitRef||null,
  });
}
