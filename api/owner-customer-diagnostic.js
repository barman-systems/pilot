import { json, parseCookies } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const CUSTOMER_RE=/^DAB-[0-9]{6,}$/i;
const key=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const enc=v=>encodeURIComponent(String(v));

async function verify(token){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store'});const p=await r.json().catch(()=>null);return r.ok&&p?.authenticated===true&&p?.role==='platform_owner'}
async function rest(path,k){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:k,authorization:`Bearer ${k}`,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});const p=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(p))throw Object.assign(new Error('DIAGNOSTIC_STORAGE_FAILED'),{status:r.status});return p}
async function rpc(name,params,k){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${enc(name)}`,{method:'POST',headers:{apikey:k,authorization:`Bearer ${k}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(params),cache:'no-store',signal:AbortSignal.timeout(8000)});const p=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error('DIAGNOSTIC_RPC_FAILED'),{status:r.status});return p}
const n=v=>Number.isFinite(Number(v))?Number(v):0;

function diagnoseBusiness({business,billing,wa,products,inventory,orders,channels,audit,supportCases}){
 const findings=[];const stock=new Map(inventory.map(x=>[x.product_id,x]));
 const add=(severity,code,title,why,next)=>findings.push({severity,code,title,why,next});
 const bs=billing[0]||null;if(!bs)add('warning','BILLING_MISSING','لا يوجد اشتراك مسجل','لا يوجد سجل فوترة لهذا النشاط.','تحقق هل النشاط جديد أو لم تبدأ له خطة بعد.');else if(!['active','trialing'].includes(String(bs.status||'').toLowerCase()))add('critical','BILLING_INACTIVE','الاشتراك غير نشط',`حالة الاشتراك الحالية: ${bs.status||'unknown'}.`,'راجع الفوترة قبل تشخيص وظائف مدفوعة أخرى.');
 const w=wa[0]||null;if(w&&!['connected','operational','verified','live'].includes(String(w.status||'').toLowerCase()))add('warning','WHATSAPP_DEGRADED','WhatsApp غير جاهز',`الحالة الحالية: ${w.status||'unknown'}${w.last_error?` · ${String(w.last_error).slice(0,120)}`:''}.`,'راجع آخر تحقق واتصال Meta قبل طلب إعادة الربط.');
 const low=[];for(const p of products){if(p.active===false)continue;const s=stock.get(p.id)||{};const available=Math.max(0,n(s.quantity)-n(s.reserved));if(available<=5)low.push({name:p.name||p.sku||'منتج',available})}if(low.some(x=>x.available===0))add('critical','OUT_OF_STOCK','يوجد مخزون نافد',low.filter(x=>x.available===0).slice(0,4).map(x=>x.name).join('، '),'راجع الجرد أو استلام المخزون قبل اعتبار فشل الطلب خللًا تقنيًا.');else if(low.length)add('warning','LOW_STOCK','يوجد مخزون منخفض',`${low.length} منتج عند حد 5 وحدات أو أقل.`,'راجع المخزون إذا كانت الشكوى عن عدم توفر منتج أو طلب.');
 const pending=orders.filter(o=>o.simulated===false&&['draft','reserved'].includes(String(o.status||'').toLowerCase()));if(pending.length)add('warning','PENDING_ORDERS','طلبات تحتاج متابعة',`${pending.length} طلب بحالة draft/reserved.`,'افتح الطلبات وحدد هل المشكلة في المخزون أو إكمال الطلب.');
 const openSupport=supportCases.filter(c=>['open','waiting'].includes(String(c.status||'').toLowerCase()));if(openSupport.length)add('info','OPEN_SUPPORT','للعميل قضية دعم مفتوحة',`${openSupport.length} قضية دعم مفتوحة/انتظار.`,'اقرأ آخر ملاحظة قبل سؤال العميل عن معلومات سبق أن أعطاها.');
 if(audit.length)add('info','RECENT_OWNER_CHANGES','توجد تغييرات إدارية حديثة',`آخر إجراء: ${audit[0].action||'unknown'} · ${audit[0].created_at||''}`,'قارن وقت بداية المشكلة مع آخر تغيير قبل تنفيذ تعديل جديد.');
 const badChannels=channels.filter(c=>!['connected','operational','verified','live'].includes(String(c.status||'').toLowerCase()));if(badChannels.length)add('info','CHANNELS_REVIEW','قنوات تحتاج مراجعة',badChannels.slice(0,3).map(c=>`${c.channel_type||'channel'}: ${c.status||'unknown'}`).join(' · '),'إذا كانت الشكوى مرتبطة بقناة، ابدأ بالقناة نفسها قبل بقية النظام.');
 if(!findings.some(x=>x.severity==='critical'||x.severity==='warning'))add('ok','NO_OBVIOUS_INCIDENT','لا يوجد سبب تشغيلي واضح','الاشتراك والقنوات والمخزون والطلبات لا تظهر عطلًا مباشرًا وفق البيانات الحالية.','اطلب وصف الخطأ ووقته ثم قارنه بالـTimeline؛ لا تغيّر بيانات دون دليل.');
 const weight={critical:3,warning:2,info:1,ok:0};findings.sort((a,b)=>(weight[b.severity]||0)-(weight[a.severity]||0));
 return {business:{id:business.id,name:business.name||'—',business_type:business.business_type||null},findings,summary:{critical:findings.filter(x=>x.severity==='critical').length,warning:findings.filter(x=>x.severity==='warning').length,open_orders:pending.length,low_stock:low.length}};
}

export default async function handler(req,res){
 res.setHeader('cache-control','no-store, max-age=0');
 if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
 const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];if(!token)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const customerNo=String(singleQueryValue(req,'customer_no')||'').trim().toUpperCase();if(!CUSTOMER_RE.test(customerNo))return json(res,400,{ok:false,error:'INVALID_CUSTOMER_NUMBER'});
 const k=key();if(!k)return json(res,503,{ok:false,error:'OWNER_DIAGNOSTIC_NOT_CONFIGURED'});
 try{
  if(!(await verify(token)))return json(res,401,{ok:false,error:'OWNER_SESSION_INVALID'});
  const accounts=await rest(`dabbir_user_accounts?select=user_id,customer_no&customer_no=eq.${enc(customerNo)}&limit=1`,k);const account=accounts[0];if(!account)return json(res,404,{ok:false,error:'CUSTOMER_NOT_FOUND'});
  const memberships=await rest(`dabbir_memberships?select=business_id,role,status,created_at,updated_at&user_id=eq.${account.user_id}&order=created_at.asc&limit=100`,k);const ids=[...new Set(memberships.map(x=>x.business_id).filter(Boolean))];
  const support=await rpc('dabbir_platform_owner_support_summary_v1',{p_customer_no:customerNo},k).catch(()=>({customer_no:customerNo,metrics:{open:0,waiting:0,resolved:0,total:0},cases:[]}));
  const businesses=[];const timeline=[];
  for(const id of ids.slice(0,20)){
   const [businessRows,billing,wa,products,inventory,orders,channels,audit]=await Promise.all([
    rest(`dabbir_businesses?select=id,name,business_type,locale,created_at&id=eq.${id}&limit=1`,k),
    rest(`dabbir_billing_accounts?select=status,trial_ends_at,current_period_ends_at,last_invoice_status,updated_at&business_id=eq.${id}&limit=1`,k).catch(()=>[]),
    rest(`dabbir_whatsapp_connections?select=status,display_phone_number,verified_name,last_verified_at,last_provider_status,last_error,updated_at&business_id=eq.${id}&limit=1`,k).catch(()=>[]),
    rest(`dabbir_products?select=id,sku,name,active&business_id=eq.${id}&limit=200`,k).catch(()=>[]),
    rest(`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${id}&limit=200`,k).catch(()=>[]),
    rest(`dabbir_orders?select=id,status,total_aed,simulated,created_at&business_id=eq.${id}&order=created_at.desc&limit=100`,k).catch(()=>[]),
    rest(`dabbir_channels?select=id,channel_type,status,updated_at&business_id=eq.${id}&limit=50`,k).catch(()=>[]),
    rest(`dabbir_platform_owner_audit?select=action,entity_type,entity_id,reason,outcome,created_at&business_id=eq.${id}&order=created_at.desc&limit=25`,k).catch(()=>[]),
   ]);const business=businessRows[0];if(!business)continue;const cases=(Array.isArray(support?.cases)?support.cases:[]).filter(c=>!c.business_id||c.business_id===id);businesses.push(diagnoseBusiness({business,billing,wa,products,inventory,orders,channels,audit,supportCases:cases}));
   for(const a of audit.slice(0,10))timeline.push({at:a.created_at,type:'owner_action',business_id:id,title:a.action,detail:a.reason||a.outcome||''});
   for(const o of orders.slice(0,10))if(o.simulated===false)timeline.push({at:o.created_at,type:'order',business_id:id,title:`طلب ${o.status||'unknown'}`,detail:`${n(o.total_aed).toFixed(2)} AED`});
  }
  for(const c of (Array.isArray(support?.cases)?support.cases:[]).slice(0,20))timeline.push({at:c.updated_at||c.created_at,type:'support',business_id:c.business_id||null,title:c.subject||'قضية دعم',detail:`${c.status||'open'} · ${c.priority||'normal'}`});
  timeline.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
  const allFindings=businesses.flatMap(x=>x.findings);const critical=allFindings.filter(x=>x.severity==='critical').length,warning=allFindings.filter(x=>x.severity==='warning').length;
  return json(res,200,{ok:true,customer_no:customerNo,account:{user_id:account.user_id,memberships:memberships.map(m=>({business_id:m.business_id,role:m.role,status:m.status}))},support:{metrics:support?.metrics||{},cases:Array.isArray(support?.cases)?support.cases:[]},businesses,timeline:timeline.slice(0,40),incident:{state:critical?'critical':warning?'warning':'clear',critical,warning,recommended_start:allFindings[0]?.next||'اقرأ Timeline ثم اطلب وصف الخطأ ووقته.'},checked_at:new Date().toISOString()});
 }catch(e){return json(res,Number(e?.status||503)>=500?503:Number(e?.status||500),{ok:false,error:'OWNER_DIAGNOSTIC_FAILED'});}
}
