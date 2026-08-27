import { json, readJsonBody, requireSameOrigin } from '../_auth-core.js';
import { checkoutIdempotencyKey, DABBIR_OWNER_PRICE_ID, DABBIR_TRIAL_DAYS, getBillingAccount, requestOrigin, requireBillingOwner, stripeRequest } from '../_billing-core.js';

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  try{
    const body=await readJsonBody(req,4096);const context=await requireBillingOwner(req,body?.business_id);const account=await getBillingAccount(context.accessToken,context.businessId);
    if(account&&['trialing','active','past_due','unpaid','incomplete'].includes(String(account.status)))return json(res,409,{ok:false,error:'SUBSCRIPTION_ALREADY_EXISTS',can_manage:Boolean(account.stripe_customer_id)});
    const origin=requestOrigin(req);const trialAvailable=!account?.trial_started_at&&!account?.trial_ends_at;
    const params={mode:'subscription',client_reference_id:context.businessId,line_items:[{price:DABBIR_OWNER_PRICE_ID,quantity:1}],subscription_data:{metadata:{app:'dabbir',business_id:context.businessId,plan:'owner'}},metadata:{app:'dabbir',business_id:context.businessId,plan:'owner',environment:'sandbox'},payment_method_collection:'always',allow_promotion_codes:'false',billing_address_collection:'auto',locale:'auto',success_url:`${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/?billing=cancelled`};
    if(account?.stripe_customer_id)params.customer=account.stripe_customer_id;else if(context.user.email)params.customer_email=context.user.email;
    if(trialAvailable)params.subscription_data.trial_period_days=DABBIR_TRIAL_DAYS;
    const session=await stripeRequest('/checkout/sessions',{method:'POST',params,idempotencyKey:checkoutIdempotencyKey(context.businessId,context.user.id)});
    if(session?.livemode)throw Object.assign(new Error('LIVE_CHECKOUT_REJECTED'),{code:503});if(!session?.url)throw Object.assign(new Error('CHECKOUT_URL_MISSING'),{code:502});
    return json(res,200,{ok:true,url:session.url,livemode:false});
  }catch(error){
    const status=Number(error?.code||500);const safe=[400,401,403,409,413,429,503].includes(status)?status:502;console.error('dabbir_billing_checkout_failed',{status:safe,error:String(error?.message||'CHECKOUT_FAILED').slice(0,120)});return json(res,safe,{ok:false,error:String(error?.message||'CHECKOUT_FAILED').slice(0,120),livemode:false});
  }
}
