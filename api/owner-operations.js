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

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;

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

const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));
const rpc=(token,name,params,fallback)=>supabaseRpc(name,token,params).then(r=>readData(r,fallback));

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

async function handleGet(req,res,context){
  const requested=safeId(req.query?.business_id);
  const membership=membershipFor(context.memberships,requested);
  if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const businessId=membership.business_id;

  const [products,inventory,orders,customers]=await Promise.all([
    rest(context.token,`dabbir_products?select=id,sku,name,price_aed,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,'PRODUCTS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=200`,'INVENTORY_LOOKUP_FAILED'),
    rest(context.token,`dabbir_orders?select=id,customer_id,status,total_aed,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,'ORDERS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
  ]);

  const inventoryByProduct=new Map((inventory||[]).map(row=>[row.product_id,row]));
  const customerById=new Map((customers||[]).map(row=>[row.id,row.display_name]));
  const productRows=(products||[]).map(product=>{
    const stock=inventoryByProduct.get(product.id)||{quantity:0,reserved:0,updated_at:null};
    const quantity=number(stock.quantity);
    const reserved=number(stock.reserved);
    const available=Math.max(0,quantity-reserved);
    return {...product,quantity,reserved,available,low_stock:Boolean(product.active)&&available<=5,inventory_updated_at:stock.updated_at||null};
  });

  const realOrders=(orders||[]).filter(order=>order.simulated===false);
  const recognizedOrders=realOrders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase()));
  const orderRows=(orders||[]).map(order=>({...order,customer_name:customerById.get(order.customer_id)||null}));

  return json(res,200,{
    ok:true,
    business_id:businessId,
    role:membership.role,
    can_manage:['owner','admin'].includes(String(membership.role||'').toLowerCase()),
    metrics:{
      active_products:productRows.filter(product=>product.active).length,
      inventory_units:productRows.reduce((sum,product)=>sum+product.quantity,0),
      available_units:productRows.reduce((sum,product)=>sum+product.available,0),
      low_stock_products:productRows.filter(product=>product.low_stock).length,
      real_orders:realOrders.length,
      recognized_sales_aed:Number(recognizedOrders.reduce((sum,order)=>sum+number(order.total_aed),0).toFixed(2)),
      simulated_orders:(orders||[]).filter(order=>order.simulated!==false).length,
    },
    products:productRows,
    orders:orderRows,
    low_stock:productRows.filter(product=>product.low_stock),
    truth:{recognized_sales_statuses:['confirmed','completed'],simulated_orders_excluded_from_sales:true},
  });
}

async function handlePost(req,res,context){
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=await readJsonBody(req);
  const businessId=safeId(body.business_id);
  const membership=membershipFor(context.memberships,businessId);
  if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  if(!['owner','admin'].includes(String(membership.role||'').toLowerCase()))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});

  const action=clean(body.action,40);
  let result=null;
  if(action==='create_product'){
    const sku=clean(body.sku,80);
    const name=clean(body.name,160);
    const price=number(body.price_aed);
    const quantity=Math.trunc(number(body.quantity));
    if(!sku||!name||price<0||quantity<0)return json(res,400,{ok:false,error:'INVALID_PRODUCT_INPUT'});
    result=await rpc(context.token,'dabbir_owner_create_product',{p_business_id:businessId,p_sku:sku,p_name:name,p_price_aed:price,p_quantity:quantity},'PRODUCT_CREATE_FAILED');
  }else if(action==='set_inventory'){
    const productId=safeId(body.product_id);
    const quantity=Math.trunc(number(body.quantity));
    if(!productId||quantity<0)return json(res,400,{ok:false,error:'INVALID_INVENTORY_INPUT'});
    result=await rpc(context.token,'dabbir_owner_set_inventory',{p_business_id:businessId,p_product_id:productId,p_quantity:quantity},'INVENTORY_UPDATE_FAILED');
  }else if(action==='update_order_status'){
    const orderId=safeId(body.order_id);
    const status=clean(body.status,20).toLowerCase();
    if(!orderId||!['draft','reserved','confirmed','cancelled','completed'].includes(status))return json(res,400,{ok:false,error:'INVALID_ORDER_STATUS'});
    result=await rpc(context.token,'dabbir_owner_update_order_status',{p_business_id:businessId,p_order_id:orderId,p_status:status},'ORDER_STATUS_UPDATE_FAILED');
  }else{
    return json(res,400,{ok:false,error:'UNSUPPORTED_OWNER_OPERATION'});
  }

  return json(res,200,{ok:true,action,result});
}

export default async function handler(req,res){
  const context=await authenticatedContext(req,res);
  if(!context)return;
  try{
    if(req.method==='GET')return await handleGet(req,res,context);
    if(req.method==='POST')return await handlePost(req,res,context);
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503].includes(status)?status:500;
    console.error('dabbir_owner_operations_failed',{error:String(error?.message||'OWNER_OPERATIONS_FAILED').slice(0,120),status:safe});
    return json(res,safe,{ok:false,error:String(error?.message||'OWNER_OPERATIONS_FAILED').slice(0,120),detail:error?.detail||undefined});
  }
}
