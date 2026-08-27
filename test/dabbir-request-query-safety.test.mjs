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
  "api/owner-action-center.js"
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

test('WhatsApp verification reads the three Meta challenge parameters through the guarded parser', async () => {
  const source = await readFile(new URL('api/dabbir-whatsapp-webhook.js', root), 'utf8');
  assert.match(source, /singleQueryValue\(req, 'hub\.mode'\)/);
  assert.match(source, /singleQueryValue\(req, 'hub\.verify_token'\)/);
  assert.match(source, /singleQueryValue\(req, 'hub\.challenge'\)/);
});
