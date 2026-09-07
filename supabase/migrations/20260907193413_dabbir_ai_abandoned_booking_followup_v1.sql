-- DABBIR AI Operator v1: detect abandoned WhatsApp booking attempts and create INTERNAL follow-up candidates only.
-- External messaging remains blocked unless the existing consent/channel/quiet-hours policy engine later approves it.

create unique index if not exists dabbir_followups_ai_abandoned_qualified_uq
on public.dabbir_followups (
  business_id,
  conversation_id,
  ((metadata->>'source_qualified_event_id'))
)
where reason='AI_BOOKING_ABANDONED'
  and metadata ? 'source_qualified_event_id';

create or replace function public.dabbir_capture_abandoned_booking_followups_v1(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_created integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,25),100));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  with latest_qualified as (
    select distinct on (e.business_id,e.conversation_id)
      e.id as qualified_event_id,
      e.business_id,
      e.conversation_id,
      e.customer_id,
      e.occurred_at as qualified_at,
      greatest(0.75::numeric,least(0.99::numeric,coalesce((e.metadata->>'confidence')::numeric,0.80::numeric))) as confidence,
      nullif(left(coalesce(e.metadata->>'reason_code',''),120),'') as reason_code
    from public.dabbir_ai_booking_funnel_events e
    join public.dabbir_conversations c
      on c.business_id=e.business_id and c.id=e.conversation_id
    join public.dabbir_action_policies p
      on p.business_id=e.business_id
     and p.action_key='followup.capture_internal'
     and p.active=true
     and p.auto_execute=true
     and p.risk_class='LOW'
     and coalesce((p.metadata->>'external_side_effects')::boolean,false)=false
    where e.stage='QUALIFIED'
      and e.occurred_at<=now()-interval '15 minutes'
      and e.occurred_at>=now()-interval '7 days'
      and c.channel_type='whatsapp'
      and c.state in ('ai_active','waiting_customer')
    order by e.business_id,e.conversation_id,e.occurred_at desc,e.created_at desc
  ), eligible as (
    select q.*
    from latest_qualified q
    where not exists (
      select 1
      from public.dabbir_ai_booking_funnel_events later
      where later.business_id=q.business_id
        and later.conversation_id=q.conversation_id
        and later.occurred_at>=q.qualified_at
        and later.stage in ('BOOKED','CONFIRMED','RESCHEDULED','ARRIVED','IN_SERVICE','COMPLETED','PAYMENT_RECORDED','CANCELLED','NO_SHOW','REFUNDED')
    )
    and not exists (
      select 1
      from public.dabbir_messages m
      where m.business_id=q.business_id
        and m.conversation_id=q.conversation_id
        and m.sender_type='customer'
        and m.created_at>q.qualified_at
    )
    and not exists (
      select 1
      from public.dabbir_handoffs h
      where h.business_id=q.business_id
        and h.conversation_id=q.conversation_id
        and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
    )
    and not exists (
      select 1
      from public.dabbir_followups f
      where f.business_id=q.business_id
        and f.conversation_id=q.conversation_id
        and f.status in ('CANDIDATE','POLICY_CHECKED','READY','SCHEDULED','SENT')
    )
    order by q.qualified_at asc
    limit v_limit
  )
  insert into public.dabbir_followups(
    business_id,conversation_id,customer_id,channel_type,reason,status,confidence,due_at,
    recommended_message,policy_state,consent_state,channel_policy_state,quiet_hours_state,
    send_count,max_sends,metadata
  )
  select
    e.business_id,e.conversation_id,e.customer_id,'whatsapp','AI_BOOKING_ABANDONED','CANDIDATE',e.confidence,now(),
    null,'NOT_CHECKED','UNKNOWN','UNKNOWN','UNKNOWN',0,2,
    jsonb_build_object(
      'source','dabbir_ai_abandoned_booking_recovery_v1',
      'source_qualified_event_id',e.qualified_event_id::text,
      'qualified_at',e.qualified_at,
      'reason_code',e.reason_code,
      'external_side_effects',false,
      'automatic_external_send',false,
      'policy_evaluation_required',true
    )
  from eligible e
  on conflict do nothing;

  get diagnostics v_created=row_count;
  return v_created;
end;
$$;

revoke all on function public.dabbir_capture_abandoned_booking_followups_v1(integer) from public,anon,authenticated;
grant execute on function public.dabbir_capture_abandoned_booking_followups_v1(integer) to service_role;