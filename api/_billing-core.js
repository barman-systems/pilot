import crypto from 'node:crypto';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  supabaseRest,
} from './_auth-core.js';
import { withServerReadTimeout } from './_server-read-timeout.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_HOST_RE=/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i;
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const BILLING_READ_TIMEOUT_MS=10_000;
export const DABBIR_OWNER_PLAN_CODE='owner_monthly_v1';
export const DABBIR_EXTRA_BUSINESS_PLAN_CODE='owner_extra_business_v1';
export const DABBIR_EXTRA_BRANCH_PLAN_CODE='owner_extra_branch_v1';
export const DABBIR_TRIAL_DAYS=14;
export const DABBIR_OWNER_MONTHLY_AED=39.99;
export const DABBIR_OWNER_MONTHLY_MINOR=3999;
export const DABBIR_EXTRA_BUSINESS_MONTHLY_AED=29.99;
export const DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR=2999;
export const DABBIR_EXTRA_BRANCH_MONTHLY_AED=19.99;
export const DABBIR_EXTRA_BRANCH_MONTHLY_MINOR=1999;

function billingError(message,code=500){return Object.assign(new Error(message),{code})}
export function safeBusinessId(value){const id=String(value||'').trim();return UUID_RE.test(id)?id:null}

export function requestOrigin(req){
  const rawHost=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(!SAFE_HOST_RE.test(rawHost))throw billingError('INVALID_REQUEST_HOST',400);
  const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const local=rawHost==='localhost'||rawHost.startsWith('localhost:')||rawHost==='127.0.0.1'||rawHost.startsWith('127.0.0.1:');
  return `${local&&forwardedProto==='http'?'http':'https'}://${rawHost}`;
}

function serviceRoleKey(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key.startsWith('sb_publishable_'))throw billingError('BILLING_STORAGE_NOT_CONFIGURED',503);
  return key;
}

export function checkoutIdempotencyKey(businessId,userId,now=Date.now(),pricingKey='base'){
  const bucket=Math.floor(Number(now)/600000);
  return `dabbir_checkout_${crypto.createHash('sha256').update(`${businessId}:${userId}:${pricingKey}:${bucket}`).digest('hex').slice(0,32)}`;
}

function membershipTime(row){const t=Date.parse(String(row?.accepted_at||''));return Number.isFinite(t)?t:0}
export function ownerMemberships(memberships=[]){
  return (Array.isArray(memberships)?memberships:[])
    .filter(row=>String(row?.status||'')==='active'&&String(row?.role||'').toLowerCase()==='owner'&&safeBusinessId(row?.business_id))
    .sort((a,b)=>membershipTime(a)-membershipTime(b)||String(a.business_id).localeCompare(String(b.business_id)));
}
export function billingRootBusinessId(memberships=[]){return ownerMemberships(memberships)[0]?.business_id||null}

export async function requireBillingOwner(req,businessIdValue,options={}){
  const businessId=safeBusinessId(businessIdValue);if(!businessId)throw billingError('BUSINESS_ID_REQUIRED',400);
  const accessToken=accessTokenFromRequest(req);if(!accessToken)throw billingError('AUTH_REQUIRED',401);
  const [user,memberships]=await withServerReadTimeout(
    signal=>Promise.all([
      getVerifiedUser(accessToken,{signal}),
      getBusinessMemberships(accessToken,{signal}),
    ]),
    {label:'BILLING_AUTH_READ',errorCode:'BILLING_AUTH_DATA_TIMEOUT',timeoutMs:options.timeoutMs??BILLING_READ_TIMEOUT_MS},
  );
  if(!user)throw billingError('AUTH_REQUIRED',401);
  const membership=memberships.find(row=>row.business_id===businessId)||null;
  if(!membership)throw billingError('BUSINESS_ACCESS_DENIED',403);
  if(String(membership.role||'').toLowerCase()!=='owner')throw billingError('OWNER_APPROVAL_REQUIRED',403);
  const owned=ownerMemberships(memberships);
  const rootBusinessId=owned[0]?.business_id||businessId;
  return {accessToken,user,membership,memberships,ownedMemberships:owned,businessId,billingRootBusinessId:rootBusinessId};
}

async function parseResponse(response,fallback){
  const text=await response.text();let data=null;let parseFailed=false;
  if(text){try{data=JSON.parse(text)}catch{parseFailed=true}}
  if(!response.ok){const error=billingError(fallback,response.status===401?401:response.status===403?403:response.status===404?404:response.status===409?409:response.status===429?429:503);error.detail=parseFailed?null:data?.error||data?.code||data?.message||null;throw error}
  if(parseFailed||data===null)throw billingError(`${fallback}_INVALID_RESPONSE`,502);
  return data;
}

export async function getBillingAccount(accessToken,billingBusinessId,options={}){
  return withServerReadTimeout(async signal=>{
    const response=await supabaseRest(`dabbir_billing_accounts?select=business_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,trial_started_at,trial_ends_at,current_period_ends_at,cancel_at_period_end,last_invoice_status,updated_at&business_id=eq.${billingBusinessId}&limit=1`,accessToken,{signal});
    const rows=await parseResponse(response,'BILLING_STATUS_UNAVAILABLE');
    if(!Array.isArray(rows))throw billingError('BILLING_STATUS_INVALID_RESPONSE',502);
    if(rows.length===0)return null;
    if(rows.length!==1)throw billingError('BILLING_STATUS_INVALID_RESPONSE',502);
    const account=rows[0];
    if(!account||typeof account!=='object'||Array.isArray(account)||String(account.business_id||'')!==String(billingBusinessId))throw billingError('BILLING_STATUS_INVALID_RESPONSE',502);
    return account;
  },{label:'BILLING_ACCOUNT_READ',errorCode:'BILLING_STATUS_TIMEOUT',timeoutMs:options.timeoutMs??BILLING_READ_TIMEOUT_MS});
}

export async function getPortfolioPricing(accessToken,owned=[]){
  const memberships=ownerMemberships(owned);
  const businessIds=[...new Set(memberships.map(row=>row.business_id))];
  if(!businessIds.length)throw billingError('OWNER_BUSINESS_REQUIRED',403);
  const path=`dabbir_business_branches?select=id,business_id&status=eq.active&is_primary=eq.false&business_id=in.(${businessIds.join(',')})`;
  const response=await supabaseRest(path,accessToken);
  const rows=await parseResponse(response,'BILLING_BRANCH_COUNT_UNAVAILABLE');
  if(!Array.isArray(rows))throw billingError('BILLING_BRANCH_COUNT_INVALID',502);
  const additionalBusinesses=Math.max(0,businessIds.length-1);
  const additionalBranches=rows.length;
  const totalMinor=DABBIR_OWNER_MONTHLY_MINOR+(additionalBusinesses*DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR)+(additionalBranches*DABBIR_EXTRA_BRANCH_MONTHLY_MINOR);
  return {
    businesses:businessIds.length,
    included_businesses:1,
    additional_businesses:additionalBusinesses,
    additional_branches:additionalBranches,
    base_minor:DABBIR_OWNER_MONTHLY_MINOR,
    extra_business_minor:DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR,
    extra_branch_minor:DABBIR_EXTRA_BRANCH_MONTHLY_MINOR,
    total_minor:totalMinor,
    total_aed:Number((totalMinor/100).toFixed(2)),
  };
}

export function publicBillingState(account,pricing=null){
  const p=pricing||{businesses:1,included_businesses:1,additional_businesses:0,additional_branches:0,total_minor:DABBIR_OWNER_MONTHLY_MINOR,total_aed:DABBIR_OWNER_MONTHLY_AED};
  const base={
    plan:'owner',plan_code:DABBIR_OWNER_PLAN_CODE,
    amount:p.total_aed,amount_minor:p.total_minor,
    base_amount:DABBIR_OWNER_MONTHLY_AED,base_amount_minor:DABBIR_OWNER_MONTHLY_MINOR,
    additional_business_amount:DABBIR_EXTRA_BUSINESS_MONTHLY_AED,additional_business_amount_minor:DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR,
    additional_branch_amount:DABBIR_EXTRA_BRANCH_MONTHLY_AED,additional_branch_amount_minor:DABBIR_EXTRA_BRANCH_MONTHLY_MINOR,
    currency:'AED',interval:'month',trial_days:DABBIR_TRIAL_DAYS,mode:'sandbox',pricing:p,
  };
  if(!account)return {...base,status:'not_subscribed',trial_available:true,can_subscribe:true,can_manage:false};
  const status=String(account.status||'unknown');
  return {...base,status,trial_available:!account.trial_started_at&&!account.trial_ends_at,can_subscribe:!['trialing','active','past_due','unpaid','incomplete'].includes(status),can_manage:Boolean(account.stripe_customer_id),trial_ends_at:account.trial_ends_at||null,current_period_ends_at:account.current_period_ends_at||null,cancel_at_period_end:Boolean(account.cancel_at_period_end),last_invoice_status:account.last_invoice_status||null,updated_at:account.updated_at||null};
}

export async function stripeSandboxBridge(action,payload={}){
  const key=serviceRoleKey();
  const response=await fetch(`${SUPABASE_URL}/functions/v1/barman-stripe-checkout`,{
    method:'POST',headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json','x-dabbir-billing-bridge':'v1'}),
    body:JSON.stringify({action,...payload}),cache:'no-store',signal:AbortSignal.timeout(15000),
  });
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok||data?.ok!==true){
    const raw=String(data?.error||'STRIPE_SANDBOX_BRIDGE_FAILED').slice(0,120);
    const code=[400,401,403,404,409,413,429,503].includes(response.status)?response.status:502;
    throw billingError(raw,code);
  }
  if(data?.livemode===true)throw billingError('LIVE_BILLING_DISABLED',503);
  return data;
}
