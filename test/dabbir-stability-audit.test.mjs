import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const platformApi = await readFile(new URL('api/platform-customers.js', root), 'utf8');
const shell = await readFile(new URL('api/app-recovery.js', root), 'utf8');
const safariShell = await readFile(new URL('api/app-safari-recovery.js', root), 'utf8');
const uiBundles = JSON.parse(await readFile(new URL('config/dabbir-ui-bundles.json', root), 'utf8'));
const whatsappStatus = await readFile(new URL('api/dabbir-whatsapp-status.js', root), 'utf8');

function injectedApiScripts() {
  return [...uiBundles.critical, ...uiBundles.deferred];
}

test('platform capability is quiet and fail-closed while privileged operations retain admin enforcement', () => {
  const capabilityRouteIndex = platformApi.indexOf("if(req.method==='GET'&&action==='capability')return platformCapability(req,res)");
  const adminContextIndex = platformApi.indexOf('const context=await adminContext(req,res)');
  assert.ok(capabilityRouteIndex >= 0 && adminContextIndex > capabilityRouteIndex, 'capability probe must resolve before privileged admin context');
  assert.match(platformApi, /function quietCapability\(res,/);
  assert.match(platformApi, /return json\(res,200,/);
  assert.match(platformApi, /if\(!token\)return quietCapability\(res,\{reason:'AUTH_REQUIRED'\}\)/);
  assert.match(platformApi, /if\(!response\?\.ok\)return quietCapability\(res,\{authenticated:true,reason:'PLATFORM_ADMIN_REQUIRED'\}\)/);
  assert.match(platformApi, /role:allowed\?role:null/);
  assert.match(platformApi, /service_configured:allowed\?Boolean\(serviceConfigured\):false/);
  assert.match(platformApi, /const serviceConfigured=Boolean\(serviceKey\(\)\)/);
  assert.match(platformApi, /reason:serviceConfigured\?null:'SERVER_ADMIN_NOT_CONFIGURED'/);
  assert.match(platformApi, /if\(!context\.key\)return adminServiceUnavailable\(res\)/);
  assert.match(platformApi, /json\(res,response\?\.status===401\?401:403,\{ok:false,error:'PLATFORM_ADMIN_REQUIRED'\}\)/);
  assert.doesNotMatch(platformApi, /if\(!key\)\{json\(res,503,\{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'\}\);return null\}/);
});

test('authoritative shell injects every UI module exactly once and keeps auth stability last', async () => {
  const scripts = injectedApiScripts();
  assert.ok(scripts.length >= 20, 'expected the authoritative UI module stack');
  assert.equal(new Set(scripts).size, scripts.length, 'duplicate UI module injection detected');
  assert.equal(uiBundles.critical.at(-1), '/api/auth-session-stability-ui', 'auth stability must remain the final critical UI authority');
  assert.match(shell, /dabbir-ui-critical\.js/);
  assert.match(shell, /dabbir-ui-deferred\.js/);

  await Promise.all(scripts.map(async src => {
    const relative = `${src.slice(1)}.js`;
    await access(new URL(relative, root));
  }));
});

test('tenant WhatsApp status cannot inherit a global server phone identity', () => {
  assert.match(whatsappStatus, /authenticated DABBIR UI must never inherit a global\/server WhatsApp/i);
  assert.match(whatsappStatus, /businessIds\.length === 1/);
  assert.match(whatsappStatus, /BUSINESS_CONTEXT_REQUIRED/);
  assert.match(whatsappStatus, /TENANT_WHATSAPP_NOT_LINKED/);
});

test('root routing remains pinned to the recovery-authoritative shell', async () => {
  const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  assert.ok(Array.isArray(vercel.routes));
  assert.ok(Array.isArray(vercel.rewrites));
  assert.ok(vercel.routes.some(route => route?.src === '^/$' && route?.dest === '/api/app-safari-recovery'));
  assert.ok(vercel.rewrites.some(rewrite => rewrite?.source === '/' && rewrite?.destination === '/api/app-safari-recovery'));
  assert.match(safariShell, /import appRecoveryHandler from '\.\/app-recovery\.js'/);
  assert.match(safariShell, /x-dabbir-ui-cache-bust/);
});
