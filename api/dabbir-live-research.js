import { accessTokenFromRequest, getBusinessMemberships, getVerifiedUser, json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { runVercelLiveResearch } from './_dabbir-live-research.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=800)=>String(value??'').trim().slice(0,max);

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const token=accessTokenFromRequest(req);
  if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  let body;
  try{body=await readJsonBody(req,{maxBytes:16_384})}catch{return json(res,400,{ok:false,error:'INVALID_JSON_BODY'})}
  const businessId=clean(body?.business_id,80);
  if(!UUID_RE.test(businessId))return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
  const query=clean(body?.query,500);
  if(!query)return json(res,400,{ok:false,error:'RESEARCH_QUERY_REQUIRED'});

  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  const membership=memberships.find(item=>item.business_id===businessId)||null;
  if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  if(String(membership.role||'').toLowerCase()!=='owner')return json(res,403,{ok:false,error:'OWNER_REQUIRED'});

  try{
    const result=await runVercelLiveResearch({
      query,
      num_results:body?.num_results,
      include_domains:body?.include_domains,
      category:body?.category,
    });
    return json(res,200,{
      ...result,
      business_id:businessId,
      access_scope:'owner_tenant_read_only',
    });
  }catch(error){
    const status=[400,429,502,503].includes(Number(error?.status))?Number(error.status):502;
    const code=clean(error?.message||'LIVE_RESEARCH_FAILED',120);
    return json(res,status,{ok:false,error:code,truth:'external_live_evidence',values_exposed:false});
  }
}
