import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeBusinessId(value){const v=String(value||'').trim();return UUID_RE.test(v)?v:null}
function serviceKey(){const k=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();return k&&!k.startsWith('sb_publishable_')?k:null}
async function verifyOwnerSession(token){
  const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store'});
  const p=await r.json().catch(()=>null);
  return r.ok&&p?.authenticated===true&&p?.role==='platform_owner';
}
async function rest(path,key){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:key,authorization:`Bearer ${key}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
  const p=await r.json().catch(()=>null);
  if(!r.ok||!Array.isArray(p))throw Object.assign(new Error('OWNER_BRIDGE_STORAGE_FAILED'),{status:r.status});
  return p;
}
function num(v){return Number.isFinite(Number(v))?Number(v):0}
function billing(rows){
  const a=rows[0]||null;
  if(!a)return {status:'not_subscribed',trial_ends_at:null,current_period_ends_at:null,cancel_at_period_end:false,last_invoice_status:null,updated_at:null};
  return {status:String(a.status||'unknown'),trial_ends_at:a.trial_ends_at||null,current_period_ends_at:a.current_period_ends_at||null,cancel_at_period_end:Boolean(a.cancel_at_period_end),last_invoice_status:a.last_invoice_status||null,updated_at:a.updated_at||null};
}
function whatsapp(rows){
  const w=rows[0]||null;
  if(!w)return {configured:false,connected:false,status:'not_linked',display_phone_number:null,verified_name:null,connected_at:null,last_verified_at:null,last_provider_status:null,last_error:null};
  const status=String(w.status||'unknown');
  return {configured:true,connected:['connected','operational','verified','live'].includes(status.toLowerCase()),status,display_phone_number:w.display_phone_number||null,verified_name:w.verified_name||null,connected_at:w.connected_at||null,last_verified_at:w.last_verified_at||null,last_provider_status:w.last_provider_status||null,last_error:w.last_error?String(w.last_error).slice(0,240):null};
}
function priorities(products,inventory,orders,channels){
  const stock=new Map(inventory.map(x=>[x.product_id,x]));
  const items=[];
  for(const p of products){if(p.active===false)continue;const s=stock.get(p.id)||{quantity:0,reserved:0};const available=Math.max(0,num(s.quantity)-num(s.reserved));if(available<=5)items.push({type:'inventory',severity:available===0?'critical':'warning',title_ar:available===0?`نفد المخزون: ${p.name}`:`مخزون منخفض: ${p.name}`,detail_ar:`المتاح ${available}`});}
  for(const o of orders){if(o.simulated!==false)continue;const st=String(o.status||'').toLowerCase();if(['draft','reserved'].includes(st))items.push({type:'order',severity:'warning',title_ar:st==='reserved'?'طلب محجوز يحتاج متابعة':'طلب غير مكتمل',detail_ar:`${num(o.total_aed).toFixed(2)} د.إ · ${st}`});}
  const live=new Set(['connected','operational','verified','live']);
  for(const c of channels){const st=String(c.status||'').toLowerCase();if(!live.has(st))items.push({type:'channel',severity:'info',title_ar:`تحقق من قناة ${c.channel_type||'غير معروفة'}`,detail_ar:`الحالة: ${c.status||'unknown'}`});}
  const weight={critical:3,warning:2,info:1};items.sort((a,b)=>(weight[b.severity]||0)-(weight[a.severity]||0));
  return {metrics:{urgent:items.filter(x=>x.severity==='critical').length,warning:items.filter(x=>x.severity==='warning').length,total:items.length},items:items.slice(0,20)};
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!token)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  const businessId=safeBusinessId(singleQueryValue(req,'business_id'));
  if(!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
  const key=serviceKey();if(!key)return json(res,503,{ok:false,error:'OWNER_BRIDGE_NOT_CONFIGURED'});
  try{
    if(!(await verifyOwnerSession(token)))return json(res,401,{ok:false,error:'OWNER_SESSION_INVALID'});
    const [billingRows,waRows,products,inventory,orders,channels]=await Promise.all([
      rest(`dabbir_billing_accounts?select=business_id,status,trial_ends_at,current_period_ends_at,cancel_at_period_end,last_invoice_status,updated_at&business_id=eq.${businessId}&limit=1`,key),
      rest(`dabbir_whatsapp_connections?select=business_id,status,display_phone_number,verified_name,connected_at,last_verified_at,last_provider_status,last_error&business_id=eq.${businessId}&limit=1`,key),
      rest(`dabbir_products?select=id,name,active&business_id=eq.${businessId}&limit=200`,key),
      rest(`dabbir_inventory?select=product_id,quantity,reserved&business_id=eq.${businessId}&limit=200`,key),
      rest(`dabbir_orders?select=id,status,total_aed,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,key),
      rest(`dabbir_channels?select=id,channel_type,status,updated_at&business_id=eq.${businessId}&limit=50`,key),
    ]);
    return json(res,200,{ok:true,business_id:businessId,mode:'platform_owner_read_only',billing:billing(billingRows),whatsapp:whatsapp(waRows),priorities:priorities(products,inventory,orders,channels),checked_at:new Date().toISOString()});
  }catch(error){return json(res,Number(error?.status||503)>=500?503:Number(error?.status||500),{ok:false,error:'OWNER_BRIDGE_FAILED'});}
}
