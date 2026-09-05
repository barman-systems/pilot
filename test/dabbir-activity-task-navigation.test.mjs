import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const source=read('api/activity-task-navigation-ui.js');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('activity task navigation is loaded after the activity/calendar surface',()=>{
  const activityIndex=manifest.deferred.indexOf('/api/activity-task-navigation-ui');
  assert.ok(activityIndex>manifest.deferred.indexOf('/api/calendar-performance-ui'));
});

test('store activity task categories route directly to their work surfaces',()=>{
  assert.match(source,/catalog.*inventory.*stock.*orders.*sales/);
  assert.match(source,/return 'operations'/);
  assert.match(source,/policy.*settings.*configuration.*permissions/);
  assert.match(source,/return 'settings'/);
  assert.match(source,/showScreen\(route\)/);
});

test('task completion button stays completion-only',()=>{
  assert.match(source,/closest\?\.\('\[data-activity-task\]'\)\)return/);
});

test('task destination opens the fastest matching control',()=>{
  assert.match(source,/#opsAddProduct/);
  assert.match(source,/\.opsGrid > div:first-child \.opsSection/);
  assert.match(source,/\.opsGrid > div:last-child \.opsSection/);
  assert.match(source,/data-key=\\"delivery_policy\\"/);
  assert.match(source,/data-key=\\"return_policy\\"/);
});

test('task cards are keyboard reachable',()=>{
  assert.match(source,/setAttribute\('role','link'\)/);
  assert.match(source,/setAttribute\('tabindex','0'\)/);
  assert.match(source,/event\.key!=='Enter'&&event\.key!==' '/);
});
