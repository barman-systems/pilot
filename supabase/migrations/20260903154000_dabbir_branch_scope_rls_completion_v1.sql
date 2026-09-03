begin;

-- Complete fail-closed branch isolation for operational tables omitted by the first branch-scope cutover.
update public.dabbir_conversations
set branch_id=dabbir_private.primary_branch_for_business(business_id)
where branch_id is null;

-- Fail closed rather than leave any conversation outside the branch contract.
do $$
begin
  if exists(select 1 from public.dabbir_conversations where branch_id is null) then
    raise exception 'DABBIR_CONVERSATION_BRANCH_BACKFILL_INCOMPLETE';
  end if;
end
$$;

alter table public.dabbir_conversations alter column branch_id set not null;

drop trigger if exists dabbir_conversations_branch_guard on public.dabbir_conversations;
create trigger dabbir_conversations_branch_guard
before insert or update of business_id,branch_id on public.dabbir_conversations
for each row execute function dabbir_private.ensure_operational_branch();

-- These RESTRICTIVE policies AND with the existing business permission policies.
drop policy if exists dabbir_conversations_branch_restrict on public.dabbir_conversations;
create policy dabbir_conversations_branch_restrict
on public.dabbir_conversations
as restrictive
for all
to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id))
with check (dabbir_private.branch_access_allowed(business_id,branch_id));

drop policy if exists dabbir_inventory_movements_branch_restrict on public.dabbir_inventory_movements;
create policy dabbir_inventory_movements_branch_restrict
on public.dabbir_inventory_movements
as restrictive
for all
to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id))
with check (dabbir_private.branch_access_allowed(business_id,branch_id));

commit;
