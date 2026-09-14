-- DABBIR AI Probe Separation + Attempt Type V1
-- Customer requests never acquire recovery probe leases. Recovery probes are background-only.
-- Extends the existing shared provider-health authority; no new registry or health table.

alter table dabbir_private.dabbir_ai_provider_health_v1
  add column if not exists recovery_state text not null default 'HEALTHY',
  add column if not exists recovery_probe_success_streak integer not null default 0,
  add column if not exists customer_attempt_count bigint not null default 0,
  add column if not exists customer_skip_count bigint not null default 0,
  add column if not exists recovery_probe_attempt_count bigint not null default 0,
  add column if not exists recovery_probe_success_count bigint not null default 0,
  add column if not exists recovery_probe_failure_count bigint not null default 0,
  add column if not exists benchmark_attempt_count bigint not null default 0,
  add column if not exists last_probe_at timestamptz,
  add column if not exists last_customer_success_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='dabbir_ai_provider_health_recovery_state_chk'
      and conrelid='dabbir_private.dabbir_ai_provider_health_v1'::regclass
  ) then
    alter table dabbir_private.dabbir_ai_provider_health_v1
      add constraint dabbir_ai_provider_health_recovery_state_chk
      check (recovery_state in ('HEALTHY','QUARANTINED','RECOVERING'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='dabbir_ai_provider_health_recovery_probe_streak_chk'
      and conrelid='dabbir_private.dabbir_ai_provider_health_v1'::regclass
  ) then
    alter table dabbir_private.dabbir_ai_provider_health_v1
      add constraint dabbir_ai_provider_health_recovery_probe_streak_chk
      check (recovery_probe_success_streak between 0 and 1000000);
  end if;
end $$;

-- Existing unhealthy rows must not become customer probes merely because a cooldown has expired.
update dabbir_private.dabbir_ai_provider_health_v1
   set recovery_state='QUARANTINED', recovery_probe_success_streak=0
 where failure_class is not null
   and consecutive_failures > 0
   and recovery_state='HEALTHY';

create or replace function public.dabbir_ai_provider_health_claim_v1(
  p_provider text,
  p_model text,
  p_attempt_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_provider text := left(trim(coalesce(p_provider,'')),80);
  v_model text := left(trim(coalesce(p_model,'')),160);
  v_attempt_type text := upper(trim(coalesce(p_attempt_type,'')));
  v_row dabbir_private.dabbir_ai_provider_health_v1%rowtype;
  v_role text := '';
  v_claims text;
  v_remaining bigint := 0;
  v_probe_ms integer := 30000;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true),'');
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), case when v_claims is not null then v_claims::jsonb->>'role' else null end, '');
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_provider not in ('google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway') then raise exception 'AI_PROVIDER_INVALID'; end if;
  if length(v_model) < 1 then raise exception 'AI_PROVIDER_MODEL_REQUIRED'; end if;
  if v_attempt_type not in ('CUSTOMER','RECOVERY_PROBE','BENCHMARK') then raise exception 'AI_PROVIDER_ATTEMPT_TYPE_INVALID'; end if;

  if v_attempt_type='BENCHMARK' then
    insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,attempt_count,benchmark_attempt_count,last_observed_at,updated_at)
    values(v_provider,v_model,1,1,v_now,v_now)
    on conflict(provider,model) do update set
      attempt_count=dabbir_private.dabbir_ai_provider_health_v1.attempt_count+1,
      benchmark_attempt_count=dabbir_private.dabbir_ai_provider_health_v1.benchmark_attempt_count+1,
      updated_at=v_now;
    return jsonb_build_object('decision','ATTEMPT','reason','BENCHMARK_ISOLATED','attempt_type',v_attempt_type,'health_state','SHARED','scope','model');
  end if;

  -- Provider-wide state is reserved for account/billing/auth hard blocks.
  select * into v_row
    from dabbir_private.dabbir_ai_provider_health_v1
   where provider=v_provider and model='*'
   for update;

  if found and (v_row.recovery_state <> 'HEALTHY' or v_row.failure_class in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION')) then
    if v_attempt_type='CUSTOMER' then
      v_remaining := case when v_row.cooldown_until is not null and v_row.cooldown_until>v_now
        then greatest(0,floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint) else 0 end;
      update dabbir_private.dabbir_ai_provider_health_v1
         set skip_count=skip_count+1,customer_skip_count=customer_skip_count+1,updated_at=v_now
       where provider=v_provider and model='*';
      return jsonb_build_object(
        'decision','SKIP','reason',case when v_remaining>0 then 'PROVIDER_HARD_BLOCK' else 'RECOVERY_PROBE_REQUIRED' end,
        'failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,
        'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','provider'
      );
    end if;

    if v_row.cooldown_until is not null and v_row.cooldown_until>v_now then
      v_remaining := greatest(0,floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint);
      update dabbir_private.dabbir_ai_provider_health_v1 set skip_count=skip_count+1,updated_at=v_now where provider=v_provider and model='*';
      return jsonb_build_object('decision','SKIP','reason','PROVIDER_COOLDOWN','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','provider');
    end if;
    if v_row.probe_lease_until is not null and v_row.probe_lease_until>v_now then
      v_remaining := greatest(0,floor(extract(epoch from (v_row.probe_lease_until-v_now))*1000)::bigint);
      update dabbir_private.dabbir_ai_provider_health_v1 set skip_count=skip_count+1,updated_at=v_now where provider=v_provider and model='*';
      return jsonb_build_object('decision','SKIP','reason','PROBE_IN_FLIGHT','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','provider');
    end if;
    update dabbir_private.dabbir_ai_provider_health_v1
       set probe_lease_until=v_now+make_interval(secs=>v_probe_ms/1000.0),
           attempt_count=attempt_count+1,recovery_probe_attempt_count=recovery_probe_attempt_count+1,
           last_probe_at=v_now,updated_at=v_now
     where provider=v_provider and model='*';
    return jsonb_build_object('decision','PROBE','reason','RECOVERY_LEASE_GRANTED','failure_class',v_row.failure_class,'cooldown_remaining_ms',0,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','provider');
  end if;

  insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,last_observed_at,updated_at)
  values(v_provider,v_model,v_now,v_now)
  on conflict(provider,model) do nothing;

  select * into v_row
    from dabbir_private.dabbir_ai_provider_health_v1
   where provider=v_provider and model=v_model
   for update;

  if v_attempt_type='CUSTOMER' then
    if v_row.recovery_state <> 'HEALTHY' or v_row.cooldown_until is not null then
      v_remaining := case when v_row.cooldown_until is not null and v_row.cooldown_until>v_now
        then greatest(0,floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint) else 0 end;
      update dabbir_private.dabbir_ai_provider_health_v1
         set skip_count=skip_count+1,customer_skip_count=customer_skip_count+1,updated_at=v_now
       where provider=v_provider and model=v_model;
      return jsonb_build_object(
        'decision','SKIP','reason',case when v_remaining>0 then 'PROVIDER_COOLDOWN' else 'RECOVERY_PROBE_REQUIRED' end,
        'failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,
        'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','model'
      );
    end if;
    update dabbir_private.dabbir_ai_provider_health_v1
       set attempt_count=attempt_count+1,customer_attempt_count=customer_attempt_count+1,updated_at=v_now
     where provider=v_provider and model=v_model;
    return jsonb_build_object('decision','ATTEMPT','reason','HEALTHY','cooldown_remaining_ms',0,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state','HEALTHY','scope','model');
  end if;

  -- RECOVERY_PROBE is the only attempt type allowed to acquire a probe lease.
  if v_row.recovery_state='HEALTHY' and v_row.cooldown_until is null then
    return jsonb_build_object('decision','SKIP','reason','HEALTHY','cooldown_remaining_ms',0,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state','HEALTHY','scope','model');
  end if;
  if v_row.cooldown_until is not null and v_row.cooldown_until>v_now then
    v_remaining := greatest(0,floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint);
    update dabbir_private.dabbir_ai_provider_health_v1 set skip_count=skip_count+1,updated_at=v_now where provider=v_provider and model=v_model;
    return jsonb_build_object('decision','SKIP','reason','PROVIDER_COOLDOWN','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','model');
  end if;
  if v_row.probe_lease_until is not null and v_row.probe_lease_until>v_now then
    v_remaining := greatest(0,floor(extract(epoch from (v_row.probe_lease_until-v_now))*1000)::bigint);
    update dabbir_private.dabbir_ai_provider_health_v1 set skip_count=skip_count+1,updated_at=v_now where provider=v_provider and model=v_model;
    return jsonb_build_object('decision','SKIP','reason','PROBE_IN_FLIGHT','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','model');
  end if;

  update dabbir_private.dabbir_ai_provider_health_v1
     set probe_lease_until=v_now+make_interval(secs=>v_probe_ms/1000.0),
         attempt_count=attempt_count+1,recovery_probe_attempt_count=recovery_probe_attempt_count+1,
         last_probe_at=v_now,updated_at=v_now
   where provider=v_provider and model=v_model;
  return jsonb_build_object('decision','PROBE','reason','RECOVERY_LEASE_GRANTED','failure_class',v_row.failure_class,'cooldown_remaining_ms',0,'attempt_type',v_attempt_type,'health_state','SHARED','recovery_state',v_row.recovery_state,'scope','model');
end;
$$;

-- Compatibility wrapper: legacy callers are always CUSTOMER and can never become recovery probes.
create or replace function public.dabbir_ai_provider_health_claim_v1(p_provider text,p_model text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.dabbir_ai_provider_health_claim_v1(p_provider,p_model,'CUSTOMER');
end;
$$;

create or replace function public.dabbir_ai_provider_health_observe_v1(
  p_provider text,
  p_model text,
  p_success boolean,
  p_failure_class text,
  p_status integer,
  p_retry_after_ms integer,
  p_latency_ms integer,
  p_attempt_type text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_provider text := left(trim(coalesce(p_provider,'')),80);
  v_model text := left(trim(coalesce(p_model,'')),160);
  v_attempt_type text := upper(trim(coalesce(p_attempt_type,'')));
  v_scope text := lower(trim(coalesce(p_scope,'model')));
  v_target_model text;
  v_class dabbir_private.dabbir_ai_provider_failure_class;
  v_row dabbir_private.dabbir_ai_provider_health_v1%rowtype;
  v_role text := '';
  v_claims text;
  v_consecutive integer := 0;
  v_cooldown_ms integer := 0;
  v_retry integer := case when p_retry_after_ms is null then null else greatest(1000,least(300000,p_retry_after_ms)) end;
  v_latency integer := greatest(0,least(120000,coalesce(p_latency_ms,0)));
  v_failure_memory interval := interval '30 minutes';
  v_streak integer := 0;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true),'');
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), case when v_claims is not null then v_claims::jsonb->>'role' else null end, '');
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_provider not in ('google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway') then raise exception 'AI_PROVIDER_INVALID'; end if;
  if length(v_model) < 1 then raise exception 'AI_PROVIDER_MODEL_REQUIRED'; end if;
  if v_attempt_type not in ('CUSTOMER','RECOVERY_PROBE','BENCHMARK') then raise exception 'AI_PROVIDER_ATTEMPT_TYPE_INVALID'; end if;
  if v_scope not in ('model','provider') then raise exception 'AI_PROVIDER_SCOPE_INVALID'; end if;
  if p_status is not null and (p_status < 100 or p_status > 599) then raise exception 'AI_PROVIDER_STATUS_INVALID'; end if;

  if v_attempt_type='BENCHMARK' then
    return jsonb_build_object('ok',true,'state','BENCHMARK_ISOLATED','cooldown_ms',0,'attempt_type',v_attempt_type);
  end if;

  if not coalesce(p_success,false) then
    begin v_class := p_failure_class::dabbir_private.dabbir_ai_provider_failure_class;
    exception when others then raise exception 'AI_PROVIDER_FAILURE_CLASS_INVALID'; end;
  end if;

  if not coalesce(p_success,false) and v_class in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION') then
    v_scope := 'provider';
  end if;
  v_target_model := case when v_scope='provider' then '*' else v_model end;

  insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,last_observed_at,updated_at)
  values(v_provider,v_target_model,v_now,v_now)
  on conflict(provider,model) do nothing;

  select * into v_row from dabbir_private.dabbir_ai_provider_health_v1
   where provider=v_provider and model=v_target_model for update;

  if coalesce(p_success,false) then
    if v_attempt_type='RECOVERY_PROBE' then
      v_streak := least(1000000,coalesce(v_row.recovery_probe_success_streak,0)+1);
      if v_streak >= 2 then
        update dabbir_private.dabbir_ai_provider_health_v1
           set failure_class=null,consecutive_failures=0,cooldown_until=null,probe_lease_until=null,
               recovery_state='HEALTHY',recovery_probe_success_streak=v_streak,
               last_status=p_status,last_observed_at=v_now,retry_after_ms=null,last_latency_ms=v_latency,
               success_count=success_count+1,recovery_probe_success_count=recovery_probe_success_count+1,updated_at=v_now
         where provider=v_provider and model=v_target_model;
        return jsonb_build_object('ok',true,'state','HEALTHY','recovery_state','HEALTHY','probe_success_streak',v_streak,'cooldown_ms',0,'attempt_type',v_attempt_type,'scope',v_scope);
      end if;
      update dabbir_private.dabbir_ai_provider_health_v1
         set recovery_state='RECOVERING',recovery_probe_success_streak=v_streak,
             cooldown_until=v_now+interval '30 seconds',probe_lease_until=null,
             last_status=p_status,last_observed_at=v_now,retry_after_ms=null,last_latency_ms=v_latency,
             success_count=success_count+1,recovery_probe_success_count=recovery_probe_success_count+1,updated_at=v_now
       where provider=v_provider and model=v_target_model;
      return jsonb_build_object('ok',true,'state','RECOVERING','recovery_state','RECOVERING','probe_success_streak',v_streak,'cooldown_ms',30000,'attempt_type',v_attempt_type,'scope',v_scope);
    end if;

    update dabbir_private.dabbir_ai_provider_health_v1
       set failure_class=null,consecutive_failures=0,cooldown_until=null,probe_lease_until=null,
           recovery_state='HEALTHY',recovery_probe_success_streak=0,
           last_status=p_status,last_observed_at=v_now,retry_after_ms=null,last_latency_ms=v_latency,
           success_count=success_count+1,last_customer_success_at=v_now,updated_at=v_now
     where provider=v_provider and model=v_target_model;
    return jsonb_build_object('ok',true,'state','HEALTHY','recovery_state','HEALTHY','cooldown_ms',0,'attempt_type',v_attempt_type,'scope',v_scope);
  end if;

  if v_row.failure_class=v_class and v_row.last_observed_at is not null and v_row.last_observed_at>v_now-v_failure_memory then
    v_consecutive := least(1000000,v_row.consecutive_failures+1);
  else
    v_consecutive := 1;
  end if;

  if v_class in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION') then
    v_cooldown_ms := coalesce(v_retry,300000);
  elsif v_class='RATE_LIMIT' then
    if v_retry is not null then
      v_cooldown_ms := v_retry;
    else
      v_cooldown_ms := case
        when v_consecutive <= 1 then 15000
        when v_consecutive = 2 then 30000
        when v_consecutive = 3 then 60000
        when v_consecutive = 4 then 120000
        when v_consecutive = 5 then 300000
        else 600000
      end;
    end if;
  elsif v_class in ('TIMEOUT','NETWORK') then
    v_cooldown_ms := case
      when v_consecutive <= 1 then 0
      when v_consecutive = 2 then 10000
      when v_consecutive = 3 then 30000
      when v_consecutive = 4 then 60000
      when v_consecutive = 5 then 120000
      when v_consecutive = 6 then 300000
      else 600000
    end;
  elsif v_class='UPSTREAM_5XX' then
    v_cooldown_ms := case
      when v_consecutive <= 1 then 0
      when v_consecutive = 2 then 15000
      when v_consecutive = 3 then 30000
      when v_consecutive = 4 then 60000
      when v_consecutive = 5 then 120000
      else 300000
    end;
  else
    v_cooldown_ms := 0;
  end if;

  update dabbir_private.dabbir_ai_provider_health_v1
     set failure_class=v_class,consecutive_failures=v_consecutive,
         cooldown_until=case when v_cooldown_ms>0 then v_now+make_interval(secs=>v_cooldown_ms/1000.0) else null end,
         probe_lease_until=null,
         recovery_state=case when v_cooldown_ms>0 or v_attempt_type='RECOVERY_PROBE' then 'QUARANTINED' else 'HEALTHY' end,
         recovery_probe_success_streak=0,last_status=p_status,last_observed_at=v_now,
         retry_after_ms=v_retry,last_latency_ms=v_latency,failure_count=failure_count+1,
         recovery_probe_failure_count=recovery_probe_failure_count+case when v_attempt_type='RECOVERY_PROBE' then 1 else 0 end,
         updated_at=v_now
   where provider=v_provider and model=v_target_model;

  return jsonb_build_object(
    'ok',true,
    'state',case when v_cooldown_ms>0 or v_attempt_type='RECOVERY_PROBE' then 'QUARANTINED' else 'OBSERVED' end,
    'recovery_state',case when v_cooldown_ms>0 or v_attempt_type='RECOVERY_PROBE' then 'QUARANTINED' else 'HEALTHY' end,
    'failure_class',v_class,'consecutive_failures',v_consecutive,'cooldown_ms',v_cooldown_ms,
    'attempt_type',v_attempt_type,'scope',v_scope
  );
end;
$$;

-- Compatibility wrapper: legacy observations are CUSTOMER observations.
create or replace function public.dabbir_ai_provider_health_observe_v1(
  p_provider text,
  p_model text,
  p_success boolean,
  p_failure_class text default null,
  p_status integer default null,
  p_retry_after_ms integer default null,
  p_latency_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.dabbir_ai_provider_health_observe_v1(
    p_provider,p_model,p_success,p_failure_class,p_status,p_retry_after_ms,p_latency_ms,'CUSTOMER','model'
  );
end;
$$;

create or replace function public.dabbir_ai_provider_health_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := '';
  v_claims text;
  v_result jsonb;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true),'');
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), case when v_claims is not null then v_claims::jsonb->>'role' else null end, '');
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',provider,'model',model,'failure_class',failure_class,'consecutive_failures',consecutive_failures,
    'recovery_state',recovery_state,'recovery_probe_success_streak',recovery_probe_success_streak,
    'cooldown_until',cooldown_until,'probe_lease_until',probe_lease_until,'last_status',last_status,'last_observed_at',last_observed_at,
    'last_probe_at',last_probe_at,'last_customer_success_at',last_customer_success_at,
    'retry_after_ms',retry_after_ms,'last_latency_ms',last_latency_ms,
    'attempt_count',attempt_count,'skip_count',skip_count,
    'customer_attempt_count',customer_attempt_count,'customer_skip_count',customer_skip_count,
    'recovery_probe_attempt_count',recovery_probe_attempt_count,'recovery_probe_success_count',recovery_probe_success_count,
    'recovery_probe_failure_count',recovery_probe_failure_count,'benchmark_attempt_count',benchmark_attempt_count,
    'success_count',success_count,'failure_count',failure_count,'updated_at',updated_at
  ) order by provider,model),'[]'::jsonb) into v_result
  from dabbir_private.dabbir_ai_provider_health_v1;
  return v_result;
end;
$$;

revoke all on function public.dabbir_ai_provider_health_claim_v1(text,text,text) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_claim_v1(text,text) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_snapshot_v1() from public, anon, authenticated;

grant execute on function public.dabbir_ai_provider_health_claim_v1(text,text,text) to service_role;
grant execute on function public.dabbir_ai_provider_health_claim_v1(text,text) to service_role;
grant execute on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer,text,text) to service_role;
grant execute on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer) to service_role;
grant execute on function public.dabbir_ai_provider_health_snapshot_v1() to service_role;

comment on function public.dabbir_ai_provider_health_claim_v1(text,text,text) is
  'Service-role-only provider health claim. CUSTOMER can never acquire a recovery probe lease; RECOVERY_PROBE is background-only; BENCHMARK is isolated.';
comment on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer,text,text) is
  'Service-role-only provider observation with explicit attempt type and recovery hysteresis. Two successful background probes are required before returning to HEALTHY.';
