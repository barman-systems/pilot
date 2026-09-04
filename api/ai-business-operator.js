import { accessTokenFromRequest, getBusinessMemberships, getVerifiedUser, json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { generateDABBIRAiReply } from './_ai-core.js';
import ownerOperationsHandler from './owner-operations.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const clean=(v,n=800)=>String(v??'').trim().slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):null;

async function auth(req,res,businessId){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const membership=memberships.find(x=>x.business_id===businessId)||null;
  if(!membership){json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});return null}
  if(String(membership.role||'').toLowerCase()!=='owner'){json(res,403,{ok:false,error:'OWNER_REQUIRED'});return null}
  return {token,user,membership};
}

function toolCatalog(){return [
  {name:'create_service',description:'Create a service offered by the business',required:['name','duration_minutes'],risk:'owner_business_write'},
  {name:'create_product',description:'Create a product and opening inventory',required:['sku','name','price_aed','quantity'],risk:'owner_business_write'},
  {name:'set_inventory',description:'Set inventory quantity for an existing product',required:['product_id','quantity'],risk:'owner_business_write'},
  {name:'receive_stock',description:'Receive stock for an existing product',required:['product_id','quantity'],risk:'owner_business_write'},
  {name:'create_expense',description:'Record a business expense',required:['amount_aed','category'],risk:'owner_business_write'}
]}

function parseJsonObject(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{return null}
}

function deterministicPlan(message){
  const text=String(message||'');
  const lower=text.toLowerCase();
  const service=/^(?:أضف|اضف|أنشئ|انشئ|create|add)\s+(?:خدمة|service)\s+(.+?)(?:\s+(?:ب|بسعر|price)\s*([0-9.]+)\s*(?:درهم|aed)?)?(?:\s+(?:لمدة|duration)\s*([0-9]+)\s*(?:دقيقة|minutes?))?$/i.exec(text);
  if(service){return {tool:'create_service',args:{name:clean(service[1],160),price_aed:num(service[2])??0,duration_minutes:Math.trunc(num(service[3])??30),active:true},summary:'Create service'}}
  const expense=/(?:سجل|أضف|اضف|record|add).*?(?:مصروف|expense).*?([0-9]+(?:\.[0-9]+)?)/i.exec(text);
  if(expense){return {tool:'create_expense',args:{amount_aed:num(expense[1]),category:'other',note:clean(text,240)},summary:'Record expense'}}
  if(/مخزون|inventory|stock|منتج|product/.test(lower))return null;
  return null;
}

async function aiPlan(message,language){
  const tools=toolCatalog();
  const prompt=[
    'You are DABBIR AI Business Operator. Convert the owner command into exactly one allowed tool call.',
    'Return JSON only: {"tool":"tool_name","args":{},"summary":"short"}.',
    'If the request cannot be safely mapped to exactly one tool, return {"tool":null,"args":{},"summary":"needs clarification"}.',
    'Never invent IDs. Never execute messaging, payments, refunds, cancellations, or appointments from this endpoint.',
    'Allowed tools: '+JSON.stringify(tools),
    'Owner command: '+message
  ].join('\n');
  try{
    const out=await generateDABBIRAiReply({project:'dabbir_businesses',message:prompt,language,businessContext:'Executable owner operator. Tool selection only; server validates all arguments and permissions.'});
    return out?.ok?parseJsonObject(out.reply):null;
  }catch{return null}
}

function validate(plan){
  if(!plan||!toolCatalog().some(t=>t.name===plan.tool))return null;
  const a=plan.args&&typeof plan.args==='object'?plan.args:{};
  if(plan.tool==='create_service'){
    const name=clean(a.name,160),duration=Math.trunc(num(a.duration_minutes)??0),price=num(a.price_aed)??0;
    if(!name||duration<1||duration>1440||price<0)return null;
    return {action:'create_service',name,price_aed:price,duration_minutes:duration,active:a.active!==false};
  }
  if(plan.tool==='create_product'){
    const sku=clean(a.sku,80),name=clean(a.name,160),price=num(a.price_aed),quantity=Math.trunc(num(a.quantity)??-1);
    if(!sku||!name||price==null||price<0||quantity<0)return null;
    return {action:'create_product',sku,name,price_aed:price,quantity};
  }
  if(plan.tool==='set_inventory'||plan.tool==='receive_stock'){
    const product_id=safeId(a.product_id),quantity=Math.trunc(num(a.quantity)??-1);
    if(!product_id||quantity<0)return null;
    return {action:plan.tool,product_id,quantity,note:clean(a.note,240)};
  }
  if(plan.tool==='create_expense'){
    const amount=num(a.amount_aed),category=clean(a.category||'other',24).toLowerCase();
    if(amount==null||amount<=0)return null;
    return {action:'create_expense',amount_aed:amount,category:['rent','utilities','supplies','salaries','marketing','transport','other'].includes(category)?category:'other',note:clean(a.note,240),occurred_on:clean(a.occurred_on,10)};
  }
  return null;
}

async function executeOwnerOperation(req,payload){
  return await new Promise(resolve=>{
    let statusCode=200,body=null;
    const res={status(code){statusCode=Number(code)||200;return this},setHeader(){return this},end(value=''){try{body=value?JSON.parse(String(value)):null}catch{body=value}resolve({statusCode,body});return this},json(value){body=value;resolve({statusCode,body});return this}};
    const proxy=Object.create(req);
    proxy.method='POST';
    proxy.body=payload;
    proxy.url='/api/owner-operations';
    ownerOperationsHandler(proxy,res).then(()=>{if(body===null)resolve({statusCode,body})}).catch(error=>resolve({statusCode:500,body:{ok:false,error:String(error?.message||'OWNER_OPERATION_FAILED')}}));
  });
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=await readJsonBody(req).catch(()=>null);
  const businessId=safeId(body?.business_id),message=clean(body?.message,800);
  if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
  if(!message)return json(res,400,{ok:false,error:'MESSAGE_REQUIRED'});
  const ctx=await auth(req,res,businessId);if(!ctx)return;
  const language=String(body?.language||'auto').toLowerCase()==='en'?'en':'ar';
  let plan=deterministicPlan(message);
  if(!plan)plan=await aiPlan(message,language);
  const payload=validate(plan);
  if(!payload)return json(res,200,{ok:true,state:'NEEDS_CLARIFICATION',executed:false,message:language==='ar'?'أحتاج تفاصيل أكثر قبل التنفيذ.':'I need more details before execution.',tool:null});
  payload.business_id=businessId;
  const result=await executeOwnerOperation(req,payload);
  const success=result.statusCode>=200&&result.statusCode<300&&result.body?.ok!==false;
  return json(res,success?200:result.statusCode,{ok:success,state:success?'VERIFIED_SUCCESS':'FAILED',executed:success,tool:payload.action,summary:clean(plan?.summary,160),receipt:success?{tool:payload.action,business_id:businessId,verified_by:'OWNER_OPERATIONS_API',result:result.body?.result??result.body}:null,error:success?undefined:(result.body?.error||'TOOL_EXECUTION_FAILED')});
}
