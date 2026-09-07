import { json, requireSameOrigin } from './_auth-core.js';
import { readOwnerBody, ownerBroker, ownerSessionToken } from './_owner-broker-client.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Reuse the audited RPC. Provider state, payments and booking lifecycle cannot
// be asserted by a generic status editor.
export const OWNER_OPERATION_ACTIONS=Object.freeze({
  PRODUCT_SET_ACTIVE:{type:'PRODUCT',field:'active'},
  SERVICE_SET_ACTIVE:{type:'SERVICE',field:'active'},
  BRANCH_SET_STATUS:{type:'BRANCH',field:'status'},
  CALENDAR_SET_SYNC:{type:'CALENDAR',field:'sync_enabled'},
});
export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!ownerSessionToken(req))return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  let body;try{body=await readOwnerBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
  const businessId=String(body.business_id||''),entityId=String(body.entity_id||'');
  const action=String(body.action||'').trim().toUpperCase(),definition=Object.hasOwn(OWNER_OPERATION_ACTIONS,action)?OWNER_OPERATION_ACTIONS[action]:null;
  if(!UUID.test(businessId)||!UUID.test(entityId))return json(res,400,{ok:false,error:'INVALID_OPERATION_TARGET'});
  if(!definition)return json(res,400,{ok:false,error:'ACTION_NOT_ALLOWED'});
  const reason=String(body.reason||'').trim(),confirmation=String(body.confirmation||'').trim();
  if(reason.length<8||reason.length>500)return json(res,400,{ok:false,error:'REASON_REQUIRED'});
  if(confirmation!==`EXECUTE ${action}`)return json(res,400,{ok:false,error:'CONFIRMATION_REQUIRED'});
  const value=body.payload?.[definition.field];
  if(definition.field==='status'?!['active','inactive'].includes(value):typeof value!=='boolean')return json(res,400,{ok:false,error:'INVALID_OPERATION_VALUE'});
  const call=await ownerBroker(req,'operation_execute',{business_id:businessId,entity_id:entityId,operation:action,reason,confirmation,payload:{[definition.field]:value}});
  if(call.status!==200||!call.payload.ok)return json(res,call.status,{ok:false,error:call.payload.error||'OWNER_ACTION_FAILED'});
  const receipt=call.payload.payload;
  if(receipt?.result!=='SUCCESS'||!UUID.test(receipt?.audit_id||'')||!receipt.after_state)return json(res,502,{ok:false,error:'OWNER_ACTION_RECEIPT_MISSING',execution_state:'UNKNOWN',retry_safe:false});
  const readback=await ownerBroker(req,'operation_entities',{business_id:businessId,entity_type:definition.type});
  const row=readback.payload?.payload?.entities?.find?.(entry=>entry.id===entityId);
  const verified=readback.status===200&&readback.payload.ok&&row?.[definition.field]===value;
  return json(res,200,{ok:true,result:receipt,readback_verified:verified,readback_error:verified?null:'OWNER_ACTION_READBACK_UNVERIFIED',retry_safe:false});
}
