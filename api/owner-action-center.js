import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const terminal=value=>['closed','completed','cancelled','resolved','returned_to_ai','sent','blocked'].includes(String(value||'').toLowerCase());

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
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));

async function authenticatedContext(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
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
  });
}

function dubaiDayStartIso(nowMs){
  const dubaiOffsetMs=4*60*60*1000;
  const dubaiDay=new Date(nowMs+dubaiOffsetMs).toISOString().slice(0,10);
  return new Date(`${dubaiDay}T00:00:00+04:00`).toISOString();
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
    const requested=safeId(req.query?.business_id);
    const membership=membershipFor(context.memberships,requested);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    const businessId=membership.business_id;
    const now=Date.now();
    const in24h=now+24*60*60*1000;
    const in2h=now+2*60*60*1000;
    const dayStart=dubaiDayStartIso(now);

    const handledLookup=rest(
      context.token,
      `dabbir_operation_outcomes?select=operation_type,outcome,autonomous,estimated_manual_seconds,completed_at&business_id=eq.${businessId}&outcome=eq.VERIFIED_SUCCESS&autonomous=eq.true&completed_at=gte.${dayStart}&order=completed_at.desc&limit=20`,
      'VERIFIED_OUTCOMES_LOOKUP_FAILED'
    ).then(rows=>({available:true,rows:Array.isArray(rows)?rows:[]}))
      .catch(error=>({available:false,rows:[],status:Number(error?.status||0)||null}));

    const [conversations,handoffs,followups,appointments,products,inventory,orders,channels,customers,handledResult]=await Promise.all([
      rest(context.token,`dabbir_conversations?select=id,customer_id,state,channel_type,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=100`,'CONVERSATIONS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_handoffs?select=id,conversation_id,customer_id,state,priority,reason,summary,assigned_user_id,created_at,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=100`,'HANDOFFS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_followups?select=id,conversation_id,customer_id,status,reason,due_at,recommended_message,blocked_reason,send_count,max_sends&business_id=eq.${businessId}&order=due_at.asc&limit=100`,'FOLLOWUPS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_appointments?select=id,customer_id,starts_at,status,simulated&business_id=eq.${businessId}&order=starts_at.asc&limit=100`,'APPOINTMENTS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_products?select=id,name,sku,active&business_id=eq.${businessId}&limit=200`,'PRODUCTS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&limit=200`,'INVENTORY_LOOKUP_FAILED'),
      rest(context.token,`dabbir_orders?select=id,customer_id,status,total_aed,simulated,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=100`,'ORDERS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_channels?select=id,channel_type,status,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=50`,'CHANNELS_LOOKUP_FAILED'),
      rest(context.token,`dabbir_customers?select=id,display_name&business_id=eq.${businessId}&limit=200`,'CUSTOMERS_LOOKUP_FAILED'),
      handledLookup,
    ]);

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

    for(const appointment of appointments||[]){
      if(appointment.simulated===true||terminal(appointment.status))continue;
      const starts=appointment.starts_at?Date.parse(appointment.starts_at):NaN;
      if(!Number.isFinite(starts)||starts<now||starts>in24h)continue;
      const soon=starts<=in2h;
      const name=customerName.get(appointment.customer_id)||'عميل';
      addItem(items,{id:`appointment:${appointment.id}`,type:'appointment',priority:soon?78:58,severity:soon?'warning':'info',title_ar:soon?`موعد قريب جدًا: ${name}`:`موعد خلال 24 ساعة: ${name}`,title_en:soon?`Appointment soon: ${name}`:`Appointment within 24 hours: ${name}`,detail_ar:'راجع الموعد وتأكد من جاهزية النشاط.',detail_en:'Review the appointment and make sure the business is ready.',target:'appointments',entity_id:appointment.id,due_at:appointment.starts_at});
    }

    for(const product of products||[]){
      if(product.active===false)continue;
      const stock=stockByProduct.get(product.id)||{quantity:0,reserved:0};
      const available=Math.max(0,number(stock.quantity)-number(stock.reserved));
      if(available>5)continue;
      addItem(items,{id:`stock:${product.id}`,type:'inventory',priority:available===0?86:64,severity:available===0?'critical':'warning',title_ar:available===0?`نفد المخزون: ${product.name}`:`مخزون منخفض: ${product.name}`,title_en:available===0?`Out of stock: ${product.name}`:`Low stock: ${product.name}`,detail_ar:`المتاح حاليًا ${available} من ${number(stock.quantity)}.`,detail_en:`Available now: ${available} of ${number(stock.quantity)}.`,target:'operations',entity_id:product.id,due_at:stock.updated_at||null});
    }

    for(const order of orders||[]){
      if(order.simulated!==false)continue;
      const status=String(order.status||'').toLowerCase();
      if(!['draft','reserved'].includes(status))continue;
      const name=customerName.get(order.customer_id)||'عميل';
      addItem(items,{id:`order:${order.id}`,type:'order',priority:status==='reserved'?68:54,severity:'warning',title_ar:status==='reserved'?`طلب محجوز يحتاج متابعة: ${name}`:`طلب غير مكتمل: ${name}`,title_en:status==='reserved'?`Reserved order needs follow-up: ${name}`:`Incomplete order: ${name}`,detail_ar:`القيمة ${number(order.total_aed).toFixed(2)} د.إ — الحالة ${status}.`,detail_en:`AED ${number(order.total_aed).toFixed(2)} — status ${status}.`,target:'operations',entity_id:order.id,due_at:order.created_at});
    }

    const liveStates=new Set(['connected','operational','verified','live']);
    for(const channel of channels||[]){
      const status=String(channel.status||'').toLowerCase();
      if(liveStates.has(status))continue;
      addItem(items,{id:`channel:${channel.id}`,type:'channel',priority:38,severity:'info',title_ar:`تحقق من قناة ${channel.channel_type}`,title_en:`Verify ${channel.channel_type} channel`,detail_ar:`الحالة الحالية: ${channel.status||'غير معروفة'}. القناة ليست مثبتة كتشغيل حي بعد.`,detail_en:`Current status: ${channel.status||'unknown'}. The channel is not yet proven live.`,target:'integrations',entity_id:channel.id,due_at:channel.updated_at});
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
    const handledCount=handledRows.length;
    const handledPrefixAr=handledResult.available&&handledCount>0?`دَبِّر أنجز ${handledCount} إجراءً موثقًا تلقائيًا اليوم. `:'';
    const handledPrefixEn=handledResult.available&&handledCount>0?`DABBIR completed ${handledCount} verified autonomous ${handledCount===1?'action':'actions'} today. `:'';
    const briefAr=handledPrefixAr+(top.length?`أهم ما يحتاج تدخلك الآن: ${top.map(item=>item.title_ar).join('، ')}.`:'لا توجد عناصر حرجة أو مستحقة خلال 24 ساعة. دَبِّر يراقب النشاط.');
    const briefEn=handledPrefixEn+(top.length?`What needs your attention now: ${top.map(item=>item.title_en).join(', ')}.`:'No critical or due items in the next 24 hours. DABBIR is monitoring the business.');

    return json(res,200,{
      ok:true,
      business_id:businessId,
      role:membership.role,
      generated_at:new Date().toISOString(),
      timezone:'Asia/Dubai',
      status:urgent>0?'needs_attention':warning>0?'watch':'clear',
      metrics:{urgent,warning,total:items.length,handled_verified_today:handledResult.available?handledCount:null,upcoming_24h:items.filter(item=>item.type==='appointment'||item.type==='followup').length,low_stock:items.filter(item=>item.type==='inventory').length,orders_needing_action:items.filter(item=>item.type==='order').length},
      handled:{available:handledResult.available,verified_autonomous_today:handledResult.available?handledCount:null,latest:handledResult.available?handledLatest:[]},
      brief:{ar:briefAr,en:briefEn},
      items:items.slice(0,12),
      truth:{source:'live_dabbir_tenant_data',simulated_orders_excluded:true,simulated_appointments_excluded:true,handled_counts_only_verified_success_autonomous_outcomes:true,handled_unavailable_is_not_zero:true},
    });
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,429,502,503].includes(status)?status:500;
    console.error('dabbir_owner_action_center_failed',{error:String(error?.message||'OWNER_ACTION_CENTER_FAILED').slice(0,140),status:safe});
    return json(res,safe,{ok:false,error:String(error?.message||'OWNER_ACTION_CENTER_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
