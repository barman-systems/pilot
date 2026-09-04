import { json, readJsonBody, requireSameOrigin } from '../_auth-core.js';
import { publicBillingState, requireBillingOwner, startBillingTrial } from '../_billing-core.js';

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  try{
    const body=await readJsonBody(req,4096);
    const context=await requireBillingOwner(req,body?.business_id);
    const result=await startBillingTrial(context.businessId);
    const account={
      business_id:result.business_id,
      stripe_customer_id:null,
      stripe_subscription_id:null,
      status:result.status,
      trial_started_at:result.trial_started_at,
      trial_ends_at:result.trial_ends_at,
      cancel_at_period_end:false,
    };
    return json(res,200,{ok:true,started:Boolean(result.started),livemode:false,billing:publicBillingState(account)});
  }catch(error){
    const status=Number(error?.code||error?.status||500);
    const safe=[400,401,403,409,413,429,503,504].includes(status)?status:502;
    console.error('dabbir_billing_trial_failed',{status:safe,error:String(error?.safeCode||error?.message||'BILLING_TRIAL_FAILED').slice(0,120)});
    return json(res,safe,{ok:false,error:String(error?.safeCode||error?.message||'BILLING_TRIAL_FAILED').slice(0,120),livemode:false});
  }
}
