import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const legacyCors={"access-control-allow-origin":"https://bm-uae-store.vercel.app","access-control-allow-headers":"content-type","access-control-allow-methods":"POST,OPTIONS","content-type":"application/json","cache-control":"no-store"};
const DABBIR_PRICE_ID='price_1U8yRWLYIkiZam7bHaP2NhtT';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:legacyCors});}
function validUuid(value:any){return UUID_RE.test(String(value||''));}
function safeOrigin(value:any){try{const u=new URL(String(value||''));if(u.protocol!=='https:'||u.username||u.password)return null;return u.origin}catch{return null}}
function serviceRoleAuthorized(req:Request){const expected=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');const actual=String(req.headers.get('authorization')||'');return Boolean(expected)&&actual===`Bearer ${expected}`&&req.headers.get('x-dabbir-billing-bridge')==='v1';}
function sandboxSecret(){const key=String(Deno.env.get('STRIPE_SECRET_KEY')||'');if(!key)throw new Error('STRIPE_SECRET_KEY_MISSING');if(key.startsWith('sk_live_'))throw new Error('LIVE_BILLING_DISABLED');if(!key.startsWith('sk_test_'))throw new Error('INVALID_STRIPE_SANDBOX_KEY');return key;}
async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function stripePost(path:string,params:URLSearchParams,idempotencyKey?:string){const headers:Record<string,string>={Authorization:`Bearer ${sandboxSecret()}`,'content-type':'application/x-www-form-urlencoded','Stripe-Version':'2026-06-24.preview'};if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;const r=await fetch(`https://api.stripe.com/v1${path}`,{method:'POST',headers,body:params});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(String(data?.error?.code||data?.error?.message||'STRIPE_REQUEST_FAILED').slice(0,120));if(data?.livemode===true)throw new Error('LIVE_BILLING_DISABLED');return data;}

async function dabbirBilling(body:any){
 const action=String(body?.action||'');const businessId=String(body?.business_id||'');if(!validUuid(businessId))return json({ok:false,error:'BUSINESS_ID_REQUIRED',livemode:false},400);
 const origin=safeOrigin(body?.return_origin);if(!origin)return json({ok:false,error:'INVALID_RETURN_ORIGIN',livemode:false},400);
 try{
  if(action==='dabbir_checkout'){
   const userId=String(body?.user_id||'');if(!validUuid(userId))return json({ok:false,error:'USER_ID_REQUIRED',livemode:false},400);
   const p=new URLSearchParams();p.set('mode','subscription');p.set('client_reference_id',businessId);p.set('line_items[0][price]',DABBIR_PRICE_ID);p.set('line_items[0][quantity]','1');p.set('subscription_data[metadata][app]','dabbir');p.set('subscription_data[metadata][business_id]',businessId);p.set('subscription_data[metadata][plan]','owner');p.set('metadata[app]','dabbir');p.set('metadata[business_id]',businessId);p.set('metadata[plan]','owner');p.set('metadata[environment]','sandbox');p.set('payment_method_collection','always');p.set('allow_promotion_codes','false');p.set('billing_address_collection','auto');p.set('locale','auto');p.set('success_url',`${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`);p.set('cancel_url',`${origin}/?billing=cancelled`);
   const customer=String(body?.stripe_customer_id||'');const email=String(body?.customer_email||'').trim();if(customer){if(!/^cus_[A-Za-z0-9]+$/.test(customer))return json({ok:false,error:'INVALID_STRIPE_CUSTOMER',livemode:false},400);p.set('customer',customer)}else if(email&&email.length<=254)p.set('customer_email',email);
   if(body?.trial_available===true)p.set('subscription_data[trial_period_days]','7');
   const bucket=Math.floor(Date.now()/600000);const digest=await sha256(`${businessId}:${userId}:${bucket}`);const data=await stripePost('/checkout/sessions',p,`dabbir_checkout_${digest.slice(0,32)}`);if(!data?.url)throw new Error('CHECKOUT_URL_MISSING');return json({ok:true,url:data.url,session_id:data.id,livemode:false});
  }
  if(action==='dabbir_portal'){
   const customer=String(body?.stripe_customer_id||'');if(!/^cus_[A-Za-z0-9]+$/.test(customer))return json({ok:false,error:'INVALID_STRIPE_CUSTOMER',livemode:false},400);const p=new URLSearchParams();p.set('customer',customer);p.set('return_url',`${origin}/?billing=portal_return`);const data=await stripePost('/billing_portal/sessions',p);if(!data?.url)throw new Error('PORTAL_URL_MISSING');return json({ok:true,url:data.url,livemode:false});
  }
  return json({ok:false,error:'UNKNOWN_DABBIR_BILLING_ACTION',livemode:false},400);
 }catch(e){const message=String((e as Error)?.message||'STRIPE_SANDBOX_BRIDGE_FAILED').slice(0,120);const blocked=['STRIPE_SECRET_KEY_MISSING','LIVE_BILLING_DISABLED','INVALID_STRIPE_SANDBOX_KEY'].includes(message);return json({ok:false,error:message,livemode:false},blocked?503:502);}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('',{status:204,headers:legacyCors});
 if(req.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(req.headers.get('x-dabbir-billing-bridge')==='v1'){
  if(!serviceRoleAuthorized(req))return json({ok:false,error:'DABBIR_BRIDGE_AUTH_REQUIRED',livemode:false},401);
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:'INVALID_JSON',livemode:false},400)}
  return dabbirBilling(body);
 }

 // Legacy ZAJEL path: preserved byte-for-byte in behavior; DABBIR never enters this branch.
 const {data:paymentAllowed,error:gateErr}=await db.rpc('barman_payment_execution_allowed',{p_project_key:'ZAJEL'});
 if(gateErr)return json({ok:false,state:'BLOCKED',error:'PAYMENT_ACTIVATION_GATE_ERROR'},503);
 if(paymentAllowed!==true)return json({ok:false,state:'BLOCKED',error:'PAYMENT_LIVE_NOT_APPROVED',owner_action:'OWNER_APPROVAL_REQUIRED',paid_action_executed:false},409);
 let body:any={};try{body=await req.json()}catch{return json({ok:false,error:'INVALID_JSON'},400)}
 const productKey=String(body?.product_key||'').trim();const quantity=Math.max(1,Math.min(5,Number(body?.quantity||1)));if(!productKey)return json({ok:false,error:'PRODUCT_KEY_REQUIRED'},400);
 const {data:product,error:pErr}=await db.rpc('barman_get_sellable_product',{p_product_key:productKey});if(pErr)return json({ok:false,error:'PRODUCT_GATE_ERROR'},500);if(!product)return json({ok:false,state:'BLOCKED',error:'PRODUCT_NOT_SELLABLE_OR_STOCK_UNVERIFIED'},409);
 const secret=Deno.env.get('STRIPE_SECRET_KEY');if(!secret)return json({ok:false,state:'BLOCKED',error:'STRIPE_SECRET_KEY_MISSING'},503);const amount=Math.round(Number(product.target_price_aed)*100);if(!Number.isFinite(amount)||amount<=0)return json({ok:false,error:'INVALID_PRICE'},500);
 const params=new URLSearchParams();params.set('mode','payment');params.set('success_url','https://bm-uae-store.vercel.app/?checkout=success&session_id={CHECKOUT_SESSION_ID}');params.set('cancel_url','https://bm-uae-store.vercel.app/?checkout=cancel');params.set('currency','aed');params.set('line_items[0][quantity]',String(quantity));params.set('line_items[0][price_data][currency]','aed');params.set('line_items[0][price_data][unit_amount]',String(amount));params.set('line_items[0][price_data][product_data][name]',String(product.name_en||product.name_ar||product.product_key));params.set('metadata[product_key]',productKey);
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'content-type':'application/x-www-form-urlencoded'},body:params});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{data={}};if(!r.ok)return json({ok:false,state:'FAILED',error:data?.error?.code||'STRIPE_CHECKOUT_CREATE_FAILED'},502);return json({ok:true,state:'READY',session_id:data.id,url:data.url});
});
