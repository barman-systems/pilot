import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_HOST_RE=/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i;
const STRIPE_API='https://api.stripe.com/v1';
const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
export const DABBIR_OWNER_PRICE_ID='price_1U8yRWLYIkiZam7bHaP2NhtT';
export const DABBIR_TRIAL_DAYS=7;
export const DABBIR_OWNER_MONTHLY_AED=129;

function billingError(message,code=500){return Object.assign(new Error(message),{code})}
export function safeBusinessId(value){const id=String(value||'').trim();return UUID_RE.test(id)?id:null}

export function requestOrigin(req){
  const rawHost=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(!SAFE_HOST_RE.test(rawHost))throw billingError('INVALID_REQUEST_HOST',400);
  const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const local=rawHost==='localhost'||rawHost.startsWith('localhost:')||rawHost==='127.0.0.1'||rawHost.startsWith('127.0.0.1:');
  return `${local&&forwardedProto==='http'?'http':'https'}://${rawHost}`;
}

function stripeSecret(){
  const key=String(process.env.STRIPE_SECRET_KEY||'').trim();
  if(!key)throw billingError('BILLING_NOT_CONFIGURED',503);
  if(key.startsWith('sk_live_'))throw billingError('LIVE_BILLING_DISABLED',503);
  if(!key.startsWith('sk_test_'))throw billingError('INVALID_STRIPE_SANDBOX_KEY',503);
  return key;
}

function serviceRoleKey(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key.startsWith('sb_publishable_'))throw billingError('BILLING_STORAGE_NOT_CONFIGURED',503);
  return key;
}

function appendForm(form,key,value){
  if(value===undefined||value===null)return;
  if(Array.isArray(value)){value.forEach((item,index)=>appendForm(form,`${key}[${index}]`,item));return}
  if(typeof value==='object'){Object.entries(value).forEach(([child,item])=>appendForm(form,`${key}[${child}]`,item));return}
  form.append(key,String(value));
}

export async function stripeRequest(path,{method='GET',params=null,idempotencyKey=null}={}){
  const headers={authorization:`Bearer ${stripeSecret()}`,'stripe-version':'2026-06-24.preview'};
  let url=`${STRIPE_API}${path}`;let body;
  if(params&&method==='GET'){
    const query=new URLSearchParams();Object.entries(params).forEach(([key,value])=>appendForm(query,key,value));url+=`?${query}`;
  }else if(params){
    const form=new URLSearchParams();Object.entries(params).forEach(([key,value])=>appendForm(form,key,value));body=form;headers['content-type']='application/x-www-form-urlencoded';
  }
  if(idempotencyKey)headers['idempotency-key']=idempotencyKey;
  const response=await fetch(url,{method,headers,body,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=billingError(String(data?.error?.code||data?.error?.message||'STRIPE_REQUEST_FAILED').slice(0,120),response.status===429?429:502);error.stripe_status=response.status;throw error}
  return data;
}

export function checkoutIdempotencyKey(businessId,userId,now=Date.now()){
  const bucket=Math.floor(Number(now)/600000);
  return `dabbir_checkout_${crypto.createHash('sha256').update(`${businessId}:${userId}:${bucket}`).digest('hex').slice(0,32)}`;
}

export async function requireBillingOwner(req,businessIdValue){
  const businessId=safeBusinessId(businessIdValue);if(!businessId)throw billingError('BUSINESS_ID_REQUIRED',400);
  const accessToken=accessTokenFromRequest(req);if(!accessToken)throw billingError('AUTH_REQUIRED',401);
  const [user,memberships]=await Promise.all([getVerifiedUser(accessToken),getBusinessMemberships(accessToken).catch(()=>[])]);
  if(!user)throw billingError('AUTH_REQUIRED',401);
  const membership=memberships.find(row=>row.business_id===businessId)||null;
  if(!membership)throw billingError('BUSINESS_ACCESS_DENIED',403);
  if(String(membership.role||'').toLowerCase()!=='owner')throw billingError('OWNER_APPROVAL_REQUIRED',403);
  return {accessToken,user,membership,businessId};
}

async function parseResponse(response,fallback){
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=billingError(fallback,response.status===401?401:response.status===403?403:503);error.detail=data?.code||data?.message||null;throw error}
  return data;
}

export async function getBillingAccount(accessToken,businessId){
  const response=await supabaseRest(`dabbir_billing_accounts?select=business_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,trial_started_at,trial_ends_at,current_period_ends_at,cancel_at_period_end,last_invoice_status,updated_at&business_id=eq.${businessId}&limit=1`,accessToken);
  const rows=await parseResponse(response,'BILLING_STATUS_UNAVAILABLE');return Array.isArray(rows)?rows[0]||null:null;
}

export function publicBillingState(account){
  if(!account)return {plan:'owner',status:'not_subscribed',amount:DABBIR_OWNER_MONTHLY_AED,currency:'AED',interval:'month',trial_days:DABBIR_TRIAL_DAYS,trial_available:true,can_subscribe:true,can_manage:false};
  const status=String(account.status||'unknown');
  return {plan:'owner',status,amount:DABBIR_OWNER_MONTHLY_AED,currency:'AED',interval:'month',trial_days:DABBIR_TRIAL_DAYS,trial_available:!account.trial_started_at&&!account.trial_ends_at,can_subscribe:!['trialing','active','past_due','unpaid','incomplete'].includes(status),can_manage:Boolean(account.stripe_customer_id),trial_ends_at:account.trial_ends_at||null,current_period_ends_at:account.current_period_ends_at||null,cancel_at_period_end:Boolean(account.cancel_at_period_end),last_invoice_status:account.last_invoice_status||null,updated_at:account.updated_at||null};
}

export async function supabaseAdminRest(path,options={}){
  const key=serviceRoleKey();const headers=new Headers(options.headers||{});headers.set('apikey',key);headers.set('authorization',`Bearer ${key}`);headers.set('accept','application/json');if(options.body!==undefined)headers.set('content-type','application/json');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
}
export const parseAdminResponse=(response,fallback)=>parseResponse(response,fallback);
export function unixToIso(value){const seconds=Number(value||0);return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null}
export function stripeObjectId(value){if(!value)return null;return typeof value==='string'?value:typeof value.id==='string'?value.id:null}
export function subscriptionSnapshot(subscription,fallbackBusinessId=null){
  const item=subscription?.items?.data?.[0]||null;const businessId=safeBusinessId(subscription?.metadata?.business_id||fallbackBusinessId);if(!businessId)throw billingError('STRIPE_BUSINESS_METADATA_MISSING',422);
  return {business_id:businessId,stripe_customer_id:stripeObjectId(subscription.customer),stripe_subscription_id:String(subscription.id||''),stripe_price_id:stripeObjectId(item?.price),status:String(subscription.status||'unknown'),trial_started_at:unixToIso(subscription.trial_start),trial_ends_at:unixToIso(subscription.trial_end),current_period_ends_at:unixToIso(subscription.current_period_end||item?.current_period_end),cancel_at_period_end:Boolean(subscription.cancel_at_period_end),canceled_at:unixToIso(subscription.canceled_at),latest_invoice_id:stripeObjectId(subscription.latest_invoice),stripe_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()};
}

export function verifyStripeSignature(rawBody,signatureHeader,secret,nowSeconds=Math.floor(Date.now()/1000),toleranceSeconds=300){
  if(!signatureHeader||!secret)throw billingError('BILLING_WEBHOOK_NOT_CONFIGURED',503);
  const parts=String(signatureHeader).split(',').map(part=>part.trim());const timestamp=Number(parts.find(part=>part.startsWith('t='))?.slice(2)||0);const signatures=parts.filter(part=>part.startsWith('v1=')).map(part=>part.slice(3));
  if(!Number.isFinite(timestamp)||timestamp<=0||Math.abs(nowSeconds-timestamp)>toleranceSeconds)throw billingError('INVALID_WEBHOOK_TIMESTAMP',400);
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer=Buffer.from(expected,'hex');const valid=signatures.some(value=>{if(!/^[0-9a-f]{64}$/i.test(value))return false;const actual=Buffer.from(value,'hex');return actual.length===expectedBuffer.length&&crypto.timingSafeEqual(actual,expectedBuffer)});
  if(!valid)throw billingError('INVALID_WEBHOOK_SIGNATURE',400);return true;
}
