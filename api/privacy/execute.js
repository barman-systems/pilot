import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from '../_auth-core.js';
import { attachCorrelation, correlationId, logEvent } from '../_observability.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_ERRORS=[
  'AUTH_REQUIRED','OWNER_REQUIRED','PRIVACY_REQUEST_NOT_FOUND','CUSTOMER_PRIVACY_REQUEST_REQUIRED',
  'CUSTOMER_TARGET_ALREADY_REMOVED','PRIVACY_REQUEST_NOT_EXECUTABLE','CUSTOMER_NOT_FOUND',
  'CUSTOMER_EXPORT_TOO_LARGE','LEGAL_HOLD_ACTIVE','EXPLICIT_DELETE_CONFIRMATION_REQUIRED',
  'CUSTOMER_DELETE_NOT_VERIFIED',
];

function reply(res,status,body,cid){
  attachCorrelation(res,cid);
  return json(res,status,{...body,correlation_id:cid});
}

function errorCode(payload){
  const raw=String(payload?.message||payload?.error||'').toUpperCase();
  return KNOWN_ERRORS.find(code=>raw.includes(code))||'PRIVACY_EXECUTION_FAILED';
}

async function readRequest(token,requestId){
  const response=await supabaseRest(
    `dabbir_privacy_requests?select=id,business_id,customer_id,request_type,status&id=eq.${encodeURIComponent(requestId)}&limit=1`,
    token,
  );
  if(!response.ok)return null;
  const rows=await response.json().catch(()=>[]);
  return Array.isArray(rows)?rows[0]||null:null;
}

export default async function handler(req,res){
  const cid=correlationId(req);
  attachCorrelation(res,cid);
  if(req.method!=='POST')return reply(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},cid);
  if(!requireSameOrigin(req))return reply(res,403,{ok:false,error:'ORIGIN_REQUIRED'},cid);

  try{
    const token=accessTokenFromRequest(req);
    const user=token?await getVerifiedUser(token).catch(()=>null):null;
    if(!user)return reply(res,401,{ok:false,error:'AUTH_REQUIRED'},cid);
    const body=await readJsonBody(req,8192);
    const requestId=String(body.request_id||'').trim();
    if(!UUID.test(requestId))return reply(res,400,{ok:false,error:'PRIVACY_REQUEST_REQUIRED'},cid);

    const request=await readRequest(token,requestId);
    if(!request)return reply(res,404,{ok:false,error:'PRIVACY_REQUEST_NOT_FOUND'},cid);
    const memberships=await getBusinessMemberships(token).catch(()=>[]);
    const membership=memberships.find(item=>item.business_id===request.business_id&&item.status==='active');
    if(!membership||membership.role!=='owner')return reply(res,403,{ok:false,error:'OWNER_REQUIRED'},cid);

    const confirmation=body.confirmation==null?null:String(body.confirmation).slice(0,120);
    const rpc=await supabaseRpc('dabbir_execute_customer_privacy_request',token,{
      p_request_id:requestId,
      p_confirmation:confirmation,
    });
    const payload=await readRpcJson(rpc);
    if(!rpc.ok){
      const code=errorCode(payload);
      const status=code==='OWNER_REQUIRED'?403:code==='LEGAL_HOLD_ACTIVE'||code==='PRIVACY_REQUEST_NOT_EXECUTABLE'?409:code==='PRIVACY_REQUEST_NOT_FOUND'||code==='CUSTOMER_NOT_FOUND'?404:400;
      logEvent('warn',{correlation_id:cid,component:'privacy',operation:'execute_customer_request',outcome:'BLOCKED',failure_class:'POLICY',request_type:request.request_type,error_code:code});
      return reply(res,status,{ok:false,error:code},cid);
    }

    logEvent('info',{correlation_id:cid,component:'privacy',operation:'execute_customer_request',outcome:'VERIFIED_SUCCESS',request_type:request.request_type,persisted_request_state:true});
    return reply(res,200,{ok:true,result:payload},cid);
  }catch(error){
    const status=error?.message==='PAYLOAD_TOO_LARGE'?413:error?.message==='INVALID_JSON'?400:503;
    return reply(res,status,{ok:false,error:status===413?'PAYLOAD_TOO_LARGE':status===400?'INVALID_JSON':'PRIVACY_EXECUTION_UNAVAILABLE'},cid);
  }
}
