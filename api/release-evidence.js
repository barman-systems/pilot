const EXPECTED_PROJECT_ID='prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq';
const EXPECTED_REPOSITORY='barman-systems/pilot';
const EXPECTED_GIT_PROVIDER='github';

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
  const projectId=String(process.env.VERCEL_PROJECT_ID||'').trim();
  const gitProvider=String(process.env.VERCEL_GIT_PROVIDER||'').trim().toLowerCase();
  const repositoryOwner=String(process.env.VERCEL_GIT_REPO_OWNER||'').trim();
  const repositorySlug=String(process.env.VERCEL_GIT_REPO_SLUG||'').trim();
  const repository=repositoryOwner&&repositorySlug?`${repositoryOwner}/${repositorySlug}`:'';

  if(!/^[a-f0-9]{40}$/i.test(commitSha)){
    return sendJson(res,503,{
      ok:false,
      error:'RELEASE_COMMIT_EVIDENCE_UNAVAILABLE',
      environment:environment||null,
    });
  }

  if(!deploymentId.startsWith('dpl_')||!projectId||!gitProvider||!repository){
    return sendJson(res,503,{
      ok:false,
      error:'RELEASE_SOURCE_IDENTITY_UNAVAILABLE',
      environment:environment||null,
    });
  }

  if(projectId!==EXPECTED_PROJECT_ID||gitProvider!==EXPECTED_GIT_PROVIDER||repository!==EXPECTED_REPOSITORY){
    return sendJson(res,503,{
      ok:false,
      error:'RELEASE_SOURCE_IDENTITY_MISMATCH',
      environment:environment||null,
      project_id:projectId||null,
      git_provider:gitProvider||null,
      repository:repository||null,
    });
  }

  return sendJson(res,200,{
    ok:true,
    commit_sha:commitSha.toLowerCase(),
    deployment_id:deploymentId,
    environment:environment||null,
    git_ref:gitRef||null,
    project_id:projectId,
    git_provider:gitProvider,
    repository,
  });
}
