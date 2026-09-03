import crypto from 'node:crypto';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
function key(){
  const value=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!value||value.startsWith('sb_publishable_'))throw Object.assign(new Error('RATE_LIMIT_STORAGE_NOT_CONFIGURED'),{status:503});
  return value;
}
function clientAddress(req){
  const raw=clean(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'',400);
  return raw.split(',')[0].trim().slice(0,120)||'unknown';
}
function digest(value){return crypto.createHash('sha256').update(String(value)).digest('hex')}
async function read(response){
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}
  if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.code||'RATE_LIMIT_FAILED'),{status:response.status});
  return Array.isArray(payload)?payload[0]||null:payload;
}

export async function consumeRateLimit(req,{action,limit,windowSeconds,subject=null,failClosed=true}={}){
  const name=clean(action,80);if(!name)throw Object.assign(new Error('RATE_LIMIT_ACTION_REQUIRED'),{status:500});
  const identity=subject?clean(subject,300):clientAddress(req);
  const keyHash=digest(`${name}:${identity}`);
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/dabbir_consume_rate_limit`,{
      method:'POST',cache:'no-store',signal:AbortSignal.timeout(5000),
      headers:supabaseKeyHeaders(key(),{'content-type':'application/json',accept:'application/json'}),
      body:JSON.stringify({p_action:name,p_key_hash:keyHash,p_limit:Number(limit||30),p_window_seconds:Number(windowSeconds||60)}),
    });
    const row=await read(response);
    return {allowed:row?.allowed===true,remaining:Number(row?.remaining||0),retryAfter:Number(row?.retry_after||1)};
  }catch(error){
    if(failClosed)throw Object.assign(new Error('RATE_LIMIT_UNAVAILABLE'),{status:503,cause:error});
    return {allowed:true,remaining:0,retryAfter:0,degraded:true};
  }
}

export function rateLimitHeaders(result){
  return result?.allowed===false?{'retry-after':String(Math.max(1,Number(result.retryAfter||1)))}:{};
}
