import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('api/owner-operations.js', root), 'utf8');

test('owner operations uses WHATWG query parsing instead of legacy req.query', () => {
  assert.match(source, /new URL\(String\(req\?\.url \|\| '\/'\), 'https:\/\/dabbir\.invalid'\)/);
  assert.match(source, /url\.searchParams\.getAll\(name\)/);
  assert.doesNotMatch(source, /req\.query/);
  assert.match(source, /singleQueryValue\(req,'business_id'\)/);
});
