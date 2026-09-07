-- Align the deterministic WhatsApp service-menu state with the AI state machine.
-- The application already uses service_selected between a list choice and slot lookup;
-- Production proved the previous whitelist rejected it as AI_PENDING_ACTION_INVALID.

alter table public.dabbir_ai_conversation_state
  drop constraint if exists dabbir_ai_conversation_state_action_check;

alter table public.dabbir_ai_conversation_state
  add constraint dabbir_ai_conversation_state_action_check
  check (pending_action in ('none','service_selected','choose_slot','confirm_booking','choose_appointment','reschedule_slot','handoff'));

create or replace function public.dabbir_whatsapp_ai_set_state(
  p_business_id uuid,
  p_conversation_id uuid,
  p_pending_action text,
  p_payload jsonb,
  p_ttl_seconds integer default 900
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_action text:=lower(trim(coalesce(p_pending_action,'none')));
  v_exp timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not exists(
    select 1 from public.dabbir_conversations c
    where c.id=p_conversation_id and c.business_id=p_business_id
  ) then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  if v_action not in ('none','service_selected','choose_slot','confirm_booking','choose_appointment','reschedule_slot','handoff') then
    raise exception 'AI_PENDING_ACTION_INVALID';
  end if;
  v_exp:=case when v_action='none' then null else now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_ttl_seconds,900)))) end;
  insert into public.dabbir_ai_conversation_state(business_id,conversation_id,pending_action,payload,expires_at,updated_at)
  values(p_business_id,p_conversation_id,v_action,coalesce(p_payload,'{}'::jsonb),v_exp,now())
  on conflict (business_id,conversation_id) do update
    set pending_action=excluded.pending_action,payload=excluded.payload,expires_at=excluded.expires_at,updated_at=now();
  return jsonb_build_object('pending_action',v_action,'expires_at',v_exp);
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_set_state(uuid,uuid,text,jsonb,integer) to service_role;
