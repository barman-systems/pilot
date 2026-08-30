import { json, requireSameOrigin } from '../_auth-core.js';
const COOKIE='__Host-dabbir_owner_session';
export default async function handler(req,res){res.setHeader('cache-control','no-store, max-age=0');if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});res.setHeader('set-cookie',`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);return json(res,200,{ok:true});}
