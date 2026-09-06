import { gateway } from 'ai';
import { publishBudgetObservation } from './_dabbir-ai-observability.js';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

export const HARD_MONTHLY_AI_BUDGET_AED = 300;
export const DEFAULT_AI_RESERVATION_AED = 5;
export const AED_PER_USD = 3.6725;
export const HARD_MONTHLY_AI_BUDGET_MICROUSD = Math.floor((HARD_MONTHLY_AI_BUDGET_AED / AED_PER_USD) * 1_000_000);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const toDate = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
const isoDate = value => value.toISOString().slice(0, 10);

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
  reserveAed = DEFAULT_AI_RESERVATION_AED,
  env = process.env,
  gatewayClient = gateway,
  rpc = budgetRpc,
  now = new Date(),
}) {
  const budgetAed = configuredBudgetAed(env);
  let external;
  try {
    external = await gatewayMonthlySpend({ now, gatewayClient });
  } catch (error) {
    return {
      allowed: false,
      reason: 'GATEWAY_SPEND_UNAVAILABLE',
      error: clean(error?.message || error, 160),
      hard_limit_aed: budgetAed,
      source: 'fail_closed_before_model_call',
    };
  }
  const result = await rpc('dabbir_claim_ai_budget_v1', {
    p_business_id: businessId,
    p_operation_key: clean(operationKey, 240),
    p_operation_type: clean(operationType, 160),
    p_autonomous: autonomous === true,
    p_reserve_microusd: aedToMicrousd(Math.max(0.1, finite(reserveAed))),
    p_external_spent_microusd: external.microusd,
    p_hard_limit_microusd: Math.min(HARD_MONTHLY_AI_BUDGET_MICROUSD, aedToMicrousd(budgetAed)),
  }, env);
  return { ...result, external_spend_usd: external.usd, hard_limit_aed: budgetAed };
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
  // Optional metadata-only export runs after the authoritative ledger succeeds.
  // It must never turn a completed ledger write into a failed business request.
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
