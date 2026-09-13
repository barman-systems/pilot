import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const cleanName=value=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').trim();

async function payload(response,fallback){
  const text=await response.text();let body=null;
  try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=new Error(body?.message||body?.code||fallback);error.status=response.status;throw error}
  return body;
}
async function identity(req){
  const token=accessTokenFromRequest(req);if(!token)return null;
  const [user,memberships]=await Promise.all([getVerifiedUser(token),getBusinessMemberships(token)]);
  return user?{token,user,memberships}:null;
}
function membershipFor(ctx,businessId){
  return (ctx?.memberships||[]).find(m=>String(m.business_id)===businessId&&m.status==='active'&&!m.suspended_at&&!m.removed_at)||null;
}
function canEdit(member){return ['owner','admin'].includes(String(member?.role||'').toLowerCase())}

export default async function handler(req,res){
  const ctx=await identity(req).catch(()=>null);
  if(!ctx)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  try{
    if(req.method==='GET'){
      const businessId=safeId(singleQueryValue(req,'business_id'));
      const customerId=safeId(singleQueryValue(req,'customer_id'));
      if(!businessId||!customerId)return json(res,400,{ok:false,error:'CUSTOMER_CONTEXT_REQUIRED'});
      const member=membershipFor(ctx,businessId);if(!member)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      const rows=await payload(await supabaseRest(
        `dabbir_customers?select=id,business_id,display_name,phone_e164,channel_handle,lead_status,whatsapp_display_name,display_name_source,owner_display_name_updated_at,created_at,updated_at&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(customerId)}&limit=1`,
        ctx.token,{cache:'no-store'}
      ),'CUSTOMER_PROFILE_READ_FAILED');
      const customer=Array.isArray(rows)?rows[0]:null;
      if(!customer)return json(res,404,{ok:false,error:'CUSTOMER_NOT_FOUND'});
      return json(res,200,{ok:true,customer,can_edit:canEdit(member)});
    }

    if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req);
    if(String(body?.action||'update_name')!=='update_name')return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
    const businessId=safeId(body?.business_id),customerId=safeId(body?.customer_id);
    if(!businessId||!customerId)return json(res,400,{ok:false,error:'CUSTOMER_CONTEXT_REQUIRED'});
    const member=membershipFor(ctx,businessId);
    if(!member||!canEdit(member))return json(res,403,{ok:false,error:'CUSTOMER_NAME_OWNER_REQUIRED'});
    const actorUserId=safeId(ctx.user?.id);
    if(!actorUserId)return json(res,401,{ok:false,error:'AUTH_ACTOR_INVALID'});
    const name=cleanName(body?.display_name);
    if(!name||name.length>120)return json(res,400,{ok:false,error:'CUSTOMER_NAME_INVALID'});
    const customer=await serviceRpc('dabbir_customer_update_display_name',{
      p_actor_user_id:actorUserId,p_business_id:businessId,p_customer_id:customerId,p_display_name:name,
    });
    if(!customer?.id||customer.id!==customerId||customer.business_id!==businessId||customer.display_name!==name){
      return json(res,502,{ok:false,error:'CUSTOMER_NAME_UPDATE_UNVERIFIED'});
    }
    return json(res,200,{ok:true,customer,truth:{state:'VERIFIED',source:'DATABASE_SERVICE_RPC_READBACK',entity:'customer',entity_id:customer.id,verified_at:new Date().toISOString()}});
  }catch(error){
    const status=[400,401,403,404,409].includes(Number(error?.status))?Number(error.status):500;
    return json(res,status,{ok:false,error:String(error?.message||'CUSTOMER_PROFILE_FAILED').slice(0,160)});
  }
}
