import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cron=fs.readFileSync('api/dabbir-whatsapp-ai-cron.js','utf8');

test('WhatsApp Flows provisioning is disabled by default until explicitly enabled',()=>{
  assert.match(cron,/DABBIR_WHATSAPP_FLOWS_ENABLED/);
  assert.match(cron,/===\s*'1'/);
  const gate=cron.indexOf('if(flowProvisionEnabled)');
  const provision=cron.indexOf('processWhatsAppFlowProvisioning({limit:2})');
  const recovery=cron.indexOf('processWhatsAppRecoveryWithServiceMenu({limit:12})');
  assert.ok(gate>=0);
  assert.ok(provision>gate);
  assert.ok(recovery>provision);
  assert.match(cron,/flow_provision_enabled:flowProvisionEnabled/);
});
