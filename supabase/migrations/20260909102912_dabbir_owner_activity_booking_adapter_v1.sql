-- Owner commands use the same activity facts, service requirements, location
-- receipts, geofence and calendar authority as the WhatsApp executor. An owner
-- approval is an authenticated actor, never a flag supplied by a model.
create or replace function dabbir_private.activity_owner_authorized_v1(p_business_id uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='pg_catalog','public','auth' as $$
 select coalesce(auth.role(),'')='authenticated' and p_actor is not null and p_actor=auth.uid()
  and dabbir_private.is_active_member(p_business_id)
  and exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=p_actor and m.role='owner' and m.status='active');
$$;
revoke all on function dabbir_private.activity_owner_authorized_v1(uuid,uuid) from public,anon,authenticated;

do $migration$
declare definition text; anchor text;
begin
 select pg_get_functiondef('dabbir_private.activity_assert_state_v1(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position('activity_assert_action_v1' in definition)=0 then raise exception 'ACTIVITY_ACTION_AUTHORITY_REQUIRED'; end if;
 definition:=replace(definition,'activity_assert_state_v1(p_business_id uuid, p_branch_id uuid, p_customer_id uuid, p_conversation_id uuid, p_state jsonb, p_service_id uuid)',
  'activity_assert_execution_v1(p_business_id uuid, p_branch_id uuid, p_customer_id uuid, p_conversation_id uuid, p_state jsonb, p_service_id uuid, p_owner_id uuid)');
 if position('activity_assert_execution_v1' in definition)=0 then raise exception 'ACTIVITY_EXECUTOR_SIGNATURE_DRIFT'; end if;
 anchor:=$old$if (contract->>'automatic_booking')::boolean is not true or (contract->>'owner_approval')::boolean is true then raise exception 'ACTIVITY_OWNER_APPROVAL_REQUIRED'; end if;$old$;
 if position(anchor in definition)=0 then raise exception 'ACTIVITY_OWNER_POLICY_DRIFT'; end if;
 definition:=replace(definition,anchor,$new$
 if p_owner_id is not null and not dabbir_private.activity_owner_authorized_v1(p_business_id,p_owner_id) then raise exception 'OWNER_REQUIRED'; end if;
 if p_owner_id is null and ((contract->>'automatic_booking')::boolean is not true or (contract->>'owner_approval')::boolean is true) then raise exception 'ACTIVITY_OWNER_APPROVAL_REQUIRED'; end if;
 $new$);
 execute definition;
end $migration$;
revoke all on function dabbir_private.activity_assert_execution_v1(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;

create or replace function dabbir_private.activity_assert_state_v1(p_business_id uuid,p_branch_id uuid,p_customer_id uuid,p_conversation_id uuid,p_state jsonb,p_service_id uuid) returns jsonb
language sql security definer set search_path='pg_catalog','public' as $$
 select dabbir_private.activity_assert_execution_v1(p_business_id,p_branch_id,p_customer_id,p_conversation_id,p_state,p_service_id,null);
$$;
revoke all on function dabbir_private.activity_assert_state_v1(uuid,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;

create or replace function public.dabbir_owner_activity_booking_v1(p_business_id uuid,p_request jsonb,p_execute boolean default false,p_quote_hash text default null,p_operation_key text default null) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare
 actor uuid:=auth.uid(); branch uuid; customer uuid; service uuid; worker uuid; conversation uuid;
 contract jsonb; entities jsonb:='{}'; state jsonb; required text[]; k text; v jsonb; quote jsonb;
 mode text; tz text; start_at timestamptz; end_at timestamptz; minutes integer; price numeric; currency text;
 receipt public.dabbir_whatsapp_location_receipts%rowtype; s public.dabbir_services%rowtype;
 appointment public.dabbir_appointments%rowtype; fingerprint text; expected_hash text; replay boolean:=false;
begin
 if not dabbir_private.activity_owner_authorized_v1(p_business_id,actor) then raise exception 'OWNER_REQUIRED'; end if;
 if p_execute is null then raise exception 'OWNER_BOOKING_EXECUTION_MODE_REQUIRED'; end if;
 if jsonb_typeof(p_request) is distinct from 'object' then raise exception 'OWNER_BOOKING_CONTEXT_REQUIRED'; end if;
 branch:=nullif(p_request->>'branch_id','')::uuid; customer:=nullif(p_request->>'customer_id','')::uuid;
 service:=nullif(p_request->>'service_id','')::uuid; worker:=nullif(p_request->>'worker_id','')::uuid;
 if branch is null or customer is null or service is null then raise exception 'OWNER_BOOKING_CONTEXT_REQUIRED'; end if;
 if p_execute then
  -- Match the semantic executor's service/config locks so an approved quote
  -- cannot race a change to the service terms or scoped owner rules.
  perform 1 from public.dabbir_services where business_id=p_business_id and id=service for share;
  perform 1 from public.dabbir_branch_services where business_id=p_business_id and branch_id=branch and service_id=service for share;
  perform 1 from public.dabbir_business_branches where business_id=p_business_id and id=branch for share;
  perform 1 from public.dabbir_memberships where business_id=p_business_id and user_id=actor for share;
  if worker is not null then perform 1 from public.dabbir_worker_services where business_id=p_business_id and worker_id=worker and service_id=service for share; end if;
  if not dabbir_private.activity_owner_authorized_v1(p_business_id,actor) then raise exception 'OWNER_REQUIRED'; end if;
 end if;
 if not exists(select 1 from public.dabbir_customers c where c.business_id=p_business_id and c.id=customer) then raise exception 'ACTIVITY_CUSTOMER_SCOPE_INVALID'; end if;
 contract:=dabbir_private.activity_assert_action_v1(p_business_id,branch,service,'CREATE_BOOKING');
 select b.timezone,b.currency_code into tz,currency from public.dabbir_businesses b where b.id=p_business_id;
 if nullif(tz,'') is null or nullif(currency,'') is null or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'BUSINESS_PROFILE_UNVERIFIED'; end if;
 if coalesce(p_request->>'local_start','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then raise exception 'OWNER_BOOKING_TIME_REQUIRED'; end if;
 start_at:=(p_request->>'local_start')::timestamp at time zone tz;
 if (start_at at time zone tz) is distinct from (p_request->>'local_start')::timestamp then raise exception 'OWNER_BOOKING_TIME_INVALID'; end if;
 mode:=p_request->>'delivery_mode';
 if mode is null or mode='HYBRID' or not (contract->'delivery_modes' ? mode) then raise exception 'ACTIVITY_DELIVERY_MODE_UNRESOLVED'; end if;
 select * into s from public.dabbir_services se where se.business_id=p_business_id and se.id=service and se.active;
 minutes:=s.duration_minutes; price:=s.price_aed;
 if worker is not null then
  if not exists(select 1 from public.dabbir_workers w join public.dabbir_worker_branches wb on wb.business_id=w.business_id and wb.worker_id=w.id and wb.active
   join public.dabbir_worker_services ws on ws.business_id=w.business_id and ws.worker_id=w.id and ws.service_id=service and ws.active
   where w.business_id=p_business_id and w.id=worker and w.status='active' and wb.branch_id=branch) then raise exception 'ACTIVITY_WORKER_SCOPE_INVALID'; end if;
  select coalesce(ws.duration_minutes,minutes),coalesce(ws.price_aed,price) into minutes,price from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=worker and ws.service_id=service and ws.active;
 end if;
 if minutes is null or minutes<5 or minutes>1440 or price is null or price<0 then raise exception 'ACTIVITY_SERVICE_TERMS_UNVERIFIED'; end if;
 end_at:=start_at+make_interval(mins=>minutes);
 select array_agg(distinct f) into required from (
  select unnest(array['service','branch','delivery_mode','slot']) f
  union select jsonb_array_elements_text(contract#>array['mode_requirements',mode,'required'])
  union select 'location' where mode in ('MOBILE','AT_CUSTOMER','PICKUP','DELIVERY')
 ) q;
 foreach k in array required loop
  v:=case k when 'service' then to_jsonb(service) when 'branch' then to_jsonb(branch) when 'delivery_mode' then to_jsonb(mode)
   when 'slot' then to_jsonb(0) when 'worker' then to_jsonb(worker)
   when 'date' then to_jsonb((start_at at time zone tz)::date) when 'time' then to_jsonb((start_at at time zone tz)::time)
   else p_request->'facts'->k end;
  if k='location' then
   select r.* into receipt from public.dabbir_whatsapp_location_receipts r join public.dabbir_conversations c on c.business_id=r.business_id and c.id=r.conversation_id
    where r.business_id=p_business_id and r.message_id::text=p_request->>'location_receipt_id' and c.customer_id=customer and c.branch_id=branch and not c.demo_mode and r.created_at>now()-interval '24 hours';
   if not found then raise exception 'ACTIVITY_LOCATION_RECEIPT_UNVERIFIED'; end if;
   conversation:=receipt.conversation_id;
   v:=jsonb_build_object('lat',receipt.latitude,'lng',receipt.longitude);
  end if;
  entities:=entities||jsonb_build_object(k,jsonb_build_object('value',v,'status','active','confidence',1,'source',case when k='location' then 'PROVIDER_VERIFIED' else 'OWNER_POLICY' end)
   ||case when k='location' then jsonb_build_object('receipt_id',receipt.message_id) else '{}'::jsonb end);
 end loop;
 state:=jsonb_build_object('scope',jsonb_build_object('business_id',p_business_id,'branch_id',branch,'customer_id',customer,'conversation_id',conversation),
  'pending_action','CREATE_BOOKING','activity_contract_version',contract->>'contract_version','delivery_mode',mode,'entities',entities);
 perform dabbir_private.activity_assert_execution_v1(p_business_id,branch,customer,conversation,state,service,actor);
 quote:=jsonb_build_object('business_id',p_business_id,'branch_id',branch,'customer_id',customer,'service_id',service,'worker_id',worker,'actor_id',actor,
  'activity_type',contract->>'activity_type','contract_version',contract->>'contract_version','delivery_mode',mode,'starts_at',start_at,'ends_at',end_at,
  'duration_minutes',minutes,'price',price,'currency_code',currency,'timezone',tz,'facts',entities,
  'service_name',coalesce(s.name_ar,s.name,s.name_en),'customer_name',(select display_name from public.dabbir_customers where business_id=p_business_id and id=customer));
 expected_hash:=md5(quote::text);
 if p_execute then
  if p_operation_key is null or p_operation_key !~ '^owner-ai:[A-Za-z0-9_-]{16,100}$' then raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED'; end if;
  fingerprint:=md5(jsonb_build_object('actor',actor,'request',p_request,'quote_hash',p_quote_hash)::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  select * into appointment from public.dabbir_appointments a where a.business_id=p_business_id and a.idempotency_key=p_operation_key for update;
  if found then
   if appointment.idempotency_fingerprint is distinct from fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING'; end if;
   replay:=true;
  elsif p_quote_hash is distinct from expected_hash then raise exception 'OWNER_BOOKING_QUOTE_STALE'; end if;
 end if;
 if not replay then
  if start_at<=now() or not dabbir_private.whatsapp_ai_slot_available_branch(p_business_id,branch,worker,start_at,end_at) then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;
  if not p_execute then return jsonb_build_object('ok',true,'state','awaiting_approval','quote',quote,'quote_hash',expected_hash); end if;
  insert into public.dabbir_appointments(business_id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,booking_source,payment_status,idempotency_key,idempotency_fingerprint,location_type,service_latitude,service_longitude,activity_intelligence)
  values(p_business_id,branch,customer,service,worker,start_at,end_at,'new',false,price,0,'internal','unpaid',p_operation_key,fingerprint,
   case when 'location'=any(required) then 'customer' else null end,receipt.latitude,receipt.longitude,
   jsonb_build_object('contract_version',contract->>'contract_version','activity_type',contract->>'activity_type','delivery_mode',mode,'source','owner_ai','owner_id',actor,'quote_hash',expected_hash,
    'vehicle',entities#>'{vehicle,value}','property_details',entities#>'{property_details,value}','location_receipt_id',receipt.message_id)) returning * into appointment;
  insert into public.dabbir_appointment_services(business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,duration_minutes,unit_price_aed,discount_aed)
   values(p_business_id,appointment.id,service,worker,coalesce(s.name_ar,s.name),coalesce(s.name_en,s.name),minutes,price,0);
 end if;
 select * into appointment from public.dabbir_appointments a where a.business_id=p_business_id and a.id=appointment.id and a.branch_id=branch and a.customer_id=customer and a.service_id=service;
 if not found then raise exception 'OWNER_BOOKING_RESULT_UNVERIFIED'; end if;
 return jsonb_build_object('ok',true,'verified',true,'appointment_id',appointment.id,'business_id',p_business_id,'branch_id',branch,'customer_id',customer,'service_id',service,
  'worker_id',appointment.worker_id,'starts_at',appointment.starts_at,'ends_at',appointment.ends_at,'status',appointment.status,'price',appointment.quoted_price_aed,'currency_code',currency,
  'activity_intelligence',appointment.activity_intelligence,'idempotent_replay',replay);
end $$;
revoke all on function public.dabbir_owner_activity_booking_v1(uuid,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_activity_booking_v1(uuid,jsonb,boolean,text,text) to authenticated;

-- Narrow owner read; the receipt table remains inaccessible to client roles.
create or replace function public.dabbir_owner_booking_locations_v1(p_business_id uuid,p_branch_id uuid,p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='pg_catalog','public','auth' as $$
begin
 if not dabbir_private.activity_owner_authorized_v1(p_business_id,auth.uid()) then raise exception 'OWNER_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_customers where business_id=p_business_id and id=p_customer_id) then raise exception 'ACTIVITY_CUSTOMER_SCOPE_INVALID'; end if;
 if not exists(select 1 from public.dabbir_business_branches where business_id=p_business_id and id=p_branch_id and status='active') then raise exception 'ACTIVITY_BRANCH_SCOPE_INVALID'; end if;
 return coalesce((select jsonb_agg(x) from (
  select r.message_id,r.created_at from public.dabbir_whatsapp_location_receipts r join public.dabbir_conversations c on c.business_id=r.business_id and c.id=r.conversation_id
  where r.business_id=p_business_id and c.customer_id=p_customer_id and c.branch_id=p_branch_id and not c.demo_mode and r.created_at>now()-interval '24 hours'
  order by r.created_at desc limit 20
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.dabbir_owner_booking_locations_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_owner_booking_locations_v1(uuid,uuid,uuid) to authenticated;
