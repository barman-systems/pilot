import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { branchWrite, resolveBranchScope } from './_branch-scope.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);

async function readData(response,fallback='DATA_REQUEST_FAILED'){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=Number(response.status||500);
    error.detail=payload?.code||payload?.message||null;
    throw error;
  }
  return payload;
}

const rest=async(token,path,options={},fallback)=>readData(await supabaseRest(path,token,options),fallback);

async function context(req){
  const token=accessTokenFromRequest(req);
  if(!token)return null;
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return null;
  return {token,user,memberships:Array.isArray(memberships)?memberships:[]};
}

function membershipFor(ctx,businessId){
  return ctx.memberships.find(row=>row.business_id===businessId&&row.status==='active')||null;
}

function persisted(rows,code){
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row?.id)throw Object.assign(new Error(code),{status:502});
  return row;
}

async function selectedScope(ctx,body){
  const businessId=safeId(body?.business_id);
  if(!businessId)throw Object.assign(new Error('BUSINESS_ID_REQUIRED'),{status:400});
  const membership=membershipFor(ctx,businessId);
  if(!membership)throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'),{status:403});
  const scope=await resolveBranchScope({
    businessId,
    membership,
    userId:ctx.user.id,
    requestedBranch:body?.branch_id,
    fetchRows:(path,code)=>rest(ctx.token,path,{},code),
  });
  return {businessId,branchId:branchWrite(scope),scope};
}

async function createCustomer(ctx,businessId,name,source){
  const rows=await rest(ctx.token,'dabbir_customers?select=id,display_name,lead_status,created_at',{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      display_name:clean(name||'Customer',120)||'Customer',
      lead_status:'new',
      metadata:{source},
    }),
  },'CUSTOMER_CREATE_FAILED');
  return persisted(rows,'CUSTOMER_CREATE_UNVERIFIED');
}

async function startConversation(ctx,body){
  const {businessId,branchId}=await selectedScope(ctx,body);
  const customer=await createCustomer(ctx,businessId,body?.display_name||'Web Customer','dabbir_branch_web_runtime');
  const rows=await rest(ctx.token,'dabbir_conversations?select=id,business_id,branch_id,customer_id,channel_type,state,demo_mode,created_at,updated_at',{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      branch_id:branchId,
      customer_id:customer.id,
      channel_type:'web',
      state:'ai_active',
      demo_mode:false,
    }),
  },'CONVERSATION_CREATE_FAILED');
  const conversation=persisted(rows,'CONVERSATION_CREATE_UNVERIFIED');
  if(conversation.branch_id!==branchId)throw Object.assign(new Error('CONVERSATION_BRANCH_UNVERIFIED'),{status:502});
  return {
    ok:true,
    action:'start_conversation',
    state:'VERIFIED_PERSISTED',
    customer,
    conversation,
    channel:'web',
    branch_id:branchId,
    verified_persisted:true,
    truth:{state:'VERIFIED',source:'SUPABASE_RETURN_REPRESENTATION',branch_id:branchId,entity_id:conversation.id,verified_at:new Date().toISOString()},
    external_side_effects:false,
  };
}

async function createAppointment(ctx,body){
  const {businessId,branchId}=await selectedScope(ctx,body);
  let customerId=safeId(body?.customer_id);
  const startsAt=new Date(String(body?.starts_at||''));
  if(Number.isNaN(startsAt.getTime()))throw Object.assign(new Error('VALID_START_TIME_REQUIRED'),{status:400});
  if(!customerId){
    const customer=await createCustomer(ctx,businessId,body?.customer_name||'Customer','dabbir_branch_appointment_runtime');
    customerId=customer.id;
  }
  const rows=await rest(ctx.token,'dabbir_appointments?select=id,business_id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,created_at,updated_at',{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      branch_id:branchId,
      customer_id:customerId,
      service_id:safeId(body?.service_id),
      starts_at:startsAt.toISOString(),
      status:'requested',
      simulated:false,
    }),
  },'APPOINTMENT_CREATE_FAILED');
  const appointment=persisted(rows,'APPOINTMENT_PERSISTENCE_UNVERIFIED');
  if(appointment.branch_id!==branchId)throw Object.assign(new Error('APPOINTMENT_BRANCH_UNVERIFIED'),{status:502});
  return {
    ok:true,
    action:'create_appointment',
    state:'VERIFIED_PERSISTED',
    appointment,
    branch_id:branchId,
    verified_persisted:true,
    truth:{state:'VERIFIED',source:'SUPABASE_RETURN_REPRESENTATION',branch_id:branchId,entity_id:appointment.id,verified_at:new Date().toISOString()},
    external_side_effects:false,
  };
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const ctx=await context(req);
  if(!ctx)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  try{
    const body=await readJsonBody(req);
    const action=clean(body?.action,60);
    let result;
    if(action==='start_conversation')result=await startConversation(ctx,body);
    else if(action==='create_appointment')result=await createAppointment(ctx,body);
    else return json(res,400,{ok:false,error:'UNSUPPORTED_BRANCH_ACTION'});
    res.setHeader('x-dabbir-branch-write','verified');
    return json(res,200,result);
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503].includes(status)?status:500;
    return json(res,safe,{ok:false,error:String(error?.message||'BRANCH_OPERATION_FAILED'),detail:error?.detail||null});
  }
}
