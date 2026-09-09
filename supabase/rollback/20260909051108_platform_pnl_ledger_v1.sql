-- Recovery-only rollback for DABBIR platform P&L ledger v1.
drop function if exists public.dabbir_platform_pnl_month_v1(date);
drop function if exists public.dabbir_platform_finance_record_event_v1(text,text,text,text,uuid,numeric,text,numeric,text,timestamptz,jsonb);
drop table if exists dabbir_private.platform_finance_sources;
drop table if exists dabbir_private.platform_finance_events;
