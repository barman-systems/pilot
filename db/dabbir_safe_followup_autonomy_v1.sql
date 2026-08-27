-- DABBIR safe follow-up autonomy v1.
-- Research-derived goal: remove owner memory work without causing an external side effect.
-- Scope is deliberately narrow: explicit customer follow-up commitments create an INTERNAL
-- follow-up candidate. This migration does not send WhatsApp/SMS/email messages and does not
-- authorize any financial, legal, irreversible, or customer-facing action.

-- One source message may produce at most one auto-captured follow-up.
create unique index if not exists dabbir_followups_source_message_unique
  on public.dabbir_followups (business_id, (metadata->>'source_message_id'))
  where (metadata->>'source_message_id') is not null;

create or replace function dabbir_private.explicit_followup_requested(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_body is null or btrim(p_body) = '' then false
    -- Fail closed on obvious negative instructions.
    when lower(p_body) ~ '(do not call|dont call|stop calling|stop contacting|لا[[:space:]]+(تتصل|تتواصل|تكلمني|تكلموني|تتابع|تتابعوا))' then false
    else lower(p_body) ~ '(follow[ -]?up|call me|contact me|reach out|remind me|كلمني|كلموني|اتصل بي|اتصلوا بي|تواصل معي|تواصلوا معي|ذكرني|ذكروني|تابع معي|تابعوني|ارجع لي|ارجعوا لي|رجع لي|رجعوا لي)'
  end;
$$;

revoke all on function dabbir_private.explicit_followup_requested(text) from public, anon, authenticated;

create or replace function dabbir_private.followup_due_from_explicit_text(
  p_body text,
  p_created_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    -- Only create a due time when the customer explicitly says tomorrow.
    -- 09:00 Asia/Dubai is a scheduling default for an internal candidate, not a customer promise.
    when lower(coalesce(p_body,'')) ~ '(tomorrow|باجر|بكره|بكرة|غدا|غداً)'
      then (((p_created_at at time zone 'Asia/Dubai')::date + 1)::timestamp + time '09:00') at time zone 'Asia/Dubai'
    else null
  end;
$$;

revoke all on function dabbir_private.followup_due_from_explicit_text(text,timestamptz) from public, anon, authenticated;

-- Seed one narrowly scoped policy. Existing tenant customization always wins.
insert into public.dabbir_action_policies(
  business_id,
  action_key,
  risk_class,
  auto_execute,
  requires_customer_confirmation,
  requires_owner_approval,
  requires_identity_verification,
  max_attempts,
  timeout_seconds,
  active,
  metadata,
  updated_at
)
select
  b.id,
  'followup.capture_internal',
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
    'source','customer_needs_research_2026_08_27',
    'version','v1'
  ),
  now()
from public.dabbir_businesses b
on conflict (business_id, action_key) do nothing;

-- New tenants receive the same LOW-risk internal-only policy. This function is private,
-- has a pinned empty search_path, and writes only fixed policy values for NEW.id.
create or replace function dabbir_private.seed_safe_followup_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dabbir_action_policies(
    business_id,
    action_key,
    risk_class,
    auto_execute,
    requires_customer_confirmation,
    requires_owner_approval,
    requires_identity_verification,
    max_attempts,
    timeout_seconds,
    active,
    metadata,
    updated_at
  ) values (
    new.id,
    'followup.capture_internal',
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
      'source','customer_needs_research_2026_08_27',
      'version','v1'
    ),
    now()
  )
  on conflict (business_id, action_key) do nothing;
  return new;
end;
$$;

revoke all on function dabbir_private.seed_safe_followup_policy() from public, anon, authenticated;

drop trigger if exists dabbir_businesses_seed_safe_followup_policy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_safe_followup_policy
after insert on public.dabbir_businesses
for each row execute function dabbir_private.seed_safe_followup_policy();

-- Capture explicit commitments after a real customer message has successfully persisted.
-- SECURITY DEFINER is intentionally constrained to this trigger-only, fixed-action path because
-- the outcome ledger is server/governance-write-only. Every referenced object is schema-qualified.
create or replace function dabbir_private.capture_safe_internal_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_name text;
  v_demo_mode boolean;
  v_customer_id uuid;
  v_channel_type text;
  v_followup_id uuid;
  v_due_at timestamptz;
  v_policy record;
begin
  -- Only real inbound customer messages qualify.
  if new.sender_type <> 'customer' or coalesce(new.simulated,false) then
    return new;
  end if;

  if not dabbir_private.explicit_followup_requested(new.body) then
    return new;
  end if;

  select b.name, b.demo_mode
    into v_business_name, v_demo_mode
  from public.dabbir_businesses b
  where b.id = new.business_id;

  -- Do not turn QA/demo traffic into business outcomes.
  if not found or coalesce(v_demo_mode,false) or v_business_name like 'DABBIR AI QA %' then
    return new;
  end if;

  -- Fail closed unless the tenant has the exact LOW-risk internal policy enabled.
  select p.risk_class, p.auto_execute, p.requires_customer_confirmation,
         p.requires_owner_approval, p.requires_identity_verification, p.active
    into v_policy
  from public.dabbir_action_policies p
  where p.business_id = new.business_id
    and p.action_key = 'followup.capture_internal'
  limit 1;

  if not found
     or v_policy.active is not true
     or v_policy.risk_class <> 'LOW'
     or v_policy.auto_execute is not true
     or v_policy.requires_customer_confirmation is true
     or v_policy.requires_owner_approval is true
     or v_policy.requires_identity_verification is true then
    return new;
  end if;

  select c.customer_id, c.channel_type
    into v_customer_id, v_channel_type
  from public.dabbir_conversations c
  where c.id = new.conversation_id
    and c.business_id = new.business_id
  limit 1;

  if not found or v_channel_type not in ('web','whatsapp','instagram') then
    return new;
  end if;

  v_due_at := dabbir_private.followup_due_from_explicit_text(new.body, coalesce(new.created_at,now()));

  begin
    insert into public.dabbir_followups(
      business_id,
      conversation_id,
      customer_id,
      channel_type,
      reason,
      status,
      confidence,
      due_at,
      recommended_message,
      policy_state,
      metadata,
      created_at,
      updated_at
    ) values (
      new.business_id,
      new.conversation_id,
      v_customer_id,
      v_channel_type,
      'customer_requested_followup',
      'candidate',
      0.95,
      v_due_at,
      null,
      'NOT_CHECKED',
      jsonb_build_object(
        'source','dabbir_safe_followup_autonomy_v1',
        'source_message_id',new.id::text,
        'auto_captured',true,
        'external_side_effects',false,
        'detection','explicit_followup_commitment',
        'temporal_hint',case when v_due_at is null then 'UNSPECIFIED' else 'TOMORROW' end
      ),
      now(),
      now()
    )
    returning id into v_followup_id;
  exception when unique_violation then
    -- Message replay/idempotent trigger re-entry must not duplicate owner work.
    return new;
  end;

  -- Record success only after the follow-up row is durably inserted.
  -- Owner-hours estimate intentionally starts at zero until field interviews calibrate it.
  insert into public.dabbir_operation_outcomes(
    business_id,
    operation_key,
    correlation_id,
    operation_type,
    outcome,
    failure_class,
    safe_eligible,
    autonomous,
    estimated_manual_seconds,
    source,
    metadata,
    started_at,
    completed_at,
    created_at
  ) values (
    new.business_id,
    'followup.capture_internal:' || v_followup_id::text,
    new.id::text,
    'followup.capture_internal',
    'VERIFIED_SUCCESS',
    null,
    true,
    true,
    0,
    'database_trigger',
    jsonb_build_object(
      'followup_id',v_followup_id,
      'source_message_id',new.id,
      'external_side_effects',false,
      'manual_seconds_measurement','UNMEASURED'
    ),
    coalesce(new.created_at,now()),
    now(),
    now()
  )
  on conflict (business_id, operation_key) do nothing;

  return new;
end;
$$;

revoke all on function dabbir_private.capture_safe_internal_followup() from public, anon, authenticated;

drop trigger if exists dabbir_messages_capture_safe_internal_followup on public.dabbir_messages;
create trigger dabbir_messages_capture_safe_internal_followup
after insert on public.dabbir_messages
for each row execute function dabbir_private.capture_safe_internal_followup();

comment on function dabbir_private.capture_safe_internal_followup() is
  'DABBIR v1 internal-only autonomy: explicit real customer follow-up commitments create a candidate and verified internal outcome; no external message is sent.';
