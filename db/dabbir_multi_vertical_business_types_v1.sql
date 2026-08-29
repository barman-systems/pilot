-- DABBIR multi-vertical business types: retail, laundry, and car wash.
-- Apply after dabbir_phase2_auth_rbac_tenant_hardening_v1.sql.

alter table public.dabbir_businesses drop constraint if exists dabbir_businesses_business_type_check;
alter table public.dabbir_businesses add constraint dabbir_businesses_business_type_check
  check (business_type in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other'));

create or replace function public.dabbir_create_business(p_name text,p_business_type text,p_locale text default 'ar-AE')
returns table(business_id uuid,business_slug text)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid:=gen_random_uuid(); v_slug text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
 if p_business_type not in ('store','laundry','car_wash','clinic','creator','salon','real_estate','services','other') then raise exception 'UNSUPPORTED_BUSINESS_TYPE'; end if;
 v_slug:='pilot-'||substr(replace(v_id::text,'-',''),1,16);
 insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,locale,demo_mode)
 values(v_id,v_slug,left(trim(p_name),120),p_business_type,v_user,coalesce(nullif(trim(p_locale),''),'ar-AE'),true);
 insert into public.dabbir_memberships(business_id,user_id,role) values(v_id,v_user,'owner');
 insert into public.dabbir_channels(business_id,channel_type,status,metadata) values
  (v_id,'whatsapp','configured','{"reason":"runtime_verification_required"}'::jsonb),
  (v_id,'instagram','configured','{"reason":"runtime_verification_required"}'::jsonb)
 on conflict(business_id,channel_type) do nothing;
 return query select v_id,v_slug;
end;
$$;
