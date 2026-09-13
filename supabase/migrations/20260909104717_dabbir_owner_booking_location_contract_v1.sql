-- Match the production NOT NULL location contract. Non-location delivery modes
-- retain the canonical business location; activity_intelligence records REMOTE
-- or AT_BUSINESS independently. GPS-required modes keep verified customer GPS.
do $migration$
declare definition text; anchor text:=$old$case when 'location'=any(required) then 'customer' else null end$old$;
begin
 select pg_get_functiondef('public.dabbir_owner_activity_booking_v1(uuid,jsonb,boolean,text,text)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'OWNER_BOOKING_LOCATION_CONTRACT_DRIFT'; end if;
 execute replace(definition,anchor,$new$case when 'location'=any(required) then 'customer' else 'business' end$new$);
end $migration$;
