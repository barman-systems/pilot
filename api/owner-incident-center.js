import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { ownerBroker } from './_owner-broker-client.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAB=/^DAB-[0-9]{6,}$/i;
const CATS=new Set(['ACCESS','BILLING','WHATSAPP','INVENTORY','ORDERS','TEAM','DATA','TECHNICAL','INTEGRATION','GENERAL']);
const PRI=new Set(['low','normal','high','urgent']);
const ST=new Set(['open','diagnosing','action_required','waiting_customer','escalated','resolved','closed']);
const Q=new Set(['owner','support','engineering','billing','identity','external_provider']);
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
export default async function handler(req,res){
 res.setHeader('cache-control','no-store, max-age=0');
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 if(req.method==='GET'){
  const incidentId=clean(singleQueryValue(req,'incident_id'),80),customerNo=clean(singleQueryValue(req,'customer_no'),40).toUpperCase(),businessId=clean(singleQueryValue(req,'business_id'),80);
  if(incidentId&&!UUID.test(incidentId))return json(res,400,{ok:false,error:'INVALID_INCIDENT_ID'});
  if(customerNo&&!DAB.test(customerNo))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
  if(businessId&&!UUID.test(businessId))return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
  const {status,payload}=await ownerBroker(req,'incidents',{incident_id:incidentId||undefined,customer_no:customerNo||undefined,business_id:businessId||undefined});
  if(status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(status!==200||!payload?.ok)return json(res,status>=500?503:status,{ok:false,error:payload?.error||'INCIDENT_READ_FAILED'});
  return json(res,200,payload);
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,24576)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const operation=clean(body.operation,20).toLowerCase();
 if(operation==='create'){
  const customerNo=clean(body.customer_no,40).toUpperCase(),businessId=clean(body.business_id,80),category=clean(body.category,30).toUpperCase(),priority=clean(body.priority,20).toLowerCase(),summary=clean(body.summary,200),description=clean(body.description,4000),assignedQueue=clean(body.assigned_queue,40).toLowerCase();
  if(!DAB.test(customerNo))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
  if(businessId&&!UUID.test(businessId))return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
  if(!CATS.has(category)||!PRI.has(priority)||!Q.has(assignedQueue))return json(res,400,{ok:false,error:'INVALID_INCIDENT_FIELDS'});
  if(summary.length<3)return json(res,400,{ok:false,error:'INCIDENT_SUMMARY_REQUIRED'});
  const {status,payload}=await ownerBroker(req,'incident_action',{operation:'create',customer_no:customerNo,business_id:businessId||undefined,category,priority,summary,description,assigned_queue:assignedQueue});
  if(status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(status!==200||!payload?.ok)return json(res,status>=500?503:status,{ok:false,error:payload?.error||'INCIDENT_CREATE_FAILED'});
  return json(res,200,payload);
 }
 if(operation==='update'){
  const incidentId=clean(body.incident_id,80),statusValue=clean(body.status,30).toLowerCase(),priority=clean(body.priority,20).toLowerCase(),assignedQueue=clean(body.assigned_queue,40).toLowerCase(),rootCause=clean(body.root_cause,4000),resolution=clean(body.resolution,4000),note=clean(body.note,4000);
  if(!UUID.test(incidentId))return json(res,400,{ok:false,error:'INVALID_INCIDENT_ID'});
  if(statusValue&&!ST.has(statusValue))return json(res,400,{ok:false,error:'INVALID_INCIDENT_STATUS'});
  if(priority&&!PRI.has(priority))return json(res,400,{ok:false,error:'INVALID_INCIDENT_PRIORITY'});
  if(assignedQueue&&!Q.has(assignedQueue))return json(res,400,{ok:false,error:'INVALID_INCIDENT_QUEUE'});
  const {status,payload}=await ownerBroker(req,'incident_action',{operation:'update',incident_id:incidentId,status:statusValue||undefined,priority:priority||undefined,assigned_queue:assignedQueue||undefined,root_cause:rootCause||undefined,resolution:resolution||undefined,note:note||undefined});
  if(status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(status!==200||!payload?.ok)return json(res,status>=500?503:status,{ok:false,error:payload?.error||'INCIDENT_UPDATE_FAILED'});
  return json(res,200,payload);
 }
 return json(res,400,{ok:false,error:'UNKNOWN_INCIDENT_OPERATION'});
}
