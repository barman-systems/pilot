-- Restore preceding support function definitions; no data removed.
-- Restores the preceding weaker scope behavior: use only for a demonstrated regression.
CREATE OR REPLACE FUNCTION public.dabbir_platform_support_list_v2(p_actor uuid, p_customer_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_result jsonb; v_global boolean;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_support');
  v_global:=dabbir_private.platform_scope_is_global(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'target_user_id',c.target_user_id,'customer_no',c.customer_no,'business_id',c.business_id,
    'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,
    'diagnostic',c.diagnostic,'resolution',c.resolution,'sla_due_at',c.sla_due_at,
    'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'actor_user_id',n.actor_user_id,'note',n.note,'created_at',n.created_at) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb)
  ) order by c.updated_at desc),'[]'::jsonb)
  into v_result
  from dabbir_private.platform_customer_support_cases c
  where (p_customer_no is null or c.customer_no=upper(trim(p_customer_no)))
    and (v_global or (c.business_id is not null and dabbir_private.platform_scope_allows_business(p_actor,c.business_id)));
  return v_result;
end;
$function$;
-- Preserve the platform delegated-authority boundary introduced on 2026-09-03.
-- Customer 360 staff operations must require manage_support, not merely any platform-admin row.

create or replace function public.dabbir_platform_support_reply_customer(
  p_actor_user_id uuid,
  p_customer_no text,
  p_case_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_no text;
  v_message text;
  v_message_id uuid;
  v_business uuid;
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor_user_id,'manage_support');
  v_no:=upper(trim(coalesce(p_customer_no,'')));
  v_message:=trim(coalesce(p_message,''));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if char_length(v_message) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;

  select c.business_id into v_business
  from dabbir_private.platform_customer_support_cases c
  where c.id=p_case_id and c.customer_visible=true
    and (c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no));
  if not found then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;

  insert into dabbir_private.platform_customer_support_messages(case_id,actor_user_id,author_kind,body)
  values(p_case_id,p_actor_user_id,'support',v_message)
  returning id into v_message_id;

  update dabbir_private.platform_customer_support_cases c
  set status='waiting',updated_at=clock_timestamp(),resolved_at=null,assigned_to=coalesce(c.assigned_to,p_actor_user_id)
  where c.id=p_case_id
  returning jsonb_build_object('id',c.id,'reference',c.public_reference,'status',c.status,'updated_at',c.updated_at) into v_result;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details)
  values(p_actor_user_id,'support_customer_reply',v_target,v_business,jsonb_build_object('case_id',p_case_id,'message_id',v_message_id));

  return v_result||jsonb_build_object('message_id',v_message_id);
end; $$;
revoke all on function public.dabbir_platform_support_reply_customer(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_reply_customer(uuid,text,uuid,text) to service_role;

create or replace function public.dabbir_platform_support_summary(p_actor_user_id uuid, p_customer_no text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_target uuid; v_no text; v_cases jsonb; v_timeline jsonb; v_open int; v_waiting int; v_resolved int;
begin
  perform dabbir_private.platform_assert_permission(p_actor_user_id,'manage_support');
  v_no := upper(trim(coalesce(p_customer_no,'')));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  select count(*) filter (where c.status='open')::int, count(*) filter (where c.status='waiting')::int, count(*) filter (where c.status='resolved')::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'business_id',c.business_id,'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,
      'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,
      'customer_visible',c.customer_visible,'origin',c.origin,'channel',c.channel,'reference',c.public_reference,
      'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at,'actor_user_id',n.actor_user_id) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb),
      'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'author_kind',m.author_kind,'body',m.body,'created_at',m.created_at,'actor_user_id',m.actor_user_id) order by m.created_at) from dabbir_private.platform_customer_support_messages m where m.case_id=c.id),'[]'::jsonb)
    ) order by c.created_at desc),'[]'::jsonb)
  into v_open,v_waiting,v_resolved,v_cases
  from dabbir_private.platform_customer_support_cases c where c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no);
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_timeline from (
    select jsonb_build_object('action',a.action,'business_id',a.target_business_id,'details',a.details,'created_at',a.created_at) item, a.created_at
    from dabbir_private.platform_customer_admin_audit a where a.target_user_id=v_target and a.action <> 'customer_search' order by a.created_at desc limit 25
  ) x;
  return jsonb_build_object('customer_no',v_no,'user_id',v_target,'metrics',jsonb_build_object('open',coalesce(v_open,0),'waiting',coalesce(v_waiting,0),'resolved',coalesce(v_resolved,0),'total',coalesce(v_open,0)+coalesce(v_waiting,0)+coalesce(v_resolved,0)),'cases',v_cases,'timeline',v_timeline);
end; $$;
revoke all on function public.dabbir_platform_support_summary(uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_summary(uuid,text) to service_role;

revoke all on function public.dabbir_platform_support_list_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_support_list_v2(uuid,text) to service_role;
