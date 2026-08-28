-- DABBIR redundant-index cleanup.
-- Each removed non-unique index is byte-for-byte key-equivalent to a retained
-- unique index on the same table/columns. None is primary, replica identity, or
-- owned by a constraint. The stronger unique index remains available to the planner.

-- Retained: dabbir_customer_management_business_id_customer_id_key (UNIQUE business_id, customer_id)
drop index if exists public.dabbir_customer_management_business_customer_idx;

-- Retained: dabbir_procedure_steps_run_id_step_index_key (UNIQUE run_id, step_index)
drop index if exists public.dabbir_procedure_steps_run_idx;

-- Retained: dabbir_whatsapp_connections_business_id_key (UNIQUE business_id)
drop index if exists public.dabbir_whatsapp_connections_business_idx;

-- Retained: dabbir_whatsapp_connections_phone_number_id_key (UNIQUE phone_number_id)
drop index if exists public.dabbir_whatsapp_connections_phone_idx;
