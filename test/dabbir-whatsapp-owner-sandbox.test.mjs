import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { getWhatsAppSandboxConfig, parseSandboxToken } from '../api/_whatsapp-sandbox-core.js';

const migration=fs.readFileSync('supabase/migrations/20260828143902_dabbir_whatsapp_owner_sandbox_v1.sql','utf8');
const core=fs.readFileSync('api/_whatsapp-sandbox-core.js','utf8');
const endpoint=fs.readFileSync('api/dabbir-whatsapp-sandbox.js','utf8');
const webhook=fs.readFileSync('api/dabbir-whatsapp-webhook.js','utf8');
const guard=fs.readFileSync('api/dabbir-whatsapp-connect-guard-ui.js','utf8');
const recovery=fs.readFileSync('api/app-recovery.js','utf8');

test('sandbox token is hashed and stripped before business message persistence',()=>{
  const token='abcdefghijklmnopqrstuvwxyzABCD123456';
  const parsed=parseSandboxToken(`DABBIR TEST ${token}\nمرحبا من الاختبار`);
  assert.match(parsed.tokenHash,/^[0-9a-f]{64}$/);
  assert.equal(parsed.body,'مرحبا من الاختبار');
  assert.doesNotMatch(parsed.body,/DABBIR TEST/);
  assert.doesNotMatch(parsed.body,new RegExp(token));
});

test('sandbox config prefers dedicated DABBIR credentials and remains separate from tenant connections',()=>{
  const config=getWhatsAppSandboxConfig({
    DABBIR_WHATSAPP_SANDBOX_ACCESS_TOKEN:'sandbox-token',
    DABBIR_WHATSAPP_SANDBOX_PHONE_NUMBER_ID:'sandbox-phone',
    DABBIR_WHATSAPP_ACCESS_TOKEN:'legacy-token',
    DABBIR_WHATSAPP_PHONE_NUMBER_ID:'legacy-phone',
  });
  assert.equal(config.accessToken,'sandbox-token');
  assert.equal(config.phoneNumberId,'sandbox-phone');
  assert.equal(config.configured,true);
  assert.match(migration,/WHATSAPP_SANDBOX_PLATFORM_NUMBER_CONFLICT/);
  assert.match(migration,/dabbir_whatsapp_connections/);
  assert.doesNotMatch(core,/insert\s+into\s+public\.dabbir_whatsapp_connections/i);
});

test('sandbox database objects are fail-closed and service-role only',()=>{
  assert.match(migration,/force row level security/gi);
  assert.match(migration,/revoke all on public\.dabbir_whatsapp_sandbox_sessions from public, anon, authenticated/i);
  assert.match(migration,/revoke all on public\.dabbir_whatsapp_sandbox_events from public, anon, authenticated/i);
  assert.match(migration,/security invoker/gi);
  assert.doesNotMatch(migration,/security definer/i);
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_sandbox_create_session[\s\S]*to service_role/i);
});

test('sandbox data can never become production WhatsApp operational evidence',()=>{
  assert.match(migration,/channel_type, state, demo_mode/);
  assert.match(migration,/values \(s\.business_id, v_customer_id, 'whatsapp', 'ai_active', true\)/);
  assert.match(migration,/sender_type, body, intent, simulated/);
  assert.match(migration,/'SANDBOX_OWNER_TEST', true/);
  assert.match(webhook,/production_operational_evidence: false/);
  assert.match(endpoint,/tenant_whatsapp_connected: false/);
  assert.match(endpoint,/operational: false/);
});

test('sandbox outbound claims durably before provider send and freezes ambiguous attempts',()=>{
  const prepareIndex=core.indexOf("dabbir_whatsapp_sandbox_prepare_reply");
  const sendIndex=core.indexOf('sendSandboxMetaText({ recipient: prepared.recipient_handle');
  assert.ok(prepareIndex>=0&&sendIndex>prepareIndex);
  assert.match(core,/\['PROVIDER_ACCEPTED','SENDING','AMBIGUOUS'\]/);
  assert.match(core,/error\?\.ambiguous \? 'AMBIGUOUS' : 'FAILED'/);
  assert.match(migration,/reply_state in \('PENDING','SENDING','PROVIDER_ACCEPTED','FAILED','AMBIGUOUS'\)/);
});

test('webhook splits sandbox phone events from tenant WhatsApp events',()=>{
  assert.match(webhook,/isSandboxPhoneNumber\(event\.phoneNumberId\)/);
  assert.match(webhook,/persistSandboxInbound\(event\)/);
  assert.match(webhook,/replyToSandboxInbound\(route\)/);
  assert.match(webhook,/continue;[\s\S]*persistSignedInbound\(event\)/);
  assert.match(webhook,/applySandboxStatus\(event\)/);
  assert.match(webhook,/applySignedStatus\(event\)/);
});

test('sandbox endpoint is owner/admin authenticated and same-origin for creation',()=>{
  assert.match(endpoint,/ownerContext\(req, businessId\)/);
  assert.match(endpoint,/requireSameOrigin\(req\)/);
  assert.match(endpoint,/createOwnerSandboxSession/);
  assert.match(endpoint,/DABBIR_OWNED_TEST_NUMBER/);
  assert.match(endpoint,/META_EMBEDDED_SIGNUP_REQUIRED_FOR_OWN_NUMBER/);
  assert.doesNotMatch(endpoint,/access_token\s*:/i);
});

test('instant WhatsApp sandbox reuses the existing guard shell instead of adding another patch module',()=>{
  assert.match(recovery,/\/api\/dabbir-whatsapp-connect-guard-ui/);
  assert.doesNotMatch(recovery,/whatsapp-sandbox-ui/);
  assert.match(guard,/جرّب دبّر على واتساب الآن/);
  assert.match(guard,/هذا للاختبار فقط|للاختبار فقط/);
  assert.match(guard,/استخدم رقمي التجاري/);
});

test('new sandbox JavaScript modules parse',()=>{
  for(const path of ['api/_whatsapp-sandbox-core.js','api/dabbir-whatsapp-sandbox.js','api/dabbir-whatsapp-webhook.js','api/dabbir-whatsapp-connect-guard-ui.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
