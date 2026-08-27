-- Service-only exact DABBIR account resolver for support/recovery workflows.
-- Human-facing lookup may use DAB number, verified Auth email, or Auth phone.
-- UUID remains canonical and no lookup capability is granted to client roles.

create or replace function dabbir_private.resolve_account_lookup(p_query text)
returns table (
  customer_no text,
  user_id uuid,
  business_id uuid,
  business_name text,
  membership_role text,
  membership_status text,
  matched_on text
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  with q as (
    select
      nullif(trim(p_query), '') as raw_value,
      upper(nullif(trim(p_query), '')) as number_value,
      lower(nullif(trim(p_query), '')) as email_value,
      regexp_replace(coalesce(p_query, ''), '[^0-9+]', '', 'g') as phone_value
  ), matched_users as (
    select
      a.customer_no,
      a.user_id,
      case
        when a.customer_no = q.number_value then 'customer_no'
        when lower(u.email) = q.email_value then 'email'
        when q.phone_value <> ''
          and regexp_replace(coalesce(u.phone, ''), '[^0-9+]', '', 'g') = q.phone_value then 'phone'
        else null
      end as matched_on
    from public.dabbir_user_accounts a
    join auth.users u on u.id = a.user_id
    cross join q
    where q.raw_value is not null
      and (
        a.customer_no = q.number_value
        or lower(u.email) = q.email_value
        or (
          q.phone_value <> ''
          and regexp_replace(coalesce(u.phone, ''), '[^0-9+]', '', 'g') = q.phone_value
        )
      )
  )
  select
    mu.customer_no,
    mu.user_id,
    m.business_id,
    b.name as business_name,
    m.role::text as membership_role,
    m.status::text as membership_status,
    mu.matched_on
  from matched_users mu
  left join public.dabbir_memberships m on m.user_id = mu.user_id
  left join public.dabbir_businesses b on b.id = m.business_id
  order by mu.customer_no, m.created_at nulls last;
$function$;

revoke all on function dabbir_private.resolve_account_lookup(text) from public, anon, authenticated;
grant execute on function dabbir_private.resolve_account_lookup(text) to service_role;

comment on function dabbir_private.resolve_account_lookup(text) is
  'Service-only exact account lookup by DAB customer number, Auth email, or Auth phone. Returns canonical UUID and DABBIR memberships for support/recovery.';
