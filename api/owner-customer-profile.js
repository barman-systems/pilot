import { json } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker } from './_owner-broker-client.js';
const DAB=/^DAB-[0-9]{6,}$/i;
export default async function handler(req,res){res.setHeader('cache-control','no-store, max-age=0');if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});const customerNo=String(singleQueryValue(req,'customer_no')||'').trim().toUpperCase();if(!DAB.test(customerNo))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});const{status,payload}=await ownerBroker(req,'customer_profile',{customer_no:customerNo});if(status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});if(status!==200||!payload?.ok)return json(res,status>=500?503:status,{ok:false,error:payload?.error||'OWNER_CUSTOMER_PROFILE_FAILED'});return json(res,200,{ok:true,profile:payload.profile||null})}
