import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const salon=read('api/salon-mode-ui.js');
const bridge=read('api/dabbir-navigation-event-bridge-ui.js');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('Salon feature screens stay hidden outside their active tab',()=>{
  assert.match(salon,/\.salonMode \.salonOnly\{display:block\}/,'regression fixture must cover the broad salonOnly display rule');
  assert.match(bridge,/\.salonMode \.screen\.salonOnly\{display:none\}/);
  assert.match(bridge,/\.salonMode \.screen\.salonOnly\.active\{display:block\}/);
  assert.match(bridge,/installSalonScreenIsolation\(\);\s*installShowScreenRouterDelegation\(\);/);
  assert.equal(manifest.deferred.includes('/api/salon-screen-isolation-ui'),false,'fix must not add another shell module');
});

test('Salon screen isolation is idempotent inside the existing navigation bridge',()=>{
  assert.match(bridge,/function installSalonScreenIsolation\(\)/);
  assert.match(bridge,/document\.getElementById\(styleId\)/);
  assert.match(bridge,/style\.id=styleId/);
});
