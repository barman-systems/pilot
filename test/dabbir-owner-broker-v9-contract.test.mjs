import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const broker=read('supabase/functions/dabbir-owner-broker/index.ts');
const tracking=read('api/public-order-status.js');
const trackingSql=read('supabase/migrations/20260903193400_dabbir_public_order_status_server_only_v1.sql');

test('broker v9 preserves the modern owner command-center surfaces',()=>{
  for(const action of ['customer360','support','support_action','feedback','feedback_update','feedback_convert','audit','operations','operation_entities','operation_execute']){
    assert.match(broker,new RegExp(`action==='${action}'`));
  }
  assert.match(broker,/dabbir_platform_command_center_overview_v1/);
  assert.match(broker,/dabbir_platform_customer_360_scoped_v2/);
  assert.doesNotMatch(broker,/rpc\('dabbir_platform_customer_360_v1'/);
  assert.match(broker,/dabbir_platform_support_action_v2/);
  assert.match(broker,/dabbir_platform_feedback_convert_v1/);
  assert.match(broker,/dabbir_platform_operational_action_v2/);
});

test('OTP request and verification stay bound to the same actor',()=>{
  assert.match(broker,/actor_user_id:identity\.user_id/);
  assert.match(broker,/select=id,actor_user_id,invitation_id,otp_hash/);
  assert.match(broker,/p_actor_user_id:row\.actor_user_id/);
  assert.doesNotMatch(broker,/activeAdmin\(/);
});

test('incident and CEO mutations never call unguarded legacy RPCs',()=>{
  assert.match(broker,/dabbir_platform_incident_create_authorized_v1/);
  assert.match(broker,/dabbir_platform_incident_update_authorized_v1/);
  assert.match(broker,/dabbir_ceo_commands_list_authorized_v1/);
  assert.match(broker,/dabbir_ceo_command_create_authorized_v1/);
  assert.match(broker,/dabbir_ceo_command_update_authorized_v1/);
  assert.doesNotMatch(broker,/rpc\('dabbir_platform_owner_incident_create_v1'/);
  assert.doesNotMatch(broker,/rpc\('dabbir_ceo_command_create_v2'/);
});

test('full executive view and owner decisions remain root-only',()=>{
  assert.match(broker,/if\(action==='executive'\).*requireRoot\(session\)/s);
  assert.match(broker,/if\(action==='decisions'\).*requireRoot\(session\)/s);
  assert.match(broker,/if\(action==='decision_resolve'\).*requireRoot\(session\)/s);
});

test('public order tracking uses the server secret only on the server and WHATWG parsing',()=>{
  assert.match(tracking,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(tracking,/dabbir_public_order_status/);
  assert.match(tracking,/UUID_RE/);
  assert.match(tracking,/singleQueryValue\(req,'token'\)/);
  assert.doesNotMatch(tracking,/req\.query/);
  assert.match(tracking,/cache-control','no-store/);
});

test('raw public order status SECURITY DEFINER RPC is not executable by browser roles',()=>{
  assert.match(trackingSql,/revoke all on function public\.dabbir_public_order_status\(uuid\) from public,anon,authenticated/);
  assert.match(trackingSql,/grant execute on function public\.dabbir_public_order_status\(uuid\) to service_role/);
});