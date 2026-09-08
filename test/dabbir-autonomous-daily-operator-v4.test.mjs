import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DAILY_AGENT_ROLES,
  DAILY_OPERATOR_MODEL,
  DAILY_OPERATOR_POLICY,
  DAILY_OPERATOR_VERSION,
  appointmentOperationsAgent,
  bookingFunnelAgent,
  buildDailyReport,
  customerOperationsAgent,
  enhanceSummaryFreeFirst,
  financeOperationsAgent,
  marketingGrowthAgent,
  reportCompleteness,
  salesInventoryAgent,
} from '../api/_dabbir-daily-operator-core.js';
import {
  AED_PER_USD,
  HARD_MONTHLY_AI_BUDGET_AED,
  HARD_MONTHLY_AI_BUDGET_MICROUSD,
  aedToMicrousd,
  claimAiBudget,
  configuredBudgetAed,
  gatewayMonthlySpend,
} from '../api/_dabbir-ai-budget.js';
import { cronAuthMode, DAILY_OPERATOR_SCHEDULE } from '../api/dabbir-daily-operator-cron.js';

const core = fs.readFileSync(new URL('../api/_dabbir-daily-operator-core.js', import.meta.url), 'utf8');
const budget = fs.readFileSync(new URL('../api/_dabbir-ai-budget.js', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../api/_dabbir-autonomous-agent.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260904104500_dabbir_autonomous_daily_operator_v1.sql', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const snapshot = {
  day: '2026-09-04',
  now: '2026-09-04T09:15:00.000Z',
  timezone: 'Asia/Dubai',
  currency: 'AED',
  products: [
    { id: 'p1', sku: 'FAST', name: 'Fast mover', price_amount: 50, active: true, metadata: { unit_cost_amount: 40 } },
    { id: 'p2', sku: 'SLOW', name: 'Slow mover', price_amount: 50, active: true, metadata: { unit_cost_amount: 20 } },
  ],
  inventory: [
    { product_id: 'p1', quantity: 2, reserved: 0 },
    { product_id: 'p2', quantity: 10, reserved: 0 },
  ],
  orders: [
    { id: 'o1', status: 'completed', simulated: false, total_amount: 100, paid_amount: 100, completed_at: '2026-09-04T04:00:00.000Z', created_at: '2026-09-04T03:00:00.000Z' },
    { id: 'sim', status: 'completed', simulated: true, total_amount: 9999, paid_amount: 9999, completed_at: '2026-09-04T04:00:00.000Z', created_at: '2026-09-04T03:00:00.000Z' },
  ],
  order_items: [
    { order_id: 'o1', product_id: 'p1', product_name: 'Fast mover', quantity: 2, line_total_amount: 100 },
    { order_id: 'sim', product_id: 'p2', product_name: 'Slow mover', quantity: 100, line_total_amount: 9999 },
  ],
  appointments: [
    { id: 'a1', customer_id: 'c1', status: 'completed', simulated: false, quoted_price_amount: 90, discount_amount: 10, visit_fee_amount: 0, starts_at: '2026-09-04T06:00:00.000Z', created_at: '2026-09-04T05:00:00.000Z' },
    { id: 'a2', customer_id: 'c2', status: 'requested', simulated: false, quoted_price_amount: 70, starts_at: '2026-09-04T10:00:00.000Z', created_at: '2026-09-04T07:00:00.000Z' },
    { id: 'asim', customer_id: 'csim', status: 'completed', simulated: true, quoted_price_amount: 9999, starts_at: '2026-09-04T06:00:00.000Z', created_at: '2026-09-04T05:00:00.000Z' },
  ],
  expenses: [
    { id: 'e1', amount: 20, category: 'marketing', occurred_on: '2026-09-04' },
    { id: 'e2', amount: 10, category: 'transport', occurred_on: '2026-09-04' },
  ],
  booking_funnel: [
    {
      conversation_id: 'cv1', customer_id: 'c1', appointment_id: 'a1', latest_stage: 'COMPLETED',
      last_event_at: '2026-09-04T06:00:00.000Z', qualified_at: '2026-09-04T03:00:00.000Z', booked_at: '2026-09-04T04:00:00.000Z',
      confirmed_at: '2026-09-04T04:30:00.000Z', completed_at: '2026-09-04T06:00:00.000Z', paid_recorded_at: null,
      converted_to_booking: true, completed_in_system: true, payment_recorded: false, has_loss_event: false,
      attributed_value_amount: 80, currency_code: 'AED',
    },
    {
      conversation_id: 'cv2', customer_id: 'c2', appointment_id: null, latest_stage: 'QUALIFIED',
      last_event_at: '2026-09-03T20:00:00.000Z', qualified_at: '2026-09-03T20:00:00.000Z', booked_at: null,
      confirmed_at: null, completed_at: null, paid_recorded_at: null, converted_to_booking: false,
      completed_in_system: false, payment_recorded: false, has_loss_event: false, attributed_value_amount: null, currency_code: 'AED',
    },
  ],
  conversations: [
    { id: 'cv1', customer_id: 'c1', channel_type: 'whatsapp', state: 'resolved', created_at: '2026-09-04T03:00:00.000Z', updated_at: '2026-09-04T06:00:00.000Z' },
    { id: 'cv2', customer_id: 'c2', channel_type: 'whatsapp', state: 'open', created_at: '2026-09-03T05:00:00.000Z', updated_at: '2026-09-03T06:00:00.000Z' },
  ],
};

test('daily operator v5 keeps the four commercial agents and uses free-first complete reporting', () => {
  assert.equal(DAILY_OPERATOR_VERSION, 'v5.0-complete-free-first');
  assert.equal(DAILY_OPERATOR_POLICY, 'operator.daily_business_review');
  assert.equal(DAILY_OPERATOR_MODEL, process.env.DABBIR_DAILY_OPERATOR_MODEL || 'gemini-3.7-flash');
  assert.deepEqual(Object.keys(DAILY_AGENT_ROLES), ['business_owner', 'sales_inventory', 'marketing_growth', 'finance_operations']);
  for (const agent of Object.values(DAILY_AGENT_ROLES)) {
    assert.ok(agent.role);
    assert.ok(agent.goal);
    assert.ok(agent.backstory);
  }
});

test('sales and inventory agent excludes simulated sales and identifies low and stagnant stock', () => {
  const result = salesInventoryAgent(snapshot);
  assert.equal(result.counts.completed_orders_30d, 1);
  assert.equal(result.low_stock[0].product_id, 'p1');
  assert.equal(result.stagnant_products[0].product_id, 'p2');
  assert.equal(result.top_products[0].sales_30d, 100);
});

test('finance agent computes recorded contribution and labels margin limitations', () => {
  const result = financeOperationsAgent(snapshot);
  assert.deepEqual(result.today, {
    recorded_revenue: 180, order_revenue: 100, appointment_revenue: 80, expenses: 30,
    operating_contribution_before_unrecorded_costs: 150, marketing_spend: 20, shipping_spend: 10,
    blended_revenue_to_marketing_spend: 9,
  });
  assert.equal(result.sale_margins[0].gross_profit, 20);
  assert.equal(result.sale_margins[0].margin_percent, 20);
  assert.equal(result.margin_coverage.exact_historical_cogs_available, false);
  assert.ok(result.limits.some(value => value.includes('not net profit')));
});

test('marketing agent decides a margin-safe stagnant-product campaign but never publishes it', () => {
  const sales = salesInventoryAgent(snapshot);
  const finance = financeOperationsAgent(snapshot);
  const result = marketingGrowthAgent(snapshot, sales, finance);
  assert.equal(result.decision.state, 'CAMPAIGN_DECIDED');
  assert.equal(result.decision.target_product_id, 'p2');
  assert.equal(result.decision.discount_percent, 10);
  assert.equal(result.decision.proposed_price, 45);
  assert.equal(result.decision.execution_state, 'DECIDED_NOT_PUBLISHED_HIGH_RISK_GATE');
});

test('booking funnel is part of deterministic report truth and surfaces stalled journeys', () => {
  const result = bookingFunnelAgent(snapshot);
  assert.equal(result.counts.qualified, 2);
  assert.equal(result.counts.booked, 1);
  assert.equal(result.counts.completed, 1);
  assert.equal(result.counts.stalled, 1);
  assert.equal(result.today.booked, 1);
  assert.equal(result.attributed_value_amount, 80);
  assert.equal(result.conversion.qualified_to_booking_percent, 50);
});

test('appointment and conversation sections identify owner follow-up work without AI', () => {
  const appointments = appointmentOperationsAgent(snapshot);
  const customers = customerOperationsAgent(snapshot);
  assert.equal(appointments.today.total, 2);
  assert.equal(appointments.needs_confirmation_24h, 1);
  assert.equal(customers.open_conversations, 1);
  assert.equal(customers.stale_open_over_24h, 1);
});

test('complete deterministic report always contains priorities and focus lines before AI enhancement', () => {
  const report = buildDailyReport(snapshot);
  assert.equal(report.report_day, '2026-09-04');
  assert.equal(report.booking_funnel.counts.stalled, 1);
  assert.equal(report.appointment_operations.needs_confirmation_24h, 1);
  assert.equal(report.customer_operations.stale_open_over_24h, 1);
  assert.ok(report.business_owner.priorities.length >= 1);
  assert.ok(report.business_owner.focus_lines.length >= 1);
  assert.equal(reportCompleteness(report).complete, true);
  assert.equal(report.completeness.complete, true);
});

test('free-first enhancement falls from Gemini 429 to Groq and never needs Gateway', async () => {
  const report = buildDailyReport(snapshot);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (String(url).includes('generativelanguage.googleapis.com')) return { ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) };
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ executive_summary_ar: 'اليوم توجد رحلة حجز مكتملة مع رحلة أخرى متوقفة تحتاج متابعة تشغيلية.', focus_lines_ar: ['تابع رحلة الحجز المتوقفة.', 'أكد الموعد المطلوب خلال 24 ساعة.'] }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 40 },
      }),
    };
  };
  const result = await enhanceSummaryFreeFirst(report, { env: { GEMINI_API_KEY: 'test-gemini', GROQ_API_KEY: 'test-groq' }, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.provider, 'groq');
  assert.equal(result.evidence.state, 'FREE_DIRECT_VERIFIED');
  assert.equal(result.evidence.cost_mode, 'FREE_TIER_ONLY');
  assert.equal(result.evidence.attempts[0].status, 429);
  assert.equal(calls.length, 2);
});

test('free providers can all fail without making the report incomplete', async () => {
  const report = buildDailyReport(snapshot);
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const result = await enhanceSummaryFreeFirst(report, { env: { GEMINI_API_KEY: 'x', GROQ_API_KEY: 'y' }, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.evidence.state, 'DETERMINISTIC_COMPLETE_FALLBACK');
  assert.equal(reportCompleteness(report).complete, true);
  assert.ok(report.business_owner.focus_lines.length >= 1);
});

test('paid AI cap remains enforced for other paid operator paths', async () => {
  assert.equal(AED_PER_USD, 3.6725);
  assert.equal(HARD_MONTHLY_AI_BUDGET_AED, 300);
  assert.equal(HARD_MONTHLY_AI_BUDGET_MICROUSD, 81688223);
  assert.equal(configuredBudgetAed({ DABBIR_AI_MONTHLY_BUDGET_AED: '9999' }), 300);
  assert.equal(configuredBudgetAed({ DABBIR_AI_MONTHLY_BUDGET_AED: '120' }), 120);
  assert.equal(aedToMicrousd(5), 1361471);
  const spend = await gatewayMonthlySpend({ now: new Date('2026-09-04T00:00:00Z'), gatewayClient: { getSpendReport: async () => ({ results: [{ totalCost: 1.5 }, { totalCost: 2.25 }] }) } });
  assert.equal(spend.usd, 3.75);
  assert.equal(spend.microusd, 3750000);
});

test('budget claim still checks live Gateway spend for other serialized paid operations', async () => {
  let params = null;
  const result = await claimAiBudget({
    businessId: '00000000-0000-4000-8000-000000000001', operationKey: 'operator.ai_planning:test', operationType: 'operator.ai_planning',
    gatewayClient: { getSpendReport: async () => ({ results: [{ totalCost: 2 }] }) },
    rpc: async (name, value) => { assert.equal(name, 'dabbir_claim_ai_budget_v1'); params = value; return { allowed: true, reserve_microusd: value.p_reserve_microusd }; },
  });
  assert.equal(result.allowed, true);
  assert.equal(params.p_external_spent_microusd, 2000000);
  assert.equal(params.p_hard_limit_microusd, 81688223);
  assert.equal(params.p_autonomous, false);
});

test('database migration still serializes paid claims and protects the 300 AED ceiling', () => {
  for (const marker of ['pg_advisory_xact_lock', '81688223', 'MONTHLY_HARD_LIMIT', 'operator.daily_business_review', "'LOW'", 'external_side_effects', 'money_movement', 'grant execute on function public.dabbir_claim_ai_budget_v1', 'to service_role']) assert.match(migration, new RegExp(marker));
  assert.match(migration, /revoke all on function public\.dabbir_claim_ai_budget_v1[\s\S]+from public,anon,authenticated/i);
  assert.match(migration, /campaign_publish[\s\S]+false/i);
});

test('daily worker stays fail-closed, scheduled at 09:15 Dubai, idempotent and has no external sender', () => {
  assert.equal(DAILY_OPERATOR_SCHEDULE, '15 5 * * *');
  assert.deepEqual(vercel.crons.find(item => item.path === '/api/dabbir-daily-operator-cron'), { path: '/api/dabbir-daily-operator-cron', schedule: '15 5 * * *' });
  assert.equal(vercel.functions['api/dabbir-daily-operator-cron.js'].maxDuration, 60);
  const official = { headers: { 'user-agent': 'vercel-cron/1.0', 'x-vercel-cron-schedule': '15 5 * * *' } };
  assert.equal(cronAuthMode(official, { VERCEL_ENV: 'production' }), 'vercel_schedule');
  assert.equal(cronAuthMode(official, { VERCEL_ENV: 'preview' }), null);
  assert.match(core, /IDEMPOTENT_REPLAY/);
  assert.match(core, /DAILY_OPERATOR_VERSION/);
  assert.doesNotMatch(core, /api\.resend|sendMessage|graph\.facebook|send_whatsapp|mass_message/i);
});

test('daily report reads booking funnel and direct free providers; booking write path remains outside this core', () => {
  assert.match(core, /dabbir_ai_booking_funnel_current_v1/);
  assert.match(core, /FREE_DIRECT_VERIFIED/);
  assert.match(core, /google-gemini/);
  assert.match(core, /groq/);
  assert.match(core, /cloudflare-workers-ai/);
  assert.doesNotMatch(core, /claimAiBudget|finalizeAiBudget|generationCost|ai-gateway\.vercel\.sh|generateText|Output\.object/);
  assert.match(endpoint, /inspect_daily_management_reports/);
  assert.match(endpoint, /operator\.daily_business_review/);
  assert.match(budget, /getSpendReport/);
});
