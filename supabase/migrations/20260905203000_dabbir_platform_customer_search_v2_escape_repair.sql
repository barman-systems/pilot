-- Repair owner customer search so literal DAB/email/phone/business queries cannot fail on an invalid LIKE ESCAPE sequence.
-- Keep the existing permission/scope boundary and service_role-only execution contract.

create or replace function public.dabbir_platform_customer_search_v2(
  p_actor uuid,
  p_query text default null::text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','dabbir_private'
as $function$
declare
  v_q text:=nullif(trim(p_query),'');
  v_limit int:=least(greatest(coalesce(p_limit,50),1),100);
  v_result jsonb;
  v_global boolean;
  v_phone_q text;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_customers');
  v_global:=dabbir_private.platform_scope_is_global(p_actor);
  v_phone_q:=regexp_replace(coalesce(v_q,''),'[^0-9+]','','g');

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result
  from (
    select a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,
      count(distinct m.business_id)::int as business_count,
      coalesce(jsonb_agg(distinct jsonb_build_object(
        'id',b.id,'name',b.name,'type',b.business_type,'country',b.country_code
      )) filter(where b.id is not null),'[]'::jsonb) as businesses
    from public.dabbir_user_accounts a
    join auth.users u on u.id=a.user_id
    left join public.dabbir_memberships m
      on m.user_id=a.user_id
     and m.status='active'
     and dabbir_private.platform_scope_allows_business(p_actor,m.business_id)
    left join public.dabbir_businesses b on b.id=m.business_id
    where (
      v_global
      or exists(
        select 1
        from public.dabbir_memberships mx
        where mx.user_id=a.user_id
          and mx.status='active'
          and dabbir_private.platform_scope_allows_business(p_actor,mx.business_id)
      )
    )
      and (
        v_q is null
        or a.customer_no=upper(v_q)
        or position(lower(v_q) in lower(coalesce(u.email,'')))>0
        or (v_phone_q<>'' and position(v_phone_q in regexp_replace(coalesce(u.phone,''),'[^0-9+]','','g'))>0)
        or position(lower(v_q) in lower(coalesce(b.name,'')))>0
      )
    group by a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at
    order by u.last_sign_in_at desc nulls last,u.created_at desc
    limit v_limit
  ) x;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(
    p_actor,
    'customer_search_v2',
    jsonb_build_object(
      'has_query',v_q is not null,
      'limit',v_limit,
      'scope_enforced',true,
      'match_mode','literal_substring_v2'
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.dabbir_platform_customer_search_v2(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_search_v2(uuid,text,integer) to service_role;
