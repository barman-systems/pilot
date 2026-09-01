import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('WhatsApp embedded signup coalesces concurrent config requests', async () => {
  const source = await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(source, /let configInFlight=null;/);
  assert.match(source, /if\(configInFlight&&configInFlightBusinessId===bid\) return configInFlight;/);
  assert.match(source, /CONFIG_CACHE_MS=60\*1000/);
  assert.match(source, /CONFIG_FAILURE_CACHE_MS=10\*1000/);
});

test('calendar connection endpoint only logs server failures as errors', async () => {
  const source = await read('api/calendar-connections.js');
  assert.match(source, /if\(status>=500\) console\.error\('dabbir_calendar_connections_failed'/);
  assert.doesNotMatch(source, /catch\(error\)\{\s*console\.error\('dabbir_calendar_connections_failed'/);
});
