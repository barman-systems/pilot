-- Execute on a disposable database or as ONE transaction, always ending with ROLLBACK.
-- Only UUID fixtures with example.invalid emails are written. No real accounts are changed.
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
create temp table owner_security_results(test text primary key, passed boolean not null) on commit drop;
create function pg_temp.check_owner_test(p_name text,p_ok boolean) returns void language plpgsql as $$
begin
  insert into owner_security_results values(p_name,coalesce(p_ok,false));
  if p_ok is distinct from true then raise exception 'OWNER_SECURITY_TEST_FAILED:%',p_name; end if;
end; $$;
create function pg_temp.owner_test_user() returns uuid language plpgsql as $$
declare v_id uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(v_id,'owner-rollback-'||v_id::text||'@example.invalid');
  return v_id;
end; $$;
create function pg_temp.owner_test_invite(p_actor uuid,p_target uuid,p_mfa boolean default false) returns jsonb language sql as $$
 select public.dabbir_platform_staff_invite_create_v2(p_actor,p_target,'owner-rollback-'||p_target::text||'@example.invalid',
  'Isolated rollback fixture','{}','custom',gen_random_uuid()::text,now()+interval '1 day','CUSTOM',
  array['customers.view'],'{"type":"OWN_TASKS_ONLY"}',null,p_mfa,null)
$$;
create function pg_temp.owner_test_challenge(p_actor uuid,p_invite uuid default null,p_generation integer default null)
returns uuid language plpgsql as $$
declare v_id uuid:=gen_random_uuid();
begin
 insert into public.dabbir_owner_otp_challenges(id,actor_user_id,otp_hash,token_hash,expires_at,invitation_id,invitation_generation)
 values(v_id,p_actor,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '10 minutes',p_invite,p_generation);
 return v_id;
end; $$;
do $$
declare a uuid:=pg_temp.owner_test_user(); t uuid; c uuid; invite jsonb; result jsonb; denied boolean;
        inv_id uuid; old_hash text; session_hash text:=gen_random_uuid()::text; ix integer;
begin
 insert into public.dabbir_platform_admins(user_id,role,role_code,permissions,granular_permissions,access_scope)
 values(a,'OWNER_DELEGATE','CUSTOM',array['manage_employees','manage_customers'],
  array['team.invite','team.edit','customers.view'],'{"type":"OWN_TASKS_ONLY"}');

 t:=pg_temp.owner_test_user(); invite:=pg_temp.owner_test_invite(a,t); inv_id:=(invite->>'id')::uuid;
 perform pg_temp.check_owner_test('create returns generation without token',(invite->>'generation')::int=1 and not (invite ? 'token_hash'));
 denied:=false;
 begin perform pg_temp.owner_test_invite(a,t); exception when others then denied:=sqlerrm='DABBIR_INVITATION_ALREADY_PENDING'; end;
 perform pg_temp.check_owner_test('duplicate pending invitation denied',denied);
 old_hash:=(select token_hash from dabbir_private.platform_staff_invitations where id=inv_id);
 c:=pg_temp.owner_test_challenge(t,inv_id,1);
 result:=public.dabbir_platform_staff_invite_resend_v2(a,inv_id,gen_random_uuid()::text,now()+interval '1 day');
 perform pg_temp.check_owner_test('resend rotates token and generation',(result->>'generation')::int=2 and
  (select token_hash<>old_hash and resend_count=1 from dabbir_private.platform_staff_invitations where id=inv_id));
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('stale invitation challenge denied',result->>'reason'='INVITATION_GENERATION_STALE');
 perform pg_temp.check_owner_test('stale challenge creates no staff or session',
  not exists(select 1 from public.dabbir_platform_admins where user_id=t) and
  not exists(select 1 from dabbir_private.owner_sessions where actor_user_id=t));
 denied:=false;
 begin perform public.dabbir_platform_staff_invite_delivery_v3(a,inv_id,'SENT','test-transport','test-message',null,1);
 exception when others then denied:=sqlerrm='DABBIR_INVITATION_GENERATION_STALE'; end;
 perform pg_temp.check_owner_test('stale delivery cannot overwrite current generation',denied);
 perform public.dabbir_platform_staff_invite_delivery_v3(a,inv_id,'SENT','test-transport','test-message',null,2);
 perform pg_temp.check_owner_test('delivery audit records exact generation',exists(
  select 1 from dabbir_private.platform_staff_audit where metadata->>'invitation_id'=inv_id::text
  and action='INVITE_DELIVERED' and metadata->>'generation'='2'));
 denied:=false;
 begin perform public.dabbir_platform_staff_invite_delivery_v3(a,inv_id,'FAILED','test-transport',null,'ERROR',2);
 exception when others then denied:=sqlerrm='DABBIR_INVITATION_DELIVERY_ALREADY_RECORDED'; end;
 perform pg_temp.check_owner_test('duplicate delivery recording denied',denied);
 perform public.dabbir_platform_staff_invite_revoke_v2(a,inv_id,'isolated test');
 result:=public.dabbir_platform_staff_accept_for_user_v2(t,inv_id,2);
 perform pg_temp.check_owner_test('revoked invitation denied',result->>'reason'='INVITATION_NOT_PENDING');

 t:=pg_temp.owner_test_user(); invite:=pg_temp.owner_test_invite(a,t); inv_id:=(invite->>'id')::uuid;
 c:=pg_temp.owner_test_challenge(t,inv_id,1);
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',session_hash,now()+interval '1 hour');
 perform pg_temp.check_owner_test('OTP atomically accepts invitation and issues session',
  (result->>'authenticated')::boolean and exists(select 1 from dabbir_private.owner_sessions where actor_user_id=t and token_hash=session_hash)
  and exists(select 1 from dabbir_private.platform_staff_invitations where id=inv_id and status='ACCEPTED'));
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('OTP replay denied',result->>'error'='INVALID_OWNER_OTP');
 perform pg_temp.check_owner_test('OTP creates exactly one session',(select count(*)=1 from dabbir_private.owner_sessions where actor_user_id=t));
 perform pg_temp.check_owner_test('limited session authenticates',(public.dabbir_owner_session_verify_v1(session_hash)->>'authenticated')::boolean);
 perform public.dabbir_owner_session_revoke_v1(session_hash);
 perform pg_temp.check_owner_test('revoked session denied on next request',not (public.dabbir_owner_session_verify_v1(session_hash)->>'authenticated')::boolean);
 denied:=false;
 begin perform pg_temp.owner_test_invite(a,t); exception when others then denied:=sqlerrm='DABBIR_PLATFORM_EMPLOYEE_ALREADY_EXISTS'; end;
 perform pg_temp.check_owner_test('invitation cannot overwrite existing staff',denied);
 c:=pg_temp.owner_test_challenge(t);
 for ix in 1..5 loop
  result:=public.dabbir_owner_otp_complete_v1(c,'wrong',gen_random_uuid()::text,now()+interval '1 hour');
 end loop;
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('five failed attempts lock even correct OTP',result->>'error'='INVALID_OWNER_OTP' and
  (select attempts=5 from public.dabbir_owner_otp_challenges where id=c));
 c:=pg_temp.owner_test_challenge(t);
 update public.dabbir_owner_otp_challenges set expires_at=now()-interval '1 second' where id=c;
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('expired OTP denied',result->>'error'='INVALID_OWNER_OTP');
 update public.dabbir_platform_admins set suspended_at=now() where user_id=t;
 c:=pg_temp.owner_test_challenge(t);
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('suspended staff cannot get session',(result->>'authenticated')::boolean=false);

 t:=pg_temp.owner_test_user(); invite:=pg_temp.owner_test_invite(a,t); inv_id:=(invite->>'id')::uuid;
 update public.dabbir_platform_admins set granular_permissions=array['team.edit','customers.view'] where user_id=a;
 result:=public.dabbir_platform_staff_accept_for_user_v2(t,inv_id,1);
 perform pg_temp.check_owner_test('sponsor authority change blocks acceptance',result->>'reason'='INVITE_SPONSOR_AUTHORITY_CHANGED');
 update public.dabbir_platform_admins set granular_permissions=array['team.invite','team.edit','customers.view'],mfa_required=true where user_id=a;
 denied:=false;
 begin perform pg_temp.owner_test_invite(a,pg_temp.owner_test_user(),false);
 exception when others then denied:=sqlerrm='DABBIR_MFA_POLICY_GRANT_WEAKENS_ACTOR'; end;
 perform pg_temp.check_owner_test('invitation cannot weaken sponsor MFA',denied);
 result:=public.dabbir_platform_staff_accept_for_user_v2(t,inv_id,1);
 perform pg_temp.check_owner_test('new sponsor MFA policy blocks old invitation',result->>'reason'='INVITE_SPONSOR_AUTHORITY_CHANGED');
 t:=pg_temp.owner_test_user(); invite:=pg_temp.owner_test_invite(a,t,true); inv_id:=(invite->>'id')::uuid;
 c:=pg_temp.owner_test_challenge(t,inv_id,1);
 result:=public.dabbir_owner_otp_complete_v1(c,'isolated-otp-hash',gen_random_uuid()::text,now()+interval '1 hour');
 perform pg_temp.check_owner_test('OTP does not bypass required MFA',result->>'error'='MFA_REQUIRED_NOT_CONFIGURED');
 perform pg_temp.check_owner_test('failed MFA rolls back acceptance and session',
  not exists(select 1 from public.dabbir_platform_admins where user_id=t) and
  not exists(select 1 from dabbir_private.owner_sessions where actor_user_id=t) and
  exists(select 1 from dabbir_private.platform_staff_invitations where id=inv_id and status='PENDING'));
 result:=public.dabbir_platform_staff_accept_for_user_v1(t);
 perform pg_temp.check_owner_test('legacy acceptance requires generation',result->>'reason'='INVITATION_GENERATION_REQUIRED');
 perform pg_temp.check_owner_test('direct authenticated OTP RPC denied',not has_function_privilege('authenticated','public.dabbir_owner_otp_complete_v1(uuid,text,text,timestamptz)','EXECUTE'));
 perform pg_temp.check_owner_test('direct anon OTP RPC denied',not has_function_privilege('anon','public.dabbir_owner_otp_complete_v1(uuid,text,text,timestamptz)','EXECUTE'));
 perform pg_temp.check_owner_test('direct authenticated invitation acceptance denied',not has_function_privilege('authenticated','public.dabbir_platform_staff_accept_for_user_v2(uuid,uuid,integer)','EXECUTE'));
end;
$$;
select * from owner_security_results order by test;
rollback;
