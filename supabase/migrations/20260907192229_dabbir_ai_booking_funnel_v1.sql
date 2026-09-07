-- DABBIR AI Operator v1: truthful booking/revenue funnel derived only from durable evidence.
-- No outbound message, booking mutation, payment mutation, or autonomy policy is changed here.

create table if not exists public.dabbir_ai_booking_funnel_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null references public.dabbir_conversations(id) on delete cascade,
  customer_id uuid references public.dabbir_customers(id) on delete set null,
  appointment_id uuid references public.dabbir_appointments(id) on delete set null,
  source_kind text not null,
  source_id uuid,
  event_key text not null,
  stage text not null,
  status text,
  value_amount numeric,
  currency_code text,
  verification_class text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dabbir_ai_booking_funnel_source_check check (source_kind in ('decision','action','appointment','payment')),
  constraint dabbir_ai_booking_funnel_stage_check check (stage in ('QUALIFIED','BOOKED','CONFIRMED','RESCHEDULED','ARRIVED','IN_SERVICE','COMPLETED','PAYMENT_RECORDED','REFUNDED','CANCELLED','NO_SHOW')),
  constraint dabbir_ai_booking_funnel_verification_check check (verification_class in ('AI_DECISION','DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')),
  constraint dabbir_ai_booking_funnel_event_key_check check (char_length(event_key) between 8 and 220),
  constraint dabbir_ai_booking_funnel_status_check check (status is null or char_length(status) between 1 and 120),
  constraint dabbir_ai_booking_funnel_value_check check (value_amount is null or value_amount >= 0),
  constraint dabbir_ai_booking_funnel_currency_check check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint dabbir_ai_booking_funnel_business_event_uq unique (business_id,event_key)
);

create index if not exists dabbir_ai_booking_funnel_conversation_time_idx
  on public.dabbir_ai_booking_funnel_events(business_id,conversation_id,occurred_at desc);
create index if not exists dabbir_ai_booking_funnel_appointment_idx
  on public.dabbir_ai_booking_funnel_events(business_id,appointment_id,occurred_at desc)
  where appointment_id is not null;
create index if not exists dabbir_ai_booking_funnel_stage_time_idx
  on public.dabbir_ai_booking_funnel_events(business_id,stage,occurred_at desc);

alter table public.dabbir_ai_booking_funnel_events enable row level security;
revoke all on table public.dabbir_ai_booking_funnel_events from public,anon,authenticated;
grant select on table public.dabbir_ai_booking_funnel_events to authenticated,service_role;
grant insert,update,delete on table public.dabbir_ai_booking_funnel_events to service_role;

drop policy if exists dabbir_ai_booking_funnel_events_member_select on public.dabbir_ai_booking_funnel_events;
create policy dabbir_ai_booking_funnel_events_member_select
on public.dabbir_ai_booking_funnel_events
for select
to authenticated
using (dabbir_private.is_active_member(business_id));

create or replace function dabbir_private.capture_ai_booking_funnel_event(
  p_business_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_appointment_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_event_key text,
  p_stage text,
  p_status text,
  p_value_amount numeric,
  p_currency_code text,
  p_verification_class text,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;v_customer uuid;v_currency text:=nullif(upper(trim(coalesce(p_currency_code,''))),'');
begin
  select c.customer_id into v_customer
  from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id;
  if not found then return null; end if;
  if p_customer_id is not null and v_customer is distinct from p_customer_id then return null; end if;
  if p_appointment_id is not null and not exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=p_business_id and a.id=p_appointment_id
      and (v_customer is null or a.customer_id=v_customer)
  ) then return null; end if;

  insert into public.dabbir_ai_booking_funnel_events(
    business_id,conversation_id,customer_id,appointment_id,source_kind,source_id,event_key,
    stage,status,value_amount,currency_code,verification_class,metadata,occurred_at
  ) values(
    p_business_id,p_conversation_id,coalesce(p_customer_id,v_customer),p_appointment_id,
    left(coalesce(p_source_kind,''),40),p_source_id,left(coalesce(p_event_key,''),220),
    left(coalesce(p_stage,''),40),nullif(left(coalesce(p_status,''),120),''),
    case when p_value_amount is null then null else greatest(0,p_value_amount) end,
    v_currency,left(coalesce(p_verification_class,''),40),coalesce(p_metadata,'{}'::jsonb),coalesce(p_occurred_at,now())
  )
  on conflict(business_id,event_key) do update set
    status=excluded.status,
    value_amount=coalesce(excluded.value_amount,public.dabbir_ai_booking_funnel_events.value_amount),
    currency_code=coalesce(excluded.currency_code,public.dabbir_ai_booking_funnel_events.currency_code),
    verification_class=excluded.verification_class,
    metadata=public.dabbir_ai_booking_funnel_events.metadata||excluded.metadata,
    occurred_at=greatest(public.dabbir_ai_booking_funnel_events.occurred_at,excluded.occurred_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function dabbir_private.capture_ai_booking_funnel_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.capture_ai_booking_funnel_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,text,text,jsonb,timestamptz) to service_role;

create or replace function dabbir_private.ai_booking_funnel_decision_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_customer uuid;v_intent text;
begin
  if new.stage<>'DECIDE' then return new; end if;
  v_intent:=upper(coalesce(new.metadata->>'intent',''));
  if new.action<>'CHECK_AVAILABILITY' and v_intent<>'BOOKING' then return new; end if;
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

drop trigger if exists dabbir_ai_booking_funnel_decision_event on public.dabbir_ai_operator_events;
create trigger dabbir_ai_booking_funnel_decision_event
after insert on public.dabbir_ai_operator_events
for each row execute function dabbir_private.ai_booking_funnel_decision_trigger();

create or replace function dabbir_private.ai_booking_funnel_action_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_customer uuid;v_stage text;v_status text;v_amount numeric;v_currency text;
begin
  if new.operation_type not in ('booking.create','booking.cancel','booking.reschedule') then return new; end if;
  select c.customer_id into v_customer from public.dabbir_conversations c
   where c.business_id=new.business_id and c.id=new.conversation_id;
  v_status:=coalesce(new.result->>'status','');
  if new.operation_type='booking.create' then
    v_stage:=case when v_status='confirmed' then 'CONFIRMED' else 'BOOKED' end;
    begin v_amount:=(new.result->>'price')::numeric; exception when others then v_amount:=null; end;
    v_currency:=upper(nullif(new.result->>'currency_code',''));
  elsif new.operation_type='booking.reschedule' then
    v_stage:='RESCHEDULED';
  else
    v_stage:='CANCELLED';
  end if;
  perform dabbir_private.capture_ai_booking_funnel_event(
    new.business_id,new.conversation_id,v_customer,new.entity_id,'action',new.id,
    'funnel:action:'||new.id::text||':'||lower(v_stage),v_stage,v_status,v_amount,v_currency,'DATABASE_COMMIT',
    jsonb_build_object('operation_type',new.operation_type,'verified',coalesce((new.result->>'verified')::boolean,false)),
    new.created_at
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_booking_funnel_action_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_booking_funnel_action_event on public.dabbir_ai_action_ledger;
create trigger dabbir_ai_booking_funnel_action_event
after insert on public.dabbir_ai_action_ledger
for each row execute function dabbir_private.ai_booking_funnel_action_trigger();

create or replace function dabbir_private.ai_booking_funnel_appointment_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_conversation uuid;v_customer uuid;v_stage text;v_amount numeric;v_currency text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.payment_status is not distinct from old.payment_status then return new; end if;
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
  if v_stage is not null and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform dabbir_private.capture_ai_booking_funnel_event(
      new.business_id,v_conversation,v_customer,new.id,'appointment',new.id,
      'funnel:appointment:'||new.id::text||':status:'||lower(new.status),v_stage,new.status,v_amount,v_currency,'DATABASE_COMMIT',
      jsonb_build_object('confirmation_gate',new.confirmation_gate,'payment_status',new.payment_status),coalesce(new.updated_at,now())
    );
  end if;
  if new.payment_status='paid' and (tg_op='INSERT' or old.payment_status is distinct from new.payment_status) then
    perform dabbir_private.capture_ai_booking_funnel_event(
      new.business_id,v_conversation,v_customer,new.id,'appointment',new.id,
      'funnel:appointment:'||new.id::text||':payment:paid','PAYMENT_RECORDED','paid',v_amount,v_currency,'DATABASE_COMMIT',
      jsonb_build_object('payment_source','appointment.payment_status'),coalesce(new.updated_at,now())
    );
  elsif new.payment_status='refunded' and (tg_op='INSERT' or old.payment_status is distinct from new.payment_status) then
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
after insert or update of status,payment_status on public.dabbir_appointments
for each row execute function dabbir_private.ai_booking_funnel_appointment_trigger();

create or replace function dabbir_private.ai_booking_funnel_payment_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_conversation uuid;v_customer uuid;v_stage text;v_amount numeric;v_currency text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status not in ('paid','refunded') or new.appointment_id is null then return new; end if;
  select l.conversation_id into v_conversation
  from public.dabbir_ai_action_ledger l
  where l.business_id=new.business_id and l.entity_id=new.appointment_id and l.operation_type='booking.create'
  order by l.created_at asc limit 1;
  if v_conversation is null then return new; end if;
  select a.customer_id into v_customer from public.dabbir_appointments a
   where a.business_id=new.business_id and a.id=new.appointment_id;
  v_stage:=case when new.status='paid' then 'PAYMENT_RECORDED' else 'REFUNDED' end;
  v_amount:=coalesce(new.amount,new.amount_aed,0);
  v_currency:=upper(coalesce(nullif(new.currency_code,''),'AED'));
  perform dabbir_private.capture_ai_booking_funnel_event(
    new.business_id,v_conversation,v_customer,new.appointment_id,'payment',new.id,
    'funnel:payment:'||new.id::text||':'||lower(new.status),v_stage,new.status,v_amount,v_currency,'DATABASE_COMMIT',
    jsonb_build_object('method',new.method,'has_reference',nullif(trim(coalesce(new.reference,'')),'') is not null),
    case when tg_op='INSERT' then coalesce(new.created_at,now()) else now() end
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_booking_funnel_payment_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_booking_funnel_payment_event on public.dabbir_operational_payments;
create trigger dabbir_ai_booking_funnel_payment_event
after insert or update of status on public.dabbir_operational_payments
for each row execute function dabbir_private.ai_booking_funnel_payment_trigger();

create or replace view public.dabbir_ai_booking_funnel_current_v1
with (security_invoker=true)
as
select
  e.business_id,
  e.conversation_id,
  (array_agg(e.customer_id order by e.occurred_at desc,e.created_at desc) filter(where e.customer_id is not null))[1] as customer_id,
  (array_agg(e.appointment_id order by e.occurred_at desc,e.created_at desc) filter(where e.appointment_id is not null))[1] as appointment_id,
  (array_agg(e.stage order by e.occurred_at desc,e.created_at desc))[1] as latest_stage,
  max(e.occurred_at) as last_event_at,
  min(e.occurred_at) filter(where e.stage='QUALIFIED') as qualified_at,
  min(e.occurred_at) filter(where e.stage in ('BOOKED','CONFIRMED')) as booked_at,
  min(e.occurred_at) filter(where e.stage='CONFIRMED') as confirmed_at,
  min(e.occurred_at) filter(where e.stage='COMPLETED') as completed_at,
  min(e.occurred_at) filter(where e.stage='PAYMENT_RECORDED') as paid_recorded_at,
  bool_or(e.stage in ('BOOKED','CONFIRMED','RESCHEDULED','ARRIVED','IN_SERVICE','COMPLETED','PAYMENT_RECORDED')) as converted_to_booking,
  bool_or(e.stage='COMPLETED') as completed_in_system,
  bool_or(e.stage='PAYMENT_RECORDED') as payment_recorded,
  bool_or(e.stage in ('CANCELLED','NO_SHOW')) as has_loss_event,
  max(e.value_amount) filter(where e.stage in ('BOOKED','CONFIRMED','COMPLETED','PAYMENT_RECORDED')) as attributed_value_amount,
  (array_agg(e.currency_code order by e.occurred_at desc,e.created_at desc) filter(where e.currency_code is not null))[1] as currency_code
from public.dabbir_ai_booking_funnel_events e
group by e.business_id,e.conversation_id;

revoke all on public.dabbir_ai_booking_funnel_current_v1 from public,anon;
grant select on public.dabbir_ai_booking_funnel_current_v1 to authenticated,service_role;

-- Backfill only actions already proven to have been executed by the WhatsApp AI action ledger.
insert into public.dabbir_ai_booking_funnel_events(
  business_id,conversation_id,customer_id,appointment_id,source_kind,source_id,event_key,stage,status,value_amount,currency_code,verification_class,metadata,occurred_at
)
select
  l.business_id,l.conversation_id,c.customer_id,l.entity_id,'action',l.id,
  'funnel:action:'||l.id::text||':'||lower(case
    when l.operation_type='booking.create' and coalesce(l.result->>'status','')='confirmed' then 'CONFIRMED'
    when l.operation_type='booking.create' then 'BOOKED'
    when l.operation_type='booking.reschedule' then 'RESCHEDULED'
    else 'CANCELLED' end),
  case
    when l.operation_type='booking.create' and coalesce(l.result->>'status','')='confirmed' then 'CONFIRMED'
    when l.operation_type='booking.create' then 'BOOKED'
    when l.operation_type='booking.reschedule' then 'RESCHEDULED'
    else 'CANCELLED' end,
  l.result->>'status',
  case when l.operation_type='booking.create' and (l.result->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then (l.result->>'price')::numeric else null end,
  case when coalesce(l.result->>'currency_code','') ~ '^[A-Z]{3}$' then l.result->>'currency_code' else null end,
  'DATABASE_COMMIT',jsonb_build_object('operation_type',l.operation_type,'backfill',true),l.created_at
from public.dabbir_ai_action_ledger l
join public.dabbir_conversations c on c.business_id=l.business_id and c.id=l.conversation_id
where l.operation_type in ('booking.create','booking.cancel','booking.reschedule')
on conflict(business_id,event_key) do nothing;