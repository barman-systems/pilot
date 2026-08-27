-- DABBIR BAR-16 recovery hardening v2
-- Treat dabbir_customers.id as the customer scope key. Without this, customer-scoped
-- recovery can restore child rows but misses the root customer row itself.

create or replace function dabbir_private.recovery_refresh_registry()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,dabbir_private,pg_temp
as $function$
declare
  r record;
  v_rel regclass;
  v_pk text[];
  v_business text[];
  v_users text[];
  v_customers text[];
  v_journal boolean;
  v_rank integer;
  v_count integer := 0;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relname like 'dabbir\_%' escape '\'
  loop
    v_rel := to_regclass(format('public.%I', r.table_name));

    select array_agg(a.attname order by ord.n)
      into v_pk
    from pg_index i
    join lateral unnest(i.indkey) with ordinality ord(attnum,n) on true
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=ord.attnum
    where i.indrelid=v_rel and i.indisprimary;

    if v_pk is null or cardinality(v_pk)=0 then continue; end if;

    if r.table_name='dabbir_businesses' then
      v_business := array['id'];
    elsif r.table_name='dabbir_offers' then
      v_business := array['creator_business_id','advertiser_business_id'];
    elsif r.table_name='dabbir_payments' then
      v_business := array['recipient_business_id','payer_business_id'];
    elsif exists (
      select 1 from pg_attribute
      where attrelid=v_rel and attname='business_id' and attnum>0 and not attisdropped
    ) then
      v_business := array['business_id'];
    else
      continue;
    end if;

    select coalesce(array_agg(x.col order by x.ord), '{}'::text[])
      into v_users
    from (
      select u.col, u.ord
      from unnest(array['user_id','owner_id','payer_user_id','created_by_user_id','sender_user_id','actor_user_id','assigned_user_id']) with ordinality u(col,ord)
      where exists (
        select 1 from pg_attribute a
        where a.attrelid=v_rel and a.attname=u.col and a.attnum>0 and not a.attisdropped
      )
    ) x;

    if r.table_name='dabbir_customers' then
      v_customers := array['id'];
    else
      select coalesce(array_agg(x.col order by x.ord), '{}'::text[])
        into v_customers
      from (
        select u.col, u.ord
        from unnest(array['customer_id','payer_customer_id']) with ordinality u(col,ord)
        where exists (
          select 1 from pg_attribute a
          where a.attrelid=v_rel and a.attname=u.col and a.attnum>0 and not a.attisdropped
        )
      ) x;
    end if;

    v_journal := not (
      r.table_name ~ '(audit|event|evidence|log|demo|quality)'
      or r.table_name in ('dabbir_event_inbox','dabbir_message_batch_items')
    );

    v_rank := case
      when r.table_name='dabbir_businesses' then 10
      when r.table_name in ('dabbir_memberships','dabbir_creator_profiles') then 20
      when r.table_name in ('dabbir_customers','dabbir_payment_accounts') then 30
      when r.table_name in ('dabbir_conversations','dabbir_orders','dabbir_appointments','dabbir_tasks','dabbir_whatsapp_connections') then 40
      when r.table_name='dabbir_offers' then 50
      when r.table_name='dabbir_payments' then 60
      when r.table_name='dabbir_messages' then 70
      else 45
    end;

    insert into dabbir_private.recovery_supported_tables(
      table_name,pk_columns,business_columns,user_columns,customer_columns,
      journal_enabled,snapshot_enabled,restore_rank,updated_at
    )
    values(r.table_name,v_pk,v_business,v_users,v_customers,v_journal,true,v_rank,now())
    on conflict (table_name) do update set
      pk_columns=excluded.pk_columns,
      business_columns=excluded.business_columns,
      user_columns=excluded.user_columns,
      customer_columns=excluded.customer_columns,
      journal_enabled=excluded.journal_enabled,
      snapshot_enabled=excluded.snapshot_enabled,
      restore_rank=excluded.restore_rank,
      updated_at=now();

    if v_journal then
      execute format('drop trigger if exists dabbir_recovery_capture on public.%I', r.table_name);
      execute format(
        'create trigger dabbir_recovery_capture after insert or update or delete on public.%I for each row execute function dabbir_private.recovery_capture_change()',
        r.table_name
      );
    else
      execute format('drop trigger if exists dabbir_recovery_capture on public.%I', r.table_name);
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function dabbir_private.recovery_refresh_registry() from public,anon,authenticated;
grant execute on function dabbir_private.recovery_refresh_registry() to service_role;

select dabbir_private.recovery_refresh_registry();

comment on function dabbir_private.recovery_refresh_registry() is
'BAR-16 recovery registry. dabbir_customers.id is a customer scope key so customer-scoped recovery includes the root customer row.';
