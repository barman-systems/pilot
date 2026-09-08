-- Keep the caller's conversation/branch RLS and handoff permissions in force.
-- Privileged state cleanup runs only on the resulting row transition; clients
-- receive no access to the server-owned semantic state or private functions.
create or replace function dabbir_private.conversation_return_to_ai_v3()
returns trigger language plpgsql security definer set search_path='' as $$
declare h public.dabbir_handoffs%rowtype; reason text; bounds jsonb;
begin
  if old.state not in ('human_active','action_required') or new.state<>'waiting_customer' then return new; end if;
  if exists(select 1 from public.dabbir_handoffs x where x.business_id=new.business_id and x.conversation_id=new.id and x.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then return new; end if;
  -- A decision started before human control must not regain authority on return.
  new.understanding_revision:=old.understanding_revision+1;
  update public.dabbir_ai_conversation_state
    set pending_action='none',payload='{}'::jsonb,expires_at=null,updated_at=new.updated_at
    where business_id=new.business_id and conversation_id=new.id and pending_action='handoff';
  -- Preserve the existing explicit-owner, low-risk observation behavior without
  -- granting callers EXECUTE on the private observation implementation.
  if auth.uid() is not null and dabbir_private.is_active_member(new.business_id)
    and exists(select 1 from public.dabbir_memberships m where m.business_id=new.business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then
    select x.* into h from public.dabbir_handoffs x
      where x.business_id=new.business_id and x.conversation_id=new.id and x.state='RETURNED_TO_AI'
        and x.returned_to_ai_at=new.updated_at
      order by x.updated_at desc limit 1;
    if found and h.route_class='OWNER_DECISION' and coalesce(h.priority,100)<=40 then
      reason:=lower(trim(coalesce(h.reason,'')));
      if length(reason) between 3 and 120 and not dabbir_private.dabbir_owner_memory_sensitive_action(reason)
        and not exists(select 1 from public.dabbir_messages m where m.business_id=new.business_id and m.conversation_id=new.id and m.sender_type='human' and m.created_at>=coalesce(h.human_active_at,h.assigned_at,h.created_at)) then
        bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason_hash',encode(extensions.digest(reason,'sha256'),'hex'),'max_priority',40);
        perform dabbir_private.dabbir_record_owner_decision(new.business_id,'handoff.owner_decision.continue_ai','behavior','continue_with_ai','LOW',bounds,'return_to_ai',h.id);
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function dabbir_private.conversation_return_to_ai_v3() from public,anon,authenticated;
create trigger dabbir_conversation_return_to_ai_v3
  before update of state on public.dabbir_conversations
  for each row when (old.state is distinct from new.state)
  execute function dabbir_private.conversation_return_to_ai_v3();

create or replace function public.dabbir_return_conversation_to_ai(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  -- Lock in the same order as the semantic executor: conversation before handoff.
  -- SECURITY INVOKER retains branch RLS as well as tenant membership checks.
  perform 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id for update;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  update public.dabbir_handoffs set state='RETURNED_TO_AI',returned_to_ai_at=v_now,updated_at=v_now
    where business_id=p_business_id and conversation_id=p_conversation_id and state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE');
  update public.dabbir_conversations set state='waiting_customer',updated_at=v_now
    where id=p_conversation_id and business_id=p_business_id;
  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'state','waiting_customer');
end $$;
revoke all on function public.dabbir_return_conversation_to_ai(uuid,uuid) from public,anon;
grant execute on function public.dabbir_return_conversation_to_ai(uuid,uuid) to authenticated;