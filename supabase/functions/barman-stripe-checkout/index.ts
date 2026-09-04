import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const legacyCors={"access-control-allow-origin":"https://bm-uae-store.vercel.app","access-control-allow-headers":"content-type","access-control-allow-methods":"POST,OPTIONS","content-type":"application/json","cache-control":"no-store"};
const DABBIR_PLAN_CODE='owner_monthly_v1';
const DABBIR_AMOUNT_MINOR=2999;
const DABBIR_CURRENCY='aed';
const DABBIR_INTERVAL='month';
const DABBIR_TRIAL_DAYS=14;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cachedVaultSecrets:{secretKey:string,webhookSecret:string}|null=null;
function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:legacyCors});}
function validUuid(value:any){return UUID_RE.test(String(value||''));}
function safeOrigin(value:any){try{const u=new URL(String(value||''));if(u.protocol!=='https:'||u.username||u.password)return null;return u.origin}catch{return null}}
function serviceRoleAuthorized(req:Request){const expected=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');const apiKey=String(req.headers.get('apikey')||'');const auth=String(req.headers.get('authorization')||'');const legacyJwt=expected.split('.').length===3;return Boolean(expected)&&(apiKey===expected||(legacyJwt&&auth===`Bearer ${expected}`))&&req.headers.get('x-dabbir-billing-bridge')==='v1';}
async function vaultSecrets(){if(cachedVaultSecrets)return cachedVaultSecrets;const {data,error}=await db.rpc('dabbir_stripe_sandbox_runtime_secrets_v1');if(error)throw new Error('STRIPE_SANDBOX_VAULT_UNAVAILABLE');const row=Array.isArray(data)?data[0]:data;const secretKey=String(row?.secret_key||'');const webhookSecret=String(row?.webhook_secret||'');cachedVaultSecrets={secretKey,webhookSecret};return cachedVaultSecrets;}
async function sandboxSecret(){let key=String(Deno.env.get('STRIPE_SECRET_KEY')||'');if(!key)key=(await vaultSecrets()).secretKey;if(!key)throw new Error('STRIPE_SECRET_KEY_MISSING');if(key.startsWith('sk_live_'))throw new Error('LIVE_BILLING_DISABLED');if(!key.startsWith('sk_test_'))throw new Error('INVALID_STRIPE_SANDBOX_KEY');return key;}
async function stripeGet(path:string){const key=await sandboxSecret();const r=await fetch(`https://api.stripe.com/v1${path}`,{headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-06-24.preview'}});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(String(data?.error?.code||data?.error?.message||'STRIPE_REQUEST_FAILED').slice(0,120));if(data?.livemode===true)throw new Error('LIVE_BILLING_DISABLED');return data;}
async function stripePost(path:string,params:URLSearchParams,idempotencyKey?:string){const key=await sandboxSecret();const headers:Record<string,string>={Authorization:`Bearer ${key}`,'content-type':'application/x-www-form-urlencoded','Stripe-Version':'2026-06-24.preview'};if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;const r=await fetch(`https://api.stripe.com/v1${path}`,{method:'POST',headers,body:params});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(String(data?.error?.code||data?.error?.message||'STRIPE_REQUEST_FAILED').slice(0,120));if(data?.livemode===true)throw new Error('LIVE_BILLING_DISABLED');return data;}
async function billingPlan(){const {data,error}=await db.from('dabbir_billing_plans').select('plan_code,amount_minor,currency,interval,trial_days,stripe_test_price_id,active').eq('plan_code',DABBIR_PLAN_CODE).eq('active',true).maybeSingle();if(error||!data)throw new Error('BILLING_PLAN_NOT_CONFIGURED');if(Number(data.amount_minor)!==DABBIR_AMOUNT_MINOR||String(data.currency||'').toLowerCase()!==DABBIR_CURRENCY||String(data.interval||'')!==DABBIR_INTERVAL||Number(data.trial_days)!==DABBIR_TRIAL_DAYS)throw new Error('BILLING_PLAN_CONTRACT_MISMATCH');const priceId=String(data.stripe_test_price_id||'');if(!/^price_[A-Za-z0-9]+$/.test(priceId))throw new Error('BILLING_PRICE_NOT_CONFIGURED');return {...data,stripe_test_price_id:priceId};}
async function verifiedStripePrice(plan:any){const price=await stripeGet(`/prices/${encodeURIComponent(plan.stripe_test_price_id)}`);if(price?.active!==true||String(price?.currency||'').toLowerCase()!==DABBIR_CURRENCY||Number(price?.unit_amount)!==DABBIR_AMOUNT_MINOR||String(price?.type||'')!=='recurring'||String(price?.recurring?.interval||'')!==DABBIR_INTERVAL||Number(price?.recurring?.interval_count||1)!==1)throw new Error('BILLING_PRICE_CONTRACT_MISMATCH');return price;}
async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function dabbirBilling(body:any){
 const action=String(body?.action||'');const businessId=String(body?.business_id||'');if(!validUuid(businessId))return json({ok:false,error:'BUSINESS_ID_REQUIRED',livemode:false},400);
 const origin=safeOrigin(body?.return_origin);if(!origin)return json({ok:false,error:'INVALID_RETURN_ORIGIN',livemode:false},400);
 try{
  if(action==='dabbir_checkout'){
   const userId=String(body?.user_id||'');if(!validUuid(userId))return json({ok:false,error:'USER_ID_REQUIRED',livemode:false},400);if(String(body?.plan_code||DABBIR_PLAN_CODE)!==DABBIR_PLAN_CODE)return json({ok:false,error:'INVALID_PLAN_CODE',livemode:false},400);
   const plan=await billingPlan();await verifiedStripePrice(plan);
   const p=new URLSearchParams();p.set('mode','subscription');p.set('client_reference_id',businessId);p.set('line_items[0][price]',plan.stripe_test_price_id);p.set('line_items[0][quantity]','1');p.set('subscription_data[metadata][app]','dabbir');p.set('subscription_data[metadata][business_id]',businessId);p.set('subscription_data[metadata][plan]','owner');p.set('subscription_data[metadata][plan_code]',DABBIR_PLAN_CODE);p.set('metadata[app]','dabbir');p.set('metadata[business_id]',businessId);p.set('metadata[plan]','owner');p.set('metadata[plan_code]',DABBIR_PLAN_CODE);p.set('metadata[environment]','sandbox');p.set('payment_method_collection','always');p.set('allow_promotion_codes','false');p.set('billing_address_collection','auto');p.set('locale','auto');p.set('success_url',`${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`);p.set('cancel_url',`${origin}/?billing=cancelled`);
   const customer=String(body?.stripe_customer_id||'');const email=String(body?.customer_email||'').trim();if(customer){if(!/^cus_[A-Za-z0-9]+$/.test(customer))return json({ok:false,error:'INVALID_STRIPE_CUSTOMER',livemode:false},400);p.set('customer',customer)}else if(email&&email.length<=254)p.set('customer_email',email);
   if(body?.trial_available===true)p.set('subscription_data[trial_period_days]',String(plan.trial_days));
   const bucket=Math.floor(Date.now()/600000);const digest=await sha256(`${businessId}:${userId}:${DABBIR_PLAN_CODE}:${bucket}`);const data=await stripePost('/checkout/sessions',p,`dabbir_checkout_${digest.slice(0,32)}`);if(!data?.url)throw new Error('CHECKOUT_URL_MISSING');return json({ok:true,url:data.url,session_id:data.id,plan_code:DABBIR_PLAN_CODE,livemode:false});
  }
  if(action==='dabbir_portal'){
   const customer=String(body?.stripe_customer_id||'');if(!/^cus_[A-Za-z0-9]+$/.test(customer))return json({ok:false,error:'INVALID_STRIPE_CUSTOMER',livemode:false},400);const p=new URLSearchParams();p.set('customer',customer);p.set('return_url',`${origin}/?billing=portal_return`);const data=await stripePost('/billing_portal/sessions',p);if(!data?.url)throw new Error('PORTAL_URL_MISSING');return json({ok:true,url:data.url,livemode:false});
  }
  return json({ok:false,error:'UNKNOWN_DABBIR_BILLING_ACTION',livemode:false},400);
 }catch(e){const message=String((e as Error)?.message||'STRIPE_SANDBOX_BRIDGE_FAILED').slice(0,120);const blocked=['STRIPE_SECRET_KEY_MISSING','STRIPE_SANDBOX_VAULT_UNAVAILABLE','LIVE_BILLING_DISABLED','INVALID_STRIPE_SANDBOX_KEY','BILLING_PLAN_NOT_CONFIGURED','BILLING_PLAN_CONTRACT_MISMATCH','BILLING_PRICE_NOT_CONFIGURED','BILLING_PRICE_CONTRACT_MISMATCH'].includes(message);return json({ok:false,error:message,livemode:false},blocked?503:502);}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('',{status:204,headers:legacyCors});
 if(req.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(req.headers.get('x-dabbir-billing-bridge')==='v1'){
  if(!serviceRoleAuthorized(req))return json({ok:false,error:'DABBIR_BRIDGE_AUTH_REQUIRED',livemode:false},401);
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:'INVALID_JSON',livemode:false},400)}
  return dabbirBilling(body);
 }
 return json({ok:false,state:'STOPPED',system:'BARMAN_ZAJEL',error:'LEGACY_BILLING_DISABLED'},503);
});