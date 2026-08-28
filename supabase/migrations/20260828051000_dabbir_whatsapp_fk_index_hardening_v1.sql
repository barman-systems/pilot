-- DABBIR WhatsApp FK index hardening.
-- These service-only tables are expected to grow with inbound/status traffic.
-- Cover every currently unindexed FK used by tenant-scoped joins/deletes so
-- referential checks and cleanup do not degrade into sequential scans.

create index if not exists dabbir_whatsapp_event_business_conversation_idx
  on public.dabbir_whatsapp_event_ledger(business_id, conversation_id);

create index if not exists dabbir_whatsapp_event_business_message_idx
  on public.dabbir_whatsapp_event_ledger(business_id, message_id);

create index if not exists dabbir_whatsapp_event_connection_idx
  on public.dabbir_whatsapp_event_ledger(connection_id);

create index if not exists dabbir_whatsapp_outbound_business_message_idx
  on public.dabbir_whatsapp_outbound_reservations(business_id, message_id);

create index if not exists dabbir_whatsapp_outbound_connection_idx
  on public.dabbir_whatsapp_outbound_reservations(connection_id);

create index if not exists dabbir_whatsapp_outbound_sender_user_idx
  on public.dabbir_whatsapp_outbound_reservations(sender_user_id);
