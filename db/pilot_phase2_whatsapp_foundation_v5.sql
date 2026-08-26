-- PILOT Phase 2 WhatsApp foundation.
-- Source-first schema only. This does NOT connect Meta, send messages, or enable patient data.
-- Runtime writes are reserved for a server-only identity; authenticated users retain existing read/operational policies only.

-- A provider account/phone number must resolve to at most one tenant.
create unique index if not exists pilot_channels_provider_account_unique
  on public.pilot_channels(channel_type, external_account_id)
  where external_account_id is not null;

-- Extend the existing event inbox instead of creating a duplicate webhook ledger.
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_event_type_check;
alter table public.pilot_event_inbox add constraint pilot_event_inbox_event_type_check check (
  event_type in (
    'ABANDONED_CHECKOUT','PAYMENT_FAILED','ORDER_DELAYED','ORDER_SHIPPED',
    'APPOINTMENT_UNCONFIRMED','APPOINTMENT_NO_SHOW','PRODUCT_BACK_IN_STOCK',
    'LEAD_INACTIVE','NEW_INQUIRY_WITHOUT_REPLY',
    'CHANNEL_MESSAGE_RECEIVED','CHANNEL_MESSAGE_STATUS'
  )
);

-- Replace the legacy ID-only customer FK with a tenant-safe relationship.
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_customer_id_fkey;
alter table public.pilot_event_inbox drop constraint if exists pilot_event_inbox_business_customer_fk;
alter table public.pilot_event_inbox add constraint pilot_event_inbox_business_customer_fk
  foreign key (business_id,customer_id)
  references public.pilot_customers(business_id,id)
  on delete set null;
create index if not exists pilot_event_inbox_business_customer_idx
  on public.pilot_event_inbox(business_id,customer_id)
  where customer_id is not null;

-- Store only a one-way hash of provider message IDs. This is sufficient for dedup/status correlation
-- without persisting the raw Meta message identifier.
alter table public.pilot_messages add column if not exists external_source text;
alter table public.pilot_messages add column if not exists external_message_id_hash text;
alter table public.pilot_messages add column if not exists delivery_state text not null default 'UNKNOWN';
alter table public.pilot_messages add column if not exists external_status_updated_at timestamptz;

alter table public.pilot_messages drop constraint if exists pilot_messages_external_source_check;
alter table public.pilot_messages add constraint pilot_messages_external_source_check check (
  external_source is null or external_source in ('whatsapp','instagram','web')
);
alter table public.pilot_messages drop constraint if exists pilot_messages_external_message_hash_check;
alter table public.pilot_messages add constraint pilot_messages_external_message_hash_check check (
  external_message_id_hash is null or external_message_id_hash ~ '^[0-9a-f]{64}$'
);
alter table public.pilot_messages drop constraint if exists pilot_messages_external_pair_check;
alter table public.pilot_messages add constraint pilot_messages_external_pair_check check (
  (external_source is null and external_message_id_hash is null)
  or (external_source is not null and external_message_id_hash is not null)
);
alter table public.pilot_messages drop constraint if exists pilot_messages_delivery_state_check;
alter table public.pilot_messages add constraint pilot_messages_delivery_state_check check (
  delivery_state in ('UNKNOWN','RECEIVED','ACCEPTED','SENT','DELIVERED','READ','FAILED')
);
create unique index if not exists pilot_messages_external_message_unique
  on public.pilot_messages(business_id,external_source,external_message_id_hash)
  where external_message_id_hash is not null;
create index if not exists pilot_messages_external_status_idx
  on public.pilot_messages(business_id,external_source,external_message_id_hash,delivery_state)
  where external_message_id_hash is not null;

-- The event inbox remains server-write only. Explicitly retain least privilege.
revoke insert,update,delete,truncate,references,trigger on public.pilot_event_inbox from anon,authenticated;
revoke update,delete,truncate,references,trigger on public.pilot_messages from anon,authenticated;

-- Small index closure from the preceding privacy tranche.
create index if not exists pilot_privacy_audit_request_idx
  on public.pilot_privacy_audit(privacy_request_id)
  where privacy_request_id is not null;

comment on index public.pilot_channels_provider_account_unique is
  'A provider account such as a WhatsApp phone_number_id must never route to more than one PILOT business.';
comment on column public.pilot_messages.external_message_id_hash is
  'One-way SHA-256 hash of the external provider message ID; raw provider IDs are not required for status correlation.';
comment on column public.pilot_messages.delivery_state is
  'Provider delivery truth. ACCEPTED/SENT are not DELIVERED; only provider status callbacks may advance delivery state.';
