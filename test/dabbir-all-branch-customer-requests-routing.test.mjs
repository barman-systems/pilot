import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/branch-context-ui.js',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../api/branch-workspace.js',import.meta.url),'utf8');

test('all-branches customer requests use the multichannel branch workspace',()=>{
  assert.doesNotMatch(ui,/if\(!scope\|\|scope==='all'\)return original\(url,options\)/);
  assert.match(ui,/if\(method==='GET'\)[\s\S]*new URL\('\/api\/branch-workspace'/);
  assert.match(ui,/if\(scope!=='all'\)target\.searchParams\.set\('branch_id',scope\)/);
  assert.match(workspace,/channel_type=in\.\(web,whatsapp,instagram\)/);
});
