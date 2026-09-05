import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const source=read('api/activity-task-navigation-ui.js');
const aggregate=read('api/dabbir-owner-away-task-ui.js');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('activity task navigation is aggregated without growing the shell module count',()=>{
  assert.ok(!manifest.deferred.includes('/api/activity-task-navigation-ui'));
  const aggregateIndex=manifest.deferred.indexOf('/api/dabbir-owner-away-task-ui');
  assert.ok(aggregateIndex>manifest.deferred.indexOf('/api/calendar-performance-ui'));
  assert.match(aggregate,/dabbir-owner-away-ui\.js/);
  assert.match(aggregate,/activity-task-navigation-ui\.js/);
});

test('task cards fetch their exact record instead of navigating to a general page',()=>{
  assert.match(source,/catalog.*inventory.*stock.*orders.*sales/);
  assert.match(source,/return 'operations'/);
  assert.match(source,/policy.*settings.*configuration.*permissions/);
  assert.match(source,/return 'settings'/);
  assert.match(source,/task_id:id/);
  assert.doesNotMatch(source,/showScreen\(route\)/);
});

test('task completion button stays completion-only',()=>{
  assert.match(source,/closest\?\.\('\[data-activity-task\]'\)\)return/);
});

test('task details do not wait for a matching row in a general page',()=>{
  assert.doesNotMatch(source,/focusDestination|setTimeout/);
  assert.match(source,/task\?\.id!==id/);
});

test('task cards are keyboard reachable',()=>{
  assert.match(source,/setAttribute\('role','link'\)/);
  assert.match(source,/setAttribute\('tabindex','0'\)/);
  assert.match(source,/event\.key!=='Enter'&&event\.key!==' '/);
});
