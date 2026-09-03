import {accessTokenFromRequest,getBusinessMemberships,getVerifiedUser,json,readJsonBody,requireSameOrigin,supabaseRest} from './_auth-core.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
async function data(r,msg){const t=await r.text();let p;try{p=t?JSON.parse(t):null}catch{}if(!r.ok)throw Object.assign(new Error(p?.message||msg),{status:r.status});return p}
const rest=(token,path,opt={},msg='REQUEST_FAILED')=>supabaseRest(path,token,opt).then(r=>data(r,msg));
function e164(value,prefix){
 const raw=clean(value,40);if(!raw)return null;
 let compact=raw.replace(/[\s().-]/g,'');
 if(compact.startsWith('00'))compact='+'+compact.slice(2);
 if(/^\+[1-9]\d{7,14}$/.test(compact))return compact;
 const digits=compact.replace(/\D/g,'').replace(/^0+/, '');
 const country=String(prefix||'').replace(/\D/g,'');
 const normalized=country&&digits?`+${country}${digits}`:null;
 return normalized&&/^\+[1-9]\d{7,14}$/.test(normalized)?normalized:null;
}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!requireSameOrigin(req,res))return;
 try{
  const token=accessTokenFromRequest(req);if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  const [user,memberships,body]=await Promise.all([getVerifiedUser(token),getBusinessMemberships(token),readJsonBody(req)]);if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  const businessId=clean(body.business_id,60);if(!UUID.test(businessId)||!memberships.some(m=>m.business_id===businessId&&m.status==='active'))return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const b=await rest(token,`dabbir_businesses?select=id,business_type,country_code,currency_code,timezone,phone_country_prefix&id=eq.${encodeURIComponent(businessId)}&limit=1`);const business=b?.[0];if(!business)return json(res,404,{ok:false,error:'BUSINESS_NOT_FOUND'});
  const name=clean(body.customer_name,120);const start=new Date(body.starts_at);if(!name||Number.isNaN(start.getTime()))return json(res,400,{ok:false,error:'APPOINTMENT_INPUT_REQUIRED'});
  const d=body.details&&typeof body.details==='object'?body.details:{};const rawPhone=clean(d.phone,40)||null;const metadata={source:'dabbir_adaptive_appointment',phone:rawPhone,phone_e164:e164(rawPhone,business.phone_country_prefix)};
  const requestedCustomerId=clean(d.customer_id,60);let customer=null;
  if(requestedCustomerId){
   if(!UUID.test(requestedCustomerId))return json(res,400,{ok:false,error:'CUSTOMER_ID_INVALID'});
   const existing=await rest(token,`dabbir_customers?select=id,display_name,metadata&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(requestedCustomerId)}&limit=1`,{},'CUSTOMER_LOOKUP_FAILED');
   customer=existing?.[0]||null;if(!customer)return json(res,404,{ok:false,error:'CUSTOMER_NOT_FOUND'});
  }else{
   const customers=await rest(token,'dabbir_customers?select=id,display_name,metadata',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,display_name:name,lead_status:'new',metadata})},'CUSTOMER_CREATE_FAILED');customer=customers?.[0]||null;
   if(!customer)return json(res,502,{ok:false,error:'CUSTOMER_CREATE_UNVERIFIED'});
  }
  const duration=Math.max(5,Math.min(1440,Number(d.duration)||60));const notes=[d.service&&`service: ${clean(d.service)}`,d.specialist&&`specialist: ${clean(d.specialist)}`,d.vehicle&&`vehicle: ${clean(d.vehicle)}`,d.location&&`location: ${clean(d.location)}`,d.notes&&`notes: ${clean(d.notes,1000)}`].filter(Boolean).join('\n');
  const row={business_id:businessId,customer_id:customer.id,starts_at:start.toISOString(),status:['requested','confirmed','cancelled'].includes(d.status)?d.status:'requested',simulated:false,notes:notes||null,ends_at:new Date(start.getTime()+duration*60000).toISOString()};if(d.price!==''&&Number.isFinite(Number(d.price)))row.quoted_price_aed=Math.max(0,Number(d.price));
  const appointments=await rest(token,'dabbir_appointments?select=id,customer_id,starts_at,ends_at,status,quoted_price_aed,notes',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(row)},'APPOINTMENT_CREATE_FAILED');const appointment=appointments?.[0];if(!appointment)return json(res,502,{ok:false,error:'APPOINTMENT_CREATE_UNVERIFIED'});
  return json(res,200,{ok:true,appointment,business_type:business.business_type,country_code:business.country_code,currency_code:business.currency_code,timezone:business.timezone,customer_reused:Boolean(requestedCustomerId)});
 }catch(e){return json(res,e.status||500,{ok:false,error:clean(e.message,160)||'APPOINTMENT_CREATE_FAILED'})}
}
