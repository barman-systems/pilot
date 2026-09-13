-- Postgres now() is fixed at transaction start. Two return-to-AI cycles inside one
-- controlled transaction can therefore share the same handoff/conversation timestamp,
-- making the transition trigger unable to distinguish the handoff returned by the
-- current invocation from an older returned handoff. Use wall-clock time per call.
create or replace function public.dabbir_return_conversation_to_ai(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
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