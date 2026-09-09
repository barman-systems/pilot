-- A signed Meta status can advance SENT to DELIVERED/READ before cognition
-- records presentation. Later verified delivery is stronger receipt evidence.
-- Keep scope, batch, lock, version, provider ID and idempotency checks intact.
do $migration$
declare definition text; anchor text := $old$and r.state='SENT' and r.idempotency_key$old$;
begin
 select pg_get_functiondef('public.dabbir_cognitive_record_delivery_v1(uuid,uuid,bigint,text,text)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'COGNITIVE_DELIVERY_GATE_DRIFT'; end if;
 execute replace(definition,anchor,$new$and (r.state='SENT' or (r.state in ('DELIVERED','READ') and r.provider_verified=true)) and r.idempotency_key$new$);
end $migration$;
