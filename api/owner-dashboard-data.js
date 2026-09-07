import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker, ownerSessionToken } from './_owner-broker-client.js';

function count(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:null;
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

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});

  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  const action=String(singleQueryValue(req,'action')||'overview').trim();
  if(!['overview','search','executive','identity','customer360','operations','operation_entities','feedback','audit'].includes(action))return json(res,400,{ok:false,error:'UNKNOWN_ACTION'});

  try{
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
  }catch{
    return json(res,503,{ok:false,error:'OWNER_DATA_FAILED'});
  }
}
