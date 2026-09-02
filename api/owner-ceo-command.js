import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { ownerBroker } from './_owner-broker-client.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const priorities=new Set(['P0','P1','P2','P3']);
const operations=new Set(['reprioritize','set_due_at','add_guidance','cancel','resume']);

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
 if(req.method==='GET'){
  const call=await ownerBroker(req,'ceo_commands',{limit:50});
  if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'CEO_COMMAND_READ_FAILED'});
  return json(res,200,{ok:true,commands:Array.isArray(call.payload?.payload?.commands)?call.payload.payload.commands:[]});
 }
 if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
 let body;try{body=await readJsonBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
 const operation=String(body?.operation||'create').trim().toLowerCase();
 if(operation==='create'){
  const commandText=String(body?.command_text||'').trim(),priority=String(body?.priority||'P1').trim().toUpperCase(),objective=String(body?.objective||'').trim().slice(0,1000),dueAt=body?.due_at?String(body.due_at):null;
  const acceptance=Array.isArray(body?.acceptance_criteria)?body.acceptance_criteria.map(x=>String(x||'').trim().slice(0,500)).filter(Boolean).slice(0,20):[];
  if(commandText.length<4||commandText.length>4000)return json(res,400,{ok:false,error:'COMMAND_TEXT_INVALID'});
  if(!priorities.has(priority))return json(res,400,{ok:false,error:'PRIORITY_INVALID'});
  const call=await ownerBroker(req,'ceo_command_create',{command_text:commandText,priority,objective:objective||null,acceptance_criteria:acceptance,due_at:dueAt});
  if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'CEO_COMMAND_CREATE_FAILED'});
  return json(res,200,{ok:true,command:call.payload?.payload?.command||null});
 }
 if(!operations.has(operation))return json(res,400,{ok:false,error:'UNKNOWN_COMMAND_OPERATION'});
 const id=String(body?.command_id||'').trim();if(!UUID.test(id))return json(res,400,{ok:false,error:'INVALID_COMMAND_ID'});
 const priority=body?.priority?String(body.priority).trim().toUpperCase():null;if(priority&&!priorities.has(priority))return json(res,400,{ok:false,error:'PRIORITY_INVALID'});
 const call=await ownerBroker(req,'ceo_command_update',{command_id:id,operation,priority,due_at:body?.due_at||null,guidance:String(body?.guidance||'').trim().slice(0,2000)||null});
 if(call.status===401)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 if(call.status!==200||!call.payload?.ok)return json(res,call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'CEO_COMMAND_UPDATE_FAILED'});
 return json(res,200,{ok:true,command:call.payload?.payload?.command||null});
}
