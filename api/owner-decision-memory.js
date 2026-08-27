import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  readRpcJson,
  requireSameOrigin,
  rpcErrorCode,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_RE=/^[a-z0-9_.:-]{3,120}$/;
const SENSITIVE_RE=/(payment|refund|payout|withdraw|transfer|billing|invoice|legal|kyc|identity|bank|discount|price|money|cash|tax|vat|credential|secret|purchase|procure)/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);

async function rpc(token,name,params,fallback){
  const response=await supabaseRpc(name,token,params);
  const payload=await readRpcJson(response);
  if(!response.ok){
    const error=new Error(rpcErrorCode(payload,fallback));
    error.status=response.status;
    throw error;
  }
  return payload;
}

async function rest(token,path){
  const response=await supabaseRest(path,token);
  const text=await response.text();
  let payload=[];
  try{payload=text?JSON.parse(text):[]}catch{payload=[]}
  if(!response.ok){const error=new Error('OWNER_POLICY_LOOKUP_FAILED');error.status=response.status;throw error}
  return payload;
}

async function ownerContext(req,res,businessId){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const membership=(memberships||[]).find(m=>m.business_id===businessId&&m.status==='active');
  if(!membership||membership.role!=='owner'){json(res,403,{ok:false,error:'OWNER_REQUIRED'});return null}
  return {token,user,membership};
}

function safeBounds(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const text=JSON.stringify(value);
  return Buffer.byteLength(text,'utf8')<=4096?value:null;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const businessId=safeId(singleQueryValue(req,'business_id'));
      if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
      const ctx=await ownerContext(req,res,businessId);
      if(!ctx)return;
      const [candidates,policies,audit]=await Promise.all([
        rpc(ctx.token,'dabbir_owner_policy_candidates',{p_business_id:businessId},'POLICY_CANDIDATES_FAILED'),
        rest(ctx.token,`dabbir_owner_policy_versions?business_id=eq.${businessId}&select=id,action_key,version,state,risk_class,decision_key,decision_value,match_bounds,match_fingerprint,explicit_confirmation,confirmation_source,activated_at,paused_at,revoked_at,created_at&order=created_at.desc&limit=50`),
        rest(ctx.token,`dabbir_owner_policy_audit?business_id=eq.${businessId}&select=id,policy_id,event_type,action_key,policy_version,match_reason,safe_metadata,created_at&order=created_at.desc&limit=50`),
      ]);
      return json(res,200,{
        ok:true,
        business_id:businessId,
        candidates:Array.isArray(candidates)?candidates:[],
        policies:Array.isArray(policies)?policies:[],
        audit:Array.isArray(audit)?audit:[],
        safety:{
          low_risk_only:true,
          activation_requires_explicit_owner_confirmation:true,
          sensitive_actions_blocked:true,
          exact_scope_match_only:true,
          raw_handoff_reason_stored:false,
          observation_threshold:3,
        },
      });
    }

    if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const ctx=await ownerContext(req,res,businessId);
    if(!ctx)return;
    const action=clean(body.action,30).toLowerCase();

    if(action==='activate'){
      const actionKey=clean(body.action_key,120).toLowerCase();
      const decisionKey=clean(body.decision_key,120).toLowerCase();
      const decisionValue=clean(body.decision_value,200);
      const bounds=safeBounds(body.match_bounds);
      if(!ACTION_RE.test(actionKey)||!ACTION_RE.test(decisionKey)||!decisionValue||bounds===null){
        return json(res,400,{ok:false,error:'INVALID_POLICY_INPUT'});
      }
      if(SENSITIVE_RE.test(actionKey))return json(res,400,{ok:false,error:'SENSITIVE_ACTION_NOT_LEARNABLE'});
      const policyId=await rpc(ctx.token,'dabbir_activate_owner_policy',{
        p_business_id:businessId,
        p_action_key:actionKey,
        p_decision_key:decisionKey,
        p_decision_value:decisionValue,
        p_match_bounds:bounds,
        p_confirmation_source:'owner_ui_explicit',
      },'POLICY_ACTIVATION_FAILED');
      return json(res,200,{ok:true,action:'activate',policy_id:policyId,explicit_owner_confirmation:true});
    }

    if(['pause','resume','revoke'].includes(action)){
      const policyId=safeId(body.policy_id);
      if(!policyId)return json(res,400,{ok:false,error:'POLICY_REQUIRED'});
      const state=action==='pause'?'PAUSED':action==='resume'?'ACTIVE':'REVOKED';
      const result=await rpc(ctx.token,'dabbir_set_owner_policy_state',{
        p_business_id:businessId,
        p_policy_id:policyId,
        p_state:state,
      },'POLICY_STATE_UPDATE_FAILED');
      return json(res,200,{ok:true,action,state:result});
    }

    return json(res,400,{ok:false,error:'UNSUPPORTED_POLICY_ACTION'});
  }catch(error){
    const code=clean(error?.message||'OWNER_POLICY_FAILED',140);
    const forbidden=['OWNER_REQUIRED','SENSITIVE_ACTION_NOT_LEARNABLE','POLICY_MEMORY_LOW_RISK_ONLY'].includes(code);
    const conflict=['INSUFFICIENT_MATCHING_OBSERVATIONS','REVOKED_POLICY_IMMUTABLE','POLICY_CANNOT_RESUME','ANOTHER_ACTIVE_POLICY_EXISTS'].includes(code);
    const status=forbidden?403:conflict?409:Number(error?.status)===401?401:400;
    return json(res,status,{ok:false,error:code});
  }
}
