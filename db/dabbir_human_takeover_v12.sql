-- DABBIR human takeover v12
-- Correct conversation ownership flow:
-- customer -> DABBIR AI by default -> explicit human takeover -> human replies -> return to AI.

alter table public.dabbir_messages
  add column if not exists sender_user_id uuid null references auth.users(id) on delete set null;

create index if not exists dabbir_messages_sender_user_idx
  on public.dabbir_messages(business_id, sender_user_id, created_at desc)
  where sender_user_id is not null;

create or replace function public.dabbir_takeover_conversation(
  p_business_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_customer_id uuid;
  v_handoff_id uuid;
  v_role text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;

  select c.customer_id
    into v_customer_id
  from public.dabbir_conversations c
  where c.id=p_conversation_id and c.business_id=p_business_id and c.channel_type in ('web','whatsapp','instagram')
  for update;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;

  select m.role into v_role
  from public.dabbir_memberships m
  where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active'
  limit 1;

  select h.id into v_handoff_id
  from public.dabbir_handoffs h
  where h.business_id=p_business_id
    and h.conversation_id=p_conversation_id
    and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  order by h.updated_at desc
  limit 1
  for update;

  if v_handoff_id is null then
    insert into public.dabbir_handoffs(
      business_id,conversation_id,customer_id,route_class,reason,state,priority,routing_strategy,
      assigned_user_id,assigned_role,summary,assigned_at,human_active_at,updated_at
    ) values (
      p_business_id,p_conversation_id,v_customer_id,'SUPPORT','manual_takeover','HUMAN_ACTIVE',70,'priority',
      auth.uid(),v_role,'Manual human takeover from DABBIR operations console.',v_now,v_now,v_now
    ) returning id into v_handoff_id;
  else
    update public.dabbir_handoffs
    set state='HUMAN_ACTIVE',
        assigned_user_id=auth.uid(),
        assigned_role=v_role,
        assigned_at=coalesce(assigned_at,v_now),
        human_active_at=v_now,
        returned_to_ai_at=null,
        updated_at=v_now
    where id=v_handoff_id;
  end if;

  update public.dabbir_conversations
  set state='human_active',updated_at=v_now
  where id=p_conversation_id and business_id=p_business_id;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',p_conversation_id,
    'state','human_active',
    'handoff_id',v_handoff_id,
    'assigned_user_id',auth.uid(),
    'assigned_role',v_role
  );
end;
$$;

create or replace function public.dabbir_return_conversation_to_ai(
  p_business_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;

  if not exists(
    select 1 from public.dabbir_conversations c
    where c.id=p_conversation_id and c.business_id=p_business_id
  ) then raise exception 'CONVERSATION_NOT_FOUND'; end if;

  update public.dabbir_handoffs
  set state='RETURNED_TO_AI',returned_to_ai_at=v_now,updated_at=v_now
  where business_id=p_business_id
    and conversation_id=p_conversation_id
    and state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE');

  update public.dabbir_conversations
  set state='waiting_customer',updated_at=v_now
  where id=p_conversation_id and business_id=p_business_id;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',p_conversation_id,
    'state','waiting_customer'
  );
end;
$$;

create or replace function public.dabbir_send_human_message(
  p_business_id uuid,
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_message_id uuid;
  v_body text := left(trim(coalesce(p_body,'')),2000);
  v_created_at timestamptz;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if v_body='' then raise exception 'MESSAGE_REQUIRED'; end if;

  if not exists(
    select 1
    from public.dabbir_conversations c
    where c.id=p_conversation_id
      and c.business_id=p_business_id
      and c.state='human_active'
  ) then raise exception 'HUMAN_TAKEOVER_REQUIRED'; end if;

  if not exists(
    select 1
    from public.dabbir_handoffs h
    where h.business_id=p_business_id
      and h.conversation_id=p_conversation_id
      and h.state='HUMAN_ACTIVE'
      and h.assigned_user_id=auth.uid()
  ) then raise exception 'CONVERSATION_NOT_ASSIGNED_TO_USER'; end if;

  insert into public.dabbir_messages(
    business_id,conversation_id,sender_type,sender_user_id,body,intent,simulated
  ) values (
    p_business_id,p_conversation_id,'human',auth.uid(),v_body,'HUMAN_REPLY',false
  ) returning id,created_at into v_message_id,v_created_at;

  update public.dabbir_conversations
  set state='human_active',updated_at=v_now
  where id=p_conversation_id and business_id=p_business_id;

  update public.dabbir_handoffs
  set updated_at=v_now
  where business_id=p_business_id
    and conversation_id=p_conversation_id
    and state='HUMAN_ACTIVE'
    and assigned_user_id=auth.uid();

  return jsonb_build_object(
    'ok',true,
    'message',jsonb_build_object(
      'id',v_message_id,
      'conversation_id',p_conversation_id,
      'sender_type','human',
      'sender_user_id',auth.uid(),
      'body',v_body,
      'intent','HUMAN_REPLY',
      'simulated',false,
      'created_at',v_created_at
    ),
    'state','human_active'
  );
end;
$$;

revoke all on function public.dabbir_takeover_conversation(uuid,uuid) from public,anon;
revoke all on function public.dabbir_return_conversation_to_ai(uuid,uuid) from public,anon;
revoke all on function public.dabbir_send_human_message(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_takeover_conversation(uuid,uuid) to authenticated;
grant execute on function public.dabbir_return_conversation_to_ai(uuid,uuid) to authenticated;
grant execute on function public.dabbir_send_human_message(uuid,uuid,text) to authenticated;
