drop function if exists public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,text[],timestamptz);

create or replace function public.dabbir_ceo_command_create_authorized_v1(
  p_actor uuid,
  p_command_text text,
  p_priority text,
  p_objective text,
  p_acceptance_criteria jsonb,
  p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_ceo_commands');
  return public.dabbir_ceo_command_create_v2(
    p_actor,p_command_text,p_priority,p_objective,coalesce(p_acceptance_criteria,'[]'::jsonb),p_due_at
  );
end;
$$;

revoke all on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz) to service_role;
