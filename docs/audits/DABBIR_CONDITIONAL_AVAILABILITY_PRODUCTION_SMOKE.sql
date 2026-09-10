-- Real guarded SQL calls in one rollback-only synthetic QA transaction.
-- The existing appointment blocks every first-date candidate; the next date
-- remains free. No Meta message, real customer mutation or LLM call is claimed.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $proof$
declare biz uuid:=gen_random_uuid();br uuid:=gen_random_uuid();cust uuid:=gen_random_uuid();
 conv uuid:=gen_random_uuid();msg uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();
 lock uuid:=gen_random_uuid();svc uuid:=gen_random_uuid();busy uuid:=gen_random_uuid();
 first_date date:=(now() at time zone 'Asia/Dubai')::date+1;
 s jsonb;loaded jsonb;initial_read jsonb;advanced jsonb;next_read jsonb;blocked boolean:=false;
begin
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode,timezone,currency_code)
 values(biz,'qa-conditional-'||biz,'Understanding conditional rollback QA','salon',true,'Asia/Dubai','AED');
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'Synthetic conditional branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic conditional customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode)
 values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_services(id,business_id,name,name_ar,duration_minutes,price_aed,active)
 values(svc,biz,'QA conditional service','خدمة تجريبية',60,50,true);
 insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(biz,br,svc,true);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated)
 values(msg,biz,conv,'customer',first_date::text||' at 18:00, if unavailable check '||(first_date+1)::text,false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count)
 values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '10 minutes',1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 -- Appointment is pre-existing operational context for the test, not an
 -- appointment created by a date preference. It is invisible outside this TX.
 insert into public.dabbir_appointments(id,business_id,branch_id,customer_id,service_id,starts_at,ends_at,status,booking_source,simulated)
 values(busy,biz,br,cust,svc,(first_date+time '18:00') at time zone 'Asia/Dubai',
  (first_date+time '18:00'+interval '7 hours') at time zone 'Asia/Dubai','confirmed','internal',false);
 loaded:=public.dabbir_semantic_load_v2(batch,lock);
 s:=jsonb_build_object('version',2,'goal','BOOK_SERVICE','pending_action','CHECK_AVAILABILITY',
  'scope',jsonb_build_object('business_id',biz,'customer_id',cust,'conversation_id',conv,'branch_id',br),
  'missing_fields','[]'::jsonb,'unresolved_references','[]'::jsonb,'operational_confidence',.99,
  'entities',jsonb_build_object(
   'service',jsonb_build_object('value',svc,'source','CUSTOMER_STATED','confidence',.99,'status','active'),
   'date',jsonb_build_object('value',first_date::text,'source','CUSTOMER_STATED','confidence',.99,'status','active',
    'alternative_value',(first_date+1)::text,'alternative_condition','NO_AVAILABILITY'),
   'time',jsonb_build_object('value','18:00','source','CUSTOMER_STATED','confidence',.99,'status','active')));
 perform public.dabbir_semantic_commit_v2(batch,lock,0,(loaded->>'message_revision')::bigint,s,'{}');
 begin perform public.dabbir_semantic_advance_availability_date_v1(batch,lock,1);
 exception when others then if sqlerrm='SEMANTIC_EMPTY_AVAILABILITY_REQUIRED' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'QA_ADVANCED_WITHOUT_REAL_READ';end if;
 initial_read:=public.dabbir_semantic_check_availability_v1(batch,lock,1);
 if jsonb_array_length(initial_read->'slots')<>0 then raise exception 'QA_FIRST_DATE_NOT_BLOCKED';end if;
 advanced:=public.dabbir_semantic_advance_availability_date_v1(batch,lock,1);
 if advanced->>'version'<>'2' or advanced#>>'{state,entities,date,value}' is distinct from (first_date+1)::text
  or advanced#>'{state,entities,date}' ? 'alternative_value' then raise exception 'QA_DATE_NOT_PERSISTED';end if;
 blocked:=false;
 begin perform public.dabbir_semantic_advance_availability_date_v1(batch,lock,1);
 exception when others then if sqlerrm='SEMANTIC_VERSION_CONFLICT' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'QA_DUPLICATE_DATE_ADVANCE';end if;
 next_read:=public.dabbir_semantic_check_availability_v1(batch,lock,2);
 if jsonb_array_length(next_read->'slots')=0 then raise exception 'QA_NEXT_DATE_EMPTY';end if;
 if ((next_read#>>'{slots,0,starts_at}')::timestamptz at time zone 'Asia/Dubai')::date<>first_date+1
 then raise exception 'QA_WRONG_DATE_RESULT';end if;
 if (select semantic_state#>>'{entities,date,value}' from public.dabbir_ai_conversation_state where business_id=biz and conversation_id=conv) is distinct from (first_date+1)::text
 then raise exception 'QA_CANONICAL_DATE_READBACK';end if;
 if (select count(*) from public.dabbir_appointments where business_id=biz)<>1 then raise exception 'QA_UNREQUESTED_BOOKING_CREATED';end if;
 insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,simulated,created_at)
 values(biz,conv,'customer','لا خلاص غيرت رأيي',false,now()+interval '1 second');
 blocked:=false;
 begin perform public.dabbir_semantic_check_availability_v1(batch,lock,2);
 exception when others then if sqlerrm='SEMANTIC_SUPERSEDED' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'QA_NEW_MESSAGE_NOT_SUPERSEDING';end if;
 perform set_config('dabbir.conditional_proof',jsonb_build_object('real_empty_read',true,
  'advance_without_read_denied',true,'canonical_date_readback',true,'next_date_actual_slots',jsonb_array_length(next_read->'slots'),
  'same_version_replay_denied',true,'new_message_supersedes',true,'new_bookings',0,
  'first_date',first_date::text,'next_date',(first_date+1)::text,'version_before',1,'version_after',2,
  'scope','REAL_POSTGRESQL_ROLLBACK_ONLY_NO_MODEL_OR_META')::text,true);
end $proof$;
select current_setting('dabbir.conditional_proof')::jsonb as evidence;
rollback;
