import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const recovery=fs.readFileSync('api/app-recovery.js','utf8');
const guardUi=fs.readFileSync('api/dabbir-whatsapp-connect-guard-ui.js','utf8');

test('no-Facebook onboarding stays inside the existing WhatsApp guard module',()=>{
  assert.match(recovery,/\/api\/dabbir-whatsapp-connect-guard-ui/);
  assert.doesNotMatch(recovery,/dabbir-optional-whatsapp-ui/);
});

test('DABBIR account can continue without Facebook or WhatsApp',()=>{
  assert.match(guardUi,/واتساب \(اختياري\)/);
  assert.match(guardUi,/WhatsApp \(optional\)/);
  assert.match(guardUi,/حسابك جاهز للاستخدام/);
  assert.match(guardUi,/لا تملك حساب Facebook؟/);
  assert.match(guardUi,/متابعة بدون واتساب/);
  assert.match(guardUi,/not having Facebook does not block your DABBIR account/);
  assert.match(guardUi,/x-dabbir-whatsapp-onboarding/);
});

test('WhatsApp onboarding guard parses as a Node module',()=>{
  const path='api/dabbir-whatsapp-connect-guard-ui.js';
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
});
