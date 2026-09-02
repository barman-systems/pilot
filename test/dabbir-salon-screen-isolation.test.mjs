import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const salon=read('api/salon-mode-ui.js');
const guard=read('api/salon-screen-isolation-ui.js');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));

test('Salon feature screens stay hidden outside their active tab',()=>{
  assert.match(salon,/\.salonMode \.salonOnly\{display:block\}/,'regression fixture must cover the broad salonOnly display rule');
  assert.match(guard,/\.salonMode \.screen\.salonOnly\{display:none!important\}/);
  assert.match(guard,/\.salonMode \.screen\.salonOnly\.active\{display:block!important\}/);
  assert.ok(manifest.deferred.includes('/api/salon-screen-isolation-ui'));
});

test('Salon screen isolation guard is idempotent',()=>{
  assert.match(guard,/window\.__dabbirSalonScreenIsolation/);
  assert.match(guard,/document\.getElementById\(styleId\)/);
  assert.match(guard,/style\.id=styleId/);
});
