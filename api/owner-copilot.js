import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  userClaimsFromValidatedAccessToken,
} from './_auth-core.js';
import { generateDABBIRAiReply } from './_ai-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=800)=>String(value??'').trim().slice(0,max);
const enc=value=>encodeURIComponent(String(value));

function queryValue(req,name){
  try{const url=new URL(String(req?.url||'/'),'https://dabbir.invalid');const values=url.searchParams.getAll(name);return values.length===1?values[0]:null}catch{return null}
}

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(response=>readData(response,fallback));

async function restCount(token,path,fallback){
  const response=await supabaseRest(path,token,{headers:{prefer:'count=exact'}});
  if(!response.ok)return readData(response,fallback);
  const range=String(response.headers.get('content-range')||'');
  const raw=range.includes('/')?range.slice(range.lastIndexOf('/')+1):'';
  const total=Number(raw);
  await response.text().catch(()=>{});
  if(!Number.isSafeInteger(total)||total<0)throw Object.assign(new Error(fallback+'_UNVERIFIED'),{status:502});
  return total;
}

function dubaiDay(now=new Date()){
  const dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const start=new Date(`${dateKey}T00:00:00+04:00`);
  return {dateKey,start:start.toISOString(),end:new Date(start.getTime()+86400000).toISOString()};
}

async function authContext(req,res,businessId){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  let memberships;
  try{memberships=await getBusinessMemberships(token)}catch(error){
    const status=Number(error?.code||500);
    json(res,status===401||status===403?401:503,{ok:false,error:status===401||status===403?'AUTH_REQUIRED':'AUTH_VERIFICATION_UNAVAILABLE'});return null;
  }
  let user=userClaimsFromValidatedAccessToken(token);
  if(!user)user=await getVerifiedUser(token).catch(()=>null);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const membership=memberships.find(row=>row.business_id===businessId)||null;
  if(!membership){json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});return null}
  if(String(membership.role||'').toLowerCase()!=='owner'){json(res,403,{ok:false,error:'OWNER_REQUIRED'});return null}
  return {token,user,membership};
}

async function verifiedOutcomes(token,businessId){
  const day=dubaiDay();
  try{
    const rows=await rest(token,`dabbir_operation_outcomes?select=operation_type,outcome,autonomous,estimated_manual_seconds,completed_at&business_id=eq.${businessId}&outcome=eq.VERIFIED_SUCCESS&autonomous=eq.true&completed_at=gte.${enc(day.start)}&order=completed_at.desc&limit=100`,'VERIFIED_OUTCOMES_LOOKUP_FAILED');
    const safeRows=Array.isArray(rows)?rows:[];
    const estimates=safeRows.map(row=>Number(row.estimated_manual_seconds)).filter(value=>Number.isFinite(value)&&value>=0);
    const seconds=estimates.reduce((sum,value)=>sum+value,0);
    const minutes=safeRows.length===0?0:(estimates.length?Math.round(seconds/60):null);
    return {available:true,verified_autonomous_actions:safeRows.length,estimated_manual_minutes_saved:minutes,latest:safeRows.slice(0,5).map(row=>({operation_type:clean(row.operation_type,100),completed_at:row.completed_at||null}))};
  }catch{return {available:false,verified_autonomous_actions:null,estimated_manual_minutes_saved:null,latest:[]}}
}

function valueText(value){
  if(value==null)return '';
  if(typeof value==='string')return value;
  if(typeof value==='object'&&typeof value.text==='string')return value.text;
  try{return JSON.stringify(value)}catch{return ''}
}

function recommendScreen(message,snapshot){
  const text=String(message||'').toLowerCase();
  if(/متابع|follow.?up|مهم|task/.test(text))return 'tasks';
  if(/موعد|appointment|حجز|booking|معاين/.test(text))return 'appointments';
  if(/طلب|order|مخزون|inventory|منتج|product|مبيعات|sales/.test(text))return 'operations';
  if(/واتس|whats.?app|ربط|integration|قناة|channel/.test(text))return 'integrations';
  if(/ساعات|دوام|سياس|policy|معلومات النشاط|business info|setting/.test(text))return 'settings';
  if(/عميل|customer|محادث|chat|handoff|تدخل/.test(text))return 'conversations';
  if(snapshot.metrics.active_handoffs>0)return 'conversations';
  if(snapshot.metrics.open_followups>0)return 'tasks';
  return 'dashboard';
}

function fallbackAnswer(message,language,snapshot){
  const ar=language==='ar'||(language!=='en'&&/[\u0600-\u06FF]/.test(message));
  const text=String(message||'').toLowerCase();
  const m=snapshot.metrics;
  const proof=snapshot.proof;
  if(/متابع|follow.?up/.test(text)){
    if(snapshot.followups.length){const names=snapshot.followups.slice(0,3).map(item=>item.customer).filter(Boolean).join('، ');return ar?`لديك ${snapshot.followups.length} متابعة مستحقة خلال 24 ساعة${names?`، أبرزها: ${names}`:''}. افتح المهام لمراجعتها.`:`You have ${snapshot.followups.length} follow-up(s) due within 24 hours${names?`, including ${names}`:''}. Open Tasks to review them.`}
    return ar?'لا توجد متابعة مستحقة خلال 24 ساعة ضمن البيانات الموثقة حاليًا.':'No follow-up is verified as due within the next 24 hours.';
  }
  if(/انجز|أنجز|سويت|عملت|accompl|done today|what did/.test(text)){
    if(!proof.available)return ar?'سجل الإنجازات الموثقة غير متاح الآن، لذلك لن أعرض رقمًا تقديريًا.':'Verified outcome evidence is unavailable right now, so I will not estimate it.';
    const time=proof.estimated_manual_minutes_saved==null?(ar?'، ولا يوجد تقدير موثق للوقت الموفر بعد':', and there is no verified time-saved estimate yet'):(ar?`، بوقت يدوي مقدر تم توفيره ${proof.estimated_manual_minutes_saved} دقيقة`:` with an estimated ${proof.estimated_manual_minutes_saved} minutes of manual work avoided`);
    return ar?`أنجز دبّر ${proof.verified_autonomous_actions} إجراءً موثقًا تلقائيًا اليوم${time}.`:`DABBIR completed ${proof.verified_autonomous_actions} verified autonomous action(s) today${time}.`;
  }
  if(/مبيعات|بيع|sales|revenue|دخل/.test(text))return ar?`المبيعات المكتملة الموثقة اليوم ${m.sales_today_aed.toFixed(2)} درهم عبر ${m.completed_sales_today} عملية. التحصيل المسجل ${m.cash_collected_today_aed.toFixed(2)} درهم، والمبالغ غير المسددة ${m.receivables_today_aed.toFixed(2)} درهم. هذه قراءة ليوم دبي الحالي وليست ربحًا محاسبيًا.`:`Verified completed sales today are AED ${m.sales_today_aed.toFixed(2)} across ${m.completed_sales_today} sale(s). Recorded collections are AED ${m.cash_collected_today_aed.toFixed(2)} and unpaid amounts are AED ${m.receivables_today_aed.toFixed(2)}. This is the current Dubai-day view, not accounting profit.`;
  if(/مخزون|inventory|منتج|product/.test(text)){
    if(snapshot.store.low_stock.length){const names=snapshot.store.low_stock.map(item=>`${item.name} (${item.available})`).join('، ');return ar?`لديك ${m.low_stock_products} منتجات عند حد المخزون المنخفض: ${names}. افتح إدارة المتجر لاستلام شحنة أو تعديل الجرد.`:`You have ${m.low_stock_products} low-stock product(s): ${names}. Open Store operations to receive stock or adjust the count.`}
    return ar?'لا توجد منتجات عند حد المخزون المنخفض ضمن البيانات الموثقة الآن.':'No products are currently at the low-stock threshold in verified data.';
  }
  if(/مصروف|expense|expenses/.test(text))return ar?`المصروفات المسجلة اليوم ${m.expenses_today_aed.toFixed(2)} درهم. لا أحول هذا الرقم إلى ربح محاسبي لأنه لا يتضمن بالضرورة تكلفة البضاعة أو الضرائب أو الرسوم.`:`Recorded expenses today are AED ${m.expenses_today_aed.toFixed(2)}. I do not present this as accounting profit because cost of goods, taxes, and fees may not all be represented.`;
  if(/كم.*عميل|customers?/.test(text))return ar?`لديك ${m.customers} عميلًا موثقًا في النشاط.`:`You have ${m.customers} verified customer(s) in this business.`;
  if(/موعد|appointment/.test(text))return ar?`لديك ${snapshot.appointments.length} موعدًا حقيقيًا موثقًا خلال الـ24 ساعة القادمة.`:`You have ${snapshot.appointments.length} verified non-simulated appointment(s) in the next 24 hours.`;
  const attention=m.active_handoffs+m.open_followups;
  return ar?`الآن لديك ${attention} حالة تحتاج متابعة: ${m.active_handoffs} تدخل بشري نشط و${m.open_followups} متابعة مفتوحة. المحادثات النشطة ${m.active_chats}، والعملاء ${m.customers}.`:`Right now, ${attention} item(s) need follow-up: ${m.active_handoffs} active human handoff(s) and ${m.open_followups} open follow-up(s). Active conversations: ${m.active_chats}; customers: ${m.customers}.`;
}

async function buildSnapshot(token,businessId){
  const now=Date.now();
  const next24=new Date(now+86400000).toISOString();
  const nowIso=new Date(now).toISOString();
  const day=dubaiDay(new Date(now));
  const b=enc(businessId);
  const [businessRows,knowledge,followups,handoffs,appointments,customers,products,inventory,storeOrders,storeExpenses,metrics,proof]=await Promise.all([
    rest(token,`dabbir_businesses?select=id,name,business_type,locale&id=eq.${b}&limit=1`,'BUSINESS_LOOKUP_FAILED'),
    rest(token,`dabbir_business_knowledge?select=knowledge_key,value,status&business_id=eq.${b}&status=eq.approved&order=updated_at.desc&limit=30`,'BUSINESS_KNOWLEDGE_LOOKUP_FAILED').catch(()=>[]),
    rest(token,`dabbir_followups?select=customer_id,status,reason,due_at,blocked_reason&business_id=eq.${b}&status=not.in.(completed,cancelled,sent)&due_at=lte.${enc(next24)}&order=due_at.asc&limit=20`,'FOLLOWUPS_LOOKUP_FAILED'),
    rest(token,`dabbir_handoffs?select=customer_id,state,priority,reason,summary,updated_at&business_id=eq.${b}&state=in.(QUEUED,ASSIGNED,HUMAN_ACTIVE)&order=updated_at.desc&limit=20`,'HANDOFFS_LOOKUP_FAILED'),
    rest(token,`dabbir_appointments?select=customer_id,starts_at,status,simulated&business_id=eq.${b}&starts_at=gte.${enc(nowIso)}&starts_at=lte.${enc(next24)}&simulated=eq.false&status=not.in.(cancelled,completed)&order=starts_at.asc&limit=20`,'APPOINTMENTS_LOOKUP_FAILED'),
    rest(token,`dabbir_customers?select=id,display_name&business_id=eq.${b}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
    rest(token,`dabbir_products?select=id,name,sku,price_aed,active&business_id=eq.${b}&active=eq.true&order=name.asc&limit=200`,'STORE_PRODUCTS_LOOKUP_FAILED').catch(()=>[]),
    rest(token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${b}&limit=200`,'STORE_INVENTORY_LOOKUP_FAILED').catch(()=>[]),
    rest(token,`dabbir_orders?select=id,status,total_aed,paid_aed,payment_method,simulated,completed_at,created_at&business_id=eq.${b}&simulated=eq.false&status=in.(confirmed,completed)&completed_at=gte.${enc(day.start)}&completed_at=lt.${enc(day.end)}&order=completed_at.desc&limit=200`,'STORE_ORDERS_LOOKUP_FAILED').catch(()=>[]),
    rest(token,`dabbir_expenses?select=id,amount_aed,category,occurred_on&business_id=eq.${b}&occurred_on=eq.${enc(day.dateKey)}&order=created_at.desc&limit=200`,'STORE_EXPENSES_LOOKUP_FAILED').catch(()=>[]),
    Promise.all([
      restCount(token,`dabbir_customers?select=id&business_id=eq.${b}&limit=1`,'CUSTOMERS_COUNT_FAILED'),
      restCount(token,`dabbir_conversations?select=id&business_id=eq.${b}&channel_type=eq.web&state=neq.closed&limit=1`,'ACTIVE_CHATS_COUNT_FAILED'),
      restCount(token,`dabbir_followups?select=id&business_id=eq.${b}&status=not.in.(completed,cancelled,sent)&limit=1`,'OPEN_FOLLOWUPS_COUNT_FAILED'),
      restCount(token,`dabbir_handoffs?select=id&business_id=eq.${b}&state=in.(QUEUED,ASSIGNED,HUMAN_ACTIVE)&limit=1`,'ACTIVE_HANDOFFS_COUNT_FAILED'),
      restCount(token,`dabbir_messages?select=id&business_id=eq.${b}&sender_type=eq.ai&simulated=eq.false&limit=1`,'AI_MESSAGES_COUNT_FAILED'),
      restCount(token,`dabbir_appointments?select=id&business_id=eq.${b}&starts_at=gte.${enc(day.start)}&starts_at=lt.${enc(day.end)}&simulated=eq.false&limit=1`,'TODAY_APPOINTMENTS_COUNT_FAILED'),
    ]),
    verifiedOutcomes(token,businessId),
  ]);
  const [customersCount,activeChats,openFollowups,activeHandoffs,aiMessages,todayAppointments]=metrics;
  const names=new Map((customers||[]).map(row=>[row.id,clean(row.display_name,120)||null]));
  const decorate=row=>({...row,customer:names.get(row.customer_id)||null,customer_id:undefined});
  const asNumber=value=>{const number=Number(value);return Number.isFinite(number)?number:0};
  const inventoryByProduct=new Map((inventory||[]).map(row=>[row.product_id,row]));
  const lowStock=(products||[]).map(product=>{
    const balance=inventoryByProduct.get(product.id)||{};
    const quantity=Math.trunc(asNumber(balance.quantity));
    const reserved=Math.trunc(asNumber(balance.reserved));
    const available=quantity-reserved;
    return {name:clean(product.name,120),sku:clean(product.sku,80),available,quantity,reserved,low_stock:available<=3};
  }).filter(product=>product.low_stock).slice(0,6);
  const salesToday=(storeOrders||[]).reduce((sum,row)=>sum+asNumber(row.total_aed),0);
  const cashCollectedToday=(storeOrders||[]).reduce((sum,row)=>sum+asNumber(row.paid_aed),0);
  const receivablesToday=(storeOrders||[]).reduce((sum,row)=>sum+Math.max(0,asNumber(row.total_aed)-asNumber(row.paid_aed)),0);
  const expensesToday=(storeExpenses||[]).reduce((sum,row)=>sum+asNumber(row.amount_aed),0);
  return {
    business:businessRows?.[0]||null,
    knowledge:(knowledge||[]).map(row=>({key:clean(row.knowledge_key,80),value:clean(valueText(row.value),600)})).filter(row=>row.key&&row.value),
    metrics:{customers:customersCount,active_chats:activeChats,open_followups:openFollowups,active_handoffs:activeHandoffs,ai_messages:aiMessages,today_appointments:todayAppointments,sales_today_aed:Number(salesToday.toFixed(2)),cash_collected_today_aed:Number(cashCollectedToday.toFixed(2)),receivables_today_aed:Number(receivablesToday.toFixed(2)),expenses_today_aed:Number(expensesToday.toFixed(2)),low_stock_products:lowStock.length,completed_sales_today:(storeOrders||[]).length},
    store:{low_stock:lowStock,expense_categories:(storeExpenses||[]).slice(0,5).map(row=>({category:clean(row.category,24),amount_aed:Number(asNumber(row.amount_aed).toFixed(2))}))},
    followups:(followups||[]).map(decorate),
    handoffs:(handoffs||[]).map(decorate),
    appointments:(appointments||[]).map(decorate),
    proof,
    generated_at:new Date().toISOString(),
    timezone:'Asia/Dubai',
  };
}

function promptContext(snapshot){
  const facts=snapshot.knowledge.map(row=>`${row.key}: ${row.value}`).join('\n').slice(0,1800);
  const followups=snapshot.followups.slice(0,6).map(row=>`${row.customer||'customer'} | ${clean(row.reason||row.blocked_reason,180)} | due ${row.due_at||'unknown'}`).join('\n');
  const handoffs=snapshot.handoffs.slice(0,6).map(row=>`${row.customer||'customer'} | ${clean(row.summary||row.reason,180)} | ${row.state}`).join('\n');
  const appointments=snapshot.appointments.slice(0,6).map(row=>`${row.customer||'customer'} | ${row.starts_at} | ${row.status}`).join('\n');
  return [
    'OWNER OPERATIONS SNAPSHOT — VERIFIED TENANT DATA ONLY.',
    `Business: ${clean(snapshot.business?.name,120)} | type=${clean(snapshot.business?.business_type,40)}.`,
    `Exact metrics: customers=${snapshot.metrics.customers}; active_web_chats=${snapshot.metrics.active_chats}; open_followups=${snapshot.metrics.open_followups}; active_handoffs=${snapshot.metrics.active_handoffs}; ai_messages=${snapshot.metrics.ai_messages}; today_real_appointments=${snapshot.metrics.today_appointments}; completed_sales_today_aed=${snapshot.metrics.sales_today_aed}; cash_collected_today_aed=${snapshot.metrics.cash_collected_today_aed}; receivables_today_aed=${snapshot.metrics.receivables_today_aed}; expenses_today_aed=${snapshot.metrics.expenses_today_aed}; low_stock_products=${snapshot.metrics.low_stock_products}.`,
    snapshot.proof.available?`Verified autonomous outcomes today=${snapshot.proof.verified_autonomous_actions}; estimated manual minutes avoided=${snapshot.proof.estimated_manual_minutes_saved==null?'UNAVAILABLE':snapshot.proof.estimated_manual_minutes_saved}.`:'Verified autonomous outcome evidence is unavailable; do not treat it as zero.',
    facts?`Owner-approved business knowledge:\n${facts}`:'No owner-approved business knowledge was supplied.',
    followups?`Follow-ups due within 24h:\n${followups}`:'No verified follow-ups due within 24h.',
    handoffs?`Active human handoffs:\n${handoffs}`:'No active human handoffs.',
    appointments?`Real non-simulated appointments within 24h:\n${appointments}`:'No verified real appointments within 24h.',
    snapshot.store.low_stock.length?`Low-stock products (available units):\n${snapshot.store.low_stock.map(item=>`${item.name} | SKU ${item.sku} | available ${item.available}`).join('\n')}`:'No low-stock products are verified.',
    snapshot.store.expense_categories.length?`Today expenses by recent entry: ${snapshot.store.expense_categories.map(item=>`${item.category} AED ${item.amount_aed}`).join('; ')}`:'No store expenses are verified for today.',
    'This owner copilot is read-only. Never claim you executed, sent, changed, booked, paid, cancelled, or contacted anyone. Never call sales minus expenses profit. Recommend the exact next screen when action is needed: conversations, tasks, appointments, operations, integrations, or settings.',
  ].join('\n').slice(0,3900);
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const body=req.method==='POST'?await readJsonBody(req).catch(()=>null):null;
  const businessId=safeId(req.method==='GET'?queryValue(req,'business_id'):body?.business_id);
  if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
  const ctx=await authContext(req,res,businessId);if(!ctx)return;
  try{
    if(req.method==='GET'){
      const proof=await verifiedOutcomes(ctx.token,businessId);
      return json(res,200,{ok:true,business_id:businessId,proof,mode:'READ_ONLY_VERIFIED_OWNER_COPILOT',external_side_effects:false});
    }
    const message=clean(body?.message,800);
    if(!message)return json(res,400,{ok:false,error:'MESSAGE_REQUIRED'});
    const language=String(body?.language||'auto').toLowerCase()==='en'?'en':String(body?.language||'auto').toLowerCase()==='ar'?'ar':'auto';
    const snapshot=await buildSnapshot(ctx.token,businessId);
    const fallback=fallbackAnswer(message,language,snapshot);
    const recommendedScreen=recommendScreen(message,snapshot);
    let ai=null;
    try{
      ai=await generateDABBIRAiReply({project:'dabbir_businesses',message:`Owner operations question: ${message}\nAnswer the owner directly from the verified snapshot.`,language,businessContext:promptContext(snapshot)});
    }catch{ai=null}
    return json(res,200,{
      ok:true,
      business_id:businessId,
      answer:ai?.ok?ai.reply:fallback,
      answer_source:ai?.ok?'AI_GROUNDED_ON_VERIFIED_OWNER_SNAPSHOT':'DETERMINISTIC_VERIFIED_FALLBACK',
      provider_state:ai?.state||'FALLBACK',
      recommended_screen:recommendedScreen,
      proof:snapshot.proof,
      metrics:snapshot.metrics,
      mode:'READ_ONLY_VERIFIED_OWNER_COPILOT',
      external_side_effects:false,
      generated_at:snapshot.generated_at,
      timezone:snapshot.timezone,
      truth:{tenant_rls:true,exact_counts:true,owner_only:true,unverified_numbers_forbidden:true,simulated_appointments_excluded:true,store_metrics_are_dubai_day_facts:true,accounting_profit_not_asserted:true},
    });
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413].includes(status)?status:500;
    console.error('dabbir_owner_copilot_failed',{status:safe,error:String(error?.message||'OWNER_COPILOT_FAILED').slice(0,140)});
    return json(res,safe,{ok:false,error:safe===500?'OWNER_COPILOT_FAILED':String(error?.message||'OWNER_COPILOT_FAILED').slice(0,140)});
  }
}
