import { singleQueryValue } from '../_request-query.js';
import { json } from '../_auth-core.js';
import { getBillingAccount, getPortfolioPricing, publicBillingState, requireBillingOwner } from '../_billing-core.js';

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  try{
    const context=await requireBillingOwner(req,singleQueryValue(req,'business_id'));
    const [account,pricing]=await Promise.all([
      getBillingAccount(context.accessToken,context.billingRootBusinessId),
      getPortfolioPricing(context.accessToken,context.ownedMemberships),
    ]);
    return json(res,200,{ok:true,livemode:false,billing:publicBillingState(account,pricing)});
  }catch(error){
    const status=Number(error?.code||error?.status||500);return json(res,[400,401,403,429,503,504].includes(status)?status:500,{ok:false,error:String(error?.safeCode||error?.message||'BILLING_STATUS_UNAVAILABLE').slice(0,120),livemode:false});
  }
}
