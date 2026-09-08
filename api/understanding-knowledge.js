import {accessTokenFromRequest,getBusinessMemberships,getVerifiedUser,json,readJsonBody,readRpcJson,requireSameOrigin,rpcErrorCode,supabaseRest,supabaseRpc} from './_auth-core.js';
import {singleQueryValue} from './_request-query.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=x=>UUID.test(String(x||''))?String(x):null;
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  try{
    const body=req.method==='POST'?await readJsonBody(req,4096):{};
    const businessId=id(body.business_id||singleQueryValue(req,'business_id'));
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const token=accessTokenFromRequest(req);
    if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
    const [user,memberships]=await Promise.all([getVerifiedUser(token),getBusinessMemberships(token)]);
    if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
    if(!memberships?.some(m=>m.business_id===businessId&&m.role==='owner'&&m.status==='active'))return json(res,403,{ok:false,error:'OWNER_REQUIRED'});
    if(req.method==='GET'){
      const response=await supabaseRest(`dabbir_ai_knowledge_proposals?business_id=eq.${businessId}&select=id,entity_type,alias,target_id,status,confidence,impact,version,created_at,reviewed_at&order=created_at.desc&limit=50`,token);
      if(!response.ok)throw new Error('KNOWLEDGE_READ_FAILED');
      return json(res,200,{ok:true,proposals:await response.json()});
    }
    const action=String(body.action||'');let name,args;
    if(action==='propose'){
      if(!id(body.target_id)||!['service','worker','branch'].includes(body.entity_type)||typeof body.alias!=='string'||body.alias.trim().length>80)return json(res,400,{ok:false,error:'INVALID_PROPOSAL'});
      name='dabbir_knowledge_propose_v2';args={p_business_id:businessId,p_conversation_id:id(body.conversation_id),p_correction_id:id(body.correction_id),p_entity_type:body.entity_type,p_alias:body.alias.trim(),p_target_id:id(body.target_id)};
    }else if(['approve','reject','revoke','rollback'].includes(action)&&id(body.proposal_id)){
      name='dabbir_knowledge_review_v2';args={p_business_id:businessId,p_proposal_id:id(body.proposal_id),p_action:action};
    }else return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
    const response=await supabaseRpc(name,token,args),payload=await readRpcJson(response);
    if(!response.ok)return json(res,400,{ok:false,error:rpcErrorCode(payload,'KNOWLEDGE_ACTION_FAILED')});
    return json(res,200,{ok:true,result:payload});
  }catch{return json(res,400,{ok:false,error:'KNOWLEDGE_REQUEST_FAILED'});}
}
