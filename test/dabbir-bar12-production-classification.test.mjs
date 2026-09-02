import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceScript=path.resolve('vercel-ignore-if-unaffected.sh');
function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim()}
function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dabbir-bar12-vercel-'));
  git(dir,'init','-q');
  git(dir,'config','user.email','ci@example.invalid');
  git(dir,'config','user.name','DABBIR CI');
  fs.copyFileSync(sourceScript,path.join(dir,'vercel-ignore-if-unaffected.sh'));
  fs.writeFileSync(path.join(dir,'README.md'),'base\n');
  git(dir,'add','.');git(dir,'commit','-qm','base');
  return dir;
}
function change(dir,relativePath){
  const target=path.join(dir,relativePath);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,relativePath.endsWith('.json')?'{}\n':relativePath.endsWith('.yml')?'name: test\n':'export {};\n');
  git(dir,'add','.');git(dir,'commit','-qm',`change ${relativePath}`);
  return git(dir,'rev-parse','HEAD');
}
function run(dir,head,base){
  return spawnSync('bash',['vercel-ignore-if-unaffected.sh'],{
    cwd:dir,
    env:{...process.env,VERCEL_GIT_COMMIT_SHA:head,VERCEL_GIT_PREVIOUS_SHA:base,VERCEL_GIT_COMMIT_REF:'main'},
    encoding:'utf8',
  });
}

test('executable BAR-12 and release contracts advance the exact Production SHA',()=>{
  const paths=[
    '.github/workflows/dabbir-bar12-readiness.yml',
    '.github/scripts/dabbir-bar12-technical-evidence.mjs',
    '.github/scripts/dabbir-bar12-alert-evidence.mjs',
    'scripts/dabbir-readiness-gate.mjs',
    'test/dabbir-bar12-technical-evidence.test.mjs',
    'config/barman-integration-contract.json',
    'config/dabbir-release-policy.json',
  ];
  for(const relativePath of paths){
    const dir=setup();
    const base=git(dir,'rev-parse','HEAD');
    const head=change(dir,relativePath);
    const result=run(dir,head,base);
    assert.equal(result.status,1,`${relativePath}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout,/Exact-SHA Production verification contract changed|Runtime or unknown path changed/);
  }
});

test('static BAR-12 evidence snapshots never manufacture a new Production runtime',()=>{
  const paths=[
    'docs/evidence/dabbir-bar12-technical-review.json',
    'docs/evidence/dabbir-bar12-alert-delivery.json',
  ];
  for(const relativePath of paths){
    const dir=setup();
    const base=git(dir,'rev-parse','HEAD');
    const head=change(dir,relativePath);
    const result=run(dir,head,base);
    assert.equal(result.status,0,`${relativePath}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout,/Only explicitly non-runtime DABBIR paths changed/);
  }
});