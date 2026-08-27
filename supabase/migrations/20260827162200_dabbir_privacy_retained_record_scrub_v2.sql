-- DABBIR BAR-16 retained-record privacy scrub v2
-- Operational audit/procedure rows may need to survive customer deletion, but their
-- payload must not retain customer content after the customer identity is erased.

create or replace function dabbir_private.dabbir_scrub_retained_customer_records()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_conversation_ids uuid[] := '{}'::uuid[];
begin
  select coalesce(array_agg(c.id),'{}'::uuid[])
    into v_conversation_ids
  from public.dabbir_conversations c
  where c.business_id=old.business_id and c.customer_id=old.id;

  update public.dabbir_procedure_runs
     set customer_id=null,
         conversation_id=null,
         input=jsonb_build_object('privacy_redacted',true),
         output=jsonb_build_object('privacy_redacted',true),
         external_reference=null,
         last_error_detail=null
   where business_id=old.business_id
     and (customer_id=old.id or conversation_id=any(v_conversation_ids));

  update public.dabbir_quality_events
     set conversation_id=null,
         context=jsonb_build_object('privacy_redacted',true)
   where business_id=old.business_id
     and conversation_id=any(v_conversation_ids);

  return old;
end;
$$;

revoke all on function dabbir_private.dabbir_scrub_retained_customer_records() from public,anon,authenticated;

drop trigger if exists dabbir_privacy_scrub_retained_customer_records on public.dabbir_customers;
create trigger dabbir_privacy_scrub_retained_customer_records
before delete on public.dabbir_customers
for each row execute function dabbir_private.dabbir_scrub_retained_customer_records();

comment on function dabbir_private.dabbir_scrub_retained_customer_records() is
'BAR-16 retained operational records are dissociated and payload-redacted before customer deletion; financial records are handled separately and are not deleted.';
