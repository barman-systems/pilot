-- Extend the platform-owner action bridge with non-financial service/support actions.
-- All writes remain service-role only and each successful mutation appends to the owner audit ledger in the same transaction.

create or replace function public.dabbir_platform_owner_action_v1(
  p_business_id uuid,
  p_action text,
  p_entity_id uuid,
  p_reason text,
  p_confirmation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $$
declare
  v_before jsonb; v_after jsonb; v_qty integer; v_active boolean; v_status text;
  v_customer_no text; v_target uuid; v_case_id uuid; v_note_id uuid;
  v_category text; v_priority text; v_subject text; v_note text;
begin
  if p_confirmation <> 'EXECUTE' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'REASON_REQUIRED'; end if;
  if p_action not in ('set_inventory','set_product_active','cancel_pending_order','set_service_active','support_create_case','support_add_note','support_set_status') then raise exception 'ACTION_NOT_ALLOWED'; end if;

  if p_action='set_inventory' then
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    if not (p_payload ? 'quantity') or (p_payload->>'quantity') !~ '^[0-9]+$' then raise exception 'INVALID_QUANTITY'; end if;
    v_qty:=(p_payload->>'quantity')::integer; if v_qty<0 or v_qty>1000000 then raise exception 'INVALID_QUANTITY'; end if;
    select jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'reserved',i.reserved) into v_before from public.dabbir_inventory i where i.business_id=p_business_id and i.product_id=p_entity_id for update;
    if v_before is null then raise exception 'INVENTORY_NOT_FOUND'; end if;
    update public.dabbir_inventory set quantity=v_qty,updated_at=now() where business_id=p_business_id and product_id=p_entity_id;
    select jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'reserved',i.reserved) into v_after from public.dabbir_inventory i where i.business_id=p_business_id and i.product_id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'product',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);

  elsif p_action='set_product_active' then
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    if not (p_payload ? 'active') then raise exception 'ACTIVE_REQUIRED'; end if;
    v_active:=(p_payload->>'active')::boolean;
    select jsonb_build_object('id',p.id,'active',p.active,'name',p.name) into v_before from public.dabbir_products p where p.business_id=p_business_id and p.id=p_entity_id for update;
    if v_before is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    update public.dabbir_products set active=v_active where business_id=p_business_id and id=p_entity_id;
    select jsonb_build_object('id',p.id,'active',p.active,'name',p.name) into v_after from public.dabbir_products p where p.business_id=p_business_id and p.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'product',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);

  elsif p_action='cancel_pending_order' then
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    select lower(coalesce(o.status,'')),jsonb_build_object('id',o.id,'status',o.status,'total_aed',o.total_aed,'simulated',o.simulated) into v_status,v_before from public.dabbir_orders o where o.business_id=p_business_id and o.id=p_entity_id for update;
    if v_before is null then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_status not in ('draft','reserved') then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
    if coalesce((v_before->>'simulated')::boolean,true) is not false then raise exception 'REAL_ORDER_REQUIRED'; end if;
    update public.dabbir_orders set status='cancelled' where business_id=p_business_id and id=p_entity_id;
    select jsonb_build_object('id',o.id,'status',o.status,'total_aed',o.total_aed,'simulated',o.simulated) into v_after from public.dabbir_orders o where o.business_id=p_business_id and o.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'order',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);

  elsif p_action='set_service_active' then
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    if not (p_payload ? 'active') then raise exception 'ACTIVE_REQUIRED'; end if;
    v_active:=(p_payload->>'active')::boolean;
    select jsonb_build_object('id',s.id,'active',s.active,'name',s.name,'duration_minutes',s.duration_minutes) into v_before from public.dabbir_services s where s.business_id=p_business_id and s.id=p_entity_id for update;
    if v_before is null then raise exception 'SERVICE_NOT_FOUND'; end if;
    update public.dabbir_services set active=v_active where business_id=p_business_id and id=p_entity_id;
    select jsonb_build_object('id',s.id,'active',s.active,'name',s.name,'duration_minutes',s.duration_minutes) into v_after from public.dabbir_services s where s.business_id=p_business_id and s.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'service',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);

  elsif p_action='support_create_case' then
    v_customer_no:=upper(trim(coalesce(p_payload->>'customer_no',''))); v_category:=lower(trim(coalesce(p_payload->>'category','general'))); v_priority:=lower(trim(coalesce(p_payload->>'priority','normal'))); v_subject:=trim(coalesce(p_payload->>'subject','')); v_note:=nullif(trim(coalesce(p_payload->>'initial_note','')),'');
    if v_customer_no !~ '^DAB-[0-9]{6,}$' then raise exception 'INVALID_CUSTOMER_NO'; end if;
    if v_category not in ('general','access','billing','data','recovery','whatsapp','integration','bug','abuse','privacy','other') then raise exception 'INVALID_SUPPORT_CATEGORY'; end if;
    if v_priority not in ('low','normal','high','urgent') then raise exception 'INVALID_SUPPORT_PRIORITY'; end if;
    if char_length(v_subject) not between 3 and 200 then raise exception 'SUPPORT_SUBJECT_REQUIRED'; end if;
    if v_note is not null and char_length(v_note) not between 2 and 4000 then raise exception 'SUPPORT_NOTE_INVALID'; end if;
    select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_customer_no;
    if v_target is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    if not exists(select 1 from public.dabbir_memberships m where m.user_id=v_target and m.business_id=p_business_id) then raise exception 'CUSTOMER_BUSINESS_MISMATCH'; end if;
    insert into dabbir_private.platform_customer_support_cases(target_user_id,customer_no,business_id,category,priority,subject,created_by,assigned_to) values(v_target,v_customer_no,p_business_id,v_category,v_priority,v_subject,null,null) returning id into v_case_id;
    if v_note is not null then insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(v_case_id,null,v_note) returning id into v_note_id; end if;
    v_before:=null; v_after:=jsonb_build_object('case_id',v_case_id,'customer_no',v_customer_no,'category',v_category,'priority',v_priority,'status','open','subject',v_subject,'note_id',v_note_id);
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'support_case',v_case_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after); p_entity_id:=v_case_id;

  elsif p_action='support_add_note' then
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    v_note:=trim(coalesce(p_payload->>'note','')); if char_length(v_note) not between 2 and 4000 then raise exception 'SUPPORT_NOTE_INVALID'; end if;
    select jsonb_build_object('id',c.id,'status',c.status,'customer_no',c.customer_no,'subject',c.subject) into v_before from dabbir_private.platform_customer_support_cases c where c.id=p_entity_id and c.business_id=p_business_id for update;
    if v_before is null then raise exception 'SUPPORT_CASE_NOT_FOUND'; end if;
    insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(p_entity_id,null,v_note) returning id into v_note_id;
    update dabbir_private.platform_customer_support_cases set updated_at=clock_timestamp() where id=p_entity_id;
    v_after:=v_before||jsonb_build_object('note_id',v_note_id,'note_added',true);
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'support_case',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);

  else
    if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
    v_status:=lower(trim(coalesce(p_payload->>'status',''))); if v_status not in ('open','waiting','resolved') then raise exception 'INVALID_SUPPORT_STATUS'; end if;
    select jsonb_build_object('id',c.id,'status',c.status,'customer_no',c.customer_no,'subject',c.subject,'resolved_at',c.resolved_at) into v_before from dabbir_private.platform_customer_support_cases c where c.id=p_entity_id and c.business_id=p_business_id for update;
    if v_before is null then raise exception 'SUPPORT_CASE_NOT_FOUND'; end if;
    update dabbir_private.platform_customer_support_cases set status=v_status,updated_at=clock_timestamp(),resolved_at=case when v_status='resolved' then coalesce(resolved_at,clock_timestamp()) else null end where id=p_entity_id;
    select jsonb_build_object('id',c.id,'status',c.status,'customer_no',c.customer_no,'subject',c.subject,'resolved_at',c.resolved_at) into v_after from dabbir_private.platform_customer_support_cases c where c.id=p_entity_id;
    insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,p_action,'support_case',p_entity_id,trim(p_reason),'VERIFIED_SUCCESS',v_before,v_after);
  end if;
  return jsonb_build_object('ok',true,'action',p_action,'business_id',p_business_id,'entity_id',p_entity_id,'before',v_before,'after',v_after);
end;
$$;

revoke all on function public.dabbir_platform_owner_action_v1(uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_action_v1(uuid,text,uuid,text,text,jsonb) to service_role;
