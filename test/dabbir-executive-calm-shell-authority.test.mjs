import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const safariRecovery=fs.readFileSync(new URL('../api/app-safari-recovery.js',import.meta.url),'utf8');

test('Safari shell reasserts the same Executive Calm stylesheet after legacy and deferred presentation CSS',()=>{
  assert.match(safariRecovery,/data-dabbir-design-authority-tail="executive-calm-v1"/);
  assert.match(safariRecovery,/style\[data-dabbir-design-system="executive-calm-v1"\]/);
  assert.match(safariRecovery,/document\.body\.appendChild\(style\)/);
  assert.match(safariRecovery,/observer\.observe\(document\.head,\{childList:true\}\)/);
  assert.match(safariRecovery,/observer\.observe\(document\.body,\{childList:true\}\)/);
  assert.match(safariRecovery,/mode:'single-style-tail-reassert'/);
  assert.match(safariRecovery,/x-dabbir-design-authority/);
  assert.doesNotMatch(safariRecovery,/setInterval\(/);
});
