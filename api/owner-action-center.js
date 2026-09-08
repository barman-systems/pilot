import { singleQueryValue } from './_request-query.js';
import { branchFilter, resolveBranchScope } from './_branch-scope.js';
import { bookingLifecycle } from './_booking-lifecycle.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
  userClaimsFromValidatedAccessToken,
} from './_auth-core.js';
import {
  assertSnapshotCurrency,
  formatMarketMoney,
  marketDayStartIso,
  verifiedBusinessMarket,
} from './_gcc-money-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const terminalStates=['closed','completed','cancelled','resolved','returned_to_ai','sent','blocked'];
const terminal=value=>terminalStates.includes(String(value||'').toLowerCase());
// Handoffs/follow-ups use uppercase lifecycle values; older rows may be lowercase.
const terminalFilter=`not.in.(${terminalStates.flatMap(value=>[value,value.toUpperCase()]).join(',')})`;
const appointmentTerminalStates=[...terminalStates,'done','canceled','no_show','rejected'];
const appointmentTerminalFilter=`not.in.(${appointmentTerminalStates.flatMap(value=>[value,value.toUpperCase()]).join(',')})`;

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  // Every read here is a table collection. A missing/malformed upstream payload
  // is unavailable data, never evidence that the business has no pending work.
  if(!Array.isArray(payload))throw Object.assign(new Error(fallback),{status:502});
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));
async function restWithCount(token,path,fallback){
  const response=await supabaseRest(path,token,{headers:{prefer:'count=exact'}});
  const rows=await readData(response,fallback);
  const countMatch=/^(?:\d+-\d+|\*)\/(\d+)$/.exec(response.headers.get('content-range')||'');
  const total=countMatch?Number(countMatch[1]):NaN;
  if(!Number.isSafeInteger(total)||total<rows.length)throw Object.assign(new Error(fallback),{status:502});
  return {rows,total};
}

async function authenticatedContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}

  let memberships;
  try{
    memberships=await getBusinessMemberships(token);
  }catch(error){
    const status=Number(error?.code||500);
    if(status===401||status===403){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
    json(res,503,{ok:false,error:'AUTH_VERIFICATION_UNAVAILABLE'});return null;
  }

  let user=userClaimsFromValidatedAccessToken(token);
  if(!user)user=await getVerifiedUser(token).catch(()=>null);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}

function membershipFor(memberships,businessId){
  return businessId?memberships.find(m=>m.business_id===businessId)||null:memberships[0]||null;
}

function addItem(items,item){
  items.push({
    id:item.id,
    type:item.type,
    priority:item.priority,
    severity:item.severity,
    title_ar:item.title_ar,
    title_en:item.title_en,
    detail_ar:item.detail_ar||'',
    detail_en:item.detail_en||'',
    target:item.target||'dashboard',
    entity_id:item.entity_id||null,
    due_at:item.due_at||null,
    scope:item.scope||'branch',
    ...(item.lifecycle_scope?{lifecycle_scope:item.lifecycle_scope}:{}),
    ...(Number.isFinite(item.stock_available)?{stock_available:item.stock_available}:{}),
  });
}

function handledLabel(operationType){
  if(operationType==='followup.capture_internal'){
    return {ar:'التقط متابعة عميل تلقائيًا',en:'Captured a customer follow-up automatically'};
  }
  return {ar:'أكمل إجراءً موثقًا تلقائيًا',en:'Completed a verified action automatically'};
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const context=await authenticatedContext(req,res);
  if(!context)return;

  try{
    const query=new URL(String(req?.url||'/'),'https://dabbir.invalid').searchParams;
    if(query.getAll('business_id').length>1)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
    if(query.getAll('branch_id').length>1)return json(res,400,{ok:false,error:'INVALID_BRANCH_ID'});
    const requestedValue=singleQueryValue(req,'business_id');
    const requested=safeId(requestedValue);
    if(requestedValue!=null&&!requested)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
    const membership=membershipFor(context.memberships,requested);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    const businessId=membership.business_id;
    const scope=await resolveBranchScope({
      businessId,membership,userId:context.user.id,
      requestedBranch:singleQueryValue(req,'branch_id'),
      fetchRows:(path,label)=>rest(context.token,path,label),
    });
    const scoped=branchFilter(scope);
    // These records inherit their branch from the conversation. Filter at the
    // database before LIMIT, rather than dropping other branches after paging.
    const conversationJoin=scope.mode==='selected';
    const handoffRelation=conversationJoin?',conversation:dabbir_conversations!dabbir_handoffs_business_conversation_fk!inner(branch_id,business_id)':'';
    const followupRelation=conversationJoin?',conversation:dabbir_conversations!dabbir_followups_conversation_id_fkey!inner(branch_id,business_id)':'';
    const relatedScope=conversationJoin?branchFilter(scope,'conversation.branch_id')+`&conversation.business_id=eq.${businessId}`:'';

    const businessRows=await rest(
      context.token,
      `dabbir_businesses?select=id,country_code,currency_code,timezone&id=eq.${businessId}&limit=1`,
      'BUSINESS_MARKET_LOOKUP_FAILED',
    );
    const business=Array.isArray(businessRows)?businessRows[0]:null;
    if(!business)throw Object.assign(new Error('BUSINESS_MARKET_NOT_FOUND'),{status:409});
    const market=verifiedBusinessMarket(business);

    const now=Date.now();
    const in24h=now+24*60*60*1000;
    const in2h=now+2*60*60*1000;
    const dayStart=marketDayStartIso(now,market);
    const in24hIso=new Date(in24h).toISOString();

    const handledLookup=restWithCount(
      context.token,
      `dabbir_operation_outcomes?select=operation_type,outcome,autonomous,estimated_manual_seconds,completed_at&business_id=eq.${businessId}&outcome=eq.VERIFIED_SUCCESS&autonomous=eq.true&completed_at=gte.${dayStart}&order=completed_at.desc&limit=20`,
      'VERIFIED_OUTCOMES_LOOKUP_FAILED'
    ).then(({rows,total})=>({available:true,rows,total}))
      .catch(error=>({available:false,rows:[],status:Number(error?.status||0)||null}));

    // Inventory writes currently maintain the business balance. Read the exact
    // products' balances, rather than joining two unrelated first pages or
    // presenting the unmaintained branch snapshot as live stock.
    const stockLookup=rest(context.token,`dabbir_products?select=id,name,sku,active&business_id=eq.${businessId}&active=eq.true&order=id.asc&limit=200`,'PRODUCTS_LOOKUP_FAILED').then(async products=>{
      const ids=products.map(row=>safeId(row.id));
      if(ids.some(id=>!id))throw Object.assign(new Error('PRODUCTS_LOOKUP_FAILED'),{status:502});
      const pages=[];
      for(let start=0;start<ids.length;start+=50){
        pages.push(rest(context.token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&product_id=in.(${ids.slice(start,start+50).join(',')})&order=product_id.asc&limit=50`,'INVENTORY_LOOKUP_FAILED'));
      }
      return {products,inventory:(await Promise.all(pages)).flat()};
    });
    const [conversations,handoffs,followups,todayAppointments,olderAppointments,stockResult,orders,channels,customers,handledResult]=await Promise.all([
      // Filter actionable rows BEFORE bounding the reads. Historical successes
      // must not fill the first page and hide today's work from an active owner.
      rest(context.token,`dabbir_conversations?select=id,customer_id,state,channel_type,updated_at&business_id=eq.${businessId}${scoped}&state=eq.action_required&order=updated_at.desc,id.asc&limit=100`,'CONVERSATIONS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_handoffs?select=id,conversation_id,customer_id,state,priority,reason,summary,assigned_user_id,created_at,updated_at${handoffRelation}&business_id=eq.${businessId}${relatedScope}&state=${terminalFilter}&order=updated_at.desc,id.asc&limit=100`,'HANDOFFS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_followups?select=id,conversation_id,customer_id,status,reason,due_at,recommended_message,blocked_reason,send_count,max_sends${followupRelation}&business_id=eq.${businessId}${relatedScope}&status=${terminalFilter}&due_at=lte.${in24hIso}&order=due_at.asc,id.asc&limit=100`,'FOLLOWUPS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_appointments?select=id,customer_id,starts_at,ends_at,status,simulated&business_id=eq.${businessId}${scoped}&status=${appointmentTerminalFilter}&simulated=not.is.true&starts_at=gte.${dayStart}&starts_at=lte.${in24hIso}&order=starts_at.asc,id.asc&limit=100`,'APPOINTMENTS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_appointments?select=id,customer_id,starts_at,ends_at,status,simulated&business_id=eq.${businessId}${scoped}&status=${appointmentTerminalFilter}&simulated=not.is.true&starts_at=lt.${dayStart}&order=starts_at.desc,id.asc&limit=100`,'APPOINTMENTS_LOOKUP_FAILED'),
      stockLookup,
      rest(context.token,`dabbir_orders?select=id,customer_id,status,total_amount,currency_code,simulated,created_at&business_id=eq.${businessId}${scoped}&status=in.(draft,reserved)&simulated=eq.false&order=created_at.desc,id.asc&limit=100`,'ORDERS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_channels?select=id,channel_type,status,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=50`,'CHANNELS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
      handledLookup,
    ]);
    const {products,inventory}=stockResult;

    const customerName=new Map((customers||[]).map(row=>[row.id,row.display_name||null]));
    const stockByProduct=new Map((inventory||[]).map(row=>[row.product_id,row]));
    const items=[];

    for(const conversation of conversations||[]){
      if(String(conversation.state||'').toLowerCase()!=='action_required')continue;
      const name=customerName.get(conversation.customer_id)||'عميل';
      addItem(items,{id:`conversation:${conversation.id}`,type:'conversation',priority:100,severity:'critical',title_ar:`محادثة تحتاج تدخلك: ${name}`,title_en:`Conversation needs you: ${name}`,detail_ar:'دَبِّر لم يغلق هذه المحادثة تلقائيًا ويجب مراجعتها.',detail_en:'DABBIR could not close this conversation automatically and it needs review.',target:'conversations',entity_id:conversation.id,due_at:conversation.updated_at});
    }

    for(const handoff of handoffs||[]){
      if(terminal(handoff.state))continue;
      const name=customerName.get(handoff.customer_id)||'عميل';
      const p=Math.max(80,90+Math.min(9,number(handoff.priority)));
      addItem(items,{id:`handoff:${handoff.id}`,type:'handoff',priority:p,severity:'critical',title_ar:`استلام بشري نشط: ${name}`,title_en:`Human takeover active: ${name}`,detail_ar:handoff.summary||handoff.reason||'هناك محادثة تحت مسؤولية عنصر بشري.',detail_en:handoff.summary||handoff.reason||'A conversation is currently owned by a human agent.',target:'conversations',entity_id:handoff.conversation_id,due_at:handoff.updated_at});
    }

    for(const followup of followups||[]){
      if(terminal(followup.status))continue;
      const due=followup.due_at?Date.parse(followup.due_at):NaN;
      if(!Number.isFinite(due)||due>in24h)continue;
      const overdue=due<=now;
      const name=customerName.get(followup.customer_id)||'عميل';
      addItem(items,{id:`followup:${followup.id}`,type:'followup',priority:overdue?92:74,severity:overdue?'critical':'warning',title_ar:overdue?`متابعة متأخرة: ${name}`:`متابعة اليوم: ${name}`,title_en:overdue?`Overdue follow-up: ${name}`:`Follow-up today: ${name}`,detail_ar:followup.blocked_reason?`محظورة: ${followup.blocked_reason}`:(followup.recommended_message||followup.reason||'متابعة مستحقة.'),detail_en:followup.blocked_reason?`Blocked: ${followup.blocked_reason}`:(followup.recommended_message||followup.reason||'Follow-up is due.'),target:'tasks',entity_id:followup.conversation_id,due_at:followup.due_at});
    }

    for(const appointment of [...todayAppointments,...olderAppointments]){
      const status=String(appointment.status||'').toLowerCase();
      if(appointment.simulated===true||appointmentTerminalStates.includes(status))continue;
      const starts=appointment.starts_at?Date.parse(appointment.starts_at):NaN;
      if(!Number.isFinite(starts)||starts>in24h)continue;
      const soon=starts<=in2h;
      const started=starts<now;
      const lifecycleScope=bookingLifecycle.classify(appointment,business,now);
      const older=starts<Date.parse(dayStart);
      const ongoing=started&&status==='in_progress'&&lifecycleScope==='current';
      const needsReview=started&&!ongoing;
      const name=customerName.get(appointment.customer_id)||'عميل';
      addItem(items,{
        id:`appointment:${appointment.id}`,type:'appointment',
        priority:needsReview?(older?76:88):ongoing?58:soon?78:58,
        severity:needsReview?'critical':ongoing?'info':soon?'warning':'info',
        title_ar:needsReview?`راجع حالة موعد سابق: ${name}`:ongoing?`خدمة جارية: ${name}`:soon?`موعد قريب جدًا: ${name}`:`موعد خلال 24 ساعة: ${name}`,
        title_en:needsReview?`Review an unfinished appointment: ${name}`:ongoing?`Service in progress: ${name}`:soon?`Appointment soon: ${name}`:`Appointment within 24 hours: ${name}`,
        detail_ar:needsReview?'مر وقت الموعد دون تسجيل نتيجة نهائية. راجع حالته؛ مرور الوقت لا يعني إكمال الخدمة.':ongoing?'الحالة المسجلة: الخدمة قيد التنفيذ.':'راجع الموعد وتأكد من جاهزية النشاط.',
        detail_en:needsReview?'The scheduled time has passed without a final outcome. Review the status; elapsed time does not prove completion.':ongoing?'Recorded status: service in progress.':'Review the appointment and make sure the business is ready.',
        target:'appointments',entity_id:appointment.id,due_at:appointment.starts_at,lifecycle_scope:lifecycleScope,
      });
    }

    for(const product of products||[]){
      if(product.active===false)continue;
      const stock=stockByProduct.get(product.id);
      if(!stock){
        addItem(items,{id:`stock:${product.id}`,type:'inventory',scope:'business',priority:64,severity:'warning',title_ar:`تحقق من رصيد المخزون: ${product.name}`,title_en:`Check stock balance: ${product.name}`,detail_ar:'لا يوجد رصيد مسجل لهذا المنتج. افتح المخزون لمراجعته؛ الرصيد غير معلوم.',detail_en:'This product has no recorded stock balance. Open inventory to review it; the balance is unknown.',target:'operations',entity_id:product.id});
        continue;
      }
      const available=Math.max(0,number(stock.quantity)-number(stock.reserved));
      if(available>5)continue;
      addItem(items,{id:`stock:${product.id}`,type:'inventory',scope:'business',stock_available:available,priority:available===0?86:64,severity:available===0?'critical':'warning',title_ar:available===0?`نفد المخزون: ${product.name}`:`مخزون منخفض: ${product.name}`,title_en:available===0?`Out of stock: ${product.name}`:`Low stock: ${product.name}`,detail_ar:`المتاح حاليًا ${available} من ${number(stock.quantity)}.`,detail_en:`Available now: ${available} of ${number(stock.quantity)}.`,target:'operations',entity_id:product.id,due_at:stock.updated_at||null});
    }

    for(const order of orders||[]){
      if(order.simulated!==false)continue;
      const status=String(order.status||'').toLowerCase();
      if(!['draft','reserved'].includes(status))continue;
      assertSnapshotCurrency(order.currency_code,market,'ORDER');
      const name=customerName.get(order.customer_id)||'عميل';
      const amountAr=formatMarketMoney(order.total_amount,market,'ar');
      const amountEn=formatMarketMoney(order.total_amount,market,'en');
      addItem(items,{id:`order:${order.id}`,type:'order',priority:status==='reserved'?68:54,severity:'warning',title_ar:status==='reserved'?`طلب محجوز يحتاج متابعة: ${name}`:`طلب غير مكتمل: ${name}`,title_en:status==='reserved'?`Reserved order needs follow-up: ${name}`:`Incomplete order: ${name}`,detail_ar:`القيمة ${amountAr} — الحالة ${status}.`,detail_en:`${amountEn} — status ${status}.`,target:'operations',entity_id:order.id,due_at:order.created_at});
    }

    const liveStates=new Set(['connected','operational','verified','live']);
    for(const channel of channels||[]){
      const status=String(channel.status||'').toLowerCase();
      if(liveStates.has(status))continue;
      addItem(items,{id:`channel:${channel.id}`,type:'channel',scope:'business',priority:38,severity:'info',title_ar:`تحقق من قناة ${channel.channel_type}`,title_en:`Verify ${channel.channel_type} channel`,detail_ar:`الحالة الحالية: ${channel.status||'غير معروفة'}. القناة ليست مثبتة كتشغيل حي بعد.`,detail_en:`Current status: ${channel.status||'unknown'}. The channel is not yet proven live.`,target:'integrations',entity_id:channel.id,due_at:channel.updated_at});
    }

    items.sort((a,b)=>b.priority-a.priority||String(a.due_at||'').localeCompare(String(b.due_at||'')));
    const urgent=items.filter(item=>item.severity==='critical').length;
    const warning=items.filter(item=>item.severity==='warning').length;
    const top=items.slice(0,3);
    const handledRows=handledResult.available?handledResult.rows:[];
    const handledLatest=handledRows.slice(0,3).map(row=>{
      const label=handledLabel(row.operation_type);
      return {operation_type:row.operation_type,title_ar:label.ar,title_en:label.en,completed_at:row.completed_at};
    });
    const handledCount=handledResult.available?handledResult.total:null;
    const limited=[conversations,handoffs,followups,todayAppointments,olderAppointments,orders].some(rows=>rows.length>=100)||products.length>=200||channels.length>=50;
    const handledPrefixAr=handledResult.available&&handledCount>0?`دَبِّر أنجز ${handledCount} إجراءً موثقًا تلقائيًا في النشاط اليوم. `:'';
    const handledPrefixEn=handledResult.available&&handledCount>0?`DABBIR completed ${handledCount} verified autonomous ${handledCount===1?'action':'actions'} across the business today. `:'';
    const briefAr=handledPrefixAr+(top.length?`أهم ما يحتاج تدخلك الآن: ${top.map(item=>item.title_ar).join('، ')}.`:'لا توجد أولويات في البيانات المتاحة.')+(limited?' قد توجد سجلات إضافية؛ راجع القسم المعني للقائمة الكاملة.':'');
    const briefEn=handledPrefixEn+(top.length?`What needs your attention now: ${top.map(item=>item.title_en).join(', ')}.`:'No priorities in the available data.')+(limited?' Additional records may exist; open the relevant section for its full list.':'');

    res.setHeader('x-dabbir-owner-action-center-auth','fast-v1');
    return json(res,200,{
      ok:true,
      business_id:businessId,
      branch_scope:{mode:scope.mode,branch_id:scope.branch_id},
      role:membership.role,
      generated_at:new Date().toISOString(),
      country_code:market.country_code,
      currency_code:market.currency_code,
      timezone:market.timezone,
      status:urgent>0?'needs_attention':warning>0?'watch':'clear',
      metrics:{urgent,warning,total:items.length,handled_verified_today:handledResult.available?handledCount:null,upcoming_24h:items.filter(item=>['appointment','followup'].includes(item.type)&&Date.parse(item.due_at)>=now&&Date.parse(item.due_at)<=in24h).length,low_stock:items.filter(item=>item.type==='inventory'&&Number.isFinite(item.stock_available)).length,orders_needing_action:items.filter(item=>item.type==='order').length},
      handled:{scope:'business',available:handledResult.available,verified_autonomous_today:handledResult.available?handledCount:null,latest:handledResult.available?handledLatest:[]},
      brief:{ar:briefAr,en:briefEn},
      items,
      truth:{source:'live_dabbir_tenant_data',auth_fast_path:true,market_contract:'verified_country_currency_timezone',money_source:'currency_snapshotted_generic_amounts',simulated_orders_excluded:true,simulated_appointments_excluded:true,handled_counts_only_verified_success_autonomous_outcomes:true,handled_unavailable_is_not_zero:true,inventory_scope:'business',channels_scope:'business',source_limits_reached:limited},
    });
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,429,502,503].includes(status)?status:500;
    console.error('dabbir_owner_action_center_failed',{error:String(error?.message||'OWNER_ACTION_CENTER_FAILED').slice(0,140),status:safe});
    return json(res,safe,{ok:false,error:String(error?.message||'OWNER_ACTION_CENTER_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
