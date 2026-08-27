-- DABBIR Customer Recovery Vault v1
-- Row-level point-in-time recovery for tenant/customer data using append-only change journaling.
-- This does NOT enable paid Supabase PITR and does not touch auth.users rows.

create table if not exists dabbir_private.recovery_supported_tables (
  table_name text primary key,
  pk_columns text[] not null,
  business_columns text[] not null,
  user_columns text[] not null default '{}'::text[],
  customer_columns text[] not null default '{}'::text[],
  journal_enabled boolean not null default true,
  snapshot_enabled boolean not null default true,
  restore_rank integer not null default 100,
  updated_at timestamptz not null default now()
);

create table if not exists dabbir_private.recovery_state (
  singleton_key boolean primary key default true check (singleton_key),
  journal_started_at timestamptz not null,
  version text not null,
  updated_at timestamptz not null default now()
);

insert into dabbir_private.recovery_state(singleton_key,journal_started_at,version)
values (true, clock_timestamp(), 'v1')
on conflict (singleton_key) do nothing;

create table if not exists dabbir_private.recovery_change_journal (
  id uuid primary key default gen_random_uuid(),
  business_ids uuid[] not null,
  user_ids uuid[] not null default '{}'::uuid[],
  customer_ids uuid[] not null default '{}'::uuid[],
  table_name text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  row_key jsonb not null,
  before_data jsonb,
  after_data jsonb,
  txid bigint not null default txid_current(),
  actor_user_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  event_hash text not null,
  constraint recovery_change_journal_payload_check check (
    (operation='INSERT' and before_data is null and after_data is not null)
    or (operation='UPDATE' and before_data is not null and after_data is not null)
    or (operation='DELETE' and before_data is not null and after_data is null)
  )
);

create index if not exists recovery_change_journal_business_gin on dabbir_private.recovery_change_journal using gin (business_ids);
create index if not exists recovery_change_journal_customer_gin on dabbir_private.recovery_change_journal using gin (customer_ids);
create index if not exists recovery_change_journal_user_gin on dabbir_private.recovery_change_journal using gin (user_ids);
create index if not exists recovery_change_journal_time_idx on dabbir_private.recovery_change_journal (occurred_at desc);
create index if not exists recovery_change_journal_table_time_idx on dabbir_private.recovery_change_journal (table_name, occurred_at desc);
create index if not exists recovery_change_journal_row_key_gin on dabbir_private.recovery_change_journal using gin (row_key);

create table if not exists dabbir_private.recovery_snapshot_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  reason text not null default 'scheduled' check (reason in ('baseline','scheduled','manual','pre_restore')),
  status text not null default 'running' check (status in ('running','complete','failed')),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  table_count integer not null default 0,
  row_count bigint not null default 0,
  details jsonb not null default '{}'::jsonb,
  error text
);
create index if not exists recovery_snapshot_batches_business_time_idx on dabbir_private.recovery_snapshot_batches (business_id, started_at desc);

create table if not exists dabbir_private.recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references dabbir_private.recovery_snapshot_batches(id) on delete cascade,
  business_id uuid not null,
  table_name text not null,
  captured_at timestamptz not null default clock_timestamp(),
  row_count bigint not null,
  rows jsonb not null,
  content_hash text not null
);
create index if not exists recovery_snapshots_business_table_time_idx on dabbir_private.recovery_snapshots (business_id, table_name, captured_at desc);
create index if not exists recovery_snapshots_batch_idx on dabbir_private.recovery_snapshots (batch_id);

create table if not exists dabbir_private.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid,
  scope text not null check (scope in ('business','customer')),
  target_at timestamptz not null,
  reason text,
  requested_by_user_id uuid,
  state text not null default 'previewed' check (state in ('previewed','applying','applied','failed','cancelled')),
  preview jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz,
  events_applied integer not null default 0,
  error text,
  constraint recovery_cases_scope_customer_check check ((scope='business' and customer_id is null) or (scope='customer' and customer_id is not null))
);
create index if not exists recovery_cases_business_time_idx on dabbir_private.recovery_cases (business_id, created_at desc);

create table if not exists dabbir_private.recovery_restore_events (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references dabbir_private.recovery_cases(id) on delete restrict,
  journal_event_id uuid not null references dabbir_private.recovery_change_journal(id) on delete restrict,
  inverse_action text not null check (inverse_action in ('DELETE_INSERTED_ROW','UPSERT_PREVIOUS_ROW')),
  applied_at timestamptz not null default clock_timestamp(),
  unique (recovery_case_id, journal_event_id)
);

create or replace function dabbir_private.recovery_block_mutation() returns trigger language plpgsql security definer set search_path=pg_catalog,dabbir_private,pg_temp as $function$
begin raise exception 'DABBIR_RECOVERY_APPEND_ONLY'; end;
$function$;
revoke all on function dabbir_private.recovery_block_mutation() from public,anon,authenticated;
drop trigger if exists recovery_change_journal_append_only on dabbir_private.recovery_change_journal;
create trigger recovery_change_journal_append_only before update or delete on dabbir_private.recovery_change_journal for each row execute function dabbir_private.recovery_block_mutation();
drop trigger if exists recovery_restore_events_append_only on dabbir_private.recovery_restore_events;
create trigger recovery_restore_events_append_only before update or delete on dabbir_private.recovery_restore_events for each row execute function dabbir_private.recovery_block_mutation();

create or replace function dabbir_private.recovery_refresh_registry() returns integer language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp as $function$
declare r record; v_rel regclass; v_pk text[]; v_business text[]; v_users text[]; v_customers text[]; v_journal boolean; v_rank integer; v_count integer:=0;
begin
  for r in select c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'dabbir\_%' escape '\' loop
    v_rel:=to_regclass(format('public.%I',r.table_name));
    select array_agg(a.attname order by ord.n) into v_pk from pg_index i join lateral unnest(i.indkey) with ordinality ord(attnum,n) on true join pg_attribute a on a.attrelid=i.indrelid and a.attnum=ord.attnum where i.indrelid=v_rel and i.indisprimary;
    if v_pk is null or cardinality(v_pk)=0 then continue; end if;
    if r.table_name='dabbir_businesses' then v_business:=array['id'];
    elsif r.table_name='dabbir_offers' then v_business:=array['creator_business_id','advertiser_business_id'];
    elsif r.table_name='dabbir_payments' then v_business:=array['recipient_business_id','payer_business_id'];
    elsif exists(select 1 from pg_attribute where attrelid=v_rel and attname='business_id' and attnum>0 and not attisdropped) then v_business:=array['business_id'];
    else continue; end if;
    select coalesce(array_agg(x.col order by x.ord),'{}'::text[]) into v_users from (select u.col,u.ord from unnest(array['user_id','owner_id','payer_user_id','created_by_user_id','sender_user_id','actor_user_id','assigned_user_id']) with ordinality u(col,ord) where exists(select 1 from pg_attribute a where a.attrelid=v_rel and a.attname=u.col and a.attnum>0 and not a.attisdropped)) x;
    select coalesce(array_agg(x.col order by x.ord),'{}'::text[]) into v_customers from (select u.col,u.ord from unnest(array['customer_id','payer_customer_id']) with ordinality u(col,ord) where exists(select 1 from pg_attribute a where a.attrelid=v_rel and a.attname=u.col and a.attnum>0 and not a.attisdropped)) x;
    v_journal:=not(r.table_name~'(audit|event|evidence|log|demo|quality)' or r.table_name in ('dabbir_event_inbox','dabbir_message_batch_items'));
    v_rank:=case when r.table_name='dabbir_businesses' then 10 when r.table_name in('dabbir_memberships','dabbir_creator_profiles') then 20 when r.table_name in('dabbir_customers','dabbir_payment_accounts') then 30 when r.table_name in('dabbir_conversations','dabbir_orders','dabbir_appointments','dabbir_tasks','dabbir_whatsapp_connections') then 40 when r.table_name='dabbir_offers' then 50 when r.table_name='dabbir_payments' then 60 when r.table_name='dabbir_messages' then 70 else 45 end;
    insert into dabbir_private.recovery_supported_tables(table_name,pk_columns,business_columns,user_columns,customer_columns,journal_enabled,snapshot_enabled,restore_rank,updated_at) values(r.table_name,v_pk,v_business,v_users,v_customers,v_journal,true,v_rank,now()) on conflict(table_name) do update set pk_columns=excluded.pk_columns,business_columns=excluded.business_columns,user_columns=excluded.user_columns,customer_columns=excluded.customer_columns,journal_enabled=excluded.journal_enabled,snapshot_enabled=excluded.snapshot_enabled,restore_rank=excluded.restore_rank,updated_at=now();
    if v_journal then execute format('drop trigger if exists dabbir_recovery_capture on public.%I',r.table_name); execute format('create trigger dabbir_recovery_capture after insert or update or delete on public.%I for each row execute function dabbir_private.recovery_capture_change()',r.table_name); else execute format('drop trigger if exists dabbir_recovery_capture on public.%I',r.table_name); end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;
revoke all on function dabbir_private.recovery_refresh_registry() from public,anon,authenticated;
grant execute on function dabbir_private.recovery_refresh_registry() to service_role;

create or replace function dabbir_private.recovery_capture_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,extensions,pg_temp as $function$
declare v_cfg dabbir_private.recovery_supported_tables%rowtype; v_before jsonb; v_after jsonb; v_row jsonb; v_row_key jsonb:='{}'; v_business_ids uuid[]:='{}'; v_user_ids uuid[]:='{}'; v_customer_ids uuid[]:='{}'; v_col text; v_value text; v_event_id uuid:=gen_random_uuid(); v_when timestamptz:=clock_timestamp(); v_actor uuid:=auth.uid(); v_hash text;
begin
  if current_setting('dabbir.recovery_mode',true)='on' then if tg_op='DELETE' then return old; else return new; end if; end if;
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=tg_table_name and journal_enabled=true;
  if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_before:=case when tg_op in('UPDATE','DELETE') then to_jsonb(old) else null end; v_after:=case when tg_op in('INSERT','UPDATE') then to_jsonb(new) else null end; v_row:=coalesce(v_after,v_before);
  foreach v_col in array v_cfg.pk_columns loop v_row_key:=v_row_key||jsonb_build_object(v_col,v_row->v_col); end loop;
  foreach v_col in array v_cfg.business_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_business_ids:=array_append(v_business_ids,v_value::uuid); end if; end loop;
  foreach v_col in array v_cfg.user_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_user_ids:=array_append(v_user_ids,v_value::uuid); end if; end loop;
  foreach v_col in array v_cfg.customer_columns loop v_value:=v_row->>v_col; if v_value is not null and v_value<>'' then v_customer_ids:=array_append(v_customer_ids,v_value::uuid); end if; end loop;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_business_ids from unnest(v_business_ids)x; select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_user_ids from unnest(v_user_ids)x; select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_customer_ids from unnest(v_customer_ids)x;
  if cardinality(v_business_ids)=0 then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_hash:=encode(extensions.digest(convert_to(concat_ws('|',v_event_id::text,tg_table_name,tg_op,v_row_key::text,coalesce(v_before::text,''),coalesce(v_after::text,''),txid_current()::text,v_when::text),'UTF8'),'sha256'),'hex');
  insert into dabbir_private.recovery_change_journal(id,business_ids,user_ids,customer_ids,table_name,operation,row_key,before_data,after_data,txid,actor_user_id,occurred_at,event_hash) values(v_event_id,v_business_ids,v_user_ids,v_customer_ids,tg_table_name,tg_op,v_row_key,v_before,v_after,txid_current(),v_actor,v_when,v_hash);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function dabbir_private.recovery_capture_change() from public,anon,authenticated;
select dabbir_private.recovery_refresh_registry();

create or replace function dabbir_private.recovery_upsert_row(p_table_name text,p_row jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp as $function$
declare v_cfg dabbir_private.recovery_supported_tables%rowtype; v_rel regclass; v_cols text; v_select_cols text; v_conflict text; v_update text; v_sql text;
begin
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=p_table_name and journal_enabled=true; if not found then raise exception 'DABBIR_RECOVERY_UNSUPPORTED_TABLE:%',p_table_name; end if;
  v_rel:=to_regclass(format('public.%I',p_table_name)); if v_rel is null then raise exception 'DABBIR_RECOVERY_TABLE_NOT_FOUND:%',p_table_name; end if;
  select string_agg(format('%I',a.attname),',' order by a.attnum),string_agg(format('x.%I',a.attname),',' order by a.attnum) into v_cols,v_select_cols from pg_attribute a where a.attrelid=v_rel and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(format('%I',x),',') into v_conflict from unnest(v_cfg.pk_columns)x;
  select string_agg(format('%1$I=excluded.%1$I',a.attname),',' order by a.attnum) into v_update from pg_attribute a where a.attrelid=v_rel and a.attnum>0 and not a.attisdropped and a.attgenerated='' and not(a.attname=any(v_cfg.pk_columns));
  if v_update is null then v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x on conflict (%s) do nothing',p_table_name,v_cols,v_select_cols,p_table_name,v_conflict); else v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x on conflict (%s) do update set %s',p_table_name,v_cols,v_select_cols,p_table_name,v_conflict,v_update); end if;
  execute v_sql using p_row;
end;
$function$;
revoke all on function dabbir_private.recovery_upsert_row(text,jsonb) from public,anon,authenticated;

create or replace function dabbir_private.recovery_delete_row(p_table_name text,p_row_key jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp as $function$
declare v_cfg dabbir_private.recovery_supported_tables%rowtype; v_col text; v_where text:='';
begin
  select * into v_cfg from dabbir_private.recovery_supported_tables where table_name=p_table_name and journal_enabled=true; if not found then raise exception 'DABBIR_RECOVERY_UNSUPPORTED_TABLE:%',p_table_name; end if;
  foreach v_col in array v_cfg.pk_columns loop if v_where<>'' then v_where:=v_where||' and '; end if; v_where:=v_where||format('t.%I::text = ($1 ->> %L)',v_col,v_col); end loop;
  execute format('delete from public.%I t where %s',p_table_name,v_where) using p_row_key;
end;
$function$;
revoke all on function dabbir_private.recovery_delete_row(text,jsonb) from public,anon,authenticated;

create or replace function dabbir_private.recovery_preview(p_business_id uuid,p_target_at timestamptz,p_customer_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,dabbir_private,pg_temp as $function$
declare v_started timestamptz; v_events bigint; v_tables jsonb; v_ops jsonb; v_first timestamptz; v_last timestamptz;
begin
  select journal_started_at into v_started from dabbir_private.recovery_state where singleton_key=true; if p_target_at<v_started then raise exception 'DABBIR_RECOVERY_TARGET_BEFORE_JOURNAL_START:%',v_started; end if; if p_target_at>clock_timestamp() then raise exception 'DABBIR_RECOVERY_TARGET_IN_FUTURE'; end if;
  select count(*),min(occurred_at),max(occurred_at) into v_events,v_first,v_last from dabbir_private.recovery_change_journal j where p_business_id=any(j.business_ids) and j.occurred_at>p_target_at and(p_customer_id is null or p_customer_id=any(j.customer_ids));
  select coalesce(jsonb_object_agg(table_name,cnt),'{}') into v_tables from(select table_name,count(*)cnt from dabbir_private.recovery_change_journal j where p_business_id=any(j.business_ids) and j.occurred_at>p_target_at and(p_customer_id is null or p_customer_id=any(j.customer_ids)) group by table_name order by table_name)s;
  select coalesce(jsonb_object_agg(operation,cnt),'{}') into v_ops from(select operation,count(*)cnt from dabbir_private.recovery_change_journal j where p_business_id=any(j.business_ids) and j.occurred_at>p_target_at and(p_customer_id is null or p_customer_id=any(j.customer_ids)) group by operation order by operation)s;
  return jsonb_build_object('business_id',p_business_id,'customer_id',p_customer_id,'scope',case when p_customer_id is null then 'business' else 'customer' end,'target_at',p_target_at,'journal_started_at',v_started,'events_to_reverse',v_events,'first_affected_event_at',v_first,'last_affected_event_at',v_last,'tables',v_tables,'operations',v_ops);
end;
$function$;
revoke all on function dabbir_private.recovery_preview(uuid,timestamptz,uuid) from public,anon,authenticated; grant execute on function dabbir_private.recovery_preview(uuid,timestamptz,uuid) to service_role;

create or replace function dabbir_private.recovery_open_case(p_business_id uuid,p_target_at timestamptz,p_customer_id uuid default null,p_reason text default null,p_requested_by_user_id uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,dabbir_private,pg_temp as $function$
declare v_id uuid:=gen_random_uuid(); v_preview jsonb;
begin v_preview:=dabbir_private.recovery_preview(p_business_id,p_target_at,p_customer_id); insert into dabbir_private.recovery_cases(id,business_id,customer_id,scope,target_at,reason,requested_by_user_id,state,preview) values(v_id,p_business_id,p_customer_id,case when p_customer_id is null then 'business' else 'customer' end,p_target_at,p_reason,p_requested_by_user_id,'previewed',v_preview); return v_id; end;
$function$;
revoke all on function dabbir_private.recovery_open_case(uuid,timestamptz,uuid,text,uuid) from public,anon,authenticated; grant execute on function dabbir_private.recovery_open_case(uuid,timestamptz,uuid,text,uuid) to service_role;

create or replace function dabbir_private.recovery_apply_case(p_case_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp as $function$
declare v_case dabbir_private.recovery_cases%rowtype; v_event dabbir_private.recovery_change_journal%rowtype; v_total integer; v_applied integer:=0; v_pass integer:=0; v_progress integer; v_remaining integer; v_max_passes integer; v_error text;
begin
  select * into v_case from dabbir_private.recovery_cases where id=p_case_id for update; if not found then raise exception 'DABBIR_RECOVERY_CASE_NOT_FOUND'; end if; if v_case.state<>'previewed' then raise exception 'DABBIR_RECOVERY_CASE_NOT_PREVIEWED:%',v_case.state; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_case.business_id::text,912733)); update dabbir_private.recovery_cases set state='applying',error=null where id=p_case_id;
  begin
    perform set_config('dabbir.recovery_mode','on',true); create temp table if not exists dabbir_recovery_pending(event_id uuid primary key) on commit drop; truncate dabbir_recovery_pending;
    insert into dabbir_recovery_pending select j.id from dabbir_private.recovery_change_journal j where v_case.business_id=any(j.business_ids) and j.occurred_at>v_case.target_at and(v_case.customer_id is null or v_case.customer_id=any(j.customer_ids)); get diagnostics v_total=row_count; v_max_passes:=greatest(v_total+5,10);
    loop select count(*) into v_remaining from dabbir_recovery_pending; exit when v_remaining=0; v_pass:=v_pass+1; if v_pass>v_max_passes then raise exception 'DABBIR_RECOVERY_DEPENDENCY_DEADLOCK:%_events_remaining',v_remaining; end if; v_progress:=0;
      for v_event in select j.* from dabbir_recovery_pending p join dabbir_private.recovery_change_journal j on j.id=p.event_id join dabbir_private.recovery_supported_tables cfg on cfg.table_name=j.table_name where not exists(select 1 from dabbir_recovery_pending p2 join dabbir_private.recovery_change_journal j2 on j2.id=p2.event_id where j2.table_name=j.table_name and j2.row_key=j.row_key and(j2.occurred_at,j2.id)>(j.occurred_at,j.id)) order by cfg.restore_rank asc,j.occurred_at desc,j.id desc loop
        begin if v_event.operation='INSERT' then perform dabbir_private.recovery_delete_row(v_event.table_name,v_event.row_key); insert into dabbir_private.recovery_restore_events(recovery_case_id,journal_event_id,inverse_action) values(p_case_id,v_event.id,'DELETE_INSERTED_ROW'); else perform dabbir_private.recovery_upsert_row(v_event.table_name,v_event.before_data); insert into dabbir_private.recovery_restore_events(recovery_case_id,journal_event_id,inverse_action) values(p_case_id,v_event.id,'UPSERT_PREVIOUS_ROW'); end if; delete from dabbir_recovery_pending where event_id=v_event.id; v_applied:=v_applied+1; v_progress:=v_progress+1; exception when foreign_key_violation or unique_violation or check_violation or not_null_violation then null; end;
      end loop;
      if v_progress=0 then select count(*) into v_remaining from dabbir_recovery_pending; raise exception 'DABBIR_RECOVERY_NO_PROGRESS:%_events_remaining',v_remaining; end if;
    end loop; perform set_config('dabbir.recovery_mode','off',true);
  exception when others then v_error:=sqlerrm; perform set_config('dabbir.recovery_mode','off',true); update dabbir_private.recovery_cases set state='failed',error=v_error,events_applied=0 where id=p_case_id; return jsonb_build_object('case_id',p_case_id,'state','failed','error',v_error,'events_applied',0); end;
  update dabbir_private.recovery_cases set state='applied',applied_at=clock_timestamp(),events_applied=v_applied,error=null where id=p_case_id; return jsonb_build_object('case_id',p_case_id,'state','applied','events_applied',v_applied,'target_at',v_case.target_at,'business_id',v_case.business_id,'customer_id',v_case.customer_id);
end;
$function$;
revoke all on function dabbir_private.recovery_apply_case(uuid) from public,anon,authenticated; grant execute on function dabbir_private.recovery_apply_case(uuid) to service_role;

create or replace function dabbir_private.recovery_capture_business_snapshot(p_business_id uuid,p_reason text default 'manual') returns uuid language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,extensions,pg_temp as $function$
declare v_batch uuid:=gen_random_uuid(); v_cfg dabbir_private.recovery_supported_tables%rowtype; v_col text; v_where text; v_order text; v_rows jsonb; v_count bigint; v_tables integer:=0; v_total bigint:=0; v_details jsonb:='{}'; v_hash text;
begin
  if p_reason not in('baseline','scheduled','manual','pre_restore') then raise exception 'DABBIR_RECOVERY_INVALID_SNAPSHOT_REASON'; end if; insert into dabbir_private.recovery_snapshot_batches(id,business_id,reason,status) values(v_batch,p_business_id,p_reason,'running');
  begin
    for v_cfg in select * from dabbir_private.recovery_supported_tables where snapshot_enabled=true order by restore_rank,table_name loop v_where:=''; foreach v_col in array v_cfg.business_columns loop if v_where<>'' then v_where:=v_where||' or '; end if; v_where:=v_where||format('t.%I = $1',v_col); end loop; select string_agg(format('t.%I',x),',') into v_order from unnest(v_cfg.pk_columns)x; execute format('select coalesce(jsonb_agg(to_jsonb(t) order by %s),''[]''::jsonb),count(*) from public.%I t where (%s)',v_order,v_cfg.table_name,v_where) into v_rows,v_count using p_business_id; v_hash:=encode(extensions.digest(convert_to(v_rows::text,'UTF8'),'sha256'),'hex'); insert into dabbir_private.recovery_snapshots(batch_id,business_id,table_name,row_count,rows,content_hash) values(v_batch,p_business_id,v_cfg.table_name,v_count,v_rows,v_hash); v_tables:=v_tables+1; v_total:=v_total+v_count; v_details:=v_details||jsonb_build_object(v_cfg.table_name,v_count); end loop;
    update dabbir_private.recovery_snapshot_batches set status='complete',completed_at=clock_timestamp(),table_count=v_tables,row_count=v_total,details=v_details,error=null where id=v_batch;
  exception when others then update dabbir_private.recovery_snapshot_batches set status='failed',completed_at=clock_timestamp(),error=sqlerrm where id=v_batch; return v_batch; end; return v_batch;
end;
$function$;
revoke all on function dabbir_private.recovery_capture_business_snapshot(uuid,text) from public,anon,authenticated; grant execute on function dabbir_private.recovery_capture_business_snapshot(uuid,text) to service_role;

create or replace function dabbir_private.recovery_capture_all_business_snapshots() returns integer language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,pg_temp as $function$
declare r record; v_count integer:=0; begin for r in select id from public.dabbir_businesses order by id loop perform dabbir_private.recovery_capture_business_snapshot(r.id,'scheduled'); v_count:=v_count+1; end loop; return v_count; end;
$function$;
revoke all on function dabbir_private.recovery_capture_all_business_snapshots() from public,anon,authenticated; grant execute on function dabbir_private.recovery_capture_all_business_snapshots() to service_role;

create or replace function dabbir_private.recovery_health_check() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,extensions,pg_temp as $function$
declare v_missing_triggers integer; v_bad_hashes integer; v_stale_snapshots integer; v_started timestamptz;
begin select journal_started_at into v_started from dabbir_private.recovery_state where singleton_key=true; select count(*) into v_missing_triggers from dabbir_private.recovery_supported_tables cfg where cfg.journal_enabled=true and not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(format('public.%I',cfg.table_name)) and t.tgname='dabbir_recovery_capture' and t.tgenabled<>'D'); select count(*) into v_bad_hashes from(select j.id from dabbir_private.recovery_change_journal j order by j.occurred_at desc limit 1000)s join dabbir_private.recovery_change_journal j on j.id=s.id where j.event_hash<>encode(extensions.digest(convert_to(concat_ws('|',j.id::text,j.table_name,j.operation,j.row_key::text,coalesce(j.before_data::text,''),coalesce(j.after_data::text,''),j.txid::text,j.occurred_at::text),'UTF8'),'sha256'),'hex'); select count(*) into v_stale_snapshots from public.dabbir_businesses b where not exists(select 1 from dabbir_private.recovery_snapshot_batches sb where sb.business_id=b.id and sb.status='complete' and sb.started_at>clock_timestamp()-interval '26 hours'); return jsonb_build_object('ok',(v_missing_triggers=0 and v_bad_hashes=0),'journal_started_at',v_started,'missing_or_disabled_triggers',v_missing_triggers,'bad_recent_event_hashes',v_bad_hashes,'businesses_without_snapshot_last_26h',v_stale_snapshots,'checked_at',clock_timestamp()); end;
$function$;
revoke all on function dabbir_private.recovery_health_check() from public,anon,authenticated; grant execute on function dabbir_private.recovery_health_check() to service_role;

revoke all on table dabbir_private.recovery_supported_tables,dabbir_private.recovery_state,dabbir_private.recovery_change_journal,dabbir_private.recovery_snapshot_batches,dabbir_private.recovery_snapshots,dabbir_private.recovery_cases,dabbir_private.recovery_restore_events from public,anon,authenticated;
grant select on dabbir_private.recovery_supported_tables,dabbir_private.recovery_state to service_role;
grant select,insert on dabbir_private.recovery_change_journal to service_role;
grant select,insert,update,delete on dabbir_private.recovery_snapshot_batches to service_role;
grant select,insert,delete on dabbir_private.recovery_snapshots to service_role;
grant select,insert,update on dabbir_private.recovery_cases to service_role;
grant select,insert on dabbir_private.recovery_restore_events to service_role;

do $do$ declare v_job bigint; begin for v_job in select jobid from cron.job where jobname in('dabbir-recovery-daily-snapshots','dabbir-recovery-snapshot-retention') loop perform cron.unschedule(v_job); end loop; perform cron.schedule('dabbir-recovery-daily-snapshots','25 2 * * *','select dabbir_private.recovery_capture_all_business_snapshots();'); perform cron.schedule('dabbir-recovery-snapshot-retention','10 3 * * *',$cmd$delete from dabbir_private.recovery_snapshot_batches where started_at < now() - interval '35 days'$cmd$); end $do$;
