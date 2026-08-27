create table if not exists public.dabbir_platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'support_admin' check (role in ('platform_owner','support_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.dabbir_platform_admins is 'DABBIR platform-level administration identities. Separate from tenant/business owner roles.';
alter table public.dabbir_platform_admins enable row level security;
alter table public.dabbir_platform_admins force row level security;
revoke all on public.dabbir_platform_admins from public, anon, authenticated;
grant select on public.dabbir_platform_admins to authenticated;
grant select,insert,update,delete on public.dabbir_platform_admins to service_role;
drop policy if exists dabbir_platform_admins_select_self on public.dabbir_platform_admins;
create policy dabbir_platform_admins_select_self on public.dabbir_platform_admins for select to authenticated using (user_id=(select auth.uid()));

create table if not exists dabbir_private.platform_customer_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_user_id uuid,
  target_business_id uuid,
  recovery_case_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists platform_customer_admin_audit_actor_time_idx on dabbir_private.platform_customer_admin_audit(actor_user_id,created_at desc);
create index if not exists platform_customer_admin_audit_target_time_idx on dabbir_private.platform_customer_admin_audit(target_user_id,created_at desc);
revoke all on dabbir_private.platform_customer_admin_audit from public,anon,authenticated;
grant select,insert on dabbir_private.platform_customer_admin_audit to service_role;

create or replace function dabbir_private.platform_admin_audit_immutable()
returns trigger language plpgsql set search_path=pg_catalog,dabbir_private as $function$
begin raise exception 'DABBIR_PLATFORM_ADMIN_AUDIT_IMMUTABLE'; end;
$function$;
revoke all on function dabbir_private.platform_admin_audit_immutable() from public,anon,authenticated;
drop trigger if exists dabbir_platform_admin_audit_immutable on dabbir_private.platform_customer_admin_audit;
create trigger dabbir_platform_admin_audit_immutable before update or delete on dabbir_private.platform_customer_admin_audit for each row execute function dabbir_private.platform_admin_audit_immutable();

create or replace function dabbir_private.platform_assert_admin(p_user_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public,dabbir_private as $function$
declare v_role text;
begin
  select role into v_role from public.dabbir_platform_admins where user_id=p_user_id and active=true;
  if v_role is null then raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED'; end if;
  return v_role;
end;
$function$;
revoke all on function dabbir_private.platform_assert_admin(uuid) from public,anon,authenticated;
grant execute on function dabbir_private.platform_assert_admin(uuid) to service_role;

create or replace function public.dabbir_platform_customer_search(p_actor_user_id uuid,p_query text default null,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,auth as $function$
declare v_q text:=nullif(trim(p_query),''); v_limit int:=least(greatest(coalesce(p_limit,100),1),200); v_result jsonb; v_count int;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  with matches as (
    select a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,u.deleted_at,
      count(distinct m.business_id)::int business_count,
      coalesce(jsonb_agg(distinct jsonb_build_object('id',b.id,'name',b.name,'type',b.business_type)) filter (where b.id is not null),'[]'::jsonb) businesses
    from public.dabbir_user_accounts a
    join auth.users u on u.id=a.user_id
    left join public.dabbir_memberships m on m.user_id=a.user_id and m.status='active'
    left join public.dabbir_businesses b on b.id=m.business_id
    where v_q is null or a.customer_no=upper(v_q) or lower(coalesce(u.email,''))=lower(v_q)
      or regexp_replace(coalesce(u.phone,''),'[^0-9+]','','g')=regexp_replace(v_q,'[^0-9+]','','g')
      or b.name ilike '%'||replace(replace(v_q,'%','\%'),'_','\_')||'%' escape '\'
    group by a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,u.deleted_at
    order by a.customer_no desc
    limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb),count(*) into v_result,v_count from matches;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor_user_id,'customer_search',jsonb_build_object('query_kind',case when v_q is null then 'all' when upper(v_q) like 'DAB-%' then 'customer_no' when position('@' in v_q)>0 then 'email' else 'phone_or_business' end,'result_count',v_count));
  return jsonb_build_object('accounts',v_result,'count',v_count);
end;
$function$;
revoke all on function public.dabbir_platform_customer_search(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_search(uuid,text,integer) to service_role;

create or replace function public.dabbir_platform_customer_detail(p_actor_user_id uuid,p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,auth as $function$
declare v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select jsonb_build_object(
    'user',jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,'email_confirmed_at',u.email_confirmed_at,'phone_confirmed_at',u.phone_confirmed_at,'banned_until',u.banned_until,'deleted_at',u.deleted_at),
    'account',jsonb_build_object('customer_no',a.customer_no,'created_at',a.created_at),
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
  from auth.users u join public.dabbir_user_accounts a on a.user_id=u.id where u.id=p_target_user_id;
  if v_result is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,details) values(p_actor_user_id,'customer_detail',p_target_user_id,'{}');
  return v_result;
end;
$function$;
revoke all on function public.dabbir_platform_customer_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_detail(uuid,uuid) to service_role;

create or replace function public.dabbir_platform_recovery_preview(p_actor_user_id uuid,p_target_user_id uuid,p_business_id uuid,p_target_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private as $function$
declare v_preview jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=p_business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  v_preview:=dabbir_private.recovery_preview(p_business_id,p_target_at,null);
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details) values(p_actor_user_id,'recovery_preview',p_target_user_id,p_business_id,jsonb_build_object('target_at',p_target_at,'events_to_reverse',v_preview->'events_to_reverse'));
  return v_preview;
end;
$function$;
revoke all on function public.dabbir_platform_recovery_preview(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_platform_recovery_preview(uuid,uuid,uuid,timestamptz) to service_role;

create or replace function public.dabbir_platform_recovery_open(p_actor_user_id uuid,p_target_user_id uuid,p_business_id uuid,p_target_at timestamptz,p_reason text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dabbir_private as $function$
declare v_case uuid;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=p_business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  v_case:=dabbir_private.recovery_open_case(p_business_id,p_target_at,null,left(coalesce(p_reason,'platform support recovery'),500),p_actor_user_id);
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details) values(p_actor_user_id,'recovery_case_opened',p_target_user_id,p_business_id,v_case,jsonb_build_object('target_at',p_target_at));
  return v_case;
end;
$function$;
revoke all on function public.dabbir_platform_recovery_open(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_recovery_open(uuid,uuid,uuid,timestamptz,text) to service_role;

create or replace function public.dabbir_platform_recovery_apply(p_actor_user_id uuid,p_target_user_id uuid,p_case_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private as $function$
declare v_case dabbir_private.recovery_cases%rowtype; v_customer_no text; v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select * into v_case from dabbir_private.recovery_cases where id=p_case_id;
  if not found then raise exception 'DABBIR_RECOVERY_CASE_NOT_FOUND'; end if;
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=v_case.business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  select customer_no into v_customer_no from public.dabbir_user_accounts where user_id=p_target_user_id;
  if trim(coalesce(p_confirmation,''))<>('RESTORE '||v_customer_no) then raise exception 'DABBIR_RECOVERY_CONFIRMATION_REQUIRED'; end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details) values(p_actor_user_id,'recovery_apply_requested',p_target_user_id,v_case.business_id,p_case_id,jsonb_build_object('target_at',v_case.target_at));
  v_result:=dabbir_private.recovery_apply_case(p_case_id);
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details) values(p_actor_user_id,'recovery_apply_result',p_target_user_id,v_case.business_id,p_case_id,v_result);
  return v_result;
end;
$function$;
revoke all on function public.dabbir_platform_recovery_apply(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_recovery_apply(uuid,uuid,uuid,text) to service_role;
