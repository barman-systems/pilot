import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerSessionToken } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BROKER_URL=String(process.env.DABBIR_OWNER_BROKER_URL||`${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/,'');
const RESOLUTIONS=new Set(['approve','reject','modify']);

async function broker(sessionToken,dataAction,payload={}){
  try{
    const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_data',session_token:sessionToken,data_action:dataAction,...payload}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const p=await r.json().catch(()=>({ok:false,error:'OWNER_BROKER_INVALID_RESPONSE'}));
    return {status:r.status,body:p};
  }catch{return {status:503,body:{ok:false,error:'OWNER_BROKER_UNAVAILABLE'}}}
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  if(req.method==='GET'){
    const limit=Math.max(1,Math.min(Number(singleQueryValue(req,'limit'))||30,100));
    const call=await broker(sessionToken,'decisions',{limit});
    if(!call.body?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.body?.error||'OWNER_DECISIONS_READ_FAILED'});
    return json(res,200,{ok:true,decisions:Array.isArray(call.body?.payload?.decisions)?call.body.payload.decisions:[]});
  }

  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  let body;try{body=await readJsonBody(req,8192)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
  const escalationId=String(body?.escalation_id||'').trim();
  const resolution=String(body?.resolution||'').trim().toLowerCase();
  const note=String(body?.note||'').trim().slice(0,2000)||null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(escalationId))return json(res,400,{ok:false,error:'INVALID_ESCALATION_ID'});
  if(!RESOLUTIONS.has(resolution))return json(res,400,{ok:false,error:'INVALID_OWNER_RESOLUTION'});
  if(resolution==='modify'&&!note)return json(res,400,{ok:false,error:'MODIFICATION_NOTE_REQUIRED'});
  const call=await broker(sessionToken,'decision_resolve',{escalation_id:escalationId,resolution,note});
  if(!call.body?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.body?.error||'OWNER_DECISION_UPDATE_FAILED'});
  const list=await broker(sessionToken,'decisions',{limit:30});
  return json(res,200,{ok:true,decision:call.body?.payload?.decision||null,decisions:Array.isArray(list.body?.payload?.decisions)?list.body.payload.decisions:[]});
}
