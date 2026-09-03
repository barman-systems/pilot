import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

const sourceScript=path.resolve('vercel-ignore-if-unaffected.sh');
const exactShaMessage=/Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence/;

function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim()}

function setupRepo(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dabbir-ipad-exact-sha-'));
  git(dir,'init','-q');
  git(dir,'config','user.email','dabbir-ci@example.invalid');
  git(dir,'config','user.name','DABBIR CI');
  fs.copyFileSync(sourceScript,path.join(dir,'vercel-ignore-if-unaffected.sh'));
  fs.writeFileSync(path.join(dir,'README.md'),'baseline\n');
  git(dir,'add','.');
  git(dir,'commit','-qm','baseline');
  return dir;
}

function changePath(dir,relativePath){
  const target=path.join(dir,relativePath);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,relativePath.endsWith('.yml')?'name: ipad production\n':'export {};\n');
  git(dir,'add','.');
  git(dir,'commit','-qm',`change ${relativePath}`);
  return git(dir,'rev-parse','HEAD');
}

function runGuard(dir,current,previous){
  return spawnSync('bash',['vercel-ignore-if-unaffected.sh'],{
    cwd:dir,
    env:{...process.env,VERCEL_GIT_COMMIT_SHA:current,VERCEL_GIT_PREVIOUS_SHA:previous,VERCEL_GIT_COMMIT_REF:'main'},
    encoding:'utf8',
  });
}

test('every iPad exact-SHA QA contract forces a Production deployment instead of Vercel ignore',()=>{
  for(const relativePath of [
    '.github/workflows/dabbir-ipad-webkit-production.yml',
    'test/run-ai-full-customer-journey-ipad.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ]){
    const dir=setupRepo();
    const previous=git(dir,'rev-parse','HEAD');
    const current=changePath(dir,relativePath);
    const result=runGuard(dir,current,previous);
    assert.equal(result.status,1,`${relativePath} unexpectedly skipped deployment: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout,exactShaMessage,relativePath);
  }
});
