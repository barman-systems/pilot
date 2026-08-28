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

test('DABBIR offers an instant WhatsApp owner sandbox before Meta onboarding',()=>{
  assert.match(guardUi,/جرّب دبّر على واتساب الآن/);
  assert.match(guardUi,/بدون Facebook/);
  assert.match(guardUi,/للاختبار فقط/);
  assert.match(guardUi,/استخدم رقمي التجاري/);
  assert.match(guardUi,/\/api\/dabbir-whatsapp-sandbox/);
  assert.match(guardUi,/instant-sandbox-v1/);
  assert.doesNotMatch(guardUi,/https:\/\/www\.facebook\.com\/r\.php/);
  assert.doesNotMatch(guardUi,/META_SIGNUP_RESUME_KEY/);
  assert.doesNotMatch(guardUi,/resumeOfficialWhatsAppSignup/);
});

test('the rejected skip-WhatsApp workaround stays gone',()=>{
  assert.doesNotMatch(guardUi,/متابعة بدون واتساب/);
  assert.doesNotMatch(guardUi,/Continue without WhatsApp/);
  assert.doesNotMatch(guardUi,/واتساب \(اختياري\)/);
  assert.doesNotMatch(guardUi,/WhatsApp \(optional\)/);
});

test('WhatsApp onboarding guard parses as a Node module',()=>{
  const path='api/dabbir-whatsapp-connect-guard-ui.js';
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
});
