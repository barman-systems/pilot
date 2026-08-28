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

test('DABBIR offers one-action Facebook creation and automatic WhatsApp resume',()=>{
  assert.match(guardUi,/لا تملك حساب Facebook؟/);
  assert.match(guardUi,/إنشاء الحساب والمتابعة/);
  assert.match(guardUi,/Create account and continue/);
  assert.match(guardUi,/https:\/\/www\.facebook\.com\/r\.php/);
  assert.match(guardUi,/META_SIGNUP_RESUME_KEY/);
  assert.match(guardUi,/sessionStorage\.setItem/);
  assert.match(guardUi,/resumeOfficialWhatsAppSignup/);
  assert.match(guardUi,/window\.addEventListener\('focus'/);
  assert.match(guardUi,/visibilitychange/);
  assert.match(guardUi,/primary\.click\(\)/);
  assert.match(guardUi,/meta-resume-v2/);
});

test('the rejected skip-WhatsApp workaround is gone',()=>{
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
