import { generateText, gateway, jsonSchema, Output } from 'ai';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';
import { claimAiBudget, finalizeAiBudget, generationCost } from './_dabbir-ai-budget.js';

export const DAILY_OPERATOR_VERSION = 'v4.0-autonomous-daily-operator';
export const DAILY_OPERATOR_POLICY = 'operator.daily_business_review';
export const DAILY_OPERATOR_MODEL = process.env.DABBIR_DAILY_OPERATOR_MODEL || 'openai/gpt-5.4';

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

const clean = (value, max = 1000) => String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const roundMoney = value => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const safeArray = value => Array.isArray(value) ? value : [];
const encoded = value => encodeURIComponent(String(value));
const firstNumber = (...values) => values.find(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) ?? 0;

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
    decisions: [
      ...lowStock.map(item => ({ type: item.available === 0 ? 'PAUSE_OR_REPLENISH' : 'REORDER_REVIEW', product_id: item.product_id, product_name: item.name, available: item.available })),
    ].slice(0, 10),
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

export function businessOwnerOrchestrator(snapshot, sales, marketing, finance) {
  const priorities = [];
  if (sales.low_stock.length) priorities.push({ priority: 'P0', owner: 'sales_inventory', instruction: `راجع ${sales.low_stock.length} صنفاً منخفض المخزون؛ أوقف البيع أو أعد الطلب عند نفاد المتاح.` });
  if (marketing.decision.state === 'CAMPAIGN_DECIDED') priorities.push({ priority: 'P1', owner: 'marketing_growth', instruction: `جهّز قرار الحملة للمنتج ${marketing.decision.target_product_name} وفق قيد الهامش المسجل.` });
  if (finance.today.expenses > finance.today.recorded_revenue && finance.today.expenses > 0) priorities.push({ priority: 'P0', owner: 'finance_operations', instruction: 'المصروفات المسجلة اليوم أعلى من الإيراد التشغيلي المسجل؛ أوقف أي إنفاق غير ملتزم وراجع الأدلة.' });
  if (!priorities.length) priorities.push({ priority: 'P2', owner: 'business_owner', instruction: 'لا توجد إشارة حرجة ضمن البيانات المتاحة؛ حافظ على التشغيل وراجع اكتمال بيانات التكلفة.' });
  const summary = `تقرير ${snapshot.day}: الإيراد التشغيلي المسجل ${finance.today.recorded_revenue} ${snapshot.currency}، المصروفات ${finance.today.expenses}، والمساهمة قبل التكاليف غير المسجلة ${finance.today.operating_contribution_before_unrecorded_costs}. المخزون المنخفض ${sales.low_stock.length}، والمنتجات الراكدة ${sales.stagnant_products.length}.`;
  return { agent: DAILY_AGENT_ROLES.business_owner, truth: 'orchestrated_from_verified_role_outputs', priorities: priorities.slice(0, 5), executive_summary: summary, decisions: { inventory: sales.decisions, marketing: marketing.decision }, human_intervention_required: false, blocked_high_risk_execution: marketing.decision.execution_state === 'DECIDED_NOT_PUBLISHED_HIGH_RISK_GATE' };
}

export function buildDailyReport(snapshot) {
  const sales = salesInventoryAgent(snapshot);
  const finance = financeOperationsAgent(snapshot);
  const marketing = marketingGrowthAgent(snapshot, sales, finance);
  const owner = businessOwnerOrchestrator(snapshot, sales, marketing, finance);
  return {
    version: DAILY_OPERATOR_VERSION,
    report_day: snapshot.day,
    timezone: snapshot.timezone,
    currency: snapshot.currency,
    generated_at: snapshot.now,
    roles: DAILY_AGENT_ROLES,
    business_owner: owner,
    sales_inventory: sales,
    marketing_growth: marketing,
    finance_operations: finance,
    data_window: { days: 30, simulated_orders_excluded: true, simulated_appointments_excluded: true },
  };
}

const summarySchema = jsonSchema({
  type: 'object',
  properties: {
    executive_summary_ar: { type: 'string', minLength: 20, maxLength: 900 },
    focus_lines_ar: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 5, maxLength: 220 } },
  },
  required: ['executive_summary_ar', 'focus_lines_ar'],
  additionalProperties: false,
});

async function enhanceSummary(report, { model = DAILY_OPERATOR_MODEL, gatewayClient = gateway } = {}) {
  const safeContext = {
    report_day: report.report_day,
    currency: report.currency,
    finance: report.finance_operations.today,
    margin_coverage: report.finance_operations.margin_coverage,
    stock_counts: { low: report.sales_inventory.low_stock.length, stagnant: report.sales_inventory.stagnant_products.length },
    campaign: report.marketing_growth.decision,
    priorities: report.business_owner.priorities,
  };
  const result = await generateText({
    model,
    output: Output.object({ schema: summarySchema }),
    system: [
      'You are the senior Business Owner agent inside DABBIR, not a chatbot.',
      'Return concise Arabic structured output only.',
      'Use only the supplied verified report. Never introduce new values, customers, claims, or completed actions.',
      'Preserve every limitation: contribution is not net profit, blended ratio is not attributed ROAS, and a decided campaign is not published.',
    ].join('\n'),
    prompt: JSON.stringify(safeContext),
    maxOutputTokens: 600,
    temperature: 0,
    providerOptions: { gateway: { disallowPromptTraining: true } },
    abortSignal: AbortSignal.timeout(9_000),
  });
  return { result, output: result.output };
}

async function loadSnapshot(key, business, now = new Date(), restClient = adminRest) {
  const timezone = clean(business.timezone, 80) || 'Asia/Dubai';
  const day = localDateKey(now, timezone);
  const since = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const businessId = business.id;
  const [products, inventory, orders, orderItems, appointments, expenses] = await Promise.all([
    restClient(key, `dabbir_products?select=id,sku,name,price_aed,price_amount,active,metadata&business_id=eq.${businessId}&order=name.asc&limit=200`),
    restClient(key, `dabbir_inventory?select=product_id,quantity,reserved,updated_at&business_id=eq.${businessId}&limit=200`),
    restClient(key, `dabbir_orders?select=id,status,total_aed,total_amount,paid_aed,paid_amount,simulated,created_at,completed_at&business_id=eq.${businessId}&created_at=gte.${encoded(since)}&order=created_at.desc&limit=500`),
    restClient(key, `dabbir_order_items?select=id,order_id,product_id,product_name,quantity,line_total_aed,line_total_amount,created_at&business_id=eq.${businessId}&created_at=gte.${encoded(since)}&order=created_at.desc&limit=1000`),
    restClient(key, `dabbir_appointments?select=id,status,simulated,quoted_price_aed,quoted_price_amount,discount_aed,discount_amount,visit_fee_aed,visit_fee_amount,starts_at,created_at&business_id=eq.${businessId}&starts_at=gte.${encoded(since)}&order=starts_at.desc&limit=500`),
    restClient(key, `dabbir_expenses?select=id,amount_aed,amount,currency_code,category,occurred_on,created_at&business_id=eq.${businessId}&occurred_on=gte.${since.slice(0, 10)}&order=occurred_on.desc&limit=500`),
  ]);
  return { business, business_id: businessId, timezone, currency: clean(business.currency_code, 8) || 'AED', day, now: now.toISOString(), products, inventory, orders, order_items: orderItems, appointments, expenses };
}

async function persistReport(key, businessId, operationKey, report, metadata, restClient = adminRest) {
  const rows = await restClient(key, 'dabbir_operation_outcomes?select=id,operation_key,outcome,cost_microusd,completed_at', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      business_id: businessId,
      operation_key: operationKey,
      correlation_id: operationKey,
      operation_type: DAILY_OPERATOR_POLICY,
      outcome: 'VERIFIED_SUCCESS',
      failure_class: null,
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
  budgetClaim = claimAiBudget,
  budgetFinalize = finalizeAiBudget,
  gatewayClient = gateway,
  enhance = enhanceSummary,
} = {}) {
  const timezone = clean(business?.timezone, 80) || 'Asia/Dubai';
  const day = localDateKey(now, timezone);
  const operationKey = `${DAILY_OPERATOR_POLICY}:${day}`;
  const existing = await restClient(key, `dabbir_operation_outcomes?select=id,operation_key,outcome,cost_microusd,metadata,completed_at&business_id=eq.${business.id}&operation_key=eq.${encoded(operationKey)}&limit=1`);
  if (existing?.[0]?.outcome === 'VERIFIED_SUCCESS') return { ok: true, state: 'IDEMPOTENT_REPLAY', business_id: business.id, day, outcome_id: existing[0].id };

  const started = Date.now();
  const snapshot = await loadSnapshot(key, business, now, restClient);
  const report = buildDailyReport(snapshot);
  const budgetOperation = operationKey;
  let claim;
  try {
    claim = await budgetClaim({ businessId: business.id, operationKey: budgetOperation, operationType: DAILY_OPERATOR_POLICY, autonomous: true, env, gatewayClient, now });
  } catch (error) {
    claim = { allowed: false, reason: 'BUDGET_LEDGER_UNAVAILABLE', error: clean(error?.message || error, 160) };
  }

  let modelEvidence = { state: 'DETERMINISTIC_FALLBACK', model: null, reason: claim.allowed ? 'MODEL_NOT_CALLED' : claim.reason };
  if (claim.allowed) {
    try {
      const generated = await enhance(report, { model: clean(env.DABBIR_DAILY_OPERATOR_MODEL, 160) || DAILY_OPERATOR_MODEL, gatewayClient });
      const cost = await generationCost(generated.result, gatewayClient);
      report.business_owner.executive_summary = clean(generated.output?.executive_summary_ar, 900) || report.business_owner.executive_summary;
      report.business_owner.focus_lines = safeArray(generated.output?.focus_lines_ar).map(item => clean(item, 220)).filter(Boolean).slice(0, 3);
      modelEvidence = { state: 'PAID_MODEL_VERIFIED', model: clean(env.DABBIR_DAILY_OPERATOR_MODEL, 160) || DAILY_OPERATOR_MODEL, ...cost };
    } catch (error) {
      modelEvidence = { state: 'DETERMINISTIC_FALLBACK', model: clean(env.DABBIR_DAILY_OPERATOR_MODEL, 160) || DAILY_OPERATOR_MODEL, reason: clean(error?.message || error, 160) };
    }
  }

  const metadata = { report, policy: { action_key: policy?.action_key || DAILY_OPERATOR_POLICY, risk_class: policy?.risk_class || 'LOW', auto_execute: policy?.auto_execute === true }, model: modelEvidence, budget: claim, duration_ms: Date.now() - started, external_side_effects: false, money_movement: false };
  if (claim.allowed || existing?.[0]?.outcome === 'UNKNOWN') {
    await budgetFinalize({ businessId: business.id, operationKey: budgetOperation, outcome: 'VERIFIED_SUCCESS', failureClass: null, actualCostUsd: modelEvidence.total_cost_usd, safeEligible: true, estimatedManualSeconds: 900, metadata, env });
  } else {
    await persistReport(key, business.id, operationKey, report, metadata, restClient);
  }
  return { ok: true, state: 'COMPLETED', business_id: business.id, day, model_state: modelEvidence.state, campaign_state: report.marketing_growth.decision.state, low_stock: report.sales_inventory.low_stock.length, recorded_revenue: report.finance_operations.today.recorded_revenue };
}

export async function runDailyOperatorBatch({ env = process.env, now = new Date(), restClient = adminRest, runner = runDailyBusinessReview } = {}) {
  const { key, items } = await listDailyOperatorBusinesses({ env, restClient });
  const results = [];
  for (let index = 0; index < items.length; index += 3) {
    const batch = items.slice(index, index + 3);
    const settled = await Promise.allSettled(batch.map(item => runner({ key, ...item, env, now, restClient })));
    settled.forEach((entry, offset) => results.push(entry.status === 'fulfilled' ? entry.value : { ok: false, state: 'FAILED', business_id: batch[offset].business.id, error: clean(entry.reason?.message || entry.reason, 180) }));
  }
  return { ok: results.every(item => item.ok), version: DAILY_OPERATOR_VERSION, eligible: items.length, completed: results.filter(item => item.state === 'COMPLETED').length, replayed: results.filter(item => item.state === 'IDEMPOTENT_REPLAY').length, failed: results.filter(item => !item.ok).length, results };
}
