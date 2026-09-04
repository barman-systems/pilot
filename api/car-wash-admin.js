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
const KILLER_JOB_NOT_READY='CAR_WASH_KILLER_JOB_MIGRATION_REQUIRED';
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

async function killerJobData(ctx,businessId){
  const [receipts,operatorConfig]=await Promise.all([
    rest(ctx.token,`dabbir_car_wash_owner_receipts?business_id=eq.${businessId}&select=*&order=updated_at.desc&limit=100`,{},'KILLER_JOB_LOOKUP_FAILED').catch(()=>null),
    rest(ctx.token,`dabbir_car_wash_settings?business_id=eq.${businessId}&select=operator_mode,shadow_started_at,kill_switch,operator_permissions,confidence_threshold,service_areas,default_travel_minutes,max_concurrent_bookings,max_quote_aed,max_discount_pct,max_messages_per_inquiry,ai_target_monthly_aed,ai_hard_cap_monthly_aed,ai_usage_month_aed&limit=1`,{},'KILLER_JOB_SETTINGS_LOOKUP_FAILED').then(rows=>rows?.[0]||null).catch(()=>null),
  ]);
  if(!Array.isArray(receipts))return {ready:false,error:KILLER_JOB_NOT_READY,receipts:[],summary:null};
  const dubaiDay=value=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch{return ''}};
  const today=dubaiDay(Date.now());
  const todayReceipts=receipts.filter(row=>dubaiDay(row.created_at||row.updated_at)===today);
  const openStates=new Set(['inquiry','qualified','offered','confirmed']);
  const confirmedStates=new Set(['confirmed','assigned','reminded','completed','paid']);
  const summary={
    inquiries:todayReceipts.length,
    confirmed:todayReceipts.filter(row=>confirmedStates.has(String(row.state))).length,
    stalled:receipts.filter(row=>openStates.has(String(row.state))).length,
    needs_owner:receipts.filter(row=>String(row.state)==='inquiry'||String(row.state)==='offered').length,
    booking_value:todayReceipts.filter(row=>String(row.state)!=='lost').reduce((sum,row)=>sum+Math.max(0,Number(row.booking_value)||0),0),
    verified_revenue:todayReceipts.reduce((sum,row)=>sum+Math.max(0,Number(row?.outcomes?.verified)||0),0),
    recovered_revenue:todayReceipts.reduce((sum,row)=>sum+Math.max(0,Number(row?.outcomes?.recovered)||0),0),
    lost_revenue:todayReceipts.reduce((sum,row)=>sum+Math.max(0,Number(row?.outcomes?.lost)||0),0),
    errors:todayReceipts.reduce((sum,row)=>sum+(Array.isArray(row.transitions)?row.transitions.filter(step=>step.failure_reason).length:0)+(Array.isArray(row.messages)?row.messages.filter(message=>message.error).length:0),0),
    lost_count:todayReceipts.filter(row=>String(row.state)==='lost').length,
    lost:todayReceipts.filter(row=>String(row.state)==='lost').map(row=>({job_id:row.job_id,reason:row.lost_reason||'UNSPECIFIED',amount:Number(row.booking_value)||0})),
  };
  return {ready:true,receipts,summary,operatorConfig};
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
  const [operations,killerJob]=await Promise.all([extensionData(ctx,businessId),killerJobData(ctx,businessId)]);
  const extras=new Map(operations.bookingExtras.map(row=>[row.id,row]));
  const enrichedBookings=(bookings||[]).map(booking=>({...booking,...(extras.get(booking.id)||{}),attention_reason:attentionFor(booking,Date.now())}));
  const overdueRecurring=operations.recurring.filter(plan=>plan.status==='active'&&new Date(`${plan.renewal_on}T23:59:59Z`).getTime()<Date.now()).map(plan=>({...plan,attention_reason:'اشتراك متكرر لم يُنشأ في موعده'}));
  return {business,settings:settings?.[0]||{business_id:businessId,public_booking_enabled:true,slot_interval_minutes:30,booking_horizon_days:14,open_time:'08:00:00',close_time:'20:00:00',working_days:[0,1,2,3,4,5,6]},offers:offers||[],bookings:enrichedBookings,operations:{...operations,needsAction:enrichedBookings.filter(item=>item.attention_reason),overdueRecurring},killerJob,canManageCatalog:Boolean(managerMembership(ctx,businessId)),canManageOperations:true};
}

async function requireOperations(ctx,res,businessId){if(!operationMembership(ctx,businessId)){json(res,403,{ok:false,error:'BUSINESS_OPERATIONS_REQUIRED'});return false}return true}
async function bookingFor(ctx,businessId,bookingId){return (await rest(ctx.token,`dabbir_car_wash_booking_requests?business_id=eq.${businessId}&id=eq.${bookingId}&select=*&limit=1`,{},'BOOKING_LOOKUP_FAILED'))?.[0]||null}
async function ensureExtension(ctx,businessId){const operations=await extensionData(ctx,businessId);if(!operations.ready)throw Object.assign(new Error(EXTENSION_NOT_READY),{status:409});return operations}

function base64Bytes(value){try{const normalized=String(value||'').replace(/^data:[^;]+;base64,/,'');const buffer=Buffer.from(normalized,'base64');return buffer.length?buffer:null}catch{return null}}
function attachmentName(value){return clean(value,180).replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^_+|_+$/g,'')||'evidence.jpg'}

async function post(ctx,res,body,businessId){
  const action=clean(body.action,40).toLowerCase();
  if(!await requireOperations(ctx,res,businessId))return;
  if(action==='save_operator_policy'){
    if(!managerMembership(ctx,businessId))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
    const mode=clean(body.operator_mode,24);const current=await killerJobData(ctx,businessId);if(!current.ready||!current.operatorConfig)return json(res,409,{ok:false,error:KILLER_JOB_NOT_READY});
    if(!['shadow','controlled_live','paused'].includes(mode))return json(res,400,{ok:false,error:'INVALID_OPERATOR_MODE'});
    if(mode==='controlled_live'&&Date.now()-new Date(current.operatorConfig.shadow_started_at).getTime()<48*60*60*1000)return json(res,409,{ok:false,error:'SHADOW_48_HOURS_REQUIRED'});
    const permissions={};for(const key of ['READ','MESSAGE','QUOTE','BOOK','ASSIGN','REMIND','CHARGE'])permissions[key]=body.operator_permissions?.[key]===true;
    permissions.READ=true;if(mode!=='controlled_live'){for(const key of ['MESSAGE','BOOK','ASSIGN','REMIND','CHARGE'])permissions[key]=false}
    const threshold=number(body.confidence_threshold),travel=Math.trunc(number(body.default_travel_minutes)),concurrency=Math.trunc(number(body.max_concurrent_bookings)),maxQuote=number(body.max_quote_aed),maxDiscount=number(body.max_discount_pct),maxMessages=Math.trunc(number(body.max_messages_per_inquiry));
    if(!Number.isFinite(threshold)||threshold<0.5||threshold>1||travel<0||travel>180||concurrency<1||concurrency>15||!Number.isFinite(maxQuote)||maxQuote<0||maxQuote>100000||!Number.isFinite(maxDiscount)||maxDiscount<0||maxDiscount>100||maxMessages<1||maxMessages>20)return json(res,400,{ok:false,error:'INVALID_OPERATOR_LIMITS'});
    const rows=await rest(ctx.token,`dabbir_car_wash_settings?business_id=eq.${businessId}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({operator_mode:mode,kill_switch:body.kill_switch===true,operator_permissions:permissions,confidence_threshold:threshold,default_travel_minutes:travel,max_concurrent_bookings:concurrency,max_quote_aed:maxQuote,max_discount_pct:maxDiscount,max_messages_per_inquiry:maxMessages})},'OPERATOR_POLICY_SAVE_FAILED');
    return json(res,200,{ok:true,operatorConfig:rows?.[0]||null});
  }
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
    const bookingId=id(body.booking_id);const status=clean(body.status,20).toLowerCase();if(!bookingId||!ORDER_STATUSES.includes(status))return json(res,400,{ok:false,error:'INVALID_BOOKING_STATUS'});const current=await bookingFor(ctx,businessId,bookingId);if(!current)return json(res,404,{ok:false,error:'BOOKING_NOT_FOUND'});
    const killer=await killerJobData(ctx,businessId);if(!killer.ready)return json(res,409,{ok:false,error:KILLER_JOB_NOT_READY});
    const receipt=killer.receipts.find(row=>row.booking_request_id===bookingId);if(!receipt)return json(res,409,{ok:false,error:'CAR_WASH_JOB_NOT_FOUND'});
    const targets={new:'inquiry',confirmed:current.assigned_worker_id?'assigned':'confirmed',en_route:'assigned',arrived:'assigned',washing:'assigned',completed:'completed',paid:'paid',cancelled:'lost'};
    const target=targets[status];const operation=clean(body.operation_id,160)||`owner:${bookingId}:${receipt.state}:${target}`;const reason=clean(body.note,500)||(target==='lost'?'owner_cancelled':'owner_status_update');
    const transitions=[];const path={inquiry:['qualified','offered','confirmed'],qualified:['offered','confirmed'],offered:['confirmed'],confirmed:current.assigned_worker_id?['assigned']:[],assigned:[],reminded:[],completed:[],paid:[],lost:[]};
    let cursor=String(receipt.state||'inquiry');let steps=[];
    if(target==='confirmed'&&['inquiry','qualified','offered'].includes(cursor))steps=path[cursor]||[];
    else if(target==='assigned'&&['inquiry','qualified','offered','confirmed'].includes(cursor))steps=[...(path[cursor]||[]),...(cursor==='confirmed'||(path[cursor]||[]).includes('confirmed')?['assigned']:[])];
    else if(target==='completed'&&['assigned','reminded'].includes(cursor))steps=['completed'];
    else if(target==='paid'&&cursor==='completed')steps=['paid'];
    else if(target==='lost'&&!['paid','lost'].includes(cursor))steps=['lost'];
    else if(target===cursor)steps=[];
    else return json(res,409,{ok:false,error:'ILLEGAL_CAR_WASH_STATUS_CHANGE'});
    for(let index=0;index<steps.length;index+=1){
      const next=steps[index];const evidence=next==='paid'?body.payment_evidence||{}:(next==='completed'?{reference:`owner:${ctx.user.id}`,service_completed:true}:{reference:`owner:${ctx.user.id}`});
      const result=await rest(ctx.token,'rpc/dabbir_car_wash_transition_job',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({p_business_id:businessId,p_job_id:receipt.job_id,p_to_state:next,p_actor_type:'human',p_idempotency_key:`${operation}:${index}:${next}`,p_permission_used:null,p_reason:reason,p_decision:{legacy_status:status},p_evidence:evidence,p_action:{source:'car_wash_admin'},p_external_result:{state:'OWNER_RECORDED'},p_owner_override:false})},'KILLER_JOB_TRANSITION_FAILED');
      transitions.push(result);cursor=next;
    }
    const checkpoint={confirmed:'crew_accepted',en_route:'en_route',arrived:'arrived',washing:'service_started'}[status];
    if(checkpoint&&['assigned','reminded'].includes(cursor)){
      const result=await rest(ctx.token,'rpc/dabbir_car_wash_record_checkpoint',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({p_business_id:businessId,p_job_id:receipt.job_id,p_checkpoint:checkpoint,p_idempotency_key:`${operation}:checkpoint:${checkpoint}`,p_evidence:{reference:`owner:${ctx.user.id}`,recorded_at:new Date().toISOString()}})},'KILLER_JOB_CHECKPOINT_FAILED');
      transitions.push(result);
    }
    const booking=await bookingFor(ctx,businessId,bookingId);return json(res,200,{ok:true,booking,job:{id:receipt.job_id,state:cursor},transitions});
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
