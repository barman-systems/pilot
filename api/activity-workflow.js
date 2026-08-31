import { singleQueryValue } from './_request-query.js';
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
const WORKFLOW_STATES=new Set([
  'new','confirmed','preparing','ready','received','washing','inspection',
  'waiting_approval','waiting_parts','in_progress','delivered','completed','cancelled',
]);

const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const money=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(10000000,Number(value))):0;

async function parse(response,fallback){
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=data?.message||data?.code||null;
    throw error;
  }
  return data;
}

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

function membershipFor(rows,businessId){return rows.find(row=>row.business_id===businessId)||null}
function canOperate(membership){
  const role=String(membership?.role||'').toLowerCase();
  return ['owner','admin','manager','employee','staff'].includes(role);
}

async function readOrders(token,businessId){
  const [orders,customers]=await Promise.all([
    supabaseRest(
      `dabbir_orders?select=id,customer_id,status,workflow_status,total_aed,paid_aed,note,public_status_token,created_at,workflow_updated_at&business_id=eq.${businessId}&simulated=eq.false&order=workflow_updated_at.desc,created_at.desc&limit=100`,
      token,
    ).then(r=>parse(r,'WORKFLOW_ORDERS_READ_FAILED')),
    supabaseRest(
      `dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=300`,
      token,
    ).then(r=>parse(r,'WORKFLOW_CUSTOMERS_READ_FAILED')),
  ]);
  const names=new Map((customers||[]).map(row=>[row.id,row.display_name||null]));
  return (orders||[]).map(order=>({...order,customer_name:names.get(order.customer_id)||null}));
}

async function findOrCreateCustomer(ctx,businessId,displayName,phone){
  if(phone){
    const existingRows=await supabaseRest(
      `dabbir_customers?select=id,display_name,channel_handle&business_id=eq.${businessId}&channel_handle=eq.${encodeURIComponent(phone)}&limit=1`,
      ctx.token,
    ).then(r=>parse(r,'WORKFLOW_CUSTOMER_LOOKUP_FAILED'));
    const existing=Array.isArray(existingRows)?existingRows[0]:null;
    if(existing?.id)return existing;
  }

  const customerRows=await supabaseRest('dabbir_customers?select=id,display_name,channel_handle,created_at',ctx.token,{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      display_name:displayName,
      channel_handle:phone||null,
      lead_status:'new',
      metadata:{source:'dabbir_quick_order'},
    }),
  }).then(r=>parse(r,'WORKFLOW_CUSTOMER_CREATE_FAILED'));
  const customer=Array.isArray(customerRows)?customerRows[0]:null;
  if(!customer?.id)throw Object.assign(new Error('WORKFLOW_CUSTOMER_CREATE_UNVERIFIED'),{status:502});
  return customer;
}

async function createOrder(ctx,businessId,body){
  const displayName=clean(body.display_name,120)||'عميل';
  const phone=clean(body.phone,40);
  const note=clean(body.note,240);
  const totalAed=money(body.total_aed);
  const requestedState=clean(body.workflow_status,40).toLowerCase();
  const workflowStatus=WORKFLOW_STATES.has(requestedState)?requestedState:'new';

  const customer=await findOrCreateCustomer(ctx,businessId,displayName,phone);
  const now=new Date().toISOString();
  const orderRows=await supabaseRest('dabbir_orders?select=id,customer_id,status,workflow_status,total_aed,paid_aed,note,public_status_token,created_at,workflow_updated_at',ctx.token,{
    method:'POST',
    headers:{prefer:'return=representation'},
    body:JSON.stringify({
      business_id:businessId,
      customer_id:customer.id,
      status:'draft',
      workflow_status:workflowStatus,
      workflow_updated_at:now,
      total_aed:totalAed,
      paid_aed:0,
      payment_method:'cash',
      note,
      simulated:false,
    }),
  }).then(r=>parse(r,'WORKFLOW_ORDER_CREATE_FAILED'));
  const order=Array.isArray(orderRows)?orderRows[0]:null;
  if(!order?.id)throw Object.assign(new Error('WORKFLOW_ORDER_CREATE_UNVERIFIED'),{status:502});
  return {...order,customer_name:customer.display_name};
}

async function updateWorkflow(ctx,businessId,body){
  const orderId=safeId(body.order_id);
  const workflowStatus=clean(body.workflow_status,40).toLowerCase();
  if(!orderId||!WORKFLOW_STATES.has(workflowStatus))throw Object.assign(new Error('INVALID_WORKFLOW_UPDATE'),{status:400});
  const rows=await supabaseRest(
    `dabbir_orders?select=id,customer_id,status,workflow_status,total_aed,paid_aed,note,public_status_token,created_at,workflow_updated_at&business_id=eq.${businessId}&id=eq.${orderId}&simulated=eq.false`,
    ctx.token,
    {
      method:'PATCH',
      headers:{prefer:'return=representation'},
      body:JSON.stringify({workflow_status:workflowStatus,workflow_updated_at:new Date().toISOString()}),
    },
  ).then(r=>parse(r,'WORKFLOW_ORDER_UPDATE_FAILED'));
  const order=Array.isArray(rows)?rows[0]:null;
  if(!order?.id)throw Object.assign(new Error('WORKFLOW_ORDER_NOT_FOUND'),{status:404});
  return order;
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const ctx=await context(req,res);
  if(!ctx)return;
  try{
    const body=req.method==='POST'?await readJsonBody(req):null;
    const businessId=safeId(req.method==='GET'?singleQueryValue(req,'business_id'):body?.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    const membership=membershipFor(ctx.memberships,businessId);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    if(req.method==='GET'){
      const orders=await readOrders(ctx.token,businessId);
      return json(res,200,{ok:true,business_id:businessId,can_operate:canOperate(membership),orders});
    }

    if(!canOperate(membership))return json(res,403,{ok:false,error:'WORKFLOW_OPERATION_REQUIRED'});
    const action=clean(body?.action,40);
    if(action==='create_order'){
      const order=await createOrder(ctx,businessId,body||{});
      return json(res,201,{ok:true,business_id:businessId,order});
    }
    if(action==='update_workflow'){
      const order=await updateWorkflow(ctx,businessId,body||{});
      return json(res,200,{ok:true,business_id:businessId,order});
    }
    return json(res,400,{ok:false,error:'UNSUPPORTED_ACTION'});
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413].includes(status)?status:500;
    console.error('dabbir_activity_workflow_failed',{status:safe,error:String(error?.message||'WORKFLOW_FAILED').slice(0,160)});
    return json(res,safe,{ok:false,error:String(error?.message||'WORKFLOW_FAILED').slice(0,160),detail:error?.detail||undefined});
  }
}
