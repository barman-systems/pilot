import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v28.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner gateway uses the flat runtime while preserving reviewed v28 and v27 source truth chain',()=>{
  assert.match(gateway,/import dashboard from '\.\/_owner-command-center-runtime\.generated\.js'/);
  assert.doesNotMatch(gateway,/import dashboard from '\.\/owner-command-center(?:-v\d+)?\.js'/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(ui,/owner-command-center-v27\.js/);
});

test('owner UI removes micro typography from the active surface',()=>{
  for(const token of [
    '--owner-ui-small:12px',
    '.nav a{min-height:46px;font-size:14px',
    '.panel h2{font-size:17px',
    '.oc23head p,.oc23stamp,.oc23sub,.oc23metric span,.oc23item,.oc23note,.oc23stage,.oc23stage b{font-size:12px!important}',
    '.ops26head p,.ops26badge,.ops26row,.ops26note{font-size:12px!important}',
    '.ceocmd27sub,.ceocmd27msg,.ceocmd27truth{font-size:12px!important}',
    '.ceocmd27text{font-size:13px!important}'
  ]) assert.ok(ui.includes(token),token);
});

test('iPhone Safari controls stay readable and do not zoom on focus',()=>{
  assert.match(ui,/\.field\{min-height:48px;font-size:16px\}/);
  assert.match(ui,/\.ceocmd27 textarea\{min-height:112px!important;font-size:16px!important\}/);
  assert.match(ui,/visualViewport\?\.addEventListener\('resize',syncTop/);
  assert.match(ui,/env\(safe-area-inset-top\)/);
});

test('nested owner tabs cannot overlap the sticky owner header',()=>{
  assert.match(ui,/\.ownerTabs25\{position:static!important;top:auto!important/);
  assert.match(ui,/scroll-margin-top:calc\(var\(--owner-ui-top\) \+ 14px\)/);
});

test('owner dashboard adds keyboard and reduced-motion accessibility without changing data APIs',()=>{
  assert.match(ui,/focus-visible/);
  assert.match(ui,/prefers-reduced-motion:reduce/);
  assert.match(ui,/setAttribute\('aria-label'/);
  assert.match(ui,/setAttribute\('role','tablist'\)/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});
