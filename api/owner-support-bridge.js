import { json, requireSameOrigin } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';
import { readOwnerBody, ownerBroker, ownerSessionToken } from './_owner-broker-client.js';
const DAB=/^DAB-[0-9]{6,}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(!ownerSessionToken(req))return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(req.method==='GET'){
    const no=String(singleQueryValue(req,'customer_no')||'').trim().toUpperCase();
    if(no&&!DAB.test(no))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
    const call=await ownerBroker(req,'support',{customer_no:no||null});
    if(call.status!==200||!call.payload.ok)return json(res,call.status,call.payload);
    const cases=call.payload.payload?.cases;
    if(!Array.isArray(cases))return json(res,502,{ok:false,error:'SUPPORT_RESPONSE_INVALID'});
    return json(res,200,{ok:true,cases});
  }
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  let body;try{body=await readOwnerBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
  const operation=String(body.operation||'').toUpperCase();
  if(!['CREATE','ADD_NOTE','UPDATE','REPLY_CUSTOMER'].includes(operation))return json(res,400,{ok:false,error:'UNKNOWN_SUPPORT_OPERATION'});
  const payload={operation};
  for(const key of ['case_id','target_user_id','business_id']){
    if(body[key]&&!UUID.test(String(body[key])))return json(res,400,{ok:false,error:'INVALID_SUPPORT_TARGET'});
    if(body[key])payload[key]=body[key];
  }
  if(operation!=='CREATE'&&!payload.case_id)return json(res,400,{ok:false,error:'SUPPORT_CASE_REQUIRED'});
  const no=String(body.customer_no||'').trim().toUpperCase();
  if(no&&!DAB.test(no))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
  if(no)payload.customer_no=no;
  for(const [key,max] of Object.entries({subject:240,note:4000,diagnostic:4000,resolution:4000,priority:20,category:40,status:30})){
    if(body[key]!==undefined)payload[key]=String(body[key]).trim().slice(0,max);
  }
  if(operation==='CREATE'&&(!payload.target_user_id||!no||!payload.subject))return json(res,400,{ok:false,error:'SUPPORT_CREATE_INVALID'});
  if(operation==='ADD_NOTE'&&!payload.note)return json(res,400,{ok:false,error:'SUPPORT_NOTE_REQUIRED'});
  if(operation==='REPLY_CUSTOMER'&&(!no||!payload.note||payload.note.length<2))return json(res,400,{ok:false,error:'SUPPORT_REPLY_REQUIRED'});
  if(operation==='UPDATE'&&!['priority','status','diagnostic','resolution','note'].some(key=>payload[key]))return json(res,400,{ok:false,error:'SUPPORT_CHANGE_REQUIRED'});
  if(payload.category&&!['general','access','billing','data','recovery','whatsapp','integration','bug','abuse','privacy','other'].includes(payload.category))return json(res,400,{ok:false,error:'INVALID_SUPPORT_CATEGORY'});
  if(payload.priority&&!['low','normal','high','urgent'].includes(payload.priority))return json(res,400,{ok:false,error:'INVALID_SUPPORT_PRIORITY'});
  if(payload.status&&!['open','waiting','resolved'].includes(payload.status))return json(res,400,{ok:false,error:'INVALID_SUPPORT_STATUS'});
  const call=await ownerBroker(req,'support_action',payload);
  if(call.status!==200||!call.payload.ok)return json(res,call.status,call.payload);
  const receipt=call.payload.payload;
  const reply=operation==='REPLY_CUSTOMER',caseId=reply?receipt?.id:receipt?.case_id;
  if(!UUID.test(caseId||'')||(reply?!UUID.test(receipt?.message_id||''):receipt?.result!=='SUCCESS'))return json(res,502,{ok:false,error:'SUPPORT_RECEIPT_MISSING',retry_safe:false});
  const readback=await ownerBroker(req,'support',{customer_no:no||null});
  const cases=readback.payload?.payload?.cases;
  const found=readback.status===200&&readback.payload.ok&&Array.isArray(cases)&&cases.some(row=>row.id===caseId&&['subject','priority','status','diagnostic','resolution'].every(key=>!payload[key]||row[key]===payload[key])&&(!payload.note||(reply?row.messages?.some(m=>m.id===receipt.message_id&&m.author_kind==='support'&&m.body===payload.note):row.notes?.some(note=>note.note===payload.note))));
  return json(res,200,{ok:true,result:receipt,cases:found?cases:null,readback_verified:found,retry_safe:false});
}
