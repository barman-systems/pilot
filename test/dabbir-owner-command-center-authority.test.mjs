import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const authority=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');

test('owner production gateway uses one stable authoritative command-center entrypoint',()=>{
  assert.match(gateway,/import dashboard from '\.\/owner-command-center\.js';/);
  assert.doesNotMatch(gateway,/import dashboard from '\.\/owner-command-center-v\d+\.js';/);
});

test('numbered owner command centers are legacy implementation history, not production entrypoints',()=>{
  assert.match(authority,/Authoritative DABBIR owner command center entrypoint/);
  assert.match(authority,/do not create new numbered production entrypoints/);
  assert.match(authority,/owner-command-center-v29\.js/);
});
