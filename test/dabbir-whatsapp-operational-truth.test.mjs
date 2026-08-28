import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const statusPath='api/dabbir-whatsapp-status.js';
const machinePath='api/_dabbir-whatsapp-state-machine.js';
const activationPath='api/customer-activation-ui.js';
const migrationPath='supabase/migrations/20260828044500_dabbir_whatsapp_live_message_path_v2.sql';
const status=fs.readFileSync(statusPath,'utf8');
const machine=fs.readFileSync(machinePath,'utf8');
const activation=fs.readFileSync(activationPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

test('WhatsApp operational evidence is tenant-scoped, non-demo, and provider-backed',()=>{
  assert.match(status,/supabaseRpc/);
  assert.match(status,/dabbir_whatsapp_operational_evidence/);
  assert.match(status,/\{ p_business_id: businessId \}/);
  assert.match(migration,/function public\.dabbir_whatsapp_operational_evidence\(p_business_id uuid\)/);
  assert.match(migration,/has_permission\(p_business_id,'view_integrations'\)/);
  assert.match(migration,/c\.business_id=p_business_id and c\.channel_type='whatsapp' and c\.demo_mode=false/);
  assert.match(migration,/e\.business_id=p_business_id and e\.direction='inbound' and e\.event_type='message' and e\.message_id is not null/);
  assert.match(migration,/r\.business_id=p_business_id and r\.message_id is not null and r\.provider_message_id is not null/);
  assert.match(migration,/r\.business_id=p_business_id and r\.provider_verified=true and r\.state in \('DELIVERED','READ'\)/);
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
  const catchStart=status.indexOf('} catch (error) {');
  const catchBody=status.slice(catchStart, status.indexOf('\n  }\n}\n\nasync function tenantStatus',catchStart));
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
  for(const path of [statusPath,machinePath,activationPath,'api/_whatsapp-live-core.js','api/dabbir-whatsapp-reply.js','api/dabbir-whatsapp-webhook.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
