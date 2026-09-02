create or replace function public.dabbir_ceo_command_create_v1(
  p_created_by uuid,
  p_command_text text,
  p_priority text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, dabbir_private, pg_temp
as $$
declare
  v_command public.dabbir_ceo_commands%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_priority text := upper(btrim(coalesce(p_priority, 'P1')));
  v_text text := btrim(coalesce(p_command_text, ''));
  v_severity text;
begin
  if p_created_by is null then raise exception 'CREATED_BY_REQUIRED'; end if;
  if char_length(v_text) < 4 or char_length(v_text) > 4000 then raise exception 'COMMAND_TEXT_INVALID'; end if;
  if v_priority not in ('P0','P1','P2','P3') then raise exception 'PRIORITY_INVALID'; end if;

  insert into public.dabbir_ceo_commands(created_by, command_text, priority)
  values (p_created_by, v_text, v_priority)
  returning * into v_command;

  v_severity := case v_priority when 'P0' then 'critical' when 'P1' then 'high' when 'P2' then 'medium' else 'low' end;

  insert into dabbir_private.executive_events(
    id, fingerprint, source, kind, severity, status, project_key,
    external_ref, summary, payload, detected_at
  ) values (
    v_event_id,
    'owner-command:' || v_command.id::text,
    'owner-directive',
    'ceo_command',
    v_severity,
    'open',
    'DABBIR',
    v_command.id::text,
    v_command.command_text,
    jsonb_build_object('command_id',v_command.id,'priority',v_command.priority,'created_by',v_command.created_by,'source',v_command.source),
    v_command.created_at
  );

  return to_jsonb(v_command) || jsonb_build_object('executive_event_id',v_event_id,'executive_event_status','open');
end;
$$;

revoke all on function public.dabbir_ceo_command_create_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.dabbir_ceo_command_create_v1(uuid,text,text) to service_role;

create or replace function public.dabbir_ceo_commands_recent_v1(p_limit integer default 20)
returns jsonb
language sql
security invoker
set search_path = public, dabbir_private, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  from (
    select
      c.id,
      c.created_at,
      c.updated_at,
      c.created_by,
      c.command_text,
      c.priority,
      case e.status
        when 'open' then 'QUEUED'
        when 'claimed' then 'IN_PROGRESS'
        when 'resolved' then 'DONE'
        when 'escalated' then 'BLOCKED'
        when 'ignored' then 'CANCELLED'
        else c.status
      end as status,
      c.source,
      c.result_summary,
      c.evidence,
      e.id as executive_event_id,
      e.status as executive_event_status,
      e.detected_at as executive_event_detected_at,
      e.resolved_at as executive_event_resolved_at
    from public.dabbir_ceo_commands c
    left join dabbir_private.executive_events e
      on e.source='owner-directive'
     and e.kind='ceo_command'
     and e.external_ref=c.id::text
    order by c.created_at desc
    limit greatest(1,least(coalesce(p_limit,20),50))
  ) x;
$$;

revoke all on function public.dabbir_ceo_commands_recent_v1(integer) from public, anon, authenticated;
grant execute on function public.dabbir_ceo_commands_recent_v1(integer) to service_role;