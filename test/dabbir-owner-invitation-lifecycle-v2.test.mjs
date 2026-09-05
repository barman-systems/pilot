import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260906001200_dabbir_owner_invitation_lifecycle_v2.sql',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');
const teamApi=fs.readFileSync(new URL('../api/owner-team.js',import.meta.url),'utf8');

test('invitation v2 stores rotation and terminal-state metadata without plaintext token output',()=>{
  for(const token of ['generation','resend_count','last_resent_at','revoked_by','revocation_reason','accepted_by_user_id','delivery_provider','delivery_attempted_at','provider_message_id','delivery_error_code','invitation_generation']) assert.match(migration,new RegExp(token));
  assert.match(migration,/token_hash=p_new_token_hash/);
  assert.match(migration,/generation=generation\+1/);
  assert.match(migration,/DABBIR_INVITE_ROTATION_REQUIRED/);
  assert.doesNotMatch(migration,/jsonb_build_object\([^;]*'token_hash'/s);
});

test('delegated invitation grants are contained by permissions scope expiry and approval limit',()=>{
  for(const token of ['platform_assert_can_grant_granular','platform_assert_can_grant','platform_assert_scope_grant_v2','DABBIR_SCOPE_GRANT_EXCEEDS_ACTOR','DABBIR_ACCESS_EXPIRY_EXCEEDS_ACTOR','DABBIR_APPROVAL_LIMIT_EXCEEDS_ACTOR','DABBIR_GRANULAR_PERMISSIONS_REQUIRED','DABBIR_ROLE_PERMISSION_MISMATCH','DABBIR_ROOT_OWNER_PROTECTED']) assert.match(migration,new RegExp(token));
  assert.match(migration,/DABBIR_INVITATION_ALREADY_PENDING/);
  assert.doesNotMatch(migration,/set status='REVOKED'.*supersed/i);
});

test('acceptance locks exact invitation generation and revalidates sponsor authority',()=>{
  assert.match(migration,/dabbir_platform_staff_accept_for_user_v2\(p_user_id uuid,p_invitation_id uuid,p_generation integer\)/);
  assert.match(migration,/where id=p_invitation_id\s+for update/i);
  assert.match(migration,/p_generation<>v_inv\.generation/);
  assert.match(migration,/INVITATION_GENERATION_STALE/);
  assert.match(migration,/DABBIR_INVITE_SPONSOR_AUTHORITY_CHANGED/);
  assert.match(migration,/lower\(u\.email\)=lower\(v_inv\.email\)/);
  assert.match(migration,/status='ACCEPTED'/);
  assert.match(migration,/INVITE_ACCEPTED/);
  assert.match(migration,/INVITE_ACCEPT_FAILED/);
});

test('security RPC execution remains server-only',()=>{
  for(const fn of ['dabbir_platform_staff_invite_resend_v2','dabbir_platform_staff_invite_revoke_v2','dabbir_platform_staff_invite_delivery_v2','dabbir_platform_staff_accept_for_user_v2']){
    assert.match(migration,new RegExp(`revoke all on function public\\.${fn}\\(`));
    assert.match(migration,new RegExp(`grant execute on function public\\.${fn}\\(`));
  }
});

test('owner broker binds OTP to exact invitation id and generation',()=>{
  assert.match(broker,/invitation_generation:invitationId\?invitationGeneration:null/);
  assert.match(broker,/select=id,actor_user_id,invitation_id,invitation_generation,otp_hash/);
  assert.match(broker,/dabbir_platform_staff_accept_for_user_v2/);
  assert.match(broker,/p_invitation_id:row\.invitation_id/);
  assert.match(broker,/p_generation:generation/);
  assert.doesNotMatch(broker,/dabbir_platform_staff_accept_for_user_v1'\s*,\s*\{p_user_id:row\.actor_user_id/);
});

test('resend and revoke are explicit broker operations and unknown operations fail closed',()=>{
  assert.match(broker,/if\(op==='invite_resend'\)return teamInviteResend\(session,body\)/);
  assert.match(broker,/if\(op==='invite_revoke'\)return teamInviteRevoke\(session,body\)/);
  assert.match(broker,/dabbir_platform_staff_invite_resend_v2/);
  assert.match(broker,/dabbir_platform_staff_invite_revoke_v2/);
  assert.match(broker,/UNKNOWN_TEAM_OPERATION/);
  assert.match(broker,/\['set_governance','set_permissions','suspend','reactivate','revoke_sessions','remove'\]\.includes\(op\)/);
});

test('invite email delivery is persisted through v2 delivery contract',()=>{
  assert.match(broker,/sendEmailDetailed/);
  assert.match(broker,/dabbir_platform_staff_invite_delivery_v2/);
  assert.match(broker,/TEAM_INVITE_DELIVERY_RECORD_FAILED/);
  assert.match(broker,/TEAM_INVITE_DELIVERY_FAILED/);
  assert.match(teamApi,/operation==='invite'\|\|operation==='invite_resend'/);
  assert.match(teamApi,/RESEND_API_KEY/);
});
