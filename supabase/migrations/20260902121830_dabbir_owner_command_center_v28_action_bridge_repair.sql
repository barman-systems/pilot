create or replace function public.dabbir_platform_owner_audit_v1(p_business_id uuid,p_limit integer default 100)
returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
from (select id,business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state,created_at from public.dabbir_platform_owner_audit where business_id=p_business_id order by created_at desc limit greatest(1,least(coalesce(p_limit,100),200))) x;
$$;
revoke all on function public.dabbir_platform_owner_audit_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_audit_v1(uuid,integer) to service_role;
