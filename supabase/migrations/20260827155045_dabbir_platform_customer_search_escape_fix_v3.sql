-- Remove fragile LIKE ESCAPE handling from platform customer search.
-- Literal substring matching avoids wildcard interpretation and invalid escape strings.

create or replace function public.dabbir_platform_customer_search(p_actor_user_id uuid, p_query text default null, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare v_q text:=nullif(trim(p_query),''); v_limit int:=least(greatest(coalesce(p_limit,100),1),200); v_result jsonb; v_count int;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  with matches as (
    select a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,u.deleted_at,
      coalesce(s.status,'active') access_status,s.reason access_reason,s.suspended_at,
      count(distinct m.business_id)::int business_count,
      coalesce(jsonb_agg(distinct jsonb_build_object('id',b.id,'name',b.name,'type',b.business_type)) filter (where b.id is not null),'[]'::jsonb) businesses
    from public.dabbir_user_accounts a
    join auth.users u on u.id=a.user_id
    left join public.account_access_state s on s.user_id=a.user_id
    left join public.dabbir_memberships m on m.user_id=a.user_id and m.status='active'
    left join public.dabbir_businesses b on b.id=m.business_id
    where v_q is null
      or a.customer_no=upper(v_q)
      or lower(coalesce(u.email,''))=lower(v_q)
      or regexp_replace(coalesce(u.phone,''),'[^0-9+]','','g')=regexp_replace(v_q,'[^0-9+]','','g')
      or strpos(lower(coalesce(b.name,'')),lower(v_q)) > 0
    group by a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,u.deleted_at,s.status,s.reason,s.suspended_at
    order by a.customer_no desc
    limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb),count(*) into v_result,v_count from matches;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor_user_id,'customer_search',jsonb_build_object('query_kind',case when v_q is null then 'all' when upper(v_q) like 'DAB-%' then 'customer_no' when position('@' in v_q)>0 then 'email' else 'phone_or_business' end,'result_count',v_count));
  return jsonb_build_object('accounts',v_result,'count',v_count);
end;
$$;

revoke all on function public.dabbir_platform_customer_search(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.dabbir_platform_customer_search(uuid,text,integer) to service_role;
