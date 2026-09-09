alter extension pgaudit set schema extensions;
revoke execute on function extensions.pgaudit_ddl_command_end() from public, anon, authenticated;
revoke execute on function extensions.pgaudit_sql_drop() from public, anon, authenticated;
