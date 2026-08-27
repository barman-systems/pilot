-- DABBIR Cash Guardian v1
-- Verified-evidence liquidity protection for owner-first small businesses.
-- This migration creates no payment, transfer, withdrawal, or financial-commitment capability.
-- Autonomous behavior is internal-only: overdue verified receivables may create a follow-up candidate.

create schema if not exists dabbir_private;
revoke all on schema dabbir_private from public, anon;
grant usage on schema dabbir_private to authenticated, service_role;

-- Composite uniqueness lets new financial evidence keep tenant-scoped foreign keys.
create unique index if not exists dabbir_customers_business_id_id_unique
  on public.dabbir_customers(business_id,id);
create unique index if not exists dabbir_conversations_business_id_id_unique
  on public.dabbir_conversations(business_id,id);

create table if not exists public.dabbir_financial_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'cash_balance',
    'receivable_due',
    'receivable_settled',
    'payable_due',
    'payable_settled'
  )),
  amount_aed numeric(14,2) not null check (amount_aed >= 0),
  effective_at timestamptz not null,
  due_at timestamptz,
  source_kind text not null check (source_kind in ('owner_attested','integration','system')),
  source_system text not null check (length(source_system) between 1 and 64),
  source_record_id text not null check (length(source_record_id) between 1 and 160),
  source_event_id text not null check (length(source_event_id) between 1 and 200),
  source_observed_at timestamptz not null,
  customer_id uuid,
  conversation_id uuid,
  verified_by uuid,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint dabbir_financial_evidence_due_shape check (
    (evidence_type in ('receivable_due','payable_due') and due_at is not null)
    or (evidence_type not in ('receivable_due','payable_due'))
  ),
  constraint dabbir_financial_evidence_customer_fk
    foreign key (business_id,customer_id)
    references public.dabbir_customers(business_id,id)
    on delete set null,
  constraint dabbir_financial_evidence_conversation_fk
    foreign key (business_id,conversation_id)
    references public.dabbir_conversations(business_id,id)
    on delete set null
);

create unique index if not exists dabbir_financial_evidence_source_event_unique
  on public.dabbir_financial_evidence(business_id,source_system,source_event_id);
create index if not exists dabbir_financial_evidence_business_type_due_idx
  on public.dabbir_financial_evidence(business_id,evidence_type,due_at);
create index if not exists dabbir_financial_evidence_business_record_idx
  on public.dabbir_financial_evidence(business_id,source_system,source_record_id,evidence_type);
create index if not exists dabbir_financial_evidence_business_effective_idx
  on public.dabbir_financial_evidence(business_id,effective_at desc);

alter table public.dabbir_financial_evidence enable row level security;
alter table public.dabbir_financial_evidence force row level security;
revoke all on public.dabbir_financial_evidence from anon;
revoke all on public.dabbir_financial_evidence from authenticated;
grant select, insert on public.dabbir_financial_evidence to authenticated;
grant select, insert on public.dabbir_financial_evidence to service_role;

drop policy if exists dabbir_financial_evidence_owner_select on public.dabbir_financial_evidence;
drop policy if exists dabbir_financial_evidence_owner_attest on public.dabbir_financial_evidence;

create policy dabbir_financial_evidence_owner_select
on public.dabbir_financial_evidence
for select to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_financial_evidence.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
);

create policy dabbir_financial_evidence_owner_attest
on public.dabbir_financial_evidence
for insert to authenticated
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_financial_evidence.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
  and source_kind='owner_attested'
  and created_by=(select auth.uid())
  and verified_by=(select auth.uid())
);

create table if not exists public.dabbir_financial_coverage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  scope text not null check (scope in ('inflows','outflows')),
  coverage_level text not null check (coverage_level in ('complete','partial')),
  coverage_start timestamptz not null,
  coverage_end timestamptz not null,
  source_kind text not null check (source_kind in ('owner_attested','integration','system')),
  source_system text not null check (length(source_system) between 1 and 64),
  source_observed_at timestamptz not null,
  verified_by uuid,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint dabbir_financial_coverage_window_check check (coverage_end > coverage_start)
);

create index if not exists dabbir_financial_coverage_business_scope_idx
  on public.dabbir_financial_coverage(business_id,scope,source_observed_at desc);

alter table public.dabbir_financial_coverage enable row level security;
alter table public.dabbir_financial_coverage force row level security;
revoke all on public.dabbir_financial_coverage from anon;
revoke all on public.dabbir_financial_coverage from authenticated;
grant select, insert on public.dabbir_financial_coverage to authenticated;
grant select, insert on public.dabbir_financial_coverage to service_role;

drop policy if exists dabbir_financial_coverage_owner_select on public.dabbir_financial_coverage;
drop policy if exists dabbir_financial_coverage_owner_attest on public.dabbir_financial_coverage;

create policy dabbir_financial_coverage_owner_select
on public.dabbir_financial_coverage
for select to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_financial_coverage.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
);

create policy dabbir_financial_coverage_owner_attest
on public.dabbir_financial_coverage
for insert to authenticated
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_financial_coverage.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
  and source_kind='owner_attested'
  and created_by=(select auth.uid())
  and verified_by=(select auth.uid())
);

create table if not exists public.dabbir_cash_guardian_settings (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  horizon_days smallint not null default 14 check (horizon_days between 1 and 30),
  buffer_threshold_aed numeric(14,2) check (buffer_threshold_aed is null or buffer_threshold_aed >= 0),
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dabbir_cash_guardian_settings enable row level security;
alter table public.dabbir_cash_guardian_settings force row level security;
revoke all on public.dabbir_cash_guardian_settings from anon;
revoke all on public.dabbir_cash_guardian_settings from authenticated;
grant select, insert, update on public.dabbir_cash_guardian_settings to authenticated;
grant select, insert, update on public.dabbir_cash_guardian_settings to service_role;

drop policy if exists dabbir_cash_guardian_settings_owner_select on public.dabbir_cash_guardian_settings;
drop policy if exists dabbir_cash_guardian_settings_owner_insert on public.dabbir_cash_guardian_settings;
drop policy if exists dabbir_cash_guardian_settings_owner_update on public.dabbir_cash_guardian_settings;

create policy dabbir_cash_guardian_settings_owner_select
on public.dabbir_cash_guardian_settings
for select to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_cash_guardian_settings.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
);

create policy dabbir_cash_guardian_settings_owner_insert
on public.dabbir_cash_guardian_settings
for insert to authenticated
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_cash_guardian_settings.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
  and updated_by=(select auth.uid())
);

create policy dabbir_cash_guardian_settings_owner_update
on public.dabbir_cash_guardian_settings
for update to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_cash_guardian_settings.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_cash_guardian_settings.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
  )
  and updated_by=(select auth.uid())
);

-- Internal-only Cash Guardian follow-up policy. It creates candidate state only.
insert into public.dabbir_action_policies(
  business_id,action_key,risk_class,auto_execute,
  requires_customer_confirmation,requires_owner_approval,requires_identity_verification,
  max_attempts,timeout_seconds,active,metadata,updated_at
)
select
  b.id,
  'cash_guardian.capture_internal_followup',
  'LOW',
  true,
  false,
  false,
  false,
  1,
  5,
  true,
  jsonb_build_object(
    'scope','internal_state_only',
    'external_side_effects',false,
    'financial_side_effects',false,
    'money_movement',false,
    'version','v1'
  ),
  now()
from public.dabbir_businesses b
on conflict (business_id,action_key) do nothing;

create or replace function dabbir_private.seed_cash_guardian_policy()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.dabbir_action_policies(
    business_id,action_key,risk_class,auto_execute,
    requires_customer_confirmation,requires_owner_approval,requires_identity_verification,
    max_attempts,timeout_seconds,active,metadata,updated_at
  ) values (
    new.id,
    'cash_guardian.capture_internal_followup',
    'LOW',
    true,
    false,
    false,
    false,
    1,
    5,
    true,
    jsonb_build_object(
      'scope','internal_state_only',
      'external_side_effects',false,
      'financial_side_effects',false,
      'money_movement',false,
      'version','v1'
    ),
    now()
  )
  on conflict (business_id,action_key) do nothing;
  return new;
end;
$$;
revoke all on function dabbir_private.seed_cash_guardian_policy() from public, anon, authenticated;

drop trigger if exists dabbir_businesses_seed_cash_guardian_policy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_cash_guardian_policy
after insert on public.dabbir_businesses
for each row execute function dabbir_private.seed_cash_guardian_policy();

-- One verified receivable evidence record can create at most one internal follow-up candidate.
create unique index if not exists dabbir_followups_financial_evidence_unique
  on public.dabbir_followups(business_id,(metadata->>'financial_evidence_id'))
  where (metadata->>'financial_evidence_id') is not null;

create or replace function dabbir_private.capture_cash_guardian_internal_followups()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_candidate record;
  v_followup_id uuid;
  v_created integer:=0;
begin
  for v_candidate in
    select
      e.id,
      e.business_id,
      e.customer_id,
      e.conversation_id,
      c.channel_type,
      e.amount_aed,
      e.due_at,
      e.source_system,
      e.source_record_id,
      greatest(
        e.amount_aed - coalesce((
          select sum(s.amount_aed)
          from public.dabbir_financial_evidence s
          where s.business_id=e.business_id
            and s.evidence_type='receivable_settled'
            and s.source_system=e.source_system
            and s.source_record_id=e.source_record_id
            and s.effective_at<=now()
        ),0),
        0
      ) as open_amount_aed
    from public.dabbir_financial_evidence e
    join public.dabbir_businesses b
      on b.id=e.business_id
    join public.dabbir_conversations c
      on c.id=e.conversation_id
     and c.business_id=e.business_id
     and c.customer_id=e.customer_id
    join public.dabbir_action_policies p
      on p.business_id=e.business_id
     and p.action_key='cash_guardian.capture_internal_followup'
    where e.evidence_type='receivable_due'
      and e.due_at<now()
      and e.customer_id is not null
      and e.conversation_id is not null
      and c.channel_type in ('web','whatsapp','instagram')
      and coalesce(b.demo_mode,false)=false
      and b.name not like 'DABBIR AI QA %'
      and p.active=true
      and p.risk_class='LOW'
      and p.auto_execute=true
      and p.requires_customer_confirmation=false
      and p.requires_owner_approval=false
      and p.requires_identity_verification=false
      and not exists (
        select 1 from public.dabbir_followups f
        where f.business_id=e.business_id
          and f.metadata->>'financial_evidence_id'=e.id::text
      )
  loop
    if v_candidate.open_amount_aed<=0 then
      continue;
    end if;

    begin
      insert into public.dabbir_followups(
        business_id,conversation_id,customer_id,channel_type,
        reason,status,confidence,due_at,recommended_message,policy_state,
        metadata,created_at,updated_at
      ) values (
        v_candidate.business_id,
        v_candidate.conversation_id,
        v_candidate.customer_id,
        v_candidate.channel_type,
        'cash_guardian_overdue_receivable',
        'CANDIDATE',
        1,
        now(),
        null,
        'NOT_CHECKED',
        jsonb_build_object(
          'source','dabbir_cash_guardian_v1',
          'financial_evidence_id',v_candidate.id,
          'amount_aed',v_candidate.open_amount_aed,
          'source_system',v_candidate.source_system,
          'source_record_id',v_candidate.source_record_id,
          'auto_captured',true,
          'external_side_effects',false,
          'financial_side_effects',false,
          'money_movement',false
        ),
        now(),
        now()
      ) returning id into v_followup_id;
    exception when unique_violation then
      continue;
    end;

    insert into public.dabbir_operation_outcomes(
      business_id,operation_key,correlation_id,operation_type,outcome,failure_class,
      safe_eligible,autonomous,estimated_manual_seconds,source,metadata,
      started_at,completed_at,created_at
    ) values (
      v_candidate.business_id,
      'cash_guardian.capture_internal_followup:'||v_followup_id::text,
      v_candidate.id::text,
      'cash_guardian.capture_internal_followup',
      'VERIFIED_SUCCESS',
      null,
      true,
      true,
      0,
      'database_cron',
      jsonb_build_object(
        'followup_id',v_followup_id,
        'financial_evidence_id',v_candidate.id,
        'external_side_effects',false,
        'financial_side_effects',false,
        'money_movement',false,
        'manual_seconds_measurement','UNMEASURED'
      ),
      now(),now(),now()
    )
    on conflict (business_id,operation_key) do nothing;

    v_created:=v_created+1;
  end loop;

  return v_created;
end;
$$;
revoke all on function dabbir_private.capture_cash_guardian_internal_followups() from public, anon, authenticated;
grant execute on function dabbir_private.capture_cash_guardian_internal_followups() to service_role;

comment on function dabbir_private.capture_cash_guardian_internal_followups() is
  'Cash Guardian v1: creates internal follow-up candidates for verified overdue receivables only; no external message and no money movement.';

-- Supabase Cron is already enabled on this project. Run hourly; the function is idempotent.
select cron.schedule(
  'dabbir-cash-guardian-followups-hourly',
  '17 * * * *',
  $$select dabbir_private.capture_cash_guardian_internal_followups();$$
);
