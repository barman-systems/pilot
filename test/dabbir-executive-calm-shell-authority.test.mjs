import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../public/dabbir-web.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const safariRecovery=fs.readFileSync(new URL('../api/app-safari-recovery.js',import.meta.url),'utf8');

test('Safari shell uses static design authority without reordering head or body',()=>{
  assert.match(safariRecovery,/data-dabbir-design-authority-head="executive-calm-v1"/);
  assert.match(html,/href="\/dabbir-web\.css/);
  assert.doesNotMatch(safariRecovery,/createElement\(['"]style['"]\)/);
  assert.doesNotMatch(safariRecovery,/head\.appendChild|head\.lastElementChild|observe\(document\.head/);
  assert.match(safariRecovery,/mode:'static-stylesheet'/);
  assert.match(safariRecovery,/presentationObservers:0/);
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
  assert.match(css,/inset-inline-start:auto!important/);
  assert.match(css,/inset-inline-end:auto!important/);
  assert.match(css,/left:var\(--dabbir-sidebar-visual-left,0px\)!important/);
  assert.match(css,/width:var\(--dabbir-sidebar-visual-width,min\(82vw,286px\)\)!important/);
  assert.match(css,/side\.open\{transform:translate3d\(0,0,0\)!important\}/);
  assert.match(safariRecovery,/visualViewportAnchoring:true/);
  assert.doesNotMatch(safariRecovery,/inset:0 0 0 auto!important/);
});
