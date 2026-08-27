-- Final reproducible DABBIR-only account suspension implementation.
-- This migration intentionally does not ban or mutate auth.users.

create table if not exists public.account_access_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended')),
  reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  reinstated_at timestamptz,
  reinstated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_access_state_reason_check check (
    status <> 'suspended' or length(trim(coalesce(reason,''))) >= 3
  )
);

alter table public.account_access_state enable row level security;
revoke all on public.account_access_state from public, anon, authenticated;
grant select on public.account_access_state to authenticated;
grant all on public.account_access_state to service_role;

drop policy if exists account_access_state_deny_clients on public.account_access_state;
drop policy if exists account_access_state_select_self on public.account_access_state;
create policy account_access_state_select_self
on public.account_access_state
for select
to authenticated
using (user_id = (select auth.uid()));

drop function if exists public.dabbir_account_access_self();

create or replace function dabbir_private.account_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select (select auth.uid()) is not null
    and not exists (
      select 1
      from public.account_access_state s
      where s.user_id = (select auth.uid())
        and s.status = 'suspended'
    );
$$;

revoke all on function dabbir_private.account_active() from public, anon;
grant execute on function dabbir_private.account_active() to authenticated, service_role;

create or replace function dabbir_private.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
select dabbir_private.account_active()
  and (select auth.uid()) is not null
  and exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id=p_business_id
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.suspended_at is null
      and m.removed_at is null
      and (
        m.role not in ('owner','admin')
        or p_permission <> all(array['manage_integrations','manage_billing','export_data']::text[])
        or coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
      )
      and (
        (cardinality(m.permissions) > 0 and p_permission = any(m.permissions))
        or
        (cardinality(m.permissions) = 0 and case m.role
          when 'owner' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
          when 'admin' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
          when 'manager' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
          when 'employee' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
          when 'staff' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
          when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
          when 'viewer' then p_permission=any(array['view_business','view_integrations','view_customers','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
          else false end)
      )
  );
$$;

alter policy dabbir_memberships_select on public.dabbir_memberships
using (
  dabbir_private.account_active()
  and ((user_id = (select auth.uid())) or dabbir_private.has_permission(business_id,'manage_team'))
);

alter policy dabbir_memberships_owner_insert on public.dabbir_memberships
with check (
  dabbir_private.account_active()
  and user_id = (select auth.uid())
  and role='owner'
  and status='active'
  and exists (
    select 1 from public.dabbir_businesses b
    where b.id=dabbir_memberships.business_id and b.owner_id=(select auth.uid())
  )
);

alter policy dabbir_businesses_access_select on public.dabbir_businesses
using (
  dabbir_private.account_active()
  and (dabbir_private.has_permission(id,'view_business') or owner_id=(select auth.uid()))
);

alter policy dabbir_businesses_owner_insert on public.dabbir_businesses
with check (dabbir_private.account_active() and owner_id=(select auth.uid()));

alter policy dabbir_offers_select on public.dabbir_offers
using (
  dabbir_private.account_active()
  and (
    dabbir_private.has_permission(creator_business_id,'view_business')
    or (advertiser_business_id is not null and dabbir_private.has_permission(advertiser_business_id,'view_business'))
    or payer_user_id=(select auth.uid())
    or created_by_user_id=(select auth.uid())
  )
);

alter policy dabbir_payments_select on public.dabbir_payments
using (
  dabbir_private.account_active()
  and (
    dabbir_private.has_permission(recipient_business_id,'manage_billing')
    or (payer_business_id is not null and dabbir_private.has_permission(payer_business_id,'manage_billing'))
    or payer_user_id=(select auth.uid())
  )
);

alter policy dabbir_privacy_requests_insert on public.dabbir_privacy_requests
with check (
  dabbir_private.account_active()
  and requested_by=(select auth.uid())
  and (
    (request_type='BUSINESS_DELETE' and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id=dabbir_privacy_requests.business_id
        and m.user_id=(select auth.uid()) and m.role='owner'
    ))
    or (request_type<>'BUSINESS_DELETE' and dabbir_private.has_permission(business_id,'export_data'))
  )
);

alter policy dabbir_privacy_requests_select on public.dabbir_privacy_requests
using (
  dabbir_private.account_active()
  and (requested_by=(select auth.uid()) or dabbir_private.has_permission(business_id,'export_data'))
);

alter policy dabbir_user_accounts_select_own on public.dabbir_user_accounts
using (dabbir_private.account_active() and user_id=(select auth.uid()));

create or replace function public.dabbir_platform_set_account_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_customer_no text;
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);

  if v_status not in ('active','suspended') then
    raise exception 'DABBIR_INVALID_ACCOUNT_ACCESS_STATUS';
  end if;

  select customer_no into v_customer_no
  from public.dabbir_user_accounts
  where user_id=p_target_user_id;
  if v_customer_no is null then
    raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND';
  end if;

  if v_status='suspended' then
    if p_target_user_id=p_actor_user_id then
      raise exception 'DABBIR_PLATFORM_ADMIN_IMMUTABLE';
    end if;
    if exists (
      select 1 from public.dabbir_platform_admins
      where user_id=p_target_user_id and active=true
    ) then
      raise exception 'DABBIR_PLATFORM_ADMIN_IMMUTABLE';
    end if;
    if v_reason is null or length(v_reason)<3 then
      raise exception 'DABBIR_SUSPENSION_REASON_REQUIRED';
    end if;

    insert into public.account_access_state(
      user_id,status,reason,suspended_at,suspended_by,reinstated_at,reinstated_by,updated_at
    ) values (
      p_target_user_id,'suspended',left(v_reason,500),now(),p_actor_user_id,null,null,now()
    )
    on conflict (user_id) do update set
      status='suspended',reason=excluded.reason,suspended_at=now(),suspended_by=p_actor_user_id,
      reinstated_at=null,reinstated_by=null,updated_at=now();
  else
    insert into public.account_access_state(
      user_id,status,reason,suspended_at,suspended_by,reinstated_at,reinstated_by,updated_at
    ) values (
      p_target_user_id,'active',null,null,null,now(),p_actor_user_id,now()
    )
    on conflict (user_id) do update set
      status='active',reason=null,suspended_at=null,suspended_by=null,
      reinstated_at=now(),reinstated_by=p_actor_user_id,updated_at=now();
  end if;

  select jsonb_build_object(
    'user_id',s.user_id,
    'customer_no',v_customer_no,
    'status',s.status,
    'reason',s.reason,
    'suspended_at',s.suspended_at,
    'reinstated_at',s.reinstated_at,
    'updated_at',s.updated_at
  ) into v_result
  from public.account_access_state s
  where s.user_id=p_target_user_id;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,details)
  values(
    p_actor_user_id,
    case when v_status='suspended' then 'account_suspended' else 'account_reinstated' end,
    p_target_user_id,
    jsonb_build_object('customer_no',v_customer_no,'reason',case when v_status='suspended' then left(v_reason,500) else null end)
  );

  return v_result;
end;
$$;

revoke all on function public.dabbir_platform_set_account_access(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_set_account_access(uuid,uuid,text,text) to service_role;

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
    where v_q is null or a.customer_no=upper(v_q) or lower(coalesce(u.email,''))=lower(v_q)
      or regexp_replace(coalesce(u.phone,''),'[^0-9+]','','g')=regexp_replace(v_q,'[^0-9+]','','g')
      or b.name ilike '%'||replace(replace(v_q,'%','\\%'),'_','\\_')||'%' escape '\\'
    group by a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,u.deleted_at,s.status,s.reason,s.suspended_at
    order by a.customer_no desc
    limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb),count(*) into v_result,v_count from matches;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor_user_id,'customer_search',jsonb_build_object('query_kind',case when v_q is null then 'all' when upper(v_q) like 'DAB-%' then 'customer_no' when position('@' in v_q)>0 then 'email' else 'phone_or_business' end,'result_count',v_count));
  return jsonb_build_object('accounts',v_result,'count',v_count);
end;
$$;

create or replace function public.dabbir_platform_customer_detail(p_actor_user_id uuid, p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select jsonb_build_object(
    'user',jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,'email_confirmed_at',u.email_confirmed_at,'phone_confirmed_at',u.phone_confirmed_at,'banned_until',u.banned_until,'deleted_at',u.deleted_at),
    'account',jsonb_build_object('customer_no',a.customer_no,'created_at',a.created_at),
    'access',jsonb_build_object('status',coalesce(s.status,'active'),'reason',s.reason,'suspended_at',s.suspended_at,'reinstated_at',s.reinstated_at,'updated_at',s.updated_at),
    'businesses',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'business_type',b.business_type,'locale',b.locale,'demo_mode',b.demo_mode,'created_at',b.created_at,'role',m.role,'membership_status',m.status,
      'counts',jsonb_build_object(
        'customers',(select count(*) from public.dabbir_customers x where x.business_id=b.id),
        'conversations',(select count(*) from public.dabbir_conversations x where x.business_id=b.id),
        'messages',(select count(*) from public.dabbir_messages x where x.business_id=b.id),
        'orders',(select count(*) from public.dabbir_orders x where x.business_id=b.id),
        'appointments',(select count(*) from public.dabbir_appointments x where x.business_id=b.id),
        'tasks',(select count(*) from public.dabbir_tasks x where x.business_id=b.id)
      )
    ) order by b.created_at) from public.dabbir_memberships m join public.dabbir_businesses b on b.id=m.business_id where m.user_id=u.id),'[]'::jsonb)
  ) into v_result
  from auth.users u
  join public.dabbir_user_accounts a on a.user_id=u.id
  left join public.account_access_state s on s.user_id=u.id
  where u.id=p_target_user_id;
  if v_result is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,details) values(p_actor_user_id,'customer_detail',p_target_user_id,'{}');
  return v_result;
end;
$$;

revoke all on function public.dabbir_platform_customer_search(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.dabbir_platform_customer_search(uuid,text,integer) to service_role;
revoke all on function public.dabbir_platform_customer_detail(uuid,uuid) from public, anon, authenticated;
grant execute on function public.dabbir_platform_customer_detail(uuid,uuid) to service_role;
