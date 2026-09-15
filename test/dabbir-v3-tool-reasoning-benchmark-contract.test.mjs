import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cases=JSON.parse(await readFile(new URL('./fixtures/dabbir-v3-tool-reasoning-benchmark-v1.json',import.meta.url),'utf8'));

test('bounded reasoning benchmark is frozen at twenty cross-cutting cases',()=>{
  assert.equal(cases.length,20);
  assert.equal(new Set(cases.map(x=>x.id)).size,20);
});

test('benchmark covers safety, references, temporal reasoning, side questions and tool failure',()=>{
  const ids=new Set(cases.map(x=>x.id));
  for(const id of ['temporal-early','reference-same-car','service-fallback','slot-race','new-service-side-topic','conflicting-constraints','unsupported-service','tool-failure'])assert.ok(ids.has(id),id);
});

test('benchmark never encodes an invented numeric definition for human dayparts',()=>{
  const early=cases.find(x=>x.id==='temporal-early');
  assert.equal(early.expected.must_not_invent_exact_time,true);
  assert.equal(JSON.stringify(early).includes('06:00'),false);
  assert.equal(JSON.stringify(early).includes('09:00'),false);
});
