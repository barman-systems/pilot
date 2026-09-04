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

test('responsive iPad sidebar is physically anchored inside the visual viewport for RTL and LTR',()=>{
  assert.match(safariRecovery,/dabbir-tablet-sidebar-anchor/);
  assert.match(safariRecovery,/ipad-visual-viewport-anchor-v1/);
  assert.match(safariRecovery,/inset:0 0 0 auto!important/);
  assert.match(safariRecovery,/inset:0 auto 0 0!important/);
  assert.match(safariRecovery,/max-width:calc\(100vw - 16px\)!important/);
  assert.match(safariRecovery,/side\.open\{transform:translate3d\(0,0,0\)!important\}/);
  assert.match(safariRecovery,/tabletSidebarAnchor:tabletSidebarAnchorVersion/);
});