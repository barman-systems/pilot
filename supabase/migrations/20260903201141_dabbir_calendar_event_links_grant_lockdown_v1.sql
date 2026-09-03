-- Event links are internal provider-to-appointment mappings maintained only by service-role sync code.
-- RLS already denies browser roles; remove their table privileges too so future policy changes cannot expose this state accidentally.
revoke all privileges on table public.dabbir_calendar_event_links from anon;
revoke all privileges on table public.dabbir_calendar_event_links from authenticated;
grant select, insert, update, delete on table public.dabbir_calendar_event_links to service_role;
