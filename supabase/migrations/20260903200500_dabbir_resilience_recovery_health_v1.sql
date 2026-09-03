-- Recovery integrity is a core health gate, not an informational metric.
create or replace function public.dabbir_resilience_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog,dabbir_private,pg_temp
as $function$
declare
  v_conflict_guard boolean;
  v_recovery_health jsonb;
  v_recovery_guard boolean;
  v_notif_overdue bigint;
  v_notif_stale bigint;
  v_notif_bad bigint;
  v_outbox_due bigint;
  v_outbox_stale bigint;
  v_outbox_dead bigint;
  v_calendar_error bigint;
  v_payment_error bigint;
  v_core boolean;
begin
  select exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.dabbir_appointments'::regclass and t.tgname='dabbir_appointment_calendar_conflict_guard' and not t.tgisinternal) into v_conflict_guard;
  v_recovery_health:=dabbir_private.recovery_health_check();
  v_recovery_guard:=coalesce((v_recovery_health->>'ok')::boolean,false);
  select count(*) into v_notif_overdue from public.dabbir_workflow_notifications n where n.status='pending' and coalesce(n.next_attempt_at,n.scheduled_for)<now()-interval '10 minutes';
  select count(*) into v_notif_stale from public.dabbir_workflow_notifications n where n.status='processing' and n.updated_at<now()-interval '15 minutes';
  select count(*) into v_notif_bad from public.dabbir_workflow_notifications n where n.status in ('failed','ambiguous') and n.updated_at>now()-interval '1 hour';
  select count(*) into v_outbox_due from public.dabbir_integration_outbox o where o.status in ('pending','retry') and o.available_at<=now()-interval '5 minutes';
  select count(*) into v_outbox_stale from public.dabbir_integration_outbox o where o.status='processing' and o.locked_at<now()-interval '5 minutes';
  select count(*) into v_outbox_dead from public.dabbir_integration_outbox o where o.status='dead' and o.updated_at>now()-interval '24 hours';
  select count(*) into v_calendar_error from public.dabbir_calendar_connections c where c.sync_enabled=true and c.status='error';
  select count(*) into v_payment_error from public.dabbir_payment_events e where e.processing_error is not null and e.received_at>now()-interval '1 hour';
  v_core:=v_conflict_guard and v_recovery_guard;
  return jsonb_build_object(
    'core_ok',v_core,
    'state',case when not v_core then 'critical' when v_outbox_dead>0 or v_notif_stale>0 or v_outbox_stale>0 or v_payment_error>0 then 'degraded' else 'healthy' end,
    'booking_conflict_guard',v_conflict_guard,'recovery_guard',v_recovery_guard,'recovery_health',v_recovery_health,
    'notification_overdue',v_notif_overdue,'notification_stale',v_notif_stale,'notification_failed_or_ambiguous_1h',v_notif_bad,
    'outbox_due',v_outbox_due,'outbox_stale',v_outbox_stale,'outbox_dead_24h',v_outbox_dead,
    'calendar_connections_error',v_calendar_error,'payment_processing_errors_1h',v_payment_error,
    'checked_at',now()
  );
end;
$function$;
revoke all on function public.dabbir_resilience_health_snapshot() from public,anon,authenticated;
grant execute on function public.dabbir_resilience_health_snapshot() to service_role;
