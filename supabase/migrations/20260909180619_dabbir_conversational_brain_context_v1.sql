-- Additive context hydration. No transcript, address or customer name is copied.
-- Keep the existing batch lock, scope checks, memory and rollout policy intact.
do $migration$
declare definition text; anchor text;
begin
 select pg_get_functiondef('public.dabbir_semantic_load_v2(uuid,uuid)'::regprocedure) into definition;
 anchor:='''activity_profile'',public.dabbir_activity_profile_v1';
 if strpos(definition,anchor)=0 or strpos(definition,'''operational_history''')>0 then raise exception 'BRAIN_LOAD_SOURCE_DRIFT'; end if;
 definition:=replace(definition,anchor,$replacement$'operational_history',coalesce((select jsonb_agg(h) from (
  select a.id,a.business_id,a.customer_id,a.branch_id,a.service_id,a.worker_id,a.starts_at,a.status,a.simulated
  from public.dabbir_appointments a
  where a.business_id=b.business_id and a.customer_id=b.customer_id and a.branch_id=c.branch_id
   and a.status='completed' and not a.simulated and a.starts_at<=now() and a.starts_at>now()-interval '180 days'
  order by a.starts_at desc,a.id limit 16
 ) h),'[]'::jsonb),'activity_profile',public.dabbir_activity_profile_v1$replacement$);
 execute definition;

 -- Revalidate historical provenance at mutation time, including revocation or
 -- changes after interpretation. This only adds a rejection condition.
 select pg_get_functiondef('public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text)'::regprocedure) into definition;
 anchor:='e:=s.semantic_state->''entities'';';
 if strpos(definition,anchor)=0 or strpos(definition,'ACTIVITY_HISTORICAL_REFERENCE_STALE')>0 then raise exception 'BRAIN_AUTHORITY_SOURCE_DRIFT'; end if;
 definition:=replace(definition,anchor,$replacement$e:=s.semantic_state->'entities';
  if exists(select 1 from jsonb_each(e) fact where fact.value ? 'historical_appointment_id' and (
   fact.key not in ('service','worker') or not exists(
    select 1 from public.dabbir_appointments h where h.id::text=fact.value->>'historical_appointment_id'
     and h.business_id=b.business_id and h.customer_id=b.customer_id and h.branch_id=c.branch_id
     and h.status='completed' and not h.simulated and h.starts_at<=now() and h.starts_at>now()-interval '180 days'
     and (case when fact.key='service' then h.service_id else h.worker_id end)::text=fact.value->>'value'
   ))) then raise exception 'ACTIVITY_HISTORICAL_REFERENCE_STALE'; end if;$replacement$);
 execute definition;
end $migration$;

-- Read tools use the same canonical-state authority as mutation tools. Client
-- text and provider output cannot supply identity, appointment or access scope.
create or replace function public.dabbir_semantic_check_availability_v1(p_batch_id uuid,p_lock_token uuid,p_version bigint)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype;
 s public.dabbir_ai_conversation_state%rowtype; a public.dabbir_appointments%rowtype;
 result jsonb; service_id uuid; worker_id uuid; requested_local timestamp without time zone;
begin
 b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
 select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
 select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
 if not found or s.semantic_batch_id is distinct from b.id or s.semantic_version is distinct from p_version or s.semantic_message_revision is distinct from c.understanding_revision then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
 if s.semantic_state->>'pending_action' is distinct from 'CHECK_AVAILABILITY'
  or coalesce(s.semantic_state->>'goal','') not in ('BOOK_SERVICE','RESCHEDULE_BOOKING')
  or s.semantic_state->'missing_fields' is distinct from '[]'::jsonb
  or s.semantic_state->'unresolved_references' is distinct from '[]'::jsonb
  or coalesce((s.semantic_state->>'operational_confidence')::numeric,0)<.9 then raise exception 'SEMANTIC_AVAILABILITY_NOT_AUTHORIZED'; end if;
 service_id:=(s.semantic_state#>>'{entities,service,value}')::uuid;
 worker_id:=(s.semantic_state#>>'{entities,worker,value}')::uuid;
 requested_local:=(s.semantic_state#>>'{entities,date,value}')||'T'||(s.semantic_state#>>'{entities,time,value}')||':00';
 if service_id is null or requested_local is null then raise exception 'SEMANTIC_AVAILABILITY_FACTS_MISSING'; end if;
 if s.semantic_state->>'goal'='RESCHEDULE_BOOKING' then
  select * into a from public.dabbir_appointments where id::text=s.semantic_state#>>'{entities,appointment,value}'
   and business_id=b.business_id and customer_id=b.customer_id and branch_id=c.branch_id and not simulated;
  if not found or a.service_id is distinct from service_id then raise exception 'SEMANTIC_APPOINTMENT_SCOPE_INVALID'; end if;
  worker_id:=coalesce(worker_id,a.worker_id);
 end if;
 result:=public.dabbir_whatsapp_ai_check_availability(b.business_id,b.conversation_id,service_id,worker_id,requested_local);
 if jsonb_typeof(result->'slots') is distinct from 'array' then raise exception 'SEMANTIC_AVAILABILITY_RESULT_INVALID'; end if;
 update public.dabbir_ai_conversation_state set semantic_state=semantic_state||jsonb_build_object(
  'last_tool_call',jsonb_build_object('action','CHECK_AVAILABILITY','version',p_version,'at',now()),
  'last_tool_result',jsonb_build_object('action','CHECK_AVAILABILITY','source','DATABASE_FACT','slot_count',jsonb_array_length(result->'slots'),'at',now())),updated_at=now()
 where business_id=b.business_id and conversation_id=b.conversation_id;
 update public.dabbir_ai_understanding_events set metrics=jsonb_set(metrics,'{tool_result}',jsonb_build_object('action','CHECK_AVAILABILITY','slot_count',jsonb_array_length(result->'slots')))
 where business_id=b.business_id and conversation_id=b.conversation_id and batch_id=b.id and event_type='UNDERSTOOD' and version=p_version;
 return result;
end $$;
revoke all on function public.dabbir_semantic_check_availability_v1(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_check_availability_v1(uuid,uuid,bigint) to service_role;
