-- PILOT Phase 2 follow-up: remove legacy permissive-policy overlap, index tenant-safe FKs,
-- and move the remaining authenticated SECURITY DEFINER implementation out of the exposed public schema.

-- Membership: one SELECT and one INSERT policy preserve owner bootstrap + team administration.
drop policy if exists pilot_memberships_self_select on public.pilot_memberships;
drop policy if exists pilot_memberships_owner_insert on public.pilot_memberships;
drop policy if exists pilot_memberships_team_select on public.pilot_memberships;
drop policy if exists pilot_memberships_team_insert on public.pilot_memberships;
create policy pilot_memberships_select on public.pilot_memberships for select to authenticated
using (user_id=(select auth.uid()) or pilot_private.has_permission(business_id,'manage_team'));
create policy pilot_memberships_insert on public.pilot_memberships for insert to authenticated
with check (
  (
    user_id=(select auth.uid()) and role='owner' and exists(
      select 1 from public.pilot_businesses b
      where b.id=business_id and b.owner_id=(select auth.uid())
    )
  )
  or pilot_private.can_manage_role(business_id,role)
);

-- Remove superseded policies that survived earlier generations.
drop policy if exists pilot_action_policies_admin_write on public.pilot_action_policies;
drop policy if exists pilot_action_policies_member_select on public.pilot_action_policies;
drop policy if exists pilot_followups_admin_write on public.pilot_followups;
drop policy if exists pilot_followups_member_select on public.pilot_followups;
drop policy if exists pilot_procedure_definitions_admin_write on public.pilot_procedure_definitions;
drop policy if exists pilot_procedure_definitions_member_select on public.pilot_procedure_definitions;

-- Avoid FOR ALL + SELECT overlaps by making read and mutation policies explicit.
drop policy if exists pilot_business_knowledge_write on public.pilot_business_knowledge;
create policy pilot_business_knowledge_insert on public.pilot_business_knowledge for insert to authenticated with check(pilot_private.has_permission(business_id,'manage_knowledge'));
create policy pilot_business_knowledge_update on public.pilot_business_knowledge for update to authenticated using(pilot_private.has_permission(business_id,'manage_knowledge')) with check(pilot_private.has_permission(business_id,'manage_knowledge'));
create policy pilot_business_knowledge_delete on public.pilot_business_knowledge for delete to authenticated using(pilot_private.has_permission(business_id,'manage_knowledge'));

drop policy if exists pilot_customer_management_write on public.pilot_customer_management;
create policy pilot_customer_management_insert on public.pilot_customer_management for insert to authenticated with check(pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_management_update on public.pilot_customer_management for update to authenticated using(pilot_private.has_permission(business_id,'edit_customers')) with check(pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_management_delete on public.pilot_customer_management for delete to authenticated using(pilot_private.has_permission(business_id,'edit_customers'));

drop policy if exists pilot_customer_memory_write on public.pilot_customer_memory;
create policy pilot_customer_memory_insert on public.pilot_customer_memory for insert to authenticated with check(pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_memory_update on public.pilot_customer_memory for update to authenticated using(pilot_private.has_permission(business_id,'edit_customers')) with check(pilot_private.has_permission(business_id,'edit_customers'));
create policy pilot_customer_memory_delete on public.pilot_customer_memory for delete to authenticated using(pilot_private.has_permission(business_id,'edit_customers'));

-- Rebuild action/follow-up/procedure policies with one policy per operation.
create policy pilot_action_policies_select on public.pilot_action_policies for select to authenticated using(pilot_private.has_permission(business_id,'view_business'));
create policy pilot_action_policies_insert on public.pilot_action_policies for insert to authenticated with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_action_policies_update on public.pilot_action_policies for update to authenticated using(pilot_private.has_permission(business_id,'manage_automations')) with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_action_policies_delete on public.pilot_action_policies for delete to authenticated using(pilot_private.has_permission(business_id,'manage_automations'));

create policy pilot_followups_select on public.pilot_followups for select to authenticated using(pilot_private.has_permission(business_id,'view_conversations'));
create policy pilot_followups_insert on public.pilot_followups for insert to authenticated with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_followups_update on public.pilot_followups for update to authenticated using(pilot_private.has_permission(business_id,'manage_automations')) with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_followups_delete on public.pilot_followups for delete to authenticated using(pilot_private.has_permission(business_id,'manage_automations'));

create policy pilot_procedure_definitions_select on public.pilot_procedure_definitions for select to authenticated using(pilot_private.has_permission(business_id,'view_business'));
create policy pilot_procedure_definitions_insert on public.pilot_procedure_definitions for insert to authenticated with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_procedure_definitions_update on public.pilot_procedure_definitions for update to authenticated using(pilot_private.has_permission(business_id,'manage_automations')) with check(pilot_private.has_permission(business_id,'manage_automations'));
create policy pilot_procedure_definitions_delete on public.pilot_procedure_definitions for delete to authenticated using(pilot_private.has_permission(business_id,'manage_automations'));

-- The public RPC is SECURITY INVOKER. The controlled definer implementation lives outside the exposed API schema.
create or replace function pilot_private.approve_procedure_run_internal(p_run_id uuid)
returns table(run_id uuid,state text,approved_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.pilot_procedure_runs%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_run from public.pilot_procedure_runs where id=p_run_id for update;
 if not found then raise exception 'PROCEDURE_RUN_NOT_FOUND'; end if;
 if v_run.risk_class in ('HIGH','IRREVERSIBLE') then
   if not exists(select 1 from public.pilot_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role='owner') then raise exception 'OWNER_REQUIRED_FOR_HIGH_RISK'; end if;
 elsif not exists(select 1 from public.pilot_memberships m where m.business_id=v_run.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')) then
   raise exception 'OWNER_OR_ADMIN_REQUIRED';
 end if;
 if v_run.state<>'APPROVAL_REQUIRED' then raise exception 'PROCEDURE_NOT_AWAITING_APPROVAL'; end if;
 if v_run.risk_class='IRREVERSIBLE' and (v_run.identity_verified_at is null or v_run.customer_confirmed_at is null) then raise exception 'IDENTITY_AND_CUSTOMER_CONFIRMATION_REQUIRED'; end if;
 update public.pilot_procedure_runs set state='PROPOSED',owner_approved_by=(select auth.uid()),owner_approved_at=now(),updated_at=now() where id=p_run_id;
 insert into public.pilot_procedure_audit(business_id,run_id,event_type,actor_type,actor_id,payload) values(v_run.business_id,p_run_id,'OWNER_APPROVED','owner',(select auth.uid()),jsonb_build_object('risk_class',v_run.risk_class));
 return query select p_run_id,'PROPOSED'::text,now();
end;
$$;
revoke all on function pilot_private.approve_procedure_run_internal(uuid) from public,anon;
grant execute on function pilot_private.approve_procedure_run_internal(uuid) to authenticated,service_role;

create or replace function public.pilot_approve_procedure_run(p_run_id uuid)
returns table(run_id uuid,state text,approved_at timestamptz)
language sql security invoker set search_path=public,pg_temp as $$
 select * from pilot_private.approve_procedure_run_internal(p_run_id);
$$;
revoke all on function public.pilot_approve_procedure_run(uuid) from public,anon;
grant execute on function public.pilot_approve_procedure_run(uuid) to authenticated,service_role;

-- Remove weaker ID-only FKs now covered by business-scoped composite FKs.
alter table public.pilot_conversations drop constraint if exists pilot_conversations_customer_id_fkey;
alter table public.pilot_messages drop constraint if exists pilot_messages_conversation_id_fkey;
alter table public.pilot_appointments drop constraint if exists pilot_appointments_customer_id_fkey;
alter table public.pilot_appointments drop constraint if exists pilot_appointments_service_id_fkey;
alter table public.pilot_customer_identities drop constraint if exists pilot_customer_identities_customer_id_fkey;
alter table public.pilot_customer_management drop constraint if exists pilot_customer_management_customer_id_fkey;
alter table public.pilot_customer_memory drop constraint if exists pilot_customer_memory_customer_id_fkey;
alter table public.pilot_handoffs drop constraint if exists pilot_handoffs_customer_id_fkey;
alter table public.pilot_handoffs drop constraint if exists pilot_handoffs_conversation_id_fkey;

-- Cover tenant-safe foreign keys and common scoped lookups.
create index if not exists pilot_conversations_business_customer_idx on public.pilot_conversations(business_id,customer_id);
create index if not exists pilot_messages_business_conversation_idx on public.pilot_messages(business_id,conversation_id);
create index if not exists pilot_appointments_business_customer_idx on public.pilot_appointments(business_id,customer_id);
create index if not exists pilot_appointments_business_service_idx on public.pilot_appointments(business_id,service_id);
create index if not exists pilot_customer_identities_business_customer_idx on public.pilot_customer_identities(business_id,customer_id);
create index if not exists pilot_customer_management_business_customer_idx on public.pilot_customer_management(business_id,customer_id);
create index if not exists pilot_customer_memory_business_customer_idx on public.pilot_customer_memory(business_id,customer_id);
create index if not exists pilot_handoffs_business_customer_idx on public.pilot_handoffs(business_id,customer_id);
create index if not exists pilot_handoffs_business_conversation_idx on public.pilot_handoffs(business_id,conversation_id);
