import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker, ownerSessionToken } from './_owner-broker-client.js';
import { platformPnlMonth } from './_platform-finance.js';

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const count=value=>Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;
const finite=value=>['number','string'].includes(typeof value)&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
const text=(value,max=160)=>String(value||'').slice(0,max);

function normalizeRows(rows,kind){
  if(!Array.isArray(rows))return [];
  if(kind==='sources')return rows.map(row=>({source_key:text(row?.source_key,120),provider:text(row?.provider,120),category:text(row?.category,80),state:text(row?.state,80)})).filter(row=>row.source_key);
  if(kind==='category')return rows.map(row=>({category:text(row?.category,80),amount_aed:finite(row?.amount_aed)})).filter(row=>row.category);
  if(kind==='provider')return rows.map(row=>({provider:text(row?.provider,120),amount_aed:finite(row?.amount_aed)})).filter(row=>row.provider);
  if(kind==='business')return rows.map(row=>({
    business_id:text(row?.business_id,64),name:text(row?.name,180),revenue_aed:finite(row?.revenue_aed),ai_cost_aed:finite(row?.ai_cost_aed),
    direct_other_cost_aed:finite(row?.direct_other_cost_aed),allocated_shared_cost_aed:finite(row?.allocated_shared_cost_aed),
    known_contribution_aed:finite(row?.known_contribution_aed),unpriced_ai_operations:count(row?.unpriced_ai_operations)
  })).filter(row=>row.business_id);
  return [];
}

export function normalizePlatformPnl(payload){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const revenue=p.revenue&&typeof p.revenue==='object'?p.revenue:{};
  const costs=p.costs&&typeof p.costs==='object'?p.costs:{};
  return {
    generated_at:p.generated_at||null,month_start:p.month_start||null,month_end:p.month_end||null,
    accounting_scope:text(p.accounting_scope,80),owner_labor_state:text(p.owner_labor_state,80),
    measurement_state:p.measurement_state==='COMPLETE'?'COMPLETE':'PARTIAL',
    revenue:{known_aed:finite(revenue.known_aed),live_web_evidence:Boolean(revenue.live_web_evidence),live_apple_evidence:Boolean(revenue.live_apple_evidence),live_google_evidence:Boolean(revenue.live_google_evidence)},
    costs:{ai_known_aed:finite(costs.ai_known_aed),other_known_aed:finite(costs.other_known_aed),total_known_aed:finite(costs.total_known_aed),shared_known_aed:finite(costs.shared_known_aed),ai_requests:count(costs.ai_requests),unpriced_ai_operations:count(costs.unpriced_ai_operations),pending_ai_reconciliations:count(costs.pending_ai_reconciliations),whatsapp_messages:count(costs.whatsapp_messages)},
    known_operating_result_aed:finite(p.known_operating_result_aed),net_profit_aed:p.net_profit_aed===null?null:finite(p.net_profit_aed),
    active_businesses:count(p.active_businesses),missing_sources:normalizeRows(p.missing_sources,'sources'),by_category:normalizeRows(p.by_category,'category'),by_provider:normalizeRows(p.by_provider,'provider'),businesses:normalizeRows(p.businesses,'business')
  };
}

async function requireRoot(req){
  const auth=await ownerBroker(req,'identity',{});
  if(auth.status!==200||!auth.payload?.ok)throw Object.assign(new Error(auth.payload?.error||'OWNER_SESSION_REQUIRED'),{status:auth.status||401});
  if(auth.payload.payload?.authority_role!=='ROOT_OWNER')throw Object.assign(new Error('ROOT_OWNER_REQUIRED'),{status:403});
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(!ownerSessionToken(req))return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  const raw=String(singleQueryValue(req,'month')||'').trim();
  if(raw&&!monthPattern.test(raw))return json(res,400,{ok:false,error:'INVALID_MONTH'});
  try{
    await requireRoot(req);
    const payload=await platformPnlMonth(raw?`${raw}-01`:null);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return json(res,502,{ok:false,error:'PLATFORM_FINANCE_INVALID_RESPONSE'});
    return json(res,200,{ok:true,pnl:normalizePlatformPnl(payload)});
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:503;
    const safe=status===403?'ROOT_OWNER_REQUIRED':status===401?'OWNER_SESSION_REQUIRED':'PLATFORM_FINANCE_UNAVAILABLE';
    return json(res,status,{ok:false,error:safe});
  }
}
