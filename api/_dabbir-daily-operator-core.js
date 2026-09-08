import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const DAILY_OPERATOR_VERSION = 'v5.0-complete-free-first';
export const DAILY_OPERATOR_POLICY = 'operator.daily_business_review';
export const DAILY_OPERATOR_MODEL = process.env.DABBIR_DAILY_OPERATOR_MODEL || 'gemini-3.7-flash';

export const DAILY_AGENT_ROLES = Object.freeze({
  business_owner: {
    role: 'Business Owner / Orchestrator Agent',
    goal: 'Set the daily priorities, protect profit, coordinate departments, and issue evidence-backed operating decisions.',
    backstory: 'A commercially disciplined general manager who accepts only verified DABBIR data, moves quickly on reversible low-risk work, and blocks financial or external actions without policy authority.',
  },
  sales_inventory: {
    role: 'Sales & Inventory Agent',
    goal: 'Track real sales and available stock, identify stock-out risk, and surface products that need replenishment or a pause.',
    backstory: 'A retail operator who values cash conversion, accurate stock, and idempotent execution over optimistic assumptions.',
  },
  marketing_growth: {
    role: 'Marketing & Growth Agent',
    goal: 'Find stagnant inventory and select a margin-safe campaign angle and timing without publishing paid or mass outreach automatically.',
    backstory: 'A growth lead who treats discounts as a cost, requires margin evidence, and prefers targeted offers over vanity activity.',
  },
  finance_operations: {
    role: 'Finance & Operations Agent',
    goal: 'Calculate recorded revenue, expenses, contribution, and product margin coverage while declaring every missing cost or attribution field.',
    backstory: 'A conservative finance operator who never labels revenue as cash or estimates profit when cost evidence is missing.',
  },
});

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DIRECT_TIMEOUT_MS = 6500;
const clean = (value, max = 1000) => String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const roundMoney = value => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const safeArray = value => Array.isArray(value) ? value : [];
const encoded = value => encodeURIComponent(String(value));
const firstNumber = (...values) => values.find(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) ?? 0;
const ratio = (numerator, denominator) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;

function serviceRoleKey(env = process.env) {
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY, 8192);
  if (!key || key.startsWith('sb_publishable_')) throw Object.assign(new Error('DAILY_OPERATOR_SERVICE_ROLE_NOT_CONFIGURED'), { status: 503 });
  return key;
}

async function adminRest(key, path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    cache: 'no-store',
    redirect: 'manual',
    ...options,
    headers: supabaseKeyHeaders(key, { accept: 'application/json', ...(options.headers || {}) }),
    signal: options.signal || AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw Object.assign(new Error(payload?.message || payload?.code || 'DAILY_OPERATOR_DATA_FAILED'), { status: response.status });
  return payload;
}

function localDateKey(value, timeZone = 'Asia/Dubai') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const map = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch { return new Date(value).toISOString().slice(0, 10); }
}

function productCost(product) {
  const metadata = product?.metadata && typeof product.metadata === 'object' ? product.metadata : {};
  const value = [metadata.unit_cost_amount, metadata.unit_cost_aed, metadata.cost_amount, metadata.cost_aed]
    .find(candidate => Number.isFinite(Number(candidate)) && Number(candidate) >= 0);
  return value == null ? null : roundMoney(value);
}

function orderRevenue(order) {
  const paid = amount(firstNumber(order?.paid_amount, order?.paid_aed));
  const total = amount(firstNumber(order?.total_amount, order?.total_aed));
  return roundMoney(paid > 0 ? paid : total);
}

function appointmentRevenue(item) {
  const quoted = amount(firstNumber(item?.quoted_price_amount, item?.quoted_price_aed));
  const discount = amount(firstNumber(item?.discount_amount, item?.discount_aed));
  const visit = amount(firstNumber(item?.visit_fee_amount, item?.visit_fee_aed));
  return roundMoney(Math.max(0, quoted - discount + visit));
}

function isCompletedOrder(item) {
  return item?.simulated !== true && ['completed', 'paid', 'fulfilled', 'closed'].includes(clean(item?.status, 40).toLowerCase());
}

export function salesInventoryAgent(snapshot) {
  const products = safeArray(snapshot.products).filter(item => item.active !== false);
  const inventoryByProduct = new Map(safeArray(snapshot.inventory).map(item => [item.product_id, item]));
  const completedOrders = safeArray(snapshot.orders).filter(isCompletedOrder);
  const completedIds = new Set(completedOrders.map(item => item.id));
  const sold = new Map();
  for (const item of safeArray(snapshot.order_items)) {
    if (!completedIds.has(item.order_id)) continue;
    const current = sold.get(item.product_id) || { quantity: 0, revenue: 0 };
    current.quantity += Math.max(0, Math.trunc(amount(item.quantity)));
    current.revenue += amount(firstNumber(item.line_total_amount, item.line_total_aed));
    sold.set(item.product_id, current);
  }
  const stock = products.map(product => {
    const row = inventoryByProduct.get(product.id) || {};
    const available = Math.max(0, Math.trunc(amount(row.quantity)) - Math.max(0, Math.trunc(amount(row.reserved))));
    return { product_id: product.id, sku: clean(product.sku, 80), name: clean(product.name, 160), price: roundMoney(firstNumber(product.price_amount, product.price_aed)), unit_cost: productCost(product), available, sold_30d: sold.get(product.id)?.quantity || 0, sales_30d: roundMoney(sold.get(product.id)?.revenue || 0) };
  });
  const lowStock = stock.filter(item => item.available <= 3).sort((a, b) => a.available - b.available);
  const stagnant = stock.filter(item => item.available > 0 && item.sold_30d === 0).sort((a, b) => b.available - a.available);
  const topProducts = stock.filter(item => item.sold_30d > 0).sort((a, b) => b.sales_30d - a.sales_30d).slice(0, 5);
  return {
    agent: DAILY_AGENT_ROLES.sales_inventory,
    truth: 'verified_dabbir_data_with_explicit_rules',
    counts: { active_products: products.length, tracked_inventory: stock.length, completed_orders_30d: completedOrders.length },
    low_stock: lowStock.slice(0, 10),
    stagnant_products: stagnant.slice(0, 10),
    top_products: topProducts,
    decisions: lowStock.map(item => ({ type: item.available === 0 ? 'PAUSE_OR_REPLENISH' : 'REORDER_REVIEW', product_id: item.product_id, product_name: item.name, available: item.available })).slice(0, 10),
  };
}

export function financeOperationsAgent(snapshot) {
  const day = snapshot.day;
  const completedOrders = safeArray(snapshot.orders).filter(isCompletedOrder);
  const completedAppointments = safeArray(snapshot.appointments).filter(item => item.simulated !== true && clean(item.status, 40).toLowerCase() === 'completed');
  const todayOrders = completedOrders.filter(item => localDateKey(item.completed_at || item.created_at, snapshot.timezone) === day);
  const todayAppointments = completedAppointments.filter(item => localDateKey(item.starts_at || item.created_at, snapshot.timezone) === day);
  const todayExpenses = safeArray(snapshot.expenses).filter(item => clean(item.occurred_on, 10) === day);
  const ordersRevenue = roundMoney(todayOrders.reduce((sum, item) => sum + orderRevenue(item), 0));
  const appointmentsRevenue = roundMoney(todayAppointments.reduce((sum, item) => sum + appointmentRevenue(item), 0));
  const expenses = roundMoney(todayExpenses.reduce((sum, item) => sum + amount(firstNumber(item.amount, item.amount_aed)), 0));
  const marketingSpend = roundMoney(todayExpenses.filter(item => clean(item.category, 40).toLowerCase() === 'marketing').reduce((sum, item) => sum + amount(firstNumber(item.amount, item.amount_aed)), 0));
  const shippingSpend = roundMoney(todayExpenses.filter(item => ['transport', 'shipping', 'delivery'].includes(clean(item.category, 40).toLowerCase())).reduce((sum, item) => sum + amount(firstNumber(item.amount, item.amount_aed)), 0));
  const recordedRevenue = roundMoney(ordersRevenue + appointmentsRevenue);
  const productById = new Map(safeArray(snapshot.products).map(item => [item.id, item]));
  const completedIds = new Set(todayOrders.map(item => item.id));
  const margins = [];
  for (const item of safeArray(snapshot.order_items)) {
    if (!completedIds.has(item.order_id)) continue;
    const cost = productCost(productById.get(item.product_id));
    const quantity = Math.max(0, Math.trunc(amount(item.quantity)));
    const revenue = roundMoney(firstNumber(item.line_total_amount, item.line_total_aed));
    margins.push({ product_id: item.product_id, product_name: clean(item.product_name, 160), quantity, revenue, unit_cost: cost, gross_profit: cost == null ? null : roundMoney(revenue - cost * quantity), margin_percent: cost == null || revenue <= 0 ? null : roundMoney(((revenue - cost * quantity) / revenue) * 100), cost_truth: cost == null ? 'UNAVAILABLE' : 'CURRENT_PRODUCT_METADATA_NOT_HISTORICAL_SNAPSHOT' });
  }
  const costed = margins.filter(item => item.gross_profit != null);
  return {
    agent: DAILY_AGENT_ROLES.finance_operations,
    truth: 'verified_dabbir_data_with_declared_coverage',
    currency: snapshot.currency,
    today: { recorded_revenue: recordedRevenue, order_revenue: ordersRevenue, appointment_revenue: appointmentsRevenue, expenses, operating_contribution_before_unrecorded_costs: roundMoney(recordedRevenue - expenses), marketing_spend: marketingSpend, shipping_spend: shippingSpend, blended_revenue_to_marketing_spend: marketingSpend > 0 ? roundMoney(recordedRevenue / marketingSpend) : null },
    sale_margins: margins.slice(0, 20),
    margin_coverage: { costed_lines: costed.length, total_lines: margins.length, exact_historical_cogs_available: false },
    limits: ['Orders are not treated as cash receipts.', 'Operating contribution is not net profit when costs are missing.', 'Marketing attribution is unavailable; the ratio is blended, not campaign ROAS.'],
  };
}

export function marketingGrowthAgent(snapshot, sales, finance) {
  const target = sales.stagnant_products[0] || null;
  if (!target) return { agent: DAILY_AGENT_ROLES.marketing_growth, truth: 'rule_based_from_verified_data', decision: { state: 'NO_CAMPAIGN_REQUIRED', reason: 'No active in-stock product had zero completed-order sales in the 30-day window.' } };
  const price = amount(target.price), cost = target.unit_cost;
  const marginKnown = cost != null && price > 0;
  const discountedPrice = roundMoney(price * 0.9);
  const discountSafe = marginKnown && discountedPrice >= roundMoney(cost * 1.15);
  const offerType = discountSafe ? 'THREE_DAY_10_PERCENT_OFFER' : 'VALUE_BUNDLE_OR_CONTENT_NO_DISCOUNT';
  return {
    agent: DAILY_AGENT_ROLES.marketing_growth,
    truth: 'rule_based_from_verified_data',
    decision: {
      state: 'CAMPAIGN_DECIDED',
      target_product_id: target.product_id,
      target_product_name: target.name,
      available_inventory: target.available,
      offer_type: offerType,
      discount_percent: discountSafe ? 10 : 0,
      proposed_price: discountSafe ? discountedPrice : price,
      angle_ar: discountSafe ? `عرض محدود لتحريك ${target.name} مع الحفاظ على حد أمان للتكلفة.` : `قدّم ${target.name} ضمن باقة قيمة أو محتوى تعليمي من دون خصم غير مثبت الهامش.`,
      timing: { start_local: `${snapshot.day}T16:00:00`, duration_days: 3 },
      execution_state: 'DECIDED_NOT_PUBLISHED_HIGH_RISK_GATE',
      gate: 'Paid advertising, mass messaging, or price publication requires an explicit campaign executor and policy authority.',
      finance_context: { marketing_spend_today: finance.today.marketing_spend, margin_known: marginKnown, discount_safe: discountSafe },
    },
  };
}

export function bookingFunnelAgent(snapshot) {
  const rows = safeArray(snapshot.booking_funnel);
  const nowMs = Date.parse(snapshot.now);
  const staleBefore = nowMs - 6 * 60 * 60 * 1000;
  const qualified = rows.filter(item => item.qualified_at).length;
  const booked = rows.filter(item => item.converted_to_booking === true).length;
  const confirmed = rows.filter(item => item.confirmed_at).length;
  const completed = rows.filter(item => item.completed_in_system === true).length;
  const paid = rows.filter(item => item.payment_recorded === true).length;
  const lost = rows.filter(item => item.has_loss_event === true).length;
  const stalled = rows.filter(item => {
    const stage = clean(item.latest_stage, 40).toUpperCase();
    const last = Date.parse(item.last_event_at);
    return item.has_loss_event !== true && item.completed_in_system !== true &&
      ['QUALIFIED', 'BOOKED', 'CONFIRMED', 'RESCHEDULED'].includes(stage) &&
      Number.isFinite(last) && last < staleBefore;
  });
  const today = {
    qualified: rows.filter(item => item.qualified_at && localDateKey(item.qualified_at, snapshot.timezone) === snapshot.day).length,
    booked: rows.filter(item => item.booked_at && localDateKey(item.booked_at, snapshot.timezone) === snapshot.day).length,
    confirmed: rows.filter(item => item.confirmed_at && localDateKey(item.confirmed_at, snapshot.timezone) === snapshot.day).length,
    completed: rows.filter(item => item.completed_at && localDateKey(item.completed_at, snapshot.timezone) === snapshot.day).length,
    payment_recorded: rows.filter(item => item.paid_recorded_at && localDateKey(item.paid_recorded_at, snapshot.timezone) === snapshot.day).length,
  };
  const attributedValue = roundMoney(rows.reduce((sum, item) => sum + Math.max(0, amount(item.attributed_value_amount)), 0));
  return {
    truth: 'durable_booking_funnel_evidence',
    window_days: 31,
    journeys: rows.length,
    counts: { qualified, booked, confirmed, completed, payment_recorded: paid, lost, stalled: stalled.length },
    today,
    conversion: {
      qualified_to_booking_percent: ratio(booked, qualified),
      booking_to_completion_percent: ratio(completed, booked),
    },
    attributed_value_amount: attributedValue,
    currency: rows.find(item => item.currency_code)?.currency_code || snapshot.currency,
    stalled_journeys: stalled.slice(0, 20).map(item => ({ conversation_id: item.conversation_id, appointment_id: item.appointment_id, latest_stage: item.latest_stage, last_event_at: item.last_event_at })),
    limits: ['Funnel counts use durable DABBIR evidence only.', 'Payment recorded in DABBIR is not proof of external settlement unless a provider callback or human confirmation exists.'],
  };
}

export function appointmentOperationsAgent(snapshot) {
  const appointments = safeArray(snapshot.appointments).filter(item => item.simulated !== true);
  const now = Date.parse(snapshot.now);
  const next24 = now + 24 * 60 * 60 * 1000;
  const today = appointments.filter(item => localDateKey(item.starts_at || item.created_at, snapshot.timezone) === snapshot.day);
  const upcoming24h = appointments.filter(item => {
    const starts = Date.parse(item.starts_at);
    return Number.isFinite(starts) && starts >= now && starts <= next24 && !['cancelled', 'completed', 'no_show'].includes(clean(item.status, 40).toLowerCase());
  });
  const counts = appointments.reduce((out, item) => {
    const status = clean(item.status, 40).toLowerCase() || 'unknown';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, {});
  const todayCounts = today.reduce((out, item) => {
    const status = clean(item.status, 40).toLowerCase() || 'unknown';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, {});
  const needsConfirmation = upcoming24h.filter(item => ['requested', 'pending'].includes(clean(item.status, 40).toLowerCase()));
  return {
    truth: 'verified_appointments',
    counts_31d: counts,
    today: { total: today.length, by_status: todayCounts },
    upcoming_24h: upcoming24h.length,
    needs_confirmation_24h: needsConfirmation.length,
    needs_confirmation: needsConfirmation.slice(0, 20).map(item => ({ id: item.id, starts_at: item.starts_at, status: item.status, customer_id: item.customer_id })),
  };
}

export function customerOperationsAgent(snapshot) {
  const conversations = safeArray(snapshot.conversations);
  const now = Date.parse(snapshot.now);
  const staleBefore = now - 24 * 60 * 60 * 1000;
  const open = conversations.filter(item => !['resolved', 'closed'].includes(clean(item.state, 40).toLowerCase()));
  const stale = open.filter(item => {
    const updated = Date.parse(item.updated_at);
    return Number.isFinite(updated) && updated < staleBefore;
  });
  return {
    truth: 'verified_conversation_state',
    conversations_31d: conversations.length,
    open_conversations: open.length,
    stale_open_over_24h: stale.length,
    stale_conversations: stale.slice(0, 20).map(item => ({ id: item.id, customer_id: item.customer_id, channel_type: item.channel_type, state: item.state, updated_at: item.updated_at })),
  };
}

export function businessOwnerOrchestrator(snapshot, sales, marketing, finance, booking, appointments, customers) {
  const priorities = [];
  if (booking.counts.stalled > 0) priorities.push({ priority: 'P0', owner: 'business_owner', instruction: `راجع ${booking.counts.stalled} رحلة حجز متوقفة ولم تصل إلى إكمال أو خسارة موثقة.` });
  if (appointments.needs_confirmation_24h > 0) priorities.push({ priority: 'P0', owner: 'business_owner', instruction: `يوجد ${appointments.needs_confirmation_24h} موعد خلال 24 ساعة ما زال يحتاج تأكيدًا.` });
  if (customers.stale_open_over_24h > 0) priorities.push({ priority: 'P1', owner: 'business_owner', instruction: `تابع ${customers.stale_open_over_24h} محادثة مفتوحة لم تتحدث منذ أكثر من 24 ساعة.` });
  if (sales.low_stock.length) priorities.push({ priority: 'P0', owner: 'sales_inventory', instruction: `راجع ${sales.low_stock.length} صنفاً منخفض المخزون؛ أوقف البيع أو أعد الطلب عند نفاد المتاح.` });
  if (marketing.decision.state === 'CAMPAIGN_DECIDED') priorities.push({ priority: 'P1', owner: 'marketing_growth', instruction: `جهّز قرار الحملة للمنتج ${marketing.decision.target_product_name} وفق قيد الهامش المسجل.` });
  if (finance.today.expenses > finance.today.recorded_revenue && finance.today.expenses > 0) priorities.push({ priority: 'P0', owner: 'finance_operations', instruction: 'المصروفات المسجلة اليوم أعلى من الإيراد التشغيلي المسجل؛ أوقف أي إنفاق غير ملتزم وراجع الأدلة.' });
  if (!priorities.length) priorities.push({ priority: 'P2', owner: 'business_owner', instruction: 'لا توجد إشارة حرجة ضمن البيانات المتاحة؛ حافظ على التشغيل وراجع اكتمال البيانات.' });

  const focus = [];
  if (booking.today.qualified || booking.today.booked || booking.today.completed) focus.push(`رحلة الحجز اليوم: ${booking.today.qualified} مؤهلة، ${booking.today.booked} حجز، ${booking.today.confirmed} مؤكدة، ${booking.today.completed} مكتملة.`);
  if (booking.counts.stalled > 0) focus.push(`${booking.counts.stalled} رحلة حجز متوقفة تحتاج متابعة تشغيلية.`);
  if (appointments.needs_confirmation_24h > 0) focus.push(`${appointments.needs_confirmation_24h} موعد خلال 24 ساعة يحتاج تأكيدًا.`);
  if (customers.stale_open_over_24h > 0) focus.push(`${customers.stale_open_over_24h} محادثة مفتوحة متأخرة أكثر من 24 ساعة.`);
  if (!focus.length) focus.push(`لا توجد رحلة حجز أو متابعة عاجلة مثبتة في نافذة التقرير؛ المواعيد اليوم ${appointments.today.total}.`);

  const summary = `تقرير ${snapshot.day}: ${booking.today.booked} حجز جديد و${booking.today.completed} مكتمل اليوم، ${appointments.today.total} موعد اليوم، و${customers.open_conversations} محادثة مفتوحة. الإيراد التشغيلي المسجل ${finance.today.recorded_revenue} ${snapshot.currency} والمصروفات ${finance.today.expenses}.`;
  return {
    agent: DAILY_AGENT_ROLES.business_owner,
    truth: 'orchestrated_from_verified_role_outputs',
    priorities: priorities.slice(0, 5),
    focus_lines: focus.slice(0, 3),
    executive_summary: summary,
    decisions: { inventory: sales.decisions, marketing: marketing.decision },
    human_intervention_required: priorities.some(item => item.priority === 'P0'),
    blocked_high_risk_execution: marketing.decision.execution_state === 'DECIDED_NOT_PUBLISHED_HIGH_RISK_GATE',
  };
}

export function reportCompleteness(report) {
  const checks = {
    booking_funnel: Boolean(report?.booking_funnel?.counts && report?.booking_funnel?.today),
    appointment_operations: Boolean(report?.appointment_operations?.today),
    customer_operations: Boolean(report?.customer_operations && Number.isFinite(Number(report.customer_operations.open_conversations))),
    finance_operations: Boolean(report?.finance_operations?.today),
    business_owner_priorities: Array.isArray(report?.business_owner?.priorities) && report.business_owner.priorities.length > 0,
    business_owner_focus: Array.isArray(report?.business_owner?.focus_lines) && report.business_owner.focus_lines.length > 0,
  };
  return { complete: Object.values(checks).every(Boolean), checks };
}

export function buildDailyReport(snapshot) {
  const sales = salesInventoryAgent(snapshot);
  const finance = financeOperationsAgent(snapshot);
  const marketing = marketingGrowthAgent(snapshot, sales, finance);
  const booking = bookingFunnelAgent(snapshot);
  const appointments = appointmentOperationsAgent(snapshot);
  const customers = customerOperationsAgent(snapshot);
  const owner = businessOwnerOrchestrator(snapshot, sales, marketing, finance, booking, appointments, customers);
  const report = {
    version: DAILY_OPERATOR_VERSION,
    report_day: snapshot.day,
    timezone: snapshot.timezone,
    currency: snapshot.currency,
    generated_at: snapshot.now,
    roles: DAILY_AGENT_ROLES,
    business_owner: owner,
    booking_funnel: booking,
    appointment_operations: appointments,
    customer_operations: customers,
    sales_inventory: sales,
    marketing_growth: marketing,
    finance_operations: finance,
    data_window: { days: 31, simulated_orders_excluded: true, simulated_appointments_excluded: true, booking_funnel_source: 'dabbir_ai_booking_funnel_current_v1' },
  };
  report.completeness = reportCompleteness(report);
  return report;
}

function providerCandidates(env = process.env) {
  const providers = [];
  if (env.GEMINI_API_KEY) providers.push({ provider: 'google-gemini', endpoint: GEMINI_ENDPOINT, credential: String(env.GEMINI_API_KEY), model: String(env.DABBIR_GEMINI_MODEL || 'gemini-3.7-flash') });
  if (env.GROQ_API_KEY) providers.push({ provider: 'groq', endpoint: GROQ_ENDPOINT, credential: String(env.GROQ_API_KEY), model: String(env.DABBIR_GROQ_MODEL || env.DABBIR_AI_MODEL || 'openai/gpt-oss-20b') });
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) providers.push({
    provider: 'cloudflare-workers-ai',
    endpoint: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(String(env.CLOUDFLARE_ACCOUNT_ID))}/ai/v1/chat/completions`,
    credential: String(env.CLOUDFLARE_API_TOKEN),
    model: String(env.DABBIR_CLOUDFLARE_MODEL || '@cf/zai-org/glm-4.7-flash'),
  });
  return providers;
}

function safeAiContext(report) {
  return {
    report_day: report.report_day,
    currency: report.currency,
    booking_funnel: report.booking_funnel,
    appointment_operations: report.appointment_operations,
    customer_operations: report.customer_operations,
    finance: report.finance_operations.today,
    margin_coverage: report.finance_operations.margin_coverage,
    stock_counts: { low: report.sales_inventory.low_stock.length, stagnant: report.sales_inventory.stagnant_products.length },
    campaign: report.marketing_growth.decision,
    priorities: report.business_owner.priorities,
    deterministic_focus_lines: report.business_owner.focus_lines,
  };
}

function parseStrictJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
}

function validEnhancement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = clean(value.executive_summary_ar, 900);
  const lines = safeArray(value.focus_lines_ar).map(item => clean(item, 220)).filter(item => item.length >= 5).slice(0, 3);
  return summary.length >= 20 && lines.length >= 1;
}

function usageFromPayload(payload = {}) {
  const usage = payload?.usage || {};
  return {
    input_tokens: Math.max(0, Math.trunc(amount(usage.prompt_tokens ?? usage.input_tokens))),
    output_tokens: Math.max(0, Math.trunc(amount(usage.completion_tokens ?? usage.output_tokens))),
    reasoning_tokens: Math.max(0, Math.trunc(amount(usage?.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens))),
  };
}

async function callFreeProvider(provider, report, fetchImpl = fetch) {
  const context = JSON.stringify(safeAiContext(report));
  const system = [
    'You are the senior Business Owner analyst inside DABBIR.',
    'Return ONLY one strict JSON object. No markdown and no prose outside JSON.',
    'Required keys: executive_summary_ar (Arabic string) and focus_lines_ar (array of 1 to 3 concise Arabic strings).',
    'Use only supplied verified facts. Never invent a customer, booking, payment, revenue, status, or completed action.',
    'Prioritize booking funnel blockage, appointments requiring confirmation, stale customer conversations, and operational exceptions.',
    'Preserve limitations: recorded revenue is not cash proof; payment_recorded is not external settlement proof without explicit evidence.',
  ].join('\n');
  const messages = [{ role: 'system', content: system }, { role: 'user', content: context }];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
    try {
      const body = {
        model: provider.model,
        messages: attempt === 1 ? messages : [...messages, { role: 'user', content: 'Return the same answer again as strict valid JSON only. Do not use markdown fences.' }],
        temperature: 0,
        max_tokens: 520,
        stream: false,
      };
      const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.credential}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      const text = payload?.choices?.[0]?.message?.content || '';
      const parsed = response.ok ? parseStrictJson(text) : null;
      if (response.ok && validEnhancement(parsed)) {
        return { ok: true, output: { executive_summary_ar: clean(parsed.executive_summary_ar, 900), focus_lines_ar: safeArray(parsed.focus_lines_ar).map(item => clean(item, 220)).filter(Boolean).slice(0, 3) }, payload, attempt };
      }
      if (!response.ok && [401, 403, 404].includes(Number(response.status))) return { ok: false, error: `${provider.provider}_http_${response.status}`, status: response.status, terminal: true };
      if (!response.ok && Number(response.status) === 429) return { ok: false, error: `${provider.provider}_http_429`, status: 429, terminal: false };
    } catch (error) {
      if (attempt === 2) return { ok: false, error: error?.name === 'AbortError' ? `${provider.provider}_timeout` : `${provider.provider}_network_error`, terminal: false };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: `${provider.provider}_invalid_structured_output`, terminal: false };
}

export async function enhanceSummaryFreeFirst(report, { env = process.env, fetchImpl = fetch } = {}) {
  const attempts = [];
  for (const provider of providerCandidates(env)) {
    const result = await callFreeProvider(provider, report, fetchImpl);
    attempts.push({ provider: provider.provider, model: provider.model, ok: result.ok === true, status: result.status || null, error: result.error || null, attempt_count: result.attempt || 2 });
    if (result.ok) {
      return {
        ok: true,
        output: result.output,
        evidence: {
          state: 'FREE_DIRECT_VERIFIED',
          provider: provider.provider,
          model: provider.model,
          cost_mode: 'FREE_TIER_ONLY',
          attempts,
          usage: usageFromPayload(result.payload),
        },
      };
    }
  }
  return { ok: false, evidence: { state: 'DETERMINISTIC_COMPLETE_FALLBACK', provider: null, model: null, cost_mode: 'NO_PAID_MODEL_USED', attempts, reason: attempts.length ? 'FREE_PROVIDERS_UNAVAILABLE_OR_INVALID' : 'NO_FREE_PROVIDER_CONFIGURED' } };
}

async function recordDailyAiUsage(key, businessId, operationKey, evidence, restClient = adminRest) {
  if (evidence?.state !== 'FREE_DIRECT_VERIFIED' || !evidence.provider) return null;
  const usage = evidence.usage || {};
  return restClient(key, 'rpc/dabbir_record_ai_usage_v1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({
      p_business_id: businessId,
      p_operation_key: `${operationKey}:free-ai`,
      p_operation_type: 'operator.daily_business_review.analysis',
      p_channel: 'daily_operator',
      p_provider: evidence.provider,
      p_model: evidence.model,
      p_cost_mode: 'FREE_TIER_ONLY',
      p_input_tokens: usage.input_tokens || 0,
      p_output_tokens: usage.output_tokens || 0,
      p_reasoning_tokens: usage.reasoning_tokens || 0,
      p_request_count: Math.max(1, safeArray(evidence.attempts).reduce((sum, item) => sum + Math.max(1, Number(item.attempt_count) || 1), 0)),
      p_actual_cost_microusd: null,
      p_cost_source: 'DIRECT_PROVIDER_COST_UNPRICED',
      p_metadata: { feature: 'daily_operator_analysis', version: DAILY_OPERATOR_VERSION, attempts: evidence.attempts },
    }),
  }).catch(() => null);
}

async function loadSnapshot(key, business, now = new Date(), restClient = adminRest) {
  const timezone = clean(business.timezone, 80) || 'Asia/Dubai';
  const day = localDateKey(now, timezone);
  const since = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const businessId = business.id;
  const [products, inventory, orders, orderItems, appointments, expenses, bookingFunnel, conversations] = await Promise.all([
    restClient(key, `dabbir_products?select=id,sku,name,price_aed,price_amount,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`),
    restClient(key, `dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&limit=200`),
    restClient(key, `dabbir_orders?select=id,status,total_aed,total_amount,paid_aed,paid_amount,simulated,created_at,completed_at&business_id=eq.${businessId}&created_at=gte.${encoded(since)}&order=created_at.desc&limit=500`),
    restClient(key, `dabbir_order_items?select=id,order_id,product_id,product_name,quantity,line_total_aed,line_total_amount,created_at&business_id=eq.${businessId}&created_at=gte.${encoded(since)}&order=created_at.desc&limit=1000`),
    restClient(key, `dabbir_appointments?select=id,customer_id,status,simulated,quoted_price_aed,quoted_price_amount,discount_aed,discount_amount,visit_fee_aed,visit_fee_amount,starts_at,created_at&business_id=eq.${businessId}&starts_at=gte.${encoded(since)}&order=starts_at.desc&limit=500`),
    restClient(key, `dabbir_expenses?select=id,amount_aed,amount,currency_code,category,occurred_on,created_at&business_id=eq.${businessId}&occurred_on=gte.${since.slice(0, 10)}&order=occurred_on.desc&limit=500`),
    restClient(key, `dabbir_ai_booking_funnel_current_v1?select=conversation_id,customer_id,appointment_id,latest_stage,last_event_at,qualified_at,booked_at,confirmed_at,completed_at,paid_recorded_at,converted_to_booking,completed_in_system,payment_recorded,has_loss_event,attributed_value_amount,currency_code&business_id=eq.${businessId}&last_event_at=gte.${encoded(since)}&order=last_event_at.desc&limit=1000`),
    restClient(key, `dabbir_conversations?select=id,customer_id,channel_type,state,created_at,updated_at&business_id=eq.${businessId}&updated_at=gte.${encoded(since)}&order=updated_at.desc&limit=1000`),
  ]);
  return {
    business,
    business_id: businessId,
    timezone,
    currency: clean(business.currency_code, 8) || 'AED',
    day,
    now: now.toISOString(),
    products,
    inventory,
    orders,
    order_items: orderItems,
    appointments,
    expenses,
    booking_funnel: bookingFunnel,
    conversations,
  };
}

async function persistReport(key, businessId, operationKey, report, metadata, restClient = adminRest, outcome = 'VERIFIED_SUCCESS', failureClass = null) {
  const rows = await restClient(key, 'dabbir_operation_outcomes?select=id,operation_key,outcome,cost_microusd,completed_at', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      business_id: businessId,
      operation_key: operationKey,
      correlation_id: operationKey,
      operation_type: DAILY_OPERATOR_POLICY,
      outcome,
      failure_class: failureClass,
      safe_eligible: true,
      autonomous: true,
      estimated_manual_seconds: 900,
      duration_ms: null,
      cost_microusd: 0,
      source: 'vercel_daily_operator_cron',
      metadata: { report, ...metadata, external_side_effects: false, money_movement: false },
      started_at: report.generated_at,
      completed_at: new Date().toISOString(),
    }),
  });
  return rows?.[0] || null;
}

export async function listDailyOperatorBusinesses({ env = process.env, restClient = adminRest } = {}) {
  const key = serviceRoleKey(env);
  const policies = await restClient(key, `dabbir_action_policies?select=business_id,action_key,risk_class,auto_execute,requires_owner_approval,active,metadata&action_key=eq.${DAILY_OPERATOR_POLICY}&risk_class=eq.LOW&auto_execute=eq.true&requires_owner_approval=eq.false&active=eq.true&limit=100`);
  if (!policies.length) return { key, items: [] };
  const ids = policies.map(item => item.business_id).filter(Boolean);
  const businesses = await restClient(key, `dabbir_businesses?select=id,name,business_type,timezone,currency_code,demo_mode&demo_mode=eq.false&id=in.(${ids.join(',')})&order=created_at.asc&limit=100`);
  const policyByBusiness = new Map(policies.map(item => [item.business_id, item]));
  return { key, items: businesses.map(business => ({ business, policy: policyByBusiness.get(business.id) })) };
}

export async function runDailyBusinessReview({
  key,
  business,
  policy,
  now = new Date(),
  env = process.env,
  restClient = adminRest,
  enhance = enhanceSummaryFreeFirst,
  fetchImpl = fetch,
} = {}) {
  const timezone = clean(business?.timezone, 80) || 'Asia/Dubai';
  const day = localDateKey(now, timezone);
  const operationKey = `${DAILY_OPERATOR_POLICY}:${day}:${DAILY_OPERATOR_VERSION}`;
  const existing = await restClient(key, `dabbir_operation_outcomes?select=id,operation_key,outcome,cost_microusd,metadata,completed_at&business_id=eq.${business.id}&operation_key=eq.${encoded(operationKey)}&limit=1`);
  if (existing?.[0]?.outcome === 'VERIFIED_SUCCESS') return { ok: true, state: 'IDEMPOTENT_REPLAY', business_id: business.id, day, outcome_id: existing[0].id };

  const started = Date.now();
  const snapshot = await loadSnapshot(key, business, now, restClient);
  const report = buildDailyReport(snapshot);
  const completeness = reportCompleteness(report);
  let modelEvidence = { state: 'NOT_ATTEMPTED', cost_mode: 'NO_PAID_MODEL_USED', attempts: [] };

  if (completeness.complete) {
    try {
      const enhanced = await enhance(report, { env, fetchImpl });
      modelEvidence = enhanced?.evidence || modelEvidence;
      if (enhanced?.ok && enhanced.output) {
        report.business_owner.executive_summary = clean(enhanced.output.executive_summary_ar, 900) || report.business_owner.executive_summary;
        report.business_owner.focus_lines = safeArray(enhanced.output.focus_lines_ar).map(item => clean(item, 220)).filter(Boolean).slice(0, 3);
      }
    } catch (error) {
      modelEvidence = { state: 'DETERMINISTIC_COMPLETE_FALLBACK', cost_mode: 'NO_PAID_MODEL_USED', attempts: [], reason: clean(error?.message || error, 160) };
    }
  }

  report.completeness = reportCompleteness(report);
  const verified = report.completeness.complete === true;
  const metadata = {
    report,
    policy: { action_key: policy?.action_key || DAILY_OPERATOR_POLICY, risk_class: policy?.risk_class || 'LOW', auto_execute: policy?.auto_execute === true },
    model: modelEvidence,
    completeness: report.completeness,
    duration_ms: Date.now() - started,
    external_side_effects: false,
    money_movement: false,
    paid_gateway_used: false,
  };

  await recordDailyAiUsage(key, business.id, operationKey, modelEvidence, restClient);
  const outcome = verified ? 'VERIFIED_SUCCESS' : 'PARTIAL';
  const persisted = await persistReport(key, business.id, operationKey, report, metadata, restClient, outcome, verified ? null : 'REPORT_COMPLETENESS_GATE_FAILED');

  return {
    ok: verified,
    state: verified ? 'COMPLETED' : 'INCOMPLETE',
    business_id: business.id,
    day,
    outcome_id: persisted?.id || null,
    model_state: modelEvidence.state,
    completeness: report.completeness,
    booking_today: report.booking_funnel.today,
    stalled_booking_journeys: report.booking_funnel.counts.stalled,
    campaign_state: report.marketing_growth.decision.state,
    low_stock: report.sales_inventory.low_stock.length,
    recorded_revenue: report.finance_operations.today.recorded_revenue,
  };
}

export async function runDailyOperatorBatch({ env = process.env, now = new Date(), restClient = adminRest, runner = runDailyBusinessReview } = {}) {
  const { key, items } = await listDailyOperatorBusinesses({ env, restClient });
  const results = [];
  for (let index = 0; index < items.length; index += 3) {
    const batch = items.slice(index, index + 3);
    const settled = await Promise.allSettled(batch.map(item => runner({ key, ...item, env, now, restClient })));
    settled.forEach((entry, offset) => results.push(entry.status === 'fulfilled' ? entry.value : { ok: false, state: 'FAILED', business_id: batch[offset].business.id, error: clean(entry.reason?.message || entry.reason, 180) }));
  }
  return {
    ok: results.every(item => item.ok),
    version: DAILY_OPERATOR_VERSION,
    eligible: items.length,
    completed: results.filter(item => item.state === 'COMPLETED').length,
    replayed: results.filter(item => item.state === 'IDEMPOTENT_REPLAY').length,
    failed: results.filter(item => !item.ok).length,
    results,
  };
}
