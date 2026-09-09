-- Recovery-only rollback for platform customer finance reads.
drop function if exists public.dabbir_platform_customer_finance_v1(uuid,uuid);
drop function if exists public.dabbir_platform_customer_finance_overview_v1(uuid);
drop function if exists public.dabbir_platform_customer_business_access_v1(uuid,uuid,uuid);
