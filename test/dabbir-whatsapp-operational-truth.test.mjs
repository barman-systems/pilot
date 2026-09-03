import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const statusPath='api/dabbir-whatsapp-status.js';
const machinePath='api/_dabbir-whatsapp-state-machine.js';
const activationPath='api/customer-activation-ui.js';
const migrationPath='supabase/migrations/20260828044500_dabbir_whatsapp_live_message_path_v2.sql';
const raceMigrationPath='supabase/migrations/20260903155620_dabbir_whatsapp_inbound_variable_conflict_fix_v1.sql';
const hardeningPath='supabase/migrations/20260828045200_dabbir_whatsapp_rpc_security_invoker_v1.sql';
const branchEvidencePath='supabase/migrations/20260903160359_dabbir_whatsapp_branch_operational_evidence_v1.sql';
const status=fs.readFileSync(statusPath,'utf8');
const machine=fs.readFileSync(machinePath,'utf8');
const activation=fs.readFileSync(activationPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
const raceMigration=fs.readFileSync(raceMigrationPath,'utf8');
const hardening=fs.readFileSync(hardeningPath,'utf8');
const branchEvidence=fs.readFileSync(branchEvidencePath,'utf8');

test('WhatsApp operational evidence is tenant-and-branch scoped, non-demo, provider-backed, and server-only',()=>{
  assert.match(status,/serviceRpc/);
  assert.doesNotMatch(status,/supabaseRpc/);
  assert.match(status,/dabbir_whatsapp_branch_operational_evidence/);
  assert.match(status,/p_business_id: businessId/);
  assert.match(status,/p_branch_id: branchId/);
  assert.match(status,/loadOperationalEvidence\(businessId,row\.branch_id\)/);

  // Preserve the original service-only evidence authority while requiring the
  // branch-scoped successor for tenant UI truth.
  assert.match(migration,/function public\.dabbir_whatsapp_operational_evidence\(p_business_id uuid\)/);
  assert.match(hardening,/dabbir_whatsapp_operational_evidence\(uuid\) from public,anon,authenticated/i);
  assert.match(hardening,/dabbir_whatsapp_operational_evidence\(uuid\) to service_role/i);
  assert.doesNotMatch(hardening,/dabbir_whatsapp_operational_evidence\(uuid\) to authenticated/i);

  assert.match(branchEvidence,/function public\.dabbir_whatsapp_branch_operational_evidence\(p_business_id uuid,p_branch_id uuid\)/);
  assert.match(branchEvidence,/c\.business_id=p_business_id and c\.branch_id=p_branch_id/);
  assert.match(branchEvidence,/join public\.dabbir_conversations c on c\.id=e\.conversation_id and c\.business_id=e\.business_id/);
  assert.match(branchEvidence,/e\.business_id=p_business_id and c\.branch_id=p_branch_id/);
  assert.match(branchEvidence,/join public\.dabbir_conversations c on c\.id=r\.conversation_id and c\.business_id=r\.business_id/);
  assert.match(branchEvidence,/r\.business_id=p_business_id and c\.branch_id=p_branch_id/);
  assert.match(branchEvidence,/security invoker/i);
  assert.match(branchEvidence,/from public,anon,authenticated/i);
  assert.match(branchEvidence,/to service_role/i);
});

test('distinct inbound messages serialize ownership per tenant branch and sender',()=>{
  assert.match(raceMigration,/v_connection\.business_id::text\|\|':'\|\|v_connection\.branch_id::text\|\|':wa-sender:'\|\|v_sender/);
  const senderLock=raceMigration.indexOf("':wa-sender:'");
  const customerUpsert=raceMigration.indexOf('insert into public.dabbir_customers');
  const conversationLookup=raceMigration.indexOf('select c.id into v_conversation_id');
  assert.ok(senderLock>0&&senderLock<customerUpsert&&customerUpsert<conversationLookup);
  assert.match(raceMigration,/on conflict \(business_id,channel_handle\) where channel_handle is not null/);
  assert.match(raceMigration,/c\.branch_id=v_connection\.branch_id/);
});

test('WhatsApp becomes operational only through the explicit evidence state machine',()=>{
  assert.match(status,/deriveWhatsAppOperationalState/);
  assert.match(status,/operational_stage: machine\.stage/);
  assert.match(status,/operational: machine\.operational/);
  assert.match(status,/operational_reason: machine\.reason/);
  assert.match(status,/operational_evidence: evidence/);
  assert.match(machine,/REAL_WHATSAPP_CONVERSATION_NOT_VERIFIED/);
  assert.match(machine,/REAL_WHATSAPP_INBOUND_NOT_VERIFIED/);
  assert.match(machine,/REAL_WHATSAPP_REPLY_NOT_RECORDED/);
  assert.match(machine,/EXTERNAL_REPLY_RESULT_NOT_VERIFIED/);
  assert.match(machine,/stage: WHATSAPP_OPERATIONAL_STAGES\.INBOUND_VERIFIED/);
  assert.match(machine,/stage: WHATSAPP_OPERATIONAL_STAGES\.OUTBOUND_VERIFIED/);
  assert.match(machine,/state: 'OPERATIONAL'/);
  assert.match(machine,/operational: true/);
});

test('Meta verification failure remains fail closed',()=>{
  const embeddedStart=status.indexOf('async function embeddedStatus');
  const tenantStart=status.indexOf('async function tenantStatus',embeddedStart);
  const embeddedBody=status.slice(embeddedStart,tenantStart);
  const catchStart=embeddedBody.lastIndexOf('} catch (error) {');
  const catchBody=embeddedBody.slice(catchStart);
  assert.ok(catchStart>0,'embedded status catch path missing');
  assert.match(catchBody,/connected: false/);
  assert.match(catchBody,/outbound_configured: false/);
  assert.match(catchBody,/meta_authorized: false/);
  assert.doesNotMatch(catchBody,/connected: true/);
});

test('activation distinguishes Meta-linked from operational WhatsApp',()=>{
  assert.match(activation,/function whatsappLinked\(\)/);
  assert.match(activation,/function whatsappReady\(\)/);
  const readyStart=activation.indexOf('function whatsappReady()');
  const readyEnd=activation.indexOf('function aiReady()',readyStart);
  const readyBody=activation.slice(readyStart,readyEnd);
  assert.match(readyBody,/w\.operational===true/);
  assert.match(readyBody,/state\|\|''\)===\s*'OPERATIONAL'/);
  assert.doesNotMatch(readyBody,/w\.connected/);
  assert.doesNotMatch(readyBody,/w\.meta_authorized/);
  assert.match(activation,/if\(!whatsappLinked\(\)\).*channelTodo/);
  assert.match(activation,/if\(!whatsappReady\(\)\).*channelVerifyTodo/);
});

test('operational truth files parse as Node modules',()=>{
  for(const path of [statusPath,machinePath,activationPath,'api/_whatsapp-live-core.js','api/_whatsapp-branch-connection.js','api/dabbir-whatsapp-reply.js','api/dabbir-whatsapp-webhook.js','api/dabbir-whatsapp-disconnect.js','api/whatsapp-branch-intent.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
