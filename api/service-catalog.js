import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

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
function membershipFor(ctx,businessId){return ctx?.memberships?.find(row=>row.business_id===businessId)||null}
function canManage(membership){return ['owner','admin'].includes(String(membership?.role||'').toLowerCase())}
function normalized(row){return {...row,price_aed:Number(Number(row?.price_aed||0).toFixed(2)),duration_minutes:Math.max(1,Math.trunc(Number(row?.duration_minutes||30)))} }
function status(error){const code=Number(error?.status||500);return [400,401,403,404,409,429,502,503].includes(code)?code:500}

export default async function handler(req,res){
  const ctx=await context(req);
  if(!ctx)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  try{
    if(req.method==='GET'){
      const businessId=safeId(req.query?.business_id);
      const membership=membershipFor(ctx,businessId);
      if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      const services=await rest(ctx.token,`dabbir_services?select=id,name,price_aed,duration_minutes,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,{},'SERVICES_LOOKUP_FAILED');
      return json(res,200,{ok:true,business_id:businessId,can_manage:canManage(membership),services:(services||[]).map(normalized)});
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);
      const businessId=safeId(body.business_id),membership=membershipFor(ctx,businessId);
      if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      if(!canManage(membership))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
      const action=clean(body.action,40),name=clean(body.name,160),duration=Math.trunc(finite(body.duration_minutes)),price=finite(body.price_aed);
      if(!name||!Number.isFinite(duration)||duration<1||duration>1440||price===null||price<0||price>10000000)return json(res,400,{ok:false,error:'INVALID_SERVICE_INPUT'});
      if(action==='create_service'){
        const rows=await rest(ctx.token,'dabbir_services?select=id,name,price_aed,duration_minutes,active,metadata',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,name,price_aed:Number(price.toFixed(2)),duration_minutes:duration,active:true})},'SERVICE_CREATE_FAILED');
        const service=rows?.[0];if(!service?.id)throw Object.assign(new Error('SERVICE_CREATE_UNVERIFIED'),{status:502});
        return json(res,200,{ok:true,service:normalized(service)});
      }
      if(action==='update_service'){
        const serviceId=safeId(body.service_id);if(!serviceId)return json(res,400,{ok:false,error:'SERVICE_ID_REQUIRED'});
        const active=body.active!==false;
        const rows=await rest(ctx.token,`dabbir_services?id=eq.${serviceId}&business_id=eq.${businessId}&select=id,name,price_aed,duration_minutes,active,metadata`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({name,price_aed:Number(price.toFixed(2)),duration_minutes:duration,active})},'SERVICE_UPDATE_FAILED');
        const service=rows?.[0];if(!service?.id)throw Object.assign(new Error('SERVICE_NOT_FOUND_OR_UNVERIFIED'),{status:404});
        return json(res,200,{ok:true,service:normalized(service)});
      }
      return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    console.error('dabbir_service_catalog_failed',{error:String(error?.message||'SERVICE_CATALOG_FAILED').slice(0,140),status:status(error)});
    return json(res,status(error),{ok:false,error:String(error?.message||'SERVICE_CATALOG_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
