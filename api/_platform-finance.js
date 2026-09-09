const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');

function serviceRoleKey(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!SUPABASE_URL||!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('PLATFORM_FINANCE_NOT_CONFIGURED'),{status:503});
  return key;
}

async function rpc(name,body,{timeoutMs=10000}={}){
  const key=serviceRoleKey();
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify(body||{}),
    signal:AbortSignal.timeout(timeoutMs)
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('PLATFORM_FINANCE_RPC_FAILED'),{status:503,provider_status:response.status});
  return payload;
}

export async function platformPnlMonth(month=null){
  return rpc('dabbir_platform_pnl_month_v1',{p_month:month||null});
}

export async function recordPlatformFinanceEvent(event){
  const sourceKey=String(event?.source_event_key||'').trim();
  if(!sourceKey)throw Object.assign(new Error('PLATFORM_FINANCE_SOURCE_KEY_REQUIRED'),{status:400});
  return rpc('dabbir_platform_finance_record_event_v1',{
    p_source_event_key:sourceKey,
    p_direction:String(event?.direction||'').trim().toUpperCase(),
    p_category:String(event?.category||'').trim().toUpperCase(),
    p_provider:String(event?.provider||'').trim(),
    p_business_id:event?.business_id||null,
    p_amount:event?.amount,
    p_currency:String(event?.currency||'').trim().toUpperCase(),
    p_amount_aed:event?.amount_aed,
    p_authority:String(event?.authority||'').trim().toUpperCase(),
    p_occurred_at:event?.occurred_at||new Date().toISOString(),
    p_metadata:event?.metadata&&typeof event.metadata==='object'&&!Array.isArray(event.metadata)?event.metadata:{}
  });
}
