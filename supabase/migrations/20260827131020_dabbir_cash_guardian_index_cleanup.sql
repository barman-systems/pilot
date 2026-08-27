-- Remove redundant composite unique indexes introduced by the v1 migration because
-- the canonical *_uq indexes already exist, then recreate the evidence foreign keys
-- against the canonical uniqueness and add covering indexes on the referencing side.

alter table public.dabbir_financial_evidence
  drop constraint if exists dabbir_financial_evidence_customer_fk,
  drop constraint if exists dabbir_financial_evidence_conversation_fk;

drop index if exists public.dabbir_customers_business_id_id_unique;
drop index if exists public.dabbir_conversations_business_id_id_unique;

alter table public.dabbir_financial_evidence
  add constraint dabbir_financial_evidence_customer_fk
    foreign key (business_id,customer_id)
    references public.dabbir_customers(business_id,id)
    on delete set null (customer_id),
  add constraint dabbir_financial_evidence_conversation_fk
    foreign key (business_id,conversation_id)
    references public.dabbir_conversations(business_id,id)
    on delete set null (conversation_id);

create index if not exists dabbir_financial_evidence_customer_fk_idx
  on public.dabbir_financial_evidence(business_id,customer_id)
  where customer_id is not null;

create index if not exists dabbir_financial_evidence_conversation_fk_idx
  on public.dabbir_financial_evidence(business_id,conversation_id)
  where conversation_id is not null;
