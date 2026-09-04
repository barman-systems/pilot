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

test('responsive iPad sidebar is anchored to visual viewport coordinates rather than the wider WebKit layout viewport',()=>{
  assert.match(safariRecovery,/ipad-visual-viewport-anchor-v2/);
  assert.match(safariRecovery,/window\.visualViewport/);
  assert.match(safariRecovery,/viewport\?\.width\|\|window\.innerWidth/);
  assert.match(safariRecovery,/viewport\?\.offsetLeft\|\|0/);
  assert.match(safariRecovery,/sidebarLeft=rtl\?\(viewportLeft\+viewportWidth-sidebarWidth\):viewportLeft/);
  assert.match(safariRecovery,/--dabbir-sidebar-visual-left/);
  assert.match(safariRecovery,/--dabbir-sidebar-visual-width/);
  assert.match(safariRecovery,/inset-inline-start:auto!important/);
  assert.match(safariRecovery,/inset-inline-end:auto!important/);
  assert.match(safariRecovery,/left:var\(--dabbir-sidebar-visual-left,0px\)!important/);
  assert.match(safariRecovery,/width:var\(--dabbir-sidebar-visual-width,min\(82vw,286px\)\)!important/);
  assert.match(safariRecovery,/side\.open\{transform:translate3d\(0,0,0\)!important\}/);
  assert.match(safariRecovery,/visualViewportAnchoring:true/);
  assert.doesNotMatch(safariRecovery,/inset:0 0 0 auto!important/);
});
