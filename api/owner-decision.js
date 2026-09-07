import { json, requireSameOrigin } from './_auth-core.js';
import { readOwnerBody, ownerSessionToken, ownerBroker } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';

const RESOLUTIONS=new Set(['approve','reject','modify']);


export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  if(req.method==='GET'){
    const limit=Math.max(1,Math.min(Number(singleQueryValue(req,'limit'))||30,100));
    const call=await ownerBroker(req,'decisions',{limit});
    if(!call.payload?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'OWNER_DECISIONS_READ_FAILED'});
    const decisions=call.payload?.payload?.decisions;
    if(!Array.isArray(decisions))return json(res,502,{ok:false,error:'OWNER_DECISIONS_RESPONSE_INVALID'});
    return json(res,200,{ok:true,decisions});
  }

  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  let body;try{body=await readOwnerBody(req,8192)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
  const escalationId=String(body?.escalation_id||'').trim();
  const resolution=String(body?.resolution||'').trim().toLowerCase();
  const note=String(body?.note||'').trim().slice(0,2000)||null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(escalationId))return json(res,400,{ok:false,error:'INVALID_ESCALATION_ID'});
  if(!RESOLUTIONS.has(resolution))return json(res,400,{ok:false,error:'INVALID_OWNER_RESOLUTION'});
  if(resolution==='modify'&&!note)return json(res,400,{ok:false,error:'MODIFICATION_NOTE_REQUIRED'});
  const call=await ownerBroker(req,'decision_resolve',{escalation_id:escalationId,resolution,note});
  if(!call.payload?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'OWNER_DECISION_UPDATE_FAILED'});
  const decision=call.payload?.payload?.decision;
  if(decision?.id!==escalationId||decision.status!=='resolved'||decision.decision?.resolution!==resolution)return json(res,502,{ok:false,error:'OWNER_DECISION_RECEIPT_MISSING',retry_safe:false});
  const list=await ownerBroker(req,'decisions',{limit:100});
  const decisions=list.payload?.ok&&Array.isArray(list.payload?.payload?.decisions)?list.payload.payload.decisions:null;
  const verified=Boolean(decisions?.some(row=>row.id===escalationId&&row.status==='resolved'&&row.decision?.resolution===resolution));
  return json(res,200,{ok:true,decision,decisions,readback_verified:verified,readback_error:verified?null:list.payload?.error||'OWNER_DECISION_READBACK_MISMATCH',retry_safe:false});
}
