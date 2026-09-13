import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/dabbir-vercel-production-repair.yml','utf8');

test('production repair is trusted-main only and never runs on pull_request',()=>{
  assert.match(workflow,/push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/pull_request:/);
  assert.match(workflow,/if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/environment:\s*production/);
  assert.match(workflow,/persist-credentials:\s*false/);
});

test('repair preserves source-of-truth Git identity and exact commit SHA',()=>{
  assert.match(workflow,/EXPECTED_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow,/gitSource:\{type:"github",org:"barman-systems",repo:"pilot",ref:"main",sha:\$sha\}/);
  assert.match(workflow,/target:"production"/);
  assert.match(workflow,/api\.vercel\.com\/v13\/deployments\?forceNew=1/);
  assert.doesNotMatch(workflow,/vercel\s+(?:deploy|--prod)|files\s*:/i);
});

test('repair gives native Git deployment first chance and respects runtime ignore contract',()=>{
  assert.match(workflow,/vercel-ignore-if-unaffected\.sh/);
  assert.match(workflow,/VERCEL_GIT_PREVIOUS_SHA:/);
  assert.match(workflow,/Allow native Vercel Git integration to win first/);
  assert.match(workflow,/DABBIR_NATIVE_GIT_PRODUCTION_MISSED_EXACT_SHA/);
  assert.match(workflow,/steps\.native\.outputs\.ready != 'true'/);
});

test('repair fails closed unless public Production proves exact release identity',()=>{
  assert.match(workflow,/\/api\/release-evidence/);
  assert.match(workflow,/\.commit_sha == \$sha/);
  assert.match(workflow,/\.environment == "production"/);
  assert.match(workflow,/\.git_ref == "main"/);
  assert.match(workflow,/\.git_provider == "github"/);
  assert.match(workflow,/\.repository == "barman-systems\/pilot"/);
  assert.match(workflow,/DABBIR_EXACT_PRODUCTION_RELEASE_NOT_VERIFIED/);
});
