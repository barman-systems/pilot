import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerBroker } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 if(req.method==='GET'){
  const incidentId=String(singleQueryValue(req,'incident_id')||'').trim(),customerNo=String(singleQueryValue(req,'customer_no')||'').trim(),businessId=String(singleQueryValue(req,'business_id')||'').trim();
  if(incidentId&&!UUID.test(incidentId))return json(res,400,{ok:false,error:'INVALID_INCIDENT_ID'});if(businessId&&!UUID.test(businessId))return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
  const call=await ownerBroker(req,'incidents',{incident_id:incidentId||null,customer_no:customerNo||null,business_id:businessId||null});
  if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'INCIDENT_READ_FAILED'});
  return json(res,200,{ok:true,...(call.payload.payload||{})});
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const operation=String(body?.operation||'').trim().toLowerCase();if(!['create','update'].includes(operation))return json(res,400,{ok:false,error:'UNKNOWN_INCIDENT_OPERATION'});
 const call=await ownerBroker(req,'incident_action',{...body,operation});
 if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'INCIDENT_ACTION_FAILED'});
 return json(res,200,{ok:true,payload:call.payload.payload||null});
}
