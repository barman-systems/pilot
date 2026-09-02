import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { singleQueryValue } from '../api/_request-query.js';

const root = new URL('../', import.meta.url);
const guardedFiles = [
  "api/dabbir-ai.js",
  "api/chat-customer.js",
  "api/team/members.js",
  "api/dabbir-whatsapp-embedded-config.js",
  "api/team/invitations.js",
  "api/business-profile.js",
  "api/activity-tasks.js",
  "api/dabbir-runtime.js",
  "api/dabbir-whatsapp-status.js",
  "api/dabbir-whatsapp-webhook.js",
  "api/owner-action-center.js",
  "api/calendar-oauth-start.js",
  "api/calendar-oauth-callback.js",
  "api/calendar-sync.js",
  "api/calendar-connections.js",
  "api/service-catalog.js",
  "api/clinic-operations.js",
  "api/salon-operations.js"
];

test('singleQueryValue uses WHATWG parsing and fails closed for duplicate or invalid values', () => {
  assert.equal(singleQueryValue({ url: '/api/example?business_id=abc' }, 'business_id'), 'abc');
  assert.equal(singleQueryValue({ url: '/api/example?business_id=abc&business_id=def' }, 'business_id'), null);
  assert.equal(singleQueryValue({ url: 'http://[invalid' }, 'business_id'), null);
  assert.equal(singleQueryValue({}, 'business_id'), null);
});

test('DABBIR runtime endpoints do not access Vercel legacy req.query', async () => {
  for (const path of guardedFiles) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.doesNotMatch(source, /req\.query/, path);
  }
});

test('calendar OAuth and connection endpoints use the guarded WHATWG parser', async () => {
  for (const path of ['api/calendar-oauth-start.js','api/calendar-oauth-callback.js','api/calendar-sync.js','api/calendar-connections.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /singleQueryValue\(req,/u, path);
  }
});

test('calendar OAuth endpoints reserve error telemetry for server failures', async () => {
  for (const path of ['api/calendar-oauth-start.js','api/calendar-oauth-callback.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /if\(status>=500\)console\.error/u, path);
    assert.match(source, /else if\(status===429\)console\.warn/u, path);
    assert.match(source, /else console\.info/u, path);
  }
});

test('salon and clinic query helpers parse req.url with WHATWG URL semantics', async () => {
  for (const path of ['api/salon-operations.js','api/clinic-operations.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /new URL\(String\(req\?\.url\|\|'\/'\),'https:\/\/dabbir\.invalid'\)/u, path);
    assert.match(source, /searchParams\.getAll\(key\)/u, path);
  }
});

test('WhatsApp verification reads the three Meta challenge parameters through the guarded parser', async () => {
  const source = await readFile(new URL('api/dabbir-whatsapp-webhook.js', root), 'utf8');
  assert.match(source, /singleQueryValue\(req, 'hub\.mode'\)/);
  assert.match(source, /singleQueryValue\(req, 'hub\.verify_token'\)/);
  assert.match(source, /singleQueryValue\(req, 'hub\.challenge'\)/);
});
