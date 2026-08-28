import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const statusPath='api/dabbir-whatsapp-status.js';
const machinePath='api/_dabbir-whatsapp-state-machine.js';
const activationPath='api/customer-activation-ui.js';
const status=fs.readFileSync(statusPath,'utf8');
const machine=fs.readFileSync(machinePath,'utf8');
const activation=fs.readFileSync(activationPath,'utf8');

test('WhatsApp operational evidence is tenant-scoped and excludes simulation',()=>{
  assert.match(status,/dabbir_conversations\?select=id/);
  assert.match(status,/channel_type=eq\.whatsapp/);
  assert.match(status,/demo_mode=eq\.false/);
  assert.match(status,/dabbir_messages\?select=sender_type,simulated/);
  assert.match(status,/simulated=eq\.false/);
  assert.match(status,/dabbir_conversation_outcomes\?select=verified_external_result/);
  assert.match(status,/verified_external_result=eq\.true/);
  assert.match(status,/business_id=eq\.\$\{encodedBusinessId\}/);
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
  for(const path of [statusPath,machinePath,activationPath]){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
