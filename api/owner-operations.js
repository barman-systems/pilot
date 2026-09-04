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
import { assertSnapshotCurrency, marketDateKey, verifiedBusinessMarket } from './_gcc-money-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);

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
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));
const rpc=(token,name,params,fallback)=>supabaseRpc(name,token,params).then(r=>readData(r,fallback));
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

function membershipHasPermission(membership,permission){
  if(!membership)return false;
  const role=String(membership.role||'').toLowerCase();
  const explicit=Array.isArray(membership.permissions)?membership.permissions:[];
  if(explicit.length>0)return explicit.includes(permission);
  if(permission==='manage_store_operations')return ['owner','admin','manager','employee','staff'].includes(role);
  return ['owner','admin'].includes(role) && permission==='manage_business';
}

function roundMoney(value,market){
  const digits=Number.isInteger(market?.currency_minor_units)?market.currency_minor_units:2;
  return Number(number(value).toFixed(digits));
}

function moneyInput(body,market,neutralKey,legacyAedKey){
  if(has(body,neutralKey))return number(body[neutralKey]);
  if(has(body,legacyAedKey)){
    if(market.currency_code!=='AED')throw Object.assign(new Error('LEGACY_AED_INPUT_NOT_ALLOWED'),{status:409});
    return number(body[legacyAedKey]);
  }
  return NaN;
}

function withAedCompatibility(row,market,map){
  if(market.currency_code!=='AED')return row;
  const aliases={};
  for(const [legacy,neutral] of Object.entries(map))aliases[legacy]=row[neutral];
  return {...row,...aliases};
}

async function loadBusinessMarket(token,businessId){
  const rows=await rest(token,`dabbir_businesses?select=id,country_code,currency_code,timezone&id=eq.${businessId}&limit=1`,'BUSINESS_MARKET_LOOKUP_FAILED');
  const business=rows?.[0]||null;
  if(!business)throw Object.assign(new Error('BUSINESS_MARKET_NOT_FOUND'),{status:404});
  return {business,market:verifiedBusinessMarket(business)};
}

async function handleGet(req,res,context){
  const requested=safeId(singleQueryValue(req,'business_id'));
  const membership=membershipFor(context.memberships,requested);
  if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const businessId=membership.business_id;
  const canOperate=membershipHasPermission(membership,'manage_store_operations');
  const {market}=await loadBusinessMarket(context.token,businessId);

  const [products,inventory,orders,orderItems,movements,customers,services,expenses,returns]=await Promise.all([
    rest(context.token,`dabbir_products?select=id,sku,name,price_amount,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,'PRODUCTS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=200`,'INVENTORY_LOOKUP_FAILED'),
    rest(context.token,`dabbir_orders?select=id,customer_id,status,total_amount,paid_amount,currency_code,payment_method,note,completed_at,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,'ORDERS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_order_items?select=id,order_id,product_id,product_name,sku,unit_price_amount,quantity,line_total_amount,created_at&business_id=eq.${businessId}&order=created_at.asc&limit=500`,'ORDER_ITEMS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_inventory_movements?select=id,product_id,order_id,movement_type,quantity_delta,quantity_after,reference_note,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,'INVENTORY_MOVEMENTS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
    rest(context.token,`dabbir_services?select=id,name,duration_minutes,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,'SERVICES_LOOKUP_FAILED'),
    rest(context.token,`dabbir_expenses?select=id,amount,currency_code,category,note,occurred_on,created_at&business_id=eq.${businessId}&order=occurred_on.desc,created_at.desc&limit=100`,'EXPENSES_LOOKUP_FAILED'),
    rest(context.token,`dabbir_order_returns?select=id,order_id,order_item_id,product_id,quantity,refund_amount,currency_code,reason,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=500`,'RETURNS_LOOKUP_FAILED'),
  ]);

  for(const order of orders||[])assertSnapshotCurrency(order.currency_code,market,'ORDER');
  for(const expense of expenses||[])assertSnapshotCurrency(expense.currency_code,market,'EXPENSE');
  for(const returned of returns||[])assertSnapshotCurrency(returned.currency_code,market,'RETURN');

  const inventoryByProduct=new Map((inventory||[]).map(row=>[row.product_id,row]));
  const customerById=new Map((customers||[]).map(row=>[row.id,row.display_name]));
  const productRows=(products||[]).map(product=>{
    const stock=inventoryByProduct.get(product.id)||{quantity:0,reserved:0,updated_at:null};
    const quantity=number(stock.quantity);
    const reserved=number(stock.reserved);
    const available=Math.max(0,quantity-reserved);
    const neutral={...product,price_amount:roundMoney(product.price_amount,market),quantity,reserved,available,low_stock:Boolean(product.active)&&available<=5,inventory_updated_at:stock.updated_at||null};
    return withAedCompatibility(neutral,market,{price_aed:'price_amount'});
  });
  const serviceRows=(services||[]).map(service=>({...service,duration_minutes:Math.max(1,Math.trunc(number(service.duration_minutes)||1))}));
  const expenseRows=(expenses||[]).map(expense=>withAedCompatibility({...expense,amount:roundMoney(expense.amount,market)},market,{amount_aed:'amount'}));
  const today=marketDateKey(new Date(),market);

  const returnedByItem=new Map();
  const returnedByOrder=new Map();
  for(const returned of returns||[]){
    const quantity=Math.trunc(number(returned.quantity));
    returnedByItem.set(returned.order_item_id,(returnedByItem.get(returned.order_item_id)||0)+quantity);
    returnedByOrder.set(returned.order_id,roundMoney((returnedByOrder.get(returned.order_id)||0)+number(returned.refund_amount),market));
  }
  const itemsByOrder=new Map();
  for(const item of orderItems||[]){
    const current=itemsByOrder.get(item.order_id)||[];
    const neutral={...item,unit_price_amount:roundMoney(item.unit_price_amount,market),line_total_amount:roundMoney(item.line_total_amount,market),returned_quantity:returnedByItem.get(item.id)||0};
    current.push(withAedCompatibility(neutral,market,{unit_price_aed:'unit_price_amount',line_total_aed:'line_total_amount'}));
    itemsByOrder.set(item.order_id,current);
  }
  const movementRows=(movements||[]).map(movement=>({...movement,quantity_delta:Math.trunc(number(movement.quantity_delta)),quantity_after:Math.trunc(number(movement.quantity_after))}));
  const realOrders=(orders||[]).filter(order=>order.simulated===false);
  const recognizedOrders=realOrders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase()));
  const collectedOrders=recognizedOrders.filter(order=>String(order.payment_method||'cash').toLowerCase()!=='credit');
  const salesToday=recognizedOrders.filter(order=>marketDateKey(order.completed_at||order.created_at,market)===today);
  const returnsToday=(returns||[]).filter(returned=>marketDateKey(returned.created_at,market)===today);
  const grossSalesToday=roundMoney(salesToday.reduce((sum,order)=>sum+number(order.total_amount),0),market);
  const returnedToday=roundMoney(returnsToday.reduce((sum,returned)=>sum+number(returned.refund_amount),0),market);
  const orderRows=(orders||[]).map(order=>{
    const items=itemsByOrder.get(order.id)||[];
    const neutral={...order,total_amount:roundMoney(order.total_amount,market),paid_amount:roundMoney(order.paid_amount,market),returned_amount:roundMoney(returnedByOrder.get(order.id)||0,market),fully_returned:items.length>0&&items.every(item=>Number(item.returned_quantity||0)>=Number(item.quantity||0)),customer_name:customerById.get(order.customer_id)||null,items};
    return withAedCompatibility(neutral,market,{total_aed:'total_amount',paid_aed:'paid_amount',returned_aed:'returned_amount'});
  });
  const returnRows=(returns||[]).map(returned=>withAedCompatibility({...returned,refund_amount:roundMoney(returned.refund_amount,market)},market,{refund_aed:'refund_amount'}));

  const metrics={
    active_products:productRows.filter(product=>product.active).length,
    active_services:serviceRows.filter(service=>service.active).length,
    inventory_units:productRows.reduce((sum,product)=>sum+product.quantity,0),
    available_units:productRows.reduce((sum,product)=>sum+product.available,0),
    low_stock_products:productRows.filter(product=>product.low_stock).length,
    real_orders:realOrders.length,
    recognized_sales_amount:roundMoney(recognizedOrders.reduce((sum,order)=>sum+number(order.total_amount),0),market),
    sales_today_amount:grossSalesToday,
    returned_today_amount:returnedToday,
    net_sales_today_amount:Math.max(0,roundMoney(grossSalesToday-returnedToday,market)),
    cash_collected_amount:roundMoney(collectedOrders.reduce((sum,order)=>sum+number(order.paid_amount),0),market),
    receivables_amount:roundMoney(recognizedOrders.reduce((sum,order)=>sum+Math.max(0,number(order.total_amount)-number(order.paid_amount)),0),market),
    completed_sales:recognizedOrders.length,
    expenses_amount:roundMoney(expenseRows.reduce((sum,expense)=>sum+number(expense.amount),0),market),
    today_expenses_amount:roundMoney(expenseRows.filter(expense=>expense.occurred_on===today).reduce((sum,expense)=>sum+number(expense.amount),0),market),
    simulated_orders:(orders||[]).filter(order=>order.simulated!==false).length,
  };
  if(market.currency_code==='AED')Object.assign(metrics,{
    recognized_sales_aed:metrics.recognized_sales_amount,
    sales_today_aed:metrics.sales_today_amount,
    returned_today_aed:metrics.returned_today_amount,
    net_sales_today_aed:metrics.net_sales_today_amount,
    cash_collected_aed:metrics.cash_collected_amount,
    receivables_aed:metrics.receivables_amount,
    expenses_aed:metrics.expenses_amount,
    today_expenses_aed:metrics.today_expenses_amount,
  });

  return json(res,200,{
    ok:true,
    business_id:businessId,
    role:membership.role,
    can_manage:membershipHasPermission(membership,'manage_business'),
    can_operate:canOperate,
    country_code:market.country_code,
    currency_code:market.currency_code,
    currency_minor_units:market.currency_minor_units,
    timezone:market.timezone,
    metrics,
    products:productRows,
    services:serviceRows,
    orders:orderRows,
    expenses:expenseRows,
    returns:returnRows,
    inventory_movements:movementRows,
    low_stock:productRows.filter(product=>product.low_stock),
    truth:{recognized_sales_statuses:['confirmed','completed'],simulated_orders_excluded_from_sales:true,sales_are_itemized_when_order_items_present:true,returns_reduce_net_sales:true,cash_collected_excludes_credit_sales:true,expenses_source:'dabbir_expenses_live_tenant_data',services_source:'dabbir_services_live_tenant_data',money_contract:'NEUTRAL_AMOUNT_PLUS_IMMUTABLE_CURRENCY',legacy_aed_aliases:market.currency_code==='AED'},
  });
}

async function handlePost(req,res,context){
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=await readJsonBody(req);
  const businessId=safeId(body.business_id);
  const membership=membershipFor(context.memberships,businessId);
  if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
  const {market}=await loadBusinessMarket(context.token,businessId);
  if(has(body,'currency_code'))assertSnapshotCurrency(body.currency_code,market,'REQUEST');

  const action=clean(body.action,40);
  const operationalActions=['complete_sale','update_order_status'];
  const canManage=membershipHasPermission(membership,'manage_business');
  const canOperate=membershipHasPermission(membership,'manage_store_operations');
  if(operationalActions.includes(action)?!canOperate:!canManage)return json(res,403,{ok:false,error:operationalActions.includes(action)?'STORE_OPERATIONS_REQUIRED':'BUSINESS_MANAGEMENT_REQUIRED'});
  let result=null;

  if(action==='create_product'){
    const sku=clean(body.sku,80);
    const name=clean(body.name,160);
    const price=moneyInput(body,market,'price_amount','price_aed');
    const quantity=Math.trunc(number(body.quantity));
    if(!sku||!name||!Number.isFinite(price)||price<0||price>10000000||quantity<0)return json(res,400,{ok:false,error:'INVALID_PRODUCT_INPUT'});
    result=await rpc(context.token,'dabbir_owner_create_product',{p_business_id:businessId,p_sku:sku,p_name:name,p_price_aed:roundMoney(price,market),p_quantity:quantity},'PRODUCT_CREATE_FAILED');
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
  }else if(action==='complete_sale'){
    const items=Array.isArray(body.items)?body.items.slice(0,50).map(item=>({product_id:safeId(item?.product_id),quantity:Math.trunc(number(item?.quantity))})):[];
    const paymentMethod=clean(body.payment_method||'cash',20).toLowerCase();
    const customerId=body.customer_id==null||body.customer_id===''?null:safeId(body.customer_id);
    const note=clean(body.note,240);
    if(!items.length||items.length>50||items.some(item=>!item.product_id||item.quantity<1||item.quantity>100000)||!['cash','card','transfer','credit','other'].includes(paymentMethod)||(body.customer_id!=null&&body.customer_id!==''&&!customerId))return json(res,400,{ok:false,error:'INVALID_SALE_INPUT'});
    result=await rpc(context.token,'dabbir_owner_complete_sale',{p_business_id:businessId,p_items:items,p_payment_method:paymentMethod,p_customer_id:customerId,p_note:note},'SALE_COMPLETE_FAILED');
  }else if(action==='receive_stock'){
    const productId=safeId(body.product_id);
    const quantity=Math.trunc(number(body.quantity));
    const note=clean(body.note,240);
    if(!productId||quantity<1||quantity>100000)return json(res,400,{ok:false,error:'INVALID_RECEIPT_INPUT'});
    result=await rpc(context.token,'dabbir_owner_receive_stock',{p_business_id:businessId,p_product_id:productId,p_quantity:quantity,p_note:note},'STOCK_RECEIPT_FAILED');
  }else if(action==='return_sale'){
    const orderId=safeId(body.order_id);
    const items=Array.isArray(body.items)?body.items.slice(0,50).map(item=>({order_item_id:safeId(item?.order_item_id),quantity:Math.trunc(number(item?.quantity))})):[];
    const reason=clean(body.reason,240);
    if(!orderId||!items.length||items.some(item=>!item.order_item_id||item.quantity<1||item.quantity>100000))return json(res,400,{ok:false,error:'INVALID_RETURN_INPUT'});
    result=await rpc(context.token,'dabbir_owner_return_sale',{p_business_id:businessId,p_order_id:orderId,p_items:items,p_reason:reason},'SALE_RETURN_FAILED');
  }else if(action==='create_expense'){
    const amount=moneyInput(body,market,'amount','amount_aed');
    const category=clean(body.category,24).toLowerCase();
    const note=clean(body.note,240);
    const occurredOn=clean(body.occurred_on,10);
    if(!Number.isFinite(amount)||amount<=0||amount>10000000||!['rent','utilities','supplies','salaries','marketing','transport','other'].includes(category)||!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn))return json(res,400,{ok:false,error:'INVALID_EXPENSE_INPUT'});
    const rows=await write(context.token,'dabbir_expenses?select=id,amount,currency_code,category,note,occurred_on,created_at',{
      method:'POST',headers:{prefer:'return=representation'},
      body:JSON.stringify({business_id:businessId,amount_aed:roundMoney(amount,market),currency_code:market.currency_code,category,note,occurred_on:occurredOn}),
    },'EXPENSE_CREATE_FAILED');
    result=rows?.[0]||null;
    if(!result)return json(res,500,{ok:false,error:'EXPENSE_CREATE_FAILED'});
    assertSnapshotCurrency(result.currency_code,market,'EXPENSE');
  }else if(action==='create_service'){
    const name=clean(body.name,160);
    const durationMinutes=Math.trunc(number(body.duration_minutes));
    if(!name||durationMinutes<1||durationMinutes>1440)return json(res,400,{ok:false,error:'INVALID_SERVICE_INPUT'});
    const rows=await write(context.token,'dabbir_services?select=id,name,duration_minutes,active,metadata',{
      method:'POST',headers:{prefer:'return=representation'},
      body:JSON.stringify({business_id:businessId,name,duration_minutes:durationMinutes,active:true,metadata:{source:'dabbir_owner_operations'}}),
    },'SERVICE_CREATE_FAILED');
    result=rows?.[0]||null;
    if(!result)return json(res,500,{ok:false,error:'SERVICE_CREATE_FAILED'});
  }else if(action==='update_service'){
    const serviceId=safeId(body.service_id);
    const name=clean(body.name,160);
    const durationMinutes=Math.trunc(number(body.duration_minutes));
    const active=body.active!==false;
    if(!serviceId||!name||durationMinutes<1||durationMinutes>1440)return json(res,400,{ok:false,error:'INVALID_SERVICE_INPUT'});
    const rows=await write(context.token,`dabbir_services?business_id=eq.${businessId}&id=eq.${serviceId}&select=id,name,duration_minutes,active,metadata`,{
      method:'PATCH',headers:{prefer:'return=representation'},
      body:JSON.stringify({name,duration_minutes:durationMinutes,active,metadata:{source:'dabbir_owner_operations'}}),
    },'SERVICE_UPDATE_FAILED');
    result=rows?.[0]||null;
    if(!result)return json(res,404,{ok:false,error:'SERVICE_NOT_FOUND'});
  }else{
    return json(res,400,{ok:false,error:'UNSUPPORTED_OWNER_OPERATION'});
  }

  return json(res,200,{ok:true,action,currency_code:market.currency_code,result});
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
