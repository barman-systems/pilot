-- Cash Guardian financial evidence is tenant-scoped and should survive deletion of a linked
-- customer/conversation while dropping only the optional personal/operational reference.
-- PostgreSQL 17 supports column-targeted ON DELETE SET NULL for composite foreign keys.

alter table public.dabbir_financial_evidence
  drop constraint if exists dabbir_financial_evidence_customer_fk,
  add constraint dabbir_financial_evidence_customer_fk
    foreign key (business_id,customer_id)
    references public.dabbir_customers(business_id,id)
    on delete set null (customer_id);

alter table public.dabbir_financial_evidence
  drop constraint if exists dabbir_financial_evidence_conversation_fk,
  add constraint dabbir_financial_evidence_conversation_fk
    foreign key (business_id,conversation_id)
    references public.dabbir_conversations(business_id,id)
    on delete set null (conversation_id);
