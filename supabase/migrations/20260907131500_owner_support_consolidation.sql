-- Consolidate the customer support hub merged from main into the existing owner workspace.
-- No table or data removal. Use the same scoped case list for both administrative entrypoints.
CREATE OR REPLACE FUNCTION public.dabbir_platform_support_list_v2(p_actor uuid, p_customer_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_result jsonb; v_global boolean;
begin
  if not dabbir_private.platform_effective_capability(p_actor,'support.view') then raise exception 'DABBIR_SUPPORT_CAPABILITY_REQUIRED'; end if;
  v_global:=dabbir_private.platform_scope_is_global(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'target_user_id',c.target_user_id,'customer_no',c.customer_no,'business_id',c.business_id,
    'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,
    'diagnostic',c.diagnostic,'resolution',c.resolution,'sla_due_at',c.sla_due_at,
    'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,
    'customer_visible',c.customer_visible,'reference',c.public_reference,'channel',c.channel,'origin',c.origin,
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'author_kind',m.author_kind,'body',m.body,'created_at',m.created_at) order by m.created_at) from dabbir_private.platform_customer_support_messages m where m.case_id=c.id),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'actor_user_id',n.actor_user_id,'note',n.note,'created_at',n.created_at) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb)
  ) order by c.updated_at desc),'[]'::jsonb)
  into v_result
  from dabbir_private.platform_customer_support_cases c
  where (p_customer_no is null or c.customer_no=upper(trim(p_customer_no)))
    and (v_global or (c.business_id is not null and dabbir_private.platform_scope_allows_business(p_actor,c.business_id)));
  return v_result;
end;
$function$;
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
  if not dabbir_private.platform_effective_capability(p_actor_user_id,'support.reply') then raise exception 'DABBIR_SUPPORT_CAPABILITY_REQUIRED'; end if;
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

  if not dabbir_private.platform_scope_is_global(p_actor_user_id) then
    perform dabbir_private.platform_assert_business_scope(p_actor_user_id,v_business);
  end if;

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

create or replace function public.dabbir_platform_support_summary(p_actor_user_id uuid,p_customer_no text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private'
as $$
declare v_target uuid; v_no text:=upper(trim(coalesce(p_customer_no,''))); v_cases jsonb; v_global boolean; v_timeline jsonb;
begin
 if not dabbir_private.platform_effective_capability(p_actor_user_id,'support.view') then raise exception 'DABBIR_SUPPORT_CAPABILITY_REQUIRED'; end if;
 select user_id into v_target from public.dabbir_user_accounts where customer_no=v_no;
 if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
 v_global:=dabbir_private.platform_scope_is_global(p_actor_user_id);
 if not v_global and not exists(select 1 from public.dabbir_memberships m where m.user_id=v_target and m.status='active' and dabbir_private.platform_scope_allows_business(p_actor_user_id,m.business_id)) then raise exception 'DABBIR_CUSTOMER_OUTSIDE_SCOPE'; end if;
 v_cases:=public.dabbir_platform_support_list_v2(p_actor_user_id,v_no);
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_timeline from (
  select jsonb_build_object('action',a.action,'business_id',a.target_business_id,'details',a.details,'created_at',a.created_at) item,a.created_at
  from dabbir_private.platform_customer_admin_audit a where a.target_user_id=v_target and a.action<>'customer_search'
   and (v_global or a.actor_user_id=p_actor_user_id or dabbir_private.platform_scope_allows_business(p_actor_user_id,a.target_business_id))
  order by a.created_at desc limit 25
 ) x;
 return jsonb_build_object('customer_no',v_no,'user_id',v_target,'cases',v_cases,'timeline',v_timeline,'metrics',(
  select jsonb_build_object('open',count(*) filter(where c->>'status'='open'),'waiting',count(*) filter(where c->>'status'='waiting'),'resolved',count(*) filter(where c->>'status'='resolved'),'total',count(*)) from jsonb_array_elements(v_cases) c
 ));
end;
$$;
revoke all on function public.dabbir_platform_support_list_v2(uuid,text),public.dabbir_platform_support_summary(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_support_list_v2(uuid,text),public.dabbir_platform_support_summary(uuid,text) to service_role;
