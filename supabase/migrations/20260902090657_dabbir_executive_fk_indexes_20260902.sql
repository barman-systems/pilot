create index if not exists executive_actions_run_id_idx
  on dabbir_private.executive_actions (run_id);

create index if not exists executive_actions_event_id_idx
  on dabbir_private.executive_actions (event_id);

create index if not exists executive_actions_goal_id_idx
  on dabbir_private.executive_actions (goal_id);

create index if not exists executive_escalations_action_id_idx
  on dabbir_private.executive_escalations (action_id);

create index if not exists executive_escalations_event_id_idx
  on dabbir_private.executive_escalations (event_id);

create index if not exists executive_hypotheses_domain_key_idx
  on dabbir_private.executive_hypotheses (domain_key);

create index if not exists executive_hypothesis_insights_insight_id_idx
  on dabbir_private.executive_hypothesis_insights (insight_id);

create index if not exists executive_insight_sources_source_id_idx
  on dabbir_private.executive_insight_sources (source_id);

create index if not exists executive_insights_cycle_id_idx
  on dabbir_private.executive_insights (cycle_id);

create index if not exists executive_principles_hypothesis_id_idx
  on dabbir_private.executive_principles (hypothesis_id);
