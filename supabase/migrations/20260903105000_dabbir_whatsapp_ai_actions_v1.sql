-- DABBIR WhatsApp AI receptionist P0: deterministic business actions.
-- AI may understand intent, but database actions re-validate tenant/customer/service/staff/calendar state.
-- Booking creation deliberately does NOT set confirmation_gate/deposit fields: the authoritative
-- external-booking trigger decides whether the booking confirms immediately or waits for deposit.

-- Calendar checks must use the market-authoritative business timezone. This keeps AI availability
-- and the final appointment trigger on the same clock in every supported market.
create or replace function dabbir_private.prevent_appointment_calendar_conflict()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_end timestamptz;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean;
begin
  if new.starts_at is null or new.status in ('cancelled','completed','no_show') then return new; end if;
  v_end := coalesce(new.ends_at,new.starts_at+interval '60 minutes');
  if v_end <= new.starts_at then raise exception 'INVALID_APPOINTMENT_RANGE'; end if;

  select b.timezone into v_timezone from public.dabbir_businesses b where b.id=new.business_id;
  if nullif(v_timezone,'') is null then raise exception 'BUSINESS_TIMEZONE_NOT_CONFIGURED'; end if;
  v_local_start := new.starts_at at time zone v_timezone;
  v_local_end := v_end at time zone v_timezone;
  v_weekday := extract(dow from v_local_start)::smallint;

  if new.worker_id is not null then
    select exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.active and s.schedule_type='work'
    ) into v_has_schedule;
    if v_has_schedule and not exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type='work'
        and s.starts_at <= v_local_start::time and s.ends_at >= v_local_end::time
    ) then raise exception 'WORKER_OUTSIDE_SCHEDULE'; end if;

    if exists(
      select 1 from public.dabbir_worker_schedules s
      where s.business_id=new.business_id and s.worker_id=new.worker_id and s.weekday=v_weekday
        and s.active and s.schedule_type in ('break','unavailable')
        and s.starts_at < v_local_end::time and s.ends_at > v_local_start::time
    ) then raise exception 'WORKER_UNAVAILABLE'; end if;

    if exists(
      select 1 from public.dabbir_worker_time_off t
      where t.business_id=new.business_id and t.worker_id=new.worker_id
        and t.starts_at < v_end and t.ends_at > new.starts_at
    ) then raise exception 'WORKER_TIME_OFF'; end if;
  end if;

  if exists(
    select 1 from public.dabbir_calendar_busy_blocks b
    where b.business_id=new.business_id and b.starts_at < v_end and b.ends_at > new.starts_at
  ) then raise exception 'APPOINTMENT_CALENDAR_CONFLICT'; end if;

  if new.worker_id is not null and exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=new.business_id
      and a.id <> coalesce(new.id,gen_random_uuid())
      and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.worker_id=new.worker_id
      and a.starts_at < v_end
      and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at
  ) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;

  if new.worker_id is null and exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=new.business_id
      and a.id <> coalesce(new.id,gen_random_uuid())
      and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.worker_id is null
      and a.starts_at < v_end
      and coalesce(a.ends_at,a.starts_at+interval '60 minutes') > new.starts_at
  ) then raise exception 'APPOINTMENT_TIME_CONFLICT'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.prevent_appointment_calendar_conflict() from public,anon,authenticated;

create or replace function dabbir_private.whatsapp_ai_slot_available(
  p_business_id uuid,p_worker_id uuid,p_starts_at timestamptz,p_ends_at timestamptz
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean := false;
begin
  if p_business_id is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_starts_at<=now() then return false; end if;
  select b.timezone into v_timezone from public.dabbir_businesses b where b.id=p_business_id;
  if nullif(v_timezone,'') is null then return false; end if;
  v_local_start:=p_starts_at at time zone v_timezone;
  v_local_end:=p_ends_at at time zone v_timezone;
  v_weekday:=extract(dow from v_local_start)::smallint;

  if exists(select 1 from public.dabbir_calendar_busy_blocks b where b.business_id=p_business_id and b.starts_at<p_ends_at and b.ends_at>p_starts_at) then return false; end if;

  if p_worker_id is null then
    if exists(select 1 from public.dabbir_appointments a where a.business_id=p_business_id and a.worker_id is null and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at) then return false; end if;
    return true;
  end if;

  if not exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.status='active') then return false; end if;
  select exists(select 1 from public.dabbir_worker_schedules s where s.business_id=p_business_id and s.worker_id=p_worker_id and s.active and s.schedule_type='work') into v_has_schedule;
  if v_has_schedule and not exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday and s.active and s.schedule_type='work'
      and s.starts_at<=v_local_start::time and s.ends_at>=v_local_end::time
  ) then return false; end if;
  if exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday and s.active and s.schedule_type in ('break','unavailable')
      and s.starts_at<v_local_end::time and s.ends_at>v_local_start::time
  ) then return false; end if;
  if exists(select 1 from public.dabbir_worker_time_off t where t.business_id=p_business_id and t.worker_id=p_worker_id and t.starts_at<p_ends_at and t.ends_at>p_starts_at) then return false; end if;
  if exists(select 1 from public.dabbir_appointments a where a.business_id=p_business_id and a.worker_id=p_worker_id and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at) then return false; end if;
  return true;
end;
$$;
revoke all on function dabbir_private.whatsapp_ai_slot_available(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.whatsapp_ai_slot_available(uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_ai_check_availability(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,p_requested_local timestamp
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_business public.dabbir_businesses%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_service public.dabbir_services%rowtype;
  v_worker public.dabbir_workers%rowtype;
  v_duration integer:=60;
  v_base_price numeric:=0;
  v_slot_price numeric:=0;
  v_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_slots jsonb:='[]'::jsonb;
  v_service_count integer:=0;
  v_worker_count integer:=0;
  i integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id;
  if not found or nullif(v_business.timezone,'') is null or nullif(v_business.currency_code,'') is null then raise exception 'BUSINESS_PROFILE_UNVERIFIED'; end if;
  select * into v_conversation from public.dabbir_conversations c
    where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed';
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state='human_active' or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;

  select count(*) into v_service_count from public.dabbir_services s where s.business_id=p_business_id and s.active=true;
  if p_service_id is not null then
    select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
    if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE'; end if;
  elsif v_service_count=1 then
    select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.active=true limit 1;
  else
    return jsonb_build_object('ok',false,'state','NEED_SERVICE','services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(s.name_ar,s.name,s.name_en),'price',s.price_aed,'currency_code',v_business.currency_code) order by coalesce(s.name_ar,s.name,s.name_en)) from public.dabbir_services s where s.business_id=p_business_id and s.active=true),'[]'::jsonb));
  end if;
  v_duration:=greatest(5,coalesce(v_service.duration_minutes,60));
  v_base_price:=greatest(0,coalesce(v_service.price_aed,0));

  if p_worker_id is not null then
    select * into v_worker from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.status='active';
    if not found then raise exception 'ACTION_WORKER_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.service_id=v_service.id and x.active=true)
       and not exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.worker_id=v_worker.id and x.service_id=v_service.id and x.active=true) then
      raise exception 'ACTION_WORKER_SERVICE_MISMATCH';
    end if;
  end if;
  if p_requested_local is null then return jsonb_build_object('ok',false,'state','NEED_TIME','timezone',v_business.timezone); end if;

  for i in 0..12 loop
    v_local:=p_requested_local+make_interval(mins=>i*30);
    v_start:=v_local at time zone v_business.timezone;
    if v_start<=now() then continue; end if;

    if p_worker_id is not null then
      select coalesce(ws.duration_minutes,v_duration),coalesce(ws.price_aed,v_base_price)
        into v_duration,v_slot_price
      from (select 1) q
      left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=v_worker.id and ws.service_id=v_service.id and ws.active=true;
      v_duration:=greatest(5,coalesce(v_duration,60)); v_slot_price:=greatest(0,coalesce(v_slot_price,v_base_price));
      v_end:=v_start+make_interval(mins=>v_duration);
      if dabbir_private.whatsapp_ai_slot_available(p_business_id,v_worker.id,v_start,v_end) then
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'duration_minutes',v_duration,'price',v_slot_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
      end if;
    else
      select count(*) into v_worker_count from public.dabbir_workers w where w.business_id=p_business_id and w.status='active';
      if v_worker_count=0 then
        v_end:=v_start+make_interval(mins=>v_duration);
        if dabbir_private.whatsapp_ai_slot_available(p_business_id,null,v_start,v_end) then
          v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',null,'worker_name',null,'duration_minutes',v_duration,'price',v_base_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
        end if;
      else
        select w.* into v_worker
        from public.dabbir_workers w
        where w.business_id=p_business_id and w.status='active'
          and (not exists(select 1 from public.dabbir_worker_services z where z.business_id=p_business_id and z.service_id=v_service.id and z.active=true)
               or exists(select 1 from public.dabbir_worker_services z where z.business_id=p_business_id and z.worker_id=w.id and z.service_id=v_service.id and z.active=true))
          and dabbir_private.whatsapp_ai_slot_available(
            p_business_id,w.id,v_start,v_start+make_interval(mins=>coalesce((select ws.duration_minutes from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=w.id and ws.service_id=v_service.id and ws.active=true limit 1),v_duration))
          )
        order by w.display_name limit 1;
        if found then
          select coalesce(ws.duration_minutes,v_duration),coalesce(ws.price_aed,v_base_price) into v_duration,v_slot_price
          from (select 1) q left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=v_worker.id and ws.service_id=v_service.id and ws.active=true;
          v_duration:=greatest(5,coalesce(v_duration,60));v_slot_price:=greatest(0,coalesce(v_slot_price,v_base_price));v_end:=v_start+make_interval(mins=>v_duration);
          v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'ends_at',v_end,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'duration_minutes',v_duration,'price',v_slot_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone));
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

create or replace function public.dabbir_whatsapp_ai_create_booking(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,p_starts_at timestamptz,p_operation_key text,p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_service public.dabbir_services%rowtype;
  v_worker public.dabbir_workers%rowtype;
  v_existing public.dabbir_ai_action_ledger%rowtype;
  v_appt public.dabbir_appointments%rowtype;
  v_duration integer:=60;
  v_price numeric:=0;
  v_name_ar text;
  v_name_en text;
  v_end timestamptz;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_fingerprint text;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  if p_starts_at is null or p_starts_at<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state='human_active' or exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
  if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE'; end if;
  if p_worker_id is not null then
    select * into v_worker from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.status='active';
    if not found then raise exception 'ACTION_WORKER_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.service_id=p_service_id and x.active=true)
       and not exists(select 1 from public.dabbir_worker_services x where x.business_id=p_business_id and x.worker_id=p_worker_id and x.service_id=p_service_id and x.active=true) then raise exception 'ACTION_WORKER_SERVICE_MISMATCH'; end if;
  end if;
  select coalesce(ws.duration_minutes,v_service.duration_minutes,60),coalesce(ws.price_aed,v_service.price_aed,0),coalesce(v_service.name_ar,v_service.name),coalesce(v_service.name_en,v_service.name)
    into v_duration,v_price,v_name_ar,v_name_en
  from (select 1) q left join public.dabbir_worker_services ws on ws.business_id=p_business_id and ws.worker_id=p_worker_id and ws.service_id=p_service_id and ws.active=true;
  v_duration:=greatest(5,coalesce(v_duration,60));v_price:=greatest(0,coalesce(v_price,0));v_end:=p_starts_at+make_interval(mins=>v_duration);
  v_fingerprint:=md5(jsonb_build_object('conversation_id',p_conversation_id,'service_id',p_service_id,'worker_id',p_worker_id,'starts_at',p_starts_at)::text);

  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.create' or v_existing.fingerprint<>v_fingerprint or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  if not dabbir_private.whatsapp_ai_slot_available(p_business_id,p_worker_id,p_starts_at,v_end) then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;

  insert into public.dabbir_appointments(
    business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status
  ) values(
    p_business_id,v_conversation.customer_id,p_service_id,p_worker_id,p_starts_at,v_end,'new',false,v_price,0,left(coalesce(p_notes,''),2000),'whatsapp','unpaid'
  ) returning * into v_appt;

  insert into public.dabbir_appointment_services(
    business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,duration_minutes,unit_price_aed,discount_aed
  ) values(p_business_id,v_appt.id,p_service_id,p_worker_id,coalesce(v_name_ar,'خدمة'),coalesce(v_name_en,'Service'),v_duration,v_price,0);

  select * into v_appt from public.dabbir_appointments a where a.business_id=p_business_id and a.id=v_appt.id;
  v_result:=jsonb_build_object(
    'ok',true,'verified',true,'appointment_id',v_appt.id,'customer_id',v_appt.customer_id,'service_id',v_appt.service_id,
    'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_appt.worker_id,'worker_name',v_worker.display_name,
    'starts_at',v_appt.starts_at,'ends_at',v_appt.ends_at,'status',v_appt.status,'payment_status',v_appt.payment_status,
    'confirmation_gate',v_appt.confirmation_gate,'deposit_required_amount',v_appt.deposit_required_amount,'deposit_currency_code',v_appt.deposit_currency_code,
    'price',v_appt.quoted_price_aed,'currency_code',v_appt.deposit_currency_code
  );
  insert into public.dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result)
  values(p_business_id,p_conversation_id,v_key,'booking.create',v_fingerprint,v_appt.id,v_result);
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_cancel_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_conversation public.dabbir_conversations%rowtype;v_appt public.dabbir_appointments%rowtype;v_existing public.dabbir_ai_action_ledger%rowtype;
  v_key text:=trim(coalesce(p_operation_key,''));v_fingerprint text;v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_appt from public.dabbir_appointments a where a.business_id=p_business_id and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;
  if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND'; end if;
  if v_appt.starts_at is null or v_appt.starts_at<=now() then raise exception 'PAST_APPOINTMENT_NOT_CANCELLABLE_BY_AI'; end if;
  v_fingerprint:=md5(jsonb_build_object('conversation_id',p_conversation_id,'appointment_id',p_appointment_id)::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.cancel' or v_existing.fingerprint<>v_fingerprint or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;
  if v_appt.status not in ('cancelled','completed','no_show') then update public.dabbir_appointments set status='cancelled',updated_at=now() where business_id=p_business_id and id=p_appointment_id returning * into v_appt; end if;
  v_result:=jsonb_build_object('ok',true,'verified',true,'appointment_id',v_appt.id,'status',v_appt.status,'starts_at',v_appt.starts_at);
  insert into public.dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result)
  values(p_business_id,p_conversation_id,v_key,'booking.cancel',v_fingerprint,v_appt.id,v_result);
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_reschedule_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,p_new_starts_at timestamptz,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_conversation public.dabbir_conversations%rowtype;v_appt public.dabbir_appointments%rowtype;v_existing public.dabbir_ai_action_ledger%rowtype;
  v_duration integer;v_end timestamptz;v_key text:=trim(coalesce(p_operation_key,''));v_fingerprint text;v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  if p_new_starts_at is null or p_new_starts_at<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_appt from public.dabbir_appointments a where a.business_id=p_business_id and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;
  if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND'; end if;
  if v_appt.starts_at is null or v_appt.starts_at<=now() or v_appt.status in ('cancelled','completed','no_show') then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE_BY_AI'; end if;
  v_duration:=greatest(5,round(extract(epoch from (coalesce(v_appt.ends_at,v_appt.starts_at+interval '60 minutes')-v_appt.starts_at))/60)::integer);v_end:=p_new_starts_at+make_interval(mins=>v_duration);
  v_fingerprint:=md5(jsonb_build_object('conversation_id',p_conversation_id,'appointment_id',p_appointment_id,'new_starts_at',p_new_starts_at)::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.reschedule' or v_existing.fingerprint<>v_fingerprint or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  if not dabbir_private.whatsapp_ai_slot_available(p_business_id,v_appt.worker_id,p_new_starts_at,v_end) then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;
  update public.dabbir_appointments a set starts_at=p_new_starts_at,ends_at=v_end,updated_at=now() where a.business_id=p_business_id and a.id=p_appointment_id returning * into v_appt;
  v_result:=jsonb_build_object('ok',true,'verified',true,'appointment_id',v_appt.id,'status',v_appt.status,'starts_at',v_appt.starts_at,'ends_at',v_appt.ends_at,'confirmation_gate',v_appt.confirmation_gate,'deposit_required_amount',v_appt.deposit_required_amount,'deposit_currency_code',v_appt.deposit_currency_code);
  insert into public.dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result)
  values(p_business_id,p_conversation_id,v_key,'booking.reschedule',v_fingerprint,v_appt.id,v_result);
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_handoff(
  p_business_id uuid,p_conversation_id uuid,p_route_class text default 'SUPPORT',p_reason text default 'Customer requested human assistance',p_summary text default ''
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  v_conversation public.dabbir_conversations%rowtype;v_handoff public.dabbir_handoffs%rowtype;v_route text:=upper(trim(coalesce(p_route_class,'SUPPORT')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_route not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then v_route:='SUPPORT'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_handoff from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.created_at desc limit 1 for update;
  if not found then
    insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,state,priority,routing_strategy,summary,attempted_actions,unresolved_items,metadata)
    values(p_business_id,p_conversation_id,v_conversation.customer_id,v_route,left(coalesce(p_reason,'Customer requested human assistance'),500),'QUEUED',70,'least_open',left(coalesce(p_summary,''),1200),'[]'::jsonb,'[]'::jsonb,jsonb_build_object('source','dabbir_whatsapp_ai','customer_requested_human',true)) returning * into v_handoff;
  end if;
  update public.dabbir_conversations set state='action_required',updated_at=now() where business_id=p_business_id and id=p_conversation_id;
  perform public.dabbir_whatsapp_ai_set_state(p_business_id,p_conversation_id,'handoff',jsonb_build_object('handoff_id',v_handoff.id,'route_class',v_handoff.route_class),3600);
  return jsonb_build_object('ok',true,'verified',true,'handoff_id',v_handoff.id,'state',v_handoff.state,'route_class',v_handoff.route_class);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_customer_recent_bookings(
  p_business_id uuid,p_conversation_id uuid,p_limit integer default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $$
declare v_customer_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select c.customer_id into v_customer_id from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false;
  if v_customer_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  return coalesce((
    select jsonb_agg(x.obj order by x.starts_at desc) from (
      select a.starts_at,jsonb_build_object('appointment_id',a.id,'service_id',a.service_id,'service_name',coalesce(s.name_ar,s.name,s.name_en),'worker_id',a.worker_id,'worker_name',w.display_name,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'confirmation_gate',a.confirmation_gate,'deposit_required_amount',a.deposit_required_amount,'deposit_currency_code',a.deposit_currency_code) obj
      from public.dabbir_appointments a
      left join public.dabbir_services s on s.business_id=a.business_id and s.id=a.service_id
      left join public.dabbir_workers w on w.business_id=a.business_id and w.id=a.worker_id
      where a.business_id=p_business_id and a.customer_id=v_customer_id and a.starts_at<now()
      order by a.starts_at desc limit greatest(1,least(coalesce(p_limit,5),10))
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_customer_recent_bookings(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_customer_recent_bookings(uuid,uuid,integer) to service_role;
