-- DABBIR Owner Executive Command Center — P2 granular capability completion
-- Granular permissions are canonical. Legacy coarse permissions remain derived compatibility only.

insert into dabbir_private.platform_permissions(code,domain,risk_level,owner_only)
values
  ('incidents.view','incidents','LOW',false),
  ('incidents.create','incidents','MEDIUM',false),
  ('incidents.update','incidents','HIGH',false),
  ('integrations.view','integrations','LOW',false),
  ('integrations.configure','integrations','HIGH',false),
  ('releases.view','releases','LOW',false),
  ('releases.manage','releases','HIGH',false),
  ('ceo.view','ceo','LOW',false),
  ('ceo.create','ceo','HIGH',false),
  ('ceo.update','ceo','HIGH',false)
on conflict(code) do update
set domain=excluded.domain,
    risk_level=excluded.risk_level,
    owner_only=excluded.owner_only;

-- Preserve the authority that system roles previously had through coarse permissions,
-- but express it explicitly in the canonical granular matrix.
insert into dabbir_private.platform_role_permissions(role_id,permission_code)
select r.id,p.code
from dabbir_private.platform_roles r
join dabbir_private.platform_permissions p on (
  (r.code='EXECUTIVE_ADMIN' and p.code in (
    'incidents.view','incidents.create','incidents.update',
    'integrations.view','integrations.configure',
    'releases.view','releases.manage',
    'ceo.view','ceo.create','ceo.update'
  ))
  or (r.code='OPERATIONS_MANAGER' and p.code in (
    'incidents.view','incidents.create','incidents.update',
    'integrations.view','integrations.configure'
  ))
  or (r.code='CUSTOMER_SUPPORT' and p.code in (
    'incidents.view','incidents.create','incidents.update'
  ))
  or (r.code='TECHNICAL_ADMIN' and p.code in (
    'incidents.view','incidents.create','incidents.update',
    'integrations.view','integrations.configure',
    'releases.view','releases.manage',
    'ceo.view','ceo.create','ceo.update'
  ))
)
on conflict(role_id,permission_code) do nothing;

create or replace function dabbir_private.platform_effective_capability(p_user_id uuid,p_code text)
returns boolean
language plpgsql
stable
security invoker
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_admin public.dabbir_platform_admins%rowtype;
  v_owner_only boolean;
  v_legacy text;
begin
  select * into v_admin
  from public.dabbir_platform_admins
  where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
  if not found then return false; end if;
  if v_admin.role='ROOT_OWNER' then return true; end if;

  select owner_only into v_owner_only
  from dabbir_private.platform_permissions
  where code=p_code;
  if not found or v_owner_only then return false; end if;

  if cardinality(coalesce(v_admin.granular_permissions,'{}'::text[]))>0 then
    return p_code=any(v_admin.granular_permissions);
  end if;

  -- Compatibility path for legacy delegates that predate granular permission snapshots.
  -- Once a delegate has any granular snapshot, this fallback is never consulted.
  v_legacy:=case split_part(p_code,'.',1)
    when 'businesses' then 'manage_businesses'
    when 'customers' then 'manage_customers'
    when 'orders' then 'manage_orders'
    when 'bookings' then 'manage_bookings'
    when 'support' then 'manage_support'
    when 'team' then 'manage_employees'
    when 'tasks' then 'manage_employees'
    when 'system' then 'manage_system'
    when 'security' then 'manage_system'
    when 'audit' then 'manage_system'
    when 'approvals' then 'manage_system'
    when 'incidents' then 'manage_incidents'
    when 'integrations' then 'manage_integrations'
    when 'releases' then 'manage_releases'
    when 'ceo' then 'manage_ceo_commands'
    when 'reports' then case when p_code like 'reports.export%' then 'manage_system' else 'view_financials' end
    when 'payments' then case when p_code='payments.view' then 'view_financials' else 'manage_financial_operations' end
    when 'subscriptions' then case when p_code='subscriptions.view' then 'view_financials' else 'manage_financial_operations' end
    else null
  end;
  return v_legacy is not null and v_legacy=any(coalesce(v_admin.permissions,'{}'::text[]));
end;
$$;

create or replace function dabbir_private.platform_coarse_permissions_for_role(
  p_role_code text,
  p_granular text[] default '{}'::text[]
)
returns text[]
language plpgsql
stable
security invoker
set search_path='pg_catalog','dabbir_private'
as $$
declare
  v_role text:=upper(trim(coalesce(p_role_code,'CUSTOM')));
  v_g text[]:=coalesce(p_granular,'{}'::text[]);
  v_out text[]:='{}'::text[];
begin
  if v_role='EXECUTIVE_ADMIN' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations']::text[];
  elsif v_role='OPERATIONS_MANAGER' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations']::text[];
  elsif v_role='CUSTOMER_SUPPORT' then
    return array['manage_customers','manage_support','manage_incidents']::text[];
  elsif v_role='FINANCE' then
    return array['view_financials','manage_financial_operations']::text[];
  elsif v_role='GROWTH_SALES' then
    return array['manage_customers','manage_businesses']::text[];
  elsif v_role='TECHNICAL_ADMIN' then
    return array['manage_incidents','manage_integrations','manage_system','manage_releases','manage_ceo_commands']::text[];
  elsif v_role='VIEWER_AUDITOR' then
    return array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_support','manage_system','view_financials']::text[];
  elsif v_role<>'CUSTOM' then
    raise exception 'DABBIR_ROLE_CODE_INVALID';
  end if;

  if cardinality(v_g)=0 then return v_out; end if;
  if exists(select 1 from unnest(v_g) x where x like 'businesses.%') then v_out:=array_append(v_out,'manage_businesses'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'customers.%') then v_out:=array_append(v_out,'manage_customers'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'orders.%') then v_out:=array_append(v_out,'manage_orders'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'bookings.%') then v_out:=array_append(v_out,'manage_bookings'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'support.%') then v_out:=array_append(v_out,'manage_support'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'team.%' or x like 'tasks.%') then v_out:=array_append(v_out,'manage_employees'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'system.%' or x like 'security.%' or x like 'audit.%' or x like 'approvals.%' or x like 'reports.export%') then v_out:=array_append(v_out,'manage_system'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'incidents.%') then v_out:=array_append(v_out,'manage_incidents'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'integrations.%') then v_out:=array_append(v_out,'manage_integrations'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'releases.%') then v_out:=array_append(v_out,'manage_releases'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'ceo.%') then v_out:=array_append(v_out,'manage_ceo_commands'); end if;
  if exists(select 1 from unnest(v_g) x where x like 'payments.%' or x like 'subscriptions.%' or x like 'reports.%') then v_out:=array_append(v_out,'view_financials'); end if;
  if exists(select 1 from unnest(v_g) x where x in ('orders.refund','payments.refund','subscriptions.modify','subscriptions.cancel')) then v_out:=array_append(v_out,'manage_financial_operations'); end if;
  return (select coalesce(array_agg(distinct x order by x),'{}'::text[]) from unnest(v_out) x);
end;
$$;

-- Reconcile persisted snapshots for system roles only. CUSTOM remains exactly as explicitly granted.
-- Revoke any live owner sessions for rows whose authority snapshot changes.
do $$
declare
  r record;
  v_granular text[];
  v_coarse text[];
begin
  for r in
    select user_id,role_code,granular_permissions,permissions
    from public.dabbir_platform_admins
    where role='OWNER_DELEGATE'
      and role_code in ('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR')
  loop
    v_granular:=dabbir_private.platform_role_permissions_v1(r.role_code);
    v_coarse:=dabbir_private.platform_coarse_permissions_for_role(r.role_code,v_granular);
    if not (coalesce(r.granular_permissions,'{}'::text[]) @> v_granular and v_granular @> coalesce(r.granular_permissions,'{}'::text[]))
       or not (coalesce(r.permissions,'{}'::text[]) @> v_coarse and v_coarse @> coalesce(r.permissions,'{}'::text[])) then
      update public.dabbir_platform_admins
      set granular_permissions=v_granular,
          permissions=v_coarse,
          updated_at=now()
      where user_id=r.user_id and role='OWNER_DELEGATE';

      update dabbir_private.owner_sessions
      set revoked_at=coalesce(revoked_at,now())
      where actor_user_id=r.user_id and revoked_at is null;

      insert into dabbir_private.platform_staff_audit(
        actor_user_id,target_user_id,action,reason,before_state,after_state,result,metadata
      ) values(
        null,r.user_id,'P2_ROLE_CAPABILITY_RECONCILED','canonical granular role matrix reconciliation',
        jsonb_build_object('role_code',r.role_code,'permissions',coalesce(r.permissions,'{}'::text[]),'granular_permissions',coalesce(r.granular_permissions,'{}'::text[])),
        jsonb_build_object('role_code',r.role_code,'permissions',v_coarse,'granular_permissions',v_granular),
        'SUCCESS',jsonb_build_object('migration','20260907013000_dabbir_owner_granular_capabilities_p2')
      );
    end if;
  end loop;
end;
$$;

create or replace function public.dabbir_platform_incident_read_scoped_v1(
  p_actor uuid,
  p_incident_id uuid default null,
  p_customer_no text default null,
  p_business_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_global boolean;
  v_incidents jsonb;
  v_events jsonb:='[]'::jsonb;
  v_target_business uuid;
begin
  if not dabbir_private.platform_effective_capability(p_actor,'incidents.view') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:incidents.view';
  end if;
  v_global:=dabbir_private.platform_scope_is_global(p_actor);

  if p_business_id is not null and not v_global then
    perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  end if;

  if p_incident_id is not null then
    select i.business_id into v_target_business
    from public.dabbir_platform_owner_incidents i
    where i.id=p_incident_id;
    if not found then raise exception 'DABBIR_INCIDENT_NOT_FOUND'; end if;
    if not v_global then
      perform dabbir_private.platform_assert_business_scope(p_actor,v_target_business);
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb)
  into v_incidents
  from (
    select i.*
    from public.dabbir_platform_owner_incidents i
    where (p_incident_id is null or i.id=p_incident_id)
      and (p_customer_no is null or i.customer_no=upper(trim(p_customer_no)))
      and (p_business_id is null or i.business_id=p_business_id)
      and (v_global or (i.business_id is not null and dabbir_private.platform_scope_allows_business(p_actor,i.business_id)))
    order by i.updated_at desc
    limit v_limit
  ) x;

  if p_incident_id is not null then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at asc),'[]'::jsonb)
    into v_events
    from public.dabbir_platform_owner_incident_events e
    where e.incident_id=p_incident_id;
  end if;

  return jsonb_build_object('incidents',v_incidents,'events',v_events,'scope_enforced',true);
end;
$$;

create or replace function public.dabbir_platform_incident_create_authorized_v1(
  p_actor uuid,p_customer_no text,p_business_id uuid,p_category text,p_priority text,
  p_summary text,p_description text,p_assigned_queue text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if not dabbir_private.platform_effective_capability(p_actor,'incidents.create') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:incidents.create';
  end if;
  if not dabbir_private.platform_scope_is_global(p_actor) then
    perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  end if;
  return to_jsonb(public.dabbir_platform_owner_incident_create_v1(p_customer_no,p_business_id,p_category,p_priority,p_summary,p_description,p_assigned_queue));
end;
$$;

create or replace function public.dabbir_platform_incident_update_authorized_v1(
  p_actor uuid,p_incident_id uuid,p_status text,p_priority text,p_assigned_queue text,
  p_root_cause text,p_resolution text,p_note text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_business uuid;
begin
  if not dabbir_private.platform_effective_capability(p_actor,'incidents.update') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:incidents.update';
  end if;
  select business_id into v_business from public.dabbir_platform_owner_incidents where id=p_incident_id;
  if not found then raise exception 'DABBIR_INCIDENT_NOT_FOUND'; end if;
  if not dabbir_private.platform_scope_is_global(p_actor) then
    perform dabbir_private.platform_assert_business_scope(p_actor,v_business);
  end if;
  return to_jsonb(public.dabbir_platform_owner_incident_update_v1(p_incident_id,p_status,p_priority,p_assigned_queue,p_root_cause,p_resolution,p_note));
end;
$$;

create or replace function public.dabbir_ceo_commands_authorized_v1(p_actor uuid,p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if not dabbir_private.platform_effective_capability(p_actor,'ceo.view') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:ceo.view';
  end if;
  return to_jsonb(public.dabbir_ceo_commands_recent_v2(p_limit));
end;
$$;

create or replace function public.dabbir_ceo_command_create_authorized_v1(
  p_actor uuid,p_command_text text,p_priority text,p_objective text,p_acceptance_criteria jsonb,p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if not dabbir_private.platform_effective_capability(p_actor,'ceo.create') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:ceo.create';
  end if;
  return public.dabbir_ceo_command_create_v2(p_actor,p_command_text,p_priority,p_objective,coalesce(p_acceptance_criteria,'[]'::jsonb),p_due_at);
end;
$$;

create or replace function public.dabbir_ceo_command_update_authorized_v1(
  p_actor uuid,p_command_id uuid,p_operation text,p_priority text,p_due_at timestamptz,p_guidance text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if not dabbir_private.platform_effective_capability(p_actor,'ceo.update') then
    raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:ceo.update';
  end if;
  return to_jsonb(public.dabbir_ceo_command_update_v2(p_actor,p_command_id,p_operation,p_priority,p_due_at,p_guidance));
end;
$$;

-- Sensitive owner RPCs stay server-only.
revoke all on function public.dabbir_platform_incident_read_scoped_v1(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_incident_create_authorized_v1(uuid,text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_incident_update_authorized_v1(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_commands_authorized_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;

grant execute on function public.dabbir_platform_incident_read_scoped_v1(uuid,uuid,text,uuid,integer) to service_role;
grant execute on function public.dabbir_platform_incident_create_authorized_v1(uuid,text,uuid,text,text,text,text,text) to service_role;
grant execute on function public.dabbir_platform_incident_update_authorized_v1(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.dabbir_ceo_commands_authorized_v1(uuid,integer) to service_role;
grant execute on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) to service_role;

revoke all on function dabbir_private.platform_effective_capability(uuid,text) from public,anon,authenticated;
revoke all on function dabbir_private.platform_coarse_permissions_for_role(text,text[]) from public,anon,authenticated;
grant execute on function dabbir_private.platform_effective_capability(uuid,text) to service_role;
grant execute on function dabbir_private.platform_coarse_permissions_for_role(text,text[]) to service_role;
