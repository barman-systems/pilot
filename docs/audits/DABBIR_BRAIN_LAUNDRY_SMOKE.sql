-- Rollback-only synthetic database journey; no provider delivery is claimed.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $smoke$
declare biz uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid(); conv uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); lock uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid(); s jsonb; loaded jsonb; ctx jsonb; result jsonb; replay jsonb; blocked boolean:=false; own uuid:=gen_random_uuid(); contract jsonb; conn uuid:=gen_random_uuid(); past uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(own,'qa-activity-'||own||'@example.invalid');
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode) values(biz,'qa-brain-'||biz,'Understanding V2 rollback QA','laundry',true);
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'QA isolated branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic rollback customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode) values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_services(id,business_id,name,name_ar,duration_minutes,price_aed,active) values(svc,biz,'QA laundry','كوي تجريبي',60,50,true);
 insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(biz,br,svc,true);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated) values(msg,biz,conv,'customer','ابا غسيل باجر',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count) values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '10 minutes',1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 insert into public.dabbir_memberships(business_id,user_id,role,status) values(biz,own,'owner','active');
 perform set_config('request.jwt.claim.sub',own::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',own)::text,true);
 set local role authenticated;
 result:=public.dabbir_activity_service_configure_v1(biz,br,svc,0,'{"activity_type":"laundry","delivery_modes":["PICKUP"]}');
 reset role;
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 contract:=dabbir_private.activity_contract_v1(biz,br,svc);
 -- This receipt and outbound reservation are synthetic database fixtures only.
 insert into public.dabbir_whatsapp_location_receipts(message_id,business_id,conversation_id,latitude,longitude,label) values(msg,biz,conv,24.45,54.37,'Synthetic QA GPS');
 insert into public.dabbir_whatsapp_connections(id,business_id,branch_id,waba_id,phone_number_id,access_token_ciphertext,access_token_iv,access_token_tag,connected_by,token_context_id) values(conn,biz,br,'qa-'||conn,'qa-'||conn,'SYNTHETIC-NOT-A-CREDENTIAL','synthetic','synthetic',own,gen_random_uuid());
 insert into public.dabbir_whatsapp_outbound_reservations(business_id,connection_id,conversation_id,idempotency_key,payload_hash,recipient_handle,body,state,provider_message_id)
 values(biz,conn,conv,'activity-qa-offer-'||conv,repeat('a',64),'qa-synthetic','Synthetic QA slot fixture','SENT','activity-qa-provider-'||conv);
 -- Current-minute completed fixture obeys prevent_past_appointment; yesterday resolution is covered by the deterministic benchmark.
 insert into public.dabbir_appointments(id,business_id,branch_id,customer_id,service_id,starts_at,status,booking_source,simulated) values(past,biz,br,cust,svc,date_trunc('minute',now()),'completed','internal',false);
 ctx:=public.dabbir_whatsapp_ai_context(batch,lock);
 loaded:=public.dabbir_semantic_load_v2(batch,lock);
 if jsonb_array_length(loaded->'operational_history')<>1 or loaded#>>'{operational_history,0,id}' is distinct from past::text then raise exception 'QA_HISTORICAL_CONTEXT_FAILED'; end if;
 if loaded->>'message_revision'<>'1' or jsonb_array_length(ctx->'services')<>1 then raise exception 'QA_CONTEXT_FAILED'; end if;
 s:=jsonb_build_object('version',2,'scope',jsonb_build_object('business_id',biz,'conversation_id',conv,'customer_id',cust,'branch_id',br),'entities',jsonb_build_object('service',jsonb_build_object('value',svc,'source','CUSTOMER_STATED','confidence',.98,'status','active')),'missing_fields',jsonb_build_array('time'),'unresolved_references','[]'::jsonb,'pending_action','CLARIFY','operational_confidence',.55);
 s:=jsonb_set(s,'{entities,service,historical_appointment_id}',to_jsonb(past::text));
 s:=s||jsonb_build_object('activity_contract_version',contract->>'contract_version','delivery_mode','PICKUP','entities',(s->'entities')||jsonb_build_object(
 'branch',jsonb_build_object('value',br,'source','DATABASE_FACT','confidence',1,'status','active'),
 'delivery_mode',jsonb_build_object('value','PICKUP','source','DATABASE_FACT','confidence',1,'status','active'),
 'vehicle',jsonb_build_object('value','station','source','CUSTOMER_STATED','confidence',1,'status','active'),
 'location',jsonb_build_object('value',jsonb_build_object('lat',24.45,'lng',54.37),'receipt_id',msg,'source','PROVIDER_VERIFIED','confidence',1,'status','active')));
 result:=public.dabbir_semantic_commit_v2(batch,lock,0,1,s,'{"clarification_count":1}');
 replay:=public.dabbir_semantic_commit_v2(batch,lock,0,1,s,'{}');
 if result->>'version'<>'1' or replay->>'replay'<>'true' then raise exception 'QA_CAS_REPLAY_FAILED'; end if;
 begin perform public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING'); exception when others then if sqlerrm='SEMANTIC_OPERATION_NOT_AUTHORIZED' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_MUTATION_NOT_BLOCKED'; end if;

 -- Synthetic presentation fixture inside this rolled-back transaction only;
 -- no Meta message or provider delivery is claimed by this database test.
 s:=s||jsonb_build_object('goal','BOOK_SERVICE','pending_action','CHECK_AVAILABILITY','operational_confidence',.98,'missing_fields','[]'::jsonb);
 s:=jsonb_set(s,'{entities,date}',jsonb_build_object('value',(date_trunc('day',now() at time zone 'Asia/Dubai')+interval '1 day')::date::text,'source','CUSTOMER_STATED','confidence',1,'status','active'));
 s:=jsonb_set(s,'{entities,time}',jsonb_build_object('value','18:00','source','CUSTOMER_STATED','confidence',1,'status','active'));
 update public.dabbir_ai_conversation_state set semantic_state=s where business_id=biz and conversation_id=conv;
 loaded:=public.dabbir_semantic_check_availability_v1(batch,lock,1);
 if (select semantic_state#>>'{last_tool_result,action}' from public.dabbir_ai_conversation_state where business_id=biz and conversation_id=conv) is distinct from 'CHECK_AVAILABILITY' then raise exception 'QA_TOOL_RESULT_NOT_PERSISTED'; end if;
 if jsonb_array_length(loaded->'slots')=0 then raise exception 'QA_AVAILABILITY_EMPTY'; end if;
 s:=s||jsonb_build_object('pending_action','CREATE_BOOKING','operational_confidence',.98,'missing_fields','[]'::jsonb,'entities',(s->'entities')||jsonb_build_object('slot',jsonb_build_object('value',0,'source','CUSTOMER_CONFIRMED','confidence',1,'status','active','starts_at',loaded#>>'{slots,0,starts_at}')));
 update public.dabbir_ai_conversation_state set semantic_state=s,pending_action='choose_slot',payload=jsonb_build_object('activity_contract_version',contract->>'contract_version','provider_message_id','activity-qa-provider-'||conv,'mode','booking','presented',true,'slots',loaded->'slots'),expires_at=now()+interval '10 minutes' where business_id=biz and conversation_id=conv;
 -- Even a caller claiming no missing fields cannot bypass database provenance.
 update public.dabbir_ai_conversation_state set semantic_state=jsonb_set(s,'{entities,location,source}','"AI_INFERENCE"') where business_id=biz and conversation_id=conv;
 blocked:=false;
 begin perform public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING'); exception when others then if sqlerrm like 'ACTIVITY_REQUIRED_FACT_UNVERIFIED:location%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_INFERRED_LOCATION_NOT_BLOCKED'; end if;
 update public.dabbir_ai_conversation_state set semantic_state=s where business_id=biz and conversation_id=conv;
 update public.dabbir_appointments set status='cancelled' where id=past;
 blocked:=false;
 begin perform public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING'); exception when others then if sqlerrm='ACTIVITY_HISTORICAL_REFERENCE_STALE' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_REVOKED_HISTORY_NOT_BLOCKED'; end if;
 update public.dabbir_appointments set status='completed' where id=past;
 result:=public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING');
 replay:=public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING');
 if result->>'verified'<>'true' or replay->>'idempotent_replay'<>'true' or (select count(*) from public.dabbir_appointments where business_id=biz)<>2 then raise exception 'QA_BOOKING_REPLAY_FAILED'; end if;
 if not exists(select 1 from public.dabbir_appointments where business_id=biz and service_latitude=24.45 and service_longitude=54.37 and activity_intelligence->>'delivery_mode'='PICKUP') then raise exception 'QA_GPS_READBACK_FAILED'; end if;
 if not exists(select 1 from public.dabbir_customer_memory where business_id=biz and customer_id=cust and status='verified' and memory_key='last_verified_service') then raise exception 'QA_VERIFIED_MEMORY_FAILED'; end if;

 s:=s||jsonb_build_object('pending_action','RESCHEDULE_BOOKING','entities',(s->'entities')||jsonb_build_object('appointment',jsonb_build_object('value',result->>'appointment_id','source','CUSTOMER_CONFIRMED','confidence',1,'status','active')));
 loaded:=public.dabbir_whatsapp_ai_check_availability(biz,conv,svc,null,date_trunc('day',now() at time zone 'Asia/Dubai')+interval '2 days 18 hours');
 s:=jsonb_set(s,'{entities,slot,starts_at}',to_jsonb(loaded#>>'{slots,0,starts_at}'));
 update public.dabbir_ai_conversation_state set semantic_state=s,pending_action='choose_slot',payload=jsonb_build_object('activity_contract_version',contract->>'contract_version','provider_message_id','activity-qa-provider-'||conv,'mode','reschedule','appointment_id',result->>'appointment_id','presented',true,'slots',loaded->'slots') where business_id=biz and conversation_id=conv;
 result:=public.dabbir_semantic_execute_v2(batch,lock,1,'RESCHEDULE_BOOKING');
 if (result->>'starts_at')::timestamptz<>(loaded#>>'{slots,0,starts_at}')::timestamptz then raise exception 'QA_RESCHEDULE_FAILED'; end if;
 s:=s||jsonb_build_object('pending_action','CANCEL_BOOKING','entities',(s->'entities')||jsonb_build_object('appointment',jsonb_build_object('value',result->>'appointment_id','source','CUSTOMER_CONFIRMED','confidence',1,'status','active')));
 update public.dabbir_ai_conversation_state set semantic_state=s where business_id=biz and conversation_id=conv;
 result:=public.dabbir_semantic_execute_v2(batch,lock,1,'CANCEL_BOOKING');
 if result->>'status'<>'cancelled' then raise exception 'QA_CANCEL_FAILED'; end if;

 insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,simulated,created_at) values(biz,conv,'customer','لا قصدي عقب باجر',false,now()-interval '1 second');
 blocked:=false;
 begin perform public.dabbir_semantic_assert_current_v2(batch,lock,1); exception when others then if sqlerrm='SEMANTIC_SUPERSEDED' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_STALE_NOT_BLOCKED'; end if;
 perform set_config('dabbir.smoke_result',jsonb_build_object('suite','brain-production-laundry-rollback-only','activity','laundry','delivery_mode','PICKUP','historical_context',true,'historical_revalidation',true,'canonical_availability',true,'read_result_persisted',true,'inferred_location_blocked',true,'missing_vehicle_blocked',null,'gps_readback',true,'provider_evidence','SYNTHETIC_FIXTURE_ONLY','context',true,'semantic_load',true,'commit',true,'duplicate_replay',true,'missing_mutation_blocked',true,'backdated_new_message_blocked',true,'availability',true,'booking_readback',true,'booking_idempotency',true,'verified_memory',true,'cancel_readback',true,'reschedule_readback',true)::text,true);
end $smoke$;
select current_setting('dabbir.smoke_result')::jsonb as result;
rollback;
