import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const status=fs.readFileSync('api/dabbir-whatsapp-status.js','utf8');
const hardening=fs.readFileSync('supabase/migrations/20260828045200_dabbir_whatsapp_rpc_security_invoker_v1.sql','utf8');
const branchEvidence=fs.readFileSync('supabase/migrations/20260903160359_dabbir_whatsapp_branch_operational_evidence_v1.sql','utf8');

const serverOnlyFunctions=[
  'dabbir_whatsapp_persist_inbound',
  'dabbir_whatsapp_reserve_outbound',
  'dabbir_whatsapp_finalize_outbound',
  'dabbir_whatsapp_mark_outbound_result',
  'dabbir_whatsapp_apply_status',
  'dabbir_whatsapp_operational_evidence',
];

test('WhatsApp operational evidence is fetched server-side and scoped to the selected branch',()=>{
  assert.match(status,/import \{ serviceRpc, whatsappLiveServerCapability \} from '.\/_whatsapp-live-core\.js'/);
  assert.match(status,/serviceRpc\('dabbir_whatsapp_branch_operational_evidence', \{/);
  assert.match(status,/p_business_id: businessId/);
  assert.match(status,/p_branch_id: branchId/);
  assert.doesNotMatch(status,/supabaseRpc/);
  assert.match(status,/await ownerContext\(req, businessId\)/);
});

test('legacy live WhatsApp RPCs remain service-role only and SECURITY INVOKER',()=>{
  for(const fn of serverOnlyFunctions){
    assert.match(hardening,new RegExp(`(?:alter function public\\.${fn}\\([^;]+\\) security invoker|create or replace function public\\.${fn}\\([\\s\\S]*?security invoker)`,'i'),`${fn} must be SECURITY INVOKER`);
    assert.match(hardening,new RegExp(`revoke all on function public\\.${fn}\\([^;]+\\) from public,anon,authenticated`,'i'),`${fn} client execute must be revoked`);
    assert.match(hardening,new RegExp(`grant execute on function public\\.${fn}\\([^;]+\\) to service_role`,'i'),`${fn} must be service-role executable`);
  }
  assert.doesNotMatch(hardening,/grant execute on function public\.dabbir_whatsapp_operational_evidence\(uuid\) to authenticated/i);
});

test('branch operational evidence is SECURITY INVOKER and service-role only',()=>{
  assert.match(branchEvidence,/create or replace function public\.dabbir_whatsapp_branch_operational_evidence/);
  assert.match(branchEvidence,/security invoker/i);
  assert.match(branchEvidence,/revoke all on function public\.dabbir_whatsapp_branch_operational_evidence\(uuid,uuid\) from public,anon,authenticated/i);
  assert.match(branchEvidence,/grant execute on function public\.dabbir_whatsapp_branch_operational_evidence\(uuid,uuid\) to service_role/i);
  assert.doesNotMatch(branchEvidence,/security definer/i);
  assert.doesNotMatch(branchEvidence,/auth\.uid\(\)/i);
});

test('server-only operational evidence does not depend on auth.uid or client permission bypass',()=>{
  const start=hardening.indexOf('create or replace function public.dabbir_whatsapp_operational_evidence');
  const body=hardening.slice(start);
  assert.match(body,/security invoker/i);
  assert.doesNotMatch(body,/auth\.uid\(\)/i);
  assert.doesNotMatch(body,/security definer/i);
});
