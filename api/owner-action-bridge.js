import { json, readJsonBody, requireSameOrigin, SUPABASE_URL } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker } from './_owner-broker-client.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['set_inventory','set_product_active','cancel_pending_order','set_service_active','support_create_case','support_add_note','support_set_status']);
const OPTIONAL=new Set(['support_create_case']);
const safe=v=>UUID.test(String(v||'').trim())?String(v).trim():null;
const serviceKey=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
async function assertOwner(req){const call=await ownerBroker(req,'executive');return call.status===200&&call.payload?.ok===true?{ok:true}:{ok:false,status:call.status===401?401:503}}
async function rpc(key,name,params){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',cache:'no-store',headers:supabaseKeyHeaders(key,{'content-type':'application/json',accept:'application/json'}),body:JSON.stringify(params)});const p=await r.json().catch(()=>null);return{status:r.status,ok:r.ok,payload:p}}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 const auth=await assertOwner(req);if(!auth.ok)return json(res,auth.status,{ok:false,error:auth.status===401?'OWNER_SESSION_REQUIRED':'OWNER_AUTH_UNAVAILABLE'});
 const key=serviceKey();if(!key)return json(res,503,{ok:false,error:'OWNER_EXECUTOR_NOT_CONFIGURED'});
 if(req.method==='GET'){
  const businessId=safe(singleQueryValue(req,'business_id'));if(!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
  const audit=await rpc(key,'dabbir_platform_owner_audit_v1',{p_business_id:businessId,p_limit:100});
  if(!audit.ok)return json(res,503,{ok:false,error:'OWNER_AUDIT_FAILED'});
  return json(res,200,{ok:true,business_id:businessId,mode:'platform_owner_audited_actions',actions:[...ACTIONS],audit:Array.isArray(audit.payload)?audit.payload:[]});
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const businessId=safe(body.business_id),action=String(body.action||'').trim(),raw=String(body.entity_id||'').trim(),entityId=raw?safe(raw):null,reason=String(body.reason||'').trim().slice(0,500),confirmation=String(body.confirmation||'').trim();
 if(!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});if(!ACTIONS.has(action))return json(res,400,{ok:false,error:'ACTION_NOT_ALLOWED'});if((!OPTIONAL.has(action)&&!entityId)||(raw&&!entityId))return json(res,400,{ok:false,error:'INVALID_ENTITY_ID'});if(reason.length<8)return json(res,400,{ok:false,error:'REASON_REQUIRED'});if(confirmation!=='EXECUTE')return json(res,400,{ok:false,error:'CONFIRMATION_REQUIRED'});
 const payload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload:{};
 const call=await rpc(key,'dabbir_platform_owner_action_v1',{p_business_id:businessId,p_action:action,p_entity_id:entityId,p_reason:reason,p_confirmation:confirmation,p_payload:payload});
 if(!call.ok)return json(res,call.status>=500?503:400,{ok:false,error:call.payload?.message||call.payload?.code||'OWNER_ACTION_FAILED'});
 const audit=await rpc(key,'dabbir_platform_owner_audit_v1',{p_business_id:businessId,p_limit:100});
 return json(res,200,{ok:true,result:call.payload||null,audit:Array.isArray(audit.payload)?audit.payload:[]});
}
