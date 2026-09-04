import { createHmac } from 'node:crypto';
import { accessTokenFromRequest, getBusinessMemberships, getVerifiedUser, json, readJsonBody, requireSameOrigin, supabaseRest, supabaseRpc } from './_auth-core.js';
import { generateDABBIRAiReply } from './_ai-core.js';
import { OPERATOR_VERSION, describeApproval, planAutonomousRun, runDeterministicReadGoal, verifyApproval } from './_dabbir-autonomous-agent.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const clean=(v,n=800)=>String(v??'').trim().slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):null;
async function read(response,fallback){const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!response.ok){const error=new Error(data?.message||fallback);error.status=response.status;throw error}return data}
const rest=(token,path,options={},fallback)=>supabaseRest(path,token,options).then(r=>read(r,fallback));
const rpc=(token,name,params,fallback)=>supabaseRpc(name,token,params).then(r=>read(r,fallback));

async function auth(req,res,businessId){
  const token=accessTokenFromRequest(req);if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const membership=memberships.find(x=>x.business_id===businessId)||null;
  if(!membership){json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});return null}
  if(String(membership.role||'').toLowerCase()!=='owner'){json(res,403,{ok:false,error:'OWNER_REQUIRED'});return null}
  return {token,user,membership};
}

function toolCatalog(){return [
  {name:'create_service',required:['name','price_aed','duration_minutes']},
  {name:'create_car_wash_offer',required:['name_ar','name_en','description_ar','description_en','price_aed','duration_minutes']},
  {name:'create_product',required:['sku','name','price_aed','quantity']},
  {name:'set_inventory',required:['product_id','quantity']},
  {name:'receive_stock',required:['product_id','quantity']},
  {name:'create_expense',required:['amount_aed','category']},
  {name:'book_available_appointment',required:['customer_name','day','period']}
]}
function parseJsonObject(text){const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{return null}}
export function deterministicPlan(message){
  const text=String(message||'').replace(/ـ/g,'').trim();
  const addPrefix=/^(?:أضف|اضف|ضف|أضيف|اضيف|أضفي|اضفي|أضيفي|اضيفي|ضيف|ضيفي|أنشئ|انشئ|create|add)\s+/i;
  if(addPrefix.test(text)&&/(?:اشتراك|باقة|باقه|غسلات|washes|subscription|package)/i.test(text)){
    const priceMatch=text.match(/([0-9]+(?:\.[0-9]+)?)(?=[^0-9]{0,30}(?:درهم|aed))/iu),washesMatch=text.match(/([0-9]+)\s*(?:غسلات|غسلة|غسله|washes?)/iu),code=text.match(/\b([a-z][a-z0-9_-]{1,30})\b/i)?.[1]?.toUpperCase()||'VVIP',washes=Math.trunc(num(washesMatch?.[1])??0),descriptionAr=clean(text.replace(addPrefix,'').replace(/^(?:خدمة|خدمه|عرض)\s+/i,''),500);
    return {tool:'create_car_wash_offer',args:{name_ar:`اشتراك باقة ${code}`,name_en:`${code} subscription package`,description_ar:descriptionAr,description_en:washes>0?`${washes} washes plus one free`:'Subscription package',price_aed:num(priceMatch?.[1]),duration_minutes:60},summary:'Create car-wash subscription offer'};
  }
  if(new RegExp(addPrefix.source+'(?:خدمة|خدمه|service)\\s+','i').test(text)){
    const after=text.replace(new RegExp(addPrefix.source+'(?:خدمة|خدمه|service)\\s+','i'),'');
    const priceMatch=after.match(/(?:بسعر|ب|price)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:درهم|aed)/i);
    const durationMatch=after.match(/(?:لمدة|مدة|duration)?\s*[:=]?\s*([0-9]+)\s*(?:دقيقة|دقائق|minutes?|mins?)/i);
    const name=after.replace(/(?:بسعر|ب)?\s*[:=]?\s*[0-9]+(?:\.[0-9]+)?\s*(?:درهم|aed)/ig,'').replace(/(?:لمدة|مدة)?\s*[:=]?\s*[0-9]+\s*(?:دقيقة|دقائق|minutes?|mins?)/ig,'').replace(/[،,]+$/,'').trim();
    return {tool:'create_service',args:{name:clean(name,160),price_aed:num(priceMatch?.[1])??0,duration_minutes:Math.trunc(num(durationMatch?.[1])??30)},summary:'Create service'};
  }
  if(addPrefix.test(text)){
    const after=text.replace(addPrefix,'').replace(/^(?:منتج|product)\s+/i,'');
    const pricePattern=/(?:بسعر|سعره|سعرها|قيمته|قيمتها|price(?:d)?(?:\s+at)?|cost(?:s)?(?:\s+at)?)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:درهم|aed)/iu;
    const quantityPattern=/(?:الكمية|الكميه|كمية|كميه|المخزون|quantity|qty|stock)\s*[:=]?\s*([0-9]+)/iu;
    const priceMatch=after.match(pricePattern),quantityMatch=after.match(quantityPattern);
    if(priceMatch&&quantityMatch){
      const explicitSku=after.match(/(?:sku|كود|رمز)\s*[:=]?\s*([\p{L}\p{N}_-]{1,80})/iu)?.[1]||'';
      const name=clean(after.replace(pricePattern,'').replace(quantityPattern,'').replace(/(?:sku|كود|رمز)\s*[:=]?\s*[\p{L}\p{N}_-]{1,80}/iu,'').replace(/[،,;:=-]+$/u,'').trim(),160)||clean(explicitSku,160);
      const sku=clean(explicitSku||name.replace(/\s+/g,'-'),80);
      return {tool:'create_product',args:{sku,name,price_aed:num(priceMatch[1]),quantity:Math.trunc(num(quantityMatch[1])??-1)},summary:'Create product with opening inventory'};
    }
  }
  const timedBooking=text.match(/^([\p{L}\p{N}_-]{2,80})\s+(?:يبا|يبغى|يريد|عايز|wants|needs|ابي|أبي|يبى)\s+.*?(?:الساعة|الساعه|at)\s*([0-9]{1,2})(?::([0-9]{2}))?\s*(ص|م|am|pm)\s*$/iu);
  if(timedBooking&&/(?:غسل|غسيل|سيار|حجز|موعد|book|appointment|wash)/iu.test(text)){
    const marker=timedBooking[4].toLowerCase(),rawHour=Math.trunc(num(timedBooking[2])??-1),minute=Math.trunc(num(timedBooking[3])??0);
    if(rawHour>=1&&rawHour<=12&&minute>=0&&minute<=59){const hour=marker==='م'||marker==='pm'?(rawHour%12)+12:rawHour%12;return {tool:'book_available_appointment',args:{customer_name:clean(timedBooking[1],120),day:'today',period:'exact',exact_time:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,duration_minutes:30},summary:'Book the requested exact time if available'}}
  }
  const customer=text.match(/(?:العميل|عميل|customer)\s+([\p{L}\p{N} _-]{2,80}?)(?=\s+(?:يبا|يبغى|يريد|عايز|wants|needs|بغى|ابي|أبي|يبى)|$)/iu);
  if(customer&&/(?:غسل|غسيل|سيار|حجز|موعد|book|appointment|wash)/iu.test(text)&&/(?:اليوم|today)/iu.test(text)&&/(?:العصر|afternoon|بعد الظهر)/iu.test(text)){
    return {tool:'book_available_appointment',args:{customer_name:clean(customer[1],120),day:'today',period:'afternoon',duration_minutes:30},summary:'Find and book first free afternoon slot'};
  }
  const expense=text.match(/(?:سجل|أضف|اضف|record|add).*?(?:مصروف|expense).*?([0-9]+(?:\.[0-9]+)?)/i);
  if(expense)return {tool:'create_expense',args:{amount_aed:num(expense[1]),category:'other',note:clean(text,240)},summary:'Record expense'};
  return null;
}
export function parseInventoryCommand(message){
  const text=String(message||'').replace(/ـ/g,'').trim();
  const receive=text.match(/^(?:استلم|استقبل|ورد|ورّد|receive|received|restock)\s+(?:كمية\s+)?([0-9]+)\s+(?:من\s+)?(?:المنتج\s+|product\s+)?([\p{L}\p{N}_-]{1,160})$/iu)
    ||text.match(/^(?:أضف|اضف|ضيف|add)\s+([0-9]+)\s+(?:إلى|الى|لـ?|to)\s+(?:مخزون|المخزون|stock(?:\s+of)?)\s+(?:المنتج\s+|product\s+)?([\p{L}\p{N}_-]{1,160})$/iu);
  if(receive)return {tool:'receive_stock',product_ref:clean(receive[2],160),quantity:Math.trunc(num(receive[1])??-1),summary:'Receive stock for an existing product'};
  const set=text.match(/^(?:اجعل|إجعل|خلي|خلّي|حدث|حدّث|عدل|عدّل|set|update)\s+(?:كمية|كميه|مخزون|المخزون|inventory|stock)\s+(?:المنتج\s+|product\s+)?([\p{L}\p{N}_-]{1,160})\s+(?:إلى|الى|تساوي|=|to|at)\s*([0-9]+)$/iu)
    ||text.match(/^(?:اجعل|إجعل|خلي|خلّي|set)\s+(?:المنتج\s+|product\s+)?([\p{L}\p{N}_-]{1,160})\s+(?:كمية|كميه|مخزون|inventory|stock)?\s*(?:إلى|الى|تساوي|=|to|at)\s*([0-9]+)$/iu);
  if(set)return {tool:'set_inventory',product_ref:clean(set[1],160),quantity:Math.trunc(num(set[2])??-1),summary:'Set inventory for an existing product'};
  return null;
}
async function aiPlan(message,language){
  const prompt=['Map the owner command to exactly one DABBIR tool.','Return JSON only: {"tool":"tool_name","args":{},"summary":"short"}.','For free-time booking requests, use book_available_appointment with customer_name, day and period.','Never invent database IDs. Allowed tools: '+JSON.stringify(toolCatalog()),'Owner command: '+message].join('\n');
  try{const task=generateDABBIRAiReply({project:'dabbir_businesses',message:prompt,language,businessContext:'Tool selection only. Server validates and executes.'});const timeout=new Promise(resolve=>setTimeout(()=>resolve(null),3500));const out=await Promise.race([task,timeout]);return out?.ok?parseJsonObject(out.reply):null}catch{return null}
}
export function validate(plan){
  if(!plan||!toolCatalog().some(t=>t.name===plan.tool))return null;const a=plan.args&&typeof plan.args==='object'?plan.args:{};
  if(plan.tool==='create_service'){const name=clean(a.name,160),duration=Math.trunc(num(a.duration_minutes)??0),price=num(a.price_aed);if(!name||duration<1||duration>1440||price==null||price<0)return null;return {action:'create_service',name,price_aed:price,duration_minutes:duration}}
  if(plan.tool==='create_car_wash_offer'){const name_ar=clean(a.name_ar,120),name_en=clean(a.name_en,120),description_ar=clean(a.description_ar,500),description_en=clean(a.description_en,500),duration_minutes=Math.trunc(num(a.duration_minutes)??0),price_aed=num(a.price_aed);if(!name_ar||!name_en||duration_minutes<15||duration_minutes>480||price_aed==null||price_aed<0||price_aed>100000)return null;return {action:'create_car_wash_offer',name_ar,name_en,description_ar,description_en,duration_minutes,price_aed}}
  if(plan.tool==='create_product'){const sku=clean(a.sku,80),name=clean(a.name,160),price=num(a.price_aed),quantity=Math.trunc(num(a.quantity)??-1);if(!sku||!name||price==null||price<0||quantity<0)return null;return {action:'create_product',sku,name,price_aed:price,quantity}}
  if(plan.tool==='set_inventory'||plan.tool==='receive_stock'){const product_id=safeId(a.product_id),quantity=Math.trunc(num(a.quantity)??-1);if(!product_id||quantity<0)return null;return {action:plan.tool,product_id,quantity,note:clean(a.note,240)}}
  if(plan.tool==='create_expense'){const amount=num(a.amount_aed),category=clean(a.category||'other',24).toLowerCase();if(amount==null||amount<=0)return null;return {action:'create_expense',amount_aed:amount,category:['rent','utilities','supplies','salaries','marketing','transport','other'].includes(category)?category:'other',note:clean(a.note,240),occurred_on:clean(a.occurred_on,10)}}
  if(plan.tool==='book_available_appointment'){const customer_name=clean(a.customer_name,120),day=clean(a.day||'today',20).toLowerCase(),period=clean(a.period||'afternoon',20).toLowerCase(),exact_time=clean(a.exact_time,5),duration=Math.trunc(num(a.duration_minutes)??30);if(!customer_name||day!=='today'||!['afternoon','exact'].includes(period)||duration<15||duration>180||period==='exact'&&!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(exact_time))return null;return {action:'book_available_appointment',customer_name,day,period,...(period==='exact'?{exact_time}:{}),duration_minutes:duration}}
  return null;
}
function todayDubai(){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}}
function dubaiIso(dateKey,hour,minute=0){return new Date(`${dateKey}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+04:00`).toISOString()}
async function bookAvailableAppointment(token,businessId,payload){
  const idempotencyKey=clean(payload.idempotency_key,120);
  if(idempotencyKey){const replay=await rest(token,`dabbir_appointments?select=id,customer_id,service_id,starts_at,status,idempotency_key,created_at&business_id=eq.${businessId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,{},'APPOINTMENT_REPLAY_LOOKUP_FAILED');if(replay?.[0])return {...replay[0],idempotent_replay:true}}
  const date=todayDubai();
  const now=Date.now();
  const exact=payload.period==='exact';
  const [requestedHour,requestedMinute]=exact?payload.exact_time.split(':').map(Number):[null,null];
  const start=exact?dubaiIso(date,requestedHour,requestedMinute):dubaiIso(date,15,0),end=exact?new Date(new Date(start).getTime()+payload.duration_minutes*60000).toISOString():dubaiIso(date,18,0);
  if(now>=new Date(end).getTime()||exact&&new Date(start).getTime()<=now+10*60000)throw Object.assign(new Error(exact?'TIME_SLOT_PASSED':'AFTERNOON_WINDOW_PASSED'),{status:409});
  const existing=await rest(token,`dabbir_appointments?select=id,customer_id,starts_at,ends_at,status,simulated&business_id=eq.${businessId}&starts_at=lt.${encodeURIComponent(end)}&ends_at=gt.${encodeURIComponent(start)}&status=neq.cancelled&order=starts_at.asc&limit=100`,{},'APPOINTMENTS_LOOKUP_FAILED');
  const step=Math.max(30,payload.duration_minutes)*60000;
  let slot=exact?start:null;
  if(exact&&(existing||[]).some(x=>x.simulated===false))throw Object.assign(new Error('REQUESTED_TIME_UNAVAILABLE'),{status:409});
  if(!exact)for(let t=new Date(start).getTime();t<new Date(end).getTime();t+=step){const candidateEnd=t+payload.duration_minutes*60000,overlap=(existing||[]).some(x=>x.simulated===false&&new Date(x.starts_at).getTime()<candidateEnd&&new Date(x.ends_at||new Date(new Date(x.starts_at).getTime()+3600000)).getTime()>t);if(t>now+10*60000&&!overlap){slot=new Date(t).toISOString();break}}
  if(!slot)throw Object.assign(new Error('NO_FREE_AFTERNOON_SLOT'),{status:409});
  const q=encodeURIComponent(payload.customer_name.replace(/[%*]/g,''));
  const found=await rest(token,`dabbir_customers?select=id,display_name,lead_status&business_id=eq.${businessId}&display_name=ilike.*${q}*&limit=5`,{},'CUSTOMER_LOOKUP_FAILED');
  let customer=(found||[]).find(x=>String(x.display_name||'').trim()===payload.customer_name)||found?.[0]||null;
  if(!customer){const rows=await rest(token,'dabbir_customers?select=id,display_name,lead_status,created_at',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,display_name:payload.customer_name,lead_status:'new',metadata:{source:'dabbir_ai_business_operator'}})},'CUSTOMER_CREATE_FAILED');customer=rows?.[0]||null;if(!customer?.id)throw Object.assign(new Error('CUSTOMER_CREATE_UNVERIFIED'),{status:502})}
  const fingerprint=idempotencyKey?await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${businessId}:${customer.id}:${slot}`)).then(x=>Buffer.from(x).toString('hex')):null;
  const slotEnd=new Date(new Date(slot).getTime()+payload.duration_minutes*60000).toISOString();
  const rows=await rest(token,'dabbir_appointments?select=id,customer_id,service_id,starts_at,ends_at,status,simulated,idempotency_key,created_at',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,customer_id:customer.id,service_id:null,starts_at:slot,ends_at:slotEnd,status:'requested',simulated:false,booking_source:'dabbir_ai_business_operator',...(idempotencyKey?{idempotency_key:idempotencyKey,idempotency_fingerprint:fingerprint}:{})})},'APPOINTMENT_CREATE_FAILED');
  const appt=rows?.[0];if(!appt?.id)throw Object.assign(new Error('APPOINTMENT_CREATE_UNVERIFIED'),{status:502});
  return {...appt,customer_name:customer.display_name,selected_as:exact?'EXACT_REQUESTED_SLOT':'FIRST_FREE_AFTERNOON_SLOT'};
}
export async function executeTool(token,businessId,payload){
  const key=clean(payload.idempotency_key,120);
  if(payload.action==='create_service'){if(key){const replay=await rest(token,`dabbir_services?select=id,name,price_aed,duration_minutes,active,metadata&business_id=eq.${businessId}&metadata->>idempotency_key=eq.${encodeURIComponent(key)}&limit=1`,{},'SERVICE_REPLAY_LOOKUP_FAILED');if(replay?.[0])return {...replay[0],idempotent_replay:true}}const rows=await rest(token,'dabbir_services?select=id,name,price_aed,duration_minutes,active,metadata',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,name:payload.name,price_aed:Number(payload.price_aed.toFixed(2)),duration_minutes:payload.duration_minutes,active:true,metadata:{source:'dabbir_ai_business_operator',...(key?{idempotency_key:key}:{})}})},'SERVICE_CREATE_FAILED');const result=rows?.[0];if(!result?.id)throw Object.assign(new Error('SERVICE_CREATE_UNVERIFIED'),{status:502});return result}
  if(payload.action==='create_car_wash_offer'){const businesses=await rest(token,`dabbir_businesses?select=id,business_type&business_id=eq.${businessId}`.replace('business_id=eq.','id=eq.'),{},'BUSINESS_LOOKUP_FAILED');if(!/(?:car.?wash|غسيل)/i.test(String(businesses?.[0]?.business_type||'')))throw Object.assign(new Error('CAR_WASH_BUSINESS_REQUIRED'),{status:409});const existing=await rest(token,`dabbir_car_wash_offers?select=id,name_ar,name_en,description_ar,description_en,duration_minutes,saloon_price_aed,station_price_aed,active,sort_order&business_id=eq.${businessId}&order=sort_order.asc&limit=6`,{},'CAR_WASH_OFFERS_LOOKUP_FAILED');const replay=existing.find(x=>x.name_ar===payload.name_ar&&Number(x.saloon_price_aed)===payload.price_aed&&Number(x.station_price_aed)===payload.price_aed&&Number(x.duration_minutes)===payload.duration_minutes);if(replay)return {...replay,idempotent_replay:true};if(existing.some(x=>x.name_ar===payload.name_ar))throw Object.assign(new Error('CAR_WASH_OFFER_NAME_CONFLICT'),{status:409});if(existing.length>=6)throw Object.assign(new Error('CAR_WASH_OFFER_LIMIT_REACHED'),{status:409});const rows=await rest(token,'dabbir_car_wash_offers?select=id,name_ar,name_en,description_ar,description_en,duration_minutes,saloon_price_aed,station_price_aed,active,sort_order',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,sort_order:existing.length+1,name_ar:payload.name_ar,name_en:payload.name_en,description_ar:payload.description_ar,description_en:payload.description_en,duration_minutes:payload.duration_minutes,saloon_price_aed:Number(payload.price_aed.toFixed(2)),station_price_aed:Number(payload.price_aed.toFixed(2)),active:true})},'CAR_WASH_OFFER_CREATE_FAILED');const result=rows?.[0];if(!result?.id)throw Object.assign(new Error('CAR_WASH_OFFER_CREATE_UNVERIFIED'),{status:502});return result}
  if(payload.action==='create_product'){const replay=await rest(token,`dabbir_products?select=id,sku,name,price_aed,active,metadata&business_id=eq.${businessId}&sku=eq.${encodeURIComponent(payload.sku)}&limit=1`,{},'PRODUCT_REPLAY_LOOKUP_FAILED');if(replay?.[0]){if(replay[0].name!==payload.name)throw Object.assign(new Error('PRODUCT_SKU_CONFLICT'),{status:409});return {...replay[0],idempotent_replay:true}}return await rpc(token,'dabbir_owner_create_product',{p_business_id:businessId,p_sku:payload.sku,p_name:payload.name,p_price_aed:payload.price_aed,p_quantity:payload.quantity},'PRODUCT_CREATE_FAILED')}
  if(payload.action==='set_inventory')return await rpc(token,'dabbir_owner_set_inventory',{p_business_id:businessId,p_product_id:payload.product_id,p_quantity:payload.quantity},'INVENTORY_UPDATE_FAILED');
  if(payload.action==='receive_stock'){if(key){const replay=await rest(token,`dabbir_inventory_movements?select=id,product_id,quantity_delta,quantity_after,reference_note,created_at&business_id=eq.${businessId}&product_id=eq.${payload.product_id}&reference_note=like.*${encodeURIComponent(key)}*&limit=1`,{},'STOCK_REPLAY_LOOKUP_FAILED');if(replay?.[0])return {...replay[0],idempotent_replay:true}}return await rpc(token,'dabbir_owner_receive_stock',{p_business_id:businessId,p_product_id:payload.product_id,p_quantity:payload.quantity,p_note:key?`${payload.note||''} [${key}]`.trim():payload.note||''},'STOCK_RECEIPT_FAILED')}
  if(payload.action==='create_expense'){if(key){const replay=await rest(token,`dabbir_expenses?select=id,amount_aed,category,note,occurred_on,created_at&business_id=eq.${businessId}&note=like.*${encodeURIComponent(key)}*&limit=1`,{},'EXPENSE_REPLAY_LOOKUP_FAILED');if(replay?.[0])return {...replay[0],idempotent_replay:true}}const rows=await rest(token,'dabbir_expenses?select=id,amount_aed,category,note,occurred_on,created_at',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({business_id:businessId,amount_aed:Number(payload.amount_aed.toFixed(2)),category:payload.category,note:key?`${payload.note||''} [${key}]`.trim():payload.note||'',occurred_on:/^\d{4}-\d{2}-\d{2}$/.test(payload.occurred_on)?payload.occurred_on:todayDubai()})},'EXPENSE_CREATE_FAILED');const result=rows?.[0];if(!result?.id)throw Object.assign(new Error('EXPENSE_CREATE_UNVERIFIED'),{status:502});return result}
  if(payload.action==='book_available_appointment')return await bookAvailableAppointment(token,businessId,payload);
  throw Object.assign(new Error('UNSUPPORTED_TOOL'),{status:400});
}
async function executeApproved(ctx,businessId,approvalToken){
  const approved=verifyApproval(ctx.token,approvalToken,businessId,ctx.user.id);if(!approved)throw Object.assign(new Error('APPROVAL_INVALID_EXPIRED_OR_TAMPERED'),{status:403});
  const receipts=[],transitions=[{state:'received',at:new Date().toISOString()},{state:'executing',at:new Date().toISOString()}];
  for(const raw of approved.plan.slice(0,6)){const payload=validate({tool:raw.action,args:raw});if(!payload)throw Object.assign(new Error('APPROVED_PLAN_INVALID'),{status:400});payload.idempotency_key=raw.idempotency_key;try{const before=payload.action==='set_inventory'||payload.action==='receive_stock'?(await rest(ctx.token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&product_id=eq.${payload.product_id}&limit=1`,{},'BEFORE_READ_FAILED'))?.[0]||null:null;const result=await executeTool(ctx.token,businessId,payload);transitions.push({state:'verifying',step:raw.step,at:new Date().toISOString()});receipts.push({step:raw.step,tool:payload.action,business_id:businessId,idempotency_key:payload.idempotency_key,verified_by:'TENANT_RLS_WRITE_RETURNING_OR_READ_AFTER_WRITE',before,result})}catch(error){const state=receipts.length?'partially_completed':'failed';transitions.push({state,step:raw.step,at:new Date().toISOString()});return {ok:false,state,executed:receipts.length>0,version:OPERATOR_VERSION,goal:approved.goal,receipts,error:clean(error?.message||'TOOL_EXECUTION_FAILED',140),transitions}}}
  transitions.push({state:'completed',at:new Date().toISOString()});return {ok:true,state:'completed',executed:true,version:OPERATOR_VERSION,goal:approved.goal,receipts,transitions};
}

export async function deterministicWritePlan({token,businessId,message,language='ar'}){
  let plan=deterministicPlan(message),payload=validate(plan);
  if(!payload){
    const inventory=parseInventoryCommand(message);
    if(!inventory)return null;
    if(inventory.quantity<0)throw Object.assign(new Error('INVENTORY_QUANTITY_INVALID'),{status:400});
    const products=await rest(token,`dabbir_products?select=id,sku,name,active&business_id=eq.${businessId}&limit=100`,{},'PRODUCT_LOOKUP_FAILED');
    const ref=inventory.product_ref.toLocaleLowerCase('en-US');
    const skuMatches=(products||[]).filter(x=>String(x.sku||'').trim().toLocaleLowerCase('en-US')===ref);
    const nameMatches=(products||[]).filter(x=>String(x.name||'').trim().toLocaleLowerCase('en-US')===ref);
    const matches=skuMatches.length?skuMatches:nameMatches;
    if(matches.length===0)throw Object.assign(new Error('PRODUCT_NOT_FOUND'),{status:404});
    if(matches.length!==1)throw Object.assign(new Error('PRODUCT_REFERENCE_AMBIGUOUS'),{status:409});
    plan={tool:inventory.tool,args:{product_id:matches[0].id,quantity:inventory.quantity,note:clean(message,240)},summary:inventory.summary};
    payload=validate(plan);
    if(!payload)throw Object.assign(new Error('INVENTORY_PLAN_INVALID'),{status:400});
  }
  const raw={...payload,step:1,reason:clean(plan.summary,160),idempotency_key:`dao:${Buffer.from(`${message}:${payload.action}`).toString('base64url').slice(0,40)}`};
  return {raw,approval:describeApproval([raw],language)};
}
function deterministicApproval(ctx,businessId,message,language,fallback){const issued=Date.now(),payload={v:1,business_id:businessId,user_id:ctx.user.id,issued_at:issued,expires_at:issued+600000,goal:message,language,plan:[fallback.raw]},raw=Buffer.from(JSON.stringify(payload)).toString('base64url'),signature=createHmac('sha256',`dabbir-owner-approval:${ctx.token}`).update(raw).digest('base64url');return {ok:true,state:'awaiting_approval',executed:false,version:OPERATOR_VERSION,cost_mode:'NO_MODEL_REQUIRED',deterministic:true,goal:message,plan:[fallback.raw],approval:fallback.approval,approval_token:`${raw}.${signature}`,summary:language==='ar'?'تم إعداد خطة محكومة من بيانات الأمر، وتحتاج موافقتك قبل التنفيذ.':'A controlled plan was prepared from the command and requires your approval before execution.'}}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=await readJsonBody(req,32768).catch(()=>null),businessId=safeId(body?.business_id),action=clean(body?.action||'plan',24).toLowerCase();if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
  const ctx=await auth(req,res,businessId);if(!ctx)return;const language=String(body?.language||'ar').toLowerCase()==='en'?'en':'ar';
  if(action==='cancel')return json(res,200,{ok:true,state:'cancelled',executed:false,version:OPERATOR_VERSION,transitions:[{state:'received',at:new Date().toISOString()},{state:'cancelled',at:new Date().toISOString()}]});
  if(action==='approve'){try{return json(res,200,await executeApproved(ctx,businessId,clean(body?.approval_token,16000)))}catch(error){const status=[400,403,409].includes(Number(error?.status))?Number(error.status):500;return json(res,status,{ok:false,state:'failed',executed:false,version:OPERATOR_VERSION,error:clean(error?.message||'APPROVAL_EXECUTION_FAILED',140)})}}
  if(action!=='plan')return json(res,400,{ok:false,error:'ACTION_NOT_ALLOWED'});const message=clean(body?.message,800);if(!message)return json(res,400,{ok:false,error:'MESSAGE_REQUIRED'});
  try{const direct=await runDeterministicReadGoal({token:ctx.token,businessId,goal:message,language});if(direct)return json(res,200,direct)}catch(error){return json(res,502,{ok:false,state:'failed',executed:false,version:OPERATOR_VERSION,error:clean(error?.message||'VERIFIED_READ_FAILED',140)})}
  try{const directWrite=await deterministicWritePlan({token:ctx.token,businessId,message,language});if(directWrite)return json(res,200,deterministicApproval(ctx,businessId,message,language,directWrite))}catch(error){const status=[400,404,409].includes(Number(error?.status))?Number(error.status):502;return json(res,status,{ok:false,state:'failed',executed:false,version:OPERATOR_VERSION,error:clean(error?.message||'DETERMINISTIC_WRITE_FAILED',140)})}
  try{return json(res,200,await planAutonomousRun({token:ctx.token,userId:ctx.user.id,businessId,goal:message,language,validateWrite:validate}))}catch(error){
    const budgetCode=error?.code==='AI_MONTHLY_BUDGET_REACHED'||error?.message==='AI_MONTHLY_BUDGET_REACHED'?'AI_MONTHLY_BUDGET_REACHED':error?.code==='AI_BUDGET_UNAVAILABLE'||error?.message==='AI_BUDGET_UNAVAILABLE'?'AI_BUDGET_UNAVAILABLE':null;
    const publicError=budgetCode||(error?.name==='AbortError'||error?.name==='TimeoutError'?'AGENT_TIMEOUT':'AI_PROVIDER_UNAVAILABLE');
    console.error('dabbir_ai_business_operator_plan_failed',{
      version:OPERATOR_VERSION,
      error:publicError,
      budget_code:budgetCode||null,
      failure_class:publicError==='AGENT_TIMEOUT'?'TIMEOUT':'AI',
      external_side_effects:false,
      money_movement:false
    });
    return json(res,budgetCode==='AI_MONTHLY_BUDGET_REACHED'?429:503,{ok:false,state:'failed',executed:false,version:OPERATOR_VERSION,error:publicError,monthly_ai_hard_limit_aed:budgetCode?300:undefined});
  }
}
