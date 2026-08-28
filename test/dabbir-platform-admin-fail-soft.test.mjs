import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('api/platform-customers.js', root), 'utf8');

test('platform customer admin capability fails soft when the server admin key is absent', () => {
  assert.match(source, /action==='capability'&&!serviceKey\(\)/);
  assert.match(source, /json\(res,200,\{ok:true,allowed:false,reason:'SERVER_ADMIN_NOT_CONFIGURED'\}\)/);
  const failSoftIndex = source.indexOf("action==='capability'&&!serviceKey()");
  const contextIndex = source.indexOf('const context=await adminContext(req,res)');
  assert.ok(failSoftIndex >= 0 && contextIndex > failSoftIndex, 'capability must short-circuit before privileged admin context');
});

test('privileged platform customer operations remain fail-closed without the server admin key', () => {
  assert.match(source, /if\(!key\)\{json\(res,503,\{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'\}\);return null\}/);
  assert.match(source, /const context=await adminContext\(req,res\)/);
  assert.match(source, /serviceRpc\(context\.key/);
});
