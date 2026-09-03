import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { exposeMoney, loadBusinessMoneyProfile, normalizeMoneyInput, requestedMoney } from './_money-runtime.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const finite=value=>Number.isFinite(Number(value))?Number(value):null;

async function readData(response,fallback){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}
  return payload;
}
const rest=(token,path,options={},fallback='SERVICE_CATALOG_FAILED')=>supabaseRest(path,token,options).then(r=>readData(r,fallback));

async function context(req){
  const token=accessTokenFromRequest(req);if(!token)return null;
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user)return null;
  return {token,user,memberships};
}
function membershipFor(ctx,businessId){return ctx?.memberships?.find(row=>row.business_id===businessId&&row.status==='active')||null}
function canManage(membership){
  if(!membership)return false;
  const role=String(membership.role||'').toLowerCase();
  if(role==='owner')return true;
  const permissions=Array.isArray(membership.permissions)?membership.permissions:[];
  if(permissions.length)return permissions.includes('manage_services')||permissions.includes('manage_business');
  return role==='admin';
}
function normalized(row,moneyProfile){
  return {
    ...exposeMoney(row,moneyProfile,{amountKey:'price_amount',legacyKey:'price_aed'}),
    duration_minutes:Math.max(1,Math.trunc(Number(row?.duration_minutes||30))),
  };
}
function isDeleted(row){return Boolean(row?.metadata&&typeof row.metadata==='object'&&row.metadata.deleted_at)}
function status(error){const code=Number(error?.status||500);return [400,401,403,404,409,429,502,503].includes(code)?code:500}

export default async function handler(req,res){
  const ctx=await context(req);
  if(!ctx)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  try{
    if(req.method==='GET'){
      const businessId=safeId(singleQueryValue(req,'business_id'));
      const membership=membershipFor(ctx,businessId);
      if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      const [services,moneyProfile]=await Promise.all([
        rest(ctx.token,`dabbir_services?select=id,name,price_amount,price_aed,duration_minutes,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,{},'SERVICES_LOOKUP_FAILED'),
        loadBusinessMoneyProfile(ctx.token,businessId),
      ]);
      return json(res,200,{
        ok:true,
        business_id:businessId,
        currency_code:moneyProfile.currency_code,
        currency_minor_units:moneyProfile.currency_minor_units,
        can_manage:canManage(membership),
        services:(services||[]).filter(row=>!isDeleted(row)).map(row=>normalized(row,moneyProfile)),
      });
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);
      const businessId=safeId(body.business_id),membership=membershipFor(ctx,businessId);
      if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      if(!canManage(membership))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
      const action=clean(body.action,40);

      if(action==='delete_service'){
        const serviceId=safeId(body.service_id);if(!serviceId)return json(res,400,{ok:false,error:'SERVICE_ID_REQUIRED'});
        const currentRows=await rest(ctx.token,`dabbir_services?id=eq.${serviceId}&business_id=eq.${businessId}&select=id,name,active,metadata&limit=1`,{},'SERVICE_LOOKUP_FAILED');
        const current=currentRows?.[0];
        if(!current?.id||isDeleted(current))return json(res,404,{ok:false,error:'SERVICE_NOT_FOUND'});
        const metadata=current.metadata&&typeof current.metadata==='object'&&!Array.isArray(current.metadata)?current.metadata:{};
        const rows=await rest(ctx.token,`dabbir_services?id=eq.${serviceId}&business_id=eq.${businessId}&select=id,name,active,metadata`,{
          method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({active:false,metadata:{...metadata,deleted_at:new Date().toISOString(),deleted_by:ctx.user.id,delete_mode:'owner_soft_delete'}})
        },'SERVICE_DELETE_FAILED');
        const service=rows?.[0];if(!service?.id)throw Object.assign(new Error('SERVICE_DELETE_UNVERIFIED'),{status:502});
        return json(res,200,{ok:true,deleted:true,service_id:service.id,preserved_history:true});
      }

      const moneyProfile=await loadBusinessMoneyProfile(ctx.token,businessId);
      const name=clean(body.name,160),duration=Math.trunc(finite(body.duration_minutes));
      const price=normalizeMoneyInput(requestedMoney(body,'price_amount','price_aed'),moneyProfile);
      if(!name||!Number.isFinite(duration)||duration<1||duration>1440||price===null)return json(res,400,{ok:false,error:'INVALID_SERVICE_INPUT'});
      if(action==='create_service'){
        const rows=await rest(ctx.token,'dabbir_services?select=id,name,price_amount,price_aed,duration_minutes,active,metadata',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,name,price_aed:price,duration_minutes:duration,active:true,metadata:{source:'owner_service_catalog'}})},'SERVICE_CREATE_FAILED');
        const service=rows?.[0];if(!service?.id)throw Object.assign(new Error('SERVICE_CREATE_UNVERIFIED'),{status:502});
        return json(res,200,{ok:true,currency_code:moneyProfile.currency_code,currency_minor_units:moneyProfile.currency_minor_units,service:normalized(service,moneyProfile)});
      }
      if(action==='update_service'){
        const serviceId=safeId(body.service_id);if(!serviceId)return json(res,400,{ok:false,error:'SERVICE_ID_REQUIRED'});
        const active=body.active!==false;
        const currentRows=await rest(ctx.token,`dabbir_services?id=eq.${serviceId}&business_id=eq.${businessId}&select=id,metadata&limit=1`,{},'SERVICE_LOOKUP_FAILED');
        const current=currentRows?.[0];
        if(!current?.id||isDeleted(current))return json(res,404,{ok:false,error:'SERVICE_NOT_FOUND'});
        const metadata=current.metadata&&typeof current.metadata==='object'&&!Array.isArray(current.metadata)?current.metadata:{};
        const rows=await rest(ctx.token,`dabbir_services?id=eq.${serviceId}&business_id=eq.${businessId}&select=id,name,price_amount,price_aed,duration_minutes,active,metadata`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({name,price_aed:price,duration_minutes:duration,active,metadata:{...metadata,updated_by:ctx.user.id,updated_at:new Date().toISOString()}})},'SERVICE_UPDATE_FAILED');
        const service=rows?.[0];if(!service?.id)throw Object.assign(new Error('SERVICE_NOT_FOUND_OR_UNVERIFIED'),{status:404});
        return json(res,200,{ok:true,currency_code:moneyProfile.currency_code,currency_minor_units:moneyProfile.currency_minor_units,service:normalized(service,moneyProfile)});
      }
      return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    console.error('dabbir_service_catalog_failed',{error:String(error?.message||'SERVICE_CATALOG_FAILED').slice(0,140),status:status(error)});
    return json(res,status(error),{ok:false,error:String(error?.message||'SERVICE_CATALOG_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
