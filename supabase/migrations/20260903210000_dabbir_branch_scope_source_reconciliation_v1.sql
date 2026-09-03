-- DABBIR branch-scope source reconciliation.
-- Production already carries this contract from the 2026-09-03 emergency cutover.
-- This migration is intentionally idempotent so current Production converges without
-- destructive rewrites while fresh environments reproduce the same fail-closed model.

create table if not exists public.dabbir_membership_branches (
  business_id uuid not null,
  user_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (business_id,user_id,branch_id),
  foreign key (business_id,user_id) references public.dabbir_memberships(business_id,user_id) on delete cascade,
  foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete cascade
);
alter table public.dabbir_membership_branches enable row level security;

create or replace function dabbir_private.branch_access_allowed(p_business_id uuid,p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
  select dabbir_private.account_active()
    and p_branch_id is not null
    and exists(
      select 1
      from public.dabbir_memberships m
      where m.business_id=p_business_id
        and m.user_id=(select auth.uid())
        and m.status='active'
        and (
          m.role in ('owner','admin')
          or exists(
            select 1 from public.dabbir_membership_branches mb
            where mb.business_id=p_business_id
              and mb.user_id=m.user_id
              and mb.branch_id=p_branch_id
          )
        )
    );
$$;
revoke all on function dabbir_private.branch_access_allowed(uuid,uuid) from public,anon;
grant execute on function dabbir_private.branch_access_allowed(uuid,uuid) to authenticated,service_role;

drop policy if exists dabbir_membership_branches_select on public.dabbir_membership_branches;
create policy dabbir_membership_branches_select
on public.dabbir_membership_branches for select to authenticated
using (user_id=(select auth.uid()) or dabbir_private.has_permission(business_id,'manage_team'));

create unique index if not exists dabbir_services_business_id_id_uq on public.dabbir_services(business_id,id);
create unique index if not exists dabbir_products_business_id_id_uq on public.dabbir_products(business_id,id);

create table if not exists public.dabbir_branch_services (
  business_id uuid not null,
  branch_id uuid not null,
  service_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id,branch_id,service_id),
  foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete cascade,
  foreign key (business_id,service_id) references public.dabbir_services(business_id,id) on delete cascade
);
alter table public.dabbir_branch_services enable row level security;
drop policy if exists dabbir_branch_services_select on public.dabbir_branch_services;
create policy dabbir_branch_services_select on public.dabbir_branch_services for select to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'view_services'));

create table if not exists public.dabbir_branch_products (
  business_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id,branch_id,product_id),
  foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete cascade,
  foreign key (business_id,product_id) references public.dabbir_products(business_id,id) on delete cascade
);
alter table public.dabbir_branch_products enable row level security;
drop policy if exists dabbir_branch_products_select on public.dabbir_branch_products;
create policy dabbir_branch_products_select on public.dabbir_branch_products for select to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id));

create table if not exists public.dabbir_worker_branches (
  business_id uuid not null,
  branch_id uuid not null,
  worker_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id,branch_id,worker_id),
  foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete cascade,
  foreign key (business_id,worker_id) references public.dabbir_workers(business_id,id) on delete cascade
);
alter table public.dabbir_worker_branches enable row level security;
drop policy if exists dabbir_worker_branches_select on public.dabbir_worker_branches;
create policy dabbir_worker_branches_select on public.dabbir_worker_branches for select to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id));

create table if not exists public.dabbir_branch_inventory (
  business_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  quantity integer not null default 0 check(quantity>=0),
  reserved integer not null default 0 check(reserved>=0 and reserved<=quantity),
  updated_at timestamptz not null default now(),
  primary key (business_id,branch_id,product_id),
  foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete cascade,
  foreign key (business_id,product_id) references public.dabbir_products(business_id,id) on delete cascade
);
alter table public.dabbir_branch_inventory enable row level security;
drop policy if exists dabbir_branch_inventory_select on public.dabbir_branch_inventory;
create policy dabbir_branch_inventory_select on public.dabbir_branch_inventory for select to authenticated
using (dabbir_private.branch_access_allowed(business_id,branch_id));

create or replace function dabbir_private.primary_branch_for_business(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path='pg_catalog','public'
as $$
  select id
  from public.dabbir_business_branches
  where business_id=p_business_id and is_primary=true and status='active'
  order by created_at,id
  limit 1
$$;
revoke all on function dabbir_private.primary_branch_for_business(uuid) from public,anon,authenticated;
grant execute on function dabbir_private.primary_branch_for_business(uuid) to service_role;

insert into public.dabbir_branch_services(business_id,branch_id,service_id,active)
select s.business_id,dabbir_private.primary_branch_for_business(s.business_id),s.id,s.active
from public.dabbir_services s
where dabbir_private.primary_branch_for_business(s.business_id) is not null
on conflict do nothing;

insert into public.dabbir_branch_products(business_id,branch_id,product_id,active)
select p.business_id,dabbir_private.primary_branch_for_business(p.business_id),p.id,p.active
from public.dabbir_products p
where dabbir_private.primary_branch_for_business(p.business_id) is not null
on conflict do nothing;

insert into public.dabbir_worker_branches(business_id,branch_id,worker_id,active)
select w.business_id,dabbir_private.primary_branch_for_business(w.business_id),w.id,(w.status='active')
from public.dabbir_workers w
where dabbir_private.primary_branch_for_business(w.business_id) is not null
on conflict do nothing;

insert into public.dabbir_branch_inventory(business_id,branch_id,product_id,quantity,reserved,updated_at)
select i.business_id,dabbir_private.primary_branch_for_business(i.business_id),i.product_id,i.quantity,i.reserved,i.updated_at
from public.dabbir_inventory i
where dabbir_private.primary_branch_for_business(i.business_id) is not null
on conflict (business_id,branch_id,product_id) do nothing;

alter table public.dabbir_appointments add column if not exists branch_id uuid;
alter table public.dabbir_orders add column if not exists branch_id uuid;
alter table public.dabbir_inventory_movements add column if not exists branch_id uuid;
alter table public.dabbir_conversations add column if not exists branch_id uuid;

update public.dabbir_appointments set branch_id=dabbir_private.primary_branch_for_business(business_id) where branch_id is null;
update public.dabbir_orders set branch_id=dabbir_private.primary_branch_for_business(business_id) where branch_id is null;
update public.dabbir_inventory_movements set branch_id=dabbir_private.primary_branch_for_business(business_id) where branch_id is null;
update public.dabbir_conversations set branch_id=dabbir_private.primary_branch_for_business(business_id) where branch_id is null;

do $$
begin
  if exists(select 1 from public.dabbir_appointments where branch_id is null)
     or exists(select 1 from public.dabbir_orders where branch_id is null)
     or exists(select 1 from public.dabbir_inventory_movements where branch_id is null)
     or exists(select 1 from public.dabbir_conversations where branch_id is null) then
    raise exception 'DABBIR_BRANCH_BACKFILL_INCOMPLETE';
  end if;
end
$$;

alter table public.dabbir_appointments alter column branch_id set not null;
alter table public.dabbir_orders alter column branch_id set not null;
alter table public.dabbir_inventory_movements alter column branch_id set not null;
alter table public.dabbir_conversations alter column branch_id set not null;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.dabbir_appointments'::regclass and conname='dabbir_appointments_branch_business_fk') then
    alter table public.dabbir_appointments add constraint dabbir_appointments_branch_business_fk foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.dabbir_orders'::regclass and conname='dabbir_orders_branch_business_fk') then
    alter table public.dabbir_orders add constraint dabbir_orders_branch_business_fk foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.dabbir_inventory_movements'::regclass and conname='dabbir_inventory_movements_branch_business_fk') then
    alter table public.dabbir_inventory_movements add constraint dabbir_inventory_movements_branch_business_fk foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.dabbir_conversations'::regclass and conname='dabbir_conversations_branch_business_fk') then
    alter table public.dabbir_conversations add constraint dabbir_conversations_branch_business_fk foreign key (branch_id,business_id) references public.dabbir_business_branches(id,business_id) on delete restrict;
  end if;
end
$$;

create index if not exists dabbir_appointments_business_branch_start_idx on public.dabbir_appointments(business_id,branch_id,starts_at);
create index if not exists dabbir_orders_business_branch_created_idx on public.dabbir_orders(business_id,branch_id,created_at desc);
create index if not exists dabbir_inventory_movements_business_branch_product_idx on public.dabbir_inventory_movements(business_id,branch_id,product_id,created_at desc);
create index if not exists dabbir_conversations_business_branch_updated_idx on public.dabbir_conversations(business_id,branch_id,updated_at desc);
create index if not exists dabbir_appointments_branch_business_fk_idx on public.dabbir_appointments(branch_id,business_id);
create index if not exists dabbir_orders_branch_business_fk_idx on public.dabbir_orders(branch_id,business_id);
create index if not exists dabbir_inventory_movements_branch_business_fk_idx on public.dabbir_inventory_movements(branch_id,business_id);
create index if not exists dabbir_conversations_branch_business_fk_idx on public.dabbir_conversations(branch_id,business_id);
create index if not exists dabbir_membership_branches_branch_business_idx on public.dabbir_membership_branches(branch_id,business_id);
create index if not exists dabbir_branch_services_branch_business_idx on public.dabbir_branch_services(branch_id,business_id);
create index if not exists dabbir_branch_services_business_service_idx on public.dabbir_branch_services(business_id,service_id);
create index if not exists dabbir_branch_products_branch_business_idx on public.dabbir_branch_products(branch_id,business_id);
create index if not exists dabbir_branch_products_business_product_idx on public.dabbir_branch_products(business_id,product_id);
create index if not exists dabbir_worker_branches_branch_business_idx on public.dabbir_worker_branches(branch_id,business_id);
create index if not exists dabbir_worker_branches_business_worker_idx on public.dabbir_worker_branches(business_id,worker_id);
create index if not exists dabbir_branch_inventory_branch_business_idx on public.dabbir_branch_inventory(branch_id,business_id);
create index if not exists dabbir_branch_inventory_business_product_idx on public.dabbir_branch_inventory(business_id,product_id);

create or replace function dabbir_private.ensure_operational_branch()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
begin
  if tg_op='INSERT' or new.business_id is distinct from old.business_id or new.branch_id is distinct from old.branch_id then
    if new.branch_id is null then new.branch_id:=dabbir_private.primary_branch_for_business(new.business_id); end if;
    if new.branch_id is null or not exists(
      select 1 from public.dabbir_business_branches b
      where b.id=new.branch_id and b.business_id=new.business_id and b.status='active'
    ) then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'; end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.ensure_operational_branch() from public,anon,authenticated;

drop trigger if exists dabbir_appointments_branch_guard on public.dabbir_appointments;
create trigger dabbir_appointments_branch_guard before insert or update of business_id,branch_id on public.dabbir_appointments for each row execute function dabbir_private.ensure_operational_branch();
drop trigger if exists dabbir_orders_branch_guard on public.dabbir_orders;
create trigger dabbir_orders_branch_guard before insert or update of business_id,branch_id on public.dabbir_orders for each row execute function dabbir_private.ensure_operational_branch();
drop trigger if exists dabbir_inventory_movements_branch_guard on public.dabbir_inventory_movements;
create trigger dabbir_inventory_movements_branch_guard before insert or update of business_id,branch_id on public.dabbir_inventory_movements for each row execute function dabbir_private.ensure_operational_branch();
drop trigger if exists dabbir_conversations_branch_guard on public.dabbir_conversations;
create trigger dabbir_conversations_branch_guard before insert or update of business_id,branch_id on public.dabbir_conversations for each row execute function dabbir_private.ensure_operational_branch();

create or replace function dabbir_private.validate_appointment_branch_resources()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
begin
  if new.service_id is not null and not exists(
    select 1 from public.dabbir_branch_services x where x.business_id=new.business_id and x.branch_id=new.branch_id and x.service_id=new.service_id and x.active=true
  ) then raise exception 'DABBIR_SERVICE_NOT_AVAILABLE_IN_BRANCH'; end if;
  if new.worker_id is not null and not exists(
    select 1 from public.dabbir_worker_branches x where x.business_id=new.business_id and x.branch_id=new.branch_id and x.worker_id=new.worker_id and x.active=true
  ) then raise exception 'DABBIR_WORKER_NOT_ASSIGNED_TO_BRANCH'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.validate_appointment_branch_resources() from public,anon,authenticated;
drop trigger if exists dabbir_appointments_branch_resource_guard on public.dabbir_appointments;
create trigger dabbir_appointments_branch_resource_guard before insert or update of business_id,branch_id,service_id,worker_id on public.dabbir_appointments for each row execute function dabbir_private.validate_appointment_branch_resources();

create or replace function dabbir_private.validate_order_item_branch_product()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare v_branch uuid; v_business uuid;
begin
  select business_id,branch_id into v_business,v_branch from public.dabbir_orders where id=new.order_id;
  if v_business is null or v_business<>new.business_id then raise exception 'DABBIR_ORDER_BUSINESS_MISMATCH'; end if;
  if not exists(
    select 1 from public.dabbir_branch_products x where x.business_id=new.business_id and x.branch_id=v_branch and x.product_id=new.product_id and x.active=true
  ) then raise exception 'DABBIR_PRODUCT_NOT_AVAILABLE_IN_BRANCH'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.validate_order_item_branch_product() from public,anon,authenticated;
drop trigger if exists dabbir_order_items_branch_product_guard on public.dabbir_order_items;
create trigger dabbir_order_items_branch_product_guard before insert or update of business_id,order_id,product_id on public.dabbir_order_items for each row execute function dabbir_private.validate_order_item_branch_product();

create or replace function dabbir_private.seed_primary_branch_resource()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_branch uuid;
begin
  v_branch:=dabbir_private.primary_branch_for_business(new.business_id);
  if v_branch is null then return new; end if;
  if tg_table_name='dabbir_services' then
    insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(new.business_id,v_branch,new.id,new.active) on conflict do nothing;
  elsif tg_table_name='dabbir_products' then
    insert into public.dabbir_branch_products(business_id,branch_id,product_id,active) values(new.business_id,v_branch,new.id,new.active) on conflict do nothing;
  elsif tg_table_name='dabbir_workers' then
    insert into public.dabbir_worker_branches(business_id,branch_id,worker_id,active) values(new.business_id,v_branch,new.id,new.status='active') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.seed_primary_branch_resource() from public,anon,authenticated;
drop trigger if exists dabbir_services_primary_branch_seed on public.dabbir_services;
create trigger dabbir_services_primary_branch_seed after insert on public.dabbir_services for each row execute function dabbir_private.seed_primary_branch_resource();
drop trigger if exists dabbir_products_primary_branch_seed on public.dabbir_products;
create trigger dabbir_products_primary_branch_seed after insert on public.dabbir_products for each row execute function dabbir_private.seed_primary_branch_resource();
drop trigger if exists dabbir_workers_primary_branch_seed on public.dabbir_workers;
create trigger dabbir_workers_primary_branch_seed after insert on public.dabbir_workers for each row execute function dabbir_private.seed_primary_branch_resource();

-- Replace broad mutation policies with operation-specific policies so SELECT has one permissive path.
drop policy if exists dabbir_membership_branches_manage on public.dabbir_membership_branches;
drop policy if exists dabbir_membership_branches_insert on public.dabbir_membership_branches;
drop policy if exists dabbir_membership_branches_update on public.dabbir_membership_branches;
drop policy if exists dabbir_membership_branches_delete on public.dabbir_membership_branches;
create policy dabbir_membership_branches_insert on public.dabbir_membership_branches for insert to authenticated with check (dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_membership_branches_update on public.dabbir_membership_branches for update to authenticated using (dabbir_private.has_permission(business_id,'manage_team')) with check (dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_membership_branches_delete on public.dabbir_membership_branches for delete to authenticated using (dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_branch_services_manage on public.dabbir_branch_services;
drop policy if exists dabbir_branch_services_insert on public.dabbir_branch_services;
drop policy if exists dabbir_branch_services_update on public.dabbir_branch_services;
drop policy if exists dabbir_branch_services_delete on public.dabbir_branch_services;
create policy dabbir_branch_services_insert on public.dabbir_branch_services for insert to authenticated with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_branch_services_update on public.dabbir_branch_services for update to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services')) with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));
create policy dabbir_branch_services_delete on public.dabbir_branch_services for delete to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_services'));

drop policy if exists dabbir_branch_products_manage on public.dabbir_branch_products;
drop policy if exists dabbir_branch_products_insert on public.dabbir_branch_products;
drop policy if exists dabbir_branch_products_update on public.dabbir_branch_products;
drop policy if exists dabbir_branch_products_delete on public.dabbir_branch_products;
create policy dabbir_branch_products_insert on public.dabbir_branch_products for insert to authenticated with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_products_update on public.dabbir_branch_products for update to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations')) with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_products_delete on public.dabbir_branch_products for delete to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));

drop policy if exists dabbir_worker_branches_manage on public.dabbir_worker_branches;
drop policy if exists dabbir_worker_branches_insert on public.dabbir_worker_branches;
drop policy if exists dabbir_worker_branches_update on public.dabbir_worker_branches;
drop policy if exists dabbir_worker_branches_delete on public.dabbir_worker_branches;
create policy dabbir_worker_branches_insert on public.dabbir_worker_branches for insert to authenticated with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_worker_branches_update on public.dabbir_worker_branches for update to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team')) with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));
create policy dabbir_worker_branches_delete on public.dabbir_worker_branches for delete to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_team'));

drop policy if exists dabbir_branch_inventory_manage on public.dabbir_branch_inventory;
drop policy if exists dabbir_branch_inventory_insert on public.dabbir_branch_inventory;
drop policy if exists dabbir_branch_inventory_update on public.dabbir_branch_inventory;
drop policy if exists dabbir_branch_inventory_delete on public.dabbir_branch_inventory;
create policy dabbir_branch_inventory_insert on public.dabbir_branch_inventory for insert to authenticated with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_inventory_update on public.dabbir_branch_inventory for update to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations')) with check (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));
create policy dabbir_branch_inventory_delete on public.dabbir_branch_inventory for delete to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id) and dabbir_private.has_permission(business_id,'manage_store_operations'));

-- RESTRICTIVE policies AND with existing business-level permission policies.
drop policy if exists dabbir_appointments_branch_restrict on public.dabbir_appointments;
create policy dabbir_appointments_branch_restrict on public.dabbir_appointments as restrictive for all to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id)) with check (dabbir_private.branch_access_allowed(business_id,branch_id));
drop policy if exists dabbir_orders_branch_restrict on public.dabbir_orders;
create policy dabbir_orders_branch_restrict on public.dabbir_orders as restrictive for all to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id)) with check (dabbir_private.branch_access_allowed(business_id,branch_id));
drop policy if exists dabbir_conversations_branch_restrict on public.dabbir_conversations;
create policy dabbir_conversations_branch_restrict on public.dabbir_conversations as restrictive for all to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id)) with check (dabbir_private.branch_access_allowed(business_id,branch_id));
drop policy if exists dabbir_inventory_movements_branch_restrict on public.dabbir_inventory_movements;
create policy dabbir_inventory_movements_branch_restrict on public.dabbir_inventory_movements as restrictive for all to authenticated using (dabbir_private.branch_access_allowed(business_id,branch_id)) with check (dabbir_private.branch_access_allowed(business_id,branch_id));
