-- DABBIR Autonomous Daily Business Operator v1.
-- Recovery gate: Supabase physical backup 1568460944 completed at 2026-09-03T22:53:37.397Z.
-- The policy authorizes internal, tenant-scoped reporting only. It cannot publish campaigns,
-- send mass messages, move money, or change prices.

create or replace function public.dabbir_claim_ai_budget_v1(
  p_business_id uuid,
  p_operation_key text,
  p_operation_type text,
  p_autonomous boolean,
  p_reserve_microusd bigint,
  p_external_spent_microusd bigint,
  p_hard_limit_microusd bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_absolute_limit constant bigint := 81688223; -- 300 AED at the AED/USD peg (3.6725).
  v_limit bigint;
  v_reserve bigint;
  v_ledger_spend bigint;
  v_effective_spend bigint;
  v_existing public.dabbir_operation_outcomes%rowtype;
begin
  if p_business_id is null
     or not exists(select 1 from public.dabbir_businesses b where b.id=p_business_id)
     or coalesce(length(p_operation_key),0)<8
     or coalesce(length(p_operation_key),0)>240
     or coalesce(length(p_operation_type),0)<3
     or coalesce(length(p_operation_type),0)>160 then
    raise exception 'AI_BUDGET_ARGUMENT_INVALID';
  end if;

  v_limit := least(v_absolute_limit, greatest(1, coalesce(p_hard_limit_microusd,0)));
  v_reserve := least(5000000, greatest(1, coalesce(p_reserve_microusd,0)));

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dabbir-ai-budget:'||pg_catalog.to_char(pg_catalog.now(),'YYYY-MM'),0)
  );

  select * into v_existing
  from public.dabbir_operation_outcomes o
  where o.business_id=p_business_id and o.operation_key=p_operation_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'allowed',false,
      'reason','OPERATION_ALREADY_RESERVED',
      'existing_outcome',v_existing.outcome,
      'reserved_microusd',v_existing.cost_microusd,
      'hard_limit_microusd',v_limit
    );
  end if;

  select coalesce(sum(o.cost_microusd),0)::bigint into v_ledger_spend
  from public.dabbir_operation_outcomes o
  where o.created_at>=pg_catalog.date_trunc('month',pg_catalog.now())
    and o.cost_microusd is not null;

  v_effective_spend := greatest(v_ledger_spend, greatest(0,coalesce(p_external_spent_microusd,0)));
  if v_effective_spend+v_reserve>v_limit then
    return pg_catalog.jsonb_build_object(
      'allowed',false,
      'reason','MONTHLY_HARD_LIMIT',
      'effective_spend_microusd',v_effective_spend,
      'reserve_microusd',v_reserve,
      'hard_limit_microusd',v_limit
    );
  end if;

  insert into public.dabbir_operation_outcomes(
    business_id,operation_key,correlation_id,operation_type,outcome,failure_class,
    safe_eligible,autonomous,estimated_manual_seconds,duration_ms,cost_microusd,
    source,metadata,started_at,completed_at,created_at
  ) values (
    p_business_id,p_operation_key,p_operation_key,p_operation_type,'UNKNOWN',null,
    false,coalesce(p_autonomous,false),0,null,v_reserve,
    'ai_budget_reservation',
    pg_catalog.jsonb_build_object(
      'state','RESERVED',
      'reserve_microusd',v_reserve,
      'effective_spend_before_microusd',v_effective_spend,
      'hard_limit_microusd',v_limit,
      'hard_limit_aed',300,
      'external_side_effects',false,
      'money_movement',false
    ),
    pg_catalog.now(),pg_catalog.now(),pg_catalog.now()
  );

  return pg_catalog.jsonb_build_object(
    'allowed',true,
    'state','RESERVED',
    'effective_spend_before_microusd',v_effective_spend,
    'reserve_microusd',v_reserve,
    'hard_limit_microusd',v_limit
  );
end;
$$;

revoke all on function public.dabbir_claim_ai_budget_v1(uuid,text,text,boolean,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_claim_ai_budget_v1(uuid,text,text,boolean,bigint,bigint,bigint) to service_role;

create or replace function public.dabbir_finalize_ai_budget_v1(
  p_business_id uuid,
  p_operation_key text,
  p_outcome text,
  p_failure_class text,
  p_actual_cost_microusd bigint,
  p_safe_eligible boolean,
  p_estimated_manual_seconds integer,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_row public.dabbir_operation_outcomes%rowtype;
begin
  if p_outcome not in ('VERIFIED_SUCCESS','FAILED','PARTIAL','UNKNOWN') then
    raise exception 'AI_BUDGET_OUTCOME_INVALID';
  end if;
  if p_failure_class is not null and p_failure_class not in ('AI','AUTH','TENANT','DATA','API','WEBHOOK','NETWORK','RATE_LIMIT','TIMEOUT','POLICY','USER_INPUT','EXTERNAL_PROVIDER','SECURITY','UNKNOWN') then
    raise exception 'AI_BUDGET_FAILURE_CLASS_INVALID';
  end if;

  update public.dabbir_operation_outcomes o
  set
    outcome=p_outcome,
    failure_class=p_failure_class,
    safe_eligible=coalesce(p_safe_eligible,false),
    estimated_manual_seconds=least(86400,greatest(0,coalesce(p_estimated_manual_seconds,0))),
    cost_microusd=case when p_actual_cost_microusd is null then o.cost_microusd else greatest(0,p_actual_cost_microusd) end,
    source=case when coalesce(p_safe_eligible,false) then 'vercel_daily_operator_cron' else 'dabbir_ai_business_operator' end,
    metadata=coalesce(o.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object('budget_finalized_at',pg_catalog.now()),
    completed_at=pg_catalog.now()
  where o.business_id=p_business_id
    and o.operation_key=p_operation_key
    and o.source='ai_budget_reservation'
  returning o.* into v_row;

  if not found then
    raise exception 'AI_BUDGET_RESERVATION_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'id',v_row.id,
    'outcome',v_row.outcome,
    'cost_microusd',v_row.cost_microusd,
    'safe_eligible',v_row.safe_eligible,
    'autonomous',v_row.autonomous
  );
end;
$$;

revoke all on function public.dabbir_finalize_ai_budget_v1(uuid,text,text,text,bigint,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_finalize_ai_budget_v1(uuid,text,text,text,bigint,boolean,integer,jsonb) to service_role;

insert into public.dabbir_action_policies(
  business_id,action_key,risk_class,auto_execute,
  requires_customer_confirmation,requires_owner_approval,requires_identity_verification,
  max_attempts,timeout_seconds,active,metadata,updated_at
)
select
  b.id,
  'operator.daily_business_review',
  'LOW',
  true,
  false,
  false,
  false,
  1,
  60,
  true,
  pg_catalog.jsonb_build_object(
    'scope','internal_daily_management_report',
    'schedule','09:15 Asia/Dubai',
    'external_side_effects',false,
    'campaign_publish',false,
    'mass_messaging',false,
    'money_movement',false,
    'monthly_ai_hard_limit_aed',300,
    'version','v1'
  ),
  pg_catalog.now()
from public.dabbir_businesses b
where coalesce(b.demo_mode,false)=false
  and b.name not like 'DABBIR AI QA %'
on conflict (business_id,action_key) do nothing;

create or replace function dabbir_private.seed_autonomous_daily_operator_policy_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(new.demo_mode,false)=false and new.name not like 'DABBIR AI QA %' then
    insert into public.dabbir_action_policies(
      business_id,action_key,risk_class,auto_execute,
      requires_customer_confirmation,requires_owner_approval,requires_identity_verification,
      max_attempts,timeout_seconds,active,metadata,updated_at
    ) values (
      new.id,'operator.daily_business_review','LOW',true,
      false,false,false,1,60,true,
      pg_catalog.jsonb_build_object(
        'scope','internal_daily_management_report',
        'schedule','09:15 Asia/Dubai',
        'external_side_effects',false,
        'campaign_publish',false,
        'mass_messaging',false,
        'money_movement',false,
        'monthly_ai_hard_limit_aed',300,
        'version','v1'
      ),
      pg_catalog.now()
    ) on conflict (business_id,action_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function dabbir_private.seed_autonomous_daily_operator_policy_v1() from public,anon,authenticated;

drop trigger if exists dabbir_businesses_seed_autonomous_daily_operator_policy_v1 on public.dabbir_businesses;
create trigger dabbir_businesses_seed_autonomous_daily_operator_policy_v1
after insert on public.dabbir_businesses
for each row execute function dabbir_private.seed_autonomous_daily_operator_policy_v1();

comment on function public.dabbir_claim_ai_budget_v1(uuid,text,text,boolean,bigint,bigint,bigint) is
  'Service-role-only serialized AI budget reservation. The absolute monthly ceiling cannot exceed 300 AED.';
comment on function public.dabbir_finalize_ai_budget_v1(uuid,text,text,text,bigint,boolean,integer,jsonb) is
  'Finalizes a reserved model call with verified Gateway cost when available; an unknown cost keeps the conservative reservation.';
