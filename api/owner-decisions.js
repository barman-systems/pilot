import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerBroker } from './_owner-broker-client.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 if(req.method==='GET'){
  const call=await ownerBroker(req,'decisions',{limit:100});
  if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'OWNER_DECISIONS_READ_FAILED'});
  return json(res,200,{ok:true,decisions:Array.isArray(call.payload?.payload?.decisions)?call.payload.payload.decisions:[]});
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,8192)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const id=String(body?.escalation_id||'').trim(),resolution=String(body?.resolution||'').trim().toLowerCase(),note=String(body?.note||'').trim().slice(0,2000);
 if(!UUID.test(id))return json(res,400,{ok:false,error:'INVALID_ESCALATION_ID'});
 if(!['approve','reject','modify'].includes(resolution))return json(res,400,{ok:false,error:'INVALID_OWNER_RESOLUTION'});
 if(resolution==='modify'&&note.length<3)return json(res,400,{ok:false,error:'OWNER_NOTE_REQUIRED'});
 const call=await ownerBroker(req,'decision_resolve',{escalation_id:id,resolution,note:note||null});
 if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'OWNER_DECISION_UPDATE_FAILED'});
 return json(res,200,{ok:true,decision:call.payload?.payload?.decision||null});
}
