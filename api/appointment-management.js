import { singleQueryValue } from './_request-query.js';
import { branchFilter, resolveBranchScope } from './_branch-scope.js';
import { bookingQuery } from './_booking-query.js';
import { appointmentTimeWindow } from './_appointment-time-window.js';
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
const ALLOWED_STATUS=new Set(['requested','new','confirmed','rescheduled','arrived','in_progress','completed','cancelled','no_show']);

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

const rest=(token,path,options={},fallback='APPOINTMENT_REQUEST_FAILED')=>
  supabaseRest(path,token,options).then(response=>readData(response,fallback));

async function context(req,res){
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
  return memberships.find(m=>m.business_id===businessId)||null;
}

async function appointmentFor(token,businessId,appointmentId){
  const rows=await rest(
    token,
    `dabbir_appointments?select=id,business_id,branch_id,worker_id,customer_id,service_id,starts_at,ends_at,status,simulated,created_at,updated_at&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(appointmentId)}&limit=1`,
    {},
    'APPOINTMENT_LOOKUP_FAILED',
  );
  return rows?.[0]||null;
}

function validStart(value){
  const date=new Date(String(value||''));
  if(Number.isNaN(date.getTime()))return null;
  return date;
}
function durationMs(appointment){
  const start=new Date(appointment?.starts_at||0).getTime(),end=new Date(appointment?.ends_at||0).getTime();
  const duration=end-start;
  return Number.isFinite(duration)&&duration>=5*60000&&duration<=24*60*60000?duration:60*60000;
}
const calendarOutboxTruth=()=>({mode:'durable_outbox',business_truth_committed_first:true,external_sync_async:true});

async function updateAppointment(req,ctx,body,businessId,appointmentId){
  const current=await appointmentFor(ctx.token,businessId,appointmentId);
  if(!current)return {status:404,body:{ok:false,error:'APPOINTMENT_NOT_FOUND'}};

  if(body.branch_id!==undefined&&(!safeId(body.branch_id)||body.branch_id!==current.branch_id))return {status:403,body:{ok:false,error:'APPOINTMENT_BRANCH_MISMATCH'}};
  const patch={};
  if(body.starts_at!==undefined){
    const start=validStart(body.starts_at);
    if(start===null)return {status:400,body:{ok:false,error:'VALID_START_TIME_REQUIRED'}};
    const currentStart=validStart(current.starts_at);
    if(!currentStart||start.getTime()!==currentStart.getTime()){
      Object.assign(patch,appointmentTimeWindow(start,durationMs(current)));
    }
  }
  if(body.status!==undefined){
    const status=String(body.status||'').trim().toLowerCase();
    if(!ALLOWED_STATUS.has(status))return {status:400,body:{ok:false,error:'INVALID_APPOINTMENT_STATUS'}};
    if(status!==String(current.status||'').trim().toLowerCase())patch.status=status;
  }
  if(!Object.keys(patch).length){
    return {
      status:200,
      body:{
        ok:true,
        action:'update',
        state:'NO_CHANGE',
        appointment:current,
        calendar_sync:calendarOutboxTruth(),
        truth:{state:'VERIFIED',source:'SUPABASE_READ',entity:'appointment',entity_id:current.id,verified_at:new Date().toISOString()},
      },
    };
  }

  const rows=await rest(
    ctx.token,
    `dabbir_appointments?business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(appointmentId)}&select=id,business_id,branch_id,worker_id,customer_id,service_id,starts_at,ends_at,status,simulated,created_at,updated_at`,
    {
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify(patch),
    },
    'APPOINTMENT_UPDATE_FAILED',
  );
  const updated=rows?.[0]||null;
  if(!updated)return {status:403,body:{ok:false,error:'APPOINTMENT_MANAGEMENT_REQUIRED'}};

  return {
    status:200,
    body:{
      ok:true,
      action:'update',
      state:'VERIFIED_PERSISTED',
      appointment:updated,
      calendar_sync:calendarOutboxTruth(),
      truth:{state:'VERIFIED',source:'SUPABASE_RETURN_REPRESENTATION',entity:'appointment',entity_id:updated.id,verified_at:new Date().toISOString()},
    },
  };
}

async function deleteAppointment(req,ctx,businessId,appointmentId,body){
  const current=await appointmentFor(ctx.token,businessId,appointmentId);
  if(!current)return {status:404,body:{ok:false,error:'APPOINTMENT_NOT_FOUND'}};

  if(body.branch_id!==undefined&&(!safeId(body.branch_id)||body.branch_id!==current.branch_id))return {status:403,body:{ok:false,error:'APPOINTMENT_BRANCH_MISMATCH'}};

  // "Delete" is intentionally a cancellation. Operational history is retained and
  // the database trigger queues Google/Outlook reconciliation independently.
  let row=current;
  if(String(current.status||'').toLowerCase()!=='cancelled'){
    const cancelled=await rest(
      ctx.token,
      `dabbir_appointments?business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(appointmentId)}&select=id,business_id,branch_id,worker_id,customer_id,service_id,starts_at,ends_at,status,simulated,created_at,updated_at`,
      {method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({status:'cancelled'})},
      'APPOINTMENT_CANCEL_FAILED',
    );
    row=cancelled?.[0]||null;
    if(!row)return {status:403,body:{ok:false,error:'APPOINTMENT_MANAGEMENT_REQUIRED'}};
  }

  return {
    status:200,
    body:{
      ok:true,
      action:'delete',
      state:'VERIFIED_CANCELLED',
      appointment_id:appointmentId,
      appointment:row,
      retained_history:true,
      calendar_sync:calendarOutboxTruth(),
      truth:{state:'VERIFIED',source:'SUPABASE_RETURN_REPRESENTATION',entity:'appointment',entity_id:appointmentId,cancelled:true,hard_deleted:false,verified_at:new Date().toISOString()},
    },
  };
}

async function listAppointments(req,ctx){
  const businessId=safeId(singleQueryValue(req,'business_id'));
  if(!businessId)throw Object.assign(new Error('BUSINESS_ID_REQUIRED'),{status:400});
  const membership=membershipFor(ctx.memberships,businessId);
  if(!membership)throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'),{status:403});
  const recordValues=new URL(String(req?.url||'/'),'https://dabbir.invalid').searchParams.getAll('appointment_id');
  const appointmentId=recordValues.length===1?safeId(recordValues[0]):null;
  if(recordValues.length&&!appointmentId)throw Object.assign(new Error('INVALID_APPOINTMENT_ID'),{status:400});
  const scope=await resolveBranchScope({businessId,membership,userId:ctx.user.id,requestedBranch:singleQueryValue(req,'branch_id'),fetchRows:(path,code)=>rest(ctx.token,path,{},code)});
  const business=(await rest(ctx.token,'dabbir_businesses?select=id,timezone,country_code,locale&id=eq.'+encodeURIComponent(businessId)+'&limit=1'))?.[0];
  if(!business)throw Object.assign(new Error('BUSINESS_NOT_FOUND'),{status:404});
  const offsetText=singleQueryValue(req,'offset')||'0';
  if(!/^\d{1,7}$/.test(offsetText))throw Object.assign(new Error('INVALID_BOOKING_OFFSET'),{status:400});
  const offset=Number(offsetText),limit=appointmentId?1:50,now=Date.now(),view=singleQueryValue(req,'scope')||'current';
  if(appointmentId&&offset!==0)throw Object.assign(new Error('INVALID_BOOKING_OFFSET'),{status:400});
  const filter=bookingQuery({business,scope:view,from:singleQueryValue(req,'from'),to:singleQueryValue(req,'to'),now});
  const fields='id,business_id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,created_at,updated_at,quoted_price_aed,discount_aed,payment_status,notes,booking_source';
  const recordFilter=appointmentId?'&id=eq.'+encodeURIComponent(appointmentId):'';
  const path='dabbir_appointments?select='+fields+'&business_id=eq.'+encodeURIComponent(businessId)+branchFilter(scope)+recordFilter+'&'+filter+'&order=starts_at.'+(view==='current'?'asc':'desc')+'.nullslast,id.asc&limit='+limit+'&offset='+offset;
  const response=await supabaseRest(path,ctx.token,{headers:{prefer:'count=exact'}});
  const contentRange=response.headers.get('content-range')||'';
  const appointments=await readData(response,'APPOINTMENTS_LOOKUP_FAILED');
  if(!Array.isArray(appointments))throw Object.assign(new Error('APPOINTMENTS_LOOKUP_FAILED'),{status:502});
  if(appointmentId){
    if(!appointments.length)throw Object.assign(new Error('APPOINTMENT_NOT_FOUND'),{status:404});
    const row=appointments[0];
    if(appointments.length!==1||row?.id!==appointmentId||row.business_id!==businessId||(scope.mode==='selected'&&row.branch_id!==scope.branch_id))throw Object.assign(new Error('BOOKING_CONTEXT_MISMATCH'),{status:502});
  }
  const countPart=contentRange.split('/')[1],total=/^\d+$/.test(countPart||'')?Number(countPart):null;
  const customerIds=[...new Set(appointments.map(row=>safeId(row.customer_id)).filter(Boolean))];
  const customers=customerIds.length?await rest(ctx.token,'dabbir_customers?select=id,display_name&business_id=eq.'+encodeURIComponent(businessId)+'&id=in.('+customerIds.join(',')+')'):[];
  if(appointmentId)return {ok:true,business_id:businessId,branch_id:scope.branch_id,scope:view,appointment:appointments[0],customers,evaluated_at:new Date(now).toISOString()};
  return {ok:true,business_id:businessId,branch_id:scope.branch_id,scope:view,appointments,customers,total,next_offset:offset+appointments.length,has_more:total===null?appointments.length===limit:offset+appointments.length<total,evaluated_at:new Date(now).toISOString()};
}

export default async function handler(req,res){
  const ctx=await context(req,res);if(!ctx)return;
  try{
    if(req.method==='GET')return json(res,200,await listAppointments(req,ctx));
    if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id),appointmentId=safeId(body.appointment_id);
    if(!businessId||!appointmentId)return json(res,400,{ok:false,error:'APPOINTMENT_ID_REQUIRED'});
    if(!membershipFor(ctx.memberships,businessId))return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    const action=String(body.action||'').trim().toLowerCase();
    let result;
    if(action==='update')result=await updateAppointment(req,ctx,body,businessId,appointmentId);
    else if(action==='delete')result=await deleteAppointment(req,ctx,businessId,appointmentId,body);
    else return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
    return json(res,result.status,result.body);
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,500,502,503].includes(status)?status:500;
    console.error('dabbir_appointment_management_failed',{error:String(error?.message||'APPOINTMENT_MANAGEMENT_FAILED').slice(0,160),status:safe,detail:error?.detail||null});
    return json(res,safe,{ok:false,error:String(error?.message||'APPOINTMENT_MANAGEMENT_FAILED').slice(0,160),detail:error?.detail||undefined});
  }
}
