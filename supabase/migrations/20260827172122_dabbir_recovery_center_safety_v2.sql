alter table dabbir_private.recovery_supported_tables
  add column if not exists restore_mode text not null default 'reconcile_only';
alter table dabbir_private.recovery_supported_tables
  add column if not exists restore_reason text;

do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='dabbir_private.recovery_supported_tables'::regclass
      and conname='recovery_supported_tables_restore_mode_check'
  ) then
    alter table dabbir_private.recovery_supported_tables
      add constraint recovery_supported_tables_restore_mode_check
      check (restore_mode in ('auto_restore','reconcile_only'));
  end if;
end
$ddl$;

update dabbir_private.recovery_supported_tables
set restore_mode='reconcile_only',
    restore_reason=case
      when table_name ~ '(payment|offer)' then 'financial/provider state requires external reconciliation'
      when table_name ~ '(message|whatsapp|followup|channel)' then 'communication state may trigger or conflict with external delivery'
      when table_name ~ '(privacy|consent|retention)' then 'privacy/legal state must not be rolled back automatically'
      when table_name ~ '(procedure|task|handoff|invitation|verification)' then 'workflow state may trigger autonomous or user-facing actions'
      when table_name ~ '(order|appointment)' then 'operational state may trigger fulfillment, reminders, or integrations'
      when table_name in ('dabbir_businesses','dabbir_memberships','dabbir_creator_profiles','dabbir_customer_identities') then 'identity/access routing requires administrator reconciliation'
      else 'not explicitly allowlisted for automatic recovery'
    end,
    updated_at=now();

update dabbir_private.recovery_supported_tables
set restore_mode='auto_restore', restore_reason=null, updated_at=now()
where table_name in (
  'dabbir_business_knowledge',
  'dabbir_customer_management',
  'dabbir_customer_memory',
  'dabbir_inventory',
  'dabbir_products',
  'dabbir_services',
  'dabbir_conversation_outcomes',
  'dabbir_operation_outcomes'
);

create or replace function dabbir_private.recovery_preview(
  p_business_id uuid,
  p_target_at timestamptz,
  p_customer_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,dabbir_private,pg_temp
as $function$
declare
  v_started timestamptz;
  v_events bigint;
  v_auto_events bigint;
  v_reconcile_events bigint;
  v_tables jsonb;
  v_ops jsonb;
  v_auto_tables jsonb;
  v_reconcile_tables jsonb;
  v_first timestamptz;
  v_last timestamptz;
begin
  select journal_started_at into v_started
  from dabbir_private.recovery_state
  where singleton_key=true;

  if p_target_at < v_started then
    raise exception 'DABBIR_RECOVERY_TARGET_BEFORE_JOURNAL_START:%',v_started;
  end if;
  if p_target_at > clock_timestamp() then
    raise exception 'DABBIR_RECOVERY_TARGET_IN_FUTURE';
  end if;

  select count(*),
         count(*) filter (where coalesce(cfg.restore_mode,'reconcile_only')='auto_restore'),
         count(*) filter (where coalesce(cfg.restore_mode,'reconcile_only')<>'auto_restore'),
         min(j.occurred_at),max(j.occurred_at)
    into v_events,v_auto_events,v_reconcile_events,v_first,v_last
  from dabbir_private.recovery_change_journal j
  left join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
  where p_business_id=any(j.business_ids)
    and j.occurred_at>p_target_at
    and (p_customer_id is null or p_customer_id=any(j.customer_ids));

  select coalesce(jsonb_object_agg(table_name,cnt),'{}'::jsonb)
    into v_tables
  from (
    select j.table_name,count(*) cnt
    from dabbir_private.recovery_change_journal j
    where p_business_id=any(j.business_ids)
      and j.occurred_at>p_target_at
      and (p_customer_id is null or p_customer_id=any(j.customer_ids))
    group by j.table_name order by j.table_name
  ) s;

  select coalesce(jsonb_object_agg(operation,cnt),'{}'::jsonb)
    into v_ops
  from (
    select j.operation,count(*) cnt
    from dabbir_private.recovery_change_journal j
    where p_business_id=any(j.business_ids)
      and j.occurred_at>p_target_at
      and (p_customer_id is null or p_customer_id=any(j.customer_ids))
    group by j.operation order by j.operation
  ) s;

  select coalesce(jsonb_object_agg(table_name,cnt),'{}'::jsonb)
    into v_auto_tables
  from (
    select j.table_name,count(*) cnt
    from dabbir_private.recovery_change_journal j
    join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
    where p_business_id=any(j.business_ids)
      and j.occurred_at>p_target_at
      and (p_customer_id is null or p_customer_id=any(j.customer_ids))
      and cfg.restore_mode='auto_restore'
    group by j.table_name order by j.table_name
  ) s;

  select coalesce(jsonb_object_agg(table_name,jsonb_build_object('events',cnt,'reason',reason)),'{}'::jsonb)
    into v_reconcile_tables
  from (
    select j.table_name,count(*) cnt,
           coalesce(max(cfg.restore_reason),'not explicitly allowlisted for automatic recovery') reason
    from dabbir_private.recovery_change_journal j
    left join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
    where p_business_id=any(j.business_ids)
      and j.occurred_at>p_target_at
      and (p_customer_id is null or p_customer_id=any(j.customer_ids))
      and coalesce(cfg.restore_mode,'reconcile_only')<>'auto_restore'
    group by j.table_name order by j.table_name
  ) s;

  return jsonb_build_object(
    'business_id',p_business_id,
    'customer_id',p_customer_id,
    'scope',case when p_customer_id is null then 'business' else 'customer' end,
    'target_at',p_target_at,
    'journal_started_at',v_started,
    'events_to_reverse',v_events,
    'auto_restore_events',v_auto_events,
    'reconciliation_events',v_reconcile_events,
    'auto_restore_ready',(v_reconcile_events=0),
    'first_affected_event_at',v_first,
    'last_affected_event_at',v_last,
    'tables',v_tables,
    'auto_restore_tables',v_auto_tables,
    'reconciliation_tables',v_reconcile_tables,
    'operations',v_ops
  );
end;
$function$;

create or replace function dabbir_private.recovery_open_case(
  p_business_id uuid,
  p_target_at timestamptz,
  p_customer_id uuid default null,
  p_reason text default null,
  p_requested_by_user_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,dabbir_private,pg_temp
as $function$
declare
  v_id uuid:=gen_random_uuid();
  v_preview jsonb;
begin
  v_preview:=dabbir_private.recovery_preview(p_business_id,p_target_at,p_customer_id);
  if coalesce((v_preview->>'auto_restore_ready')::boolean,false)=false then
    raise exception 'DABBIR_RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED:%',coalesce(v_preview->>'reconciliation_events','0');
  end if;
  insert into dabbir_private.recovery_cases(id,business_id,customer_id,scope,target_at,reason,requested_by_user_id,state,preview)
  values(v_id,p_business_id,p_customer_id,case when p_customer_id is null then 'business' else 'customer' end,p_target_at,p_reason,p_requested_by_user_id,'previewed',v_preview);
  return v_id;
end;
$function$;

create or replace function dabbir_private.recovery_upsert_row(p_table_name text,p_row jsonb)
returns void language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare
  v_cfg dabbir_private.recovery_supported_tables%rowtype;
  v_rel regclass; v_cols text; v_select_cols text; v_conflict text; v_update text; v_sql text;
begin
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=p_table_name and journal_enabled=true;
  if not found then raise exception 'DABBIR_RECOVERY_UNSUPPORTED_TABLE:%',p_table_name; end if;
  if v_cfg.restore_mode<>'auto_restore' then raise exception 'DABBIR_RECOVERY_RECONCILE_ONLY_TABLE:%',p_table_name; end if;
  v_rel:=to_regclass(format('public.%I',p_table_name));
  if v_rel is null then raise exception 'DABBIR_RECOVERY_TABLE_NOT_FOUND:%',p_table_name; end if;
  select string_agg(format('%I',a.attname),',' order by a.attnum),string_agg(format('x.%I',a.attname),',' order by a.attnum)
    into v_cols,v_select_cols from pg_attribute a
    where a.attrelid=v_rel and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(format('%I',x),',') into v_conflict from unnest(v_cfg.pk_columns)x;
  select string_agg(format('%1$I=excluded.%1$I',a.attname),',' order by a.attnum) into v_update
    from pg_attribute a where a.attrelid=v_rel and a.attnum>0 and not a.attisdropped and a.attgenerated='' and not(a.attname=any(v_cfg.pk_columns));
  if v_update is null then
    v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x on conflict (%s) do nothing',p_table_name,v_cols,v_select_cols,p_table_name,v_conflict);
  else
    v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x on conflict (%s) do update set %s',p_table_name,v_cols,v_select_cols,p_table_name,v_conflict,v_update);
  end if;
  execute v_sql using p_row;
end;
$function$;

create or replace function dabbir_private.recovery_delete_row(p_table_name text,p_row_key jsonb)
returns void language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare
  v_cfg dabbir_private.recovery_supported_tables%rowtype; v_col text; v_where text:='';
begin
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=p_table_name and journal_enabled=true;
  if not found then raise exception 'DABBIR_RECOVERY_UNSUPPORTED_TABLE:%',p_table_name; end if;
  if v_cfg.restore_mode<>'auto_restore' then raise exception 'DABBIR_RECOVERY_RECONCILE_ONLY_TABLE:%',p_table_name; end if;
  foreach v_col in array v_cfg.pk_columns loop
    if v_where<>'' then v_where:=v_where||' and '; end if;
    v_where:=v_where||format('t.%I::text = ($1 ->> %L)',v_col,v_col);
  end loop;
  execute format('delete from public.%I t where %s',p_table_name,v_where) using p_row_key;
end;
$function$;

create or replace function dabbir_private.recovery_apply_case(p_case_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare
  v_case dabbir_private.recovery_cases%rowtype;
  v_event dabbir_private.recovery_change_journal%rowtype;
  v_total integer; v_applied integer:=0; v_pass integer:=0; v_progress integer; v_remaining integer; v_max_passes integer; v_blocked integer; v_error text;
begin
  select * into v_case from dabbir_private.recovery_cases where id=p_case_id for update;
  if not found then raise exception 'DABBIR_RECOVERY_CASE_NOT_FOUND'; end if;
  if v_case.state<>'previewed' then raise exception 'DABBIR_RECOVERY_CASE_NOT_PREVIEWED:%',v_case.state; end if;

  select count(*) into v_blocked
  from dabbir_private.recovery_change_journal j
  left join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
  where v_case.business_id=any(j.business_ids)
    and j.occurred_at>v_case.target_at
    and (v_case.customer_id is null or v_case.customer_id=any(j.customer_ids))
    and coalesce(cfg.restore_mode,'reconcile_only')<>'auto_restore';
  if v_blocked>0 then raise exception 'DABBIR_RECOVERY_EXTERNAL_RECONCILIATION_REQUIRED:%',v_blocked; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_case.business_id::text,912733));
  update dabbir_private.recovery_cases set state='applying',error=null where id=p_case_id;
  begin
    insert into dabbir_private.recovery_runtime_context(backend_pid,txid,recovery_case_id) values(pg_backend_pid(),txid_current(),p_case_id);
    create temp table if not exists dabbir_recovery_pending(event_id uuid primary key) on commit drop;
    truncate dabbir_recovery_pending;
    insert into dabbir_recovery_pending(event_id)
    select j.id from dabbir_private.recovery_change_journal j
    where v_case.business_id=any(j.business_ids) and j.occurred_at>v_case.target_at and (v_case.customer_id is null or v_case.customer_id=any(j.customer_ids));
    get diagnostics v_total=row_count;
    v_max_passes:=greatest(v_total+5,10);
    loop
      select count(*) into v_remaining from dabbir_recovery_pending; exit when v_remaining=0;
      v_pass:=v_pass+1; if v_pass>v_max_passes then raise exception 'DABBIR_RECOVERY_DEPENDENCY_DEADLOCK:%_events_remaining',v_remaining; end if;
      v_progress:=0;
      for v_event in
        select j.* from dabbir_recovery_pending p
        join dabbir_private.recovery_change_journal j on j.id=p.event_id
        join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name
        where cfg.restore_mode='auto_restore' and not exists(
          select 1 from dabbir_recovery_pending p2 join dabbir_private.recovery_change_journal j2 on j2.id=p2.event_id
          where j2.table_name=j.table_name and j2.row_key=j.row_key and (j2.occurred_at,j2.id)>(j.occurred_at,j.id)
        )
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
          delete from dabbir_recovery_pending where event_id=v_event.id;
          v_applied:=v_applied+1; v_progress:=v_progress+1;
        exception when foreign_key_violation or unique_violation or check_violation or not_null_violation then null;
        end;
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

create or replace function dabbir_private.platform_assert_recovery_frozen(p_target_user_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare v_status text;
begin
  select status into v_status from public.account_access_state where user_id=p_target_user_id;
  if coalesce(v_status,'active')<>'suspended' then
    raise exception 'DABBIR_RECOVERY_ACCOUNT_MUST_BE_SUSPENDED';
  end if;
end;
$function$;
revoke all on function dabbir_private.platform_assert_recovery_frozen(uuid) from public,anon,authenticated;

create or replace function public.dabbir_platform_recovery_preview(p_actor_user_id uuid,p_target_user_id uuid,p_business_id uuid,p_target_at timestamptz)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private
as $function$
declare v_preview jsonb; v_suspended boolean;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=p_business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  v_preview:=dabbir_private.recovery_preview(p_business_id,p_target_at,null);
  select coalesce(status='suspended',false) into v_suspended from public.account_access_state where user_id=p_target_user_id;
  v_preview:=v_preview||jsonb_build_object('account_suspended',coalesce(v_suspended,false));
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details)
  values(p_actor_user_id,'recovery_preview',p_target_user_id,p_business_id,jsonb_build_object('target_at',p_target_at,'events_to_reverse',v_preview->'events_to_reverse','reconciliation_events',v_preview->'reconciliation_events'));
  return v_preview;
end;
$function$;

create or replace function public.dabbir_platform_recovery_open(p_actor_user_id uuid,p_target_user_id uuid,p_business_id uuid,p_target_at timestamptz,p_reason text default null)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private
as $function$
declare v_case uuid;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=p_business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  perform dabbir_private.platform_assert_recovery_frozen(p_target_user_id);
  v_case:=dabbir_private.recovery_open_case(p_business_id,p_target_at,null,left(coalesce(p_reason,'platform support recovery'),500),p_actor_user_id);
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details)
  values(p_actor_user_id,'recovery_case_opened',p_target_user_id,p_business_id,v_case,jsonb_build_object('target_at',p_target_at));
  return v_case;
end;
$function$;

create or replace function public.dabbir_platform_recovery_apply(p_actor_user_id uuid,p_target_user_id uuid,p_case_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dabbir_private
as $function$
declare v_case dabbir_private.recovery_cases%rowtype; v_customer_no text; v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  select * into v_case from dabbir_private.recovery_cases where id=p_case_id;
  if not found then raise exception 'DABBIR_RECOVERY_CASE_NOT_FOUND'; end if;
  if not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=v_case.business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  perform dabbir_private.platform_assert_recovery_frozen(p_target_user_id);
  select customer_no into v_customer_no from public.dabbir_user_accounts where user_id=p_target_user_id;
  if trim(coalesce(p_confirmation,''))<>('RESTORE '||v_customer_no) then raise exception 'DABBIR_RECOVERY_CONFIRMATION_REQUIRED'; end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details)
  values(p_actor_user_id,'recovery_apply_requested',p_target_user_id,v_case.business_id,p_case_id,jsonb_build_object('target_at',v_case.target_at));
  v_result:=dabbir_private.recovery_apply_case(p_case_id);
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,recovery_case_id,details)
  values(p_actor_user_id,'recovery_apply_result',p_target_user_id,v_case.business_id,p_case_id,v_result);
  return v_result;
end;
$function$;

revoke all on function public.dabbir_platform_recovery_preview(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_platform_recovery_open(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_recovery_apply(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_recovery_preview(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.dabbir_platform_recovery_open(uuid,uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.dabbir_platform_recovery_apply(uuid,uuid,uuid,text) to service_role;