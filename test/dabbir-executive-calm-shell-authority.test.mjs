import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const safariRecovery=fs.readFileSync(new URL('../api/app-safari-recovery.js',import.meta.url),'utf8');

test('Safari shell reasserts Executive Calm in head without mutating the application body tree',()=>{
  assert.match(safariRecovery,/data-dabbir-design-authority-head="executive-calm-v1"/);
  assert.match(safariRecovery,/style\[data-dabbir-design-system="executive-calm-v1"\]/);
  assert.match(safariRecovery,/document\.head\.appendChild\(style\)/);
  assert.match(safariRecovery,/observer\.observe\(document\.head,\{childList:true\}\)/);
  assert.match(safariRecovery,/mode:'head-tail-reassert'/);
  assert.match(safariRecovery,/bodyObservers:0/);
  assert.match(safariRecovery,/x-dabbir-design-authority/);
  assert.doesNotMatch(safariRecovery,/document\.body\.appendChild\(style\)/);
  assert.doesNotMatch(safariRecovery,/observer\.observe\(document\.body/);
  assert.doesNotMatch(safariRecovery,/setInterval\(/);
});
