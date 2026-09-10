-- Explicit isolated QA direct-worker proof. Existing store activity, no new
-- ontology, no Meta connection, no invented previous order or delivery receipt.
-- The safe expected outcome is a persisted human request, not a retail order.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $setup$
declare biz uuid:=gen_random_uuid();br uuid:=gen_random_uuid();cust uuid:=gen_random_uuid();
 conv uuid:=gen_random_uuid();msg uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();
 own uuid:=gen_random_uuid();dispatch uuid:=gen_random_uuid();request_id bigint;
begin
 insert into auth.users(id,email) values(own,'qa-activity-'||own||'@example.invalid');
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode,timezone,currency_code)
 values(biz,'qa-worker-store-'||biz,'DABBIR AI QA runtime store 20260910','store',true,'Asia/Dubai','AED');
 insert into public.dabbir_memberships(business_id,user_id,role,status) values(biz,own,'owner','active');
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'Synthetic request branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic request customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode)
 values(conv,biz,cust,br,'whatsapp',false);
 insert into dabbir_private.cognitive_rollouts(business_id,mode,canary_percent) values(biz,'active',100);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated)
 values(msg,biz,conv,'customer','أحتاج أبدّل عنوان توصيل طلبي، وصلني تأكيد أمس',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,message_count,dispatch_token,ready_at)
 values(batch,biz,conv,cust,'whatsapp','READY',1,dispatch,now());
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 select net.http_post(url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
  body:=jsonb_build_object('dispatch_token',dispatch::text),headers:='{"Content-Type":"application/json"}'::jsonb,
  timeout_milliseconds:=55000) into request_id;
 perform set_config('dabbir.worker_store_fixture',jsonb_build_object('business',biz,'owner',own,
  'conversation',conv,'batch',batch,'request_id',request_id,'scope','REAL_DEPLOYED_WORKER_STORE_REQUEST_NO_META_CONNECTION')::text,true);
end $setup$;
select current_setting('dabbir.worker_store_fixture')::jsonb as fixture;
commit;
