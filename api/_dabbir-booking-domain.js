import { supabaseRest } from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);

function failure(code,status=502,detail=null){
  return Object.assign(new Error(code),{status,detail});
}

async function readRows(token,path,options={},failureCode='DATA_REQUEST_FAILED',unverifiedCode=failureCode){
  let response;
  let text='';
  let payload=null;
  try{
    response=await supabaseRest(path,token,options);
    text=await response.text();
  }catch{
    throw failure(unverifiedCode);
  }
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    throw failure(failureCode,Number(response.status||500),payload?.code||payload?.message||null);
  }
  if(!Array.isArray(payload))throw failure(unverifiedCode);
  return payload;
}

function persisted(rows,code){
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row?.id)throw failure(code);
  return row;
}

/**
 * Canonical domain boundary for a requested appointment persistence operation.
 *
 * Authorization deliberately stays OUTSIDE this module. The caller must resolve
 * the actor's business/branch scope first; RLS and the existing appointment
 * triggers remain the database-side security/integrity boundary. This function
 * owns only the shared mutation semantics and persisted-result verification.
 */
export async function createRequestedBooking({
  token,
  businessId,
  branchId=null,
  customerId=null,
  customerName='Customer',
  serviceId=null,
  startsAt,
  customerSource='dabbir_booking_domain',
}={}){
  const business=safeId(businessId);
  if(!business)throw failure('BUSINESS_ID_REQUIRED',400);

  const explicitBranch=branchId===null||branchId===undefined||branchId===''?null:safeId(branchId);
  if(branchId!==null&&branchId!==undefined&&branchId!==''&&!explicitBranch)throw failure('INVALID_BRANCH_ID',400);

  let customer=safeId(customerId);
  if(customerId!==null&&customerId!==undefined&&customerId!==''&&!customer)throw failure('CUSTOMER_ID_INVALID',400);

  const start=startsAt instanceof Date?startsAt:new Date(String(startsAt||''));
  if(Number.isNaN(start.getTime()))throw failure('VALID_START_TIME_REQUIRED',400);

  let createdCustomer=null;
  if(!customer){
    const customers=await readRows(token,'dabbir_customers?select=id,business_id,display_name,lead_status,created_at',{
      method:'POST',
      headers:{prefer:'return=representation'},
      body:JSON.stringify({
        business_id:business,
        display_name:clean(customerName||'Customer',120)||'Customer',
        lead_status:'new',
        metadata:{source:clean(customerSource,80)||'dabbir_booking_domain'},
      }),
    },'CUSTOMER_CREATE_FAILED','CUSTOMER_CREATE_UNVERIFIED');
    createdCustomer=persisted(customers,'CUSTOMER_CREATE_UNVERIFIED');
    if(createdCustomer.business_id!==business)throw failure('CUSTOMER_SCOPE_UNVERIFIED');
    customer=createdCustomer.id;
  }

  const row={
    business_id:business,
    customer_id:customer,
    service_id:safeId(serviceId),
    starts_at:start.toISOString(),
    status:'requested',
    simulated:false,
  };
  if(explicitBranch)row.branch_id=explicitBranch;

  const appointments=await readRows(token,'dabbir_appointments?select=id,business_id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,created_at,updated_at',{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify(row),
  },'APPOINTMENT_CREATE_FAILED','APPOINTMENT_PERSISTENCE_UNVERIFIED');
  const appointment=persisted(appointments,'APPOINTMENT_PERSISTENCE_UNVERIFIED');

  if(appointment.business_id!==business||appointment.customer_id!==customer){
    throw failure('APPOINTMENT_SCOPE_UNVERIFIED');
  }
  if(explicitBranch&&appointment.branch_id!==explicitBranch){
    throw failure('APPOINTMENT_BRANCH_UNVERIFIED');
  }

  return {
    customer:createdCustomer,
    customer_id:customer,
    appointment,
  };
}
