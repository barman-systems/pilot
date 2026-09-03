import { json } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readStatus(token){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_public_order_status`,{
    method:'POST',
    cache:'no-store',
    headers:supabaseKeyHeaders(SERVICE_KEY,{'content-type':'application/json',accept:'application/json'}),
    body:JSON.stringify({p_token:token}),
    signal:AbortSignal.timeout(8000),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('ORDER_STATUS_UNAVAILABLE'),{status:503});
  const row=Array.isArray(payload)?payload[0]:payload;
  return row&&row.order_id?row:null;
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('x-content-type-options','nosniff');
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  if(!SUPABASE_URL||!SERVICE_KEY)return json(res,503,{ok:false,error:'ORDER_STATUS_UNAVAILABLE'});
  const token=String(req.query?.token||'').trim();
  if(!UUID_RE.test(token))return json(res,404,{ok:false,error:'ORDER_NOT_FOUND'});
  try{
    const row=await readStatus(token);
    if(!row)return json(res,404,{ok:false,error:'ORDER_NOT_FOUND'});
    return json(res,200,{ok:true,order:{
      order_id:row.order_id,
      business_name:row.business_name,
      status:row.workflow_status,
      total_aed:row.total_aed,
      created_at:row.created_at,
      updated_at:row.workflow_updated_at,
    }});
  }catch{return json(res,503,{ok:false,error:'ORDER_STATUS_UNAVAILABLE'})}
}
