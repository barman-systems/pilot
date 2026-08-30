-- DABBIR Phase 2 auth/RBAC/tenant hardening. Scope is intentionally dabbir_* only.

create schema if not exists dabbir_private;
revoke all on schema dabbir_private from public, anon;
grant usage on schema dabbir_private to authenticated, service_role;

alter table public.dabbir_memberships drop constraint if exists dabbir_memberships_role_check;
alter table public.dabbir_memberships add constraint dabbir_memberships_role_check
  check (role in ('owner','admin','manager','staff','viewer','agent'));

alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_business_type_check;
alter table public.dabbir_businesses add constraint dabbir_businesses_business_type_check
  check (business_type in ('store','clinic','creator','salon','real_estate','services','other'));

create or replace function dabbir_private.has_permission(p_business_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select (select auth.uid()) is not null and exists (
  select 1 from public.dabbir_memberships m
  where m.business_id=p_business_id and m.user_id=(select auth.uid()) and
  case m.role
    when 'owner' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'admin' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'manager' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
    when 'staff' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
    when 'viewer' then p_permission=any(array['view_business','view_integrations','view_customers','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
    else false end
);
$$;
revoke all on function dabbir_private.has_permission(uuid,text) from public, anon;
grant execute on function dabbir_private.has_permission(uuid,text) to authenticated, service_role;

create or replace function dabbir_private.can_manage_role(p_business_id uuid,p_target_role text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select (select auth.uid()) is not null and exists(
 select 1 from public.dabbir_memberships m
 where m.business_id=p_business_id and m.user_id=(select auth.uid()) and
 ((m.role='owner' and p_target_role in ('admin','manager','staff','viewer','agent')) or
  (m.role='admin' and p_target_role in ('manager','staff','viewer','agent')))
);
$$;
revoke all on function dabbir_private.can_manage_role(uuid,text) from public, anon;
grant execute on function dabbir_private.can_manage_role(uuid,text) to authenticated, service_role;

create or replace function dabbir_private.guard_designated_owner_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and old.role='owner' and exists(select 1 from public.dabbir_businesses b where b.id=old.business_id and b.owner_id=old.user_id) then raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE'; end if;
 if tg_op='UPDATE' and old.role='owner' and exists(select 1 from public.dabbir_businesses b where b.id=old.business_id and b.owner_id=old.user_id) and (new.business_id<>old.business_id or new.user_id<>old.user_id or new.role<>'owner') then raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function dabbir_private.guard_designated_owner_membership() from public,anon,authenticated;
drop trigger if exists dabbir_guard_designated_owner_membership on public.dabbir_memberships;
create trigger dabbir_guard_designated_owner_membership before update or delete on public.dabbir_memberships for each row execute function dabbir_private.guard_designated_owner_membership();

-- No anonymous DABBIR data API access; remove dangerous non-DML privileges from signed-in users.
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'dabbir_%' loop
  execute format('revoke all privileges on table public.%I from anon',r.tablename);
  execute format('revoke truncate, references, trigger on table public.%I from authenticated',r.tablename);
  execute format('alter table public.%I enable row level security',r.tablename);
  execute format('alter table public.%I force row level security',r.tablename);
 end loop;
end $$;
revoke update,delete on public.dabbir_messages from authenticated;
revoke all on public.dabbir_verification_challenges from anon,authenticated;

-- Business and team RBAC.
drop policy if exists dabbir_businesses_member_update on public.dabbir_businesses;
create policy dabbir_businesses_member_update on public.dabbir_businesses for update to authenticated using(dabbir_private.has_permission(id,'manage_business')) with check(dabbir_private.has_permission(id,'manage_business'));

drop policy if exists dabbir_memberships_team_select on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_insert on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_update on public.dabbir_memberships;
drop policy if exists dabbir_memberships_team_delete on public.dabbir_memberships;
create policy dabbir_memberships_team_select on public.dabbir_memberships for select to authenticated using(user_id=(select auth.uid()) or dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_memberships_team_insert on public.dabbir_memberships for insert to authenticated with check(dabbir_private.can_manage_role(business_id,role));
create policy dabbir_memberships_team_update on public.dabbir_memberships for update to authenticated using(dabbir_private.can_manage_role(business_id,role)) with check(dabbir_private.can_manage_role(business_id,role));
create policy dabbir_memberships_team_delete on public.dabbir_memberships for delete to authenticated using(dabbir_private.can_manage_role(business_id,role));

-- Customers.
drop policy if exists dabbir_customers_member_all on public.dabbir_customers;
create policy dabbir_customers_select on public.dabbir_customers for select to authenticated using(dabbir_private.has_permission(business_id,'view_customers'));
create policy dabbir_customers_insert on public.dabbir_customers for insert to authenticated with check(dabbir_private.has_permission(business_id,'edit_customers'));
create policy dabbir_customers_update on public.dabbir_customers for update to authenticated using(dabbir_private.has_permission(business_id,'edit_customers')) with check(dabbir_private.has_permission(business_id,'edit_customers'));
create policy dabbir_customers_delete on public.dabbir_customers for delete to authenticated using(dabbir_private.has_permission(business_id,'edit_customers'));

-- Conversations/messages.
drop policy if exists dabbir_conversations_member_all on public.dabbir_conversations;
create policy dabbir_conversations_select on public.dabbir_conversations for select to authenticated using(dabbir_private.has_permission(business_id,'view_conversations'));
create policy dabbir_conversations_insert on public.dabbir_conversations for insert to authenticated with check(dabbir_private.has_permission(business_id,'reply_conversations'));
create policy dabbir_conversations_update on public.dabbir_conversations for update to authenticated using(dabbir_private.has_permission(business_id,'reply_conversations')) with check(dabbir_private.has_permission(business_id,'reply_conversations'));

drop policy if exists dabbir_messages_member_all on public.dabbir_messages;
create policy dabbir_messages_select on public.dabbir_messages for select to authenticated using(dabbir_private.has_permission(business_id,'view_conversations'));
create policy dabbir_messages_insert on public.dabbir_messages for insert to authenticated with check(dabbir_private.has_permission(business_id,'reply_conversations'));

-- Appointments.
drop policy if exists dabbir_appointments_member_all on public.dabbir_appointments;
create policy dabbir_appointments_select on public.dabbir_appointments for select to authenticated using(dabbir_private.has_permission(business_id,'view_appointments'));
create policy dabbir_appointments_insert on public.dabbir_appointments for insert to authenticated with check(dabbir_private.has_permission(business_id,'manage_appointments'));
create policy dabbir_appointments_update on public.dabbir_appointments for update to authenticated using(dabbir_private.has_permission(business_id,'manage_appointments')) with check(dabbir_private.has_permission(business_id,'manage_appointments'));
create policy dabbir_appointments_delete on public.dabbir_appointments for delete to authenticated using(dabbir_private.has_permission(business_id,'manage_appointments'));

-- Channels.
drop policy if exists dabbir_channels_member_all on public.dabbir_channels;
create policy dabbir_channels_select on public.dabbir_channels for select to authenticated using(dabbir_private.has_permission(business_id,'view_integrations'));
create policy dabbir_channels_insert on public.dabbir_channels for insert to authenticated with check(dabbir_private.has_permission(business_id,'manage_integrations'));
create policy dabbir_channels_update on public.dabbir_channels for update to authenticated using(dabbir_private.has_permission(business_id,'manage_integrations')) with check(dabbir_private.has_permission(business_id,'manage_integrations'));
create policy dabbir_channels_delete on public.dabbir_channels for delete to authenticated using(dabbir_private.has_permission(business_id,'manage_integrations'));

-- Services and knowledge.
drop policy if exists dabbir_services_member_all on public.dabbir_services;
create policy dabbir_services_select on public.dabbir_services for select to authenticated using(dabbir_private.has_permission(business_id,'view_services'));
create policy dabbir_services_insert on public.dabbir_services for insert to authenticated with check(dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_services_update on public.dabbir_services for update to authenticated using(dabbir_private.has_permission(business_id,'manage_services')) with check(dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_services_delete on public.dabbir_services for delete to authenticated using(dabbir_private.has_permission(business_id,'manage_services'));

drop policy if exists dabbir_business_knowledge_admin_write on public.dabbir_business_knowledge;
drop policy if exists dabbir_business_knowledge_member_select on public.dabbir_business_knowledge;
create policy dabbir_business_knowledge_select on public.dabbir_business_knowledge for select to authenticated using(dabbir_private.has_permission(business_id,'view_knowledge'));
create policy dabbir_business_knowledge_write on public.dabbir_business_knowledge for all to authenticated using(dabbir_private.has_permission(business_id,'manage_knowledge')) with check(dabbir_private.has_permission(business_id,'manage_knowledge'));

-- Customer management/memory.
drop policy if exists dabbir_customer_management_member_all on public.dabbir_customer_management;
create policy dabbir_customer_management_select on public.dabbir_customer_management for select to authenticated using(dabbir_private.has_permission(business_id,'view_customers'));
create policy dabbir_customer_management_write on public.dabbir_customer_management for all to authenticated using(dabbir_private.has_permission(business_id,'edit_customers')) with check(dabbir_private.has_permission(business_id,'edit_customers'));

drop policy if exists dabbir_customer_memory_member_all on public.dabbir_customer_memory;
create policy dabbir_customer_memory_select on public.dabbir_customer_memory for select to authenticated using(dabbir_private.has_permission(business_id,'view_customers'));
create policy dabbir_customer_memory_write on public.dabbir_customer_memory for all to authenticated using(dabbir_private.has_permission(business_id,'edit_customers')) with check(dabbir_private.has_permission(business_id,'edit_customers'));

-- Handoffs: read/update through tenant-scoped RBAC; RPCs no longer bypass RLS.
drop policy if exists dabbir_handoffs_member_select on public.dabbir_handoffs;
create policy dabbir_handoffs_select on public.dabbir_handoffs for select to authenticated using(dabbir_private.has_permission(business_id,'view_conversations'));
create policy dabbir_handoffs_update on public.dabbir_handoffs for update to authenticated using(dabbir_private.has_permission(business_id,'manage_handoffs') or assigned_user_id=(select auth.uid())) with check(dabbir_private.has_permission(business_id,'manage_handoffs') or assigned_user_id=(select auth.uid()));
grant update on public.dabbir_handoffs to authenticated;
alter function public.dabbir_claim_handoff(uuid) security invoker;
alter function public.dabbir_resolve_handoff(uuid,text) security invoker;
alter function public.dabbir_return_handoff_to_ai(uuid,text) security invoker;

create or replace function public.dabbir_claim_handoff(p_handoff_id uuid)
returns table(handoff_id uuid,handoff_state text,conversation_state text)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.dabbir_handoffs%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v from public.dabbir_handoffs where id=p_handoff_id for update;
 if not found then raise exception 'HANDOFF_NOT_FOUND'; end if;
 if not exists(select 1 from public.dabbir_memberships m where m.business_id=v.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','manager','staff','agent')) then raise exception 'HANDOFF_ROLE_REQUIRED'; end if;
 if v.state not in ('QUEUED','ASSIGNED') then raise exception 'HANDOFF_NOT_CLAIMABLE'; end if;
 if v.assigned_user_id is not null and v.assigned_user_id<>(select auth.uid()) then raise exception 'HANDOFF_ASSIGNED_TO_OTHER_USER'; end if;
 update public.dabbir_handoffs set assigned_user_id=(select auth.uid()),assigned_role=(select m.role from public.dabbir_memberships m where m.business_id=v.business_id and m.user_id=(select auth.uid()) limit 1),state='HUMAN_ACTIVE',assigned_at=coalesce(assigned_at,now()),human_active_at=now(),updated_at=now() where id=p_handoff_id;
 update public.dabbir_conversations set state='human_active',updated_at=now() where id=v.conversation_id and business_id=v.business_id;
 return query select p_handoff_id,'HUMAN_ACTIVE'::text,'human_active'::text;
end;
$$;

-- Truthful channel states. Drop the old constraint BEFORE data conversion.
alter table public.dabbir_channels drop constraint if exists dabbir_channels_status_check;
update public.dabbir_channels set status='configured' where status='simulated';
update public.dabbir_channels set status='failed' where status='blocked';
alter table public.dabbir_channels add constraint dabbir_channels_status_check
 check(status in ('disconnected','configured','verifying','connected','degraded','failed'));

create or replace function public.dabbir_create_business(p_name text,p_business_type text,p_locale text default 'ar-AE')
returns table(business_id uuid,business_slug text)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid:=gen_random_uuid(); v_slug text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
 if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then raise exception 'UNSUPPORTED_BUSINESS_TYPE'; end if;
 v_slug:='dabbir-'||substr(replace(v_id::text,'-',''),1,16);
 insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode) values(v_id,v_slug,left(trim(p_name),120),p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),false);
 insert into public.dabbir_memberships(business_id,user_id,role,status,accepted_at) values(v_id,v_user,'owner','active',now());
 return query select v_id,v_slug;
end;
$$;

-- High/irreversible actions require owner approval.
create or replace function public.dabbir_approve_procedure_run(p_run_id uuid)
returns table(run_id uuid,state text,approved_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.dabbir_procedure_runs%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_run from public.dabbir_procedure_runs where id=p_run_id for update;
 if not found then raise exception 'PROCEDURE_RUN_NOT_FOUND'; end if;
 if v_run.risk_class in ('HIGH','IRREVERSIBLE') then
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role='owner') then raise exception 'OWNER_REQUIRED_FOR_HIGH_RISK'; end if;
 elsif not exists(select 1 from public.dabbir_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')) then raise exception 'OWNER_OR_ADMIN_REQUIRED'; end if;
 if v_run.state<>'APPROVAL_REQUIRED' then raise exception 'PROCEDURE_NOT_AWAITING_APPROVAL'; end if;
 if v_run.risk_class='IRREVERSIBLE' and (v_run.identity_verified_at is null or v_run.customer_confirmed_at is null) then raise exception 'IDENTITY_AND_CUSTOMER_CONFIRMATION_REQUIRED'; end if;
 update public.dabbir_procedure_runs set state='PROPOSED',owner_approved_by=(select auth.uid()),owner_approved_at=now(),updated_at=now() where id=p_run_id;
 insert into public.dabbir_procedure_audit(business_id,run_id,event_type,actor_type,actor_id,payload) values(v_run.business_id,p_run_id,'OWNER_APPROVED','owner',(select auth.uid()),jsonb_build_object('risk_class',v_run.risk_class));
 return query select p_run_id,'PROPOSED'::text,now();
end;
$$;
revoke all on function public.dabbir_approve_procedure_run(uuid) from public,anon;
grant execute on function public.dabbir_approve_procedure_run(uuid) to authenticated,service_role;

create index if not exists dabbir_memberships_user_business_role_idx on public.dabbir_memberships(user_id,business_id,role);

-- Tenant-safe composite references for the core action chain.
create unique index if not exists dabbir_customers_business_id_id_uq on public.dabbir_customers(business_id,id);
create unique index if not exists dabbir_conversations_business_id_id_uq on public.dabbir_conversations(business_id,id);
create unique index if not exists dabbir_services_business_id_id_uq on public.dabbir_services(business_id,id);
create unique index if not exists dabbir_customer_identities_business_id_id_uq on public.dabbir_customer_identities(business_id,id);

alter table public.dabbir_conversations add constraint dabbir_conversations_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_messages add constraint dabbir_messages_business_conversation_fk foreign key(business_id,conversation_id) references public.dabbir_conversations(business_id,id);
alter table public.dabbir_appointments add constraint dabbir_appointments_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_appointments add constraint dabbir_appointments_business_service_fk foreign key(business_id,service_id) references public.dabbir_services(business_id,id);
alter table public.dabbir_customer_identities add constraint dabbir_customer_identities_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_customer_management add constraint dabbir_customer_management_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_customer_memory add constraint dabbir_customer_memory_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_handoffs add constraint dabbir_handoffs_business_customer_fk foreign key(business_id,customer_id) references public.dabbir_customers(business_id,id);
alter table public.dabbir_handoffs add constraint dabbir_handoffs_business_conversation_fk foreign key(business_id,conversation_id) references public.dabbir_conversations(business_id,id);
