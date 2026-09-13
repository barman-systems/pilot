-- Understanding V2: reuse conversation state, customer memory and business knowledge.
-- No raw voice, transcripts, prompts, credentials or model-written memories are stored here.
alter table public.dabbir_conversations add column understanding_revision bigint not null default 0;
alter table public.dabbir_messages add column understanding_revision bigint;
alter table public.dabbir_ai_conversation_state
  add column semantic_state jsonb not null default '{}'::jsonb,
  add column semantic_version bigint not null default 0,
  add column semantic_batch_id uuid references public.dabbir_message_batches(id) on delete set null,
  add column semantic_message_revision bigint not null default 0,
  add constraint dabbir_semantic_bounded check (jsonb_typeof(semantic_state)='object' and octet_length(semantic_state::text)<=32768),
  add constraint dabbir_semantic_conversation_scope_fk foreign key(business_id,conversation_id)
    references public.dabbir_conversations(business_id,id) on delete cascade;
alter table public.dabbir_ai_conversation_state force row level security;
create index dabbir_semantic_batch_idx on public.dabbir_ai_conversation_state(semantic_batch_id) where semantic_batch_id is not null;

alter table public.dabbir_customer_memory
  add column status text not null default 'candidate' check(status in ('candidate','verified','revoked')),
  add column version bigint not null default 1,
  add column last_confirmed_at timestamptz,
  add column verified_action_id uuid references public.dabbir_ai_action_ledger(id) on delete set null;
create index dabbir_customer_memory_verified_idx on public.dabbir_customer_memory(business_id,customer_id,memory_key) where status='verified';
create index dabbir_customer_memory_action_idx on public.dabbir_customer_memory(verified_action_id) where verified_action_id is not null;
-- Existing client memory fields remain readable, but verification is server controlled.
revoke insert,update on public.dabbir_customer_memory from authenticated;
grant insert(business_id,customer_id,memory_key,value,source,confidence,last_seen_at,expires_at),
 update(value,last_seen_at,expires_at) on public.dabbir_customer_memory to authenticated;

create table public.dabbir_ai_knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  source_conversation_id uuid,
  source_correction_id uuid references public.dabbir_messages(id) on delete set null,
  entity_type text not null check(entity_type in ('service','worker','branch')),
  alias text not null check(char_length(alias) between 1 and 80 and alias !~ '[[:cntrl:]]'),
  target_id uuid not null,
  status text not null default 'PROPOSED' check(status in ('PROPOSED','OWNER_APPROVED','REJECTED','REVOKED','SUPERSEDED')),
  confidence numeric(5,4) not null default 0.5 check(confidence between 0 and 1),
  impact text not null default 'ENTITY_MAPPING_ONLY' check(impact='ENTITY_MAPPING_ONLY'),
  version bigint not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key(business_id,source_conversation_id) references public.dabbir_conversations(business_id,id) on delete cascade
);
create index dabbir_knowledge_proposal_scope_idx on public.dabbir_ai_knowledge_proposals(business_id,status,created_at desc);
create index dabbir_knowledge_proposal_conversation_idx on public.dabbir_ai_knowledge_proposals(business_id,source_conversation_id);
create index dabbir_knowledge_proposal_source_idx on public.dabbir_ai_knowledge_proposals(source_correction_id);
create index dabbir_knowledge_proposal_creator_idx on public.dabbir_ai_knowledge_proposals(created_by);
create index dabbir_knowledge_proposal_reviewer_idx on public.dabbir_ai_knowledge_proposals(reviewed_by);
create unique index dabbir_knowledge_one_active_alias_idx on public.dabbir_ai_knowledge_proposals(business_id,entity_type,lower(alias)) where status='OWNER_APPROVED';
alter table public.dabbir_ai_knowledge_proposals enable row level security;
alter table public.dabbir_ai_knowledge_proposals force row level security;
revoke all on public.dabbir_ai_knowledge_proposals from public,anon,authenticated;
grant select on public.dabbir_ai_knowledge_proposals to authenticated;
grant select,insert,update,delete on public.dabbir_ai_knowledge_proposals to service_role;
create policy knowledge_proposals_owner_read on public.dabbir_ai_knowledge_proposals for select to authenticated using(
  exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_ai_knowledge_proposals.business_id and m.user_id=(select auth.uid()) and m.role='owner' and m.status='active')
);

create table public.dabbir_ai_understanding_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid,
  batch_id uuid references public.dabbir_message_batches(id) on delete cascade,
  proposal_id uuid references public.dabbir_ai_knowledge_proposals(id) on delete cascade,
  event_type text not null check(event_type in ('UNDERSTOOD','VERIFIED_ACTION','PROPOSED','OWNER_APPROVED','REJECTED','REVOKED','ROLLBACK')),
  version bigint not null,
  actor_id uuid references auth.users(id) on delete set null,
  metrics jsonb not null default '{}'::jsonb check(jsonb_typeof(metrics)='object' and octet_length(metrics::text)<=2048),
  created_at timestamptz not null default now(),
  foreign key(business_id,conversation_id) references public.dabbir_conversations(business_id,id) on delete cascade,
  unique(business_id,batch_id,event_type,version)
);
create index dabbir_understanding_events_scope_idx on public.dabbir_ai_understanding_events(business_id,conversation_id,created_at desc);
create index dabbir_understanding_events_batch_idx on public.dabbir_ai_understanding_events(batch_id);
create index dabbir_understanding_events_proposal_idx on public.dabbir_ai_understanding_events(proposal_id);
create index dabbir_understanding_events_actor_idx on public.dabbir_ai_understanding_events(actor_id);
alter table public.dabbir_ai_understanding_events enable row level security;
alter table public.dabbir_ai_understanding_events force row level security;
revoke all on public.dabbir_ai_understanding_events from public,anon,authenticated;
grant select,insert,delete on public.dabbir_ai_understanding_events to service_role;
grant select on public.dabbir_ai_understanding_events to authenticated;
create policy understanding_events_owner_read on public.dabbir_ai_understanding_events for select to authenticated using(
  exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_ai_understanding_events.business_id and m.user_id=(select auth.uid()) and m.role='owner' and m.status='active')
);

-- Both inbound writes and business mutations serialize on the conversation row.
-- A monotonically increasing revision also handles equal timestamps and backdated messages.
create or replace function dabbir_private.understanding_message_revision_v2() returns trigger
language plpgsql security definer set search_path='pg_catalog','public' as $$
begin
  if new.sender_type='customer' and not new.simulated then
    update public.dabbir_conversations set understanding_revision=understanding_revision+1
      where business_id=new.business_id and id=new.conversation_id
      returning understanding_revision into new.understanding_revision;
    if not found then raise exception 'SEMANTIC_TENANT_SCOPE_INVALID'; end if;
  end if;
  return new;
end $$;
revoke all on function dabbir_private.understanding_message_revision_v2() from public,anon,authenticated;
create trigger dabbir_understanding_message_revision before insert on public.dabbir_messages
for each row execute function dabbir_private.understanding_message_revision_v2();

create or replace function dabbir_private.understanding_assert_batch_v2(p_batch_id uuid,p_lock_token uuid,p_revision bigint default null)
returns public.dabbir_message_batches language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype; r bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into b from public.dabbir_message_batches where id=p_batch_id;
  if not found or b.state<>'PROCESSING' or b.lock_token is distinct from p_lock_token or b.locked_until is null or b.locked_until<=now() then raise exception 'SEMANTIC_BATCH_LOCK_INVALID'; end if;
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id for update;
  if not found or c.customer_id is distinct from b.customer_id or c.branch_id is null or c.demo_mode or c.channel_type<>'whatsapp' then raise exception 'SEMANTIC_TENANT_SCOPE_INVALID'; end if;
  if c.state in ('human_active','action_required','closed') or exists(select 1 from public.dabbir_handoffs h where h.business_id=c.business_id and h.conversation_id=c.id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  if not exists(select 1 from public.dabbir_business_branches br where br.id=c.branch_id and br.business_id=c.business_id and br.status='active') then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  select coalesce(max(m.understanding_revision),0) into r from public.dabbir_message_batch_items i join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id and m.conversation_id=c.id where i.batch_id=b.id;
  if r<>c.understanding_revision or (p_revision is not null and p_revision<>r) or exists(select 1 from public.dabbir_messages m where m.business_id=c.business_id and m.conversation_id=c.id and m.sender_type='customer' and not m.simulated and m.created_at>b.last_message_at) then raise exception 'SEMANTIC_SUPERSEDED'; end if;
  if exists(select 1 from public.dabbir_whatsapp_voice_ingest v where v.business_id=c.business_id and v.conversation_id=c.id and v.state in ('RECEIVED','PROCESSING','RETRY') and v.created_at>=b.first_message_at) then raise exception 'SEMANTIC_VOICE_PENDING'; end if;
  return b;
end $$;
revoke all on function dabbir_private.understanding_assert_batch_v2(uuid,uuid,bigint) from public,anon,authenticated;

create or replace function public.dabbir_semantic_load_v2(p_batch_id uuid,p_lock_token uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype; s public.dabbir_ai_conversation_state%rowtype; memory record;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  -- Only completed, scoped operational history can hydrate structured memory.
  for memory in
    select distinct on (key) key,ref,confirmed_at from (
      select 'last_verified_service'::text key,a.service_id ref,a.starts_at confirmed_at from public.dabbir_appointments a where a.business_id=b.business_id and a.customer_id=b.customer_id and a.branch_id=c.branch_id and a.status='completed' and not a.simulated and a.service_id is not null and a.starts_at>now()-interval '180 days'
      union all
      select 'last_verified_worker',a.worker_id,a.starts_at from public.dabbir_appointments a where a.business_id=b.business_id and a.customer_id=b.customer_id and a.branch_id=c.branch_id and a.status='completed' and not a.simulated and a.worker_id is not null and a.starts_at>now()-interval '180 days'
      union all
      select 'known_vehicle',v.id,r.starts_at from public.dabbir_car_wash_booking_requests r join public.dabbir_car_wash_vehicles v on v.id=r.vehicle_id and v.business_id=r.business_id and v.customer_id=r.customer_id where r.business_id=b.business_id and r.customer_id=b.customer_id and r.status in ('completed','paid') and r.starts_at>now()-interval '180 days'
      union all
      select 'last_verified_location',r.id,r.starts_at from public.dabbir_car_wash_booking_requests r where r.business_id=b.business_id and r.customer_id=b.customer_id and r.status in ('completed','paid') and r.location_lat is not null and r.location_lng is not null and r.starts_at>now()-interval '180 days'
    ) facts order by key,confirmed_at desc
  loop
    insert into public.dabbir_customer_memory(business_id,customer_id,memory_key,value,source,confidence,status,version,last_confirmed_at,expires_at)
      values(b.business_id,b.customer_id,memory.key,jsonb_build_object('id',memory.ref),'DATABASE_FACT',1,'verified',1,memory.confirmed_at,memory.confirmed_at+interval '180 days')
      on conflict(business_id,customer_id,memory_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='verified',version=public.dabbir_customer_memory.version+1,last_confirmed_at=excluded.last_confirmed_at,expires_at=excluded.expires_at
      where public.dabbir_customer_memory.status<>'revoked' and (public.dabbir_customer_memory.last_confirmed_at is null or public.dabbir_customer_memory.last_confirmed_at<excluded.last_confirmed_at);
  end loop;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id;
  return jsonb_build_object('branches',coalesce((select jsonb_agg(jsonb_build_object('id',br.id,'name',br.name)) from public.dabbir_business_branches br where br.business_id=b.business_id and br.status='active'),'[]'),
    'understanding_policy',coalesce((select k.value from public.dabbir_business_knowledge k where k.business_id=b.business_id and k.knowledge_key='semantic_required_fields' and k.source='owner_approved' and k.status='approved' and k.confidence=1),'{}'),
    'version',coalesce(s.semantic_version,0),'message_revision',c.understanding_revision,'semantic_state',coalesce(s.semantic_state,'{}'),
    'verified_memory',coalesce((select jsonb_agg(jsonb_build_object('business_id',x.business_id,'customer_id',x.customer_id,'memory_key',x.memory_key,'value',x.value,'source',x.source,'status',x.status,'confidence',x.confidence,'version',x.version,'expires_at',x.expires_at,'last_confirmed_at',x.last_confirmed_at)) from (select * from public.dabbir_customer_memory m where m.business_id=b.business_id and m.customer_id=b.customer_id and m.status='verified' and m.last_confirmed_at is not null and (m.expires_at is null or m.expires_at>now()) order by m.last_confirmed_at desc limit 12)x),'[]'::jsonb),
    'approved_aliases',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'business_id',x.business_id,'entity_type',x.entity_type,'alias',x.alias,'target_id',x.target_id,'status',x.status,'version',x.version)) from (select * from public.dabbir_ai_knowledge_proposals k where k.business_id=b.business_id and k.status='OWNER_APPROVED' order by k.reviewed_at desc limit 30)x),'[]'::jsonb),
    'voice',(select jsonb_build_object('audio_confidence',null,'transcription_confidence',min(v.transcription_confidence),'clarification_required',bool_or(v.clarification_required)) from public.dabbir_whatsapp_voice_ingest v join public.dabbir_message_batch_items i on i.message_id=v.message_id and i.business_id=v.business_id where i.batch_id=b.id having count(*)>0));
end $$;
revoke all on function public.dabbir_semantic_load_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_load_v2(uuid,uuid) to service_role;

create or replace function public.dabbir_semantic_commit_v2(p_batch_id uuid,p_lock_token uuid,p_expected_version bigint,p_message_revision bigint,p_state jsonb,p_metrics jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype; s public.dabbir_ai_conversation_state%rowtype; f record; v bigint;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token,p_message_revision);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>32768 or p_state->>'version' is distinct from '2' or
    p_state#>>'{scope,business_id}' is distinct from b.business_id::text or p_state#>>'{scope,conversation_id}' is distinct from b.conversation_id::text or
    p_state#>>'{scope,customer_id}' is distinct from b.customer_id::text or p_state#>>'{scope,branch_id}' is distinct from c.branch_id::text then raise exception 'SEMANTIC_STATE_SCOPE_INVALID'; end if;
  if jsonb_typeof(p_state->'entities') is distinct from 'object' or jsonb_typeof(p_state->'missing_fields') is distinct from 'array' or jsonb_typeof(p_state->'unresolved_references') is distinct from 'array' then raise exception 'SEMANTIC_STATE_CONTRACT_INVALID'; end if;
  for f in select key,value from jsonb_each(p_state->'entities') loop
    if f.key not in ('service','date','time','location','vehicle','worker','branch','appointment','slot','price','customer_reference') or
      coalesce(f.value->>'source','') not in ('DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED','AI_INFERENCE') or
      coalesce((f.value->>'confidence')::numeric,-1) not between 0 and 1 then raise exception 'SEMANTIC_ENTITY_INVALID'; end if;
  end loop;
  if octet_length(p_metrics::text)>2048 or jsonb_typeof(p_metrics)<>'object' then raise exception 'SEMANTIC_METRICS_INVALID'; end if;
  insert into public.dabbir_ai_conversation_state(business_id,conversation_id) values(b.business_id,b.conversation_id) on conflict do nothing;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
  if s.semantic_batch_id=b.id then return jsonb_build_object('version',s.semantic_version,'replay',true,'state',s.semantic_state); end if;
  if s.semantic_version<>p_expected_version then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  v:=s.semantic_version+1;
  update public.dabbir_ai_conversation_state set semantic_state=p_state,semantic_version=v,semantic_batch_id=b.id,semantic_message_revision=p_message_revision,updated_at=now() where business_id=b.business_id and conversation_id=b.conversation_id;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics)
    values(b.business_id,b.conversation_id,b.id,'UNDERSTOOD',v,p_metrics);
  return jsonb_build_object('version',v,'replay',false,'state',p_state);
end $$;
revoke all on function public.dabbir_semantic_commit_v2(uuid,uuid,bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_commit_v2(uuid,uuid,bigint,bigint,jsonb,jsonb) to service_role;

-- Server-controlled state is the sole mutation router input; callers cannot send arbitrary ids.
create or replace function public.dabbir_semantic_execute_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_action text) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; s public.dabbir_ai_conversation_state%rowtype; e jsonb; slot jsonb; result jsonb;
  k text; a uuid; w uuid; sid uuid; c public.dabbir_conversations%rowtype; entry public.dabbir_ai_action_ledger%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
  if not found or s.semantic_batch_id is distinct from b.id or s.semantic_version<>p_version or s.semantic_message_revision<>c.understanding_revision then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  if p_action not in ('CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING') or s.semantic_state->>'pending_action' is distinct from p_action then raise exception 'SEMANTIC_OPERATION_NOT_AUTHORIZED'; end if;
  if coalesce((s.semantic_state->>'operational_confidence')::numeric,0)<0.9 or jsonb_array_length(s.semantic_state->'missing_fields')<>0 or jsonb_array_length(s.semantic_state->'unresolved_references')<>0 then raise exception 'SEMANTIC_MUTATION_BLOCKED'; end if;
  e:=s.semantic_state->'entities';
  if exists(select 1 from jsonb_array_elements(coalesce(s.semantic_state->'policy_dependencies','[]')) dep where not exists(select 1 from public.dabbir_ai_knowledge_proposals p where p.business_id=b.business_id and p.id=(dep->>'id')::uuid and p.version=(dep->>'version')::bigint and p.status='OWNER_APPROVED')) then raise exception 'SEMANTIC_POLICY_REVOKED'; end if;
  if p_action='CREATE_BOOKING' and exists(
    select 1 from public.dabbir_business_knowledge k cross join lateral jsonb_array_elements_text(coalesce(k.value->'required_fields','[]')) field
    where k.business_id=b.business_id and k.knowledge_key='semantic_required_fields' and k.status='approved' and k.source='owner_approved'
      and field.value in ('vehicle','location','worker') and (e->field.value is null or e->field.value->>'value' is null or coalesce((e->field.value->>'confidence')::numeric,0)<.9 or e->field.value->>'source'='AI_INFERENCE')
  ) then raise exception 'SEMANTIC_POLICY_REQUIRED_FIELD'; end if;
  k:='understanding-v2:'||b.id::text||':'||lower(p_action);
  -- A verified retry reuses the existing ledger and never repeats a mutation.
  select * into entry from public.dabbir_ai_action_ledger where business_id=b.business_id and conversation_id=b.conversation_id and operation_key=k;
  if found then return entry.result||jsonb_build_object('idempotent_replay',true,'timezone',(select timezone from public.dabbir_businesses where id=b.business_id),'provider_confirmation','PENDING_DELIVERY'); end if;
  if p_action in ('CANCEL_BOOKING','RESCHEDULE_BOOKING') then
    if coalesce(e#>>'{appointment,source}','') not in ('CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION') or coalesce((e#>>'{appointment,confidence}')::numeric,0)<.95 then raise exception 'SEMANTIC_APPOINTMENT_UNCONFIRMED'; end if;
    a:=(e#>>'{appointment,value}')::uuid;
    if not exists(select 1 from public.dabbir_appointments ap where ap.id=a and ap.business_id=b.business_id and ap.branch_id=c.branch_id and ap.customer_id=c.customer_id and not ap.simulated) then raise exception 'SEMANTIC_APPOINTMENT_SCOPE_INVALID'; end if;
  end if;
  if p_action in ('CREATE_BOOKING','RESCHEDULE_BOOKING') then
    if s.pending_action<>'choose_slot' or s.expires_at is null or s.expires_at<=now() or s.payload->>'presented' is distinct from 'true' or coalesce(e#>>'{slot,source}','')<>'CUSTOMER_CONFIRMED' or coalesce((e#>>'{slot,confidence}')::numeric,0)<.95 then raise exception 'SEMANTIC_SLOT_UNCONFIRMED'; end if;
    slot:=s.payload->'slots'->((e#>>'{slot,value}')::int);
    if slot is null or slot->>'starts_at' is distinct from e#>>'{slot,starts_at}' then raise exception 'SEMANTIC_SLOT_MISMATCH'; end if;
    sid:=(slot->>'service_id')::uuid;w:=nullif(slot->>'worker_id','')::uuid;
    if p_action='RESCHEDULE_BOOKING' and (s.payload->>'mode'<>'reschedule' or s.payload->>'appointment_id' is distinct from a::text) then raise exception 'SEMANTIC_APPOINTMENT_MISMATCH'; end if;
    if p_action='CREATE_BOOKING' and s.payload->>'mode' is distinct from 'booking' then raise exception 'SEMANTIC_SLOT_MODE_MISMATCH'; end if;
    if p_action='CREATE_BOOKING' then
      result:=public.dabbir_whatsapp_ai_create_booking(b.business_id,b.conversation_id,sid,w,(slot->>'starts_at')::timestamptz,k,'Booked through grounded DABBIR Understanding V2.');
    else result:=public.dabbir_whatsapp_ai_reschedule_booking(b.business_id,b.conversation_id,a,(slot->>'starts_at')::timestamptz,k); end if;
  else result:=public.dabbir_whatsapp_ai_cancel_booking(b.business_id,b.conversation_id,a,k); end if;
  if coalesce((result->>'verified')::boolean,false) is not true or not exists(select 1 from public.dabbir_appointments ap where ap.id=(result->>'appointment_id')::uuid and ap.business_id=b.business_id and ap.branch_id=c.branch_id and ap.customer_id=c.customer_id and ap.status=result->>'status') then raise exception 'SEMANTIC_OUTCOME_NOT_VERIFIED'; end if;
  result:=result||jsonb_build_object('timezone',(select timezone from public.dabbir_businesses where id=b.business_id),'provider_confirmation','PENDING_DELIVERY');
  update public.dabbir_ai_conversation_state set semantic_state=semantic_state||jsonb_build_object('last_verified_action',jsonb_build_object('action',p_action,'appointment_id',result->>'appointment_id','source','DATABASE_FACT','at',now()),'last_verified_outcome',jsonb_build_object('status',result->>'status','source','DATABASE_FACT','provider_confirmation','PENDING_DELIVERY','at',now())),updated_at=now() where business_id=b.business_id and conversation_id=b.conversation_id;
  if p_action='CREATE_BOOKING' then
    select * into entry from public.dabbir_ai_action_ledger where business_id=b.business_id and operation_key=k;
    insert into public.dabbir_customer_memory(business_id,customer_id,memory_key,value,source,confidence,status,version,last_confirmed_at,expires_at,verified_action_id)
      values(b.business_id,b.customer_id,'last_verified_service',jsonb_build_object('id',sid),'DATABASE_FACT',1,'verified',1,now(),now()+interval '180 days',entry.id)
      on conflict(business_id,customer_id,memory_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='verified',version=public.dabbir_customer_memory.version+1,last_confirmed_at=now(),expires_at=excluded.expires_at,verified_action_id=excluded.verified_action_id
      where public.dabbir_customer_memory.status<>'revoked';
  end if;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics) values(b.business_id,b.conversation_id,b.id,'VERIFIED_ACTION',p_version,jsonb_build_object('action',p_action,'verified',true,'provider_verified',false)) on conflict do nothing;
  return result;
end $$;
revoke all on function public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text) to service_role;

create or replace function public.dabbir_semantic_set_pending_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  if octet_length(p_payload::text)>8192 then raise exception 'SEMANTIC_PENDING_TOO_LARGE'; end if;
  if not exists(select 1 from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id and semantic_batch_id=b.id and semantic_version=p_version) then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  if p_payload->>'presented'='true' and not exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=b.business_id and r.conversation_id=b.conversation_id and r.provider_message_id=p_payload->>'provider_message_id' and r.state not in ('FAILED','AMBIGUOUS')) then raise exception 'SEMANTIC_PRESENTATION_UNVERIFIED'; end if;
  return public.dabbir_whatsapp_ai_set_state(b.business_id,b.conversation_id,p_action,p_payload,900);
end $$;
revoke all on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) to service_role;

create or replace function public.dabbir_semantic_assert_current_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint) returns boolean
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  if not exists(select 1 from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id and semantic_batch_id=b.id and semantic_version=p_version) then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  return true;
end $$;
revoke all on function public.dabbir_semantic_assert_current_v2(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_assert_current_v2(uuid,uuid,bigint) to service_role;

-- Non-server edits can never preserve verification on a customer-memory fact.
create or replace function dabbir_private.understanding_memory_edit_v2() returns trigger
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then
    new.status:='candidate';new.last_confirmed_at:=null;new.verified_action_id:=null;
    new.source:='CUSTOMER_STATED';new.confidence:=0.5;
  end if;
  if octet_length(new.value::text)>2048 then raise exception 'MEMORY_VALUE_TOO_LARGE'; end if;
  return new;
end $$;
revoke all on function dabbir_private.understanding_memory_edit_v2() from public,anon,authenticated;
create trigger dabbir_understanding_memory_edit before insert or update on public.dabbir_customer_memory
for each row execute function dabbir_private.understanding_memory_edit_v2();

create or replace function public.dabbir_knowledge_propose_v2(p_business_id uuid,p_conversation_id uuid,p_correction_id uuid,p_entity_type text,p_alias text,p_target_id uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare pid uuid; u uuid:=auth.uid();
begin
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=u and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
  if p_entity_type not in ('service','worker','branch') then raise exception 'KNOWLEDGE_ENTITY_UNSUPPORTED'; end if;
  if (p_entity_type='service' and not exists(select 1 from public.dabbir_services where id=p_target_id and business_id=p_business_id and active)) or
     (p_entity_type='worker' and not exists(select 1 from public.dabbir_workers where id=p_target_id and business_id=p_business_id and status='active')) or
     (p_entity_type='branch' and not exists(select 1 from public.dabbir_business_branches where id=p_target_id and business_id=p_business_id and status='active')) then raise exception 'KNOWLEDGE_TARGET_SCOPE_INVALID'; end if;
  if p_conversation_id is not null and not exists(select 1 from public.dabbir_conversations where id=p_conversation_id and business_id=p_business_id) then raise exception 'KNOWLEDGE_SOURCE_SCOPE_INVALID'; end if;
  if p_correction_id is not null and not exists(select 1 from public.dabbir_messages where id=p_correction_id and conversation_id=p_conversation_id and business_id=p_business_id and sender_type='human' and sender_user_id=u) then raise exception 'KNOWLEDGE_CORRECTION_SCOPE_INVALID'; end if;
  if char_length(trim(p_alias)) not between 1 and 80 or p_alias ~* '(token|secret|password|api.key|ignore.instructions|انس تعليمات)' then raise exception 'KNOWLEDGE_ALIAS_INVALID'; end if;
  insert into public.dabbir_ai_knowledge_proposals(business_id,source_conversation_id,source_correction_id,entity_type,alias,target_id,created_by)
    values(p_business_id,p_conversation_id,p_correction_id,p_entity_type,trim(p_alias),p_target_id,u) returning id into pid;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,proposal_id,event_type,version,actor_id)
    values(p_business_id,p_conversation_id,pid,'PROPOSED',1,u);
  return jsonb_build_object('id',pid,'status','PROPOSED','active',false);
end $$;
revoke all on function public.dabbir_knowledge_propose_v2(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_knowledge_propose_v2(uuid,uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.dabbir_knowledge_review_v2(p_business_id uuid,p_proposal_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare k public.dabbir_ai_knowledge_proposals%rowtype; v bigint; u uuid:=auth.uid(); st text; key text;
begin
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=u and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
  if p_action not in ('approve','reject','revoke','rollback') then raise exception 'KNOWLEDGE_REVIEW_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('understanding-knowledge:'||p_business_id::text,0));
  select * into k from public.dabbir_ai_knowledge_proposals where id=p_proposal_id and business_id=p_business_id for update;
  if not found then raise exception 'KNOWLEDGE_PROPOSAL_NOT_FOUND'; end if;
  if (p_action='approve' and k.status<>'PROPOSED') or (p_action='rollback' and k.status not in ('SUPERSEDED','REVOKED')) or (p_action='revoke' and k.status<>'OWNER_APPROVED') or (p_action='reject' and k.status<>'PROPOSED') then raise exception 'KNOWLEDGE_TRANSITION_INVALID'; end if;
  if p_action in ('approve','rollback') then
    if (k.entity_type='service' and not exists(select 1 from public.dabbir_services where business_id=p_business_id and id=k.target_id and active)) or
       (k.entity_type='worker' and not exists(select 1 from public.dabbir_workers where business_id=p_business_id and id=k.target_id and status='active')) or
       (k.entity_type='branch' and not exists(select 1 from public.dabbir_business_branches where business_id=p_business_id and id=k.target_id and status='active')) then raise exception 'KNOWLEDGE_TARGET_SCOPE_INVALID'; end if;
  end if;
  select coalesce(max(version),0)+1 into v from public.dabbir_ai_knowledge_proposals where business_id=p_business_id and entity_type=k.entity_type and lower(alias)=lower(k.alias);
  st:=case when p_action in ('approve','rollback') then 'OWNER_APPROVED' when p_action='reject' then 'REJECTED' else 'REVOKED' end;
  if st='OWNER_APPROVED' then
    update public.dabbir_ai_knowledge_proposals set status='SUPERSEDED' where business_id=p_business_id and entity_type=k.entity_type and lower(alias)=lower(k.alias) and status='OWNER_APPROVED';
  end if;
  update public.dabbir_ai_knowledge_proposals set status=st,version=v,reviewed_by=u,reviewed_at=now(),confidence=case when st='OWNER_APPROVED' then 1 else confidence end where business_id=p_business_id and id=k.id;
  key:='semantic_alias:'||k.entity_type||':'||lower(k.alias);
  if st='OWNER_APPROVED' then
    insert into public.dabbir_business_knowledge(business_id,knowledge_key,knowledge_type,value,source,confidence,status)
      values(p_business_id,key,'policy',jsonb_build_object('proposal_id',k.id,'entity_type',k.entity_type,'alias',k.alias,'target_id',k.target_id,'version',v),'owner_approved',1,'approved')
      on conflict(business_id,knowledge_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='approved',updated_at=now();
  elsif st='REVOKED' then
    update public.dabbir_business_knowledge set status='superseded',updated_at=now() where business_id=p_business_id and knowledge_key=key and value->>'proposal_id'=k.id::text;
  end if;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,proposal_id,event_type,version,actor_id)
    values(p_business_id,k.source_conversation_id,k.id,case when p_action='rollback' then 'ROLLBACK' else st end,v,u);
  return jsonb_build_object('id',k.id,'status',st,'version',v,'active',st='OWNER_APPROVED');
end $$;
revoke all on function public.dabbir_knowledge_review_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_knowledge_review_v2(uuid,uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.dabbir_whatsapp_ai_reserve_outbound(p_business_id uuid, p_conversation_id uuid, p_idempotency_key text, p_payload_hash text, p_body text)
 RETURNS TABLE(reservation_id uuid, should_send boolean, reservation_state text, connection_id uuid, phone_number_id text, recipient_handle text, provider_message_id text, message_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_existing public.dabbir_whatsapp_outbound_reservations%rowtype;
  v_recipient text;
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_hash text:=lower(trim(coalesce(p_payload_hash,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_business_id is null or p_conversation_id is null then raise exception 'WHATSAPP_AI_OUTBOUND_CONTEXT_REQUIRED'; end if;
  if length(v_key) not between 16 and 160 then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_PAYLOAD_HASH_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false limit 1;
  if not found or v_conversation.customer_id is null then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c where c.business_id=p_business_id and c.branch_id=v_conversation.branch_id and c.status='connected' order by c.updated_at desc limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  if v_conversation.state='human_active' then raise exception 'WHATSAPP_AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select nullif(trim(c.channel_handle),'') into v_recipient from public.dabbir_customers c where c.business_id=p_business_id and c.id=v_conversation.customer_id limit 1;
  if v_recipient is null then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':wa-ai-out:'||v_key,0));
  select * into v_existing from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.idempotency_key=v_key limit 1;
  if found then
    if v_existing.conversation_id<>p_conversation_id or v_existing.sender_type<>'ai' or v_existing.payload_hash<>v_hash then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return query select v_existing.id,false,v_existing.state,v_existing.connection_id,v_connection.phone_number_id,v_existing.recipient_handle,v_existing.provider_message_id,v_existing.message_id;
    return;
  end if;
  insert into public.dabbir_whatsapp_outbound_reservations(
    business_id,connection_id,conversation_id,sender_user_id,sender_type,idempotency_key,payload_hash,recipient_handle,body,state,external_attempt_started_at
  ) values(
    p_business_id,v_connection.id,p_conversation_id,null,'ai',v_key,v_hash,v_recipient,left(trim(p_body),4000),'SENDING',now()
  ) returning * into v_existing;
  return query select v_existing.id,true,v_existing.state,v_existing.connection_id,v_connection.phone_number_id,v_existing.recipient_handle,null::text,null::uuid;
end;
$function$
;
revoke all on function public.dabbir_whatsapp_ai_reserve_outbound(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_reserve_outbound(uuid,uuid,text,text,text) to service_role;


-- Freshness and outbound reservation share a transaction. Unknown transport outcomes
-- are never retried blindly. Only an explicit HTTP 429 rejection may be retried.
create or replace function public.dabbir_semantic_reserve_outbound_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_key text,p_hash text,p_body text) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; r public.dabbir_whatsapp_outbound_reservations%rowtype; result jsonb;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  perform public.dabbir_semantic_assert_current_v2(p_batch_id,p_lock_token,p_version);
  if p_key not like 'wa-understanding:'||b.id::text||':%' then raise exception 'SEMANTIC_OUTBOUND_KEY_INVALID'; end if;
  select * into r from public.dabbir_whatsapp_outbound_reservations where business_id=b.business_id and conversation_id=b.conversation_id and idempotency_key=p_key for update;
  if found and r.state='FAILED' and r.provider_message_id is null and r.error_code='META_HTTP_429' then
    if r.payload_hash<>p_hash then raise exception 'SEMANTIC_OUTBOUND_PAYLOAD_CHANGED'; end if;
    update public.dabbir_whatsapp_outbound_reservations set state='SENDING',error_code=null,external_attempt_started_at=now(),updated_at=now() where id=r.id;
    return jsonb_build_object('reservation_id',r.id,'should_send',true,'reservation_state','SENDING','connection_id',r.connection_id,'recipient_handle',r.recipient_handle);
  end if;
  select to_jsonb(x) into result from public.dabbir_whatsapp_ai_reserve_outbound(b.business_id,b.conversation_id,p_key,p_hash,p_body) x;
  return result;
end $$;
revoke all on function public.dabbir_semantic_reserve_outbound_v2(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_reserve_outbound_v2(uuid,uuid,bigint,text,text,text) to service_role;
