import { gateway } from 'ai';
import { publishBudgetObservation } from './_dabbir-ai-observability.js';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const HARD_MONTHLY_AI_BUDGET_AED = 300;
export const DEFAULT_AI_RESERVATION_AED = 1;
export const AED_PER_USD = 3.6725;
export const HARD_MONTHLY_AI_BUDGET_MICROUSD = Math.floor((HARD_MONTHLY_AI_BUDGET_AED / AED_PER_USD) * 1_000_000);
export const AI_BUDGET_PRESSURE_THRESHOLDS = Object.freeze({ CONSERVE: 0.60, RESTRICT: 0.80, PROTECT: 0.90 });

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const toDate = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
const isoDate = value => value.toISOString().slice(0, 10);
const clamp = (value, min, max) => Math.min(max, Math.max(min, finite(value)));

export function aedToMicrousd(value) {
  return Math.max(0, Math.ceil((finite(value) / AED_PER_USD) * 1_000_000));
}

export function usdToMicrousd(value) {
  return Math.max(0, Math.ceil(finite(value) * 1_000_000));
}

export function configuredBudgetAed(env = process.env) {
  const requested = finite(env.DABBIR_AI_MONTHLY_BUDGET_AED || HARD_MONTHLY_AI_BUDGET_AED);
  return Math.min(HARD_MONTHLY_AI_BUDGET_AED, Math.max(1, requested || HARD_MONTHLY_AI_BUDGET_AED));
}

export function budgetPressure({ spentUsd = 0, budgetAed = HARD_MONTHLY_AI_BUDGET_AED } = {}) {
  const hardLimitAed = Math.max(1, finite(budgetAed) || HARD_MONTHLY_AI_BUDGET_AED);
  const spentAed = Math.max(0, finite(spentUsd)) * AED_PER_USD;
  const ratio = spentAed / hardLimitAed;
  let band = 'NORMAL';
  if (ratio >= AI_BUDGET_PRESSURE_THRESHOLDS.PROTECT) band = 'PROTECT';
  else if (ratio >= AI_BUDGET_PRESSURE_THRESHOLDS.RESTRICT) band = 'RESTRICT';
  else if (ratio >= AI_BUDGET_PRESSURE_THRESHOLDS.CONSERVE) band = 'CONSERVE';
  return {
    band,
    ratio,
    spent_aed: spentAed,
    remaining_aed: Math.max(0, hardLimitAed - spentAed),
    premium_allowed: ratio < AI_BUDGET_PRESSURE_THRESHOLDS.CONSERVE,
    paid_allowed: ratio < AI_BUDGET_PRESSURE_THRESHOLDS.PROTECT,
  };
}

export function reservationAedForOperation({
  operationType = '',
  maxOutputTokens = 320,
  maxSteps = 6,
  autonomous = false,
} = {}) {
  const type = clean(operationType, 160).toLowerCase();
  const tokens = clamp(maxOutputTokens, 64, 8192);
  const steps = Math.trunc(clamp(maxSteps, 1, 12));
  const base = type.includes('daily_business_review') ? 0.50 : type.includes('ai_planning') ? 0.35 : 0.40;
  const outputBuffer = (tokens / 1000) * 0.35;
  const stepBuffer = steps * 0.08;
  const autonomousBuffer = autonomous === true ? 0.15 : 0;
  const estimate = base + outputBuffer + stepBuffer + autonomousBuffer;
  return Math.round(clamp(estimate, 0.25, 2.50) * 100) / 100;
}

export async function gatewayMonthlySpend({ now = new Date(), gatewayClient = gateway } = {}) {
  const current = toDate(now);
  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  const report = await gatewayClient.getSpendReport({
    startDate: isoDate(start),
    endDate: isoDate(current),
    groupBy: 'day',
  });
  const usd = (Array.isArray(report?.results) ? report.results : []).reduce((sum, row) => sum + Math.max(0, finite(row?.totalCost)), 0);
  return { usd, microusd: usdToMicrousd(usd), source: 'vercel_ai_gateway_spend_report' };
}

function serviceRoleKey(env = process.env) {
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY, 8192);
  if (!key || key.startsWith('sb_publishable_')) throw Object.assign(new Error('AI_BUDGET_LEDGER_NOT_CONFIGURED'), { status: 503 });
  return key;
}

export async function directMonthlyExposureSpend({ now = new Date(), env = process.env, fetchImpl = fetch } = {}) {
  const key = serviceRoleKey(env);
  const current = toDate(now);
  const monthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)).toISOString();
  const query = new URLSearchParams({
    select: 'provider,exposure_microusd,unpriced_operations',
    month_start: `eq.${monthStart}`,
  });
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/dabbir_ai_budget_exposure_monthly_v1?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'manual',
    headers: supabaseKeyHeaders(key, { accept: 'application/json' }),
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  let rows = null;
  try { rows = text ? JSON.parse(text) : []; } catch {}
  if (!response.ok || !Array.isArray(rows)) throw Object.assign(new Error(rows?.message || rows?.code || 'DIRECT_AI_SPEND_READ_FAILED'), { status: response.status || 503 });
  const microusd = rows.reduce((sum, row) => sum + Math.max(0, Math.trunc(finite(row?.exposure_microusd))), 0);
  const unpricedOperations = rows.reduce((sum, row) => sum + Math.max(0, Math.trunc(finite(row?.unpriced_operations))), 0);
  return {
    usd: microusd / 1_000_000,
    microusd,
    unpriced_operations: unpricedOperations,
    providers: rows.length,
    source: 'dabbir_ai_budget_exposure_monthly_v1',
  };
}

async function budgetRpc(name, params, env = process.env) {
  const key = serviceRoleKey(env);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'manual',
    headers: supabaseKeyHeaders(key, { accept: 'application/json', 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw Object.assign(new Error(payload?.message || payload?.code || 'AI_BUDGET_LEDGER_FAILED'), { status: response.status });
  return payload;
}

export async function claimAiBudget({
  businessId,
  operationKey,
  operationType,
  autonomous = false,
  reserveAed = null,
  maxOutputTokens = 320,
  maxSteps = 6,
  env = process.env,
  gatewayClient = gateway,
  directSpendReader = null,
  rpc = budgetRpc,
  now = new Date(),
}) {
  const budgetAed = configuredBudgetAed(env);
  let gatewaySpend;
  try {
    gatewaySpend = await gatewayMonthlySpend({ now, gatewayClient });
  } catch (error) {
    return {
      allowed: false,
      reason: 'GATEWAY_SPEND_UNAVAILABLE',
      error: clean(error?.message || error, 160),
      hard_limit_aed: budgetAed,
      source: 'fail_closed_before_paid_model_call',
    };
  }

  let directSpend;
  try {
    const reader = directSpendReader || (rpc === budgetRpc ? directMonthlyExposureSpend : async () => ({ usd: 0, microusd: 0, unpriced_operations: 0, providers: 0, source: 'injected_rpc_test_default' }));
    directSpend = await reader({ now, env });
  } catch (error) {
    return {
      allowed: false,
      reason: 'DIRECT_PROVIDER_SPEND_UNAVAILABLE',
      error: clean(error?.message || error, 160),
      gateway_spend_usd: gatewaySpend.usd,
      hard_limit_aed: budgetAed,
      source: 'fail_closed_before_paid_model_call',
    };
  }
  if (Math.max(0, Math.trunc(finite(directSpend?.unpriced_operations))) > 0) {
    return {
      allowed: false,
      reason: 'DIRECT_PROVIDER_SPEND_UNVERIFIED',
      direct_unpriced_operations: Math.trunc(finite(directSpend.unpriced_operations)),
      gateway_spend_usd: gatewaySpend.usd,
      direct_paid_equivalent_usd: finite(directSpend.usd),
      hard_limit_aed: budgetAed,
      source: 'fail_closed_on_unpriced_direct_provider_usage',
    };
  }
  const combinedMicrousd = Math.max(0, Math.trunc(finite(gatewaySpend.microusd))) + Math.max(0, Math.trunc(finite(directSpend?.microusd)));
  const combinedUsd = combinedMicrousd / 1_000_000;
  const pressure = budgetPressure({ spentUsd: combinedUsd, budgetAed });
  if (!pressure.paid_allowed) {
    return {
      allowed: false,
      reason: 'BUDGET_PROTECTION',
      external_spend_usd: combinedUsd,
      gateway_spend_usd: gatewaySpend.usd,
      direct_paid_equivalent_usd: finite(directSpend?.usd),
      hard_limit_aed: budgetAed,
      budget_pressure: pressure,
      source: 'budget_pressure_guard_before_paid_model_call',
    };
  }
  const effectiveReserveAed = reserveAed == null
    ? reservationAedForOperation({ operationType, maxOutputTokens, maxSteps, autonomous })
    : clamp(reserveAed, 0.01, 2.50);
  const result = await rpc('dabbir_claim_ai_budget_v1', {
    p_business_id: businessId,
    p_operation_key: clean(operationKey, 240),
    p_operation_type: clean(operationType, 160),
    p_autonomous: autonomous === true,
    p_reserve_microusd: aedToMicrousd(effectiveReserveAed),
    p_external_spent_microusd: combinedMicrousd,
    p_hard_limit_microusd: Math.min(HARD_MONTHLY_AI_BUDGET_MICROUSD, aedToMicrousd(budgetAed)),
  }, env);
  return {
    ...result,
    external_spend_usd: combinedUsd,
    gateway_spend_usd: gatewaySpend.usd,
    direct_paid_equivalent_usd: finite(directSpend?.usd),
    direct_unpriced_operations: Math.trunc(finite(directSpend?.unpriced_operations)),
    hard_limit_aed: budgetAed,
    reservation_aed: effectiveReserveAed,
    budget_pressure: pressure,
  };
}

export async function finalizeAiBudget({
  businessId,
  operationKey,
  outcome,
  failureClass = null,
  actualCostUsd = null,
  safeEligible = false,
  estimatedManualSeconds = 0,
  metadata = {},
  env = process.env,
  rpc = budgetRpc,
}) {
  const finalized = await rpc('dabbir_finalize_ai_budget_v1', {
    p_business_id: businessId,
    p_operation_key: clean(operationKey, 240),
    p_outcome: outcome,
    p_failure_class: failureClass,
    p_actual_cost_microusd: actualCostUsd == null ? null : usdToMicrousd(actualCostUsd),
    p_safe_eligible: safeEligible === true,
    p_estimated_manual_seconds: Math.min(86_400, Math.max(0, Math.trunc(finite(estimatedManualSeconds)))),
    p_metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  }, env);
  if (finalized?.ok !== false) await publishBudgetObservation({ businessId, operationKey, outcome, failureClass, actualCostUsd, metadata }, { env }).catch(() => null);
  return finalized;
}

export async function generationCost(result, gatewayClient = gateway) {
  const generationId = clean(result?.providerMetadata?.gateway?.generationId, 160);
  if (!generationId) return { generation_id: null, total_cost_usd: null, cost_state: 'GENERATION_ID_UNAVAILABLE' };
  try {
    const info = await gatewayClient.getGenerationInfo({ id: generationId });
    const verifiedCost = info?.totalCost == null || !Number.isFinite(Number(info.totalCost)) ? null : Math.max(0, Number(info.totalCost));
    return {
      generation_id: generationId,
      total_cost_usd: verifiedCost,
      provider: clean(info?.providerName, 120) || null,
      model: clean(info?.model, 160) || null,
      prompt_tokens: Math.max(0, Math.trunc(finite(info?.promptTokens))),
      completion_tokens: Math.max(0, Math.trunc(finite(info?.completionTokens))),
      cost_state: 'VERIFIED_FROM_GATEWAY',
    };
  } catch (error) {
    return { generation_id: generationId, total_cost_usd: null, cost_state: 'LOOKUP_UNAVAILABLE', error: clean(error?.message || error, 160) };
  }
}
