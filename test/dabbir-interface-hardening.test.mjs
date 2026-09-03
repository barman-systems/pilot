import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('shell compatibility mirror exactly matches the bundle manifest and booking guard is event-driven',()=>{
  const shell=read('api/app-recovery.js');
  const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
  const block=shell.match(/const UI_MODULE_ORDER = \[([\s\S]*?)\];/)?.[1]||'';
  const mirror=[...block.matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(mirror,[...manifest.critical,...manifest.deferred],'shell module mirror drifted from the build manifest');
  assert.doesNotMatch(shell,/setInterval\s*\(/,'shell booking guard must remain event-driven');
});

test('shell hardens readability, touch targets, iOS forms, and reduced motion',()=>{
  const shell=read('api/app-recovery.js');
  assert.match(shell,/dabbir-interface-hardening-v1/);
  assert.match(shell,/font-size:16px!important/);
  assert.match(shell,/min-height:44px!important/);
  assert.match(shell,/env\(safe-area-inset-bottom\)/);
  assert.match(shell,/prefers-reduced-motion:reduce/);
  assert.match(shell,/INTERFACE_HARDENING \+ '\\n<\/body>'/);
});

test('legacy competing settings mobile stylesheet is not injected by the shell',()=>{
  const shell=read('api/app-recovery.js');
  assert.doesNotMatch(shell,/SETTINGS_MOBILE_REDESIGN/);
  assert.doesNotMatch(shell,/dabbir-settings-mobile-v4/);
});
