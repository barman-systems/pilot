import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const broker=read('supabase/functions/dabbir-owner-broker/index.ts');
const auth=read('api/auth/owner-otp.js');
const gateway=read('api/owner-dashboard-gateway.js');
const teamApi=read('api/owner-team.js');
const teamUi=read('api/_owner-platform-team-ui.js');
const authority=read('supabase/migrations/20260903193000_dabbir_owner_delegate_fail_closed_v1.sql');
const staff=read('supabase/migrations/20260903193100_dabbir_platform_staff_rpc_source_sync_v1.sql');
const whatsappTruth=read('supabase/migrations/20260903193200_dabbir_whatsapp_connection_truth_guard_v1.sql');

test('OTP challenge is bound to one actor and verify never re-resolves first admin',()=>{
  assert.match(broker,/actor_user_id:identity\.user_id/);
  assert.match(broker,/select=id,actor_user_id,invitation_id,otp_hash/);
  assert.match(broker,/p_actor_user_id:row\.actor_user_id/);
  assert.doesNotMatch(broker,/function activeAdmin/);
  assert.match(authority,/dabbir_owner_otp_actor_bound_check/);
});

test('root and delegate sessions carry actual authority while compatibility role remains internal',()=>{
  assert.match(authority,/role in \('ROOT_OWNER','OWNER_DELEGATE'\)/);
  assert.match(authority,/'authority_role',v_admin\.role/);
  assert.match(gateway,/\['ROOT_OWNER','OWNER_DELEGATE'\]/);
});

test('root owner is fail-closed against removal, suspension and promotion',()=>{
  assert.match(authority,/DABBIR_ROOT_OWNER_PROTECTED/);
  assert.match(authority,/DABBIR_ROOT_OWNER_PROMOTION_FORBIDDEN/);
  assert.match(authority,/dabbir_platform_single_root_owner_uq/);
  assert.match(staff,/if v_before\.role='ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_PROTECTED'/);
});

test('delegate cannot grant permissions above its own set or mutate itself',()=>{
  assert.match(authority,/DABBIR_PERMISSION_GRANT_EXCEEDS_ACTOR/);
  assert.match(staff,/DABBIR_SELF_PRIVILEGE_CHANGE_FORBIDDEN/);
  assert.match(staff,/platform_assert_can_grant/);
});

test('suspension and removal revoke existing sessions',()=>{
  const revocations=(staff.match(/owner_sessions set revoked_at=now\(\)/g)||[]).length;
  assert.ok(revocations>=3);
});

test('CEO and incident writes are permission checked in broker and database wrapper',()=>{
  assert.match(broker,/requirePermission\(session,'manage_ceo_commands'\)/);
  assert.match(broker,/requirePermission\(session,'manage_incidents'\)/);
  assert.match(authority,/platform_assert_permission\(p_actor,'manage_ceo_commands'\)/);
  assert.match(authority,/platform_assert_permission\(p_actor,'manage_incidents'\)/);
});

test('owner decisions and recovery remain root-only',()=>{
  assert.match(broker,/requireRoot\(session\)/);
  assert.match(authority,/dabbir_owner_decisions_recent_v1/);
  assert.match(authority,/dabbir_platform_recovery_apply/);
  assert.match(authority,/platform_assert_root/);
});

test('owner login supports independent delegate email without hard-coded owner email',()=>{
  assert.match(auth,/ROOT_USERNAME = 'barmanadmin'/);
  assert.match(auth,/EMAIL_RE/);
  assert.match(auth,/requireSameOrigin\(req\)/);
  assert.doesNotMatch(auth,/barman2013@icloud\.com/);
  assert.doesNotMatch(auth,/DABBIR_OWNER_LOGIN_EMAIL/);
});

test('team workspace uses a real brokered API and permission presets',()=>{
  assert.match(teamApi,/data_action:'team'/);
  assert.match(teamApi,/requireSameOrigin\(req\)/);
  for(const preset of ['full','operations','support','technical','finance','custom'])assert.match(teamUi,new RegExp(preset+':'));
  for(const op of ['invite','set_permissions','suspend','reactivate','revoke_sessions','remove'])assert.match(teamUi,new RegExp(op));
});

test('WhatsApp cannot become connected without provider verification evidence',()=>{
  assert.match(whatsappTruth,/alter column status set default 'verification_required'/);
  assert.match(whatsappTruth,/status <> 'connected' or last_verified_at is not null/);
});

test('service role stays server-side and functions are revoked from browser roles',()=>{
  assert.doesNotMatch(teamUi,/SERVICE_ROLE|service_role/i);
  assert.doesNotMatch(auth,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(authority,/revoke all on function public\.dabbir_owner_session_verify_v1\(text\) from public,anon,authenticated/);
  assert.match(staff,/revoke all on function public\.dabbir_platform_staff_update_v1/);
});
