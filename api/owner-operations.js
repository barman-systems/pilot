import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

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
const number=value=>Number.isFinite(Number(value))?Number(value):0;

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});

  const token=accessTokenFromRequest(req);
  if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  try{
    const requested=safeId(req.query?.business_id);
    const membership=requested?memberships.find(m=>m.business_id===requested):memberships[0];
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    const businessId=membership.business_id;

    const [products,inventory,orders,customers]=await Promise.all([
      rest(token,`dabbir_products?select=id,sku,name,price_aed,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`,'PRODUCTS_LOOKUP_FAILED'),
      rest(token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=200`,'INVENTORY_LOOKUP_FAILED'),
      rest(token,`dabbir_orders?select=id,customer_id,status,total_aed,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,'ORDERS_LOOKUP_FAILED'),
      rest(token,`dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
    ]);

    const inventoryByProduct=new Map((inventory||[]).map(row=>[row.product_id,row]));
    const customerById=new Map((customers||[]).map(row=>[row.id,row.display_name]));
    const productRows=(products||[]).map(product=>{
      const stock=inventoryByProduct.get(product.id)||{quantity:0,reserved:0,updated_at:null};
      const quantity=number(stock.quantity);
      const reserved=number(stock.reserved);
      const available=Math.max(0,quantity-reserved);
      return {
        ...product,
        quantity,
        reserved,
        available,
        low_stock:Boolean(product.active)&&available<=5,
        inventory_updated_at:stock.updated_at||null,
      };
    });

    const realOrders=(orders||[]).filter(order=>order.simulated===false);
    const recognizedOrders=realOrders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase()));
    const orderRows=(orders||[]).map(order=>({
      ...order,
      customer_name:customerById.get(order.customer_id)||null,
    }));

    const metrics={
      active_products:productRows.filter(product=>product.active).length,
      inventory_units:productRows.reduce((sum,product)=>sum+product.quantity,0),
      available_units:productRows.reduce((sum,product)=>sum+product.available,0),
      low_stock_products:productRows.filter(product=>product.low_stock).length,
      real_orders:realOrders.length,
      recognized_sales_aed:Number(recognizedOrders.reduce((sum,order)=>sum+number(order.total_aed),0).toFixed(2)),
      simulated_orders:(orders||[]).filter(order=>order.simulated!==false).length,
    };

    return json(res,200,{
      ok:true,
      business_id:businessId,
      role:membership.role,
      metrics,
      products:productRows,
      orders:orderRows,
      low_stock:productRows.filter(product=>product.low_stock),
      truth:{recognized_sales_statuses:['confirmed','completed'],simulated_orders_excluded_from_sales:true},
    });
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503].includes(status)?status:500;
    console.error('dabbir_owner_operations_failed',{error:String(error?.message||'OWNER_OPERATIONS_FAILED').slice(0,120),status:safe});
    return json(res,safe,{ok:false,error:String(error?.message||'OWNER_OPERATIONS_FAILED').slice(0,120),detail:error?.detail||undefined});
  }
}
