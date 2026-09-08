create or replace function public.dabbir_whatsapp_ai_connection(p_business_id uuid,p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_connection public.dabbir_whatsapp_connections%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections
  where id=p_connection_id and business_id=p_business_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',v_connection.id,'business_id',v_connection.business_id,'branch_id',v_connection.branch_id,
    'status',v_connection.status,'phone_number_id',v_connection.phone_number_id,'waba_id',v_connection.waba_id,
    'access_token_ciphertext',v_connection.access_token_ciphertext,'access_token_iv',v_connection.access_token_iv,
    'access_token_tag',v_connection.access_token_tag,'token_key_version',v_connection.token_key_version,
    'token_context_id',v_connection.token_context_id,'token_expires_at',v_connection.token_expires_at
  );
end;
$function$;
revoke all on function public.dabbir_whatsapp_ai_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_connection(uuid,uuid) to service_role;
