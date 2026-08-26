-- PILOT Phase 2: authentication/RBAC/tenant-integrity hardening
-- Authoritative DB project is discovered at runtime; this migration intentionally touches pilot_* only.

create schema if not exists pilot_private;
revoke all on schema pilot_private from public, anon;
grant usage on schema pilot_private to authenticated, service_role;

-- Align supported business/role vocabulary with the Phase 2 product contract while retaining
-- legacy agent compatibility until all callers are migrated to staff.
alter table public.pilot_memberships drop constraint if exists pilot_memberships_role_check;
alter table public.pilot_memberships
  add constraint pilot_memberships_role_check
  check (role in ('owner','admin','manager','staff','viewer','agent'));

alter table public.pilot_businesses drop constraint if exists pilot_businesses_business_type_check;
alter table public.pilot_businesses
  add constraint pilot_businesses_business_type_check
  check (business_type in ('store','clinic','creator','salon','real_estate','services','other'));

-- Permission evaluation is intentionally kept in a non-exposed schema. It is SECURITY DEFINER
-- only to read membership rows consistently from RLS policies and always binds authorization to auth.uid().
create or replace function pilot_private.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.pilot_memberships m
      where m.business_id = p_business_id
        and m.user_id = (select auth.uid())
        and case m.role
          when 'owner' then p_permission = any(array[
            'view_business','manage_business','manage_team','manage_integrations','view_integrations',
            'view_customers','edit_customers','view_conversations','reply_conversations',
            'view_appointments','manage_appointments','manage_automations','view_analytics',
            'manage_billing','export_data','view_services','manage_services','view_knowledge',
            'manage_knowledge','view_quality','manage_handoffs','view_catalog','manage_catalog',
            'view_inventory','manage_inventory','view_orders','manage_orders'
          ])
          when 'admin' then p_permission = any(array[
            'view_business','manage_business','manage_team','manage_integrations','view_integrations',
            'view_customers','edit_customers','view_conversations','reply_conversations',
            'view_appointments','manage_appointments','manage_automations','view_analytics',
            'export_data','view_services','manage_services','view_knowledge','manage_knowledge',
            'view_quality','manage_handoffs','view_catalog','manage_catalog','view_inventory',
            'manage_inventory','view_orders','manage_orders'
          ])
          when 'manager' then p_permission = any(array[
            'view_business','view_integrations','view_customers','edit_customers','view_conversations',
            'reply_conversations','view_appointments','manage_appointments','manage_automations',
            'view_analytics','view_services','manage_services','view_knowledge','manage_knowledge',
            'view_quality','manage_handoffs','view_catalog','manage_catalog','view_inventory',
            'manage_inventory','view_orders','manage_orders'
          ])
          when 'staff' then p_permission = any(array[
            'view_business','view_integrations','view_customers','edit_customers','view_conversations',
            'reply_conversations','view_appointments','manage_appointments','view_services',
            'view_knowledge','manage_handoffs','view_catalog','view_inventory','manage_inventory',
            'view_orders','manage_orders'
          ])
          when 'agent' then p_permission = any(array[
            'view_business','view_integrations','view_customers','edit_customers','view_conversations',
            'reply_conversations','view_appointments','manage_appointments','view_services',
            'view_knowledge','manage_handoffs','view_catalog','view_inventory','manage_inventory',
            'view_orders','manage_orders'
          ])
          when 'viewer' then p_permission = any(array[
            'view_business','view_integrations','view_customers','view_conversations','view_appointments',
            'view_analytics','view_services','view_knowledge','view_quality','view_catalog','view_inventory',
            'view_orders'
          ])
          else false
        end
    );
$$;
revoke all on function pilot_private.has_permission(uuid,text) from public, anon;
grant execute on function pilot_private.has_permission(uuid,text) to authenticated, service_role;

create or replace function pilot_private.can_manage_role(p_business_id uuid, p_target_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.pilot_memberships m
      where m.business_id = p_business_id
        and m.user_id = (select auth.uid())
        and (
          (m.role='owner' and p_target_role in ('admin','manager','staff','viewer','agent'))
          or (m.role='admin' and p_target_role in ('manager','staff','viewer','agent'))
        )
    );
$$;
revoke all on function pilot_private.can_manage_role(uuid,text) from public, anon;
grant execute on function pilot_private.can_manage_role(uuid,text) to authenticated, service_role;

-- The designated business owner cannot be silently demoted or removed through membership CRUD.
create or replace function pilot_private.guard_designated_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='DELETE' then
    if old.role='owner' and exists(
      select 1 from public.pilot_businesses b
      where b.id=old.business_id and b.owner_id=old.user_id
    ) then
      raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if old.role='owner' and exists(
      select 1 from public.pilot_businesses b
      where b.id=old.business_id and b.owner_id=old.user_id
    ) and (new.business_id<>old.business_id or new.user_id<>old.user_id or new.role<>'owner') then
      raise exception 'BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE';
    end if;
    return new;
  end if;
  return new;
end;
$$;
revoke all on function pilot_private.guard_designated_owner_membership() from public, anon, authenticated;

drop trigger if exists pilot_guard_designated_owner_membership on public.pilot_memberships;
create trigger pilot_guard_designated_owner_membership
before update or delete on public.pilot_memberships
for each row execute function pilot_private.guard_designated_owner_membership();

-- Tighten grants without touching non-PILOT products in the shared database.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname='public' and tablename like 'pilot_%'
  loop
    execute format('revoke all privileges on table public.%I from anon', r.tablename);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', r.tablename);
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('alter table public.%I force row level security', r.tablename);
  end loop;
end $$;

-- Messages are append-only for signed-in users. System/service identities can still use privileged paths.
revoke update, delete on table public.pilot_messages from authenticated;
revoke all on table public.pilot_verification_challenges from anon, authenticated;

-- Core business RLS.
drop policy if exists pilot_businesses_member_update on public.pilot_businesses;
create policy pilot_businesses_member_update on public.pilot_businesses
for update to authenticated
using (pilot_private.has_permission(id,'manage_business'))
with check (pilot_private.has_permission(id,'manage_business'));

-- Team visibility and management. The existing self-owner insert policy remains the atomic bootstrap path.
drop policy if exists pilot_memberships_team_select on public.pilot_memberships;
drop policy if exists pilot_memberships_team_insert on public.pilot_memberships;
drop policy if exists pilot_memberships_team_update on public.pilot_memberships;
drop policy if exists pilot_memberships_team_delete on public.pilot_memberships;
create policy pilot_memberships_team_select on public.pilot_memberships
for select to authenticated
using (user_id=(select auth.uid()) or pilot_private.has_permission(business_id,'manage_team'));
create policy pilot_memberships_team_insert on public.pilot_memberships
for insert to authenticated
with check (pilot_private.can_manage_role(business_id,role));
create policy pilot_memberships_team_update on public.pilot_memberships
for update to authenticated
using (pilot_private.can_manage_role(business_id,role))
with check (pilot_private.can_manage_role(business_id,role));
create policy pilot_memberships_team_delete on public.pilot_memberships
for delete to authenticated
using (pilot_private.can_manage_role(business_id,role));

-- Customers.
drop policy if exists pilot_customers_member_all on public.pilot_customers;
create policy pilot_customers_select on public.pilot_customers for select to authenticated
using (pilot_private.has_permission(business_id,'view_customers'));
create policy pilot_customers_insert on public.pilot_customers for insert to authenticated
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customers_update on public.pilot_customers for update to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'))
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customers_delete on public.pilot_customers for delete to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'));

-- Conversations and immutable message history.
drop policy if exists pilot_conversations_member_all on public.pilot_conversations;
create policy pilot_conversations_select on public.pilot_conversations for select to authenticated
using (pilot_private.has_permission(business_id,'view_conversations'));
create policy pilot_conversations_insert on public.pilot_conversations for insert to authenticated
with check (pilot_private.has_permission(business_id,'reply_conversations'));
create policy pilot_conversations_update on public.pilot_conversations for update to authenticated
using (pilot_private.has_permission(business_id,'reply_conversations'))
with check (pilot_private.has_permission(business_id,'reply_conversations'));

drop policy if exists pilot_messages_member_all on public.pilot_messages;
create policy pilot_messages_select on public.pilot_messages for select to authenticated
using (pilot_private.has_permission(business_id,'view_conversations'));
create policy pilot_messages_insert on public.pilot_messages for insert to authenticated
with check (pilot_private.has_permission(business_id,'reply_conversations'));

-- Appointments.
drop policy if exists pilot_appointments_member_all on public.pilot_appointments;
create policy pilot_appointments_select on public.pilot_appointments for select to authenticated
using (pilot_private.has_permission(business_id,'view_appointments'));
create policy pilot_appointments_insert on public.pilot_appointments for insert to authenticated
with check (pilot_private.has_permission(business_id,'manage_appointments'));
create policy pilot_appointments_update on public.pilot_appointments for update to authenticated
using (pilot_private.has_permission(business_id,'manage_appointments'))
with check (pilot_private.has_permission(business_id,'manage_appointments'));
create policy pilot_appointments_delete on public.pilot_appointments for delete to authenticated
using (pilot_private.has_permission(business_id,'manage_appointments'));

-- Integration state is readable by members and writable only by owner/admin.
drop policy if exists pilot_channels_member_all on public.pilot_channels;
create policy pilot_channels_select on public.pilot_channels for select to authenticated
using (pilot_private.has_permission(business_id,'view_integrations'));
create policy pilot_channels_insert on public.pilot_channels for insert to authenticated
with check (pilot_private.has_permission(business_id,'manage_integrations'));
create policy pilot_channels_update on public.pilot_channels for update to authenticated
using (pilot_private.has_permission(business_id,'manage_integrations'))
with check (pilot_private.has_permission(business_id,'manage_integrations'));
create policy pilot_channels_delete on public.pilot_channels for delete to authenticated
using (pilot_private.has_permission(business_id,'manage_integrations'));

-- Services and business knowledge.
drop policy if exists pilot_services_member_all on public.pilot_services;
create policy pilot_services_select on public.pilot_services for select to authenticated
using (pilot_private.has_permission(business_id,'view_services'));
create policy pilot_services_insert on public.pilot_services for insert to authenticated
with check (pilot_private.has_permission(business_id,'manage_services'));
create policy pilot_services_update on public.pilot_services for update to authenticated
using (pilot_private.has_permission(business_id,'manage_services'))
with check (pilot_private.has_permission(business_id,'manage_services'));
create policy pilot_services_delete on public.pilot_services for delete to authenticated
using (pilot_private.has_permission(business_id,'manage_services'));

drop policy if exists pilot_business_knowledge_admin_write on public.pilot_business_knowledge;
drop policy if exists pilot_business_knowledge_member_select on public.pilot_business_knowledge;
create policy pilot_business_knowledge_select on public.pilot_business_knowledge for select to authenticated
using (pilot_private.has_permission(business_id,'view_knowledge'));
create policy pilot_business_knowledge_insert on public.pilot_business_knowledge for insert to authenticated
with check (pilot_private.has_permission(business_id,'manage_knowledge'));
create policy pilot_business_knowledge_update on public.pilot_business_knowledge for update to authenticated
using (pilot_private.has_permission(business_id,'manage_knowledge'))
with check (pilot_private.has_permission(business_id,'manage_knowledge'));
create policy pilot_business_knowledge_delete on public.pilot_business_knowledge for delete to authenticated
using (pilot_private.has_permission(business_id,'manage_knowledge'));

-- Customer operational state and memory.
drop policy if exists pilot_customer_management_member_all on public.pilot_customer_management;
create policy pilot_customer_management_select on public.pilot_customer_management for select to authenticated
using (pilot_private.has_permission(business_id,'view_customers'));
create policy pilot_customer_management_insert on public.pilot_customer_management for insert to authenticated
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_management_update on public.pilot_customer_management for update to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'))
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_management_delete on public.pilot_customer_management for delete to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'));

drop policy if exists pilot_customer_memory_member_all on public.pilot_customer_memory;
create policy pilot_customer_memory_select on public.pilot_customer_memory for select to authenticated
using (pilot_private.has_permission(business_id,'view_customers'));
create policy pilot_customer_memory_insert on public.pilot_customer_memory for insert to authenticated
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_memory_update on public.pilot_customer_memory for update to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'))
with check (pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_memory_delete on public.pilot_customer_memory for delete to authenticated
using (pilot_private.has_permission(business_id,'edit_customers'));

-- Follow-up policies/actions and procedures.
drop policy if exists pilot_followups_admin_write on public.pilot_followups;
drop policy if exists pilot_followups_member_select on public.pilot_followups;
create policy pilot_followups_select on public.pilot_followups for select to authenticated
using (pilot_private.has_permission(business_id,'view_conversations'));
create policy pilot_followups_write on public.pilot_followups for all to authenticated
using (pilot_private.has_permission(business_id,'manage_automations'))
with check (pilot_private.has_permission(business_id,'manage_automations'));

drop policy if exists pilot_action_policies_admin_write on public.pilot_action_policies;
drop policy if exists pilot_action_policies_member_select on public.pilot_action_policies;
create policy pilot_action_policies_select on public.pilot_action_policies for select to authenticated
using (pilot_private.has_permission(business_id,'view_business'));
create policy pilot_action_policies_write on public.pilot_action_policies for all to authenticated
using (pilot_private.has_permission(business_id,'manage_automations'))
with check (pilot_private.has_permission(business_id,'manage_automations'));

drop policy if exists pilot_procedure_definitions_admin_write on public.pilot_procedure_definitions;
drop policy if exists pilot_procedure_definitions_member_select on public.pilot_procedure_definitions;
create policy pilot_procedure_definitions_select on public.pilot_procedure_definitions for select to authenticated
using (pilot_private.has_permission(business_id,'view_business'));
create policy pilot_procedure_definitions_write on public.pilot_procedure_definitions for all to authenticated
using (pilot_private.has_permission(business_id,'manage_automations'))
with check (pilot_private.has_permission(business_id,'manage_automations'));

-- Human handoff read/update guard. RPCs remain the preferred mutation path.
drop policy if exists pilot_handoffs_member_select on public.pilot_handoffs;
create policy pilot_handoffs_select on public.pilot_handoffs for select to authenticated
using (pilot_private.has_permission(business_id,'view_conversations'));
create policy pilot_handoffs_update on public.pilot_handoffs for update to authenticated
using (pilot_private.has_permission(business_id,'manage_handoffs') or assigned_user_id=(select auth.uid()))
with check (pilot_private.has_permission(business_id,'manage_handoffs') or assigned_user_id=(select auth.uid()));
grant update on public.pilot_handoffs to authenticated;

-- Retail/general-business vertical tables.
drop policy if exists pilot_products_member_all on public.pilot_products;
create policy pilot_products_select on public.pilot_products for select to authenticated
using (pilot_private.has_permission(business_id,'view_catalog'));
create policy pilot_products_write on public.pilot_products for all to authenticated
using (pilot_private.has_permission(business_id,'manage_catalog'))
with check (pilot_private.has_permission(business_id,'manage_catalog'));

drop policy if exists pilot_inventory_member_all on public.pilot_inventory;
create policy pilot_inventory_select on public.pilot_inventory for select to authenticated
using (pilot_private.has_permission(business_id,'view_inventory'));
create policy pilot_inventory_write on public.pilot_inventory for all to authenticated
using (pilot_private.has_permission(business_id,'manage_inventory'))
with check (pilot_private.has_permission(business_id,'manage_inventory'));

drop policy if exists pilot_orders_member_all on public.pilot_orders;
create policy pilot_orders_select on public.pilot_orders for select to authenticated
using (pilot_private.has_permission(business_id,'view_orders'));
create policy pilot_orders_write on public.pilot_orders for all to authenticated
using (pilot_private.has_permission(business_id,'manage_orders'))
with check (pilot_private.has_permission(business_id,'manage_orders'));

-- Demo events are visible as analytics but client-side mutation is restricted to managers+.
drop policy if exists pilot_demo_events_member_all on public.pilot_demo_events;
create policy pilot_demo_events_select on public.pilot_demo_events for select to authenticated
using (pilot_private.has_permission(business_id,'view_analytics'));
create policy pilot_demo_events_write on public.pilot_demo_events for all to authenticated
using (pilot_private.has_permission(business_id,'manage_automations'))
with check (pilot_private.has_permission(business_id,'manage_automations'));

-- Upgrade channel truth-state vocabulary. Existing synthetic rows become CONFIGURED, never CONNECTED.
update public.pilot_channels set status='configured' where status='simulated';
update public.pilot_channels set status='failed' where status='blocked';
alter table public.pilot_channels drop constraint if exists pilot_channels_status_check;
alter table public.pilot_channels
  add constraint pilot_channels_status_check
  check (status in ('disconnected','configured','verifying','connected','degraded','failed'));

-- Atomic business onboarding remains SECURITY INVOKER, creates only CONFIGURED channel records,
-- and keeps the business in demo mode until independent production gates are closed.
create or replace function public.pilot_create_business(
  p_name text,
  p_business_type text,
  p_locale text default 'ar-AE'
)
returns table(business_id uuid, business_slug text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_slug text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  if p_business_type not in ('store','clinic','creator','salon','real_estate','services','other') then
    raise exception 'UNSUPPORTED_BUSINESS_TYPE';
  end if;
  v_slug := 'pilot-' || substr(replace(v_id::text,'-',''),1,16);
  insert into public.pilot_businesses(id,slug,name,business_type,owner_id,locale,demo_mode)
  values(v_id,v_slug,left(trim(p_name),120),p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),true);
  insert into public.pilot_memberships(business_id,user_id,role)
  values(v_id,v_user,'owner');
  insert into public.pilot_channels(business_id,channel_type,status,metadata)
  values
    (v_id,'whatsapp','configured','{"reason":"runtime_verification_required"}'::jsonb),
    (v_id,'instagram','configured','{"reason":"runtime_verification_required"}'::jsonb)
  on conflict (business_id,channel_type) do nothing;
  return query select v_id,v_slug;
end;
$$;

-- Handoff RPCs no longer bypass RLS; their explicit membership checks remain defense-in-depth.
alter function public.pilot_claim_handoff(uuid) security invoker;
alter function public.pilot_resolve_handoff(uuid,text) security invoker;
alter function public.pilot_return_handoff_to_ai(uuid,text) security invoker;

-- Expand handoff role vocabulary from the legacy agent name to manager/staff.
create or replace function public.pilot_claim_handoff(p_handoff_id uuid)
returns table(handoff_id uuid, handoff_state text, conversation_state text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v public.pilot_handoffs%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.pilot_handoffs where id=p_handoff_id for update;
  if not found then raise exception 'HANDOFF_NOT_FOUND'; end if;
  if not exists(select 1 from public.pilot_memberships m where m.business_id=v.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','manager','staff','agent')) then raise exception 'HANDOFF_ROLE_REQUIRED'; end if;
  if v.state not in ('QUEUED','ASSIGNED') then raise exception 'HANDOFF_NOT_CLAIMABLE'; end if;
  if v.assigned_user_id is not null and v.assigned_user_id<>(select auth.uid()) then raise exception 'HANDOFF_ASSIGNED_TO_OTHER_USER'; end if;
  update public.pilot_handoffs set assigned_user_id=(select auth.uid()),assigned_role=(select m.role from public.pilot_memberships m where m.business_id=v.business_id and m.user_id=(select auth.uid()) limit 1),state='HUMAN_ACTIVE',assigned_at=coalesce(assigned_at,now()),human_active_at=now(),updated_at=now() where id=p_handoff_id;
  update public.pilot_conversations set state='human_active',updated_at=now() where id=v.conversation_id and business_id=v.business_id;
  return query select p_handoff_id,'HUMAN_ACTIVE'::text,'human_active'::text;
end;
$$;

-- High/irreversible procedure approvals require the designated owner role.
create or replace function public.pilot_approve_procedure_run(p_run_id uuid)
returns table(run_id uuid, state text, approved_at timestamp with time zone)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_run public.pilot_procedure_runs%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_run from public.pilot_procedure_runs where id=p_run_id for update;
  if not found then raise exception 'PROCEDURE_RUN_NOT_FOUND'; end if;
  if v_run.risk_class in ('HIGH','IRREVERSIBLE') then
    if not exists(select 1 from public.pilot_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role='owner') then
      raise exception 'OWNER_REQUIRED_FOR_HIGH_RISK';
    end if;
  elsif not exists(select 1 from public.pilot_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')) then
    raise exception 'OWNER_OR_ADMIN_REQUIRED';
  end if;
  if v_run.state<>'APPROVAL_REQUIRED' then raise exception 'PROCEDURE_NOT_AWAITING_APPROVAL'; end if;
  if v_run.risk_class='IRREVERSIBLE' and (v_run.identity_verified_at is null or v_run.customer_confirmed_at is null) then
    raise exception 'IDENTITY_AND_CUSTOMER_CONFIRMATION_REQUIRED';
  end if;
  update public.pilot_procedure_runs
  set state='PROPOSED',owner_approved_by=(select auth.uid()),owner_approved_at=now(),updated_at=now()
  where id=p_run_id;
  insert into public.pilot_procedure_audit(business_id,run_id,event_type,actor_type,actor_id,payload)
  values(v_run.business_id,p_run_id,'OWNER_APPROVED','owner',(select auth.uid()),jsonb_build_object('risk_class',v_run.risk_class));
  return query select p_run_id,'PROPOSED'::text,now();
end;
$$;
revoke all on function public.pilot_approve_procedure_run(uuid) from public, anon;
grant execute on function public.pilot_approve_procedure_run(uuid) to authenticated, service_role;

-- RLS membership lookups need an index beginning with user_id.
create index if not exists pilot_memberships_user_business_role_idx
  on public.pilot_memberships(user_id,business_id,role);

-- Composite uniqueness supports tenant-safe foreign keys.
create unique index if not exists pilot_customers_business_id_id_uq on public.pilot_customers(business_id,id);
create unique index if not exists pilot_conversations_business_id_id_uq on public.pilot_conversations(business_id,id);
create unique index if not exists pilot_messages_business_id_id_uq on public.pilot_messages(business_id,id);
create unique index if not exists pilot_services_business_id_id_uq on public.pilot_services(business_id,id);
create unique index if not exists pilot_products_business_id_id_uq on public.pilot_products(business_id,id);
create unique index if not exists pilot_customer_identities_business_id_id_uq on public.pilot_customer_identities(business_id,id);
create unique index if not exists pilot_message_batches_business_id_id_uq on public.pilot_message_batches(business_id,id);
create unique index if not exists pilot_procedure_runs_business_id_id_uq on public.pilot_procedure_runs(business_id,id);
create unique index if not exists pilot_procedure_steps_business_id_id_uq on public.pilot_procedure_steps(business_id,id);
create unique index if not exists pilot_quality_cases_business_id_id_uq on public.pilot_quality_cases(business_id,id);

-- Cross-tenant references are rejected by the database, not merely by application code.
alter table public.pilot_conversations add constraint pilot_conversations_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_messages add constraint pilot_messages_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_appointments add constraint pilot_appointments_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_appointments add constraint pilot_appointments_business_service_fk foreign key (business_id,service_id) references public.pilot_services(business_id,id);
alter table public.pilot_conversation_outcomes add constraint pilot_conversation_outcomes_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_conversation_outcomes add constraint pilot_conversation_outcomes_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_customer_evidence add constraint pilot_customer_evidence_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_customer_evidence add constraint pilot_customer_evidence_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_customer_evidence add constraint pilot_customer_evidence_business_message_fk foreign key (business_id,message_id) references public.pilot_messages(business_id,id);
alter table public.pilot_customer_identities add constraint pilot_customer_identities_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_customer_management add constraint pilot_customer_management_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_customer_memory add constraint pilot_customer_memory_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_event_inbox add constraint pilot_event_inbox_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_followups add constraint pilot_followups_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_followups add constraint pilot_followups_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_handoffs add constraint pilot_handoffs_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_handoffs add constraint pilot_handoffs_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_inventory add constraint pilot_inventory_business_product_fk foreign key (business_id,product_id) references public.pilot_products(business_id,id);
alter table public.pilot_message_batches add constraint pilot_message_batches_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_message_batches add constraint pilot_message_batches_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_message_batch_items add constraint pilot_message_batch_items_business_batch_fk foreign key (business_id,batch_id) references public.pilot_message_batches(business_id,id);
alter table public.pilot_message_batch_items add constraint pilot_message_batch_items_business_message_fk foreign key (business_id,message_id) references public.pilot_messages(business_id,id);
alter table public.pilot_orders add constraint pilot_orders_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_procedure_runs add constraint pilot_procedure_runs_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_procedure_runs add constraint pilot_procedure_runs_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_procedure_steps add constraint pilot_procedure_steps_business_run_fk foreign key (business_id,run_id) references public.pilot_procedure_runs(business_id,id);
alter table public.pilot_quality_events add constraint pilot_quality_events_business_conversation_fk foreign key (business_id,conversation_id) references public.pilot_conversations(business_id,id);
alter table public.pilot_quality_regression_cases add constraint pilot_quality_regression_business_case_fk foreign key (business_id,quality_case_id) references public.pilot_quality_cases(business_id,id);
alter table public.pilot_verification_challenges add constraint pilot_verification_challenges_business_customer_fk foreign key (business_id,customer_id) references public.pilot_customers(business_id,id);
alter table public.pilot_verification_challenges add constraint pilot_verification_challenges_business_identity_fk foreign key (business_id,identity_id) references public.pilot_customer_identities(business_id,id);
