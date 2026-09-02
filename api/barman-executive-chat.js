import { json } from './_auth-core.js';
import { decideExecutiveMessage, serviceRoleKey, verifySignedBody } from './_barman-executive-core.js';

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  let key;
  try{key=serviceRoleKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
  const body=req.body&&typeof req.body==='object'?req.body:{};
  const raw=JSON.stringify(body);
  if(!verifySignedBody(raw,req.headers['x-barman-timestamp'],req.headers['x-barman-signature'],key))
    return json(res,401,{ok:false,error:'BARMAN_SIGNATURE_REQUIRED'});
  const text=String(body.text||'').trim();
  if(!text||text.length>4000)return json(res,400,{ok:false,error:'MESSAGE_INVALID'});
  const decision=await decideExecutiveMessage({text,memory:body.memory,commands:body.commands});
  return json(res,200,{ok:true,decision});
}
