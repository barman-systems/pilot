import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const salon=read('public/dabbir-web.css');
const behavior=read('api/dabbir-navigation-event-bridge-ui.js');
const bridge=read('public/dabbir-web.css');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('Salon feature screens stay hidden outside their active tab',()=>{
  assert.match(salon,/\.salonMode \.salonOnly\{display:block\}/,'regression fixture must cover the broad salonOnly display rule');
  assert.match(bridge,/\.salonMode \.screen\.salonOnly\{display:none\}/);
  assert.match(bridge,/\.salonMode \.screen\.salonOnly\.active\{display:block\}/);
  assert.match(behavior,/installShowScreenRouterDelegation\(\);/);
  assert.equal(manifest.deferred.includes('/api/salon-screen-isolation-ui'),false,'fix must not add another shell module');
});

test('Salon screen isolation is static and bridge cannot regain CSS authority',()=>{
  assert.doesNotMatch(behavior,/createElement\(['"]style['"]\)|installSalonScreenIsolation/);
  assert.match(read('index.html'),/href="\/dabbir-web\.css/);
});
