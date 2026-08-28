import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const statusPath='api/dabbir-whatsapp-status.js';
const machinePath='api/_dabbir-whatsapp-state-machine.js';
const activationPath='api/customer-activation-ui.js';
const liveCorePath='api/_whatsapp-live-core.js';
const replyPath='api/dabbir-whatsapp-reply.js';
const migrationPath='supabase/migrations/20260828044600_dabbir_whatsapp_live_message_path_v2.sql';
const status=fs.readFileSync(statusPath,'utf8');
const machine=fs.readFileSync(machinePath,'utf8');
const activation=fs.readFileSync(activationPath,'utf8');
const liveCore=fs.readFileSync(liveCorePath,'utf8');
const reply=fs.readFileSync(replyPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

test('WhatsApp operational evidence is tenant-scoped and excludes simulation',()=>{
  assert.match(status,/supabaseRpc/);
  assert.match(status,/dabbir_whatsapp_operational_evidence/);
  assert.match(status,/\{ p_business_id: businessId \}/);
  assert.match(migration,/function public\.dabbir_whatsapp_operational_evidence\(p_business_id uuid\)/);
  assert.match(migration,/has_permission\(p_business_id,'view_integrations'\)/);
  assert.match(migration,/c\.business_id=p_business_id and c\.channel_type='whatsapp' and c\.demo_mode=false/);
  assert.match(migration,/e\.business_id=p_business_id and e\.direction='inbound'.*e\.provider_verified=true/s);
  assert.match(migration,/e\.business_id=p_business_id and e\.direction='outbound'.*e\.provider_status in \('accepted','sent','delivered','read'\)/s);
  assert.match(migration,/e\.provider_verified=true and e\.provider_status in \('delivered','read'\)/);
  assert.match(migration,/values\(v_connection\.business_id,v_conversation_id,'customer'.*false\)/s);
  assert.match(migration,/values\(p_business_id,v_attempt\.conversation_id,'human'.*false,p_sender_user_id\)/s);
});

test('outbound WhatsApp reserves idempotency before the single Meta side effect',()=>{
  assert.match(reply,/beginOutboundAttempt/);
  assert.match(reply,/await beginOutboundAttempt[\s\S]*await sendMetaText[\s\S]*await finalizeProviderAcceptedReply/);
  assert.match(reply,/DUPLICATE_REPLY_SUPPRESSED/);
  assert.match(reply,/retry_safe: false/);
  assert.match(liveCore,/whatsappReplyFingerprint/);
  assert.match(liveCore,/dabbir_whatsapp_begin_outbound/);
  assert.match(liveCore,/dabbir_whatsapp_finalize_outbound/);
  assert.match(migration,/created_at >= now\(\)-interval '5 minutes'/);
  assert.match(migration,/m\.status='active' and m\.suspended_at is null and m\.removed_at is null/);
  assert.match(migration,/account_access_state s where s\.user_id=p_sender_user_id and s\.status='suspended'/);
});

test('provider acceptance is not delivery verification',()=>{
  assert.match(liveCore,/META_STATUS_VERIFIED = new Set\(\['delivered', 'read'\]\)/);
  assert.match(migration,/v_verified := v_status in \('delivered','read'\)/);
  assert.match(migration,/provider_status='accepted',provider_verified=false/);
  assert.doesNotMatch(migration,/v_verified := v_status in \('sent','delivered','read'\)/);
});

test('Meta verification failure remains fail-closed for tenant connected and outbound state',()=>{
  const catchStart=status.indexOf('} catch (error) {');
  const tenantFallback=status.slice(catchStart, status.indexOf('async function tenantStatus',catchStart));
  assert.match(tenantFallback,/verificationFailed: true/);
  assert.match(tenantFallback,/connected: false/);
  assert.match(tenantFallback,/outbound_configured: false/);
  assert.match(tenantFallback,/meta_authorized: false/);
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
  assert.match(machine,/state: 'OPERATIONAL'/);
  assert.match(machine,/operational: true/);
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
});

test('WhatsApp truth files parse as Node modules',()=>{
  for(const path of [statusPath,machinePath,activationPath,liveCorePath,replyPath]){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
