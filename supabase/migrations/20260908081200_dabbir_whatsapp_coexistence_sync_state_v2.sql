-- Coexistence overall state is complete only after both requested sync streams finish.
-- Keep explicit provider/webhook errors fail-closed; transport/API failures use the
-- existing retry state from the bootstrap worker.

create or replace function public.dabbir_whatsapp_mark_coexistence_sync(
  p_phone_number_id text,
  p_kind text,
  p_state text,
  p_request_id text default null,
  p_progress integer default null,
  p_error text default null,
  p_next_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_kind text:=lower(trim(coalesce(p_kind,'')));
  v_state text:=lower(trim(coalesce(p_state,'')));
  v_history_done boolean;
  v_contacts_done boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_kind not in ('mode','history_request','contacts_request','history_event','contacts_event','error') then raise exception 'WHATSAPP_COEXISTENCE_SYNC_KIND_INVALID'; end if;
  if v_state not in ('standard','coexistence','requested','syncing','synced','retry','error') then raise exception 'WHATSAPP_COEXISTENCE_SYNC_STATE_INVALID'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  v_history_done := v_connection.coexistence_history_synced_at is not null
    or (v_kind='history_event' and v_state not in ('error','retry') and coalesce(p_progress,0)>=100);
  v_contacts_done := v_connection.coexistence_contacts_synced_at is not null
    or (v_kind='contacts_event' and v_state not in ('error','retry'));

  update public.dabbir_whatsapp_connections c set
    coexistence_mode=case
      when v_kind='mode' and v_state='standard' then 'standard'
      when v_kind='mode' and v_state='coexistence' then 'coexistence'
      when v_kind<>'error' then 'coexistence'
      else c.coexistence_mode end,
    coexistence_sync_state=case
      when v_kind='mode' and v_state='standard' then 'not_applicable'
      when v_state='retry' then 'retry'
      when v_state='error' then 'error'
      when v_history_done and v_contacts_done then 'synced'
      when v_kind in ('history_event','contacts_event') then 'syncing'
      when v_kind in ('history_request','contacts_request') then 'requested'
      else c.coexistence_sync_state end,
    coexistence_sync_attempts=case when v_state in ('retry','error') then least(20,c.coexistence_sync_attempts+1) else c.coexistence_sync_attempts end,
    coexistence_next_retry_at=case when v_state='retry' then p_next_retry_at else null end,
    coexistence_history_requested_at=case when v_kind='history_request' then coalesce(c.coexistence_history_requested_at,now()) else c.coexistence_history_requested_at end,
    coexistence_history_request_id=case when v_kind='history_request' then coalesce(nullif(left(trim(coalesce(p_request_id,'')),320),''),c.coexistence_history_request_id) else c.coexistence_history_request_id end,
    coexistence_contacts_requested_at=case when v_kind='contacts_request' then coalesce(c.coexistence_contacts_requested_at,now()) else c.coexistence_contacts_requested_at end,
    coexistence_contacts_request_id=case when v_kind='contacts_request' then coalesce(nullif(left(trim(coalesce(p_request_id,'')),320),''),c.coexistence_contacts_request_id) else c.coexistence_contacts_request_id end,
    coexistence_history_progress=case when v_kind='history_event' then greatest(coalesce(c.coexistence_history_progress,0),greatest(0,least(100,coalesce(p_progress,0)))) else c.coexistence_history_progress end,
    coexistence_history_synced_at=case when v_kind='history_event' and v_state not in ('error','retry') and coalesce(p_progress,0)>=100 then coalesce(c.coexistence_history_synced_at,now()) else c.coexistence_history_synced_at end,
    coexistence_contacts_synced_at=case when v_kind='contacts_event' and v_state not in ('error','retry') then coalesce(c.coexistence_contacts_synced_at,now()) else c.coexistence_contacts_synced_at end,
    coexistence_last_event_at=case when v_kind in ('history_event','contacts_event') then now() else c.coexistence_last_event_at end,
    coexistence_last_error=case when v_state in ('retry','error') then left(coalesce(p_error,'COEXISTENCE_SYNC_FAILED'),300) else null end,
    updated_at=now()
   where c.id=v_connection.id;

  return jsonb_build_object(
    'ok',true,
    'connection_id',v_connection.id,
    'kind',v_kind,
    'state',v_state,
    'history_done',v_history_done,
    'contacts_done',v_contacts_done
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_mark_coexistence_sync(text,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_mark_coexistence_sync(text,text,text,text,integer,text,timestamptz) to service_role;
