-- Additive, service-role-only transition after a real empty availability read.
-- Existing callers and canonical commit/replay behavior are unchanged.
-- Rollback after reverting the caller: drop this function; no table/data removal.
create or replace function public.dabbir_semantic_advance_availability_date_v1(
  p_batch_id uuid,p_lock_token uuid,p_version bigint
) returns jsonb language plpgsql security definer
set search_path='pg_catalog','public' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype;
 s public.dabbir_ai_conversation_state%rowtype; f jsonb; next_state jsonb;
 primary_date date; next_date date; next_version bigint;
begin
 -- Reuses the canonical lock order, tenant/customer scope, batch lease,
 -- takeover and newest-message guard. No caller-supplied identity.
 perform public.dabbir_semantic_assert_current_v2(p_batch_id,p_lock_token,p_version);
 select * into b from public.dabbir_message_batches where id=p_batch_id;
 select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
 select * into s from public.dabbir_ai_conversation_state
  where business_id=b.business_id and conversation_id=b.conversation_id for update;
 if not found or s.semantic_batch_id is distinct from b.id or s.semantic_version is distinct from p_version
  or s.semantic_message_revision is distinct from c.understanding_revision
 then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
 if s.semantic_state->>'pending_action' is distinct from 'CHECK_AVAILABILITY'
  or coalesce(s.semantic_state->>'goal','') not in ('BOOK_SERVICE','RESCHEDULE_BOOKING')
  or s.semantic_state->'missing_fields' is distinct from '[]'::jsonb
  or s.semantic_state->'unresolved_references' is distinct from '[]'::jsonb
  or coalesce((s.semantic_state->>'operational_confidence')::numeric,0)<.9
 then raise exception 'SEMANTIC_DATE_TRANSITION_NOT_AUTHORIZED'; end if;

 -- A fixture/model/client assertion of "unavailable" is insufficient. Only
 -- the preceding canonical SQL read, at this version, can authorize advancing.
 if s.semantic_state#>>'{last_tool_call,action}' is distinct from 'CHECK_AVAILABILITY'
  or (s.semantic_state#>>'{last_tool_call,version}')::bigint is distinct from p_version
  or s.semantic_state#>>'{last_tool_result,source}' is distinct from 'DATABASE_FACT'
  or s.semantic_state#>>'{last_tool_result,action}' is distinct from 'CHECK_AVAILABILITY'
  or (s.semantic_state#>>'{last_tool_result,slot_count}')::integer is distinct from 0
  or coalesce((s.semantic_state#>>'{last_tool_result,at}')::timestamptz between now()-interval '30 seconds' and now(),false) is not true
 then raise exception 'SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'; end if;

 f:=s.semantic_state#>'{entities,date}';
 if f->>'status' is distinct from 'active'
  or coalesce(f->>'source','') not in ('CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION')
  or coalesce((f->>'confidence')::numeric,0)<.9
  or f->>'alternative_condition' is distinct from 'NO_AVAILABILITY'
  or coalesce(f->>'value','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  or coalesce(f->>'alternative_value','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 then raise exception 'SEMANTIC_EXPLICIT_ALTERNATE_DATE_REQUIRED'; end if;
 primary_date:=(f->>'value')::date;next_date:=(f->>'alternative_value')::date;
 if next_date<>primary_date+1 then raise exception 'SEMANTIC_ALTERNATE_DATE_INVALID'; end if;

 next_version:=s.semantic_version+1;
 f:=(f-'alternative_value'-'alternative_condition')||jsonb_build_object(
  'value',next_date::text,'updated_at',now(),'conditional_primary_date',primary_date::text);
 next_state:=jsonb_set(s.semantic_state,'{entities,date}',f)||jsonb_build_object(
  'updated_at',now(),'availability_date_transition',jsonb_build_object(
   'from',primary_date::text,'to',next_date::text,'from_version',p_version,
   'to_version',next_version,'reason','EXPLICIT_ALTERNATIVE_AFTER_EMPTY_READ','at',now()));
 update public.dabbir_ai_conversation_state set semantic_state=next_state,
  semantic_version=next_version,updated_at=now()
  where business_id=b.business_id and conversation_id=b.conversation_id;
 insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics)
  values(b.business_id,b.conversation_id,b.id,'UNDERSTOOD',next_version,jsonb_build_object(
   'action','CHECK_AVAILABILITY','goal',next_state->>'goal',
   'reason_code','EXPLICIT_ALTERNATIVE_AFTER_EMPTY_READ','from_version',p_version,
   'previous_date',primary_date::text,'next_date',next_date::text));
 return jsonb_build_object('version',next_version,'state',next_state);
end $$;
revoke all on function public.dabbir_semantic_advance_availability_date_v1(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_advance_availability_date_v1(uuid,uuid,bigint) to service_role;
