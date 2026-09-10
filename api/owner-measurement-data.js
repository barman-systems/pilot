import { json } from './_auth-core.js';
import { ownerBroker, ownerSessionToken } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const DUBAI_OFFSET_MS=4*60*60*1000;
const DAY_MS=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clean=(value,max=180)=>String(value??'').trim().slice(0,max);
const one=(req,key)=>clean(singleQueryValue(req,key),240);

function serviceRoleKey(){
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('OWNER_MEASUREMENT_NOT_CONFIGURED'),{status:503});
  return key;
}

function dubaiMonthStartUtc(now,monthDelta=0){
  const local=new Date(now.getTime()+DUBAI_OFFSET_MS);
  const y=local.getUTCFullYear();
  const m=local.getUTCMonth()+monthDelta;
  return new Date(Date.UTC(y,m,1)-DUBAI_OFFSET_MS);
}

function dubaiDayStartUtc(now){
  const local=new Date(now.getTime()+DUBAI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-DUBAI_OFFSET_MS);
}

export function resolveMeasurementWindow(query={},clock=new Date()){
  const now=new Date(clock);
  if(!Number.isFinite(now.getTime()))throw Object.assign(new Error('INVALID_CLOCK'),{status:500});
  const period=clean(query.period||'today',32).toLowerCase();
  let start,end=now;
  if(period==='today')start=dubaiDayStartUtc(now);
  else if(period==='7d')start=new Date(now.getTime()-7*DAY_MS);
  else if(period==='30d')start=new Date(now.getTime()-30*DAY_MS);
  else if(period==='current_month')start=dubaiMonthStartUtc(now,0);
  else if(period==='previous_month'){start=dubaiMonthStartUtc(now,-1);end=dubaiMonthStartUtc(now,0);}
  else if(period==='custom'){
    start=new Date(clean(query.start,64));
    end=new Date(clean(query.end,64));
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw Object.assign(new Error('INVALID_CUSTOM_PERIOD'),{status:400});
    if(end>now)end=now;
  } else throw Object.assign(new Error('INVALID_PERIOD'),{status:400});
  if(!start||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>366*DAY_MS)throw Object.assign(new Error('INVALID_MEASUREMENT_WINDOW'),{status:400});
  return {period,start:start.toISOString(),end:end.toISOString(),timezone:'Asia/Dubai'};
}

function optionalUuid(value,name){
  const v=clean(value,80);
  if(!v)return null;
  if(!UUID.test(v))throw Object.assign(new Error(`INVALID_${name}`),{status:400});
  return v;
}

function metricContext(payload,window,filters){
  if(Array.isArray(payload))return payload.map(item=>metricContext(item,window,filters));
  if(!payload||typeof payload!=='object')return payload;
  const next={};
  for(const [key,value] of Object.entries(payload))next[key]=metricContext(value,window,filters);
  if(typeof payload.measurement_state==='string'&&Object.hasOwn(payload,'authoritative_source')){
    next.time_window={start:window.start,end:window.end,timezone:window.timezone};
    next.business_scope={business_id:filters.business_id,branch_id:filters.branch_id,activity_type:filters.activity_type,channel:filters.channel,provider:filters.provider,model:filters.model};
    next.freshness_state='FRESH';
  }
  return next;
}

async function identityFor(req){
  const auth=await ownerBroker(req,'identity',{});
  if(auth.status!==200||!auth.payload?.ok)throw Object.assign(new Error(auth.payload?.error||'OWNER_SESSION_REQUIRED'),{status:auth.status||401});
  const identity=auth.payload.payload;
  if(!identity||!['ROOT_OWNER','OWNER_DELEGATE'].includes(String(identity.authority_role||'')))throw Object.assign(new Error('OWNER_MEASUREMENT_FORBIDDEN'),{status:403});
  return {authority_role:identity.authority_role,access_scope:identity.access_scope||{type:'OWN_TASKS_ONLY'}};
}

async function measurementRpc(scope,window,filters){
  const key=serviceRoleKey();
  if(!SUPABASE_URL)throw Object.assign(new Error('OWNER_MEASUREMENT_NOT_CONFIGURED'),{status:503});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_owner_measurement_snapshot_v1`,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json'}),
    body:JSON.stringify({
      p_scope:scope,p_start:window.start,p_end:window.end,
      p_business_id:filters.business_id,p_branch_id:filters.branch_id,
      p_activity_type:filters.activity_type,p_channel:filters.channel,
      p_provider:filters.provider,p_model:filters.model,
    }),
    signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload||typeof payload!=='object'||Array.isArray(payload))throw Object.assign(new Error('OWNER_MEASUREMENT_QUERY_FAILED'),{status:response.status===403?403:503});
  return payload;
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-frame-options','DENY');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(!ownerSessionToken(req))return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  try{
    const scope=await identityFor(req);
    const window=resolveMeasurementWindow({period:one(req,'period')||'today',start:one(req,'start'),end:one(req,'end')});
    const filters={
      business_id:optionalUuid(one(req,'business_id'),'BUSINESS_ID'),
      branch_id:optionalUuid(one(req,'branch_id'),'BRANCH_ID'),
      activity_type:clean(one(req,'activity_type'),80).toLowerCase()||null,
      channel:clean(one(req,'channel'),80).toLowerCase()||null,
      provider:clean(one(req,'provider'),120).toLowerCase()||null,
      model:clean(one(req,'model'),180)||null,
    };
    const raw=await measurementRpc(scope,window,filters);
    const measurement=metricContext(raw,window,filters);
    return json(res,200,{ok:true,period:window.period,timezone:window.timezone,measurement});
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:503;
    const message=String(error?.message||'OWNER_MEASUREMENT_FAILED');
    const safe=status===401?'OWNER_SESSION_REQUIRED':status===403?'OWNER_MEASUREMENT_FORBIDDEN':message.startsWith('INVALID_')?message:message.startsWith('OWNER_MEASUREMENT_')?message:'OWNER_MEASUREMENT_FAILED';
    return json(res,status,{ok:false,error:safe});
  }
}
