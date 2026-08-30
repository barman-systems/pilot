begin;

do $$
begin
  if to_regprocedure('public.dabbir_platform_owner_overview_base_v1(uuid)') is null then
    alter function public.dabbir_platform_owner_overview(uuid)
      rename to dabbir_platform_owner_overview_base_v1;
  end if;
end
$$;

create or replace function public.dabbir_platform_owner_overview(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'dabbir_private', 'auth'
as $$
declare
  v_base jsonb;
  v_feedback jsonb;
begin
  v_base := public.dabbir_platform_owner_overview_base_v1(p_actor_user_id);

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'total', count(*)::bigint,
      'problems', count(*) filter (where category = 'problem')::bigint,
      'ideas', count(*) filter (where category = 'idea')::bigint,
      'onboarding', count(*) filter (where category = 'onboarding')::bigint,
      'average_rating', round(avg(rating)::numeric, 2),
      'latest_at', max(created_at)
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'user_id', x.user_id,
          'business_id', x.business_id,
          'business_name', x.business_name,
          'business_type', x.business_type,
          'customer_no', x.customer_no,
          'customer_name', x.customer_name,
          'category', x.category,
          'rating', x.rating,
          'message', x.message,
          'context', x.context,
          'created_at', x.created_at
        ) order by x.created_at desc
      )
      from (
        select
          f.id,
          f.user_id,
          f.business_id,
          f.category,
          f.rating,
          f.message,
          f.context,
          f.created_at,
          b.name as business_name,
          b.business_type,
          a.customer_no,
          a.display_name as customer_name
        from public.dabbir_feedback f
        left join public.dabbir_businesses b on b.id = f.business_id
        left join public.dabbir_user_accounts a on a.user_id = f.user_id
        order by f.created_at desc
        limit 200
      ) x
    ), '[]'::jsonb)
  )
  into v_feedback
  from public.dabbir_feedback;

  return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
    'feedback', coalesce(v_feedback, jsonb_build_object(
      'metrics', jsonb_build_object('total',0,'problems',0,'ideas',0,'onboarding',0,'average_rating',null,'latest_at',null),
      'items', '[]'::jsonb
    ))
  );
end;
$$;

revoke all on function public.dabbir_platform_owner_overview(uuid) from public;
revoke all on function public.dabbir_platform_owner_overview(uuid) from anon;
revoke all on function public.dabbir_platform_owner_overview(uuid) from authenticated;
grant execute on function public.dabbir_platform_owner_overview(uuid) to service_role;

commit;
