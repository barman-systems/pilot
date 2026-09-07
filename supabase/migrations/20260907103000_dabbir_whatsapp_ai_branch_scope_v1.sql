-- DABBIR WhatsApp AI branch-scope hardening.
-- A WhatsApp conversation belongs to the exact branch that owns the receiving number.
-- Every catalog read, worker choice, availability check and booking mutation must stay
-- inside that branch instead of falling back to business-wide resources.

create or replace function dabbir_private.whatsapp_ai_slot_available_branch(
  p_business_id uuid,
  p_branch_id uuid,
  p_worker_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns boolean
language plpgsql
stable
security definer
set search_path='pg_catalog','public','dabbir_private'
as $function$
declare
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_has_schedule boolean:=false;
begin
  if p_business_id is null or p_branch_id is null or p_starts_at is null or p_ends_at is null
     or p_ends_at<=p_starts_at or p_starts_at<=now() then return false; end if;
  if not exists(
    select 1 from public.dabbir_business_branches b
    where b.business_id=p_business_id and b.id=p_branch_id and b.status='active'
  ) then return false; end if;

  select b.timezone into v_timezone from public.dabbir_businesses b where b.id=p_business_id;
  if nullif(v_timezone,'') is null then return false; end if;
  v_local_start:=p_starts_at at time zone v_timezone;
  v_local_end:=p_ends_at at time zone v_timezone;
  v_weekday:=extract(dow from v_local_start)::smallint;

  -- Provider calendar blocks are business-wide because the current provider model has
  -- no branch column. Keep that conservative boundary until provider blocks are branch-owned.
  if exists(
    select 1 from public.dabbir_calendar_busy_blocks b
    where b.business_id=p_business_id and b.starts_at<p_ends_at and b.ends_at>p_starts_at
  ) then return false; end if;

  if p_worker_id is null then
    if exists(
      select 1 from public.dabbir_appointments a
      where a.business_id=p_business_id and a.branch_id=p_branch_id and a.worker_id is null
        and a.starts_at is not null and a.status not in ('cancelled','completed','no_show')
        and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at
    ) then return false; end if;
    return true;
  end if;

  if not exists(
    select 1
    from public.dabbir_workers w
    join public.dabbir_worker_branches wb
      on wb.business_id=w.business_id and wb.worker_id=w.id
     and wb.branch_id=p_branch_id and wb.active=true
    where w.business_id=p_business_id and w.id=p_worker_id and w.status='active'
  ) then return false; end if;

  select exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.active and s.schedule_type='work'
  ) into v_has_schedule;
  if v_has_schedule and not exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday
      and s.active and s.schedule_type='work'
      and s.starts_at<=v_local_start::time and s.ends_at>=v_local_end::time
  ) then return false; end if;
  if exists(
    select 1 from public.dabbir_worker_schedules s
    where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday
      and s.active and s.schedule_type in ('break','unavailable')
      and s.starts_at<v_local_end::time and s.ends_at>v_local_start::time
  ) then return false; end if;
  if exists(
    select 1 from public.dabbir_worker_time_off t
    where t.business_id=p_business_id and t.worker_id=p_worker_id
      and t.starts_at<p_ends_at and t.ends_at>p_starts_at
  ) then return false; end if;

  -- One worker cannot be double-booked across branches, so worker conflicts remain business-wide.
  if exists(
    select 1 from public.dabbir_appointments a
    where a.business_id=p_business_id and a.worker_id=p_worker_id and a.starts_at is not null
      and a.status not in ('cancelled','completed','no_show')
      and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at
  ) then return false; end if;
  return true;
end;
$function$;
revoke all on function dabbir_private.whatsapp_ai_slot_available_branch(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.whatsapp_ai_slot_available_branch(uuid,uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_ai_context(p_batch_id uuid,p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_business public.dabbir_businesses%rowtype;
  v_customer public.dabbir_customers%rowtype;
  v_state public.dabbir_ai_conversation_state%rowtype;
  v_newer boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches
   where id=p_batch_id and state='PROCESSING' and lock_token=p_lock_token;
  if not found then raise exception 'AI_BATCH_LOCK_MISMATCH'; end if;
  select * into v_conversation from public.dabbir_conversations
   where id=v_batch.conversation_id and business_id=v_batch.business_id and channel_type='whatsapp' and demo_mode=false;
  if not found or v_conversation.branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if not exists(
    select 1 from public.dabbir_business_branches b
    where b.business_id=v_batch.business_id and b.id=v_conversation.branch_id and b.status='active'
  ) then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  select * into v_business from public.dabbir_businesses where id=v_batch.business_id;
  select * into v_customer from public.dabbir_customers
   where id=v_conversation.customer_id and business_id=v_batch.business_id;
  select * into v_state from public.dabbir_ai_conversation_state
   where business_id=v_batch.business_id and conversation_id=v_batch.conversation_id
     and (expires_at is null or expires_at>now());

  select exists(
    select 1 from public.dabbir_messages m
    where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
      and m.sender_type='customer' and m.simulated=false and m.created_at>v_batch.last_message_at
  ) into v_newer;

  return jsonb_build_object(
    'batch',jsonb_build_object(
      'id',v_batch.id,'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,
      'customer_id',v_batch.customer_id,'message_count',v_batch.message_count,
      'attempt_count',v_batch.attempt_count,'last_message_at',v_batch.last_message_at
    ),
    'conversation',jsonb_build_object(
      'id',v_conversation.id,'state',v_conversation.state,'channel_type',v_conversation.channel_type,
      'branch_id',v_conversation.branch_id,'newer_customer_message_exists',v_newer
    ),
    'business',jsonb_build_object(
      'id',v_business.id,'name',v_business.name,'business_type',v_business.business_type,
      'locale',v_business.locale,'country_code',v_business.country_code,
      'currency_code',v_business.currency_code,'timezone',v_business.timezone
    ),
    'customer',jsonb_build_object(
      'id',v_customer.id,'display_name',v_customer.display_name,
      'phone_e164',v_customer.phone_e164,'channel_handle',v_customer.channel_handle
    ),
    'pending_state',case when v_state.conversation_id is null then null else
      jsonb_build_object('pending_action',v_state.pending_action,'payload',v_state.payload,'expires_at',v_state.expires_at) end,
    'batch_messages',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at) order by i.ordinal)
      from public.dabbir_message_batch_items i
      join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id
      where i.batch_id=v_batch.id
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(x.obj order by x.created_at) from (
        select jsonb_build_object('sender_type',m.sender_type,'body',m.body,'created_at',m.created_at) obj,m.created_at
        from public.dabbir_messages m
        where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
          and m.id not in (select message_id from public.dabbir_message_batch_items where batch_id=v_batch.id)
        order by m.created_at desc limit 10
      ) x
    ),'[]'::jsonb),
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'name_ar',s.name_ar,'name_en',s.name_en,
        'duration_minutes',s.duration_minutes,'price',s.price_aed
      ) order by s.name)
      from public.dabbir_services s
      join public.dabbir_branch_services bs
        on bs.business_id=s.business_id and bs.service_id=s.id
       and bs.branch_id=v_conversation.branch_id and bs.active=true
      where s.business_id=v_batch.business_id and s.active=true
    ),'[]'::jsonb),
    'workers',coalesce((
      select jsonb_agg(jsonb_build_object('id',w.id,'display_name',w.display_name,'job_title',w.job_title) order by w.display_name)
      from public.dabbir_workers w
      join public.dabbir_worker_branches wb
        on wb.business_id=w.business_id and wb.worker_id=w.id
       and wb.branch_id=v_conversation.branch_id and wb.active=true
      where w.business_id=v_batch.business_id and w.status='active'
    ),'[]'::jsonb),
    'worker_services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'worker_id',ws.worker_id,'service_id',ws.service_id,
        'duration_minutes',ws.duration_minutes,'price',ws.price_aed
      ))
      from public.dabbir_worker_services ws
      join public.dabbir_worker_branches wb
        on wb.business_id=ws.business_id and wb.worker_id=ws.worker_id
       and wb.branch_id=v_conversation.branch_id and wb.active=true
      join public.dabbir_branch_services bs
        on bs.business_id=ws.business_id and bs.service_id=ws.service_id
       and bs.branch_id=v_conversation.branch_id and bs.active=true
      where ws.business_id=v_batch.business_id and ws.active=true
    ),'[]'::jsonb),
    'upcoming_appointments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'branch_id',a.branch_id,'service_id',a.service_id,'worker_id',a.worker_id,
        'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,
        'confirmation_gate',a.confirmation_gate,'deposit_required_amount',a.deposit_required_amount,
        'deposit_currency_code',a.deposit_currency_code
      ) order by a.starts_at)
      from public.dabbir_appointments a
      where a.business_id=v_batch.business_id and a.branch_id=v_conversation.branch_id
        and a.customer_id=v_customer.id and a.starts_at>=now()
        and a.status not in ('cancelled','completed','no_show')
      limit 10
    ),'[]'::jsonb),
    'knowledge',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',x.knowledge_key,'type',x.knowledge_type,'value',x.value,
        'source',x.source,'confidence',x.confidence
      ) order by x.updated_at desc)
      from (
        select k.knowledge_key,k.knowledge_type,k.value,k.source,k.confidence,k.updated_at
        from public.dabbir_business_knowledge k
        where k.business_id=v_batch.business_id
          and (k.status is null or lower(k.status) in ('active','verified','approved'))
        order by k.updated_at desc limit 20
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_context(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_ai_check_availability(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,p_requested_local timestamp
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_business public.dabbir_businesses%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_service public.dabbir_services%rowtype;
  v_worker public.dabbir_workers%rowtype;
  v_service_duration integer:=60;
  v_base_price numeric:=0;
  v_candidate_duration integer;
  v_candidate_price numeric;
  v_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_slots jsonb:='[]'::jsonb;
  v_service_count integer:=0;
  v_worker_count integer:=0;
  v_has_branch_assignments boolean:=false;
  i integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id;
  if not found or nullif(v_business.timezone,'') is null or nullif(v_business.currency_code,'') is null then
    raise exception 'BUSINESS_PROFILE_UNVERIFIED';
  end if;
  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp'
     and c.demo_mode=false and c.state<>'closed';
  if not found or v_conversation.customer_id is null or v_conversation.branch_id is null then
    raise exception 'AI_CONVERSATION_NOT_FOUND';
  end if;
  if not exists(
    select 1 from public.dabbir_business_branches b
    where b.business_id=p_business_id and b.id=v_conversation.branch_id and b.status='active'
  ) then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(
    select 1 from public.dabbir_handoffs h
    where h.business_id=p_business_id and h.conversation_id=p_conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;

  select count(*) into v_service_count
  from public.dabbir_services s
  join public.dabbir_branch_services bs
    on bs.business_id=s.business_id and bs.service_id=s.id
   and bs.branch_id=v_conversation.branch_id and bs.active=true
  where s.business_id=p_business_id and s.active=true;

  if p_service_id is not null then
    select s.* into v_service
    from public.dabbir_services s
    join public.dabbir_branch_services bs
      on bs.business_id=s.business_id and bs.service_id=s.id
     and bs.branch_id=v_conversation.branch_id and bs.active=true
    where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
    if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE_IN_BRANCH'; end if;
  elsif v_service_count=1 then
    select s.* into v_service
    from public.dabbir_services s
    join public.dabbir_branch_services bs
      on bs.business_id=s.business_id and bs.service_id=s.id
     and bs.branch_id=v_conversation.branch_id and bs.active=true
    where s.business_id=p_business_id and s.active=true limit 1;
  else
    return jsonb_build_object(
      'ok',false,'state','NEED_SERVICE','branch_id',v_conversation.branch_id,
      'services',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',s.id,'name',coalesce(s.name_ar,s.name,s.name_en),
          'price',s.price_aed,'currency_code',v_business.currency_code
        ) order by coalesce(s.name_ar,s.name,s.name_en))
        from public.dabbir_services s
        join public.dabbir_branch_services bs
          on bs.business_id=s.business_id and bs.service_id=s.id
         and bs.branch_id=v_conversation.branch_id and bs.active=true
        where s.business_id=p_business_id and s.active=true
      ),'[]'::jsonb)
    );
  end if;

  v_service_duration:=greatest(5,coalesce(v_service.duration_minutes,60));
  v_base_price:=greatest(0,coalesce(v_service.price_aed,0));

  select exists(
    select 1
    from public.dabbir_worker_services x
    join public.dabbir_worker_branches wb
      on wb.business_id=x.business_id and wb.worker_id=x.worker_id
     and wb.branch_id=v_conversation.branch_id and wb.active=true
    where x.business_id=p_business_id and x.service_id=v_service.id and x.active=true
  ) into v_has_branch_assignments;

  if p_worker_id is not null then
    select w.* into v_worker
    from public.dabbir_workers w
    join public.dabbir_worker_branches wb
      on wb.business_id=w.business_id and wb.worker_id=w.id
     and wb.branch_id=v_conversation.branch_id and wb.active=true
    where w.business_id=p_business_id and w.id=p_worker_id and w.status='active';
    if not found then raise exception 'ACTION_WORKER_NOT_AVAILABLE_IN_BRANCH'; end if;
    if v_has_branch_assignments and not exists(
      select 1 from public.dabbir_worker_services x
      where x.business_id=p_business_id and x.worker_id=v_worker.id
        and x.service_id=v_service.id and x.active=true
    ) then raise exception 'ACTION_WORKER_SERVICE_MISMATCH'; end if;
  end if;

  if p_requested_local is null then
    return jsonb_build_object('ok',false,'state','NEED_TIME','timezone',v_business.timezone,'branch_id',v_conversation.branch_id);
  end if;

  for i in 0..12 loop
    v_local:=p_requested_local+make_interval(mins=>i*30);
    v_start:=v_local at time zone v_business.timezone;
    if v_start<=now() then continue; end if;

    if p_worker_id is not null then
      select coalesce(ws.duration_minutes,v_service_duration),coalesce(ws.price_aed,v_base_price)
        into v_candidate_duration,v_candidate_price
      from (select 1) q
      left join public.dabbir_worker_services ws
        on ws.business_id=p_business_id and ws.worker_id=v_worker.id
       and ws.service_id=v_service.id and ws.active=true;
      v_candidate_duration:=greatest(5,coalesce(v_candidate_duration,v_service_duration));
      v_candidate_price:=greatest(0,coalesce(v_candidate_price,v_base_price));
      v_end:=v_start+make_interval(mins=>v_candidate_duration);
      if dabbir_private.whatsapp_ai_slot_available_branch(
        p_business_id,v_conversation.branch_id,v_worker.id,v_start,v_end
      ) then
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object(
          'starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),
          'ends_at',v_end,'branch_id',v_conversation.branch_id,
          'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
          'worker_id',v_worker.id,'worker_name',v_worker.display_name,
          'duration_minutes',v_candidate_duration,'price',v_candidate_price,
          'currency_code',v_business.currency_code,'timezone',v_business.timezone
        ));
      end if;
    else
      select count(*) into v_worker_count
      from public.dabbir_workers w
      join public.dabbir_worker_branches wb
        on wb.business_id=w.business_id and wb.worker_id=w.id
       and wb.branch_id=v_conversation.branch_id and wb.active=true
      where w.business_id=p_business_id and w.status='active';

      if v_worker_count=0 then
        v_candidate_duration:=v_service_duration;
        v_candidate_price:=v_base_price;
        v_end:=v_start+make_interval(mins=>v_candidate_duration);
        if dabbir_private.whatsapp_ai_slot_available_branch(
          p_business_id,v_conversation.branch_id,null,v_start,v_end
        ) then
          v_slots:=v_slots||jsonb_build_array(jsonb_build_object(
            'starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),
            'ends_at',v_end,'branch_id',v_conversation.branch_id,
            'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
            'worker_id',null,'worker_name',null,'duration_minutes',v_candidate_duration,
            'price',v_candidate_price,'currency_code',v_business.currency_code,'timezone',v_business.timezone
          ));
        end if;
      else
        select w.* into v_worker
        from public.dabbir_workers w
        join public.dabbir_worker_branches wb
          on wb.business_id=w.business_id and wb.worker_id=w.id
         and wb.branch_id=v_conversation.branch_id and wb.active=true
        left join public.dabbir_worker_services ws
          on ws.business_id=p_business_id and ws.worker_id=w.id
         and ws.service_id=v_service.id and ws.active=true
        where w.business_id=p_business_id and w.status='active'
          and (not v_has_branch_assignments or ws.worker_id is not null)
          and dabbir_private.whatsapp_ai_slot_available_branch(
            p_business_id,v_conversation.branch_id,w.id,v_start,
            v_start+make_interval(mins=>greatest(5,coalesce(ws.duration_minutes,v_service_duration)))
          )
        order by w.display_name limit 1;
        if found then
          select coalesce(ws.duration_minutes,v_service_duration),coalesce(ws.price_aed,v_base_price)
            into v_candidate_duration,v_candidate_price
          from (select 1) q
          left join public.dabbir_worker_services ws
            on ws.business_id=p_business_id and ws.worker_id=v_worker.id
           and ws.service_id=v_service.id and ws.active=true;
          v_candidate_duration:=greatest(5,coalesce(v_candidate_duration,v_service_duration));
          v_candidate_price:=greatest(0,coalesce(v_candidate_price,v_base_price));
          v_end:=v_start+make_interval(mins=>v_candidate_duration);
          v_slots:=v_slots||jsonb_build_array(jsonb_build_object(
            'starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),
            'ends_at',v_end,'branch_id',v_conversation.branch_id,
            'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
            'worker_id',v_worker.id,'worker_name',v_worker.display_name,
            'duration_minutes',v_candidate_duration,'price',v_candidate_price,
            'currency_code',v_business.currency_code,'timezone',v_business.timezone
          ));
        end if;
      end if;
    end if;
    exit when jsonb_array_length(v_slots)>=3;
  end loop;

  return jsonb_build_object(
    'ok',true,'state',case when jsonb_array_length(v_slots)>0 then 'SLOTS_AVAILABLE' else 'NO_SLOTS' end,
    'branch_id',v_conversation.branch_id,'service_id',v_service.id,
    'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
    'slots',v_slots,'currency_code',v_business.currency_code,'timezone',v_business.timezone
  );
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_check_availability(uuid,uuid,uuid,uuid,timestamp) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_check_availability(uuid,uuid,uuid,uuid,timestamp) to service_role;

create or replace function public.dabbir_whatsapp_ai_create_booking(
  p_business_id uuid,p_conversation_id uuid,p_service_id uuid,p_worker_id uuid,
  p_starts_at timestamptz,p_operation_key text,p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_business public.dabbir_businesses%rowtype;
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
  v_has_branch_assignments boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  if p_starts_at is null or p_starts_at<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses b where b.id=p_business_id;
  if not found or nullif(v_business.currency_code,'') is null then raise exception 'BUSINESS_PROFILE_UNVERIFIED'; end if;
  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp'
     and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null or v_conversation.branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if not exists(
    select 1 from public.dabbir_business_branches b
    where b.business_id=p_business_id and b.id=v_conversation.branch_id and b.status='active'
  ) then raise exception 'AI_CONVERSATION_BRANCH_INACTIVE'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(
    select 1 from public.dabbir_handoffs h
    where h.business_id=p_business_id and h.conversation_id=p_conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;

  select s.* into v_service
  from public.dabbir_services s
  join public.dabbir_branch_services bs
    on bs.business_id=s.business_id and bs.service_id=s.id
   and bs.branch_id=v_conversation.branch_id and bs.active=true
  where s.business_id=p_business_id and s.id=p_service_id and s.active=true;
  if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE_IN_BRANCH'; end if;

  select exists(
    select 1 from public.dabbir_worker_services x
    join public.dabbir_worker_branches wb
      on wb.business_id=x.business_id and wb.worker_id=x.worker_id
     and wb.branch_id=v_conversation.branch_id and wb.active=true
    where x.business_id=p_business_id and x.service_id=p_service_id and x.active=true
  ) into v_has_branch_assignments;

  if p_worker_id is not null then
    select w.* into v_worker
    from public.dabbir_workers w
    join public.dabbir_worker_branches wb
      on wb.business_id=w.business_id and wb.worker_id=w.id
     and wb.branch_id=v_conversation.branch_id and wb.active=true
    where w.business_id=p_business_id and w.id=p_worker_id and w.status='active';
    if not found then raise exception 'ACTION_WORKER_NOT_AVAILABLE_IN_BRANCH'; end if;
    if v_has_branch_assignments and not exists(
      select 1 from public.dabbir_worker_services x
      where x.business_id=p_business_id and x.worker_id=p_worker_id
        and x.service_id=p_service_id and x.active=true
    ) then raise exception 'ACTION_WORKER_SERVICE_MISMATCH'; end if;
  end if;

  select coalesce(ws.duration_minutes,v_service.duration_minutes,60),
         coalesce(ws.price_aed,v_service.price_aed,0),
         coalesce(v_service.name_ar,v_service.name),coalesce(v_service.name_en,v_service.name)
    into v_duration,v_price,v_name_ar,v_name_en
  from (select 1) q
  left join public.dabbir_worker_services ws
    on ws.business_id=p_business_id and ws.worker_id=p_worker_id
   and ws.service_id=p_service_id and ws.active=true;
  v_duration:=greatest(5,coalesce(v_duration,60));
  v_price:=greatest(0,coalesce(v_price,0));
  v_end:=p_starts_at+make_interval(mins=>v_duration);
  v_fingerprint:=md5(jsonb_build_object(
    'conversation_id',p_conversation_id,'branch_id',v_conversation.branch_id,
    'service_id',p_service_id,'worker_id',p_worker_id,'starts_at',p_starts_at
  )::text);

  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l
   where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.create' or v_existing.fingerprint<>v_fingerprint
       or v_existing.conversation_id<>p_conversation_id then
      raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST';
    end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  if not dabbir_private.whatsapp_ai_slot_available_branch(
    p_business_id,v_conversation.branch_id,p_worker_id,p_starts_at,v_end
  ) then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;

  insert into public.dabbir_appointments(
    business_id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,
    simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status
  ) values(
    p_business_id,v_conversation.branch_id,v_conversation.customer_id,p_service_id,p_worker_id,
    p_starts_at,v_end,'new',false,v_price,0,left(coalesce(p_notes,''),2000),'whatsapp','unpaid'
  ) returning * into v_appt;

  insert into public.dabbir_appointment_services(
    business_id,appointment_id,service_id,worker_id,service_name_ar,service_name_en,
    duration_minutes,unit_price_aed,discount_aed
  ) values(
    p_business_id,v_appt.id,p_service_id,p_worker_id,coalesce(v_name_ar,'خدمة'),
    coalesce(v_name_en,'Service'),v_duration,v_price,0
  );

  select * into v_appt from public.dabbir_appointments a
   where a.business_id=p_business_id and a.id=v_appt.id and a.branch_id=v_conversation.branch_id;
  v_result:=jsonb_build_object(
    'ok',true,'verified',true,'appointment_id',v_appt.id,'business_id',v_appt.business_id,
    'branch_id',v_appt.branch_id,'customer_id',v_appt.customer_id,'service_id',v_appt.service_id,
    'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),
    'worker_id',v_appt.worker_id,'worker_name',v_worker.display_name,
    'starts_at',v_appt.starts_at,'ends_at',v_appt.ends_at,'status',v_appt.status,
    'payment_status',v_appt.payment_status,'confirmation_gate',v_appt.confirmation_gate,
    'deposit_required_amount',v_appt.deposit_required_amount,
    'deposit_currency_code',v_appt.deposit_currency_code,
    'price',v_appt.quoted_price_aed,'currency_code',v_business.currency_code
  );
  insert into public.dabbir_ai_action_ledger(
    business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result
  ) values(
    p_business_id,p_conversation_id,v_key,'booking.create',v_fingerprint,v_appt.id,v_result
  );
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_cancel_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_appt public.dabbir_appointments%rowtype;
  v_existing public.dabbir_ai_action_ledger%rowtype;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_fingerprint text;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp'
     and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null or v_conversation.branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(
    select 1 from public.dabbir_handoffs h
    where h.business_id=p_business_id and h.conversation_id=p_conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select * into v_appt from public.dabbir_appointments a
   where a.business_id=p_business_id and a.branch_id=v_conversation.branch_id
     and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;
  if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND_IN_BRANCH'; end if;
  if v_appt.starts_at is null or v_appt.starts_at<=now() then raise exception 'PAST_APPOINTMENT_NOT_CANCELLABLE_BY_AI'; end if;
  v_fingerprint:=md5(jsonb_build_object(
    'conversation_id',p_conversation_id,'branch_id',v_conversation.branch_id,'appointment_id',p_appointment_id
  )::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l
   where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.cancel' or v_existing.fingerprint<>v_fingerprint
       or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;
  if v_appt.status not in ('cancelled','completed','no_show') then
    update public.dabbir_appointments
      set status='cancelled',updated_at=now()
      where business_id=p_business_id and branch_id=v_conversation.branch_id and id=p_appointment_id
      returning * into v_appt;
  end if;
  v_result:=jsonb_build_object(
    'ok',true,'verified',true,'appointment_id',v_appt.id,'branch_id',v_appt.branch_id,
    'status',v_appt.status,'starts_at',v_appt.starts_at
  );
  insert into public.dabbir_ai_action_ledger(
    business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result
  ) values(p_business_id,p_conversation_id,v_key,'booking.cancel',v_fingerprint,v_appt.id,v_result);
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_cancel_booking(uuid,uuid,uuid,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_reschedule_booking(
  p_business_id uuid,p_conversation_id uuid,p_appointment_id uuid,
  p_new_starts_at timestamptz,p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_appt public.dabbir_appointments%rowtype;
  v_existing public.dabbir_ai_action_ledger%rowtype;
  v_duration integer;
  v_end timestamptz;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_fingerprint text;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(v_key) not between 16 and 180 then raise exception 'AI_OPERATION_KEY_REQUIRED'; end if;
  if p_new_starts_at is null or p_new_starts_at<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp'
     and c.demo_mode=false and c.state<>'closed' for update;
  if not found or v_conversation.customer_id is null or v_conversation.branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_conversation.state in ('human_active','action_required') or exists(
    select 1 from public.dabbir_handoffs h
    where h.business_id=p_business_id and h.conversation_id=p_conversation_id
      and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  ) then raise exception 'AI_BLOCKED_BY_HUMAN_TAKEOVER'; end if;
  select * into v_appt from public.dabbir_appointments a
   where a.business_id=p_business_id and a.branch_id=v_conversation.branch_id
     and a.id=p_appointment_id and a.customer_id=v_conversation.customer_id for update;
  if not found then raise exception 'CUSTOMER_APPOINTMENT_NOT_FOUND_IN_BRANCH'; end if;
  if v_appt.starts_at is null or v_appt.starts_at<=now() or v_appt.status in ('cancelled','completed','no_show') then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE_BY_AI';
  end if;
  v_duration:=greatest(5,round(extract(epoch from (
    coalesce(v_appt.ends_at,v_appt.starts_at+interval '60 minutes')-v_appt.starts_at
  ))/60)::integer);
  v_end:=p_new_starts_at+make_interval(mins=>v_duration);
  v_fingerprint:=md5(jsonb_build_object(
    'conversation_id',p_conversation_id,'branch_id',v_conversation.branch_id,
    'appointment_id',p_appointment_id,'new_starts_at',p_new_starts_at
  )::text);
  perform pg_advisory_xact_lock(hashtextextended('dabbir:ai-action:'||p_business_id::text||':'||v_key,0));
  select * into v_existing from public.dabbir_ai_action_ledger l
   where l.business_id=p_business_id and l.operation_key=v_key for update;
  if found then
    if v_existing.operation_type<>'booking.reschedule' or v_existing.fingerprint<>v_fingerprint
       or v_existing.conversation_id<>p_conversation_id then raise exception 'AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dabbir:booking-calendar:'||p_business_id::text,0));
  -- Do not pre-check the slot here: the current appointment would look like its own
  -- worker conflict. The canonical UPDATE trigger validates the new range while excluding itself.
  update public.dabbir_appointments a
    set starts_at=p_new_starts_at,ends_at=v_end,updated_at=now()
    where a.business_id=p_business_id and a.branch_id=v_conversation.branch_id and a.id=p_appointment_id
    returning * into v_appt;
  v_result:=jsonb_build_object(
    'ok',true,'verified',true,'appointment_id',v_appt.id,'branch_id',v_appt.branch_id,
    'status',v_appt.status,'starts_at',v_appt.starts_at,'ends_at',v_appt.ends_at,
    'confirmation_gate',v_appt.confirmation_gate,'deposit_required_amount',v_appt.deposit_required_amount,
    'deposit_currency_code',v_appt.deposit_currency_code
  );
  insert into public.dabbir_ai_action_ledger(
    business_id,conversation_id,operation_key,operation_type,fingerprint,entity_id,result
  ) values(p_business_id,p_conversation_id,v_key,'booking.reschedule',v_fingerprint,v_appt.id,v_result);
  return v_result||jsonb_build_object('idempotent_replay',false);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_reschedule_booking(uuid,uuid,uuid,timestamptz,text) to service_role;

create or replace function public.dabbir_whatsapp_ai_customer_recent_bookings(
  p_business_id uuid,p_conversation_id uuid,p_limit integer default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_customer_id uuid;
  v_branch_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select c.customer_id,c.branch_id into v_customer_id,v_branch_id
  from public.dabbir_conversations c
  where c.business_id=p_business_id and c.id=p_conversation_id
    and c.channel_type='whatsapp' and c.demo_mode=false;
  if v_customer_id is null or v_branch_id is null then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  return coalesce((
    select jsonb_agg(x.obj order by x.starts_at desc) from (
      select a.starts_at,jsonb_build_object(
        'appointment_id',a.id,'branch_id',a.branch_id,'service_id',a.service_id,
        'service_name',coalesce(s.name_ar,s.name,s.name_en),'worker_id',a.worker_id,
        'worker_name',w.display_name,'starts_at',a.starts_at,'ends_at',a.ends_at,
        'status',a.status,'confirmation_gate',a.confirmation_gate,
        'deposit_required_amount',a.deposit_required_amount,
        'deposit_currency_code',a.deposit_currency_code
      ) obj
      from public.dabbir_appointments a
      left join public.dabbir_services s on s.business_id=a.business_id and s.id=a.service_id
      left join public.dabbir_workers w on w.business_id=a.business_id and w.id=a.worker_id
      where a.business_id=p_business_id and a.branch_id=v_branch_id
        and a.customer_id=v_customer_id and a.starts_at<now()
      order by a.starts_at desc limit greatest(1,least(coalesce(p_limit,5),10))
    ) x
  ),'[]'::jsonb);
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_customer_recent_bookings(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_customer_recent_bookings(uuid,uuid,integer) to service_role;
