insert into public.dabbir_capability_registry (
  capability_key,
  action_class,
  risk_level,
  intents,
  activity_types,
  required_fields,
  tool_name,
  verification_mode,
  mutates,
  human_approval,
  enabled,
  shadow_only,
  contract
) values (
  'ai.semantic.qwen37_canary',
  'READ',
  'LOW',
  '{}'::text[],
  '{}'::text[],
  '{}'::text[],
  'QWEN37_SEMANTIC_INTERPRETER',
  'DATABASE_READBACK',
  false,
  false,
  false,
  true,
  jsonb_build_object(
    'authority','runtime_control',
    'scope','SEMANTIC_INTERPRETER_ONLY',
    'model','alibaba/qwen3.7-flash',
    'rollout_percent',0,
    'max_percent',1,
    'control_version',1
  )
)
on conflict (capability_key) do nothing;
