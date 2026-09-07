import {
  accessTokenFromRequest,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
} from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceKey(){return String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()}
function uuid(value){const v=String(value||'').trim();return UUID_RE.test(v)?v:null}
function compact(value,max=120){return String(value||'').trim().replace(/[\r\n\t]+/g,' ').slice(0,max)}

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
    headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json'}),
    body:JSON.stringify(params),
  });
  return readResponse(response,'CUSTOMER_SUPPORT_RPC_FAILED');
}

function contacts(){
  const email=String(process.env.DABBIR_SUPPORT_EMAIL||'').trim().slice(0,254);
  const rawWhatsapp=String(process.env.DABBIR_SUPPORT_WHATSAPP||'').trim();
  const digits=rawWhatsapp.replace(/\D/g,'').slice(0,20);
  return {
    email:email||null,
    whatsapp:digits||null,
    whatsapp_url:digits?`https://wa.me/${digits}`:null,
  };
}

function rpcError(error){
  const raw=String(error?.detail||error?.message||'').toUpperCase();
  if(raw.includes('DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'))return [404,'CUSTOMER_ACCOUNT_NOT_FOUND'];
  if(raw.includes('DABBIR_CUSTOMER_BUSINESS_MISMATCH'))return [403,'BUSINESS_ACCESS_DENIED'];
  if(raw.includes('DABBIR_SUPPORT_CASE_NOT_FOUND'))return [404,'SUPPORT_CASE_NOT_FOUND'];
  if(raw.includes('DABBIR_SUPPORT_INVALID_CATEGORY'))return [400,'INVALID_SUPPORT_CATEGORY'];
  if(raw.includes('DABBIR_SUPPORT_INVALID_PRIORITY'))return [400,'INVALID_SUPPORT_PRIORITY'];
  if(raw.includes('DABBIR_SUPPORT_SUBJECT_REQUIRED'))return [400,'SUPPORT_SUBJECT_REQUIRED'];
  if(raw.includes('DABBIR_SUPPORT_NOTE_INVALID'))return [400,'SUPPORT_MESSAGE_INVALID'];
  if(raw.includes('DABBIR_SUPPORT_CONTEXT_INVALID'))return [400,'SUPPORT_CONTEXT_INVALID'];
  return [Number(error?.status||500)>=500?503:Number(error?.status||500),'CUSTOMER_SUPPORT_FAILED'];
}

async function userContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user?.id){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const key=serviceKey();
  if(!key||!SUPABASE_URL){json(res,503,{ok:false,error:'SUPPORT_NOT_CONFIGURED'});return null}
  return {user,key};
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const context=await userContext(req,res);
  if(!context)return;

  try{
    if(req.method==='GET'){
      const rawBusiness=singleQueryValue(req,'business_id');
      const businessId=rawBusiness?uuid(rawBusiness):null;
      if(rawBusiness&&!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
      const support=await serviceRpc(context.key,'dabbir_customer_support_summary',{
        p_actor_user_id:context.user.id,
        p_business_id:businessId,
      });
      return json(res,200,{ok:true,support,contacts:contacts()});
    }

    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req,16384);

    if(body.action==='create'){
      const businessId=body.business_id?uuid(body.business_id):null;
      if(body.business_id&&!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
      const input=body.context&&typeof body.context==='object'&&!Array.isArray(body.context)?body.context:{};
      const safeContext={
        app:'dabbir-web',
        screen:compact(input.screen,80)||null,
        pathname:compact(input.pathname,160)||null,
        integration:compact(input.integration,80)||null,
        submitted_at:new Date().toISOString(),
      };
      const ticket=await serviceRpc(context.key,'dabbir_customer_support_create',{
        p_actor_user_id:context.user.id,
        p_business_id:businessId,
        p_category:compact(body.category,40)||'general',
        p_priority:compact(body.priority,20)||'normal',
        p_subject:String(body.subject||'').trim().slice(0,200),
        p_message:String(body.message||'').trim().slice(0,4000),
        p_context:safeContext,
      });
      return json(res,201,{ok:true,ticket});
    }

    if(body.action==='reply'){
      const caseId=uuid(body.case_id);
      if(!caseId)return json(res,400,{ok:false,error:'INVALID_SUPPORT_CASE'});
      const ticket=await serviceRpc(context.key,'dabbir_customer_support_reply',{
        p_actor_user_id:context.user.id,
        p_case_id:caseId,
        p_message:String(body.message||'').trim().slice(0,4000),
      });
      return json(res,200,{ok:true,ticket});
    }

    return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
  }catch(error){
    const [status,code]=rpcError(error);
    return json(res,status,{ok:false,error:code});
  }
}
