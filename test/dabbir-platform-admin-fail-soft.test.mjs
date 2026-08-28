import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('api/platform-customers.js', root), 'utf8');

test('platform customer admin capability verifies admin identity before failing soft on missing server config', () => {
  const contextIndex = source.indexOf('const context=await adminContext(req,res)');
  const capabilityIndex = source.indexOf("if(action==='capability')");
  assert.ok(contextIndex >= 0 && capabilityIndex > contextIndex, 'admin identity must be verified before capability is disclosed');
  assert.match(source, /const serviceConfigured=Boolean\(context\.key\)/);
  assert.match(source, /allowed:serviceConfigured/);
  assert.match(source, /service_configured:serviceConfigured/);
  assert.match(source, /reason:serviceConfigured\?null:'SERVER_ADMIN_NOT_CONFIGURED'/);
});

test('privileged platform customer operations remain fail-closed without the server admin key', () => {
  assert.match(source, /function adminServiceUnavailable\(res\)/);
  assert.match(source, /json\(res,503,\{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'\}\)/);
  assert.match(source, /if\(!context\.key\)return adminServiceUnavailable\(res\)/);
  assert.match(source, /serviceRpc\(context\.key/);
});
