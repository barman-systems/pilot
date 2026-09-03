import ownerOperationsHandler from '../owner-operations.js';
import { requireNativeBearer } from './_native-core.js';
import { accessTokenFromRequest, json, supabaseRest } from '../_auth-core.js';

const clean=(value,max=80)=>String(value??'').trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const enc=value=>encodeURIComponent(String(value));

async function readData(response,fallback){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;throw error}
  return payload;
}

function captureOwnerOperations(req){
  return new Promise((resolve,reject)=>{
    const headers=new Map();let settled=false;
    const proxy={
      statusCode:200,
      setHeader(name,value){headers.set(String(name).toLowerCase(),value);return proxy},
      getHeader(name){return headers.get(String(name).toLowerCase())},
      removeHeader(name){headers.delete(String(name).toLowerCase())},
      end(body=''){
        if(!settled){settled=true;resolve({statusCode:proxy.statusCode,headers,body:String(body??'')})}
        return proxy;
      },
    };
    Promise.resolve(ownerOperationsHandler(req,proxy)).then(()=>{if(!settled)reject(new Error('OWNER_OPERATIONS_NO_RESPONSE'))}).catch(reject);
  });
}

function forward(res,captured,payload=null){
  res.statusCode=Number(captured.statusCode||200);
  for(const [name,value] of captured.headers.entries()){
    if(name==='content-length'||name==='transfer-encoding')continue;
    res.setHeader(name,value);
  }
  res.setHeader('x-dabbir-native-store-gcc','v1');
  return res.end(payload==null?captured.body:JSON.stringify(payload));
}

function localDateKey(value,timezone){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch{return null}
}

async function enrichGet(req,res){
  const captured=await captureOwnerOperations(req);
  if(Number(captured.statusCode)!==200)return forward(res,captured);
  let payload=null;
  try{payload=captured.body?JSON.parse(captured.body):null}catch{return forward(res,captured)}
  const businessId=clean(payload?.business_id,64);
  const token=accessTokenFromRequest(req);
  if(!businessId||!token)return json(res,502,{ok:false,error:'NATIVE_STORE_PROFILE_CONTEXT_UNVERIFIED'});

  const rows=await readData(await supabaseRest(`dabbir_businesses?select=id,country_code,currency_code,timezone,phone_country_prefix&id=eq.${enc(businessId)}&limit=1`,token),'BUSINESS_PROFILE_LOOKUP_FAILED');
  const business=Array.isArray(rows)?rows[0]:null;
  if(!business?.id||!business.currency_code||!business.timezone)return json(res,502,{ok:false,error:'BUSINESS_GCC_PROFILE_UNVERIFIED'});

  const businessDate=localDateKey(new Date(),business.timezone);
  if(!businessDate)return json(res,502,{ok:false,error:'BUSINESS_LOCAL_DAY_UNVERIFIED'});
  const orders=Array.isArray(payload.orders)?payload.orders:[];
  const returns=Array.isArray(payload.returns)?payload.returns:[];
  const expenses=Array.isArray(payload.expenses)?payload.expenses:[];
  const realOrders=orders.filter(order=>order.simulated===false);
  const recognized=realOrders.filter(order=>['confirmed','completed'].includes(String(order.status||'').toLowerCase()));
  const todayOrders=recognized.filter(order=>localDateKey(order.completed_at||order.created_at,business.timezone)===businessDate);
  const todayReturns=returns.filter(item=>localDateKey(item.created_at,business.timezone)===businessDate);
  const salesToday=Number(todayOrders.reduce((sum,order)=>sum+number(order.total_aed),0).toFixed(2));
  const returnedToday=Number(todayReturns.reduce((sum,item)=>sum+number(item.refund_aed),0).toFixed(2));
  const expensesToday=Number(expenses.filter(item=>item.occurred_on===businessDate).reduce((sum,item)=>sum+number(item.amount_aed),0).toFixed(2));
  const metrics={...(payload.metrics||{}),sales_today_aed:salesToday,returned_today_aed:returnedToday,net_sales_today_aed:Math.max(0,Number((salesToday-returnedToday).toFixed(2))),today_expenses_aed:expensesToday};
  metrics.sales_today=metrics.sales_today_aed;
  metrics.returned_today=metrics.returned_today_aed;
  metrics.net_sales_today=metrics.net_sales_today_aed;
  metrics.today_expenses=metrics.today_expenses_aed;
  metrics.recognized_sales=metrics.recognized_sales_aed;
  metrics.cash_collected=metrics.cash_collected_aed;
  metrics.receivables=metrics.receivables_aed;
  metrics.expenses=metrics.expenses_aed;

  payload.metrics=metrics;
  payload.country_code=business.country_code;
  payload.currency_code=business.currency_code;
  payload.timezone=business.timezone;
  payload.business_date=businessDate;
  payload.business_profile=business;
  payload.truth={...(payload.truth||{}),store_metrics_are_business_day_facts:true,legacy_aed_field_names_are_storage_compatibility:true,currency_code_from_business_profile:true};
  return forward(res,captured,payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
  }
  if (!requireNativeBearer(req, res)) return;
  if(req.method==='GET'){
    try{return await enrichGet(req,res)}catch(error){
      const status=[400,401,403,404,409,413,429,502,503,504].includes(Number(error?.status))?Number(error.status):500;
      return json(res,status,{ok:false,error:String(error?.message||'NATIVE_STORE_GCC_ENRICH_FAILED').slice(0,120)});
    }
  }
  return ownerOperationsHandler(req, res);
}
