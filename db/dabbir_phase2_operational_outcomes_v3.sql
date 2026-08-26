-- DABBIR Phase 2 observability/outcomes ledger.
-- Writes are server/service-only; signed-in business members can read only when RBAC grants view_analytics.

create table if not exists public.dabbir_operation_outcomes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  operation_key text not null,
  correlation_id text not null,
  operation_type text not null,
  outcome text not null check (outcome in ('VERIFIED_SUCCESS','FAILED','PARTIAL','UNKNOWN')),
  failure_class text check (failure_class is null or failure_class in ('AI','AUTH','TENANT','DATA','API','WEBHOOK','NETWORK','RATE_LIMIT','TIMEOUT','POLICY','USER_INPUT','EXTERNAL_PROVIDER','SECURITY','UNKNOWN')),
  safe_eligible boolean not null default false,
  autonomous boolean not null default false,
  estimated_manual_seconds integer not null default 0 check (estimated_manual_seconds between 0 and 86400),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  cost_microusd bigint check (cost_microusd is null or cost_microusd >= 0),
  source text not null default 'runtime',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, operation_key)
);

alter table public.dabbir_operation_outcomes enable row level security;
alter table public.dabbir_operation_outcomes force row level security;
revoke all on public.dabbir_operation_outcomes from anon, authenticated;
grant select on public.dabbir_operation_outcomes to authenticated;

create policy dabbir_operation_outcomes_select on public.dabbir_operation_outcomes
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_analytics'));

create index if not exists dabbir_operation_outcomes_business_completed_idx
  on public.dabbir_operation_outcomes(business_id, completed_at desc);
create index if not exists dabbir_operation_outcomes_business_type_idx
  on public.dabbir_operation_outcomes(business_id, operation_type, completed_at desc);

create or replace view public.dabbir_business_outcomes
with (security_invoker=true)
as
select
  business_id,
  count(*) as total_recorded_operations,
  count(*) filter (where safe_eligible) as safe_eligible_operations,
  count(*) filter (where safe_eligible and autonomous and outcome='VERIFIED_SUCCESS') as safe_autonomous_successes,
  case
    when count(*) filter (where safe_eligible) = 0 then null
    else round(100.0 * count(*) filter (where safe_eligible and autonomous and outcome='VERIFIED_SUCCESS') / count(*) filter (where safe_eligible), 2)
  end as safe_autonomy_rate_pct,
  round(coalesce(sum(estimated_manual_seconds) filter (where autonomous and outcome='VERIFIED_SUCCESS'),0)::numeric / 3600, 2) as owner_hours_saved,
  count(*) filter (where outcome='FAILED') as failed_operations,
  count(*) filter (where outcome='PARTIAL') as partial_operations,
  count(*) filter (where outcome='UNKNOWN') as unknown_operations,
  round(avg(duration_ms) filter (where duration_ms is not null),2) as avg_duration_ms,
  coalesce(sum(cost_microusd),0) as total_cost_microusd,
  max(completed_at) as last_operation_at
from public.dabbir_operation_outcomes
group by business_id;

revoke all on public.dabbir_business_outcomes from anon;
grant select on public.dabbir_business_outcomes to authenticated;

comment on table public.dabbir_operation_outcomes is 'Terminal operation outcomes only. Owner Hours Saved and Safe Autonomy Rate count VERIFIED_SUCCESS; no synthetic/demo credit.';
comment on view public.dabbir_business_outcomes is 'Evidence-based business outcome metrics derived only from persisted terminal operation outcomes.';
