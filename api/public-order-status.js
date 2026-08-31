import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL='https://spohjzrsymsmzsseygtw.supabase.co';
// Publishable keys are public client identifiers, never privileged service credentials.
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const token=String(singleQueryValue(req,'token')||'').trim();
  if(!UUID_RE.test(token))return json(res,400,{ok:false,error:'INVALID_STATUS_TOKEN'});
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_public_order_status`,{
      method:'POST',
      headers:{
        apikey:SUPABASE_PUBLISHABLE_KEY,
        'content-type':'application/json',
        accept:'application/json',
      },
      body:JSON.stringify({p_token:token}),
      cache:'no-store',
    });
    const rows=await response.json().catch(()=>null);
    const row=Array.isArray(rows)?rows[0]:null;
    if(!response.ok)return json(res,502,{ok:false,error:'STATUS_LOOKUP_FAILED'});
    if(!row)return json(res,404,{ok:false,error:'STATUS_NOT_FOUND'});
    return json(res,200,{ok:true,status:{
      business_name:row.business_name||null,
      workflow_status:row.workflow_status||'new',
      total_aed:Number(row.total_aed||0),
      created_at:row.created_at||null,
      workflow_updated_at:row.workflow_updated_at||null,
    }});
  }catch(error){
    console.error('dabbir_public_order_status_failed',{error:String(error?.message||'STATUS_LOOKUP_FAILED').slice(0,120)});
    return json(res,502,{ok:false,error:'STATUS_LOOKUP_FAILED'});
  }
}
