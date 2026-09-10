-- Explicit isolated QA setup. Executes the deployed worker and real model/DB.
-- No phone, Meta connection, fake signature, or fake presentation receipt.
-- This is a direct worker diagnostic, never real-device WhatsApp proof.
-- Read the recorded result and invoke guarded QA cleanup after each run.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
do $setup$
declare biz uuid:=gen_random_uuid();br uuid:=gen_random_uuid();cust uuid:=gen_random_uuid();
 conv uuid:=gen_random_uuid();msg uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();
 svc uuid:=gen_random_uuid();own uuid:=gen_random_uuid();dispatch uuid:=gen_random_uuid();
 first_date date:=(now() at time zone 'Asia/Dubai')::date; request_id bigint;
begin
 if (now() at time zone 'Asia/Dubai')::time >= time '17:30' then
  raise exception 'QA_TODAY_WINDOW_PASSED';
 end if;
 insert into auth.users(id,email) values(own,'qa-activity-'||own||'@example.invalid');
 insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode,timezone,currency_code)
 values(biz,'qa-worker-conditional-'||biz,'DABBIR AI QA runtime conditional 20260910','salon',true,'Asia/Dubai','AED');
 insert into public.dabbir_business_branches(id,business_id,name) values(br,biz,'Synthetic runtime branch');
 insert into public.dabbir_customers(id,business_id,display_name) values(cust,biz,'Synthetic runtime customer');
 insert into public.dabbir_conversations(id,business_id,customer_id,branch_id,channel_type,demo_mode)
 values(conv,biz,cust,br,'whatsapp',false);
 insert into public.dabbir_services(id,business_id,name,name_ar,duration_minutes,price_aed,active)
 values(svc,biz,'QA haircut','قص شعر',60,50,true);
 insert into public.dabbir_branch_services(business_id,branch_id,service_id,active) values(biz,br,svc,true);
 insert into public.dabbir_memberships(business_id,user_id,role,status) values(biz,own,'owner','active');
 perform set_config('request.jwt.claim.sub',own::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',own)::text,true);
 set local role authenticated;
 perform public.dabbir_activity_service_configure_v1(biz,br,svc,0,'{"activity_type":"salon","delivery_modes":["AT_BUSINESS"]}');
 reset role;
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into dabbir_private.cognitive_rollouts(business_id,mode,canary_percent) values(biz,'active',100);
 insert into public.dabbir_appointments(business_id,branch_id,customer_id,service_id,starts_at,ends_at,status,booking_source,simulated)
 values(biz,br,cust,svc,(first_date+time '18:00') at time zone 'Asia/Dubai',
  (first_date+time '18:00'+interval '7 hours') at time zone 'Asia/Dubai','confirmed','internal',false);
 insert into public.dabbir_messages(id,business_id,conversation_id,sender_type,body,simulated)
 values(msg,biz,conv,'customer','أبي قص شعر الساعة 18:00، إذا ما فيه اليوم شوف باجر',false);
 insert into public.dabbir_message_batches(id,business_id,conversation_id,customer_id,channel_type,state,message_count,dispatch_token,ready_at)
 values(batch,biz,conv,cust,'whatsapp','READY',1,dispatch,now());
 insert into public.dabbir_message_batch_items(business_id,batch_id,message_id,ordinal) values(biz,batch,msg,1);
 select net.http_post(url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
  body:=jsonb_build_object('dispatch_token',dispatch::text),headers:='{"Content-Type":"application/json"}'::jsonb,
  timeout_milliseconds:=55000) into request_id;
 perform set_config('dabbir.worker_conditional_fixture',jsonb_build_object(
  'business',biz,'owner',own,'conversation',conv,'batch',batch,'request_id',request_id,
  'first_date',first_date,'expected_next_date',first_date+1,'preexisting_bookings',1,
  'scope','REAL_DEPLOYED_WORKER_MODEL_AND_DATABASE_NO_META_CONNECTION')::text,true);
end $setup$;
select current_setting('dabbir.worker_conditional_fixture')::jsonb as fixture;
commit;
