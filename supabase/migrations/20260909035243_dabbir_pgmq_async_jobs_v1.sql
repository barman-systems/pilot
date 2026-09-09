create extension if not exists pgmq;

do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'dabbir_async_jobs') then
    perform pgmq.create('dabbir_async_jobs');
  end if;
end
$$;

create or replace function public.dabbir_async_enqueue_v1(
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_delay_seconds integer default 0,
  p_max_attempts integer default 5,
  p_headers jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog','public','pgmq','auth'
as $function$
declare
  v_msg_id bigint;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_type is null or p_job_type !~ '^[a-z][a-z0-9._-]{2,79}$' then
    raise exception 'INVALID_JOB_TYPE';
  end if;
  if p_delay_seconds is null or p_delay_seconds < 0 or p_delay_seconds > 86400 then
    raise exception 'INVALID_DELAY_SECONDS';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20 then
    raise exception 'INVALID_MAX_ATTEMPTS';
  end if;
  if pg_column_size(coalesce(p_payload,'{}'::jsonb)) > 131072 then
    raise exception 'PAYLOAD_TOO_LARGE';
  end if;
  if pg_column_size(coalesce(p_headers,'{}'::jsonb)) > 16384 then
    raise exception 'HEADERS_TOO_LARGE';
  end if;

  select x into v_msg_id
  from pgmq.send(
    queue_name => 'dabbir_async_jobs',
    msg => jsonb_build_object(
      'type', p_job_type,
      'payload', coalesce(p_payload,'{}'::jsonb),
      'max_attempts', p_max_attempts,
      'enqueued_at', now()
    ),
    headers => coalesce(p_headers,'{}'::jsonb),
    delay => p_delay_seconds
  ) as x
  limit 1;

  return v_msg_id;
end
$function$;

create or replace function public.dabbir_async_claim_v1(
  p_limit integer default 10,
  p_visibility_seconds integer default 60,
  p_job_type text default null
) returns table(
  msg_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visible_at timestamptz,
  job_type text,
  payload jsonb,
  max_attempts integer,
  headers jsonb
)
language plpgsql
security definer
set search_path = 'pg_catalog','public','pgmq','auth'
as $function$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_CLAIM_LIMIT';
  end if;
  if p_visibility_seconds is null or p_visibility_seconds < 5 or p_visibility_seconds > 3600 then
    raise exception 'INVALID_VISIBILITY_SECONDS';
  end if;
  if p_job_type is not null and p_job_type !~ '^[a-z][a-z0-9._-]{2,79}$' then
    raise exception 'INVALID_JOB_TYPE';
  end if;

  return query
  select
    r.msg_id,
    r.read_ct,
    r.enqueued_at,
    r.vt,
    r.message->>'type',
    coalesce(r.message->'payload','{}'::jsonb),
    greatest(1, least(20, coalesce((r.message->>'max_attempts')::integer,5))),
    coalesce(r.headers,'{}'::jsonb)
  from pgmq.read(
    queue_name => 'dabbir_async_jobs',
    vt => p_visibility_seconds,
    qty => p_limit,
    conditional => case when p_job_type is null then '{}'::jsonb else jsonb_build_object('type',p_job_type) end
  ) r;
end
$function$;

create or replace function public.dabbir_async_complete_v1(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = 'pg_catalog','public','pgmq','auth'
as $function$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_msg_id is null or p_msg_id < 1 then
    raise exception 'INVALID_MESSAGE_ID';
  end if;
  return pgmq.archive('dabbir_async_jobs', p_msg_id);
end
$function$;

revoke all on function public.dabbir_async_enqueue_v1(text,jsonb,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.dabbir_async_claim_v1(integer,integer,text) from public,anon,authenticated;
revoke all on function public.dabbir_async_complete_v1(bigint) from public,anon,authenticated;
grant execute on function public.dabbir_async_enqueue_v1(text,jsonb,integer,integer,jsonb) to service_role;
grant execute on function public.dabbir_async_claim_v1(integer,integer,text) to service_role;
grant execute on function public.dabbir_async_complete_v1(bigint) to service_role;
