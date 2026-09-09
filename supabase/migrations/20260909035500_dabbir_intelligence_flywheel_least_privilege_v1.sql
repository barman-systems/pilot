-- DABBIR Intelligence Flywheel V1 least-privilege follow-up.
-- The initial migration is already applied in Production and remains immutable.
-- Supabase default privileges may grant service_role broader table rights on newly-created tables;
-- explicitly replace them with the minimum runtime grants required by this feature.

revoke all on table public.dabbir_business_knowledge_embeddings from service_role;
revoke all on table public.dabbir_ai_eval_cases from service_role;
revoke all on table public.dabbir_capability_registry from service_role;
revoke all on table public.dabbir_ai_failure_clusters from service_role;
revoke all on table public.dabbir_ai_improvement_proposals from service_role;

revoke all on table public.dabbir_business_knowledge_embeddings from public, anon, authenticated;
revoke all on table public.dabbir_ai_eval_cases from public, anon, authenticated;
revoke all on table public.dabbir_capability_registry from public, anon, authenticated;
revoke all on table public.dabbir_ai_failure_clusters from public, anon, authenticated;
revoke all on table public.dabbir_ai_improvement_proposals from public, anon, authenticated;

grant select, insert, update, delete on table public.dabbir_business_knowledge_embeddings to service_role;
grant select, insert, update on table public.dabbir_ai_eval_cases to service_role;
grant select on table public.dabbir_capability_registry to service_role;
grant select, insert, update on table public.dabbir_ai_failure_clusters to service_role;
grant select, insert, update on table public.dabbir_ai_improvement_proposals to service_role;
