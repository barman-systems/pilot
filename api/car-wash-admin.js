import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const id=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):NaN;
const time=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));

function single(req,name){try{const url=new URL(String(req.url||'/'),'https://dabbir.invalid');const values=url.searchParams.getAll(name);return values.length===1?values[0]:null}catch{return null}}
async function read(response,fallback){const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}return payload}
const rest=(token,path,options={},fallback='REQUEST_FAILED')=>supabaseRest(path,token,options).then(r=>read(r,fallback));
async function context(req,res){const token=accessTokenFromRequest(req);if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}return {token,user,memberships}}
function ownerMembership(ctx,businessId){return ctx.memberships.find(m=>m.business_id===businessId&&m.status==='active'&&['owner','admin'].includes(String(m.role||'').toLowerCase()))||null}
function validDays(value){return Array.isArray(value)&&value.length>0&&value.length<=7&&value.every(day=>Number.isInteger(Number(day))&&Number(day)>=0&&Number(day)<=6)&&new Set(value.map(Number)).size===value.length}

async function getData(ctx,businessId){
  if(!ownerMembership(ctx,businessId))return {error:'BUSINESS_ACCESS_DENIED'};
  const [businesses,settings,offers,bookings]=await Promise.all([
    rest(ctx.token,`dabbir_businesses?select=id,name,slug,business_type&id=eq.${businessId}&limit=1`,{},'BUSINESS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_settings?business_id=eq.${businessId}&select=business_id,public_booking_enabled,slot_interval_minutes,booking_horizon_days,open_time,close_time,working_days&limit=1`,{},'BOOKING_SETTINGS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_offers?business_id=eq.${businessId}&select=id,sort_order,name_ar,name_en,description_ar,description_en,duration_minutes,saloon_price_aed,station_price_aed,active,updated_at&order=sort_order.asc&limit=6`,{},'BOOKING_OFFERS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&select=id,offer_id,vehicle_type,starts_at,customer_name,customer_phone,location_lat,location_lng,location_label,status,created_at,updated_at&order=starts_at.asc&limit=100`,{},'BOOKING_REQUESTS_LOOKUP_FAILED'),
  ]);
  const business=businesses?.[0];if(!business||business.business_type!=='car_wash')return {error:'CAR_WASH_BUSINESS_REQUIRED'};
  return {business,settings:settings?.[0]||{business_id:businessId,public_booking_enabled:true,slot_interval_minutes:30,booking_horizon_days:14,open_time:'08:00:00',close_time:'20:00:00',working_days:[0,1,2,3,4,5,6]},offers:offers||[],bookings:bookings||[]};
}

async function post(ctx,res,body,businessId){
  if(!ownerMembership(ctx,businessId))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
  const action=clean(body.action,40).toLowerCase();
  if(action==='save_settings'){
    const interval=Math.trunc(number(body.slot_interval_minutes));const horizon=Math.trunc(number(body.booking_horizon_days));const open=clean(body.open_time,8);const close=clean(body.close_time,8);const days=Array.isArray(body.working_days)?body.working_days.map(Number):[];
    if(![15,30,45,60].includes(interval)||horizon<1||horizon>60||!time(open)||!time(close)||open>=close||!validDays(days))return json(res,400,{ok:false,error:'INVALID_BOOKING_SETTINGS'});
    const rows=await rest(ctx.token,'dabbir_car_wash_settings?on_conflict=business_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({business_id:businessId,public_booking_enabled:body.public_booking_enabled!==false,slot_interval_minutes:interval,booking_horizon_days:horizon,open_time:open,close_time:close,working_days:days})},'BOOKING_SETTINGS_SAVE_FAILED');
    return json(res,200,{ok:true,settings:rows?.[0]||null});
  }
  if(action==='save_offer'){
    const offerId=id(body.offer_id);const sortOrder=Math.trunc(number(body.sort_order));const nameAr=clean(body.name_ar,120);const nameEn=clean(body.name_en,120);const descriptionAr=clean(body.description_ar,500);const descriptionEn=clean(body.description_en,500);const duration=Math.trunc(number(body.duration_minutes));const saloon=number(body.saloon_price_aed);const station=number(body.station_price_aed);
    if(sortOrder<1||sortOrder>6||nameAr.length<2||nameEn.length<2||duration<15||duration>480||!Number.isFinite(saloon)||saloon<0||saloon>100000||!Number.isFinite(station)||station<0||station>100000)return json(res,400,{ok:false,error:'INVALID_BOOKING_OFFER'});
    const record={business_id:businessId,sort_order:sortOrder,name_ar:nameAr,name_en:nameEn,description_ar:descriptionAr,description_en:descriptionEn,duration_minutes:duration,saloon_price_aed:Number(saloon.toFixed(2)),station_price_aed:Number(station.toFixed(2)),active:body.active!==false};
    const path=offerId?`dabbir_car_wash_offers?business_id=eq.${businessId}&id=eq.${offerId}`:'dabbir_car_wash_offers';
    const rows=await rest(ctx.token,path,{method:offerId?'PATCH':'POST',headers:{prefer:'return=representation'},body:JSON.stringify(record)},'BOOKING_OFFER_SAVE_FAILED');
    return json(res,200,{ok:true,offer:rows?.[0]||null});
  }
  if(action==='deactivate_offer'){
    const offerId=id(body.offer_id);if(!offerId)return json(res,400,{ok:false,error:'OFFER_REQUIRED'});
    const rows=await rest(ctx.token,`dabbir_car_wash_offers?business_id=eq.${businessId}&id=eq.${offerId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({active:false})},'BOOKING_OFFER_DEACTIVATE_FAILED');
    return json(res,200,{ok:true,offer:rows?.[0]||null});
  }
  if(action==='update_booking_status'){
    const bookingId=id(body.booking_id);const status=clean(body.status,20).toLowerCase();if(!bookingId||!['requested','confirmed','declined','completed','cancelled'].includes(status))return json(res,400,{ok:false,error:'INVALID_BOOKING_STATUS'});
    const rows=await rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&id=eq.${bookingId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({status})},'BOOKING_STATUS_UPDATE_FAILED');
    return json(res,200,{ok:true,booking:rows?.[0]||null});
  }
  return json(res,400,{ok:false,error:'UNSUPPORTED_BOOKING_ADMIN_ACTION'});
}

export default async function handler(req,res){
  const ctx=await context(req,res);if(!ctx)return;
  try{
    let body=null;
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      body=await readJsonBody(req);
    }
    const businessId=id(req.method==='GET'?single(req,'business_id'):body?.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const data=await getData(ctx,businessId);if(data.error)return json(res,data.error==='BUSINESS_ACCESS_DENIED'?403:404,{ok:false,error:data.error});
    if(req.method==='GET')return json(res,200,{ok:true,...data});
    if(req.method==='POST')return post(ctx,res,body,businessId);
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){const status=[400,401,403,404,409,413,422,429].includes(Number(error?.status))?Number(error.status):500;console.error('dabbir_car_wash_admin_failed',{error:String(error?.message||'CAR_WASH_ADMIN_FAILED').slice(0,120),status});return json(res,status,{ok:false,error:String(error?.message||'CAR_WASH_ADMIN_FAILED').slice(0,120)});}
}
