import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const recovery=fs.readFileSync('api/app-recovery.js','utf8');
const optionalUi=fs.readFileSync('api/dabbir-optional-whatsapp-ui.js','utf8');
const guardUi=fs.readFileSync('api/dabbir-whatsapp-connect-guard-ui.js','utf8');

test('optional WhatsApp UX loads after customer activation',()=>{
  const activation=recovery.indexOf('/api/customer-activation-ui');
  const optional=recovery.indexOf('/api/dabbir-optional-whatsapp-ui');
  assert.ok(activation>=0);
  assert.ok(optional>activation);
});

test('DABBIR account can continue without Facebook or WhatsApp',()=>{
  assert.match(optionalUi,/واتساب \(اختياري\)/);
  assert.match(optionalUi,/WhatsApp \(optional\)/);
  assert.match(optionalUi,/حسابك جاهز للاستخدام/);
  assert.match(guardUi,/لا تملك حساب Facebook؟/);
  assert.match(guardUi,/متابعة بدون واتساب/);
  assert.match(guardUi,/not having Facebook does not block your DABBIR account/);
});

test('optional onboarding scripts parse as Node modules',()=>{
  for(const path of ['api/dabbir-optional-whatsapp-ui.js','api/dabbir-whatsapp-connect-guard-ui.js','api/app-recovery.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
