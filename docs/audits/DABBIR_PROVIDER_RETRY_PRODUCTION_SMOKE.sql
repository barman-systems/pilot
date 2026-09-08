-- Isolated rollback-only fixtures; no dispatch, external send or real-customer replay.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $smoke$
declare biz uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid(); conv uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); lock uuid:=gen_random_uuid(); token uuid:=gen_random_uuid(); s jsonb; loaded jsonb; result jsonb; blocked boolean:=false;
begin
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode) values(biz,'qa-retry-'||biz,'Provider retry rollback QA','car_wash',true);
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'QA isolated branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic rollback customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode) values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated) values(msg,biz,conv,'customer','ابا غسيل باجر',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count,dispatch_token,attempt_count) values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '10 minutes',1,token,1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 loaded:=public.dabbir_semantic_load_v2(batch,lock);
 s:=jsonb_build_object('version',2,'scope',jsonb_build_object('business_id',biz,'conversation_id',conv,'customer_id',cust,'branch_id',br),
 'entities',jsonb_build_object('branch',jsonb_build_object('value',br,'source','DATABASE_FACT','confidence',1,'status','active')),
 'intent','BOOKING','pending_action','CLARIFY','missing_fields',jsonb_build_array('service','date','time'),'unresolved_references','[]'::jsonb,'overall_confidence',0.5);
 result:=public.dabbir_semantic_checkpoint_failure_v1(batch,lock,(loaded->>'version')::bigint,(loaded->>'message_revision')::bigint,s,'AI_PLANNER_UNAVAILABLE');
 if result->>'executable'<>'false' or not exists(select 1 from public.dabbir_ai_conversation_state where business_id=biz and conversation_id=conv and semantic_batch_id is null and semantic_state->>'recovery_required'='true') then raise exception 'QA_CHECKPOINT_AUTHORITY_FAILED'; end if;
 begin perform public.dabbir_semantic_execute_v2(batch,lock,(result->>'version')::bigint,'CREATE_BOOKING');exception when others then blocked:=true;end;
 if not blocked or exists(select 1 from public.dabbir_appointments where business_id=biz) then raise exception 'QA_CHECKPOINT_EXECUTION_ALLOWED'; end if;
 result:=public.dabbir_semantic_commit_v2(batch,lock,(result->>'version')::bigint,(loaded->>'message_revision')::bigint,s,'{"action":"CLARIFY"}');
 if result->>'replay'<>'false' then raise exception 'QA_RETRY_COMMIT_WAS_REPLAY'; end if;
 update public.dabbir_message_batches set state='RETRY',last_error='AI_PLANNER_UNAVAILABLE',next_attempt_at=now()+interval '20 seconds',lock_token=null,locked_until=null where id=batch;
 result:=public.dabbir_whatsapp_ai_provider_failover(token,'AI_PLANNER_UNAVAILABLE');
 if result->>'handled'<>'false' or result->>'state'<>'RETRY' or exists(select 1 from public.dabbir_handoffs where business_id=biz) then raise exception 'QA_FIRST_RETRY_HANDOFF'; end if;
 if exists(select 1 from public.dabbir_whatsapp_ai_provider_failover_candidates(25) c where c.dispatch_token=token) then raise exception 'QA_CRON_STOLE_FIRST_RETRY'; end if;
 update public.dabbir_message_batches set attempt_count=2 where id=batch;
 result:=public.dabbir_whatsapp_ai_provider_failover(token,'AI_PLANNER_UNAVAILABLE');
 if result->>'handled'<>'true' or not exists(select 1 from public.dabbir_handoffs where business_id=biz and reason='AI_PROVIDER_FAILED_TWICE' and metadata->>'customer_requested_human'='false') then raise exception 'QA_SECOND_FAILURE_HANDOFF'; end if;
 result:=public.dabbir_whatsapp_ai_provider_failover(token,'AI_PROVIDER_FAILED_TWICE');
 if result->>'handled'<>'true' or (select count(*) from public.dabbir_handoffs where business_id=biz)<>1 then raise exception 'QA_HANDOFF_NOT_IDEMPOTENT'; end if;
 insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,created_at,simulated) values(biz,conv,'customer','هلا',now()+interval '1 minute',false);
 result:=public.dabbir_whatsapp_ai_provider_failover(token,'AI_PROVIDER_FAILED_TWICE');
 if result->>'handled'<>'false' or result->>'state'<>'SUPERSEDED' then raise exception 'QA_OBSOLETE_ACK_ALLOWED'; end if;
end $smoke$;
select 'PASS' as verdict,'checkpoint_no_execution,retry_commit,first_retry,cron_exclusion,second_handoff,false_customer_request,idempotency,newer_message' as checks,'NONE' as external_sends;
rollback;
