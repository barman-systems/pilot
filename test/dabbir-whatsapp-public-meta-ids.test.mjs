import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('DABBIR keeps non-secret Meta App and Embedded Signup IDs in one public registry', async () => {
  const registry = await read('api/_dabbir-meta-public-config.js');
  assert.match(registry, /1876008666699823/);
  assert.match(registry, /1984552462260787/);
  assert.match(registry, /dabbir_platform_registry/);
  assert.doesNotMatch(registry, /APP_SECRET|access_token|Bearer\s/i);
});

test('Embedded Signup config and completion both apply the DABBIR public Meta registry', async () => {
  const config = await read('api/dabbir-whatsapp-embedded-config.js');
  const complete = await read('api/dabbir-whatsapp-embedded-complete.js');
  for (const source of [config, complete]) {
    assert.match(source, /applyDabbirMetaPublicIdentifiers/);
    assert.match(source, /await resolveEmbeddedPlatformConfig\(\)/);
  }
  assert.match(config, /app_secret_configured/);
  assert.match(config, /config_id_source/);
  assert.match(complete, /if \(!platform\.ready\)/);
});
