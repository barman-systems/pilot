import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const owner=fs.readFileSync(new URL('../api/dabbir-owner-first-ui.js',import.meta.url),'utf8');
const action=fs.readFileSync(new URL('../api/owner-action-center-ui.js',import.meta.url),'utf8');

test('owner interface removes micro typography from daily mobile surfaces',()=>{
  assert.match(owner,/\.bottomNav>button,\.bottomNav>a\{[^}]*font-size:11px/);
  assert.match(owner,/\.item b\{[^}]*font-size:14px/);
  assert.match(owner,/\.item small\{[^}]*font-size:12px/);
  assert.match(action,/\.dac-open\{[^}]*min-height:44px[^}]*font-size:12px/);
});

test('mobile conversation sizing respects dynamic viewport and safe areas',()=>{
  assert.match(owner,/height:clamp\(360px,calc\(100dvh - 224px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\),640px\)/);
  assert.match(owner,/min-height:360px/);
  assert.doesNotMatch(owner,/min-height:480px/);
  assert.match(owner,/\.top,\.side\{backdrop-filter:none!important;-webkit-backdrop-filter:none!important\}/);
});

test('owner surfaces follow active workspace and business timezone',()=>{
  assert.match(owner,/workspaceNow=/);
  assert.match(action,/workspaceNow=/);
  assert.match(owner,/businessTimeZone=/);
  assert.match(action,/businessTimeZone=/);
  assert.doesNotMatch(owner,/timeZone:['"]Asia\/Dubai['"]/);
  assert.doesNotMatch(action,/timeZone:['"]Asia\/Dubai['"]/);
});

test('owner action center refreshes when priority facts change',()=>{
  assert.match(owner,/\[x\.id,x\.due_at,x\.severity\]/);
});

test('owner mobile authority preserves five primary destinations without polling',()=>{
  assert.match(owner,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(owner,/setInterval\s*\(/);
});
