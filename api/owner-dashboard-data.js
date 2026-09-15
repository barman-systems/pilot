import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker, ownerSessionToken } from './_owner-broker-client.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');

function count(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:null;
}

function finite(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}

export function normalizeOverviewForUi(payload){
  const source=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const customers=count(source.customers?.accounts);
  const businesses=count(source.customers?.live_businesses);
  const needsReview=[
    source.support?.open,
    source.incidents?.open,
    source.ceo?.blocked,
    source.ceo?.decisions_waiting,
    source.whatsapp?.error,
    source.calendar?.error,
    source.payments?.failed
  ].map(count);
  const reviewCount=needsReview.every(v=>v!==null)?needsReview.reduce((sum,value)=>sum+value,0):null;

  // Compatibility summary for the current owner shell. Keep the structured broker
  // payload intact so newer executive panels continue to use their native sections.
  return {
    ...source,
    total_customers:customers,
    customer_count:customers,
    total_businesses:businesses,
    business_count:businesses,
    needs_review:reviewCount,
    review_count:reviewCount
  };
}

export function normalizeAiUsageForUi(payload){
  const source=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const providers=Array.isArray(source.providers)?source.providers.map(row=>({
    provider:String(row?.provider||'unknown').slice(0,120),
    ai_requests:count(row?.ai_requests),
    known_cost_aed:finite(row?.known_cost_aed),
    unpriced_operations:count(row?.unpriced_operations)
  })).filter(row=>row.provider):[];
  const state=source.measurement_state==='COMPLETE'?'COMPLETE':source.measurement_state==='PARTIAL'?'PARTIAL':'UNKNOWN';
  return {
    generated_at:source.generated_at||null,
    month_start:source.month_start||null,
    conversations:count(source.conversations),
    messages:count(source.messages),
    simulated_messages:count(source.simulated_messages),
    ai_requests:count(source.ai_requests),
    input_tokens:count(source.input_tokens),
    output_tokens:count(source.output_tokens),
    reasoning_tokens:count(source.reasoning_tokens),
    total_tokens:count(source.total_tokens),
    known_cost_aed:finite(source.known_cost_aed),
    known_cost_usd:finite(source.known_cost_usd),
    unpriced_operations:count(source.unpriced_operations),
    whatsapp_known_cost_aed:finite(source.whatsapp_known_cost_aed),
    whatsapp_unpriced_operations:count(source.whatsapp_unpriced_operations),
    known_cost_per_conversation_aed:finite(source.known_cost_per_conversation_aed),
    measurement_state:state,
    providers
  };
}

export function normalizeProductTruthForUi(payload){
  const source=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const delivery=source.posthog_delivery&&typeof source.posthog_delivery==='object'&&!Array.isArray(source.posthog_delivery)?source.posthog_delivery:{};
  const allowedDeliveryStates=new Set(['HEALTHY','SYNCING','DEGRADED','NOT_CONFIGURED']);
  const activity=Array.isArray(source.activity_breakdown)?source.activity_breakdown.map(row=>({
    business_type:String(row?.business_type||'unknown').slice(0,80),
    businesses_created:count(row?.businesses_created),
    first_requests:count(row?.first_requests),
    first_actions:count(row?.first_actions)
  })):[];
  return {
    generated_at:source.generated_at||null,
    authority:source.authority==='DABBIR_OPERATIONAL_TRUTH'?'DABBIR_OPERATIONAL_TRUTH':'UNKNOWN',
    measurement_state:source.measurement_state==='COMPLETE'?'COMPLETE':'UNKNOWN',
    signup_accounts:count(source.signup_accounts),
    returning_users:count(source.returning_users),
    businesses_created:count(source.businesses_created),
    first_requests:count(source.first_requests),
    first_actions:count(source.first_actions),
    activity_breakdown:activity,
    posthog_delivery:{
      state:allowedDeliveryStates.has(delivery.state)?delivery.state:'UNKNOWN',
      total:count(delivery.total),
      delivered:count(delivery.delivered),
      pending:count(delivery.pending),
      failed:count(delivery.failed),
      last_delivered_at:delivery.last_delivered_at||null
    }
  };
}

function serviceRoleKey(errorCode='OWNER_DATA_NOT_CONFIGURED'){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error(errorCode),{status:503});
  return key;
}

async function requireRootOwner(req){
  const auth=await ownerBroker(req,'identity',{});
  if(auth.status!==200||!auth.payload?.ok)throw Object.assign(new Error(auth.payload?.error||'OWNER_SESSION_REQUIRED'),{status:auth.status||401});
  if(auth.payload.payload?.authority_role!=='ROOT_OWNER')throw Object.assign(new Error('ROOT_OWNER_REQUIRED'),{status:403});
}

async function rootAiUsage(req){
  await requireRootOwner(req);
  const key=serviceRoleKey('OWNER_AI_USAGE_NOT_CONFIGURED');
  if(!SUPABASE_URL)throw Object.assign(new Error('OWNER_AI_USAGE_NOT_CONFIGURED'),{status:503});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_platform_ai_usage_snapshot_v1`,{
    method:'POST',
    headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:'{}',
    signal:AbortSignal.timeout(10000)
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('OWNER_AI_USAGE_QUERY_FAILED'),{status:503});
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Object.assign(new Error('OWNER_AI_USAGE_INVALID_RESPONSE'),{status:502});
  return normalizeAiUsageForUi(payload);
}

async function rootProductTruth(req){
  await requireRootOwner(req);
  const key=serviceRoleKey('OWNER_PRODUCT_TRUTH_NOT_CONFIGURED');
  if(!SUPABASE_URL)throw Object.assign(new Error('OWNER_PRODUCT_TRUTH_NOT_CONFIGURED'),{status:503});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_platform_product_truth_snapshot_v1`,{
    method:'POST',
    headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:'{}',
    signal:AbortSignal.timeout(10000)
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('OWNER_PRODUCT_TRUTH_QUERY_FAILED'),{status:503});
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Object.assign(new Error('OWNER_PRODUCT_TRUTH_INVALID_RESPONSE'),{status:502});
  return normalizeProductTruthForUi(payload);
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});

  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  const action=String(singleQueryValue(req,'action')||'overview').trim();
  if(!['overview','search','executive','identity','customer360','operations','operation_entities','feedback','audit','ai_usage','product_truth'].includes(action))return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});

  try{
    if(action==='ai_usage')return json(res,200,{ok:true,ai_usage:await rootAiUsage(req)});
    if(action==='product_truth')return json(res,200,{ok:true,product_truth:await rootProductTruth(req)});
    const body={};
    if(action==='search')body.q=String(singleQueryValue(req,'q')||'').trim().slice(0,160);
    if(action==='customer360'||action==='operation_entities'){
      const key=action==='customer360'?'user_id':'business_id';
      const id=String(singleQueryValue(req,key)||'').trim();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return json(res,400,{ok:false,error:'INVALID_TARGET_ID'});
      body[key]=id;
    }
    if(action==='operation_entities'){
      body.entity_type=String(singleQueryValue(req,'entity_type')||'').toUpperCase();
      if(!['ORDER','BOOKING','PRODUCT','SERVICE','BRANCH','WHATSAPP','CALENDAR'].includes(body.entity_type))return json(res,400,{ok:false,error:'INVALID_ENTITY_TYPE'});
    }
    const {status,payload:p}=await ownerBroker(req,action,body);
    if(status!==200||!p?.ok){
      return json(res,status,{ok:false,error:p?.error||'OWNER_DATA_FAILED'});
    }
    if(!p.payload||typeof p.payload!=='object'||Array.isArray(p.payload))return json(res,502,{ok:false,error:'OWNER_DATA_INVALID_RESPONSE'});
    const collection={search:'accounts',operations:'businesses',operation_entities:'entities',feedback:'feedback',audit:'entries'}[action];
    if(collection&&!Array.isArray(p.payload[collection]))return json(res,502,{ok:false,error:'OWNER_DATA_INVALID_RESPONSE'});
    if(action==='overview')return json(res,200,{ok:true,overview:normalizeOverviewForUi(p.payload)});
    if(action==='executive')return json(res,200,{ok:true,executive:p.payload});
    return json(res,200,{...(p.payload||{}),ok:true});
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:503;
    const message=String(error?.message||'OWNER_DATA_FAILED');
    const safe=status===403?'ROOT_OWNER_REQUIRED':status===401?'OWNER_SESSION_REQUIRED':message.startsWith('OWNER_AI_USAGE_')||message.startsWith('OWNER_PRODUCT_TRUTH_')?message:'OWNER_DATA_FAILED';
    return json(res,status,{ok:false,error:safe});
  }
}
