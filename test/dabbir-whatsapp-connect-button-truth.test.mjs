import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('blocked WhatsApp connect control stays clickable and explains missing Meta platform configuration', async () => {
  const guard = await read('api/dabbir-whatsapp-connect-guard-ui.js');
  assert.match(guard, /dabbirWhatsAppConnect/);
  assert.match(guard, /button\.disabled=false/);
  assert.match(guard, /platform_readiness/);
  assert.match(guard, /app_id_configured/);
  assert.match(guard, /app_secret_configured/);
  assert.match(guard, /embedded_config_id_configured/);
  assert.match(guard, /encryption_configured/);
  assert.match(guard, /لم يتم حفظ أي ربط ناقص/);
  assert.doesNotMatch(guard, /setInterval\(/);
});

test('direct OAuth owns every WhatsApp tap even when renderIntegrations recreates the button', async () => {
  const guard = await read('api/dabbir-whatsapp-connect-guard-ui.js');
  assert.match(guard, /CONNECT_SELECTOR/);
  assert.match(guard, /document\.addEventListener\('click',delegatedManualOauthClick,true\)/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /event\.stopPropagation\(\)/);
  assert.match(guard, /event\.stopImmediatePropagation\(\)/);
  assert.match(guard, /dabbirDirectOauthAuthority='document-capture-v1'/);
  assert.match(guard, /will not use the old FB\.login path/);
});

test('authoritative shell mounts the WhatsApp truth guard immediately after Embedded Signup UI', async () => {
  const shell = await read('api/app-recovery.js');
  const embedded = shell.indexOf('/api/dabbir-whatsapp-embedded-ui');
  const guard = shell.indexOf('/api/dabbir-whatsapp-connect-guard-ui');
  const timezone = shell.indexOf('/api/timezone-ui');
  assert.ok(embedded >= 0 && guard > embedded && timezone > guard);
});
