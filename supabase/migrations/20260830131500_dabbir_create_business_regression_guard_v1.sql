-- Repair dabbir_create_business after the multi-vertical rollout restored an
-- obsolete function body with an ambiguous ON CONFLICT target (SQLSTATE 42702).
-- Keep onboarding fail-closed: create only the business and active owner membership.

create or replace function public.dabbir_create_business(
  p_name text,
  p_business_type text,
  p_locale text default 'ar-AE'::text
)
returns table(business_id uuid, business_slug text)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_slug text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'BUSINESS_NAME_REQUIRED';
  end if;

  if p_business_type not in (
    'store',
    'laundry',
    'car_wash',
    'clinic',
    'creator',
    'salon',
    'real_estate',
    'services',
    'other'
  ) then
    raise exception 'UNSUPPORTED_BUSINESS_TYPE';
  end if;

  v_slug := 'dabbir-' || substr(replace(v_id::text, '-', ''), 1, 16);

  insert into public.dabbir_businesses(
    id,
    slug,
    name,
    business_type,
    owner_id,
    locale,
    demo_mode
  ) values (
    v_id,
    v_slug,
    left(trim(p_name), 120),
    p_business_type,
    v_user,
    coalesce(nullif(trim(p_locale), ''), 'ar-AE'),
    false
  );

  insert into public.dabbir_memberships(
    business_id,
    user_id,
    role,
    status,
    accepted_at
  ) values (
    v_id,
    v_user,
    'owner',
    'active',
    now()
  );

  return query select v_id, v_slug;
end;
$function$;

revoke all on function public.dabbir_create_business(text, text, text) from public, anon;
grant execute on function public.dabbir_create_business(text, text, text) to authenticated, service_role;

comment on function public.dabbir_create_business(text, text, text) is
  'Creates a DABBIR business and its active owner membership without preconfiguring external channels.';
