import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseStorage,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATIONS_ROLES=['owner','admin','manager','employee','staff'];
const MANAGER_ROLES=['owner','admin'];
const ORDER_STATUSES=['new','confirmed','en_route','arrived','washing','completed','paid','cancelled'];
const EXTENSION_NOT_READY='CAR_WASH_OPERATIONS_MIGRATION_REQUIRED';
const id=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):NaN;
const time=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
const operationMembership=(ctx,businessId)=>ctx.memberships.find(m=>m.business_id===businessId&&m.status==='active'&&OPERATIONS_ROLES.includes(String(m.role||'').toLowerCase()))||null;
const managerMembership=(ctx,businessId)=>ctx.memberships.find(m=>m.business_id===businessId&&m.status==='active'&&MANAGER_ROLES.includes(String(m.role||'').toLowerCase()))||null;
const ownerMembership=managerMembership;

function single(req,name){try{const url=new URL(String(req.url||'/'),'https://dabbir.invalid');const values=url.searchParams.getAll(name);return values.length===1?values[0]:null}catch{return null}}
async function read(response,fallback){const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}return payload}
const rest=(token,path,options={},fallback='REQUEST_FAILED')=>supabaseRest(path,token,options).then(response=>read(response,fallback));
async function context(req,res){const token=accessTokenFromRequest(req);if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}return {token,user,memberships}}

function attentionFor(booking,now){
  const status=String(booking?.status||'');const startsAt=new Date(booking?.starts_at||0).getTime();const updatedAt=new Date(booking?.updated_at||booking?.created_at||0).getTime();
  if(status==='new')return 'بانتظار تأكيد الطلب';
  if(status==='confirmed'&&startsAt>=now&&startsAt-now<=30*60*1000)return 'موعد قريب يحتاج تحديثًا';
  if(status==='washing'&&now-updatedAt>2*60*60*1000)return 'جاري الغسيل منذ أكثر من ساعتين';
  if(status==='completed')return 'مكتمل وغير مدفوع';
  if(startsAt<now&&!['completed','paid','cancelled'].includes(status))return 'موعد متأخر';
  return null;
}

async function extensionData(ctx,businessId){
  const [customers,vehicles,histories,photos,recurring,bookingExtras]=await Promise.all([
    rest(ctx.token,`dabbir_customers?select=id,display_name,metadata,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=200`,{},'CUSTOMERS_LOOKUP_FAILED').catch(()=>[]),
    rest(ctx.token,`dabbir_car_wash_vehicles?business_id=eq.${businessId}&select=*&order=created_at.desc&limit=300`,{},'VEHICLES_LOOKUP_FAILED').catch(()=>null),
    rest(ctx.token,`dabbir_car_wash_booking_status_history?business_id=eq.${businessId}&select=*&order=created_at.desc&limit=500`,{},'HISTORY_LOOKUP_FAILED').catch(()=>null),
    rest(ctx.token,`dabbir_car_wash_booking_photos?business_id=eq.${businessId}&select=*&order=created_at.desc&limit=500`,{},'PHOTOS_LOOKUP_FAILED').catch(()=>null),
    rest(ctx.token,`dabbir_car_wash_recurring_plans?business_id=eq.${businessId}&select=*&order=renewal_on.asc&limit=200`,{},'RECURRING_LOOKUP_FAILED').catch(()=>null),
    rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&select=id,customer_id,vehicle_id,service_notes,quoted_price_aed,maps_url&limit=500`,{},'BOOKING_EXTENSIONS_LOOKUP_FAILED').catch(()=>null),
  ]);
  const ready=[vehicles,histories,photos,recurring,bookingExtras].every(Array.isArray);
  return {ready,customers:Array.isArray(customers)?customers:[],vehicles:vehicles||[],histories:histories||[],photos:photos||[],recurring:recurring||[],bookingExtras:bookingExtras||[]};
}

async function getData(ctx,businessId){
  if(!operationMembership(ctx,businessId))return {error:'BUSINESS_ACCESS_DENIED'};
  const [businesses,settings,offers,bookings]=await Promise.all([
    rest(ctx.token,`dabbir_businesses?select=id,name,slug,business_type&id=eq.${businessId}&limit=1`,{},'BUSINESS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_settings?business_id=eq.${businessId}&select=business_id,public_booking_enabled,slot_interval_minutes,booking_horizon_days,open_time,close_time,working_days&limit=1`,{},'BOOKING_SETTINGS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_offers?business_id=eq.${businessId}&select=id,sort_order,name_ar,name_en,description_ar,description_en,duration_minutes,saloon_price_aed,station_price_aed,active,updated_at&order=sort_order.asc&limit=6`,{},'BOOKING_OFFERS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&select=id,offer_id,vehicle_type,starts_at,customer_name,customer_phone,location_lat,location_lng,location_label,status,created_at,updated_at&order=starts_at.asc&limit=100`,{},'BOOKING_REQUESTS_LOOKUP_FAILED'),
  ]);
  const business=businesses?.[0];if(!business||business.business_type!=='car_wash')return {error:'CAR_WASH_BUSINESS_REQUIRED'};
  const operations=await extensionData(ctx,businessId);
  const extras=new Map(operations.bookingExtras.map(row=>[row.id,row]));
  const enrichedBookings=(bookings||[]).map(booking=>({...booking,...(extras.get(booking.id)||{}),attention_reason:attentionFor(booking,Date.now())}));
  const overdueRecurring=operations.recurring.filter(plan=>plan.status==='active'&&new Date(`${plan.renewal_on}T23:59:59Z`).getTime()<Date.now()).map(plan=>({...plan,attention_reason:'اشتراك متكرر لم يُنشأ في موعده'}));
  return {business,settings:settings?.[0]||{business_id:businessId,public_booking_enabled:true,slot_interval_minutes:30,booking_horizon_days:14,open_time:'08:00:00',close_time:'20:00:00',working_days:[0,1,2,3,4,5,6]},offers:offers||[],bookings:enrichedBookings,operations:{...operations,needsAction:enrichedBookings.filter(item=>item.attention_reason),overdueRecurring},canManageCatalog:Boolean(managerMembership(ctx,businessId)),canManageOperations:true};
}

async function requireOperations(ctx,res,businessId){if(!operationMembership(ctx,businessId)){json(res,403,{ok:false,error:'BUSINESS_OPERATIONS_REQUIRED'});return false}return true}
async function bookingFor(ctx,businessId,bookingId){return (await rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&id=eq.${bookingId}&select=*&limit=1`,{},'BOOKING_LOOKUP_FAILED'))?.[0]||null}
async function ensureExtension(ctx,businessId){const operations=await extensionData(ctx,businessId);if(!operations.ready)throw Object.assign(new Error(EXTENSION_NOT_READY),{status:409});return operations}

function base64Bytes(value){try{const normalized=String(value||'').replace(/^data:[^;]+;base64,/,'');const buffer=Buffer.from(normalized,'base64');return buffer.length?buffer:null}catch{return null}}
function attachmentName(value){return clean(value,180).replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^_+|_+$/g,'')||'evidence.jpg'}

async function post(ctx,res,body,businessId){
  const action=clean(body.action,40).toLowerCase();
  if(!await requireOperations(ctx,res,businessId))return;
  if(action==='save_settings'||action==='save_offer'||action==='deactivate_offer'){
    if(!managerMembership(ctx,businessId))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
    if(action==='save_settings'){
      const interval=Math.trunc(number(body.slot_interval_minutes));const horizon=Math.trunc(number(body.booking_horizon_days));const open=clean(body.open_time,8);const close=clean(body.close_time,8);const days=Array.isArray(body.working_days)?body.working_days.map(Number):[];
      if(![15,30,45,60].includes(interval)||horizon<1||horizon>60||!time(open)||!time(close)||open>=close||!validDays(days))return json(res,400,{ok:false,error:'INVALID_BOOKING_SETTINGS'});
      const rows=await rest(ctx.token,'dabbir_car_wash_settings?on_conflict=business_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({business_id:businessId,public_booking_enabled:body.public_booking_enabled!==false,slot_interval_minutes:interval,booking_horizon_days:horizon,open_time:open,close_time:close,working_days:days})},'BOOKING_SETTINGS_SAVE_FAILED');return json(res,200,{ok:true,settings:rows?.[0]||null});
    }
    if(action==='save_offer'){
      const offerId=id(body.offer_id);const sortOrder=Math.trunc(number(body.sort_order));const nameAr=clean(body.name_ar,120);const nameEn=clean(body.name_en,120);const descriptionAr=clean(body.description_ar,500);const descriptionEn=clean(body.description_en,500);const duration=Math.trunc(number(body.duration_minutes));const saloon=number(body.saloon_price_aed);const station=number(body.station_price_aed);
      if(sortOrder<1||sortOrder>6||nameAr.length<2||nameEn.length<2||duration<15||duration>480||!Number.isFinite(saloon)||saloon<0||saloon>100000||!Number.isFinite(station)||station<0||station>100000)return json(res,400,{ok:false,error:'INVALID_BOOKING_OFFER'});
      const record={business_id:businessId,sort_order:sortOrder,name_ar:nameAr,name_en:nameEn,description_ar:descriptionAr,description_en:descriptionEn,duration_minutes:duration,saloon_price_aed:Number(saloon.toFixed(2)),station_price_aed:Number(station.toFixed(2)),active:body.active!==false};const path=offerId?`dabbir_car_wash_offers?business_id=eq.${businessId}&id=eq.${offerId}`:'dabbir_car_wash_offers';const rows=await rest(ctx.token,path,{method:offerId?'PATCH':'POST',headers:{prefer:'return=representation'},body:JSON.stringify(record)},'BOOKING_OFFER_SAVE_FAILED');return json(res,200,{ok:true,offer:rows?.[0]||null});
    }
    const offerId=id(body.offer_id);if(!offerId)return json(res,400,{ok:false,error:'OFFER_REQUIRED'});const rows=await rest(ctx.token,`dabbir_car_wash_offers?business_id=eq.${businessId}&id=eq.${offerId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({active:false})},'BOOKING_OFFER_DEACTIVATE_FAILED');return json(res,200,{ok:true,offer:rows?.[0]||null});
  }
  if(action==='create_vehicle'){
    await ensureExtension(ctx,businessId);const customerId=id(body.customer_id);const vehicleType=clean(body.vehicle_type,80);const model=clean(body.model,120);if(!customerId||vehicleType.length<2||model.length<2)return json(res,400,{ok:false,error:'INVALID_VEHICLE'});const rows=await rest(ctx.token,'dabbir_car_wash_vehicles',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,customer_id:customerId,vehicle_type:vehicleType,model,color:clean(body.color,60),plate_number:clean(body.plate_number,40),notes:clean(body.notes,1000)})},'VEHICLE_CREATE_FAILED');return json(res,200,{ok:true,vehicle:rows?.[0]||null});
  }
  if(action==='link_booking_vehicle'){
    await ensureExtension(ctx,businessId);const bookingId=id(body.booking_id);const vehicleId=id(body.vehicle_id);const customerId=id(body.customer_id);if(!bookingId||!vehicleId||!customerId)return json(res,400,{ok:false,error:'BOOKING_VEHICLE_CUSTOMER_REQUIRED'});const rows=await rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&id=eq.${bookingId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({vehicle_id:vehicleId,customer_id:customerId,maps_url:clean(body.maps_url,500),service_notes:clean(body.service_notes,1000),quoted_price_aed:Number.isFinite(number(body.quoted_price_aed))?Number(number(body.quoted_price_aed).toFixed(2)):null})},'BOOKING_LINK_FAILED');return json(res,200,{ok:true,booking:rows?.[0]||null});
  }
  if(action==='update_booking_status'){
    const bookingId=id(body.booking_id);const status=clean(body.status,20).toLowerCase();if(!bookingId||!ORDER_STATUSES.includes(status))return json(res,400,{ok:false,error:'INVALID_BOOKING_STATUS'});const current=await bookingFor(ctx,businessId,bookingId);if(!current)return json(res,404,{ok:false,error:'BOOKING_NOT_FOUND'});const rows=await rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&id=eq.${bookingId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({status})},'BOOKING_STATUS_UPDATE_FAILED');try{await ensureExtension(ctx,businessId);await rest(ctx.token,'dabbir_car_wash_booking_status_history',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({booking_id:bookingId,business_id:businessId,from_status:current.status,to_status:status,note:clean(body.note,1000),changed_by:ctx.user.id})},'STATUS_HISTORY_CREATE_FAILED')}catch(error){if(String(error?.message||'')!==EXTENSION_NOT_READY)throw error}return json(res,200,{ok:true,booking:rows?.[0]||null});
  }
  if(action==='add_photo'){
    await ensureExtension(ctx,businessId);const bookingId=id(body.booking_id);const vehicleId=id(body.vehicle_id);const phase=clean(body.phase,10);const mimeType=clean(body.mime_type,80).toLowerCase();const filename=attachmentName(body.filename);const bytes=base64Bytes(body.data_base64);if(!bookingId||!vehicleId||!['before','after'].includes(phase)||!/^image\/(jpeg|png|webp)$/.test(mimeType)||!bytes||bytes.length>2*1024*1024)return json(res,400,{ok:false,error:'INVALID_EVIDENCE_IMAGE'});const booking=await bookingFor(ctx,businessId,bookingId);if(!booking)return json(res,404,{ok:false,error:'BOOKING_NOT_FOUND'});const ext=mimeType.split('/')[1];const storagePath=`${businessId}/${bookingId}/${phase}/${crypto.randomUUID()}.${ext}`;const uploaded=await supabaseStorage(`object/dabbir-car-wash-evidence/${storagePath}`,ctx.token,{method:'POST',headers:{'content-type':mimeType,'x-upsert':'false'},body:bytes});if(!uploaded.ok)throw Object.assign(new Error('EVIDENCE_UPLOAD_FAILED'),{status:uploaded.status});const rows=await rest(ctx.token,'dabbir_car_wash_booking_photos',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({booking_id:bookingId,business_id:businessId,vehicle_id:vehicleId,phase,storage_path:storagePath,filename,created_by:ctx.user.id})},'EVIDENCE_RECORD_CREATE_FAILED');return json(res,200,{ok:true,photo:rows?.[0]||null});
  }
  if(action==='repeat_booking'){
    await ensureExtension(ctx,businessId);const bookingId=id(body.booking_id);const startsAt=new Date(body.starts_at);if(!bookingId||Number.isNaN(startsAt.getTime())||startsAt.getTime()<=Date.now())return json(res,400,{ok:false,error:'INVALID_REPEAT_DATE'});const source=await bookingFor(ctx,businessId,bookingId);if(!source)return json(res,404,{ok:false,error:'BOOKING_NOT_FOUND'});const rows=await rest(ctx.token,'dabbir_car_wash_booking_requests',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,offer_id:source.offer_id,vehicle_type:source.vehicle_type,starts_at:startsAt.toISOString(),customer_name:source.customer_name,customer_phone:source.customer_phone,location_lat:source.location_lat,location_lng:source.location_lng,location_label:source.location_label,customer_id:source.customer_id,vehicle_id:source.vehicle_id,service_notes:source.service_notes||'',quoted_price_aed:source.quoted_price_aed,maps_url:source.maps_url||null,status:'new',source:'operations'})},'BOOKING_REPEAT_FAILED');const repeated=rows?.[0]||null;if(repeated?.id)await rest(ctx.token,'dabbir_car_wash_booking_status_history',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({booking_id:repeated.id,business_id:businessId,to_status:'new',note:'طلب مكرر',changed_by:ctx.user.id})},'STATUS_HISTORY_CREATE_FAILED');return json(res,200,{ok:true,booking:repeated});
  }
  if(action==='create_recurring_plan'){
    await ensureExtension(ctx,businessId);const customerId=id(body.customer_id);const vehicleId=id(body.vehicle_id);const offerId=id(body.offer_id);const frequency=clean(body.frequency,20);const startsOn=/^\d{4}-\d{2}-\d{2}$/.test(clean(body.starts_on,10))?clean(body.starts_on,10):null;const renewalOn=/^\d{4}-\d{2}-\d{2}$/.test(clean(body.renewal_on,10))?clean(body.renewal_on,10):null;const washes=body.washes_per_month==null||body.washes_per_month===''?null:Math.trunc(number(body.washes_per_month));if(!customerId||!vehicleId||!offerId||!['weekly','biweekly','monthly'].includes(frequency)||!startsOn||!renewalOn||(washes!==null&&(!Number.isInteger(washes)||washes<1||washes>31)))return json(res,400,{ok:false,error:'INVALID_RECURRING_PLAN'});const rows=await rest(ctx.token,'dabbir_car_wash_recurring_plans',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,customer_id:customerId,vehicle_id:vehicleId,offer_id:offerId,frequency,washes_per_month:washes,starts_on:startsOn,renewal_on:renewalOn,notes:clean(body.notes,1000)})},'RECURRING_PLAN_CREATE_FAILED');return json(res,200,{ok:true,plan:rows?.[0]||null});
  }
  return json(res,400,{ok:false,error:'UNSUPPORTED_CAR_WASH_ACTION'});
}

function validDays(value){return Array.isArray(value)&&value.length>0&&value.length<=7&&value.every(day=>Number.isInteger(Number(day))&&Number(day)>=0&&Number(day)<=6)&&new Set(value.map(Number)).size===value.length}
export default async function handler(req,res){const ctx=await context(req,res);if(!ctx)return;try{let body=null;if(req.method==='POST'){if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});body=await readJsonBody(req)}const businessId=id(req.method==='GET'?single(req,'business_id'):body?.business_id);if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});const data=await getData(ctx,businessId);if(data.error)return json(res,data.error==='BUSINESS_ACCESS_DENIED'?403:404,{ok:false,error:data.error});if(req.method==='GET')return json(res,200,{ok:true,...data});if(req.method==='POST')return post(ctx,res,body,businessId);return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'})}catch(error){const status=[400,401,403,404,409,413,422,429].includes(Number(error?.status))?Number(error.status):500;console.error('dabbir_car_wash_admin_failed',{error:String(error?.message||'CAR_WASH_ADMIN_FAILED').slice(0,120),status});return json(res,status,{ok:false,error:String(error?.message||'CAR_WASH_ADMIN_FAILED').slice(0,120)})}}
