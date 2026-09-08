begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $smoke$
declare biz uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid(); conv uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); lock uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid(); s jsonb; loaded jsonb; ctx jsonb; result jsonb; replay jsonb; blocked boolean:=false;
begin
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode) values(biz,'qa-understanding-'||biz,'Understanding V2 rollback QA','car_wash',true);
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'QA isolated branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic rollback customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode) values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_services(id,business_id,name,name_ar,duration_minutes,price_aed,active) values(svc,biz,'QA wash','غسيل تجريبي',60,50,true);
 insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(biz,br,svc,true);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated) values(msg,biz,conv,'customer','ابا غسيل باجر',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count) values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '10 minutes',1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 ctx:=public.dabbir_whatsapp_ai_context(batch,lock);
 loaded:=public.dabbir_semantic_load_v2(batch,lock);
 if loaded->>'message_revision'<>'1' or jsonb_array_length(ctx->'services')<>1 then raise exception 'QA_CONTEXT_FAILED'; end if;
 s:=jsonb_build_object('version',2,'scope',jsonb_build_object('business_id',biz,'conversation_id',conv,'customer_id',cust,'branch_id',br),'entities',jsonb_build_object('service',jsonb_build_object('value',svc,'source','CUSTOMER_STATED','confidence',.98,'status','active')),'missing_fields',jsonb_build_array('time'),'unresolved_references','[]'::jsonb,'pending_action','CLARIFY','operational_confidence',.55);
 result:=public.dabbir_semantic_commit_v2(batch,lock,0,1,s,'{"clarification_count":1}');
 replay:=public.dabbir_semantic_commit_v2(batch,lock,0,1,s,'{}');
 if result->>'version'<>'1' or replay->>'replay'<>'true' then raise exception 'QA_CAS_REPLAY_FAILED'; end if;
 begin perform public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING'); exception when others then if sqlerrm='SEMANTIC_OPERATION_NOT_AUTHORIZED' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_MUTATION_NOT_BLOCKED'; end if;

 -- Synthetic presentation fixture inside this rolled-back transaction only;
 -- no Meta message or provider delivery is claimed by this database test.
 loaded:=public.dabbir_whatsapp_ai_check_availability(biz,conv,svc,null,date_trunc('day',now() at time zone 'Asia/Dubai')+interval '1 day 18 hours');
 if jsonb_array_length(loaded->'slots')=0 then raise exception 'QA_AVAILABILITY_EMPTY'; end if;
 s:=s||jsonb_build_object('pending_action','CREATE_BOOKING','operational_confidence',.98,'missing_fields','[]'::jsonb,'entities',(s->'entities')||jsonb_build_object('slot',jsonb_build_object('value',0,'source','CUSTOMER_CONFIRMED','confidence',1,'status','active','starts_at',loaded#>>'{slots,0,starts_at}')));
 update public.dabbir_ai_conversation_state set semantic_state=s,pending_action='choose_slot',payload=jsonb_build_object('mode','booking','presented',true,'slots',loaded->'slots'),expires_at=now()+interval '10 minutes' where business_id=biz and conversation_id=conv;
 result:=public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING');
 replay:=public.dabbir_semantic_execute_v2(batch,lock,1,'CREATE_BOOKING');
 if result->>'verified'<>'true' or replay->>'idempotent_replay'<>'true' or (select count(*) from public.dabbir_appointments where business_id=biz)<>1 then raise exception 'QA_BOOKING_REPLAY_FAILED'; end if;
 if not exists(select 1 from public.dabbir_customer_memory where business_id=biz and customer_id=cust and status='verified' and memory_key='last_verified_service') then raise exception 'QA_VERIFIED_MEMORY_FAILED'; end if;

 s:=s||jsonb_build_object('pending_action','RESCHEDULE_BOOKING','entities',(s->'entities')||jsonb_build_object('appointment',jsonb_build_object('value',result->>'appointment_id','source','CUSTOMER_CONFIRMED','confidence',1,'status','active')));
 loaded:=public.dabbir_whatsapp_ai_check_availability(biz,conv,svc,null,date_trunc('day',now() at time zone 'Asia/Dubai')+interval '2 days 18 hours');
 s:=jsonb_set(s,'{entities,slot,starts_at}',to_jsonb(loaded#>>'{slots,0,starts_at}'));
 update public.dabbir_ai_conversation_state set semantic_state=s,pending_action='choose_slot',payload=jsonb_build_object('mode','reschedule','appointment_id',result->>'appointment_id','presented',true,'slots',loaded->'slots') where business_id=biz and conversation_id=conv;
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
 perform set_config('dabbir.smoke_result',jsonb_build_object('suite','production-rollback-only','context',true,'semantic_load',true,'commit',true,'duplicate_replay',true,'missing_mutation_blocked',true,'backdated_new_message_blocked',true,'availability',true,'booking_readback',true,'booking_idempotency',true,'verified_memory',true,'cancel_readback',true,'reschedule_readback',true)::text,true);
end $smoke$;
select current_setting('dabbir.smoke_result')::jsonb as result;
rollback;

begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $smoke$
declare biz uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid(); conv uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); lock uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid(); s jsonb; loaded jsonb; ctx jsonb; result jsonb; replay jsonb; blocked boolean:=false; own uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); proposal uuid; approved jsonb; audit_count int;
begin
 insert into auth.users(id,email) values(own,'qa-understanding-'||own||'@example.invalid'),(outsider,'qa-understanding-'||outsider||'@example.invalid');
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode) values(biz,'qa-understanding-'||biz,'Understanding V2 rollback QA','car_wash',true);
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'QA isolated branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic rollback customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode) values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_services(id,business_id,name,name_ar,duration_minutes,price_aed,active) values(svc,biz,'QA wash','غسيل تجريبي',60,50,true);
 insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(biz,br,svc,true);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated) values(msg,biz,conv,'customer','ابا غسيل باجر',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count) values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '10 minutes',1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);

 insert into public.dabbir_memberships(business_id,user_id,role,status) values(biz,own,'owner','active');
 perform set_config('request.jwt.claim.sub',own::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',own)::text,true);
 set local role authenticated;
 result:=public.dabbir_knowledge_propose_v2(biz,conv,null,'service','VIP',svc);
 proposal:=(result->>'id')::uuid;
 if result->>'active'<>'false' then raise exception 'QA_PROPOSAL_AUTO_ACTIVE'; end if;
 approved:=public.dabbir_knowledge_review_v2(biz,proposal,'approve');
 result:=public.dabbir_knowledge_review_v2(biz,proposal,'revoke');
 if result->>'active'<>'false' then raise exception 'QA_REVOKE_FAILED'; end if;
 result:=public.dabbir_knowledge_review_v2(biz,proposal,'rollback');
 if result->>'active'<>'true' or (result->>'version')::int<=(approved->>'version')::int then raise exception 'QA_ROLLBACK_FAILED'; end if;
 select count(*) into audit_count from public.dabbir_ai_understanding_events where business_id=biz and proposal_id=proposal;
 if audit_count<>4 then raise exception 'QA_AUDIT_FAILED'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
 if exists(select 1 from public.dabbir_ai_knowledge_proposals where business_id=biz) or exists(select 1 from public.dabbir_ai_understanding_events where business_id=biz) then raise exception 'QA_CROSS_TENANT_READ'; end if;
 begin perform public.dabbir_knowledge_review_v2(biz,proposal,'revoke'); exception when others then if sqlerrm='OWNER_REQUIRED' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'QA_CROSS_TENANT_REVIEW'; end if;
 reset role;
 perform set_config('dabbir.smoke_result','{"suite":"owner-rls-production-rollback","proposal_inactive":true,"owner_approval":true,"revoke":true,"rollback_version":true,"audit_events":4,"other_user_read_blocked":true,"other_user_review_blocked":true}',true);
end $smoke$;
select current_setting('dabbir.smoke_result')::jsonb as result;
rollback;
