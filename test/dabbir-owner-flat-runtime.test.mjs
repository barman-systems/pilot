import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const generator=path.join(root,'scripts/build-owner-command-center-runtime.mjs');
const generatedPath=path.join(root,'api/_owner-command-center-runtime.generated.js');
const gateway=fs.readFileSync(path.join(root,'api/owner-dashboard-gateway.js'),'utf8');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function build(){execFileSync(process.execPath,[generator],{cwd:root,stdio:'pipe'})}
function capture(handler){
  let body='';
  const headers={};
  const res={
    statusCode:0,
    setHeader(name,value){headers[String(name).toLowerCase()]=value},
    end(chunk=''){body+=chunk==null?'':String(chunk);return body},
  };
  return Promise.resolve(handler({method:'GET',headers:{}},res)).then(()=>({statusCode:res.statusCode,headers,body}));
}

test('owner command center production gateway imports only the generated flat runtime',()=>{
  assert.match(gateway,/import dashboard from '\.\/_owner-command-center-runtime\.generated\.js'/);
  assert.doesNotMatch(gateway,/from '\.\/owner-command-center(?:-v\d+)?\.js'/);
});

test('verification and deployment lifecycle hooks always generate the flat owner runtime first',()=>{
  for(const name of ['pretest','precheck:syntax','predabbir:build']){
    assert.match(String(packageJson.scripts?.[name]||''),/build-owner-command-center-runtime\.mjs/,name);
  }
  assert.equal(packageJson.scripts?.['dabbir:build'],'node scripts/build-dabbir-ui-bundles.mjs && node scripts/vercel-build-gate.mjs');
});

test('flat runtime generator is fail-closed and produces an import-free single module',async()=>{
  build();
  const generated=fs.readFileSync(generatedPath,'utf8');
  assert.doesNotMatch(generated,/^\s*import\s+/m);
  assert.match(generated,/OWNER_COMMAND_CENTER_SOURCE_MANIFEST/);
  for(const marker of ['ownerExecutiveV23','ownerExecutiveOperationsV26','ownerCeoCommandDeskV27','ownerLeadTabs29','ownerCeoMissionControl'])assert.match(generated,new RegExp(marker));
  const numbered=fs.readdirSync(path.join(root,'api')).map(name=>name.match(/^owner-command-center-v(\d+)\.js$/)?.[1]).filter(Boolean).map(Number);
  assert.ok(numbered.length>0);
  assert.ok(Math.max(...numbered)<=29,'do not create another numbered production layer');
  const flat=await import(pathToFileURL(generatedPath).href+`?flat=${Date.now()}`);
  assert.equal(typeof flat.default,'function');
  assert.equal(flat.OWNER_COMMAND_CENTER_SOURCE_MANIFEST.at(-1),'owner-command-center.js');
  assert.ok(flat.OWNER_COMMAND_CENTER_SOURCE_MANIFEST.includes('owner-command-center-v29.js'));
});

test('flattened runtime renders byte-for-byte identical output to the source chain',async()=>{
  build();
  const source=await import(pathToFileURL(path.join(root,'api/owner-command-center.js')).href+`?source=${Date.now()}`);
  const flat=await import(pathToFileURL(generatedPath).href+`?flatparity=${Date.now()}`);
  const [expected,actual]=await Promise.all([capture(source.default),capture(flat.default)]);
  assert.deepEqual(actual,expected);
  assert.ok(actual.body.includes('ownerCeoMissionControl'));
  assert.ok(actual.body.includes('ownerLeadTabs29'));
});
