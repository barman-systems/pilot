-- Production follow-up for barman_ceo_automation_v1, whose function bodies were applied before CI caught the explicit grant requirement.
revoke all on function public.barman_executive_read_snapshot_v1() from public, anon, authenticated;
grant execute on function public.barman_executive_read_snapshot_v1() to service_role;
revoke all on function public.barman_github_dispatch_tick_v1() from public, anon, authenticated;
grant execute on function public.barman_github_dispatch_tick_v1() to service_role;
