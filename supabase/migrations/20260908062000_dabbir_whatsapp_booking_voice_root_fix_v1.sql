begin;

create or replace function public.dabbir_whatsapp_ai_release_stale_provider_handoff(
  p_business_id uuid,
  p_conversation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $$
declare
  v_released integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  update public.dabbir_handoffs h
     set state='RETURNED_TO_AI',updated_at=now()
   where h.business_id=p_business_id
     and h.conversation_id=p_conversation_id
     and h.state='QUEUED'
     and h.reason='AI provider chain unavailable; immediate continuity handoff'
     and h.created_at<=now()-interval '5 minutes';
  get diagnostics v_released=row_count;

  if v_released>0 and not exists(
    select 1 from public.dabbir_handoffs h
     where h.business_id=p_business_id and h.conversation_id=p_conversation_id
       and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then
    update public.dabbir_conversations c
       set state='ai_active',updated_at=now()
     where c.business_id=p_business_id and c.id=p_conversation_id
       and c.state='action_required';
  end if;

  return jsonb_build_object('released',v_released);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_release_stale_provider_handoff(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_release_stale_provider_handoff(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_ai_claim_dispatch(p_dispatch_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $$
declare v_batch public.dabbir_message_batches%rowtype;v_lock uuid;v_conversation_state text;v_due timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_dispatch_token is null then return jsonb_build_object('state','STALE_TOKEN'); end if;
  select * into v_batch from public.dabbir_message_batches where dispatch_token=p_dispatch_token limit 1 for update;
  if not found then return jsonb_build_object('state','STALE_TOKEN'); end if;
  if v_batch.state in ('PROCESSED','CANCELLED','DEAD','HUMAN_REQUIRED') then return jsonb_build_object('state',v_batch.state,'batch_id',v_batch.id); end if;
  perform public.dabbir_whatsapp_ai_release_stale_provider_handoff(v_batch.business_id,v_batch.conversation_id);
  select c.state into v_conversation_state from public.dabbir_conversations c where c.id=v_batch.conversation_id and c.business_id=v_batch.business_id;
  if v_conversation_state='human_active' then update public.dabbir_message_batches set state='HUMAN_REQUIRED',lock_token=null,locked_until=null,last_error='HUMAN_TAKEOVER_ACTIVE',updated_at=now() where id=v_batch.id; return jsonb_build_object('state','HUMAN_REQUIRED','batch_id',v_batch.id); end if;
  if v_batch.state='PROCESSING' and coalesce(v_batch.locked_until,now()+interval '1 minute')>now() then return jsonb_build_object('state','BUSY','batch_id',v_batch.id);
  elsif v_batch.state='PROCESSING' then update public.dabbir_message_batches set state='RETRY',lock_token=null,locked_until=null,next_attempt_at=now(),last_error='STALE_PROCESSING_LOCK_RECOVERED',updated_at=now() where id=v_batch.id; select * into v_batch from public.dabbir_message_batches where id=v_batch.id; end if;
  v_due:=greatest(v_batch.ready_at,coalesce(v_batch.next_attempt_at,v_batch.ready_at));
  if v_due>now() then return jsonb_build_object('state','WAIT','batch_id',v_batch.id,'ready_at',v_due); end if;
  if v_batch.state not in ('OPEN','READY','RETRY') then return jsonb_build_object('state','BUSY','batch_id',v_batch.id); end if;
  v_lock:=gen_random_uuid();
  update public.dabbir_message_batches set state='PROCESSING',processing_started_at=now(),attempt_count=attempt_count+1,lock_token=v_lock,locked_until=now()+interval '60 seconds',next_attempt_at=null,last_error=null,updated_at=now() where id=v_batch.id;
  return jsonb_build_object('state','CLAIMED','batch_id',v_batch.id,'lock_token',v_lock,'attempt_count',v_batch.attempt_count+1);
end;
$$;

create or replace function public.dabbir_whatsapp_ai_claim_next()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $$
declare v_batch public.dabbir_message_batches%rowtype;v_lock uuid;v_conversation_state text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches b where b.channel_type='whatsapp' and (((b.state in ('OPEN','READY','RETRY')) and greatest(b.ready_at,coalesce(b.next_attempt_at,b.ready_at))<=now()) or (b.state='PROCESSING' and coalesce(b.locked_until,'epoch'::timestamptz)<=now())) order by case when b.state='PROCESSING' then 0 else 1 end,b.ready_at asc for update skip locked limit 1;
  if not found then return jsonb_build_object('state','EMPTY'); end if;
  perform public.dabbir_whatsapp_ai_release_stale_provider_handoff(v_batch.business_id,v_batch.conversation_id);
  select c.state into v_conversation_state from public.dabbir_conversations c where c.id=v_batch.conversation_id and c.business_id=v_batch.business_id;
  if v_conversation_state='human_active' then update public.dabbir_message_batches set state='HUMAN_REQUIRED',lock_token=null,locked_until=null,last_error='HUMAN_TAKEOVER_ACTIVE',updated_at=now() where id=v_batch.id; return jsonb_build_object('state','HUMAN_REQUIRED','batch_id',v_batch.id); end if;
  v_lock:=gen_random_uuid();
  update public.dabbir_message_batches set state='PROCESSING',processing_started_at=now(),attempt_count=attempt_count+1,lock_token=v_lock,locked_until=now()+interval '60 seconds',next_attempt_at=null,last_error=case when v_batch.state='PROCESSING' then 'STALE_PROCESSING_LOCK_RECOVERED' else null end,updated_at=now() where id=v_batch.id;
  return jsonb_build_object('state','CLAIMED','batch_id',v_batch.id,'lock_token',v_lock,'attempt_count',v_batch.attempt_count+1,'recovery',true);
end;
$$;

-- Repair only stale automated provider-failover handoffs. Never touch manual/assigned/active human handoffs.
update public.dabbir_handoffs h
   set state='RETURNED_TO_AI',updated_at=now()
 where h.state='QUEUED'
   and h.reason='AI provider chain unavailable; immediate continuity handoff'
   and h.created_at<=now()-interval '5 minutes';

update public.dabbir_conversations c
   set state='ai_active',updated_at=now()
 where c.state='action_required'
   and not exists(
     select 1 from public.dabbir_handoffs h
      where h.business_id=c.business_id and h.conversation_id=c.id
        and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
   );

commit;
