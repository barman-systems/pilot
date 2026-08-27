-- DABBIR recovery hardening: use an unforgeable private runtime context rather than a client-settable GUC.
create table if not exists dabbir_private.recovery_runtime_context (
  backend_pid integer not null,
  txid bigint not null,
  recovery_case_id uuid not null references dabbir_private.recovery_cases(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (backend_pid,txid)
);
revoke all on table dabbir_private.recovery_runtime_context from public,anon,authenticated,service_role;

create or replace function dabbir_private.recovery_is_active()
returns boolean language sql stable security definer
set search_path=pg_catalog,dabbir_private,pg_temp
as $function$
  select exists(select 1 from dabbir_private.recovery_runtime_context c where c.backend_pid=pg_backend_pid() and c.txid=txid_current());
$function$;
revoke all on function dabbir_private.recovery_is_active() from public;
grant execute on function dabbir_private.recovery_is_active() to anon,authenticated,service_role;

create or replace function dabbir_private.recovery_capture_change()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,extensions,pg_temp
as $function$
declare
  v_cfg dabbir_private.recovery_supported_tables%rowtype; v_before jsonb; v_after jsonb; v_row jsonb; v_row_key jsonb:='{}';
  v_business_ids uuid[]:='{}'; v_user_ids uuid[]:='{}'; v_customer_ids uuid[]:='{}'; v_col text; v_value text;
  v_event_id uuid:=gen_random_uuid(); v_when timestamptz:=clock_timestamp(); v_actor uuid:=auth.uid(); v_hash text;
begin
  if dabbir_private.recovery_is_active() then if tg_op='DELETE' then return old; else return new; end if; end if;
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=tg_table_name and journal_enabled=true;
  if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_before:=case when tg_op in('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_after:=case when tg_op in('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row:=coalesce(v_after,v_before);
  foreach v_col in array v_cfg.pk_columns loop v_row_key:=v_row_key||jsonb_build_object(v_col,v_row->v_col); end loop;
  foreach v_col in array v_cfg.business_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_business_ids:=array_append(v_business_ids,v_value::uuid); end if; end loop;
  foreach v_col in array v_cfg.user_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_user_ids:=array_append(v_user_ids,v_value::uuid); end if; end loop;
  foreach v_col in array v_cfg.customer_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_customer_ids:=array_append(v_customer_ids,v_value::uuid); end if; end loop;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_business_ids from unnest(v_business_ids)x;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_user_ids from unnest(v_user_ids)x;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_customer_ids from unnest(v_customer_ids)x;
  if cardinality(v_business_ids)=0 then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_hash:=encode(extensions.digest(convert_to(concat_ws('|',v_event_id::text,tg_table_name,tg_op,v_row_key::text,coalesce(v_before::text,''),coalesce(v_after::text,''),txid_current()::text,v_when::text),'UTF8'),'sha256'),'hex');
  insert into dabbir_private.recovery_change_journal(id,business_ids,user_ids,customer_ids,table_name,operation,row_key,before_data,after_data,txid,actor_user_id,occurred_at,event_hash)
  values(v_event_id,v_business_ids,v_user_ids,v_customer_ids,tg_table_name,tg_op,v_row_key,v_before,v_after,txid_current(),v_actor,v_when,v_hash);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function dabbir_private.recovery_capture_change() from public,anon,authenticated;

-- Existing application triggers keep enforcing normal rules, but are skipped only while a private recovery case owns this backend+transaction.
drop trigger if exists trg_dabbir_guard_appointment_business_type on public.dabbir_appointments;
create trigger trg_dabbir_guard_appointment_business_type before insert or update of business_id on public.dabbir_appointments for each row when (not dabbir_private.recovery_is_active()) execute function public.dabbir_guard_appointment_business_type();

drop trigger if exists dabbir_businesses_seed_cash_guardian_policy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_cash_guardian_policy after insert on public.dabbir_businesses for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.seed_cash_guardian_policy();
drop trigger if exists dabbir_businesses_seed_privacy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_privacy after insert on public.dabbir_businesses for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.seed_privacy_defaults();
drop trigger if exists dabbir_businesses_seed_safe_followup_policy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_safe_followup_policy after insert on public.dabbir_businesses for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.seed_safe_followup_policy();
drop trigger if exists dabbir_sync_creator_profile on public.dabbir_businesses;
create trigger dabbir_sync_creator_profile after insert or update of business_type,owner_id on public.dabbir_businesses for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.sync_creator_profile();
drop trigger if exists trg_dabbir_seed_activity_tasks on public.dabbir_businesses;
create trigger trg_dabbir_seed_activity_tasks after insert on public.dabbir_businesses for each row when (not dabbir_private.recovery_is_active()) execute function public.dabbir_seed_activity_tasks_trigger();

drop trigger if exists dabbir_creator_profiles_set_updated_at on public.dabbir_creator_profiles;
create trigger dabbir_creator_profiles_set_updated_at before update on public.dabbir_creator_profiles for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();

drop trigger if exists dabbir_customer_consents_audit on public.dabbir_customer_consents;
create trigger dabbir_customer_consents_audit after insert or update on public.dabbir_customer_consents for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.audit_privacy_row();
drop trigger if exists dabbir_customer_consents_touch on public.dabbir_customer_consents;
create trigger dabbir_customer_consents_touch before update on public.dabbir_customer_consents for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();

drop trigger if exists dabbir_followups_normalize_lifecycle_status on public.dabbir_followups;
create trigger dabbir_followups_normalize_lifecycle_status before insert or update of status on public.dabbir_followups for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.normalize_followup_lifecycle_status();

drop trigger if exists dabbir_guard_designated_owner_membership on public.dabbir_memberships;
create trigger dabbir_guard_designated_owner_membership before delete or update on public.dabbir_memberships for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.guard_designated_owner_membership();
drop trigger if exists dabbir_guard_membership_identity on public.dabbir_memberships;
create trigger dabbir_guard_membership_identity before update on public.dabbir_memberships for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.guard_membership_identity();

drop trigger if exists dabbir_messages_capture_safe_internal_followup on public.dabbir_messages;
create trigger dabbir_messages_capture_safe_internal_followup after insert on public.dabbir_messages for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.capture_safe_internal_followup();

drop trigger if exists dabbir_guard_offer_identity_terms on public.dabbir_offers;
create trigger dabbir_guard_offer_identity_terms before update on public.dabbir_offers for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.guard_offer_identity_terms();
drop trigger if exists dabbir_offers_set_updated_at on public.dabbir_offers;
create trigger dabbir_offers_set_updated_at before update on public.dabbir_offers for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();

drop trigger if exists dabbir_audit_owner_mode_change on public.dabbir_owner_modes;
create trigger dabbir_audit_owner_mode_change after insert or update on public.dabbir_owner_modes for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.audit_owner_mode_change();

drop trigger if exists dabbir_payment_accounts_set_updated_at on public.dabbir_payment_accounts;
create trigger dabbir_payment_accounts_set_updated_at before update on public.dabbir_payment_accounts for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();

drop trigger if exists dabbir_payments_set_updated_at on public.dabbir_payments;
create trigger dabbir_payments_set_updated_at before update on public.dabbir_payments for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();
drop trigger if exists dabbir_validate_payment_identity_route on public.dabbir_payments;
create trigger dabbir_validate_payment_identity_route before insert or update on public.dabbir_payments for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.validate_payment_identity_route();

drop trigger if exists dabbir_privacy_requests_audit on public.dabbir_privacy_requests;
create trigger dabbir_privacy_requests_audit after insert or update on public.dabbir_privacy_requests for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.audit_privacy_row();

drop trigger if exists dabbir_procedure_run_state_guard on public.dabbir_procedure_runs;
create trigger dabbir_procedure_run_state_guard before update of state on public.dabbir_procedure_runs for each row when (not dabbir_private.recovery_is_active()) execute function public.dabbir_validate_procedure_run_transition();

drop trigger if exists dabbir_retention_policies_audit on public.dabbir_retention_policies;
create trigger dabbir_retention_policies_audit after insert or update on public.dabbir_retention_policies for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.audit_privacy_row();
drop trigger if exists dabbir_retention_policies_touch on public.dabbir_retention_policies;
create trigger dabbir_retention_policies_touch before update on public.dabbir_retention_policies for each row when (not dabbir_private.recovery_is_active()) execute function dabbir_private.set_updated_at();

drop trigger if exists dabbir_whatsapp_connection_touch on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_connection_touch before update on public.dabbir_whatsapp_connections for each row when (not dabbir_private.recovery_is_active()) execute function public.dabbir_touch_whatsapp_connection_updated_at();

create or replace function dabbir_private.recovery_apply_case(p_case_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare
  v_case dabbir_private.recovery_cases%rowtype; v_event dabbir_private.recovery_change_journal%rowtype;
  v_total integer; v_applied integer:=0; v_pass integer:=0; v_progress integer; v_remaining integer; v_max_passes integer; v_error text;
begin
  select * into v_case from dabbir_private.recovery_cases where id=p_case_id for update;
  if not found then raise exception 'DABBIR_RECOVERY_CASE_NOT_FOUND'; end if;
  if v_case.state<>'previewed' then raise exception 'DABBIR_RECOVERY_CASE_NOT_PREVIEWED:%',v_case.state; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_case.business_id::text,912733));
  update dabbir_private.recovery_cases set state='applying',error=null where id=p_case_id;
  begin
    insert into dabbir_private.recovery_runtime_context(backend_pid,txid,recovery_case_id) values(pg_backend_pid(),txid_current(),p_case_id);
    create temp table if not exists dabbir_recovery_pending(event_id uuid primary key) on commit drop;
    truncate dabbir_recovery_pending;
    insert into dabbir_recovery_pending select j.id from dabbir_private.recovery_change_journal j where v_case.business_id=any(j.business_ids) and j.occurred_at>v_case.target_at and(v_case.customer_id is null or v_case.customer_id=any(j.customer_ids));
    get diagnostics v_total=row_count; v_max_passes:=greatest(v_total+5,10);
    loop
      select count(*) into v_remaining from dabbir_recovery_pending; exit when v_remaining=0;
      v_pass:=v_pass+1; if v_pass>v_max_passes then raise exception 'DABBIR_RECOVERY_DEPENDENCY_DEADLOCK:%_events_remaining',v_remaining; end if;
      v_progress:=0;
      for v_event in
        select j.* from dabbir_recovery_pending p join dabbir_private.recovery_change_journal j on j.id=p.event_id join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
        where not exists(select 1 from dabbir_recovery_pending p2 join dabbir_private.recovery_change_journal j2 on j2.id=p2.event_id where j2.table_name=j.table_name and j2.row_key=j.row_key and(j2.occurred_at,j2.id)>(j.occurred_at,j.id))
        order by cfg.restore_rank asc,j.occurred_at desc,j.id desc
      loop
        begin
          if v_event.operation='INSERT' then
            perform dabbir_private.recovery_delete_row(v_event.table_name,v_event.row_key);
            insert into dabbir_private.recovery_restore_events(recovery_case_id,journal_event_id,inverse_action) values(p_case_id,v_event.id,'DELETE_INSERTED_ROW');
          else
            perform dabbir_private.recovery_upsert_row(v_event.table_name,v_event.before_data);
            insert into dabbir_private.recovery_restore_events(recovery_case_id,journal_event_id,inverse_action) values(p_case_id,v_event.id,'UPSERT_PREVIOUS_ROW');
          end if;
          delete from dabbir_recovery_pending where event_id=v_event.id; v_applied:=v_applied+1; v_progress:=v_progress+1;
        exception when foreign_key_violation or unique_violation or check_violation or not_null_violation then null; end;
      end loop;
      if v_progress=0 then select count(*) into v_remaining from dabbir_recovery_pending; raise exception 'DABBIR_RECOVERY_NO_PROGRESS:%_events_remaining',v_remaining; end if;
    end loop;
    delete from dabbir_private.recovery_runtime_context where backend_pid=pg_backend_pid() and txid=txid_current();
  exception when others then
    v_error:=sqlerrm;
    update dabbir_private.recovery_cases set state='failed',error=v_error,events_applied=0 where id=p_case_id;
    return jsonb_build_object('case_id',p_case_id,'state','failed','error',v_error,'events_applied',0);
  end;
  update dabbir_private.recovery_cases set state='applied',applied_at=clock_timestamp(),events_applied=v_applied,error=null where id=p_case_id;
  return jsonb_build_object('case_id',p_case_id,'state','applied','events_applied',v_applied,'target_at',v_case.target_at,'business_id',v_case.business_id,'customer_id',v_case.customer_id);
end;
$function$;
revoke all on function dabbir_private.recovery_apply_case(uuid) from public,anon,authenticated;
grant execute on function dabbir_private.recovery_apply_case(uuid) to service_role;
