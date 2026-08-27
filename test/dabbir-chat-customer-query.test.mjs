import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const customerSource = await readFile(new URL('api/chat-customer.js', root), 'utf8');
const sendSource = await readFile(new URL('api/chat-send.js', root), 'utf8');

test('customer chat delegate does not touch legacy req.query when downstream does not use query', () => {
  assert.doesNotMatch(sendSource, /req\.query/);
  assert.doesNotMatch(customerSource, /req\.query/);
  assert.match(customerSource, /stream\.url=req\.url/);
  assert.match(customerSource, /chatSendHandler\(delegateRequest\(req,body\),res\)/);
});
