-- Root repair for WhatsApp text service-menu choice state.
-- A text menu must be a durable, provider-verified ordered choice set just like slots.
-- Also clear stale handoff pending state when an authorized owner returns a conversation to AI.

alter table public.dabbir_ai_conversation_state
  drop constraint if exists dabbir_ai_conversation_state_action_check;

alter table public.dabbir_ai_conversation_state
  add constraint dabbir_ai_conversation_state_action_check
  check (pending_action in (
    'none','service_selected','choose_service','choose_slot','confirm_booking',
    'choose_appointment','reschedule_slot','handoff'
  ));

create or replace function public.dabbir_whatsapp_ai_set_state(
  p_business_id uuid,
  p_conversation_id uuid,
  p_pending_action text,
  p_payload jsonb,
  p_ttl_seconds integer default 900
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_action text:=lower(trim(coalesce(p_pending_action,'none')));
  v_exp timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not exists(
    select 1 from public.dabbir_conversations c
    where c.id=p_conversation_id and c.business_id=p_business_id
  ) then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_action not in (
    'none','service_selected','choose_service','choose_slot','confirm_booking',
    'choose_appointment','reschedule_slot','handoff'
  ) then raise exception 'AI_PENDING_ACTION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' or octet_length(coalesce(p_payload,'{}'::jsonb)::text)>8192 then
    raise exception 'AI_PENDING_PAYLOAD_INVALID';
  end if;
  v_exp:=case when v_action='none' then null else now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_ttl_seconds,900)))) end;
  insert into public.dabbir_ai_conversation_state(business_id,conversation_id,pending_action,payload,expires_at,updated_at)
  values(p_business_id,p_conversation_id,v_action,coalesce(p_payload,'{}'::jsonb),v_exp,now())
  on conflict (business_id,conversation_id) do update
    set pending_action=excluded.pending_action,payload=excluded.payload,expires_at=excluded.expires_at,updated_at=now();
  return jsonb_build_object('pending_action',v_action,'expires_at',v_exp);
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) to service_role;

create or replace function public.dabbir_return_conversation_to_ai(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='public','pg_temp' as $$
declare v_now timestamptz:=now();v_role text;v_handoff public.dabbir_handoffs%rowtype;v_reason text;v_hash text;v_bounds jsonb;v_human_reply_exists boolean:=false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  select m.role into v_role from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active' limit 1;
  select h.* into v_handoff from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.updated_at desc limit 1 for update;
  if found and v_role='owner' and v_handoff.route_class='OWNER_DECISION' and coalesce(v_handoff.priority,100)<=40 then
    v_reason:=lower(trim(coalesce(v_handoff.reason,'')));
    select exists(select 1 from public.dabbir_messages msg where msg.business_id=p_business_id and msg.conversation_id=p_conversation_id and msg.sender_type='human' and msg.created_at>=coalesce(v_handoff.human_active_at,v_handoff.assigned_at,v_handoff.created_at)) into v_human_reply_exists;
    if not v_human_reply_exists and length(v_reason) between 3 and 120 and not dabbir_private.dabbir_owner_memory_sensitive_action(v_reason) then
      v_hash:=encode(extensions.digest(v_reason,'sha256'),'hex');
      v_bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason_hash',v_hash,'max_priority',40);
      perform dabbir_private.dabbir_record_owner_decision(p_business_id,'handoff.owner_decision.continue_ai','behavior','continue_with_ai','LOW',v_bounds,'return_to_ai',v_handoff.id);
    end if;
  end if;
  update public.dabbir_handoffs set state='RETURNED_TO_AI',returned_to_ai_at=v_now,updated_at=v_now where business_id=p_business_id and conversation_id=p_conversation_id and state in('QUEUED','ASSIGNED','HUMAN_ACTIVE');
  update public.dabbir_ai_conversation_state
     set pending_action='none',payload='{}'::jsonb,expires_at=null,updated_at=v_now
   where business_id=p_business_id and conversation_id=p_conversation_id and pending_action='handoff';
  update public.dabbir_conversations set state='waiting_customer',updated_at=v_now where id=p_conversation_id and business_id=p_business_id;
  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'state','waiting_customer');
end;$$;

revoke all on function public.dabbir_return_conversation_to_ai(uuid,uuid) from public,anon;
grant execute on function public.dabbir_return_conversation_to_ai(uuid,uuid) to authenticated;

-- Repair only provably stale handoff pending rows. No active handoff or human-owned
-- conversation is touched, so this cannot return a live human conversation to AI.
update public.dabbir_ai_conversation_state s
   set pending_action='none',payload='{}'::jsonb,expires_at=null,updated_at=now()
 where s.pending_action='handoff'
   and not exists(
     select 1 from public.dabbir_handoffs h
      where h.business_id=s.business_id and h.conversation_id=s.conversation_id
        and h.state in('QUEUED','ASSIGNED','HUMAN_ACTIVE')
   )
   and exists(
     select 1 from public.dabbir_conversations c
      where c.business_id=s.business_id and c.id=s.conversation_id
        and c.state not in('human_active','action_required','closed')
   );
