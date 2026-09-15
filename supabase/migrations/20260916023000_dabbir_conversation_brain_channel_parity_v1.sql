-- DABBIR Conversation Brain channel parity V1.
-- One semantic brain/state/execution path for WhatsApp and the internal Web customer test.
-- Channel-specific code owns delivery only. No fake WhatsApp receipts are created for Web.

alter table public.dabbir_messages
  add column if not exists semantic_batch_id uuid references public.dabbir_message_batches(id) on delete set null,
  add column if not exists semantic_version bigint,
  add column if not exists semantic_purpose text;

alter table public.dabbir_messages drop constraint if exists dabbir_messages_semantic_purpose_check;
alter table public.dabbir_messages add constraint dabbir_messages_semantic_purpose_check
  check (semantic_purpose is null or (char_length(semantic_purpose) between 1 and 80 and semantic_purpose !~ '[[:cntrl:]]'));

create unique index if not exists dabbir_messages_web_semantic_delivery_uq
  on public.dabbir_messages(business_id,conversation_id,semantic_batch_id,semantic_version,semantic_purpose)
  where sender_type='ai' and semantic_batch_id is not null and semantic_version is not null and semantic_purpose is not null;
create index if not exists dabbir_messages_semantic_delivery_lookup_idx
  on public.dabbir_messages(business_id,conversation_id,semantic_batch_id,semantic_version)
  where sender_type='ai' and semantic_batch_id is not null;

-- Canonical channel-neutral context. The old WhatsApp function remains a compatibility wrapper.
create or replace function public.dabbir_ai_context(p_batch_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_business public.dabbir_businesses%rowtype;
  v_customer public.dabbir_customers%rowtype;
  v_state public.dabbir_ai_conversation_state%rowtype;
  v_newer boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches where id=p_batch_id and state='PROCESSING' and lock_token=p_lock_token;
  if not found then raise exception 'AI_BATCH_LOCK_MISMATCH'; end if;
  select * into v_conversation from public.dabbir_conversations
   where id=v_batch.conversation_id and business_id=v_batch.business_id
     and channel_type in ('whatsapp','web') and channel_type=v_batch.channel_type and demo_mode=false;
  if not found or v_conversation.branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if not exists(select 1 from public.dabbir_business_branches b where b.business_id=v_batch.business_id and b.id=v_conversation.branch_id and b.status='active') then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  select * into v_business from public.dabbir_businesses where id=v_batch.business_id;
  select * into v_customer from public.dabbir_customers where id=v_conversation.customer_id and business_id=v_batch.business_id;
  if not found then raise exception 'AI_CUSTOMER_NOT_FOUND'; end if;
  select * into v_state from public.dabbir_ai_conversation_state where business_id=v_batch.business_id and conversation_id=v_batch.conversation_id and (expires_at is null or expires_at>now());
  select exists(select 1 from public.dabbir_messages m where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id and m.sender_type='customer' and m.simulated=false and m.created_at>v_batch.last_message_at) into v_newer;
  return jsonb_build_object(
    'batch',jsonb_build_object('id',v_batch.id,'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,'customer_id',v_batch.customer_id,'channel_type',v_batch.channel_type,'message_count',v_batch.message_count,'attempt_count',v_batch.attempt_count,'last_message_at',v_batch.last_message_at),
    'conversation',jsonb_build_object('id',v_conversation.id,'state',v_conversation.state,'channel_type',v_conversation.channel_type,'branch_id',v_conversation.branch_id,'newer_customer_message_exists',v_newer),
    'business',jsonb_build_object('id',v_business.id,'name',v_business.name,'business_type',v_business.business_type,'locale',v_business.locale,'country_code',v_business.country_code,'currency_code',v_business.currency_code,'timezone',v_business.timezone),
    'customer',jsonb_build_object('id',v_customer.id,'display_name',v_customer.display_name,'phone_e164',v_customer.phone_e164,'channel_handle',v_customer.channel_handle),
    'pending_state',case when v_state.conversation_id is null then null else jsonb_build_object('pending_action',v_state.pending_action,'payload',v_state.payload,'expires_at',v_state.expires_at) end,
    'batch_messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at) order by i.ordinal) from public.dabbir_message_batch_items i join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id where i.batch_id=v_batch.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(x.obj order by x.created_at) from (select jsonb_build_object('sender_type',m.sender_type,'body',m.body,'created_at',m.created_at) obj,m.created_at from public.dabbir_messages m where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id and m.id not in (select message_id from public.dabbir_message_batch_items where batch_id=v_batch.id) order by m.created_at desc limit 10) x),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'name_ar',s.name_ar,'name_en',s.name_en,'duration_minutes',s.duration_minutes,'price',s.price_aed) order by s.name) from public.dabbir_services s join public.dabbir_branch_services bs on bs.business_id=s.business_id and bs.service_id=s.id and bs.branch_id=v_conversation.branch_id and bs.active=true where s.business_id=v_batch.business_id and s.active=true),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'display_name',w.display_name,'job_title',w.job_title) order by w.display_name) from public.dabbir_workers w join public.dabbir_worker_branches wb on wb.business_id=w.business_id and wb.worker_id=w.id and wb.branch_id=v_conversation.branch_id and wb.active=true where w.business_id=v_batch.business_id and w.status='active'),'[]'::jsonb),
    'worker_services',coalesce((select jsonb_agg(jsonb_build_object('worker_id',ws.worker_id,'service_id',ws.service_id,'duration_minutes',ws.duration_minutes,'price',ws.price_aed)) from public.dabbir_worker_services ws join public.dabbir_worker_branches wb on wb.business_id=ws.business_id and wb.worker_id=ws.worker_id and wb.branch_id=v_conversation.branch_id and wb.active=true join public.dabbir_branch_services bs on bs.business_id=ws.business_id and bs.service_id=ws.service_id and bs.branch_id=v_conversation.branch_id and bs.active=true where ws.business_id=v_batch.business_id and ws.active=true),'[]'::jsonb),
    'upcoming_appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'branch_id',a.branch_id,'service_id',a.service_id,'worker_id',a.worker_id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'confirmation_gate',a.confirmation_gate,'deposit_required_amount',a.deposit_required_amount,'deposit_currency_code',a.deposit_currency_code) order by a.starts_at) from public.dabbir_appointments a where a.business_id=v_batch.business_id and a.branch_id=v_conversation.branch_id and a.customer_id=v_customer.id and a.starts_at>=now() and a.status not in ('cancelled','completed','no_show') limit 10),'[]'::jsonb),
    'knowledge',coalesce((select jsonb_agg(jsonb_build_object('key',x.knowledge_key,'type',x.knowledge_type,'value',x.value,'source',x.source,'confidence',x.confidence) order by x.updated_at desc) from (select k.knowledge_key,k.knowledge_type,k.value,k.source,k.confidence,k.updated_at from public.dabbir_business_knowledge k where k.business_id=v_batch.business_id and (k.status is null or lower(k.status) in ('active','verified','approved')) order by k.updated_at desc limit 20) x),'[]'::jsonb)
  );
end;$function$;
revoke all on function public.dabbir_ai_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_ai_context(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_ai_context(p_batch_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare result jsonb;
begin
  result:=public.dabbir_ai_context(p_batch_id,p_lock_token);
  if result#>>'{conversation,channel_type}' is distinct from 'whatsapp' then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  return result;
end;$function$;
revoke all on function public.dabbir_whatsapp_ai_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_context(uuid,uuid) to service_role;

create or replace function dabbir_private.understanding_assert_batch_v2(p_batch_id uuid,p_lock_token uuid,p_revision bigint default null)
returns public.dabbir_message_batches language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare b public.dabbir_message_batches%rowtype;c public.dabbir_conversations%rowtype;r bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into b from public.dabbir_message_batches where id=p_batch_id;
  if not found or b.state<>'PROCESSING' or b.lock_token is distinct from p_lock_token or b.locked_until is null or b.locked_until<=now() then raise exception 'SEMANTIC_BATCH_LOCK_INVALID'; end if;
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id for update;
  if not found or c.customer_id is distinct from b.customer_id or c.branch_id is null or c.demo_mode or c.channel_type not in ('whatsapp','web') or c.channel_type is distinct from b.channel_type then raise exception 'SEMANTIC_TENANT_SCOPE_INVALID'; end if;
  if c.state in ('human_active','action_required','closed') or exists(select 1 from public.dabbir_handoffs h where h.business_id=c.business_id and h.conversation_id=c.id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  if not exists(select 1 from public.dabbir_business_branches br where br.id=c.branch_id and br.business_id=c.business_id and br.status='active') then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  select coalesce(max(m.understanding_revision),0) into r from public.dabbir_message_batch_items i join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id and m.conversation_id=c.id where i.batch_id=b.id;
  if r<>c.understanding_revision or (p_revision is not null and p_revision<>r) or exists(select 1 from public.dabbir_messages m where m.business_id=c.business_id and m.conversation_id=c.id and m.sender_type='customer' and not m.simulated and m.created_at>b.last_message_at) then raise exception 'SEMANTIC_SUPERSEDED'; end if;
  if c.channel_type='whatsapp' and exists(select 1 from public.dabbir_whatsapp_voice_ingest v where v.business_id=c.business_id and v.conversation_id=c.id and v.state in ('RECEIVED','PROCESSING','RETRY') and v.created_at>=b.first_message_at) then raise exception 'SEMANTIC_VOICE_PENDING'; end if;
  return b;
end;$function$;
revoke all on function dabbir_private.understanding_assert_batch_v2(uuid,uuid,bigint) from public,anon,authenticated;

create or replace function dabbir_private.semantic_presentation_verified_v1(p_business_id uuid,p_conversation_id uuid,p_batch_id uuid,p_version bigint,p_provider_message_id text)
returns boolean language plpgsql stable security definer set search_path='pg_catalog','public' as $function$
declare channel text;
begin
  select c.channel_type into channel from public.dabbir_conversations c join public.dabbir_message_batches b on b.business_id=c.business_id and b.conversation_id=c.id where c.business_id=p_business_id and c.id=p_conversation_id and b.id=p_batch_id and b.channel_type=c.channel_type;
  if channel='whatsapp' then
    return exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.conversation_id=p_conversation_id and r.provider_message_id=p_provider_message_id and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ'));
  elsif channel='web' then
    return exists(select 1 from public.dabbir_messages m where m.business_id=p_business_id and m.conversation_id=p_conversation_id and m.id::text=p_provider_message_id and m.sender_type='ai' and not m.simulated and m.semantic_batch_id=p_batch_id and m.semantic_version=p_version);
  end if;
  return false;
end;$function$;
revoke all on function dabbir_private.semantic_presentation_verified_v1(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function dabbir_private.semantic_presentation_verified_v1(uuid,uuid,uuid,bigint,text) to service_role;

create or replace function public.dabbir_semantic_deliver_web_v1(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_purpose text,p_body text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare b public.dabbir_message_batches%rowtype;m public.dabbir_messages%rowtype;purpose text:=trim(coalesce(p_purpose,''));body text:=trim(coalesce(p_body,''));
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  if b.channel_type<>'web' then raise exception 'WEB_AI_DELIVERY_CHANNEL_INVALID'; end if;
  if char_length(purpose) not between 1 and 80 or purpose ~ '[[:cntrl:]]' then raise exception 'WEB_AI_DELIVERY_PURPOSE_INVALID'; end if;
  if char_length(body) not between 1 and 4000 then raise exception 'WEB_AI_DELIVERY_BODY_INVALID'; end if;
  if not exists(select 1 from public.dabbir_ai_conversation_state s where s.business_id=b.business_id and s.conversation_id=b.conversation_id and s.semantic_batch_id=b.id and s.semantic_version=p_version) then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,semantic_batch_id,semantic_version,semantic_purpose)
  values(b.business_id,b.conversation_id,'ai',body,'AI_REPLY',false,b.id,p_version,purpose)
  on conflict (business_id,conversation_id,semantic_batch_id,semantic_version,semantic_purpose) where sender_type='ai' and semantic_batch_id is not null and semantic_version is not null and semantic_purpose is not null do nothing;
  select * into m from public.dabbir_messages x where x.business_id=b.business_id and x.conversation_id=b.conversation_id and x.sender_type='ai' and x.semantic_batch_id=b.id and x.semantic_version=p_version and x.semantic_purpose=purpose limit 1;
  if not found or m.body is distinct from body then raise exception 'WEB_AI_DELIVERY_CONFLICT'; end if;
  update public.dabbir_conversations set state='waiting_customer',updated_at=greatest(updated_at,m.created_at) where business_id=b.business_id and id=b.conversation_id and state not in ('human_active','action_required','closed');
  return jsonb_build_object('ok',true,'state','PERSISTED','provider_message_id',m.id::text,'message_id',m.id,'message',jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_type',m.sender_type,'body',m.body,'intent',m.intent,'simulated',m.simulated,'created_at',m.created_at));
end;$function$;
revoke all on function public.dabbir_semantic_deliver_web_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_deliver_web_v1(uuid,uuid,bigint,text,text) to service_role;

create or replace function public.dabbir_web_ai_persist_inbound_v1(p_business_id uuid,p_conversation_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare c public.dabbir_conversations%rowtype;customer public.dabbir_customers%rowtype;m public.dabbir_messages%rowtype;batch uuid;token uuid;body text:=trim(coalesce(p_body,''));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(body) not between 1 and 2000 then raise exception 'MESSAGE_INPUT_REQUIRED'; end if;
  select * into c from public.dabbir_conversations x where x.business_id=p_business_id and x.id=p_conversation_id and x.channel_type='web' and not x.demo_mode and x.state not in ('closed','human_active','action_required') for update;
  if not found or c.customer_id is null or c.branch_id is null then raise exception 'WEB_TEST_CONVERSATION_NOT_AVAILABLE'; end if;
  select * into customer from public.dabbir_customers x where x.business_id=p_business_id and x.id=c.customer_id;
  if not found or coalesce(customer.metadata->>'source','') not in ('dabbir_web_runtime','dabbir_branch_web_runtime') then raise exception 'WEB_TEST_CONVERSATION_REQUIRED'; end if;
  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated) values(p_business_id,p_conversation_id,'customer',body,'GENERAL_INQUIRY',false) returning * into m;
  batch:=public.dabbir_enqueue_message_batch(p_business_id,p_conversation_id,c.customer_id,'web',m.id,500,true,'INTERNAL_WEB_CUSTOMER_TEST');
  token:=gen_random_uuid();
  update public.dabbir_message_batches set dispatch_token=token,dispatched_at=now(),last_error=null,updated_at=now() where id=batch and business_id=p_business_id and conversation_id=p_conversation_id and channel_type='web';
  update public.dabbir_conversations set state='ai_active',updated_at=m.created_at where business_id=p_business_id and id=p_conversation_id;
  return jsonb_build_object('ok',true,'batch_id',batch,'dispatch_token',token,'message_id',m.id,'customer_id',c.customer_id,'message',jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_type',m.sender_type,'body',m.body,'intent',m.intent,'simulated',m.simulated,'created_at',m.created_at));
end;$function$;
revoke all on function public.dabbir_web_ai_persist_inbound_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_web_ai_persist_inbound_v1(uuid,uuid,text) to service_role;

create or replace function public.dabbir_semantic_set_pending_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare b public.dabbir_message_batches%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  if octet_length(p_payload::text)>8192 then raise exception 'SEMANTIC_PENDING_TOO_LARGE'; end if;
  if not exists(select 1 from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id and semantic_batch_id=b.id and semantic_version=p_version) then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  if p_payload->>'presented'='true' and not dabbir_private.semantic_presentation_verified_v1(b.business_id,b.conversation_id,b.id,p_version,p_payload->>'provider_message_id') then raise exception 'SEMANTIC_PRESENTATION_UNVERIFIED'; end if;
  if p_action='choose_service' then
    p_payload:=p_payload||jsonb_build_object('presentation_batch_id',b.id,'presentation_version',p_version,'presentation_branch_id',(select branch_id from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id));
    if octet_length(p_payload::text)>8192 then raise exception 'SEMANTIC_PENDING_TOO_LARGE'; end if;
  end if;
  if p_action='choose_slot' then p_payload:=p_payload||jsonb_build_object('activity_contract_version',(select semantic_state->>'activity_contract_version' from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id)); end if;
  return public.dabbir_whatsapp_ai_set_state(b.business_id,b.conversation_id,p_action,p_payload,900);
end;$function$;
revoke all on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) to service_role;

-- Existing operational SQL is tenant/branch/customer scoped. Remove only the obsolete channel-name restriction.
do $migration$
declare definition text;fn regprocedure;anchor text:='c.channel_type=''whatsapp''';
begin
  foreach fn in array array[
    'public.dabbir_whatsapp_ai_check_availability(uuid,uuid,uuid,uuid,timestamp without time zone)'::regprocedure,
    'public.dabbir_whatsapp_ai_create_booking(uuid,uuid,uuid,uuid,timestamp with time zone,text,text)'::regprocedure,
    'public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure,
    'public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text)'::regprocedure
  ] loop
    select pg_get_functiondef(fn) into definition;
    if position(anchor in definition)=0 then raise exception 'CHANNEL_PARITY_CONTRACT_DRIFT:%',fn::text; end if;
    execute replace(definition,anchor,'c.channel_type in (''whatsapp'',''web'')');
  end loop;
end;$migration$;

-- Mutation still requires a presentation receipt; only the receipt source becomes channel-neutral.
do $migration$
declare definition text;
  anchor text:=$old$if not exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=b.business_id and r.conversation_id=b.conversation_id and r.provider_message_id=s.payload->>'provider_message_id' and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')) then raise exception 'ACTIVITY_SLOT_UNVERIFIED'; end if;$old$;
  replacement text:=$new$if not dabbir_private.semantic_presentation_verified_v1(b.business_id,b.conversation_id,b.id,p_version,s.payload->>'provider_message_id') then raise exception 'ACTIVITY_SLOT_UNVERIFIED'; end if;$new$;
begin
  select pg_get_functiondef('public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'SEMANTIC_EXECUTE_PRESENTATION_CONTRACT_DRIFT'; end if;
  execute replace(definition,anchor,replacement);
end;$migration$;
