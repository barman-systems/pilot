-- DABBIR AI Provider Reliability Authority V1
-- Shared provider health for serverless instances. Stores operational metadata only:
-- no credentials, prompts, customer content, provider bodies, or tenant identifiers.

create schema if not exists dabbir_private;
revoke all on schema dabbir_private from public, anon;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='dabbir_private' and t.typname='dabbir_ai_provider_failure_class') then
    create type dabbir_private.dabbir_ai_provider_failure_class as enum (
      'RATE_LIMIT',
      'BILLING_CAPACITY_HARD_BLOCK',
      'AUTH_CONFIGURATION',
      'TIMEOUT',
      'NETWORK',
      'UPSTREAM_5XX',
      'CONTRACT_REQUEST'
    );
  end if;
end $$;

create table if not exists dabbir_private.dabbir_ai_provider_health_v1 (
  provider text not null,
  model text not null,
  failure_class dabbir_private.dabbir_ai_provider_failure_class,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000000),
  cooldown_until timestamptz,
  probe_lease_until timestamptz,
  last_status integer check (last_status is null or last_status between 100 and 599),
  last_observed_at timestamptz,
  retry_after_ms integer check (retry_after_ms is null or retry_after_ms between 0 and 300000),
  last_latency_ms integer check (last_latency_ms is null or last_latency_ms between 0 and 120000),
  attempt_count bigint not null default 0 check (attempt_count >= 0),
  skip_count bigint not null default 0 check (skip_count >= 0),
  success_count bigint not null default 0 check (success_count >= 0),
  failure_count bigint not null default 0 check (failure_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, model),
  constraint dabbir_ai_provider_health_provider_chk check (provider in ('google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway')),
  constraint dabbir_ai_provider_health_model_chk check (length(model) between 1 and 160)
);

create index if not exists dabbir_ai_provider_health_cooldown_idx
  on dabbir_private.dabbir_ai_provider_health_v1 (cooldown_until)
  where cooldown_until is not null;

revoke all on table dabbir_private.dabbir_ai_provider_health_v1 from public, anon, authenticated, service_role;

create or replace function public.dabbir_ai_provider_health_claim_v1(
  p_provider text,
  p_model text
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
  v_row dabbir_private.dabbir_ai_provider_health_v1%rowtype;
  v_role text := '';
  v_claims text;
  v_remaining bigint;
  v_probe_ms integer := 10000;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true),'');
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), case when v_claims is not null then v_claims::jsonb->>'role' else null end, '');
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_provider not in ('google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway') then raise exception 'AI_PROVIDER_INVALID'; end if;
  if length(v_model) < 1 then raise exception 'AI_PROVIDER_MODEL_REQUIRED'; end if;

  -- Provider-wide row is reserved for account/billing/auth hard blocks.
  select * into v_row
    from dabbir_private.dabbir_ai_provider_health_v1
   where provider=v_provider and model='*'
   for update;
  if found and v_row.failure_class in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION') then
    if v_row.cooldown_until is not null and v_row.cooldown_until > v_now then
      v_remaining := greatest(0, floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint);
      update dabbir_private.dabbir_ai_provider_health_v1
         set skip_count=skip_count+1,updated_at=v_now
       where provider=v_provider and model='*';
      return jsonb_build_object('decision','SKIP','reason','PROVIDER_HARD_BLOCK','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'health_state','SHARED');
    end if;
    if v_row.probe_lease_until is not null and v_row.probe_lease_until > v_now then
      v_remaining := greatest(0, floor(extract(epoch from (v_row.probe_lease_until-v_now))*1000)::bigint);
      update dabbir_private.dabbir_ai_provider_health_v1
         set skip_count=skip_count+1,updated_at=v_now
       where provider=v_provider and model='*';
      return jsonb_build_object('decision','SKIP','reason','PROBE_IN_FLIGHT','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'health_state','SHARED');
    end if;
    update dabbir_private.dabbir_ai_provider_health_v1
       set probe_lease_until=v_now+make_interval(secs=>v_probe_ms/1000.0),attempt_count=attempt_count+1,updated_at=v_now
     where provider=v_provider and model='*';
    return jsonb_build_object('decision','PROBE','reason','HARD_BLOCK_COOLDOWN_EXPIRED','failure_class',v_row.failure_class,'cooldown_remaining_ms',0,'health_state','SHARED','scope','provider');
  end if;

  select * into v_row
    from dabbir_private.dabbir_ai_provider_health_v1
   where provider=v_provider and model=v_model
   for update;

  if not found then
    insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,attempt_count,last_observed_at,updated_at)
    values(v_provider,v_model,1,v_now,v_now)
    on conflict(provider,model) do update set attempt_count=dabbir_private.dabbir_ai_provider_health_v1.attempt_count+1,updated_at=excluded.updated_at;
    return jsonb_build_object('decision','ATTEMPT','reason','HEALTHY_OR_UNKNOWN','cooldown_remaining_ms',0,'health_state','SHARED','scope','model');
  end if;

  if v_row.cooldown_until is not null and v_row.cooldown_until > v_now then
    v_remaining := greatest(0, floor(extract(epoch from (v_row.cooldown_until-v_now))*1000)::bigint);
    update dabbir_private.dabbir_ai_provider_health_v1
       set skip_count=skip_count+1,updated_at=v_now
     where provider=v_provider and model=v_model;
    return jsonb_build_object('decision','SKIP','reason','PROVIDER_COOLDOWN','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'health_state','SHARED','scope','model');
  end if;

  if v_row.cooldown_until is not null then
    if v_row.probe_lease_until is not null and v_row.probe_lease_until > v_now then
      v_remaining := greatest(0, floor(extract(epoch from (v_row.probe_lease_until-v_now))*1000)::bigint);
      update dabbir_private.dabbir_ai_provider_health_v1
         set skip_count=skip_count+1,updated_at=v_now
       where provider=v_provider and model=v_model;
      return jsonb_build_object('decision','SKIP','reason','PROBE_IN_FLIGHT','failure_class',v_row.failure_class,'cooldown_remaining_ms',v_remaining,'health_state','SHARED','scope','model');
    end if;
    update dabbir_private.dabbir_ai_provider_health_v1
       set probe_lease_until=v_now+make_interval(secs=>v_probe_ms/1000.0),attempt_count=attempt_count+1,updated_at=v_now
     where provider=v_provider and model=v_model;
    return jsonb_build_object('decision','PROBE','reason','COOLDOWN_EXPIRED','failure_class',v_row.failure_class,'cooldown_remaining_ms',0,'health_state','SHARED','scope','model');
  end if;

  update dabbir_private.dabbir_ai_provider_health_v1
     set attempt_count=attempt_count+1,updated_at=v_now
   where provider=v_provider and model=v_model;
  return jsonb_build_object('decision','ATTEMPT','reason','HEALTHY_OR_OBSERVING','cooldown_remaining_ms',0,'health_state','SHARED','scope','model');
end;
$$;

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
declare
  v_now timestamptz := clock_timestamp();
  v_provider text := left(trim(coalesce(p_provider,'')),80);
  v_model text := left(trim(coalesce(p_model,'')),160);
  v_class dabbir_private.dabbir_ai_provider_failure_class;
  v_row dabbir_private.dabbir_ai_provider_health_v1%rowtype;
  v_role text := '';
  v_claims text;
  v_consecutive integer := 0;
  v_cooldown_ms integer := 0;
  v_retry integer := case when p_retry_after_ms is null then null else greatest(1000,least(300000,p_retry_after_ms)) end;
  v_latency integer := greatest(0,least(120000,coalesce(p_latency_ms,0)));
begin
  v_claims := nullif(current_setting('request.jwt.claims', true),'');
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), case when v_claims is not null then v_claims::jsonb->>'role' else null end, '');
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_provider not in ('google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway') then raise exception 'AI_PROVIDER_INVALID'; end if;
  if length(v_model) < 1 then raise exception 'AI_PROVIDER_MODEL_REQUIRED'; end if;
  if p_status is not null and (p_status < 100 or p_status > 599) then raise exception 'AI_PROVIDER_STATUS_INVALID'; end if;

  if coalesce(p_success,false) then
    insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,consecutive_failures,cooldown_until,probe_lease_until,last_status,last_observed_at,retry_after_ms,last_latency_ms,success_count,updated_at)
    values(v_provider,v_model,0,null,null,p_status,v_now,null,v_latency,1,v_now)
    on conflict(provider,model) do update set
      failure_class=null,consecutive_failures=0,cooldown_until=null,probe_lease_until=null,
      last_status=excluded.last_status,last_observed_at=v_now,retry_after_ms=null,last_latency_ms=v_latency,
      success_count=dabbir_private.dabbir_ai_provider_health_v1.success_count+1,updated_at=v_now;
    update dabbir_private.dabbir_ai_provider_health_v1
       set failure_class=null,consecutive_failures=0,cooldown_until=null,probe_lease_until=null,
           last_status=p_status,last_observed_at=v_now,retry_after_ms=null,last_latency_ms=v_latency,
           success_count=success_count+1,updated_at=v_now
     where provider=v_provider and model='*';
    return jsonb_build_object('ok',true,'state','HEALTHY','cooldown_ms',0);
  end if;

  begin v_class := p_failure_class::dabbir_private.dabbir_ai_provider_failure_class;
  exception when others then raise exception 'AI_PROVIDER_FAILURE_CLASS_INVALID'; end;

  -- Any non-hard response proves that a prior provider-wide account block has cleared.
  if v_class not in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION') then
    update dabbir_private.dabbir_ai_provider_health_v1
       set failure_class=null,consecutive_failures=0,cooldown_until=null,probe_lease_until=null,updated_at=v_now
     where provider=v_provider and model='*';
  end if;

  if v_class in ('BILLING_CAPACITY_HARD_BLOCK','AUTH_CONFIGURATION') then
    v_cooldown_ms := coalesce(v_retry,300000);
    insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,failure_class,consecutive_failures,cooldown_until,probe_lease_until,last_status,last_observed_at,retry_after_ms,last_latency_ms,failure_count,updated_at)
    values(v_provider,'*',v_class,1,v_now+make_interval(secs=>v_cooldown_ms/1000.0),null,p_status,v_now,v_retry,v_latency,1,v_now)
    on conflict(provider,model) do update set
      failure_class=v_class,
      consecutive_failures=case when dabbir_private.dabbir_ai_provider_health_v1.failure_class=v_class and dabbir_private.dabbir_ai_provider_health_v1.last_observed_at>v_now-interval '5 minutes' then least(1000000,dabbir_private.dabbir_ai_provider_health_v1.consecutive_failures+1) else 1 end,
      cooldown_until=v_now+make_interval(secs=>v_cooldown_ms/1000.0),probe_lease_until=null,last_status=p_status,last_observed_at=v_now,
      retry_after_ms=v_retry,last_latency_ms=v_latency,failure_count=dabbir_private.dabbir_ai_provider_health_v1.failure_count+1,updated_at=v_now;
    return jsonb_build_object('ok',true,'state','PROVIDER_HARD_BLOCK','failure_class',v_class,'cooldown_ms',v_cooldown_ms,'scope','provider');
  end if;

  select * into v_row from dabbir_private.dabbir_ai_provider_health_v1 where provider=v_provider and model=v_model for update;
  if found and v_row.failure_class=v_class and v_row.last_observed_at is not null and v_row.last_observed_at>v_now-interval '5 minutes' then
    v_consecutive := least(1000000,v_row.consecutive_failures+1);
  else
    v_consecutive := 1;
  end if;

  if v_class='RATE_LIMIT' then
    v_cooldown_ms := coalesce(v_retry,least(120000,15000*(2^least(3,v_consecutive-1))));
  elsif v_class in ('TIMEOUT','NETWORK') then
    v_cooldown_ms := case when v_consecutive>=2 then least(60000,10000*(2^least(3,v_consecutive-2))) else 0 end;
  elsif v_class='UPSTREAM_5XX' then
    v_cooldown_ms := case when v_consecutive>=2 then least(60000,15000*(2^least(2,v_consecutive-2))) else 0 end;
  else
    v_cooldown_ms := 0;
  end if;

  insert into dabbir_private.dabbir_ai_provider_health_v1(provider,model,failure_class,consecutive_failures,cooldown_until,probe_lease_until,last_status,last_observed_at,retry_after_ms,last_latency_ms,failure_count,updated_at)
  values(v_provider,v_model,v_class,v_consecutive,case when v_cooldown_ms>0 then v_now+make_interval(secs=>v_cooldown_ms/1000.0) else null end,null,p_status,v_now,v_retry,v_latency,1,v_now)
  on conflict(provider,model) do update set
    failure_class=v_class,consecutive_failures=v_consecutive,
    cooldown_until=case when v_cooldown_ms>0 then v_now+make_interval(secs=>v_cooldown_ms/1000.0) else null end,
    probe_lease_until=null,last_status=p_status,last_observed_at=v_now,retry_after_ms=v_retry,last_latency_ms=v_latency,
    failure_count=dabbir_private.dabbir_ai_provider_health_v1.failure_count+1,updated_at=v_now;

  return jsonb_build_object('ok',true,'state',case when v_cooldown_ms>0 then 'COOLDOWN' else 'OBSERVED' end,'failure_class',v_class,'consecutive_failures',v_consecutive,'cooldown_ms',v_cooldown_ms,'scope','model');
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
    'cooldown_until',cooldown_until,'probe_lease_until',probe_lease_until,'last_status',last_status,'last_observed_at',last_observed_at,
    'retry_after_ms',retry_after_ms,'last_latency_ms',last_latency_ms,'attempt_count',attempt_count,'skip_count',skip_count,
    'success_count',success_count,'failure_count',failure_count,'updated_at',updated_at
  ) order by provider,model),'[]'::jsonb) into v_result
  from dabbir_private.dabbir_ai_provider_health_v1;
  return jsonb_build_object('ok',true,'authority','DABBIR_AI_PROVIDER_RELIABILITY_V1','providers',v_result);
end;
$$;

revoke all on function public.dabbir_ai_provider_health_claim_v1(text,text) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.dabbir_ai_provider_health_snapshot_v1() from public, anon, authenticated;
grant execute on function public.dabbir_ai_provider_health_claim_v1(text,text) to service_role;
grant execute on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer) to service_role;
grant execute on function public.dabbir_ai_provider_health_snapshot_v1() to service_role;

comment on table dabbir_private.dabbir_ai_provider_health_v1 is 'Distributed non-sensitive AI provider health. No tenant data, prompts, credentials, or upstream response bodies.';
comment on function public.dabbir_ai_provider_health_claim_v1(text,text) is 'Service-role-only atomic claim/cooldown/probe authority for AI providers across serverless instances.';
comment on function public.dabbir_ai_provider_health_observe_v1(text,text,boolean,text,integer,integer,integer) is 'Service-role-only bounded provider health observation. 429 respects Retry-After; 402/auth is provider-wide; transient timeout/network/5xx requires repeated failures.';
