-- DABBIR Availability Option Search V1
-- Read-only broad search authority for the V3 reasoning prototype.
-- Reuses the existing branch-scoped exact availability authority in bounded
-- chunks; it does not interpret human phrases and cannot mutate bookings.

create or replace function public.dabbir_whatsapp_ai_find_available_options_v1(
  p_business_id uuid,
  p_conversation_id uuid,
  p_service_id uuid,
  p_worker_id uuid,
  p_requested_date date,
  p_from time default null,
  p_to time default null,
  p_max_candidates integer default 12
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_seed time;
  v_result jsonb;
  v_slot jsonb;
  v_slots jsonb:='[]'::jsonb;
  v_local text;
  v_time time;
  v_key text;
  v_seen text[]:=array[]::text[];
  v_limit integer:=least(24,greatest(1,coalesce(p_max_candidates,12)));
  v_state text:='NO_SLOTS';
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_business_id is null or p_conversation_id is null or p_requested_date is null then
    raise exception 'AVAILABILITY_SEARCH_SCOPE_REQUIRED';
  end if;
  if p_from is not null and p_to is not null and p_from>p_to then
    raise exception 'AVAILABILITY_SEARCH_RANGE_INVALID';
  end if;

  -- The existing exact authority searches thirteen 30-minute points (6 hours).
  -- Four deterministic seeds cover a local day. Results outside the requested
  -- date/range are filtered here; no semantic daypart is converted to a clock.
  foreach v_seed in array array['00:00'::time,'06:30'::time,'13:00'::time,'19:30'::time] loop
    v_result:=public.dabbir_whatsapp_ai_check_availability(
      p_business_id,p_conversation_id,p_service_id,p_worker_id,
      p_requested_date::timestamp+v_seed
    );

    if coalesce(v_result->>'state','')='NEED_SERVICE' then return v_result; end if;

    for v_slot in select value from jsonb_array_elements(coalesce(v_result->'slots','[]'::jsonb)) loop
      v_local:=nullif(v_slot->>'local_start','');
      if v_local is null or left(v_local,10)<>p_requested_date::text then continue; end if;
      begin v_time:=substring(v_local from 12 for 8)::time; exception when others then continue; end;
      if p_from is not null and v_time<p_from then continue; end if;
      if p_to is not null and v_time>p_to then continue; end if;
      v_key:=coalesce(v_slot->>'starts_at',v_local)||':'||coalesce(v_slot->>'worker_id','');
      if v_key=any(v_seen) then continue; end if;
      v_seen:=array_append(v_seen,v_key);
      v_slots:=v_slots||jsonb_build_array(v_slot);
      exit when jsonb_array_length(v_slots)>=v_limit;
    end loop;
    exit when jsonb_array_length(v_slots)>=v_limit;
  end loop;

  if jsonb_array_length(v_slots)>0 then v_state:='OPTIONS_FOUND'; end if;
  return jsonb_build_object(
    'ok',true,
    'state',v_state,
    'requested_date',p_requested_date,
    'from',p_from,
    'to',p_to,
    'max_candidates',v_limit,
    'slots',v_slots,
    'read_only',true
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_find_available_options_v1(uuid,uuid,uuid,uuid,date,time,time,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_find_available_options_v1(uuid,uuid,uuid,uuid,date,time,time,integer) to service_role;

comment on function public.dabbir_whatsapp_ai_find_available_options_v1(uuid,uuid,uuid,uuid,date,time,time,integer) is
  'Read-only candidate discovery over existing branch-scoped availability truth. Human semantic preferences are not translated to hidden clock ranges.';
