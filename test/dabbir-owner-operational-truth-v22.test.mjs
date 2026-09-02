import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v22.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner dashboard v22 reports live operational truth without invented metrics',()=>{
  assert.match(gateway,/owner-command-center-v22\.js/);
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
