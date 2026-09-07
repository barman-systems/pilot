-- DABBIR AI Operator v1: privacy-safe decision/action/verification/outcome ledger.
-- Applied to Production as migration 20260907190420 before this source-sync commit.
-- This migration is additive and does not change existing WhatsApp execution semantics.

create table if not exists public.dabbir_ai_operator_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null references public.dabbir_conversations(id) on delete cascade,
  batch_id uuid references public.dabbir_message_batches(id) on delete set null,
  source_kind text not null,
  source_id uuid,
  event_key text not null,
  stage text not null,
  event_type text not null,
  status text not null,
  action text,
  risk_level text,
  confidence numeric(5,4),
  entity_id uuid,
  provider_reference text,
  provider_verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dabbir_ai_operator_events_event_key_len check (char_length(event_key) between 8 and 220),
  constraint dabbir_ai_operator_events_source_kind_check check (source_kind in ('batch','decision','action','outbound','handoff','appointment')),
  constraint dabbir_ai_operator_events_stage_check check (stage in ('UNDERSTAND','DECIDE','ACT','VERIFY','HANDOFF','OUTCOME')),
  constraint dabbir_ai_operator_events_event_type_len check (char_length(event_type) between 2 and 120),
  constraint dabbir_ai_operator_events_status_len check (char_length(status) between 1 and 120),
  constraint dabbir_ai_operator_events_action_len check (action is null or char_length(action) between 1 and 120),
  constraint dabbir_ai_operator_events_risk_check check (risk_level is null or risk_level in ('LOW','MEDIUM','HIGH')),
  constraint dabbir_ai_operator_events_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint dabbir_ai_operator_events_provider_ref_len check (provider_reference is null or char_length(provider_reference) <= 320),
  constraint dabbir_ai_operator_events_business_event_uq unique (business_id,event_key)
);

create index if not exists dabbir_ai_operator_events_conversation_time_idx
  on public.dabbir_ai_operator_events(business_id,conversation_id,occurred_at desc);
create index if not exists dabbir_ai_operator_events_batch_idx
  on public.dabbir_ai_operator_events(batch_id) where batch_id is not null;
create index if not exists dabbir_ai_operator_events_stage_time_idx
  on public.dabbir_ai_operator_events(business_id,stage,occurred_at desc);

alter table public.dabbir_ai_operator_events enable row level security;
revoke all on table public.dabbir_ai_operator_events from public,anon,authenticated;
grant select on table public.dabbir_ai_operator_events to authenticated,service_role;
grant insert,update,delete on table public.dabbir_ai_operator_events to service_role;

drop policy if exists dabbir_ai_operator_events_member_select on public.dabbir_ai_operator_events;
create policy dabbir_ai_operator_events_member_select
on public.dabbir_ai_operator_events
for select
to authenticated
using (dabbir_private.is_active_member(business_id));

create or replace function dabbir_private.capture_ai_operator_event(
  p_business_id uuid,
  p_conversation_id uuid,
  p_batch_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_event_key text,
  p_stage text,
  p_event_type text,
  p_status text,
  p_action text default null,
  p_risk_level text default null,
  p_confidence numeric default null,
  p_entity_id uuid default null,
  p_provider_reference text default null,
  p_provider_verified boolean default false,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if p_business_id is null or p_conversation_id is null then return null; end if;
  if not exists(
    select 1 from public.dabbir_conversations c
    where c.business_id=p_business_id and c.id=p_conversation_id
  ) then return null; end if;

  insert into public.dabbir_ai_operator_events(
    business_id,conversation_id,batch_id,source_kind,source_id,event_key,stage,event_type,status,
    action,risk_level,confidence,entity_id,provider_reference,provider_verified,metadata,occurred_at
  ) values(
    p_business_id,p_conversation_id,p_batch_id,left(coalesce(p_source_kind,''),40),p_source_id,left(coalesce(p_event_key,''),220),
    left(coalesce(p_stage,''),40),left(coalesce(p_event_type,''),120),left(coalesce(p_status,''),120),
    nullif(left(coalesce(p_action,''),120),''),nullif(left(coalesce(p_risk_level,''),20),''),p_confidence,p_entity_id,
    nullif(left(coalesce(p_provider_reference,''),320),''),coalesce(p_provider_verified,false),coalesce(p_metadata,'{}'::jsonb),coalesce(p_occurred_at,now())
  )
  on conflict(business_id,event_key) do update set
    status=excluded.status,
    provider_reference=coalesce(excluded.provider_reference,public.dabbir_ai_operator_events.provider_reference),
    provider_verified=public.dabbir_ai_operator_events.provider_verified or excluded.provider_verified,
    metadata=public.dabbir_ai_operator_events.metadata || excluded.metadata,
    occurred_at=greatest(public.dabbir_ai_operator_events.occurred_at,excluded.occurred_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function dabbir_private.capture_ai_operator_event(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,numeric,uuid,text,boolean,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.capture_ai_operator_event(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,numeric,uuid,text,boolean,jsonb,timestamptz) to service_role;

create or replace function public.dabbir_record_ai_operator_decision_v1(
  p_business_id uuid,
  p_conversation_id uuid,
  p_batch_id uuid,
  p_action text,
  p_intent text,
  p_confidence numeric,
  p_risk_level text,
  p_missing_fields text[] default '{}'::text[],
  p_reason_code text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare v_batch public.dabbir_message_batches%rowtype;v_action text:=upper(trim(coalesce(p_action,'')));v_risk text:=upper(trim(coalesce(p_risk_level,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_action not in ('REPLY','CHECK_AVAILABILITY','CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HANDOFF','SERVICE_MENU','SERVICE_DETAILS','SLOT_RACE') then raise exception 'AI_OPERATOR_ACTION_INVALID'; end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'AI_OPERATOR_CONFIDENCE_INVALID'; end if;
  if v_risk not in ('LOW','MEDIUM','HIGH') then raise exception 'AI_OPERATOR_RISK_INVALID'; end if;
  select * into v_batch from public.dabbir_message_batches b
   where b.id=p_batch_id and b.business_id=p_business_id and b.conversation_id=p_conversation_id;
  if not found then raise exception 'AI_OPERATOR_BATCH_SCOPE_INVALID'; end if;
  return dabbir_private.capture_ai_operator_event(
    p_business_id,p_conversation_id,p_batch_id,'decision',p_batch_id,
    'decision:'||p_batch_id::text||':attempt:'||coalesce(v_batch.attempt_count,0)::text,
    'DECIDE','planner_decision','DECIDED',v_action,v_risk,p_confidence,null,null,false,
    jsonb_build_object(
      'intent',left(trim(coalesce(p_intent,'unknown')),120),
      'missing_fields',coalesce(to_jsonb(p_missing_fields),'[]'::jsonb),
      'reason_code',nullif(left(trim(coalesce(p_reason_code,'')),120),'')
    ),now()
  );
end;
$$;
revoke all on function public.dabbir_record_ai_operator_decision_v1(uuid,uuid,uuid,text,text,numeric,text,text[],text) from public,anon,authenticated;
grant execute on function public.dabbir_record_ai_operator_decision_v1(uuid,uuid,uuid,text,text,numeric,text,text[],text) to service_role;

create or replace function dabbir_private.ai_operator_batch_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_stage text;v_risk text;v_type text;
begin
  if tg_op='UPDATE' and new.state is not distinct from old.state and new.attempt_count is not distinct from old.attempt_count then return new; end if;
  v_stage:=case new.state when 'PROCESSING' then 'UNDERSTAND' when 'RETRY' then 'VERIFY' when 'HUMAN_REQUIRED' then 'HANDOFF' when 'PROCESSED' then 'OUTCOME' when 'DEAD' then 'OUTCOME' when 'CANCELLED' then 'OUTCOME' else 'UNDERSTAND' end;
  v_risk:=case new.state when 'HUMAN_REQUIRED' then 'HIGH' when 'DEAD' then 'HIGH' when 'RETRY' then 'MEDIUM' else 'LOW' end;
  v_type:=case new.state when 'PROCESSING' then 'processing_started' when 'PROCESSED' then 'batch_processed' when 'RETRY' then 'retry_scheduled' when 'HUMAN_REQUIRED' then 'human_required' when 'DEAD' then 'dead_lettered' when 'CANCELLED' then 'batch_cancelled' else 'batch_state' end;
  perform dabbir_private.capture_ai_operator_event(
    new.business_id,new.conversation_id,new.id,'batch',new.id,
    'batch:'||new.id::text||':'||lower(new.state)||':attempt:'||coalesce(new.attempt_count,0)::text,
    v_stage,v_type,new.state,null,v_risk,null,null,null,false,
    jsonb_build_object('attempt_count',coalesce(new.attempt_count,0),'message_count',coalesce(new.message_count,0),'has_error',nullif(trim(coalesce(new.last_error,'')),'') is not null),
    coalesce(new.updated_at,now())
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_operator_batch_event_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_operator_batch_event on public.dabbir_message_batches;
create trigger dabbir_ai_operator_batch_event
after insert or update of state,attempt_count on public.dabbir_message_batches
for each row execute function dabbir_private.ai_operator_batch_event_trigger();

create or replace function dabbir_private.ai_operator_action_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform dabbir_private.capture_ai_operator_event(
    new.business_id,new.conversation_id,null,'action',new.id,
    'action:'||new.id::text||':recorded','ACT','deterministic_action','RECORDED',upper(replace(new.operation_type,'.','_')),'MEDIUM',null,new.entity_id,null,false,
    jsonb_build_object('operation_type',new.operation_type),coalesce(new.created_at,now())
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_operator_action_event_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_operator_action_event on public.dabbir_ai_action_ledger;
create trigger dabbir_ai_operator_action_event
after insert on public.dabbir_ai_action_ledger
for each row execute function dabbir_private.ai_operator_action_event_trigger();

create or replace function dabbir_private.ai_operator_outbound_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_stage text;v_risk text;v_key text;
begin
  if new.sender_type<>'ai' then return new; end if;
  if tg_op='UPDATE' and new.state is not distinct from old.state and new.provider_status is not distinct from old.provider_status and new.provider_verified is not distinct from old.provider_verified then return new; end if;
  v_stage:=case when new.state in ('DELIVERED','READ') then 'VERIFY' when new.state in ('FAILED','AMBIGUOUS') then 'OUTCOME' else 'ACT' end;
  v_risk:=case when new.state in ('FAILED','AMBIGUOUS') then 'HIGH' else 'LOW' end;
  v_key:='outbound:'||new.id::text||':'||lower(new.state)||':'||coalesce(left(new.provider_status,30),'none')||':'||case when new.provider_verified then 'verified' else 'unverified' end;
  perform dabbir_private.capture_ai_operator_event(
    new.business_id,new.conversation_id,null,'outbound',new.id,v_key,v_stage,'whatsapp_outbound',new.state,'SEND_WHATSAPP',v_risk,null,new.message_id,new.provider_message_id,new.provider_verified,
    jsonb_build_object('provider_status',new.provider_status,'error_code',nullif(left(coalesce(new.error_code,''),120),'')),coalesce(new.updated_at,now())
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_operator_outbound_event_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_operator_outbound_event on public.dabbir_whatsapp_outbound_reservations;
create trigger dabbir_ai_operator_outbound_event
after insert or update of state,provider_status,provider_verified on public.dabbir_whatsapp_outbound_reservations
for each row execute function dabbir_private.ai_operator_outbound_event_trigger();

create or replace function dabbir_private.ai_operator_handoff_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='UPDATE' and new.state is not distinct from old.state then return new; end if;
  perform dabbir_private.capture_ai_operator_event(
    new.business_id,new.conversation_id,null,'handoff',new.id,
    'handoff:'||new.id::text||':'||lower(new.state),'HANDOFF','human_handoff',new.state,'HANDOFF','HIGH',null,null,null,false,
    jsonb_build_object('route_class',new.route_class,'assigned_role',new.assigned_role),coalesce(new.updated_at,now())
  );
  if new.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE') then
    insert into public.dabbir_conversation_outcomes(
      business_id,conversation_id,customer_id,outcome,summary,next_action,follow_up_needed,owner_attention_required,verified_external_result,external_reference,evidence
    )
    select new.business_id,new.conversation_id,c.customer_id,'HUMAN_HANDOFF','DABBIR escalated this WhatsApp conversation for human review.','human_review',false,true,false,null,
      jsonb_build_object('handoff_id',new.id,'route_class',new.route_class,'source','ai_operator_event_loop')
    from public.dabbir_conversations c
    where c.business_id=new.business_id and c.id=new.conversation_id
    on conflict(business_id,conversation_id) do update set
      outcome='HUMAN_HANDOFF',summary=excluded.summary,next_action=excluded.next_action,follow_up_needed=false,owner_attention_required=true,
      verified_external_result=false,external_reference=null,evidence=excluded.evidence,updated_at=now();
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.ai_operator_handoff_event_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_operator_handoff_event on public.dabbir_handoffs;
create trigger dabbir_ai_operator_handoff_event
after insert or update of state on public.dabbir_handoffs
for each row execute function dabbir_private.ai_operator_handoff_event_trigger();

create or replace function dabbir_private.ai_operator_appointment_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_conversation_id uuid;v_action text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  select l.conversation_id,upper(replace(l.operation_type,'.','_')) into v_conversation_id,v_action
  from public.dabbir_ai_action_ledger l
  where l.business_id=new.business_id and l.entity_id=new.id
  order by l.created_at desc limit 1;
  if v_conversation_id is null then return new; end if;
  perform dabbir_private.capture_ai_operator_event(
    new.business_id,v_conversation_id,null,'appointment',new.id,
    'appointment:'||new.id::text||':'||lower(new.status),'OUTCOME','booking_lifecycle',new.status,coalesce(v_action,'BOOKING_LIFECYCLE'),
    case when new.status in ('cancelled','no_show') then 'MEDIUM' else 'LOW' end,null,new.id,null,false,
    jsonb_build_object('confirmation_gate',new.confirmation_gate),coalesce(new.updated_at,now())
  );
  return new;
end;
$$;
revoke all on function dabbir_private.ai_operator_appointment_event_trigger() from public,anon,authenticated;

drop trigger if exists dabbir_ai_operator_appointment_event on public.dabbir_appointments;
create trigger dabbir_ai_operator_appointment_event
after update of status on public.dabbir_appointments
for each row execute function dabbir_private.ai_operator_appointment_event_trigger();

create or replace view public.dabbir_ai_operator_conversation_v1
with (security_invoker=true)
as
select
  e.business_id,
  e.conversation_id,
  max(e.occurred_at) as last_event_at,
  count(*) as event_count,
  count(*) filter(where e.stage='DECIDE') as decision_events,
  count(*) filter(where e.stage='ACT') as action_events,
  count(*) filter(where e.stage='VERIFY' and e.provider_verified) as provider_verified_events,
  count(*) filter(where e.stage='HANDOFF') as handoff_events,
  (array_agg(e.stage order by e.occurred_at desc,e.created_at desc))[1] as latest_stage,
  (array_agg(e.status order by e.occurred_at desc,e.created_at desc))[1] as latest_status,
  bool_or(e.risk_level='HIGH') as has_high_risk_event
from public.dabbir_ai_operator_events e
group by e.business_id,e.conversation_id;

revoke all on public.dabbir_ai_operator_conversation_v1 from public,anon;
grant select on public.dabbir_ai_operator_conversation_v1 to authenticated,service_role;

-- Backfill only privacy-safe operational facts from current durable state.
insert into public.dabbir_ai_operator_events(
  business_id,conversation_id,batch_id,source_kind,source_id,event_key,stage,event_type,status,risk_level,metadata,occurred_at
)
select b.business_id,b.conversation_id,b.id,'batch',b.id,
  'batch:'||b.id::text||':'||lower(b.state)||':attempt:'||coalesce(b.attempt_count,0)::text,
  case b.state when 'PROCESSING' then 'UNDERSTAND' when 'RETRY' then 'VERIFY' when 'HUMAN_REQUIRED' then 'HANDOFF' when 'PROCESSED' then 'OUTCOME' when 'DEAD' then 'OUTCOME' when 'CANCELLED' then 'OUTCOME' else 'UNDERSTAND' end,
  'batch_state',b.state,
  case b.state when 'HUMAN_REQUIRED' then 'HIGH' when 'DEAD' then 'HIGH' when 'RETRY' then 'MEDIUM' else 'LOW' end,
  jsonb_build_object('attempt_count',coalesce(b.attempt_count,0),'message_count',coalesce(b.message_count,0),'backfill',true),coalesce(b.updated_at,b.created_at,now())
from public.dabbir_message_batches b
where b.channel_type='whatsapp'
on conflict(business_id,event_key) do nothing;

insert into public.dabbir_ai_operator_events(
  business_id,conversation_id,source_kind,source_id,event_key,stage,event_type,status,action,risk_level,entity_id,metadata,occurred_at
)
select l.business_id,l.conversation_id,'action',l.id,'action:'||l.id::text||':recorded','ACT','deterministic_action','RECORDED',upper(replace(l.operation_type,'.','_')),'MEDIUM',l.entity_id,
  jsonb_build_object('operation_type',l.operation_type,'backfill',true),coalesce(l.created_at,now())
from public.dabbir_ai_action_ledger l
on conflict(business_id,event_key) do nothing;

insert into public.dabbir_ai_operator_events(
  business_id,conversation_id,source_kind,source_id,event_key,stage,event_type,status,action,risk_level,entity_id,provider_reference,provider_verified,metadata,occurred_at
)
select r.business_id,r.conversation_id,'outbound',r.id,
  'outbound:'||r.id::text||':'||lower(r.state)||':'||coalesce(left(r.provider_status,30),'none')||':'||case when r.provider_verified then 'verified' else 'unverified' end,
  case when r.state in ('DELIVERED','READ') then 'VERIFY' when r.state in ('FAILED','AMBIGUOUS') then 'OUTCOME' else 'ACT' end,
  'whatsapp_outbound',r.state,'SEND_WHATSAPP',case when r.state in ('FAILED','AMBIGUOUS') then 'HIGH' else 'LOW' end,r.message_id,r.provider_message_id,r.provider_verified,
  jsonb_build_object('provider_status',r.provider_status,'backfill',true),coalesce(r.updated_at,r.created_at,now())
from public.dabbir_whatsapp_outbound_reservations r
where r.sender_type='ai'
on conflict(business_id,event_key) do nothing;

insert into public.dabbir_ai_operator_events(
  business_id,conversation_id,source_kind,source_id,event_key,stage,event_type,status,action,risk_level,metadata,occurred_at
)
select h.business_id,h.conversation_id,'handoff',h.id,'handoff:'||h.id::text||':'||lower(h.state),'HANDOFF','human_handoff',h.state,'HANDOFF','HIGH',
  jsonb_build_object('route_class',h.route_class,'assigned_role',h.assigned_role,'backfill',true),coalesce(h.updated_at,h.created_at,now())
from public.dabbir_handoffs h
on conflict(business_id,event_key) do nothing;

insert into public.dabbir_conversation_outcomes(
  business_id,conversation_id,customer_id,outcome,summary,next_action,follow_up_needed,owner_attention_required,verified_external_result,external_reference,evidence
)
select distinct on(h.business_id,h.conversation_id)
  h.business_id,h.conversation_id,c.customer_id,'HUMAN_HANDOFF','DABBIR escalated this WhatsApp conversation for human review.','human_review',false,true,false,null,
  jsonb_build_object('handoff_id',h.id,'route_class',h.route_class,'source','ai_operator_event_loop_backfill')
from public.dabbir_handoffs h
join public.dabbir_conversations c on c.business_id=h.business_id and c.id=h.conversation_id
where h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
order by h.business_id,h.conversation_id,h.updated_at desc
on conflict(business_id,conversation_id) do nothing;