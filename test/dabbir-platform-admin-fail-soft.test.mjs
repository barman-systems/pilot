import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('api/platform-customers.js', root), 'utf8');

test('platform customer admin capability is a quiet fail-closed probe before privileged admin context', () => {
  const capabilityRouteIndex = source.indexOf("if(req.method==='GET'&&action==='capability')return platformCapability(req,res)");
  const contextIndex = source.indexOf('const context=await adminContext(req,res)');
  assert.ok(capabilityRouteIndex >= 0 && contextIndex > capabilityRouteIndex, 'capability must be resolved without invoking privileged adminContext first');
  assert.match(source, /function quietCapability\(res,/);
  assert.match(source, /return json\(res,200,/);
  assert.match(source, /if\(!token\)return quietCapability\(res,\{reason:'AUTH_REQUIRED'\}\)/);
  assert.match(source, /if\(!response\?\.ok\)return quietCapability\(res,\{authenticated:true,reason:'PLATFORM_ADMIN_REQUIRED'\}\)/);
  assert.match(source, /role:allowed\?role:null/);
  assert.match(source, /service_configured:allowed\?Boolean\(serviceConfigured\):false/);
});

test('platform admin capability discloses service configuration only to an active admin', () => {
  assert.match(source, /if\(!admin\?\.active\)return quietCapability\(res,\{authenticated:true,reason:'PLATFORM_ADMIN_REQUIRED'\}\)/);
  assert.match(source, /const serviceConfigured=Boolean\(serviceKey\(\)\)/);
  assert.match(source, /allowed:serviceConfigured/);
  assert.match(source, /reason:serviceConfigured\?null:'SERVER_ADMIN_NOT_CONFIGURED'/);
});

test('privileged platform customer operations remain fail-closed without platform admin authority or server admin key', () => {
  assert.match(source, /async function adminContext\(req,res\)/);
  assert.match(source, /json\(res,response\?\.status===401\?401:403,\{ok:false,error:'PLATFORM_ADMIN_REQUIRED'\}\)/);
  assert.match(source, /function adminServiceUnavailable\(res\)/);
  assert.match(source, /json\(res,503,\{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'\}\)/);
  assert.match(source, /if\(!context\.key\)return adminServiceUnavailable\(res\)/);
  assert.match(source, /serviceRpc\(context\.key/);
});