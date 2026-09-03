-- DABBIR WhatsApp actions GCC profile authority guard.
-- A customer WhatsApp message may enter the AI action queue only when the tenant's
-- country, currency and timezone are a verified GCC tuple. This prevents downstream
-- action code from silently falling back to UAE semantics for malformed tenants.

create or replace function public.dabbir_ai_enqueue_whatsapp_event(
  p_phone_number_id text,
  p_conversation_id uuid,
  p_message_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_business_id uuid;
  v_profile_verified boolean := false;
begin
  select c.business_id into v_business_id
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(coalesce(p_phone_number_id,''))
    and c.status='connected'
  limit 1;

  if v_business_id is null then
    raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND';
  end if;

  select case b.country_code
    when 'AE' then b.currency_code='AED' and b.timezone='Asia/Dubai'
    when 'SA' then b.currency_code='SAR' and b.timezone='Asia/Riyadh'
    when 'KW' then b.currency_code='KWD' and b.timezone='Asia/Kuwait'
    when 'QA' then b.currency_code='QAR' and b.timezone='Asia/Qatar'
    when 'BH' then b.currency_code='BHD' and b.timezone='Asia/Bahrain'
    when 'OM' then b.currency_code='OMR' and b.timezone='Asia/Muscat'
    else false
  end into v_profile_verified
  from public.dabbir_businesses b
  where b.id=v_business_id;

  if coalesce(v_profile_verified,false) is not true then
    raise exception 'BUSINESS_GCC_PROFILE_UNVERIFIED';
  end if;

  return public.dabbir_ai_enqueue_action_job(
    v_business_id,
    p_conversation_id,
    p_message_id
  );
end;
$$;

revoke all on function public.dabbir_ai_enqueue_whatsapp_event(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.dabbir_ai_enqueue_whatsapp_event(text,uuid,uuid)
  to service_role;
