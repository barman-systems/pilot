import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,ROOT));
const text=path=>read(path).toString('utf8');
const gitBlobSha=path=>{
  const body=read(path);
  const header=Buffer.from(`blob ${body.length}\0`,'utf8');
  return crypto.createHash('sha1').update(header).update(body).digest('hex');
};

const productionHistory={
  'supabase/migrations/20260903155503_dabbir_whatsapp_branch_routing_v1.sql':'74b0921a9ce94750d105f0ec636b1cf83153b602',
  'supabase/migrations/20260903155620_dabbir_whatsapp_inbound_variable_conflict_fix_v1.sql':'ff8c85bb45d2ba4aa5d37925060c239a0942ed2c',
  'supabase/migrations/20260903155707_dabbir_whatsapp_branch_fk_index_v1.sql':'0bfd04ed1f3d052733770dc68366ca2484f5d202',
  'supabase/migrations/20260903155919_dabbir_whatsapp_outbound_branch_routing_v1.sql':'4700d7135c05493c6e2d2199786b6175395549b2',
  'supabase/migrations/20260903160359_dabbir_whatsapp_branch_operational_evidence_v1.sql':'9908a7e5cd38c468bccfa140771e24f4226077ec',
  'supabase/migrations/20260903160747_dabbir_whatsapp_branch_intent_v1.sql':'fa6f5b5f429ab3da0e81f5b76bea3675a6aa7a0e',
  'supabase/migrations/20260903161347_dabbir_whatsapp_branch_intent_user_index_v1.sql':'099bd3781206885c0a465e9741476c8453e60dd3',
};

test('Production WhatsApp branch migration history is immutable in source',()=>{
  for(const [path,sha] of Object.entries(productionHistory)) assert.equal(gitBlobSha(path),sha,path);
});

test('source reconciliation rebuilds the missing branch-scope contract without owner-authority rollback',()=>{
  const reconcile=text('supabase/migrations/20260903210000_dabbir_branch_scope_source_reconciliation_v1.sql');
  const parity=text('supabase/migrations/20260903210100_dabbir_branch_scope_production_parity_v1.sql');
  for(const token of [
    'dabbir_membership_branches','dabbir_branch_services','dabbir_branch_products',
    'dabbir_worker_branches','dabbir_branch_inventory','branch_access_allowed',
    'ensure_operational_branch','dabbir_appointments_branch_restrict','dabbir_orders_branch_restrict',
    'dabbir_conversations_branch_restrict','dabbir_inventory_movements_branch_restrict'
  ]) assert.match(reconcile,new RegExp(token));
  assert.match(parity,/primary_branch_for_business/);
  assert.match(parity,/where business_id=p_business_id and is_primary=true/);
  assert.doesNotMatch(reconcile,/dabbir-owner-broker|ROOT_OWNER|OWNER_DELEGATE|platform_owner|support_admin/i);
  assert.doesNotMatch(parity,/dabbir-owner-broker|ROOT_OWNER|OWNER_DELEGATE|platform_owner|support_admin/i);
});

test('WhatsApp branch routing remains fail-closed and branch-owned',()=>{
  const inbound=text('supabase/migrations/20260903155620_dabbir_whatsapp_inbound_variable_conflict_fix_v1.sql');
  const outbound=text('supabase/migrations/20260903155919_dabbir_whatsapp_outbound_branch_routing_v1.sql');
  const intent=text('supabase/migrations/20260903160747_dabbir_whatsapp_branch_intent_v1.sql');
  assert.match(inbound,/branch_id=v_connection\.branch_id/);
  assert.match(outbound,/branch_id=v_conversation\.branch_id/);
  assert.match(outbound,/WHATSAPP_BRANCH_CONNECTION_NOT_FOUND/);
  assert.match(intent,/force row level security/);
  assert.match(intent,/dabbir_private\.branch_access_allowed/);
});
