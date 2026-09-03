import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v22.js',import.meta.url),'utf8');
const ui23=fs.readFileSync(new URL('../api/owner-command-center-v23.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner dashboard keeps v22 operational truth under the flattened reviewed source chain without invented metrics',()=>{
  assert.match(gateway,/import dashboard from '\.\/_owner-command-center-runtime\.generated\.js'/);
  assert.doesNotMatch(gateway,/import dashboard from '\.\/owner-command-center(?:-v\d+)?\.js'/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(ui23,/owner-command-center-v22\.js/);
  assert.match(ui,/\/api\/qa-capability/);
  assert.match(ui,/\/api\/release-evidence/);
  assert.match(ui,/fphpoysqdsceniwduxjq/);
  assert.match(ui,/UNAVAILABLE/);
  assert.match(ui,/NEEDS INSTRUMENTATION/);
  assert.match(ui,/supabase_project_ref/);
  assert.match(ui,/deployment_id/);
  assert.match(ui,/commit_sha/);
  assert.doesNotMatch(ui,/Math\.random|fake|demo metric/i);
});
