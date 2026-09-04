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
import { assertSnapshotCurrency, verifiedBusinessMarket } from './_gcc-money-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):NaN;
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error;
  }
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(response=>readData(response,fallback));
const write=(token,path,options,fallback)=>supabaseRest(path,token,options).then(response=>readData(response,fallback));
const rpc=(token,name,params,fallback)=>supabaseRpc(name,token,params).then(response=>readData(response,fallback));

function membershipFor(memberships,businessId){return memberships.find(membership=>membership.business_id===businessId)||null}
function canManageBusiness(membership){
  if(!membership)return false;
  const permissions=Array.isArray(membership.permissions)?membership.permissions:[];
  if(permissions.length)return permissions.includes('manage_business');
  return ['owner','admin'].includes(String(membership.role||'').toLowerCase());
}

async function authenticatedContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}

function roundMoney(value,market){return Number(Number(value||0).toFixed(Number.isInteger(market?.currency_minor_units)?market.currency_minor_units:2))}
function moneyInput(body,market){
  if(has(body,'price_amount'))return number(body.price_amount);
  if(has(body,'price_aed')){
    if(market.currency_code!=='AED')throw Object.assign(new Error('LEGACY_AED_INPUT_NOT_ALLOWED'),{status:409});
    return number(body.price_aed);
  }
  return NaN;
}
function compatibleProduct(product,market){
  const neutral={...product,price_amount:roundMoney(product.price_amount,market)};
  return market.currency_code==='AED'?{...neutral,price_aed:neutral.price_amount}:neutral;
}

async function businessMarket(token,businessId){
  const rows=await rest(token,`dabbir_businesses?select=id,country_code,currency_code,timezone&id=eq.${businessId}&limit=1`,'BUSINESS_MARKET_LOOKUP_FAILED');
  const business=rows?.[0]||null;
  if(!business)throw Object.assign(new Error('BUSINESS_MARKET_NOT_FOUND'),{status:404});
  return verifiedBusinessMarket(business);
}

async function productContext(token,businessId,productId){
  const [products,inventory]=await Promise.all([
    rest(token,`dabbir_products?select=id,business_id,sku,name,price_amount,active,metadata&business_id=eq.${businessId}&id=eq.${productId}&limit=1`,'PRODUCT_LOOKUP_FAILED'),
    rest(token,`dabbir_inventory?select=quantity,reserved&business_id=eq.${businessId}&product_id=eq.${productId}&limit=1`,'INVENTORY_LOOKUP_FAILED'),
  ]);
  return {product:products?.[0]||null,inventory:inventory?.[0]||{quantity:0,reserved:0}};
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const context=await authenticatedContext(req,res);
  if(!context)return;

  try{
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id);
    const productId=safeId(body.product_id);
    const membership=membershipFor(context.memberships,businessId);
    if(!businessId||!productId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(!canManageBusiness(membership))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});

    const [market,{product,inventory}]=await Promise.all([businessMarket(context.token,businessId),productContext(context.token,businessId,productId)]);
    if(has(body,'currency_code'))assertSnapshotCurrency(body.currency_code,market,'REQUEST');
    if(!product)return json(res,404,{ok:false,error:'PRODUCT_NOT_FOUND'});

    const action=clean(body.action,40);
    if(action==='update_product'){
      const name=clean(body.name,160);
      const price=moneyInput(body,market);
      const quantity=Math.trunc(number(body.quantity));
      if(!name||!Number.isFinite(price)||price<0||price>10000000||!Number.isFinite(quantity)||quantity<0||quantity>1000000)return json(res,400,{ok:false,error:'INVALID_PRODUCT_INPUT'});
      if(quantity<Number(inventory.reserved||0))return json(res,409,{ok:false,error:'QUANTITY_BELOW_RESERVED'});

      const metadata={...(product.metadata&&typeof product.metadata==='object'?product.metadata:{}),source:'dabbir_owner_operations',updated_at:new Date().toISOString()};
      const rows=await write(context.token,`dabbir_products?business_id=eq.${businessId}&id=eq.${productId}&select=id,sku,name,price_amount,active,metadata`,{
        method:'PATCH',headers:{prefer:'return=representation'},
        body:JSON.stringify({name,price_aed:roundMoney(price,market),metadata}),
      },'PRODUCT_UPDATE_FAILED');
      const updated=rows?.[0]||null;
      if(!updated)return json(res,404,{ok:false,error:'PRODUCT_NOT_FOUND'});
      const stock=await rpc(context.token,'dabbir_owner_set_inventory',{p_business_id:businessId,p_product_id:productId,p_quantity:quantity},'INVENTORY_UPDATE_FAILED');
      return json(res,200,{ok:true,action,currency_code:market.currency_code,result:{...compatibleProduct(updated,market),quantity,reserved:Number(inventory.reserved||0),stock}});
    }

    if(action==='delete_product'){
      if(Number(inventory.reserved||0)>0)return json(res,409,{ok:false,error:'PRODUCT_HAS_RESERVED_STOCK'});
      const metadata={...(product.metadata&&typeof product.metadata==='object'?product.metadata:{}),source:'dabbir_owner_operations',deleted_at:new Date().toISOString(),deleted_by:context.user.id||null};
      const rows=await write(context.token,`dabbir_products?business_id=eq.${businessId}&id=eq.${productId}&select=id,sku,name,price_amount,active,metadata`,{
        method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({active:false,metadata}),
      },'PRODUCT_DELETE_FAILED');
      const deleted=rows?.[0]||null;
      if(!deleted)return json(res,404,{ok:false,error:'PRODUCT_NOT_FOUND'});
      return json(res,200,{ok:true,action,currency_code:market.currency_code,result:{...compatibleProduct(deleted,market),deleted:true}});
    }

    return json(res,400,{ok:false,error:'UNSUPPORTED_PRODUCT_OPERATION'});
  }catch(error){
    const status=Number(error?.status)||500;
    const safe=[400,401,403,404,409,413,429,502,503].includes(status)?status:500;
    return json(res,safe,{ok:false,error:error?.message||'OWNER_PRODUCT_MANAGEMENT_FAILED',detail:error?.detail||null});
  }
}
