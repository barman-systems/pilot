import { json, requireSameOrigin } from './_auth-core.js';
import { readOwnerBody, ownerSessionToken, ownerBroker } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';

const PRIORITIES=new Set(['P0','P1','P2','P3']);
const OPERATIONS=new Set(['reprioritize','set_due_at','add_guidance','cancel','resume']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function recent(req,limit=30){
  const call=await ownerBroker(req,'ceo_commands',{limit:Math.max(1,Math.min(Number(limit)||30,50))});
  if(!call.payload?.ok)return {status:call.status,ok:false,error:call.payload?.error||'CEO_COMMAND_READ_FAILED',commands:[]};
  const commands=call.payload?.payload?.commands;
  return Array.isArray(commands)?{status:200,ok:true,commands}:{status:502,ok:false,error:'CEO_COMMAND_RESPONSE_INVALID'};
}

async function mutationResult(req,res,call,expected){
  const command=call.payload?.payload?.command;
  if(!UUID.test(command?.id||''))return json(res,502,{ok:false,error:'CEO_COMMAND_RECEIPT_MISSING',retry_safe:false});
  const list=await recent(req,50);
  const row=list.ok?list.commands.find(item=>item.id===command.id):null;
  const verified=Boolean(row&&expected(row));
  return json(res,200,{ok:true,command,commands:list.ok?list.commands:null,readback_verified:verified,readback_error:verified?null:list.error||'CEO_COMMAND_READBACK_MISMATCH',retry_safe:false});
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});

  if(req.method==='GET'){
    const out=await recent(req,singleQueryValue(req,'limit')||30);
    return json(res,out.ok?200:out.status,{ok:out.ok,...(out.ok?{commands:out.commands}:{error:out.error})});
  }

  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  let body;try{body=await readOwnerBody(req,16384)}catch{return json(res,400,{ok:false,error:'INVALID_JSON'})}
  const operation=String(body?.operation||'create').trim().toLowerCase();

  if(operation==='create'){
    const commandText=String(body?.command_text||'').trim();
    const priority=String(body?.priority||'P1').trim().toUpperCase();
    const objective=String(body?.objective||'').trim().slice(0,1000)||null;
    const acceptance=Array.isArray(body?.acceptance_criteria)?body.acceptance_criteria.map(v=>String(v??'').trim().slice(0,500)).filter(Boolean).slice(0,20):[];
    const dueAt=body?.due_at?String(body.due_at):null;
    if(commandText.length<4||commandText.length>4000)return json(res,400,{ok:false,error:'COMMAND_TEXT_INVALID'});
    if(!PRIORITIES.has(priority))return json(res,400,{ok:false,error:'PRIORITY_INVALID'});
    if(dueAt&&Number.isNaN(Date.parse(dueAt)))return json(res,400,{ok:false,error:'DUE_AT_INVALID'});
    const call=await ownerBroker(req,'ceo_command_create',{command_text:commandText,priority,objective,acceptance_criteria:acceptance,due_at:dueAt});
    if(!call.payload?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'CEO_COMMAND_CREATE_FAILED'});
    return mutationResult(req,res,call,row=>row.command_text===commandText&&row.priority===priority&&row.objective===objective&&JSON.stringify(row.acceptance_criteria)===JSON.stringify(acceptance)&&(dueAt?Date.parse(row.due_at)===Date.parse(dueAt):!row.due_at));
  }

  if(!OPERATIONS.has(operation))return json(res,400,{ok:false,error:'UNKNOWN_COMMAND_OPERATION'});
  const commandId=String(body?.command_id||'').trim();
  const priority=String(body?.priority||'').trim().toUpperCase()||null;
  const dueAt=body?.due_at===null?null:body?.due_at?String(body.due_at):undefined;
  const guidance=String(body?.guidance||'').trim().slice(0,2000)||null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId))return json(res,400,{ok:false,error:'INVALID_COMMAND_ID'});
  if(operation==='reprioritize'&&!PRIORITIES.has(priority))return json(res,400,{ok:false,error:'PRIORITY_INVALID'});
  if(operation==='set_due_at'&&dueAt!==null&&(!dueAt||Number.isNaN(Date.parse(dueAt))))return json(res,400,{ok:false,error:'DUE_AT_INVALID'});
  if(operation==='add_guidance'&&(!guidance||guidance.length<3))return json(res,400,{ok:false,error:'GUIDANCE_REQUIRED'});
  const call=await ownerBroker(req,'ceo_command_update',{command_id:commandId,operation,priority,due_at:dueAt,guidance});
  if(!call.payload?.ok)return json(res,call.status===401?401:call.status>=500?503:call.status,{ok:false,error:call.payload?.error||'CEO_COMMAND_UPDATE_FAILED'});
  return mutationResult(req,res,call,row=>row.id===commandId&&(operation==='reprioritize'?row.priority===priority:operation==='set_due_at'?dueAt===null?row.due_at===null:Date.parse(row.due_at)===Date.parse(dueAt):operation==='add_guidance'?row.guidance?.some(item=>item.text===guidance):operation==='cancel'?row.status==='CANCELLED':['QUEUED','IN_PROGRESS'].includes(row.status)));
}
