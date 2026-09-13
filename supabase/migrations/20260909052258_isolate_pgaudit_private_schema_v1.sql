create schema if not exists dabbir_pgaudit;
revoke all on schema dabbir_pgaudit from public, anon, authenticated;
alter extension pgaudit set schema dabbir_pgaudit;
revoke all on schema dabbir_pgaudit from public, anon, authenticated;
