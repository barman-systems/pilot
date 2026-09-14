import { runVercelLiveResearch } from './_dabbir-live-research.js';

const CANARY_BRANCH='feat/dabbir-live-research-vercel';

function json(res,status,body){
  res.setHeader('cache-control','no-store');
  res.setHeader('x-robots-tag','noindex');
  return res.status(status).json(body);
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(process.env.VERCEL_ENV!=='preview')return json(res,404,{ok:false,error:'NOT_FOUND'});
  if(String(process.env.VERCEL_GIT_COMMIT_REF||'')!==CANARY_BRANCH)return json(res,404,{ok:false,error:'NOT_FOUND'});
  try{
    const result=await runVercelLiveResearch({
      query:'Find the current official Vercel documentation page for AI Gateway web search and identify the supported Exa search tool.',
      num_results:4,
      include_domains:['vercel.com'],
    });
    return json(res,200,{
      ok:true,
      state:result.state,
      source:result.source,
      version:result.version,
      provider_tool:result.provider_tool,
      source_count:result.source_count,
      sources:result.sources.slice(0,4),
      answer:result.answer,
      values_exposed:false,
    });
  }catch(error){
    return json(res,502,{ok:false,error:String(error?.message||'LIVE_RESEARCH_CANARY_FAILED').slice(0,120),values_exposed:false});
  }
}
