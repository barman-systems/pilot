insert into dabbir_private.owner_recovery_checks(kind,status,details)
select 'recovery_health','verified',dabbir_private.recovery_health_check()
where not exists(
  select 1 from dabbir_private.owner_recovery_checks
  where kind='recovery_health' and checked_at>=now()-interval '1 hour'
);
