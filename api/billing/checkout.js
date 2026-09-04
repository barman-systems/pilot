import { json, readJsonBody, requireSameOrigin } from '../_auth-core.js';
import { getBillingAccount, requestOrigin, requireBillingOwner, stripeSandboxBridge } from '../_billing-core.js';

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  try{
    const body=await readJsonBody(req,4096);const context=await requireBillingOwner(req,body?.business_id);const account=await getBillingAccount(context.accessToken,context.businessId);
    const status=String(account?.status||'not_subscribed');
    if(account?.stripe_subscription_id&&['trialing','active','past_due','unpaid','incomplete'].includes(status))return json(res,409,{ok:false,error:'SUBSCRIPTION_ALREADY_EXISTS',can_manage:Boolean(account.stripe_customer_id)});
    const result=await stripeSandboxBridge('dabbir_checkout',{
      business_id:context.businessId,
      user_id:context.user.id,
      customer_email:account?.stripe_customer_id?null:(context.user.email||null),
      stripe_customer_id:account?.stripe_customer_id||null,
      return_origin:requestOrigin(req),
    });
    if(!result?.url)throw Object.assign(new Error('CHECKOUT_URL_MISSING'),{code:502});
    return json(res,200,{ok:true,url:result.url,livemode:false});
  }catch(error){
    const status=Number(error?.code||error?.status||500);const safe=[400,401,403,409,413,429,503,504].includes(status)?status:502;console.error('dabbir_billing_checkout_failed',{status:safe,error:String(error?.safeCode||error?.message||'CHECKOUT_FAILED').slice(0,120)});return json(res,safe,{ok:false,error:String(error?.safeCode||error?.message||'CHECKOUT_FAILED').slice(0,120),livemode:false});
  }
}
