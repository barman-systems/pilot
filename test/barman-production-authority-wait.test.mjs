import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {classifyProductionCompatibility} from '../scripts/wait-dabbir-production-sha.mjs';

const deploymentClassifier=path.resolve('vercel-ignore-if-unaffected.sh');
const workflow=fs.readFileSync('.github/workflows/barman-independent-verifier.yml','utf8');

function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim()}
function setupRepo(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'barman-production-authority-'));
  git(dir,'init','-q');
  git(dir,'config','user.email','barman-ci@example.invalid');
  git(dir,'config','user.name','BARMAN CI');
  fs.mkdirSync(path.join(dir,'api'),{recursive:true});
  fs.writeFileSync(path.join(dir,'api','app.js'),'export default 1;\n');
  git(dir,'add','.');
  git(dir,'commit','-qm','base runtime');
  return dir;
}
function commitPath(dir,relativePath,content='evidence\n'){
  const target=path.join(dir,relativePath);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,content);
  git(dir,'add','.');
  git(dir,'commit','-qm',`change ${relativePath}`);
  return git(dir,'rev-parse','HEAD');
}
function classify(dir,productionSha,expectedSha){
  return classifyProductionCompatibility({productionSha,expectedSha,cwd:dir,deploymentClassifier});
}

test('exact Production SHA remains immediately authoritative',()=>{
  const dir=setupRepo();
  const sha=git(dir,'rev-parse','HEAD');
  const result=classify(dir,sha,sha);
  assert.equal(result.ready,true);
  assert.equal(result.reason,'EXACT_SHA');
});

test('static audit/doc follow-up may reuse the last verified Production runtime',()=>{
  const dir=setupRepo();
  const production=git(dir,'rev-parse','HEAD');
  const expected=commitPath(dir,'docs/audits/DABBIR_GOVERNANCE_NOTE.md','historical evidence only\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,true,JSON.stringify(result));
  assert.equal(result.reason,'NON_RUNTIME_HEAD_REUSES_PRODUCTION');
});

test('ordinary test-only follow-up may reuse the last verified Production runtime',()=>{
  const dir=setupRepo();
  const production=git(dir,'rev-parse','HEAD');
  const expected=commitPath(dir,'test/non-runtime-proof.test.mjs','export {};\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,true,JSON.stringify(result));
  assert.equal(result.reason,'NON_RUNTIME_HEAD_REUSES_PRODUCTION');
});

test('runtime API change still requires the exact Production SHA',()=>{
  const dir=setupRepo();
  const production=git(dir,'rev-parse','HEAD');
  const expected=commitPath(dir,'api/app.js','export default 2;\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,false,JSON.stringify(result));
  assert.equal(result.reason,'EXACT_SHA_REQUIRED');
});

test('unknown script change remains fail-closed and requires exact Production SHA',()=>{
  const dir=setupRepo();
  const production=git(dir,'rev-parse','HEAD');
  const expected=commitPath(dir,'scripts/new-release-hook.mjs','export {};\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,false,JSON.stringify(result));
  assert.equal(result.reason,'EXACT_SHA_REQUIRED');
});

test('a newer Production SHA that descends from the expected push is acceptable',()=>{
  const dir=setupRepo();
  const expected=commitPath(dir,'docs/first.md','first\n');
  const production=commitPath(dir,'api/app.js','export default 3;\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,true,JSON.stringify(result));
  assert.equal(result.reason,'PRODUCTION_DESCENDS_FROM_EXPECTED');
});

test('diverged Production and expected histories fail closed',()=>{
  const dir=setupRepo();
  const base=git(dir,'rev-parse','HEAD');
  const expected=commitPath(dir,'docs/expected.md','expected\n');
  git(dir,'checkout','-qb','production-line',base);
  const production=commitPath(dir,'api/app.js','export default 4;\n');
  const result=classify(dir,production,expected);
  assert.equal(result.ready,false,JSON.stringify(result));
  assert.equal(result.fatal,true);
  assert.equal(result.reason,'PRODUCTION_LINEAGE_MISMATCH');
});

test('independent verifier checks full lineage and no longer demands unconditional exact SHA',()=>{
  assert.match(workflow,/fetch-depth:\s*0/);
  assert.match(workflow,/Wait for Production-compatible release authority on push wake-up/);
  assert.match(workflow,/node scripts\/wait-dabbir-production-sha\.mjs/);
  assert.doesNotMatch(workflow,/Wait for exact Production verifier on push wake-up/);
});
