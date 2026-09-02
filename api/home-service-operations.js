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
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const enc=value=>encodeURIComponent(String(value));

function singleQueryValue(req,name){
  try{
    const url=new URL(String(req?.url||'/'),'https://dabbir.invalid');
    const values=url.searchParams.getAll(name);
    return values.length===1?values[0]:null;
  }catch{return null}
}

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||payload?.hint||null;
    throw error;
  }
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));
const write=(token,path,options,fallback)=>supabaseRest(path,token,options).then(r=>readData(r,fallback));

async function authenticatedContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}

function membershipFor(memberships,businessId){
  return businessId?memberships.find(m=>m.business_id===businessId)||null:memberships[0]||null;
}

function hasPermission(membership,permission){
  if(!membership)return false;
  const role=String(membership.role||'').toLowerCase();
  const explicit=Array.isArray(membership.permissions)?membership.permissions:[];
  if(explicit.length)return explicit.includes(permission);
  if(permission==='manage_business')return ['owner','admin'].includes(role);
  if(permission==='manage_appointments')return ['owner','admin','manager','employee','staff'].includes(role);
  return ['owner','admin','manager','employee','staff'].includes(role);
}

function normalizedSettings(row){
  return {
    enabled:row?.enabled===true,
    default_visit_fee_aed:Number(number(row?.default_visit_fee_aed).toFixed(2)),
    default_travel_minutes:Math.max(0,Math.trunc(number(row?.default_travel_minutes))),
    require_customer_address:row?.require_customer_address!==false,
  };
}

async function handleGet(req,res,ctx){
  const requested=safeId(singleQueryValue(req,'business_id'));
  const membership=membershipFor(ctx.memberships,requested);
  if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const businessId=membership.business_id;
  const now=new Date();
  const until=new Date(now.getTime()+14*24*60*60*1000);

  const [businessRows,settingsRows,appointments,customers,workers]=await Promise.all([
    rest(ctx.token,`dabbir_businesses?select=id,name,business_type&id=eq.${enc(businessId)}&limit=1`,'BUSINESS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_home_service_settings?select=business_id,enabled,default_visit_fee_aed,default_travel_minutes,require_customer_address,updated_at&business_id=eq.${enc(businessId)}&limit=1`,'HOME_SERVICE_SETTINGS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_appointments?select=id,customer_id,worker_id,starts_at,ends_at,status,payment_status,quoted_price_aed,location_type,service_address,service_latitude,service_longitude,travel_minutes,visit_fee_aed,field_status,location_updated_at&business_id=eq.${enc(businessId)}&starts_at=gte.${enc(now.toISOString())}&starts_at=lte.${enc(until.toISOString())}&status=not.in.(completed,cancelled,no_show)&order=starts_at.asc&limit=100`,'HOME_SERVICE_APPOINTMENTS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_customers?select=id,display_name,phone_e164&business_id=eq.${enc(businessId)}&limit=300`,'CUSTOMERS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_workers?select=id,display_name,status&business_id=eq.${enc(businessId)}&status=eq.active&order=display_name.asc&limit=200`,'WORKERS_LOOKUP_FAILED'),
  ]);

  const business=businessRows?.[0]||null;
  if(!business)return json(res,404,{ok:false,error:'BUSINESS_NOT_FOUND'});
  const customerById=new Map((customers||[]).map(row=>[row.id,row]));
  const workerById=new Map((workers||[]).map(row=>[row.id,row]));
  const rows=(appointments||[]).map(row=>({
    ...row,
    quoted_price_aed:Number(number(row.quoted_price_aed).toFixed(2)),
    visit_fee_aed:Number(number(row.visit_fee_aed).toFixed(2)),
    travel_minutes:Math.max(0,Math.trunc(number(row.travel_minutes))),
    customer:customerById.get(row.customer_id)||null,
    worker:workerById.get(row.worker_id)||null,
  }));

  return json(res,200,{
    ok:true,
    business,
    role:membership.role,
    can_manage:hasPermission(membership,'manage_business'),
    can_update_visits:hasPermission(membership,'manage_appointments'),
    settings:normalizedSettings(settingsRows?.[0]),
    appointments:rows,
    metrics:{
      upcoming_14d:rows.length,
      customer_location:rows.filter(row=>row.location_type==='customer').length,
      in_route:rows.filter(row=>row.field_status==='in_route').length,
      needs_address:rows.filter(row=>row.location_type==='customer'&&!clean(row.service_address)).length,
    },
  });
}

async function handlePost(req,res,ctx){
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=await readJsonBody(req);
  const businessId=safeId(body.business_id);
  const membership=membershipFor(ctx.memberships,businessId);
  if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const action=clean(body.action,40).toLowerCase();

  if(action==='save_settings'){
    if(!hasPermission(membership,'manage_business'))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
    const fee=number(body.default_visit_fee_aed,-1);
    const travel=Math.trunc(number(body.default_travel_minutes,-1));
    if(fee<0||fee>10000000||travel<0||travel>720)return json(res,400,{ok:false,error:'INVALID_HOME_SERVICE_SETTINGS'});
    const row={
      business_id:businessId,
      enabled:body.enabled===true,
      default_visit_fee_aed:Number(fee.toFixed(2)),
      default_travel_minutes:travel,
      require_customer_address:body.require_customer_address!==false,
      updated_at:new Date().toISOString(),
    };
    const saved=await write(ctx.token,'dabbir_home_service_settings?on_conflict=business_id',{
      method:'POST',
      headers:{'content-type':'application/json','prefer':'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(row),
    },'HOME_SERVICE_SETTINGS_SAVE_FAILED');
    return json(res,200,{ok:true,settings:normalizedSettings(saved?.[0]||row)});
  }

  if(action==='update_visit'){
    if(!hasPermission(membership,'manage_appointments'))return json(res,403,{ok:false,error:'APPOINTMENT_MANAGEMENT_REQUIRED'});
    const appointmentId=safeId(body.appointment_id);
    if(!appointmentId)return json(res,400,{ok:false,error:'INVALID_APPOINTMENT'});
    const locationType=clean(body.location_type,20).toLowerCase();
    const fieldStatus=clean(body.field_status,24).toLowerCase();
    if(!['business','customer'].includes(locationType)||!['scheduled','in_route','arrived','in_service','completed','cancelled'].includes(fieldStatus))return json(res,400,{ok:false,error:'INVALID_VISIT_STATE'});

    const address=clean(body.service_address,500);
    const lat=body.service_latitude==null||body.service_latitude===''?null:number(body.service_latitude,NaN);
    const lng=body.service_longitude==null||body.service_longitude===''?null:number(body.service_longitude,NaN);
    const travel=Math.trunc(number(body.travel_minutes,-1));
    const fee=number(body.visit_fee_aed,-1);
    if(travel<0||travel>720||fee<0||fee>10000000)return json(res,400,{ok:false,error:'INVALID_VISIT_VALUES'});
    if((lat===null)!==(lng===null)||lat!==null&&(lat<-90||lat>90||lng<-180||lng>180))return json(res,400,{ok:false,error:'INVALID_COORDINATES'});

    const settingsRows=await rest(ctx.token,`dabbir_home_service_settings?select=require_customer_address&business_id=eq.${enc(businessId)}&limit=1`,'HOME_SERVICE_SETTINGS_LOOKUP_FAILED');
    const requireAddress=settingsRows?.[0]?.require_customer_address!==false;
    if(locationType==='customer'&&requireAddress&&!address)return json(res,400,{ok:false,error:'CUSTOMER_ADDRESS_REQUIRED'});

    const patch=locationType==='business'?{
      location_type:'business',service_address:'',service_latitude:null,service_longitude:null,travel_minutes:0,visit_fee_aed:0,field_status:'scheduled',location_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }:{
      location_type:'customer',service_address:address,service_latitude:lat,service_longitude:lng,travel_minutes:travel,visit_fee_aed:Number(fee.toFixed(2)),field_status:fieldStatus,location_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    };
    const saved=await write(ctx.token,`dabbir_appointments?business_id=eq.${enc(businessId)}&id=eq.${enc(appointmentId)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json','prefer':'return=representation'},
      body:JSON.stringify(patch),
    },'HOME_SERVICE_VISIT_SAVE_FAILED');
    if(!Array.isArray(saved)||!saved.length)return json(res,404,{ok:false,error:'APPOINTMENT_NOT_FOUND'});
    return json(res,200,{ok:true,appointment:saved[0]});
  }

  return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});
}

export default async function handler(req,res){
  const ctx=await authenticatedContext(req,res);
  if(!ctx)return;
  try{
    if(req.method==='GET')return await handleGet(req,res,ctx);
    if(req.method==='POST')return await handlePost(req,res,ctx);
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=Number(error?.status||500);
    console.error('dabbir_home_service_failed',String(error?.message||error).slice(0,160));
    return json(res,status>=400&&status<600?status:500,{ok:false,error:String(error?.message||'HOME_SERVICE_FAILED'),detail:error?.detail||null});
  }
}
