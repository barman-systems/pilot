-- Tighten v1 funnel capture before runtime use: only successful-action candidates qualify,
-- and appointment lifecycle capture runs on UPDATE where OLD is always defined.

create or replace function dabbir_private.ai_booking_funnel_decision_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_customer uuid;
begin
  if new.stage<>'DECIDE' or new.action not in ('CHECK_AVAILABILITY','CREATE_BOOKING') then return new; end if;
  select c.customer_id into v_customer from public.dabbir_conversations c
   where c.business_id=new.business_id and c.id=new.conversation_id;
  perform dabbir_private.capture_ai_booking_funnel_event(
    new.business_id,new.conversation_id,v_customer,null,'decision',new.id,
    'funnel:decision:'||new.id::text||':qualified','QUALIFIED',new.status,null,null,'AI_DECISION',
    jsonb_build_object('action',new.action,'confidence',new.confidence,'risk_level',new.risk_level,'reason_code',new.metadata->>'reason_code'),
    new.occurred_at
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_booking_funnel_decision_trigger() from public,anon,authenticated;

create or replace function dabbir_private.ai_booking_funnel_appointment_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_conversation uuid;v_customer uuid;v_stage text;v_amount numeric;v_currency text;
begin
  if new.status is not distinct from old.status and new.payment_status is not distinct from old.payment_status then return new; end if;
  select l.conversation_id into v_conversation
  from public.dabbir_ai_action_ledger l
  where l.business_id=new.business_id and l.entity_id=new.id and l.operation_type='booking.create'
  order by l.created_at asc limit 1;
  if v_conversation is null then return new; end if;
  v_customer:=new.customer_id;
  v_amount:=coalesce(new.quoted_price_amount,new.quoted_price_aed,0)-coalesce(new.discount_amount,new.discount_aed,0)+coalesce(new.visit_fee_amount,new.visit_fee_aed,0);
  v_currency:=upper(coalesce(nullif(new.currency_code,''),'AED'));

  v_stage:=case new.status
    when 'confirmed' then 'CONFIRMED'
    when 'rescheduled' then 'RESCHEDULED'
    when 'arrived' then 'ARRIVED'
    when 'in_progress' then 'IN_SERVICE'
    when 'completed' then 'COMPLETED'
    when 'cancelled' then 'CANCELLED'
    when 'no_show' then 'NO_SHOW'
    else null end;
  if v_stage is not null and old.status is distinct from new.status then
    perform dabbir_private.capture_ai_booking_funnel_event(
      new.business_id,v_conversation,v_customer,new.id,'appointment',new.id,
      'funnel:appointment:'||new.id::text||':status:'||lower(new.status),v_stage,new.status,v_amount,v_currency,'DATABASE_COMMIT',
      jsonb_build_object('confirmation_gate',new.confirmation_gate,'payment_status',new.payment_status),coalesce(new.updated_at,now())
    );
  end if;
  if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then
    perform dabbir_private.capture_ai_booking_funnel_event(
      new.business_id,v_conversation,v_customer,new.id,'appointment',new.id,
      'funnel:appointment:'||new.id::text||':payment:paid','PAYMENT_RECORDED','paid',v_amount,v_currency,'DATABASE_COMMIT',
      jsonb_build_object('payment_source','appointment.payment_status'),coalesce(new.updated_at,now())
    );
  elsif new.payment_status='refunded' and old.payment_status is distinct from new.payment_status then
    perform dabbir_private.capture_ai_booking_funnel_event(
      new.business_id,v_conversation,v_customer,new.id,'appointment',new.id,
      'funnel:appointment:'||new.id::text||':payment:refunded','REFUNDED','refunded',v_amount,v_currency,'DATABASE_COMMIT',
      jsonb_build_object('payment_source','appointment.payment_status'),coalesce(new.updated_at,now())
    );
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.ai_booking_funnel_appointment_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_booking_funnel_appointment_event on public.dabbir_appointments;
create trigger dabbir_ai_booking_funnel_appointment_event
after update of status,payment_status on public.dabbir_appointments
for each row execute function dabbir_private.ai_booking_funnel_appointment_trigger();