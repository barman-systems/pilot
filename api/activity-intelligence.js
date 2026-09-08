import {accessTokenFromRequest,getBusinessMemberships,getVerifiedUser,json,readJsonBody,readRpcJson,requireSameOrigin,rpcErrorCode,supabaseRest,supabaseRpc} from './_auth-core.js';
import {singleQueryValue} from './_request-query.js';
import registry from './_dabbir-activity-registry.json' with {type:'json'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=x=>UUID.test(String(x||''))?String(x):null;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 try{
  const token=accessTokenFromRequest(req);if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  const body=req.method==='POST'?await readJsonBody(req,10000):{};
  const businessId=id(body.business_id||singleQueryValue(req,'business_id'));
  const branchId=id(body.branch_id||singleQueryValue(req,'branch_id'));
  if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
  const [user,memberships]=await Promise.all([getVerifiedUser(token),getBusinessMemberships(token)]);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  if(!memberships?.some(m=>m.business_id===businessId&&m.role==='owner'&&m.status==='active'))return json(res,403,{ok:false,error:'OWNER_REQUIRED'});
  if(req.method==='GET'&&!branchId){
   const response=await supabaseRest(`dabbir_business_branches?business_id=eq.${businessId}&status=eq.active&select=id,name&order=name&limit=100`,token);
   if(!response.ok)throw Error('ACTIVITY_READ_FAILED');
   return json(res,200,{ok:true,branches:await response.json(),activity_types:Object.keys(registry.activities)});
  }
  if(!branchId)return json(res,400,{ok:false,error:'BRANCH_REQUIRED'});
  if(req.method==='GET'){
   const [response,auditResponse]=await Promise.all([
    supabaseRpc('dabbir_activity_profile_v1',token,{p_business_id:businessId,p_branch_id:branchId}),
    supabaseRest(`dabbir_activity_service_versions?business_id=eq.${businessId}&branch_id=eq.${branchId}&select=service_id,version,config,action,created_at,restored_version&order=version.desc&limit=100`,token)
   ]);
   const payload=await readRpcJson(response);if(!response.ok||!auditResponse.ok)throw Error('ACTIVITY_READ_FAILED');
   return json(res,200,{ok:true,profile:payload,audit:await auditResponse.json(),activity_types:Object.keys(registry.activities)});
  }
  if(!id(body.service_id)||!Number.isInteger(body.expected_version)||body.expected_version<0)return json(res,400,{ok:false,error:'ACTIVITY_VERSION_REQUIRED'});
  const action=String(body.action||'SAVE').toUpperCase();
  if(!['SAVE','REVOKE','ROLLBACK'].includes(action))return json(res,400,{ok:false,error:'ACTIVITY_ACTION_INVALID'});
  const response=await supabaseRpc('dabbir_activity_service_configure_v1',token,{p_business_id:businessId,p_branch_id:branchId,p_service_id:body.service_id,p_expected_version:body.expected_version,p_config:body.config||{},p_action:action,p_restore_version:body.restore_version||null});
  const payload=await readRpcJson(response);
  if(!response.ok)return json(res,400,{ok:false,error:rpcErrorCode(payload,'ACTIVITY_SAVE_FAILED')});
  return json(res,200,{ok:true,result:payload});
 }catch{return json(res,400,{ok:false,error:'ACTIVITY_REQUEST_FAILED'});}
}
