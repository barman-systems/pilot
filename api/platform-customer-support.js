import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL='https://spohjzrsymsmzsseygtw.supabase.co';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_RE=/^DAB-[0-9]{6,}$/i;

function serviceKey(){ return String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim(); }
function customerNo(value){ const v=String(value||'').trim().toUpperCase(); return CUSTOMER_RE.test(v)?v:null; }
function uuid(value){ const v=String(value||'').trim(); return UUID_RE.test(v)?v:null; }

async function readResponse(response,fallback){
  const text=await response.text();
  let payload=null;
  try{ payload=text?JSON.parse(text):null; }catch{ payload=null; }
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
  return readResponse(response,'PLATFORM_SUPPORT_RPC_FAILED');
}

async function adminContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){ json(res,401,{ok:false,error:'AUTH_REQUIRED'}); return null; }
  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user?.id){ json(res,401,{ok:false,error:'AUTH_REQUIRED'}); return null; }
  const response=await supabaseRest(`dabbir_platform_admins?select=role,active&user_id=eq.${user.id}&active=eq.true&limit=1`,token).catch(()=>null);
  if(!response?.ok){ json(res,response?.status===401?401:403,{ok:false,error:'PLATFORM_ADMIN_REQUIRED'}); return null; }
  const rows=await response.json().catch(()=>[]);
  const admin=Array.isArray(rows)?rows[0]:null;
  if(!admin?.active){ json(res,403,{ok:false,error:'PLATFORM_ADMIN_REQUIRED'}); return null; }
  const key=serviceKey();
  if(!key){ json(res,503,{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'}); return null; }
  return {user,key,role:admin.role};
}

function rpcError(error){
  const raw=String(error?.detail||error?.message||'').toUpperCase();
  if(raw.includes('DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'))return [404,'CUSTOMER_ACCOUNT_NOT_FOUND'];
  if(raw.includes('DABBIR_CUSTOMER_BUSINESS_MISMATCH'))return [409,'CUSTOMER_BUSINESS_MISMATCH'];
  if(raw.includes('DABBIR_RECOVERY_PREVIEW_REQUIRED'))return [409,'RECOVERY_PREVIEW_REQUIRED'];
  if(raw.includes('DABBIR_RECOVERY_RECONCILIATION_NOT_REQUIRED'))return [409,'RECOVERY_RECONCILIATION_NOT_REQUIRED'];
  if(raw.includes('DABBIR_RECOVERY_TARGET_BEFORE_JOURNAL_START'))return [409,'RECOVERY_TARGET_BEFORE_JOURNAL_START'];
  if(raw.includes('DABBIR_RECOVERY_TARGET_IN_FUTURE'))return [400,'RECOVERY_TARGET_IN_FUTURE'];
  if(raw.includes('DABBIR_SUPPORT_CASE_NOT_FOUND'))return [404,'SUPPORT_CASE_NOT_FOUND'];
  if(raw.includes('DABBIR_SUPPORT_INVALID_CATEGORY'))return [400,'INVALID_SUPPORT_CATEGORY'];
  if(raw.includes('DABBIR_SUPPORT_INVALID_PRIORITY'))return [400,'INVALID_SUPPORT_PRIORITY'];
  if(raw.includes('DABBIR_SUPPORT_INVALID_STATUS'))return [400,'INVALID_SUPPORT_STATUS'];
  if(raw.includes('DABBIR_SUPPORT_SUBJECT_REQUIRED'))return [400,'SUPPORT_SUBJECT_REQUIRED'];
  if(raw.includes('DABBIR_SUPPORT_NOTE_INVALID'))return [400,'SUPPORT_NOTE_INVALID'];
  return [Number(error?.status||500)>=500?503:Number(error?.status||500),'PLATFORM_SUPPORT_FAILED'];
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const context=await adminContext(req,res);
  if(!context)return;
  try{
    if(req.method==='GET'){
      const no=customerNo(singleQueryValue(req,'customer_no'));
      if(!no)return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
      const summary=await serviceRpc(context.key,'dabbir_platform_support_summary',{p_actor_user_id:context.user.id,p_customer_no:no});
      return json(res,200,{ok:true,support:summary});
    }

    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req,16384);
    const no=customerNo(body.customer_no);
    if(!no)return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});

    if(body.action==='ensure_recovery_reconciliation'){
      const businessId=uuid(body.business_id);
      if(!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
      const result=await serviceRpc(context.key,'dabbir_platform_support_ensure_latest_recovery_reconciliation',{
        p_actor_user_id:context.user.id,
        p_customer_no:no,
        p_business_id:businessId,
      });
      return json(res,result?.created?201:200,{ok:true,reconciliation:result});
    }

    if(body.action==='create_case'){
      const businessId=body.business_id?uuid(body.business_id):null;
      if(body.business_id&&!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
      const caseId=await serviceRpc(context.key,'dabbir_platform_support_create',{
        p_actor_user_id:context.user.id,
        p_customer_no:no,
        p_business_id:businessId,
        p_category:String(body.category||'general').trim().slice(0,40),
        p_priority:String(body.priority||'normal').trim().slice(0,20),
        p_subject:String(body.subject||'').trim().slice(0,200),
        p_initial_note:String(body.note||'').trim().slice(0,4000)||null,
      });
      return json(res,201,{ok:true,case_id:caseId});
    }

    if(body.action==='add_note'){
      const caseId=uuid(body.case_id);
      if(!caseId)return json(res,400,{ok:false,error:'INVALID_SUPPORT_CASE'});
      const noteId=await serviceRpc(context.key,'dabbir_platform_support_add_note',{
        p_actor_user_id:context.user.id,p_customer_no:no,p_case_id:caseId,p_note:String(body.note||'').trim().slice(0,4000),
      });
      return json(res,201,{ok:true,note_id:noteId});
    }

    if(body.action==='set_status'){
      const caseId=uuid(body.case_id);
      if(!caseId)return json(res,400,{ok:false,error:'INVALID_SUPPORT_CASE'});
      const result=await serviceRpc(context.key,'dabbir_platform_support_set_status',{
        p_actor_user_id:context.user.id,p_customer_no:no,p_case_id:caseId,p_status:String(body.status||'').trim().slice(0,20),
      });
      return json(res,200,{ok:true,case:result});
    }

    return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
  }catch(error){
    const [status,code]=rpcError(error);
    return json(res,status,{ok:false,error:code,detail:error?.detail||null});
  }
}
