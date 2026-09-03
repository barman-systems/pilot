-- Follow-up hardening for WhatsApp AI actions.
-- Keep each worker's duration/price local to that slot and let the canonical UPDATE trigger
-- exclude the appointment itself during reschedule conflict validation.

create or replace function public.dabbir_whatsapp_ai_check_availability(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,p_requested_local timestamp
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_business public.dabbir_businesses%rowtype;v_conversation public.dabbir_conversations%rowtype;v_service public.dabbir_services%rowtype;v_worker public.dabbir_workers%rowtype;
  v_service_duration integer:=60;v_base_price numeric:=0;v_candidate_duration integer;v_candidate_price numeric;
  v_local timestamp;v_start timestamptz;v_end timestamptz;v_slots jsonb:='[]'::jsonb;v_service_count integer:=0;v_worker_count integer:=0;i integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id;
  if not found or nullif(v_business.timezone,'') is null or nullif(v_business.currency_code,'') is null then raise exception 'BUSINESS_PROFILE_UNVERIFIED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed';
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;

  select count(*) into v_service_count from public.dabbir_services s where s.business_id=p_business_id and s.active=true;
  if p_service_id is not null then
    select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
    if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE'; end if;
  elsif v_service_count=1 then select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.active=true limit 1;
  else return jsonb_build_object('ok',false,'state','NEED_SERVICE','services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(s.name_ar,s.name,s.name_en),'price',s.price_aed,'currency_code',v_business.currency_code) order by coalesce(s.name_ar,s.name,s.name_en)) from public.dabbir_services s where s.business_id=p_business_id and s.active=true),'[]'::jsonb)); end if;
  v_service_duration:=greatest(5,coalesce(v_service.duration_minutes,60));v_base_price:=greatest(0,coalesce(v_service.price_aed,0));

  if p_worker_id is not null then
    select * into v_worker from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.status='active';
    if not found then raise exception 'ACTION_WORKER_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.service_id=v_service.id and x.active=true)
       and not exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.worker_id=v_worker.id and x.service_id=v_service.id and x.active=true) then raise exception 'ACTION_WORKER_SERVICE_MISMATCH'; end if;
  end if;
  if p_requested_local is null then return jsonb_build_object('ok',false,'state','NEED_TIME','timezone',v_business.timezone); end if;

  for i in 0..12 loop
    v_local:=p_requested_local+make_interval(mins=>i*30);v_start:=v_local at time zone v_business.timezone;
    if v_start<=now() then continue; end if;
    if p_worker_id is not null then
      select coalesce(ws.duration_minutes,v_service_duration),coalesce(ws.price_aed,v_base_price) into v_candidate_duration,v_candidate_price
      from (select 1) q left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=v_worker.id and ws.service_id=v_service.id and ws.active=true;
      v_candidate_duration:=greatest(5,coalesce(v_candidate_duration,v_service_duration));v_candidate_price:=greatest(0,coalesce(v_candidate_price,v_base_price));v_end:=v_start+make_interval(mins=>v_candidate_duration);
      if dabbir_private.whatsapp_ai_slot_available(p_business_id,v_worker.id,v_start,v_end) then
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'duration_minutes',v_candidate_duration,'price',v_candidate_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
      end if;
    else
      select count(*) into v_worker_count from public.dabbir_workers w where w.business_id=p_business_id and w.status='active';
      if v_worker_count=0 then
        v_candidate_duration:=v_service_duration;v_candidate_price:=v_base_price;v_end:=v_start+make_interval(mins=>v_candidate_duration);
        if dabbir_private.whatsapp_ai_slot_available(p_business_id,null,v_start,v_end) then v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',null,'worker_name',null,'duration_minutes',v_candidate_duration,'price',v_candidate_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone)); end if;
      else
        select w.* into v_worker
        from public.dabbir_workers w
        left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=w.id and ws.service_id=v_service.id and ws.active=true
        where w.business_id=p_business_id and w.status='active'
          and (not exists(select 1 from public.dabbir_worker_services z where z.business_id=p_business_id and z.service_id=v_service.id and z.active=true) or ws.worker_id is not null)
          and dabbir_private.whatsapp_ai_slot_available(p_business_id,w.id,v_start,v_start+make_interval(mins=>greatest(5,coalesce(ws.duration_minutes,v_service_duration))))
        order by w.display_name limit 1;
        if found then
          select coalesce(ws.duration_minutes,v_service_duration),coalesce(ws.price_aed,v_base_price) into v_candidate_duration,v_candidate_price
          from (select 1) q left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=v_worker.id and ws.service_id=v_service.id and ws.active=true;
          v_candidate_duration:=greatest(5,coalesce(v_candidate_duration,v_service_duration));v_candidate_price:=greatest(0,coalesce(v_candidate_price,v_base_price));v_end:=v_start+make_interval(mins=>v_candidate_duration);
          v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'duration_minutes',v_candidate_duration,'price',v_candidate_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
        end if;
      end if;
    end if;
    exit when jsonb_array_length(v_slots)>=3;
  end loop;
  return jsonb_build_object('ok',true,'state',case when jsonb_array_length(v_slots)>0 then 'SLOTS_AVAILABLE' else 'NO_SLOTS' end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'slots',v_slots,'currency_code',v_business.currency_code,'timezone',v_business.timezone);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_check_availability(uuid,uuid,uuid,uuid,timestamp) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_check_availability(uuid,uuid,uuid,uuid,timestamp) to service_role;

create or replace function public.dabbir_whatsapp_ai_cancel_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,p_operation_key text
) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth'
as $$
declare v_conversation public.dabbir_conversations%rowtype;v_appt public.dabbir_appointments%rowtype;v_existing public.dabbir_ai_action_ledger%rowtype;v_key text:=trim(coalesce(p_operation_key,''));v_fingerprint text;v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select * into v_appt from public.dabbir_appointments a where a.business_id=p_business_id and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND'; end if;
  if v_appt.starts_at is null or v_appt.starts_at<=now() then raise exception 'PAST_APPOINTMENT_NOT_CANCELLABLE_BY_AI'; end if;
  v_fingerprint:=md5(jsonb_build_object('conversation_id',p_conversation_id,'appointment_id',p_appointment_id)::text);perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then if v_existing.operation_type<>'booking.cancel' or v_existing.fingerprint<>v_fingerprint or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;return v_existing.result||jsonb_build_object('idempotent_replay',true);end if;
  if v_appt.status not in ('cancelled','completed','no_show') then update public.dabbir_appointments set status='cancelled',updated_at=now() where business_id=p_business_id and id=p_appointment_id returning * into v_appt;end if;
  v_result:=jsonb_build_object('ok',true,'verified',true,'appointment_id',v_appt.id,'status',v_appt.status,'starts_at',v_appt.starts_at);insert into public.dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result) values(p_business_id,p_conversation_id,v_key,'booking.cancel',v_fingerprint,v_appt.id,v_result);return v_result||jsonb_build_object('idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_reschedule_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,p_new_starts_at timestamptz,p_operation_key text
) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth'
as $$
declare v_conversation public.dabbir_conversations%rowtype;v_appt public.dabbir_appointments%rowtype;v_existing public.dabbir_ai_action_ledger%rowtype;v_duration integer;v_end timestamptz;v_key text:=trim(coalesce(p_operation_key,''));v_fingerprint text;v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;if p_new_starts_at is null or p_new_starts_at<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select * into v_appt from public.dabbir_appointments a where a.business_id=p_business_id and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND'; end if;if v_appt.starts_at is null or v_appt.starts_at<=now() or v_appt.status in ('cancelled','completed','no_show') then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE_BY_AI'; end if;
  v_duration:=greatest(5,round(extract(epoch from (coalesce(v_appt.ends_at,v_appt.starts_at+interval '60 minutes')-v_appt.starts_at))/60)::integer);v_end:=p_new_starts_at+make_interval(mins=>v_duration);v_fingerprint:=md5(jsonb_build_object('conversation_id',p_conversation_id,'appointment_id',p_appointment_id,'new_starts_at',p_new_starts_at)::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));select * into v_existing from public.dabbir_ai_action_ledger l where l.business_id=p_business_id and l.operation_key=v_key for update;if found then if v_existing.operation_type<>'booking.reschedule' or v_existing.fingerprint<>v_fingerprint or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;return v_existing.result||jsonb_build_object('idempotent_replay',true);end if;
  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  -- Do not pre-check through whatsapp_ai_slot_available here: the old appointment would
  -- appear as its own conflict. The canonical UPDATE trigger validates the target range
  -- while excluding this appointment id.
  update public.dabbir_appointments a set starts_at=p_new_starts_at,ends_at=v_end,updated_at=now() where a.business_id=p_business_id and a.id=p_appointment_id returning * into v_appt;
  v_result:=jsonb_build_object('ok',true,'verified',true,'appointment_id',v_appt.id,'status',v_appt.status,'starts_at',v_appt.starts_at,'ends_at',v_appt.ends_at,'confirmation_gate',v_appt.confirmation_gate,'deposit_required_amount',v_appt.deposit_required_amount,'deposit_currency_code',v_appt.deposit_currency_code);insert into public.dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result) values(p_business_id,p_conversation_id,v_key,'booking.reschedule',v_fingerprint,v_appt.id,v_result);return v_result||jsonb_build_object('idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;grant execute on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) to service_role;
