import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('shell booking guard is event-driven and keeps logical UI authorities visible',()=>{
  const shell=read('api/app-recovery.js');
  const bundles=JSON.parse(read('config/dabbir-ui-bundles.json'));
  assert.equal(new Set([...bundles.critical,...bundles.deferred]).size,bundles.critical.length+bundles.deferred.length);
  assert.match(shell,/\/api\/dabbir-owner-first-ui/);
  assert.ok(bundles.deferred.includes('/api/verified-metrics-ui'));
  assert.ok(bundles.critical.includes('/api/auth-session-stability-ui'));
  assert.doesNotMatch(shell,/setInterval\s*\(/,'shell booking guard must remain event-driven');
});

test('shell hardens readability, touch targets, iOS forms, and reduced motion',()=>{
  const shell=read('public/dabbir-web.css');
  assert.doesNotMatch(read('api/app-recovery.js'),/<style/);
  assert.match(shell,/font-size:16px!important/);
  assert.match(shell,/min-height:44px!important/);
  assert.match(shell,/env\(safe-area-inset-bottom\)/);
  assert.match(shell,/prefers-reduced-motion:reduce/);
  assert.match(read('index.html'),/href="\/dabbir-web\.css/);
});

test('legacy competing settings mobile stylesheet is not injected by the shell',()=>{
  const shell=read('api/app-recovery.js');
  assert.doesNotMatch(shell,/SETTINGS_MOBILE_REDESIGN/);
  assert.doesNotMatch(shell,/dabbir-settings-mobile-v4/);
});
