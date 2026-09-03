-- Preserve exact live semantics after source reconciliation.
create or replace function dabbir_private.primary_branch_for_business(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path='pg_catalog','public'
as $$
  select id
  from public.dabbir_business_branches
  where business_id=p_business_id and is_primary=true
  order by created_at,id
  limit 1
$$;
revoke all on function dabbir_private.primary_branch_for_business(uuid) from public,anon,authenticated;
grant execute on function dabbir_private.primary_branch_for_business(uuid) to service_role;

insert into public.dabbir_branch_inventory(business_id,branch_id,product_id,quantity,reserved,updated_at)
select i.business_id,dabbir_private.primary_branch_for_business(i.business_id),i.product_id,i.quantity,i.reserved,i.updated_at
from public.dabbir_inventory i
where dabbir_private.primary_branch_for_business(i.business_id) is not null
on conflict (business_id,branch_id,product_id) do update
set quantity=excluded.quantity,reserved=excluded.reserved,updated_at=excluded.updated_at;
