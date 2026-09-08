-- DABBIR car-wash WhatsApp grounding invariant.
-- A mobile car-wash booking is not operationally complete without the vehicle class
-- and the customer's service location. The generic appointment write remains the
-- current WhatsApp booking authority, but this trigger makes those domain facts
-- mandatory and copies the grounded location into the appointment atomically.

create or replace function dabbir_private.car_wash_whatsapp_booking_grounding_v1()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_business_type text;
  v_matches integer := 0;
  v_state jsonb;
  v_vehicle text;
  v_location jsonb;
  v_lat double precision;
  v_lng double precision;
  v_label text;
  v_slot_start timestamptz;
  v_service_id uuid;
begin
  if coalesce(new.booking_source,'') <> 'whatsapp' then
    return new;
  end if;

  select b.business_type into v_business_type
  from public.dabbir_businesses b
  where b.id = new.business_id;

  if coalesce(v_business_type,'') <> 'car_wash' then
    return new;
  end if;

  select count(*) into v_matches
  from public.dabbir_ai_conversation_state s
  join public.dabbir_conversations c
    on c.business_id = s.business_id
   and c.id = s.conversation_id
  where s.business_id = new.business_id
    and c.customer_id = new.customer_id
    and c.branch_id = new.branch_id
    and c.channel_type = 'whatsapp'
    and c.demo_mode = false
    and c.state not in ('closed','human_active','action_required')
    and s.updated_at > clock_timestamp() - interval '30 minutes'
    and s.semantic_state->>'pending_action' = 'CREATE_BOOKING'
    and coalesce((s.semantic_state->>'operational_confidence')::numeric,0) >= 0.90
    and jsonb_array_length(coalesce(s.semantic_state->'missing_fields','[]'::jsonb)) = 0
    and jsonb_array_length(coalesce(s.semantic_state->'unresolved_references','[]'::jsonb)) = 0
    and s.semantic_state#>>'{entities,service,value}' = new.service_id::text
    and s.semantic_state#>>'{entities,slot,starts_at}' is not null
    and (s.semantic_state#>>'{entities,slot,starts_at}')::timestamptz = new.starts_at
    and s.semantic_state#>>'{entities,vehicle,source}' <> 'AI_INFERENCE'
    and s.semantic_state#>>'{entities,location,source}' <> 'AI_INFERENCE';

  if v_matches <> 1 then
    raise exception 'CAR_WASH_GROUNDED_CONTEXT_REQUIRED';
  end if;

  select s.semantic_state into v_state
  from public.dabbir_ai_conversation_state s
  join public.dabbir_conversations c
    on c.business_id = s.business_id
   and c.id = s.conversation_id
  where s.business_id = new.business_id
    and c.customer_id = new.customer_id
    and c.branch_id = new.branch_id
    and c.channel_type = 'whatsapp'
    and c.demo_mode = false
    and c.state not in ('closed','human_active','action_required')
    and s.updated_at > clock_timestamp() - interval '30 minutes'
    and s.semantic_state->>'pending_action' = 'CREATE_BOOKING'
    and s.semantic_state#>>'{entities,service,value}' = new.service_id::text
    and (s.semantic_state#>>'{entities,slot,starts_at}')::timestamptz = new.starts_at
  order by s.updated_at desc
  limit 1;

  v_vehicle := lower(trim(coalesce(v_state#>>'{entities,vehicle,value}','')));
  if v_vehicle not in ('saloon','station') then
    raise exception 'CAR_WASH_VEHICLE_REQUIRED';
  end if;

  v_location := v_state#>'{entities,location,value}';
  if jsonb_typeof(v_location) <> 'object'
     or coalesce(v_location->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(v_location->>'lng','') !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'CAR_WASH_LOCATION_REQUIRED';
  end if;

  v_lat := (v_location->>'lat')::double precision;
  v_lng := (v_location->>'lng')::double precision;
  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    raise exception 'CAR_WASH_LOCATION_INVALID';
  end if;

  v_label := left(trim(coalesce(v_location->>'label','')),500);
  v_slot_start := (v_state#>>'{entities,slot,starts_at}')::timestamptz;
  v_service_id := (v_state#>>'{entities,service,value}')::uuid;
  if v_slot_start is distinct from new.starts_at or v_service_id is distinct from new.service_id then
    raise exception 'CAR_WASH_SEMANTIC_SLOT_MISMATCH';
  end if;

  new.location_type := 'customer';
  new.service_latitude := v_lat;
  new.service_longitude := v_lng;
  new.service_address := v_label;
  if position('vehicle_type=' || v_vehicle in coalesce(new.notes,'')) = 0 then
    new.notes := left(concat_ws(E'\n',nullif(new.notes,''),'vehicle_type=' || v_vehicle),2000);
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.car_wash_whatsapp_booking_grounding_v1() from public, anon, authenticated;
grant execute on function dabbir_private.car_wash_whatsapp_booking_grounding_v1() to service_role;

drop trigger if exists dabbir_car_wash_whatsapp_booking_grounding_v1 on public.dabbir_appointments;
create trigger dabbir_car_wash_whatsapp_booking_grounding_v1
before insert on public.dabbir_appointments
for each row
when (new.booking_source = 'whatsapp')
execute function dabbir_private.car_wash_whatsapp_booking_grounding_v1();
