-- BARMAN independent verification: point-in-time snapshot receipts + stale queue isolation.
--
-- Root causes:
-- 1) customers/businesses/appointments/orders are mutable live counts. Comparing a
--    later count with `current >= reported` is not a valid independent proof.
-- 2) one old mismatched INDEPENDENT_REQUIRED command stayed first in the queue
--    forever and poisoned every later verifier run.
--
-- Fix:
-- - when snapshot evidence is persisted, Postgres itself re-reads the authoritative
--   counts in the same transaction, rejects a changed/forged value, stores an
--   immutable receipt, and injects only the receipt id into evidence details;
-- - the existing independent verifier can later read that exact immutable receipt;
-- - claim only fresh independently-verifiable evidence. Old evidence remains
--   unpromoted (fail closed) instead of blocking the whole verifier queue.

create table if not exists dabbir_private.executive_snapshot_receipts (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null unique,
  captured_at timestamptz not null default now(),
  evidence_generated_at timestamptz,
  expected jsonb not null,
  snapshot jsonb not null,
  constraint executive_snapshot_receipts_expected_object_chk
    check (jsonb_typeof(expected)='object'),
  constraint executive_snapshot_receipts_snapshot_object_chk
    check (jsonb_typeof(snapshot)='object')
);

create index if not exists executive_snapshot_receipts_captured_at_idx
  on dabbir_private.executive_snapshot_receipts(captured_at desc);

revoke all on table dabbir_private.executive_snapshot_receipts
  from public, anon, authenticated, service_role;

create or replace function dabbir_private.barman_snapshot_metrics_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
  select jsonb_build_object(
    'registered_accounts_total',(select count(*) from public.dabbir_user_accounts),
    'businesses_total',(select count(*) from public.dabbir_businesses),
    'customers_total',(select count(*) from public.dabbir_customers),
    'appointments_total',(select count(*) from public.dabbir_appointments),
    'orders_total',(select count(*) from public.dabbir_orders)
  );
$$;

revoke all on function dabbir_private.barman_snapshot_metrics_v1()
  from public, anon, authenticated, service_role;

create or replace function dabbir_private.barman_capture_snapshot_evidence_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare
  v_expected jsonb;
  v_snapshot jsonb;
  v_key text;
  v_expected_value numeric;
  v_current_value numeric;
  v_generated_at timestamptz;
  v_receipt_id uuid:=gen_random_uuid();
begin
  if new.evidence_type<>'query' or new.reference<>'barman-executive-snapshot-v1' then
    return new;
  end if;

  v_expected:=new.details->'expected';
  if jsonb_typeof(coalesce(v_expected,'null'::jsonb))<>'object'
     or jsonb_object_length(v_expected)=0 then
    raise exception 'SNAPSHOT_EXPECTED_METRICS_REQUIRED';
  end if;

  begin
    v_generated_at:=nullif(new.details->>'generated_at','')::timestamptz;
  exception when others then
    v_generated_at:=null;
  end;
  if v_generated_at is null
     or v_generated_at<now()-interval '5 minutes'
     or v_generated_at>now()+interval '1 minute' then
    raise exception 'SNAPSHOT_EVIDENCE_GENERATED_AT_INVALID';
  end if;

  v_snapshot:=dabbir_private.barman_snapshot_metrics_v1();

  for v_key in select jsonb_object_keys(v_expected)
  loop
    if not (v_snapshot ? v_key) then
      raise exception 'SNAPSHOT_METRIC_DENIED_%',left(v_key,80);
    end if;
    begin
      v_expected_value:=(v_expected->>v_key)::numeric;
      v_current_value:=(v_snapshot->>v_key)::numeric;
    exception when others then
      raise exception 'SNAPSHOT_METRIC_INVALID_%',left(v_key,80);
    end;
    if v_expected_value<0 or v_current_value<0 then
      raise exception 'SNAPSHOT_METRIC_INVALID_%',left(v_key,80);
    end if;
    if v_expected_value<>v_current_value then
      -- Do not persist evidence that already stopped matching the source before
      -- it reached the durable evidence boundary. The executor can retry safely.
      raise exception 'SNAPSHOT_EVIDENCE_CHANGED_BEFORE_PERSIST_%',left(v_key,80);
    end if;
  end loop;

  insert into dabbir_private.executive_snapshot_receipts(
    id,evidence_id,evidence_generated_at,expected,snapshot
  ) values (
    v_receipt_id,new.id,v_generated_at,v_expected,v_snapshot
  );

  new.details:=coalesce(new.details,'{}'::jsonb)||jsonb_build_object(
    'snapshot_receipt_id',v_receipt_id,
    'snapshot_receipt_captured_at',now(),
    'snapshot_receipt_source','POSTGRES_EVIDENCE_TRIGGER_V1'
  );
  return new;
end;
$$;

revoke all on function dabbir_private.barman_capture_snapshot_evidence_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists barman_capture_snapshot_evidence_v1
  on dabbir_private.executive_evidence;
create trigger barman_capture_snapshot_evidence_v1
before insert on dabbir_private.executive_evidence
for each row execute function dabbir_private.barman_capture_snapshot_evidence_v1();

create or replace function public.barman_executive_read_snapshot_receipt_v1(
  p_snapshot_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare
  v_receipt dabbir_private.executive_snapshot_receipts%rowtype;
begin
  if p_snapshot_receipt_id is null then
    raise exception 'SNAPSHOT_RECEIPT_ID_REQUIRED';
  end if;

  select * into v_receipt
  from dabbir_private.executive_snapshot_receipts
  where id=p_snapshot_receipt_id;

  if not found then
    return jsonb_build_object('found',false,'id',p_snapshot_receipt_id);
  end if;

  return jsonb_build_object(
    'found',true,
    'id',v_receipt.id,
    'evidence_id',v_receipt.evidence_id,
    'captured_at',v_receipt.captured_at,
    'evidence_generated_at',v_receipt.evidence_generated_at,
    'expected',v_receipt.expected,
    'snapshot',v_receipt.snapshot
  );
end;
$$;

revoke all on function public.barman_executive_read_snapshot_receipt_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.barman_executive_read_snapshot_receipt_v1(uuid)
  to service_role;

comment on table dabbir_private.executive_snapshot_receipts is
  'Immutable Postgres-computed point-in-time receipts for existing independent verification. Direct service_role table access is revoked.';
comment on function public.barman_executive_read_snapshot_receipt_v1(uuid) is
  'Reads one immutable Postgres-computed snapshot receipt for the existing GitHub OIDC independent verifier.';

-- Preserve the existing verifier identity and promotion authority. Claim only
-- fresh evidence that can actually be independently checked. Old/legacy rows
-- stay INDEPENDENT_REQUIRED and cannot be promoted, but no longer poison the
-- front of the queue.
create or replace function public.barman_executive_claim_verification_v1(
  p_verifier_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $$
declare
  v_verifier text:=left(btrim(coalesce(p_verifier_id,'')),120);
  v_command dabbir_private.dabbir_ceo_commands%rowtype;
  v_action_id uuid;
  v_evidence jsonb:='[]'::jsonb;
begin
  if v_verifier !~ '^github-independent-verifier:[0-9]+$' then
    raise exception 'VERIFIER_ID_DENIED';
  end if;

  select * into v_command
  from dabbir_private.dabbir_ceo_commands c
  where c.status='DONE'
    and c.verification_status='INDEPENDENT_REQUIRED'
    and c.orchestration_state='VERIFYING'
    and exists (
      select 1
      from dabbir_private.executive_runs r
      join dabbir_private.executive_actions a on a.run_id=r.id
      join dabbir_private.executive_evidence e on e.action_id=a.id
      where r.trigger_ref=c.id::text
        and e.verified=false
        and e.created_at>=now()-interval '30 minutes'
        and (
          e.evidence_type<>'query'
          or e.reference<>'barman-executive-snapshot-v1'
          or coalesce(e.details->>'snapshot_receipt_id','') ~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        )
    )
  order by c.updated_at asc,c.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object('claimed',false);
  end if;

  select a.id into v_action_id
  from dabbir_private.executive_runs r
  join dabbir_private.executive_actions a on a.run_id=r.id
  join dabbir_private.executive_evidence e on e.action_id=a.id
  where r.trigger_ref=v_command.id::text
    and e.verified=false
    and e.created_at>=now()-interval '30 minutes'
    and (
      e.evidence_type<>'query'
      or e.reference<>'barman-executive-snapshot-v1'
      or coalesce(e.details->>'snapshot_receipt_id','') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    )
  order by a.started_at desc nulls last,r.started_at desc,e.created_at desc
  limit 1;

  if v_action_id is null then
    raise exception 'VERIFICATION_ACTION_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'type',e.evidence_type,
    'reference',e.reference,
    'details',e.details,
    'produced_by',e.produced_by,
    'created_at',e.created_at
  ) order by e.created_at),'[]'::jsonb)
  into v_evidence
  from dabbir_private.executive_evidence e
  where e.action_id=v_action_id
    and e.verified=false
    and e.created_at>=now()-interval '30 minutes'
    and (
      e.evidence_type<>'query'
      or e.reference<>'barman-executive-snapshot-v1'
      or coalesce(e.details->>'snapshot_receipt_id','') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    );

  if jsonb_array_length(v_evidence)=0 then
    raise exception 'VERIFICATION_EVIDENCE_NOT_FOUND';
  end if;

  insert into dabbir_private.executive_audit_logs(
    command_id,actor,action,project_key,reason,result,metadata
  ) values (
    v_command.id,v_verifier,'VERIFICATION_CLAIM','DABBIR',
    'SEPARATE_GITHUB_OIDC_VERIFIER','CLAIMED',
    jsonb_build_object(
      'action_id',v_action_id,
      'evidence_count',jsonb_array_length(v_evidence),
      'freshness_window_minutes',30
    )
  );

  return jsonb_build_object(
    'claimed',true,
    'verifier_id',v_verifier,
    'command',jsonb_build_object(
      'id',v_command.id,
      'worker_id',v_command.worker_id,
      'execution_lane',v_command.execution_lane,
      'result_summary',v_command.result_summary,
      'action_id',v_action_id,
      'evidence',v_evidence
    )
  );
end;
$$;

revoke all on function public.barman_executive_claim_verification_v1(text)
  from public,anon,authenticated;
grant execute on function public.barman_executive_claim_verification_v1(text)
  to service_role;

comment on function public.barman_executive_claim_verification_v1(text) is
  'Claims only fresh independently-verifiable evidence. Stale/legacy evidence remains fail-closed and cannot poison later verifier runs.';
