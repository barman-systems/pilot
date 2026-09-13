import { createHash, timingSafeEqual } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { json, SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SETTLEMENT_LAG_DAYS=0;
const RECONCILE_DAYS=1;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=400)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const integer=value=>Math.max(0,Math.trunc(num(value)));
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
function sameSecret(left,right){const a=Buffer.from(String(left||''));const b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
function authMode(req,env=process.env){const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;return null}
function isoDate(offsetDays){const d=new Date(Date.now()+offsetDays*86400000);return d.toISOString().slice(0,10)}
function nextDate(date){const d=new Date(`${date}T00:00:00.000Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
async function report(token,params){const response=await fetch(`https://ai-gateway.vercel.sh/v1/report?${new URLSearchParams(params)}`,{cache:'no-store',headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(12000)});const payload=await response.json().catch(()=>null);if(!response.ok||!Array.isArray(payload?.results))throw Object.assign(new Error(`AI_GATEWAY_REPORT_HTTP_${response.status}`),{status:response.status});return payload.results}
async function reconcile(key,params){const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_reconcile_ai_gateway_cost_v1`,{method:'POST',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000),headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json',prefer:'return=representation'}),body:JSON.stringify(params)});if(!response.ok)throw new Error(`AI_BILLING_LEDGER_HTTP_${response.status}`);return response.json().catch(()=>({ok:true}))}
function reportRow(row){return {input_tokens:integer(row?.input_tokens),output_tokens:integer(row?.output_tokens),reasoning_tokens:integer(row?.reasoning_tokens),request_count:integer(row?.request_count),total_cost:Math.max(0,num(row?.total_cost)),market_cost:Math.max(0,num(row?.market_cost))}}
async function existingBusinessIds(key,ids){
  const found=new Set();
  // The provider report can outlive a deleted business. Resolve identities from
  // the database before any ledger write; an unavailable lookup must not be
  // treated as a deleted tenant. Bound URLs to 100 validated UUIDs each.
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100),allowed=new Set(batch);
    const query=new URLSearchParams({select:'id',id:`in.(${batch.join(',')})`});
    const response=await fetch(`${SUPABASE_URL}/rest/v1/dabbir_businesses?${query}`,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000),headers:supabaseKeyHeaders(key,{accept:'application/json'})});
    if(!response.ok)throw new Error(`AI_BILLING_BUSINESS_LOOKUP_HTTP_${response.status}`);
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.some(row=>!UUID.test(String(row?.id||''))||!allowed.has(row.id)))throw new Error('AI_BILLING_BUSINESS_LOOKUP_INVALID');
    for(const row of rows)found.add(row.id);
  }
  return found;
}
export async function reconcileDate(token,key,date){
  const end=nextDate(date),base={start_date:date,end_date:date,tags:'channel:whatsapp'};
  const users=(await report(token,{...base,group_by:'user'})).slice(0,500);
  const ids=[...new Set(users.map(row=>clean(row?.user,80)).filter(id=>UUID.test(id)))];
  const existing=await existingBusinessIds(key,ids);
  let businesses=0,models=0,totalMicrousd=0,unattributedBusinesses=0,unattributedMicrousd=0;
  for(const userRow of users){
    const businessId=clean(userRow?.user,80),user=reportRow(userRow);
    if(!existing.has(businessId)){
      // Keep provider-reported spend visible. Never recreate a deleted tenant,
      // assign its spend to another customer, or claim it was reconciled.
      unattributedBusinesses+=1;unattributedMicrousd+=Math.max(0,Math.round(user.total_cost*1_000_000));
      continue;
    }
    const modelRows=await report(token,{...base,group_by:'model',user_id:businessId});
    const normalized=modelRows.map(row=>({model:clean(row?.model,160)||'unknown',...reportRow(row)})),modelCost=normalized.reduce((sum,row)=>sum+row.total_cost,0),tolerance=Math.max(0.000001,user.total_cost*0.0001),rows=normalized.length&&Math.abs(modelCost-user.total_cost)<=tolerance?normalized:[{model:'unknown',...user}];
    for(const row of rows){
      const microusd=Math.max(0,Math.round(row.total_cost*1_000_000));
      await reconcile(key,{p_business_id:businessId,p_operation_key:`ai-gateway-report:${date}:${hash(row.model).slice(0,32)}`,p_model:row.model,p_input_tokens:row.input_tokens,p_output_tokens:row.output_tokens,p_reasoning_tokens:row.reasoning_tokens,p_request_count:row.request_count,p_actual_cost_microusd:microusd,p_period_start:`${date}T00:00:00.000Z`,p_period_end:`${end}T00:00:00.000Z`,p_metadata:{report_date:date,reported_total_cost_usd:row.total_cost,reported_market_cost_usd:row.market_cost,user_total_cost_usd:user.total_cost,tag_filter:'channel:whatsapp',settlement_lag_days:SETTLEMENT_LAG_DAYS}});
      models+=1;totalMicrousd+=microusd;
    }
    businesses+=1;
  }
  return {date,businesses,models,total_microusd:totalMicrousd,unattributed_businesses:unattributedBusinesses,unattributed_microusd:unattributedMicrousd};
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});const mode=authMode(req);if(!mode)return json(res,401,{ok:false,error:'CRON_AUTH_REQUIRED'});const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);if(!key||key.startsWith('sb_publishable_'))return json(res,503,{ok:false,error:'SERVICE_ROLE_REQUIRED'});try{const token=clean(await getVercelOidcToken(),16384);if(!token)throw new Error('VERCEL_OIDC_REQUIRED');const dates=Array.from({length:RECONCILE_DAYS},(_,i)=>isoDate(-(SETTLEMENT_LAG_DAYS+i))),results=[];for(const date of dates)results.push(await reconcileDate(token,key,date));const summary=results.reduce((a,r)=>({businesses:a.businesses+r.businesses,models:a.models+r.models,total_microusd:a.total_microusd+r.total_microusd,unattributed_businesses:a.unattributed_businesses+r.unattributed_businesses,unattributed_microusd:a.unattributed_microusd+r.unattributed_microusd}),{businesses:0,models:0,total_microusd:0,unattributed_businesses:0,unattributed_microusd:0});const state=summary.unattributed_businesses>0?'PARTIAL_UNATTRIBUTED':'RECONCILED';console.info('dabbir_ai_billing_reconciled',{state,dates,...summary,auth_mode:mode});return json(res,200,{ok:true,state,dates,...summary})}catch(error){const code=clean(error?.message||error,160)||'AI_BILLING_RECONCILIATION_FAILED';console.error('dabbir_ai_billing_reconciliation_failed',{error:code});return json(res,500,{ok:false,error:code})}}
