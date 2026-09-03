import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const authority=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');
const flattener=fs.readFileSync(new URL('../scripts/build-owner-command-center-runtime.mjs',import.meta.url),'utf8');

test('owner production gateway uses one generated authoritative command-center runtime',()=>{
  assert.match(gateway,/import dashboard from '\.\/_owner-command-center-runtime\.generated\.js';/);
  assert.doesNotMatch(gateway,/import dashboard from '\.\/owner-command-center(?:-v\d+)?\.js';/);
  assert.match(flattener,/const entry='owner-command-center\.js'/);
  assert.match(flattener,/OWNER_COMMAND_CENTER_SOURCE_MANIFEST/);
});

test('numbered owner command centers are build-time history, not production entrypoints',()=>{
  assert.match(authority,/Authoritative DABBIR owner command center entrypoint/);
  assert.match(authority,/do not create new numbered production entrypoints/);
  assert.match(authority,/owner-command-center-v29\.js/);
  assert.match(flattener,/NUMBERED_RUNTIME_IMPORT_SURVIVED|RUNTIME_IMPORT_SURVIVED|UNSUPPORTED_IMPORT/);
});
