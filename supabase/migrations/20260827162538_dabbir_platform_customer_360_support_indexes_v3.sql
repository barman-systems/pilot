-- Cover Customer 360 support foreign keys reported by Supabase Performance Advisor.
create index if not exists platform_customer_support_cases_assigned_to_idx
  on dabbir_private.platform_customer_support_cases(assigned_to);
create index if not exists platform_customer_support_cases_business_idx
  on dabbir_private.platform_customer_support_cases(business_id);
create index if not exists platform_customer_support_cases_created_by_idx
  on dabbir_private.platform_customer_support_cases(created_by);
create index if not exists platform_customer_support_notes_actor_idx
  on dabbir_private.platform_customer_support_notes(actor_user_id);
