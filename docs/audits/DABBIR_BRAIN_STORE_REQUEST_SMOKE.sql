-- Actual store request/handoff persistence, with no Meta delivery or order claim.
-- All QA rows are created and rolled back in this transaction.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $proof$
declare
 biz uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid();
 conv uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid();
 lock uuid:=gen_random_uuid(); ctx jsonb; loaded jsonb; first_result jsonb; replay jsonb;
 s jsonb; committed jsonb;
begin
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode)
 values(biz,'qa-store-request-'||biz,'DABBIR isolated store request proof','store',true);
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'QA branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic request customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode)
 values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated)
 values(msg,biz,conv,'customer','أبغي أرجع الطلب، وصلني المقاس الغلط',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,lock_token,locked_until,message_count)
 values(batch,biz,conv,cust,'whatsapp','PROCESSING',lock,now()+interval '5 minutes',1);
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 ctx:=public.dabbir_whatsapp_ai_context(batch,lock);
 loaded:=public.dabbir_semantic_load_v2(batch,lock);
 if ctx#>>'{business,business_type}' is distinct from 'store' or jsonb_array_length(ctx->'services')<>0 then raise exception 'QA_STORE_CONTEXT_FAILED'; end if;
 s:=jsonb_build_object('version',2,'scope',jsonb_build_object('business_id',biz,'conversation_id',conv,'customer_id',cust,'branch_id',br),
   'goal','HUMAN_ASSISTANCE','entities','{}'::jsonb,'missing_fields','[]'::jsonb,'unresolved_references','[]'::jsonb,
   'pending_action','HANDOFF','operational_confidence',1);
 committed:=public.dabbir_semantic_commit_v2(batch,lock,0,1,s,'{"action":"HANDOFF","reason":"NO_CONFIGURED_SERVICE_CAPABILITY"}');
 perform public.dabbir_semantic_assert_current_v2(batch,lock,(committed->>'version')::bigint);
 first_result:=public.dabbir_whatsapp_ai_handoff(biz,conv,'SUPPORT','NO_CONFIGURED_SERVICE_CAPABILITY','Understanding V2 requires human assistance');
 replay:=public.dabbir_whatsapp_ai_handoff(biz,conv,'SUPPORT','NO_CONFIGURED_SERVICE_CAPABILITY','Understanding V2 requires human assistance');
 if first_result->>'verified' is distinct from 'true' or first_result->>'handoff_id' is distinct from replay->>'handoff_id'
   or (select count(*) from public.dabbir_handoffs where business_id=biz and conversation_id=conv)<>1
   or (select count(*) from public.dabbir_orders where business_id=biz)<>0
   or (select count(*) from public.dabbir_appointments where business_id=biz)<>0
   or (select state from public.dabbir_conversations where id=conv) is distinct from 'action_required'
   or (select pending_action from public.dabbir_ai_conversation_state where conversation_id=conv) is distinct from 'handoff'
 then raise exception 'QA_STORE_REQUEST_NOT_DURABLE_OR_DUPLICATED'; end if;
 perform set_config('dabbir.store_request_evidence',jsonb_build_object('activity','store','context_loaded',true,'canonical_decision_persisted',true,
   'real_handoff_verified',true,'handoff_count',1,'duplicate_handoff_count',0,'conversation_state','action_required',
   'order_count',0,'appointment_count',0,'order_execution_proven',false,'meta_delivery_proven',false,'rolled_back',true)::text,true);
end $proof$;
select current_setting('dabbir.store_request_evidence')::jsonb as evidence;
rollback;
