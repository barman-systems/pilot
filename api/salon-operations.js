import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';
import { syncBusinessCalendars } from './_calendar-sync-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES=new Set(['new','confirmed','arrived','in_progress']);
const ALL_STATUSES=new Set([...ACTIVE_STATUSES,'completed','cancelled','no_show']);
const PAYMENT_METHODS=new Set(['cash','card','payment_link','other','unpaid']);
const clean=(value,max=240)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const safeId=value=>UUID_RE.test(clean(value,60))?clean(value,60):null;
const queryValue=(req,key)=>{const value=req?.query?.[key];return Array.isArray(value)?value[0]:value};
const enc=value=>encodeURIComponent(String(value));

async function readData(response,fallback){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(payload?.message||payload?.code||fallback);error.status=response.status;throw error}
  return payload;
}
const rest=(token,path,options={},fallback='SALON_REQUEST_FAILED')=>supabaseRest(path,token,options).then(r=>readData(r,fallback));
const rpc=(token,name,params={},fallback='SALON_RPC_FAILED')=>supabaseRpc(name,token,params).then(r=>readData(r,fallback));

async function context(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}
function membershipFor(ctx,businessId){return ctx.memberships.find(m=>m.business_id===businessId&&m.status==='active')||null}
function canManageTeam(membership){return ['owner','admin'].includes(String(membership?.role||'').toLowerCase())}
function canManageSalon(membership){return ['owner','admin','manager','employee','staff'].includes(String(membership?.role||'').toLowerCase())}
function isoDate(value,fallback){const date=new Date(value||fallback);return Number.isNaN(date.getTime())?null:date.toISOString()}
function boundedRange(req,days=14,maxDays=45){
  const now=Date.now(),from=isoDate(queryValue(req,'from'),new Date(now-days*864e5)),to=isoDate(queryValue(req,'to'),new Date(now+days*864e5));
  if(!from||!to||new Date(to)<=new Date(from)||new Date(to)-new Date(from)>maxDays*864e5)return null;
  return {from,to};
}
function number(value,{min=0,max=1e7,fallback=0}={}){const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback}
function normalizeSchedule(rows=[]){
  return rows.slice(0,100).map(row=>({
    weekday:Number(row.weekday),starts_at:clean(row.starts_at,8),ends_at:clean(row.ends_at,8),
    schedule_type:['work','break','unavailable'].includes(row.schedule_type)?row.schedule_type:'work',active:row.active!==false,
  })).filter(row=>Number.isInteger(row.weekday)&&row.weekday>=0&&row.weekday<=6&&/^\d{2}:\d{2}/.test(row.starts_at)&&/^\d{2}:\d{2}/.test(row.ends_at)&&row.ends_at>row.starts_at);
}

async function verifySalon(ctx,businessId){
  const rows=await rest(ctx.token,`dabbir_businesses?select=id,name,business_type,locale&id=eq.${enc(businessId)}&limit=1`,{},'BUSINESS_LOOKUP_FAILED');
  const business=rows?.[0]||null;
  if(!business)throw Object.assign(new Error('BUSINESS_NOT_FOUND'),{status:404});
  if(business.business_type!=='salon')throw Object.assign(new Error('SALON_MODE_REQUIRED'),{status:409});
  return business;
}

async function snapshot(ctx,businessId,range){
  const [business,settings,workers,workerServices,schedules,timeOff,services,appointments,customers,commissions,payments,waitlist,notifications]=await Promise.all([
    verifySalon(ctx,businessId),
    rest(ctx.token,`dabbir_salon_settings?select=business_id,timezone,reminder_on_booking,reminder_24h,reminder_2h,no_show_warning_threshold,deposit_enabled,retention_days&business_id=eq.${enc(businessId)}&limit=1`,{},'SETTINGS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_workers?select=id,membership_user_id,display_name,phone_e164,job_title,commission_type,commission_value,status,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=display_name.asc&limit=100`,{},'WORKERS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_worker_services?select=worker_id,service_id,duration_minutes,price_aed,commission_type,commission_value,active&business_id=eq.${enc(businessId)}&limit=500`,{},'WORKER_SERVICES_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_worker_schedules?select=id,worker_id,weekday,starts_at,ends_at,schedule_type,active&business_id=eq.${enc(businessId)}&order=weekday.asc,starts_at.asc&limit=700`,{},'SCHEDULES_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_worker_time_off?select=id,worker_id,starts_at,ends_at,time_off_type,reason&business_id=eq.${enc(businessId)}&ends_at=gte.${enc(range.from)}&starts_at=lte.${enc(range.to)}&order=starts_at.asc&limit=200`,{},'TIME_OFF_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_services?select=id,name,name_ar,name_en,category,price_aed,duration_minutes,commission_type,commission_value,active,metadata&business_id=eq.${enc(businessId)}&order=active.desc,name.asc&limit=200`,{},'SERVICES_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_appointments?select=id,customer_id,service_id,worker_id,starts_at,ends_at,status,quoted_price_aed,discount_aed,notes,booking_source,payment_status,created_at,updated_at&business_id=eq.${enc(businessId)}&starts_at=gte.${enc(range.from)}&starts_at=lte.${enc(range.to)}&order=starts_at.asc&limit=1000`,{},'APPOINTMENTS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_customers?select=id,display_name,phone_e164,channel_handle,lead_status,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=updated_at.desc&limit=500`,{},'CUSTOMERS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_commissions?select=id,worker_id,appointment_id,appointment_service_id,commission_type,commission_value,revenue_aed,commission_aed,salon_gross_aed,status,generated_at&business_id=eq.${enc(businessId)}&generated_at=gte.${enc(range.from)}&generated_at=lte.${enc(range.to)}&order=generated_at.desc&limit=1000`,{},'COMMISSIONS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_operational_payments?select=id,appointment_id,customer_id,amount_aed,method,status,reference,created_at&business_id=eq.${enc(businessId)}&created_at=gte.${enc(range.from)}&created_at=lte.${enc(range.to)}&order=created_at.desc&limit=1000`,{},'PAYMENTS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_waitlist_entries?select=id,customer_id,service_id,preferred_worker_id,desired_date,window_start,window_end,expires_at,status,matched_appointment_id,created_at&business_id=eq.${enc(businessId)}&status=in.(waiting,matched,contacted)&order=created_at.asc&limit=200`,{},'WAITLIST_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_workflow_notifications?select=id,appointment_id,customer_id,waitlist_entry_id,channel,notification_type,scheduled_for,status,provider_message_id,sent_at,last_error,created_at&business_id=eq.${enc(businessId)}&created_at=gte.${enc(range.from)}&order=created_at.desc&limit=500`,{},'NOTIFICATIONS_LOOKUP_FAILED'),
  ]);
  return {ok:true,mode:'salon',business,settings:settings?.[0]||null,workers,worker_services:workerServices,schedules,time_off:timeOff,services,appointments,customers,commissions,payments,waitlist,notifications,range};
}

function aggregateReports(data){
  const appointments=data.appointments||[],workers=new Map((data.workers||[]).map(x=>[x.id,x])),services=new Map((data.services||[]).map(x=>[x.id,x]));
  const revenue=new Map(),workerStats=new Map(),serviceStats=new Map(),hourStats=new Map(),customerStats=new Map();
  let cancellations=0,noShows=0,completed=0,totalRevenue=0,totalCommission=0;
  for(const item of data.commissions||[])if(item.status==='earned'){totalRevenue+=Number(item.revenue_aed||0);totalCommission+=Number(item.commission_aed||0)}
  for(const a of appointments){
    const day=String(a.starts_at||'').slice(0,10),hour=new Date(a.starts_at).getHours();
    if(a.status==='completed'){completed++;revenue.set(day,(revenue.get(day)||0)+number(a.quoted_price_aed)-number(a.discount_aed));}
    if(a.status==='cancelled')cancellations++;
    if(a.status==='no_show')noShows++;
    const w=workerStats.get(a.worker_id)||{worker_id:a.worker_id,name:workers.get(a.worker_id)?.display_name||'—',bookings:0,completed:0,revenue_aed:0};w.bookings++;if(a.status==='completed'){w.completed++;w.revenue_aed+=number(a.quoted_price_aed)-number(a.discount_aed)}workerStats.set(a.worker_id,w);
    const s=serviceStats.get(a.service_id)||{service_id:a.service_id,name:services.get(a.service_id)?.name_ar||services.get(a.service_id)?.name||'—',bookings:0,completed:0,revenue_aed:0};s.bookings++;if(a.status==='completed'){s.completed++;s.revenue_aed+=number(a.quoted_price_aed)-number(a.discount_aed)}serviceStats.set(a.service_id,s);
    hourStats.set(hour,(hourStats.get(hour)||0)+1);
    const c=customerStats.get(a.customer_id)||{customer_id:a.customer_id,bookings:0,completed:0,last_visit:null};c.bookings++;if(a.status==='completed'){c.completed++;if(!c.last_visit||a.starts_at>c.last_visit)c.last_visit=a.starts_at}customerStats.set(a.customer_id,c);
  }
  const inactive=[...customerStats.values()].filter(x=>x.last_visit&&Date.now()-new Date(x.last_visit).getTime()>45*864e5).sort((a,b)=>String(a.last_visit).localeCompare(String(b.last_visit))).slice(0,100);
  return {
    summary:{bookings:appointments.length,completed,cancellations,no_show:noShows,revenue_aed:totalRevenue,commissions_aed:totalCommission,salon_gross_aed:totalRevenue-totalCommission},
    revenue:[...revenue].map(([date,amount_aed])=>({date,amount_aed})).sort((a,b)=>a.date.localeCompare(b.date)),
    employees:[...workerStats.values()].sort((a,b)=>b.revenue_aed-a.revenue_aed),
    services:[...serviceStats.values()].sort((a,b)=>b.bookings-a.bookings),
    peak_hours:[...hourStats].map(([hour,bookings])=>({hour,bookings})).sort((a,b)=>b.bookings-a.bookings),
    recurring_customers:[...customerStats.values()].filter(x=>x.completed>1).sort((a,b)=>b.completed-a.completed),
    inactive_customers:inactive,
  };
}

async function handleGet(req,ctx,businessId){
  const resource=clean(queryValue(req,'resource')||'snapshot',40);
  if(resource==='customer_360'){
    const customerId=safeId(queryValue(req,'customer_id'));if(!customerId)return {status:400,body:{ok:false,error:'CUSTOMER_ID_REQUIRED'}};
    const result=await rpc(ctx.token,'dabbir_salon_customer_360',{p_business_id:businessId,p_customer_id:customerId},'CUSTOMER_360_FAILED');
    return {status:200,body:{ok:true,profile:result}};
  }
  if(resource==='today'){
    await verifySalon(ctx,businessId);const day=clean(queryValue(req,'day')||new Date().toISOString().slice(0,10),10);
    const result=await rpc(ctx.token,'dabbir_salon_today',{p_business_id:businessId,p_day:day},'SALON_TODAY_FAILED');
    return {status:200,body:{ok:true,today:result}};
  }
  const range=boundedRange(req,resource==='reports'?90:14,resource==='reports'?366:45);
  if(!range)return {status:400,body:{ok:false,error:'INVALID_DATE_RANGE'}};
  const data=await snapshot(ctx,businessId,range);
  if(resource==='reports')return {status:200,body:{ok:true,reports:aggregateReports(data),range}};
  return {status:200,body:data};
}

async function patchAppointment(req,ctx,businessId,body){
  const appointmentId=safeId(body.appointment_id),workerId=safeId(body.worker_id);if(!appointmentId)return {status:400,body:{ok:false,error:'APPOINTMENT_ID_REQUIRED'}};
  const currentRows=await rest(ctx.token,`dabbir_appointments?select=id,starts_at,ends_at,status,worker_id&business_id=eq.${enc(businessId)}&id=eq.${enc(appointmentId)}&limit=1`,{},'APPOINTMENT_LOOKUP_FAILED');
  const current=currentRows?.[0];if(!current)return {status:404,body:{ok:false,error:'APPOINTMENT_NOT_FOUND'}};
  const patch={updated_at:new Date().toISOString()};
  if(body.starts_at!==undefined){const start=isoDate(body.starts_at);if(!start||new Date(start)<=new Date())return {status:400,body:{ok:false,error:'VALID_FUTURE_START_REQUIRED'}};const duration=number(body.duration_minutes,{min:5,max:1440,fallback:Math.round((new Date(current.ends_at)-new Date(current.starts_at))/60000)||60});patch.starts_at=start;patch.ends_at=new Date(new Date(start).getTime()+duration*60000).toISOString()}
  if(body.duration_minutes!==undefined&&!patch.ends_at){const duration=number(body.duration_minutes,{min:5,max:1440,fallback:60});patch.ends_at=new Date(new Date(current.starts_at).getTime()+duration*60000).toISOString()}
  if(body.worker_id!==undefined){if(!workerId)return {status:400,body:{ok:false,error:'WORKER_ID_REQUIRED'}};patch.worker_id=workerId}
  if(body.notes!==undefined)patch.notes=clean(body.notes,2000);
  if(body.discount_aed!==undefined)patch.discount_aed=number(body.discount_aed,{min:0,max:1e7,fallback:0});
  const rows=await rest(ctx.token,`dabbir_appointments?business_id=eq.${enc(businessId)}&id=eq.${enc(appointmentId)}&select=id,customer_id,service_id,worker_id,starts_at,ends_at,status,quoted_price_aed,discount_aed,notes,payment_status,updated_at`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(patch)},'APPOINTMENT_UPDATE_FAILED');
  const appointment=rows?.[0];if(!appointment)return {status:403,body:{ok:false,error:'APPOINTMENT_MANAGEMENT_REQUIRED'}};
  let calendar_sync=[];try{calendar_sync=await syncBusinessCalendars(req,businessId)}catch(error){calendar_sync=[{ok:false,error:clean(error?.message||'CALENDAR_SYNC_FAILED',140)}]}
  return {status:200,body:{ok:true,appointment,calendar_sync}};
}

async function handlePost(req,ctx,businessId,membership,body){
  const action=clean(body.action,60);await verifySalon(ctx,businessId);
  if(!canManageSalon(membership))return {status:403,body:{ok:false,error:'SALON_MANAGEMENT_REQUIRED'}};
  if(action==='quick_book'){
    const result=await rpc(ctx.token,'dabbir_salon_quick_book',{p_business_id:businessId,p_customer_name:clean(body.customer_name,120),p_customer_phone:clean(body.customer_phone,30),p_service_id:safeId(body.service_id),p_worker_id:safeId(body.worker_id),p_starts_at:body.starts_at,p_discount_aed:number(body.discount_aed),p_notes:clean(body.notes,2000),p_source:clean(body.source||'internal',30)},'QUICK_BOOKING_FAILED');
    let calendar_sync=[];try{calendar_sync=await syncBusinessCalendars(req,businessId)}catch(error){calendar_sync=[{ok:false,error:clean(error?.message,140)}]}
    return {status:201,body:{ok:true,booking:result,calendar_sync}};
  }
  if(action==='transition'){
    const status=clean(body.status,30);if(!ALL_STATUSES.has(status))return {status:400,body:{ok:false,error:'INVALID_APPOINTMENT_STATUS'}};
    const appointmentId=safeId(body.appointment_id);if(!appointmentId)return {status:400,body:{ok:false,error:'APPOINTMENT_ID_REQUIRED'}};
    const result=await rpc(ctx.token,'dabbir_salon_transition_appointment',{p_business_id:businessId,p_appointment_id:appointmentId,p_status:status},'STATUS_TRANSITION_FAILED');
    const matches=status==='cancelled'?await rpc(ctx.token,'dabbir_salon_waitlist_matches',{p_business_id:businessId,p_appointment_id:appointmentId},'WAITLIST_MATCH_FAILED').catch(()=>[]):[];
    let calendar_sync=[];try{calendar_sync=await syncBusinessCalendars(req,businessId)}catch(error){calendar_sync=[{ok:false,error:clean(error?.message,140)}]}
    return {status:200,body:{ok:true,transition:result,waitlist_matches:matches||[],calendar_sync}};
  }
  if(action==='move'||action==='resize'||action==='edit_appointment')return patchAppointment(req,ctx,businessId,body);
  if(action==='rebook'){
    const result=await rpc(ctx.token,'dabbir_salon_rebook',{p_business_id:businessId,p_appointment_id:safeId(body.appointment_id),p_starts_at:body.starts_at},'REBOOK_FAILED');
    let calendar_sync=[];try{calendar_sync=await syncBusinessCalendars(req,businessId)}catch(error){calendar_sync=[{ok:false,error:clean(error?.message,140)}]}
    return {status:201,body:{ok:true,booking:result,calendar_sync}};
  }
  if(action==='record_payment'){
    const appointmentId=safeId(body.appointment_id),method=clean(body.method,30);if(!appointmentId||!PAYMENT_METHODS.has(method))return {status:400,body:{ok:false,error:'VALID_PAYMENT_REQUIRED'}};
    const appointments=await rest(ctx.token,`dabbir_appointments?select=id,customer_id&business_id=eq.${enc(businessId)}&id=eq.${enc(appointmentId)}&limit=1`,{},'APPOINTMENT_LOOKUP_FAILED');if(!appointments?.[0])return {status:404,body:{ok:false,error:'APPOINTMENT_NOT_FOUND'}};
    const amount=method==='unpaid'?0:number(body.amount_aed,{min:0,max:1e7,fallback:-1});if(amount<0)return {status:400,body:{ok:false,error:'VALID_PAYMENT_AMOUNT_REQUIRED'}};
    const idempotency=clean(body.idempotency_key||`appointment:${appointmentId}:${method}:${amount}`,180);
    const rows=await rest(ctx.token,'dabbir_operational_payments?on_conflict=business_id,idempotency_key&select=id,appointment_id,customer_id,amount_aed,method,status,created_at',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({business_id:businessId,appointment_id:appointmentId,customer_id:appointments[0].customer_id,amount_aed:amount,method,status:method==='unpaid'?'unpaid':'paid',reference:clean(body.reference,240)||null,idempotency_key:idempotency,recorded_by:ctx.user.id})},'PAYMENT_RECORD_FAILED');
    return {status:201,body:{ok:true,payment:rows?.[0]||null}};
  }
  if(action==='save_worker'){
    if(!canManageTeam(membership))return {status:403,body:{ok:false,error:'TEAM_MANAGEMENT_REQUIRED'}};
    const workerId=safeId(body.worker_id),payload={business_id:businessId,display_name:clean(body.display_name,120),phone_e164:clean(body.phone_e164,30)||null,job_title:clean(body.job_title||'employee',120),commission_type:body.commission_type==='fixed'?'fixed':'percentage',commission_value:number(body.commission_value,{min:0,max:body.commission_type==='fixed'?1e7:100}),status:['active','inactive','suspended'].includes(body.status)?body.status:'active',updated_at:new Date().toISOString()};
    if(!payload.display_name)return {status:400,body:{ok:false,error:'WORKER_NAME_REQUIRED'}};
    const path=workerId?`dabbir_workers?business_id=eq.${enc(businessId)}&id=eq.${enc(workerId)}&select=*`:'dabbir_workers?select=*';const options=workerId?{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(payload)}:{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)};
    const rows=await rest(ctx.token,path,options,'WORKER_SAVE_FAILED');return {status:workerId?200:201,body:{ok:true,worker:rows?.[0]||null}};
  }
  if(action==='assign_worker_service'){
    if(!canManageTeam(membership))return {status:403,body:{ok:false,error:'TEAM_MANAGEMENT_REQUIRED'}};
    const workerId=safeId(body.worker_id),serviceId=safeId(body.service_id);if(!workerId||!serviceId)return {status:400,body:{ok:false,error:'WORKER_SERVICE_REQUIRED'}};
    const payload={business_id:businessId,worker_id:workerId,service_id:serviceId,duration_minutes:body.duration_minutes===null?null:number(body.duration_minutes,{min:5,max:1440,fallback:null}),price_aed:body.price_aed===null?null:number(body.price_aed,{min:0,max:1e7,fallback:null}),active:body.active!==false,updated_at:new Date().toISOString()};
    const rows=await rest(ctx.token,'dabbir_worker_services?on_conflict=worker_id,service_id&select=*',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)},'WORKER_SERVICE_SAVE_FAILED');return {status:200,body:{ok:true,worker_service:rows?.[0]||null}};
  }
  if(action==='save_schedule'){
    if(!canManageTeam(membership))return {status:403,body:{ok:false,error:'TEAM_MANAGEMENT_REQUIRED'}};
    const workerId=safeId(body.worker_id),rows=normalizeSchedule(body.rows);if(!workerId||!rows.length)return {status:400,body:{ok:false,error:'VALID_SCHEDULE_REQUIRED'}};
    const payload=rows.map(row=>({...row,business_id:businessId,worker_id:workerId,updated_at:new Date().toISOString()}));
    const saved=await rest(ctx.token,'dabbir_worker_schedules?on_conflict=business_id,worker_id,weekday,starts_at,ends_at,schedule_type&select=*',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)},'SCHEDULE_SAVE_FAILED');return {status:200,body:{ok:true,schedules:saved||[]}};
  }
  if(action==='save_service'){
    if(!canManageTeam(membership))return {status:403,body:{ok:false,error:'SERVICE_MANAGEMENT_REQUIRED'}};
    const serviceId=safeId(body.service_id),nameAr=clean(body.name_ar,120),nameEn=clean(body.name_en,120);if(!nameAr||!nameEn)return {status:400,body:{ok:false,error:'BILINGUAL_SERVICE_NAME_REQUIRED'}};
    const commissionType=['percentage','fixed'].includes(body.commission_type)?body.commission_type:null;
    const payload={business_id:businessId,name:nameAr,name_ar:nameAr,name_en:nameEn,category:clean(body.category||'general',80),price_aed:number(body.price_aed),duration_minutes:number(body.duration_minutes,{min:5,max:1440,fallback:30}),commission_type:commissionType,commission_value:commissionType?number(body.commission_value,{min:0,max:commissionType==='fixed'?1e7:100}):null,active:body.active!==false,updated_at:new Date().toISOString()};
    const path=serviceId?`dabbir_services?business_id=eq.${enc(businessId)}&id=eq.${enc(serviceId)}&select=*`:'dabbir_services?select=*';const options=serviceId?{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(payload)}:{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)};
    const rows=await rest(ctx.token,path,options,'SERVICE_SAVE_FAILED');return {status:serviceId?200:201,body:{ok:true,service:rows?.[0]||null}};
  }
  if(action==='save_waitlist'){
    const payload={business_id:businessId,customer_id:safeId(body.customer_id),service_id:safeId(body.service_id),preferred_worker_id:safeId(body.preferred_worker_id),desired_date:clean(body.desired_date,10),window_start:clean(body.window_start,8),window_end:clean(body.window_end,8),expires_at:body.expires_at,status:'waiting'};
    if(!payload.customer_id||!payload.service_id||!/^\d{4}-\d{2}-\d{2}$/.test(payload.desired_date))return {status:400,body:{ok:false,error:'VALID_WAITLIST_DETAILS_REQUIRED'}};
    const rows=await rest(ctx.token,'dabbir_waitlist_entries?select=*',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)},'WAITLIST_SAVE_FAILED');return {status:201,body:{ok:true,waitlist:rows?.[0]||null}};
  }
  if(action==='add_customer_note'){
    const customerId=safeId(body.customer_id),note=clean(body.note,2000);if(!customerId||!note)return {status:400,body:{ok:false,error:'CUSTOMER_NOTE_REQUIRED'}};
    const rows=await rest(ctx.token,'dabbir_customer_notes?select=*',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,customer_id:customerId,note,important:Boolean(body.important),created_by:ctx.user.id})},'CUSTOMER_NOTE_SAVE_FAILED');return {status:201,body:{ok:true,note:rows?.[0]||null}};
  }
  if(action==='save_reminder_settings'){
    if(!canManageTeam(membership))return {status:403,body:{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'}};
    const payload={business_id:businessId,reminder_on_booking:Boolean(body.reminder_on_booking),reminder_24h:Boolean(body.reminder_24h),reminder_2h:Boolean(body.reminder_2h),updated_at:new Date().toISOString()};
    const rows=await rest(ctx.token,'dabbir_salon_settings?on_conflict=business_id&select=*',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)},'REMINDER_SETTINGS_SAVE_FAILED');return {status:200,body:{ok:true,settings:rows?.[0]||null}};
  }
  return {status:400,body:{ok:false,error:'UNSUPPORTED_SALON_ACTION'}};
}

export default async function handler(req,res){
  const ctx=await context(req,res);if(!ctx)return;
  try{
    if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=req.method==='POST'?await readJsonBody(req):null;
    const businessId=safeId(req.method==='GET'?queryValue(req,'business_id'):body?.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    const membership=membershipFor(ctx,businessId);if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(req.method==='GET'){const result=await handleGet(req,ctx,businessId);return json(res,result.status,result.body)}
    body.business_id=businessId;
    const result=await handlePost(req,ctx,businessId,membership,body);return json(res,result.status,result.body);
  }catch(error){
    const message=clean(error?.message||'SALON_OPERATION_FAILED',160);const raw=Number(error?.status||500);const status=[400,401,403,404,409,413,429,500,502,503].includes(raw)?raw:(/CONFLICT|UNAVAILABLE|SCHEDULE|TRANSITION/.test(message)?409:500);
    console.error('dabbir_salon_operation_failed',{status,error:message});return json(res,status,{ok:false,error:message});
  }
}
