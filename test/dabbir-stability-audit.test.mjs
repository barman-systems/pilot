import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const platformApi = await readFile(new URL('api/platform-customers.js', root), 'utf8');
const shell = await readFile(new URL('api/app-recovery.js', root), 'utf8');
const whatsappStatus = await readFile(new URL('api/dabbir-whatsapp-status.js', root), 'utf8');

function injectedApiScripts(source) {
  return [...source.matchAll(/<script src=\"(\/api\/[^\"]+)\"><\/script>/g)].map(match => match[1]);
}

test('platform capability fails closed without emitting a capability 503', () => {
  assert.match(platformApi, /return \{user,role:admin\.role,key:serviceKey\(\)\}/);
  assert.match(platformApi, /if\(action==='capability'\)[\s\S]*serviceConfigured=Boolean\(context\.key\)/);
  assert.match(platformApi, /allowed:serviceConfigured/);
  assert.match(platformApi, /service_configured:serviceConfigured/);
  assert.match(platformApi, /reason:serviceConfigured\?null:'SERVER_ADMIN_NOT_CONFIGURED'/);
  assert.match(platformApi, /if\(!context\.key\)return adminServiceUnavailable\(res\)/);
  assert.doesNotMatch(platformApi, /if\(!key\)\{json\(res,503,\{ok:false,error:'SERVER_ADMIN_NOT_CONFIGURED'\}\);return null\}/);
});

test('authoritative shell injects every UI module exactly once and keeps auth stability last', async () => {
  const scripts = injectedApiScripts(shell);
  assert.ok(scripts.length >= 20, 'expected the authoritative UI module stack');
  assert.equal(new Set(scripts).size, scripts.length, 'duplicate UI module injection detected');
  assert.equal(scripts.at(-1), '/api/auth-session-stability-ui', 'auth stability must remain the final UI authority');

  await Promise.all(scripts.map(async src => {
    const relative = `${src.slice(1)}.js`;
    await access(new URL(relative, root));
  }));
});

test('tenant WhatsApp status cannot inherit a global server phone identity', () => {
  assert.match(whatsappStatus, /authenticated DABBIR UI must never inherit a global\/server WhatsApp/);
  assert.match(whatsappStatus, /businessIds\.length === 1/);
  assert.match(whatsappStatus, /BUSINESS_CONTEXT_REQUIRED/);
  assert.match(whatsappStatus, /TENANT_WHATSAPP_NOT_LINKED/);
});

test('root routing remains pinned to the recovery-authoritative shell', async () => {
  const vercel = await readFile(new URL('vercel.json', root), 'utf8');
  assert.match(vercel, /\"src\": \"\^\/\$\"[\s\S]*\"dest\": \"\/api\/app-recovery\"/);
  assert.match(vercel, /\"source\": \"\/\"[\s\S]*\"destination\": \"\/api\/app-recovery\"/);
});
