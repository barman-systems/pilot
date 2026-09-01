import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

function serviceKey(){return String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()}

async function readResponse(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=Number(response.status||500);
    error.detail=payload?.message||payload?.error||payload?.code||null;
    throw error;
  }
  return payload;
}

async function serviceRpc(key,name,params={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{
    method:'POST',cache:'no-store',
    headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(params),
  });
  return readResponse(response,'PLATFORM_ADMIN_RPC_FAILED');
}

function quietCapability(res,{authenticated=false,role=null,allowed=false,serviceConfigured=false,reason=null}={}){
  return json(res,200,{
    ok:true,
    allowed:Boolean(allowed),
    authenticated:Boolean(authenticated),
    role:allowed?role:null,
    service_configured:allowed?Boolean(serviceConfigured):false,
    reason:reason||null,
  });
}

async function platformCapability(req,res){
  const token=accessTokenFromRequest(req);
  if(!token)return quietCapability(res,{reason:'AUTH_REQUIRED'});

  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user?.id)return quietCapability(res,{reason:'AUTH_REQUIRED'});

  const response=await supabaseRest(`dabbir_platform_admins?select=role,active&user_id=eq.${user.id}&active=eq.true&limit=1`,token).catch(()=>null);
  if(!response?.ok)return quietCapability(res,{authenticated:true,reason:'PLATFORM_ADMIN_REQUIRED'});

  const rows=await response.json().catch(()=>[]);
  const admin=Array.isArray(rows)?rows[0]:null;
  if(!admin?.active)return quietCapability(res,{authenticated:true,reason:'PLATFORM_ADMIN_REQUIRED'});

  const serviceConfigured=Boolean(serviceKey());
  return quietCapability(res,{
    authenticated:true,
    role:admin.role,
    allowed:serviceConfigured,
    serviceConfigured,
    reason:serviceConfigured?null:'SERVER_ADMIN_NOT_CONFIGURED',
  });
}

async function adminContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user?.id){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const response=await supabaseRest(`dabbir_platform_admins?select=role,active&user_id=eq.${user.id}&active=eq.true&limit=1`,token).catch(()=>null);
  if(!response?.ok){json(res,response?.status===401?401:403,{ok:false,error:'PLATFORM_ADMIN_REQUIRED'});return null}
  const rows=await response.json().catch(()=>[]);
  const admin=Array.isArray(rows)?rows[0]:null;
  if(!admin?.active){json(res,403,{ok:false,error:'PLATFORM_ADMIN_REQUIRED'});return null}
  return {user,role:admin.role,key:serviceKey()};
}

function adminServiceUnavailable(res){
  return json(res,503,{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'});
}

function rpcError(error){
  const raw=String(error?.detail||error?.message||'').toUpperCase();
  if(raw.includes('DABBIR_RECOVERY_CONFIRMATION_REQUIRED'))return [409,'RECOVERY_CONFIRMATION_REQUIRED'];
  if(raw.includes('DABBIR_RECOVERY_ACCOUNT_MUST_BE_SUSPENDED'))return [409,'RECOVERY_ACCOUNT_MUST_BE_SUSPENDED'];
  if(raw.includes('DABBIR_RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED'))return [409,'RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED'];
  if(raw.includes('DABBIR_RECOVERY_TARGET_BEFORE_JOURNAL_START'))return [409,'RECOVERY_TARGET_BEFORE_JOURNAL_START'];
  if(raw.includes('DABBIR_RECOVERY_TARGET_IN_FUTURE'))return [400,'RECOVERY_TARGET_IN_FUTURE'];
  if(raw.includes('DABBIR_CUSTOMER_BUSINESS_MISMATCH'))return [409,'CUSTOMER_BUSINESS_MISMATCH'];
  if(raw.includes('DABBIR_RECOVERY_CASE_NOT_FOUND'))return [404,'RECOVERY_CASE_NOT_FOUND'];
  if(raw.includes('DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'))return [404,'CUSTOMER_ACCOUNT_NOT_FOUND'];
  if(raw.includes('DABBIR_PLATFORM_ADMIN_IMMUTABLE'))return [409,'PLATFORM_ADMIN_IMMUTABLE'];
  if(raw.includes('DABBIR_SUSPENSION_REASON_REQUIRED'))return [400,'SUSPENSION_REASON_REQUIRED'];
  if(raw.includes('DABBIR_INVALID_ACCOUNT_ACCESS_STATUS'))return [400,'INVALID_ACCOUNT_ACCESS_STATUS'];
  return [Number(error?.status||500)>=500?503:Number(error?.status||500),'PLATFORM_CUSTOMER_ADMIN_FAILED'];
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});

  const action=req.method==='GET'?String(singleQueryValue(req,'action')||'capability').trim():null;
  if(req.method==='GET'&&action==='capability')return platformCapability(req,res);

  const context=await adminContext(req,res);
  if(!context)return;

  try{
    if(req.method==='GET'){
      if(!context.key)return adminServiceUnavailable(res);
      if(action==='overview'){
        const payload=await serviceRpc(context.key,'dabbir_platform_owner_overview',{p_actor_user_id:context.user.id});
        return json(res,200,{ok:true,overview:payload});
      }
      if(action==='search'){
        const q=String(singleQueryValue(req,'q')||'').trim().slice(0,160);
        const payload=await serviceRpc(context.key,'dabbir_platform_customer_search',{p_actor_user_id:context.user.id,p_query:q||null,p_limit:100});
        return json(res,200,{ok:true,...payload});
      }
      if(action==='detail'){
        const targetUserId=uuid(singleQueryValue(req,'user_id'));
        if(!targetUserId)return json(res,400,{ok:false,error:'INVALID_USER_ID'});
        const payload=await serviceRpc(context.key,'dabbir_platform_customer_detail',{p_actor_user_id:context.user.id,p_target_user_id:targetUserId});
        return json(res,200,{ok:true,customer:payload});
      }
      if(action==='recovery_preview'){
        const targetUserId=uuid(singleQueryValue(req,'user_id'));
        const businessId=uuid(singleQueryValue(req,'business_id'));
        const targetAt=String(singleQueryValue(req,'target_at')||'').trim();
        if(!targetUserId||!businessId||!targetAt||!Number.isFinite(Date.parse(targetAt)))return json(res,400,{ok:false,error:'INVALID_RECOVERY_TARGET'});
        const payload=await serviceRpc(context.key,'dabbir_platform_recovery_preview',{p_actor_user_id:context.user.id,p_target_user_id:targetUserId,p_business_id:businessId,p_target_at:new Date(targetAt).toISOString()});
        return json(res,200,{ok:true,preview:payload});
      }
      return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
    }

    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    if(!context.key)return adminServiceUnavailable(res);
    const body=await readJsonBody(req,16384);

    if(body.action==='set_access'){
      const targetUserId=uuid(body.user_id);
      const status=String(body.status||'').trim().toLowerCase();
      const reason=String(body.reason||'').trim().slice(0,500);
      if(!targetUserId||!['active','suspended'].includes(status))return json(res,400,{ok:false,error:'INVALID_ACCOUNT_ACCESS'});
      if(status==='suspended'&&reason.length<3)return json(res,400,{ok:false,error:'SUSPENSION_REASON_REQUIRED'});
      const result=await serviceRpc(context.key,'dabbir_platform_set_account_access',{
        p_actor_user_id:context.user.id,
        p_target_user_id:targetUserId,
        p_status:status,
        p_reason:reason||null,
      });
      return json(res,200,{ok:true,access:result});
    }

    if(body.action==='open_recovery'){
      const targetUserId=uuid(body.user_id),businessId=uuid(body.business_id);
      const targetAt=String(body.target_at||'').trim();
      if(!targetUserId||!businessId||!targetAt||!Number.isFinite(Date.parse(targetAt)))return json(res,400,{ok:false,error:'INVALID_RECOVERY_TARGET'});
      const caseId=await serviceRpc(context.key,'dabbir_platform_recovery_open',{p_actor_user_id:context.user.id,p_target_user_id:targetUserId,p_business_id:businessId,p_target_at:new Date(targetAt).toISOString(),p_reason:String(body.reason||'platform owner support recovery').slice(0,500)});
      return json(res,200,{ok:true,case_id:caseId});
    }
    if(body.action==='apply_recovery'){
      const targetUserId=uuid(body.user_id),caseId=uuid(body.case_id);
      if(!targetUserId||!caseId)return json(res,400,{ok:false,error:'INVALID_RECOVERY_CASE'});
      const result=await serviceRpc(context.key,'dabbir_platform_recovery_apply',{p_actor_user_id:context.user.id,p_target_user_id:targetUserId,p_case_id:caseId,p_confirmation:String(body.confirmation||'').trim().slice(0,80)});
      return json(res,200,{ok:true,result});
    }
    return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
  }catch(error){
    const [status,code]=rpcError(error);
    return json(res,status,{ok:false,error:code,detail:error?.detail||null});
  }
}