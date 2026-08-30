create table if not exists public.dabbir_platform_owner_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  reason text not null check (char_length(reason) between 8 and 500),
  outcome text not null check (outcome in ('VERIFIED_SUCCESS','FAILED')),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  source text not null default 'platform_owner_action_bridge_v1',
  created_at timestamptz not null default now()
);
alter table public.dabbir_platform_owner_audit enable row level security;
alter table public.dabbir_platform_owner_audit force row level security;
revoke all on public.dabbir_platform_owner_audit from public, anon, authenticated;
create index if not exists dabbir_platform_owner_audit_business_created_idx on public.dabbir_platform_owner_audit(business_id, created_at desc);

create or replace function public.dabbir_platform_owner_action_v1(p_business_id uuid,p_action text,p_entity_id uuid,p_reason text,p_confirmation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before jsonb; v_after jsonb; v_qty integer; v_active boolean; v_status text;
begin
  if p_confirmation <> 'EXECUTE' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'REASON_REQUIRED'; end if;
  if p_action not in ('set_inventory','set_product_active','cancel_pending_order') then raise exception 'ACTION_NOT_ALLOWED'; end if;
  if p_action='set_inventory' then
    if not (p_payload?'quantity') or (p_payload->>'quantity') !~ '^[0-9]+$' then raise exception 'INVALID_QUANTITY'; end if;
    v_qty=(p_payload->>'quantity')::integer; if v_qty<0 or v_qty>1000000 then raise exception 'INVALID_QUANTITY'; end if;
    select jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'reserved',i.reserved) into v_before from public.dabbir_inventory i where i.business_id=p_business_id and i.product_id=p_entity_id for update;
    if v_before is null then raise exception 'INVENTORY_NOT_FOUND'; end if;
    update public.dabbir_inventory set quantity=v_qty,updated_at=now() where business_id=p_business_id and product_id=p_entity_id;
    select jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'reserved',i.reserved) into v_after from public.dabbir_inventory i where i.business_id=p_business_id and i.product_id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'product',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);
  elsif p_action='set_product_active' then
    if not (p_payload?'active') then raise exception 'ACTIVE_REQUIRED'; end if; v_active=(p_payload->>'active')::boolean;
    select jsonb_build_object('id',p.id,'active',p.active,'name',p.name) into v_before from public.dabbir_products p where p.business_id=p_business_id and p.id=p_entity_id for update;
    if v_before is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    update public.dabbir_products set active=v_active where business_id=p_business_id and id=p_entity_id;
    select jsonb_build_object('id',p.id,'active',p.active,'name',p.name) into v_after from public.dabbir_products p where p.business_id=p_business_id and p.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'product',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);
  else
    select lower(coalesce(o.status,'')),jsonb_build_object('id',o.id,'status',o.status,'total_aed',o.total_aed,'simulated',o.simulated) into v_status,v_before from public.dabbir_orders o where o.business_id=p_business_id and o.id=p_entity_id for update;
    if v_before is null then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_status not in ('draft','reserved') then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
    if coalesce((v_before->>'simulated')::boolean,true) is not false then raise exception 'REAL_ORDER_REQUIRED'; end if;
    update public.dabbir_orders set status='cancelled' where business_id=p_business_id and id=p_entity_id;
    select jsonb_build_object('id',o.id,'status',o.status,'total_aed',o.total_aed,'simulated',o.simulated) into v_after from public.dabbir_orders o where o.business_id=p_business_id and o.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'order',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);
  end if;
  return jsonb_build_object('ok',true,'action',p_action,'business_id',p_business_id,'entity_id',p_entity_id,'before',v_before,'after',v_after);
end; $$;
revoke all on function public.dabbir_platform_owner_action_v1(uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_action_v1(uuid,text,uuid,text,text,jsonb) to service_role;
