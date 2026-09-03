import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const owner=fs.readFileSync(new URL('api/owner-operations-ui.js',root),'utf8');
const service=fs.readFileSync(new URL('api/service-operations-ui.js',root),'utf8');

test('owner operations avoids micro typography and undersized actions',()=>{
  assert.match(owner,/\.opsMetric span\{[^}]*font-size:12px/);
  assert.match(owner,/\.opsRow\{[^}]*font-size:12px/);
  assert.match(owner,/\.opsName small\{[^}]*font-size:11px/);
  assert.match(owner,/\.opsAction\{[^}]*min-height:44px[^}]*font-size:12px/);
  assert.match(owner,/\.opsOrderSelect\{[^}]*min-height:44px[^}]*font-size:12px/);
});

test('service operations avoids micro typography and undersized actions',()=>{
  assert.match(service,/\.svcHero p\{[^}]*font-size:13px/);
  assert.match(service,/\.svcTruth\{[^}]*font-size:12px/);
  assert.match(service,/\.svcMetric span\{[^}]*font-size:12px/);
  assert.match(service,/\.svcRow\{[^}]*font-size:12px/);
  assert.match(service,/\.svcName small\{[^}]*font-size:11px/);
  assert.match(service,/\.svcAction\{[^}]*min-height:44px[^}]*font-size:12px/);
});
