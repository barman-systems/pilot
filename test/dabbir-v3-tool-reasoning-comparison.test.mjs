import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scoreCurrentV3Case,scorePrototypeCase,summarizeBenchmark} from '../api/_dabbir-v3-reasoning-benchmark.js';
const cases=JSON.parse(await readFile(new URL('./fixtures/dabbir-v3-tool-reasoning-benchmark-v1.json',import.meta.url),'utf8'));

test('prototype never gains mutation authority in frozen benchmark',()=>{
  const rows=cases.map(c=>scorePrototypeCase(c));
  const summary=summarizeBenchmark(rows);
  assert.equal(summary.wrong_mutations,0);
  assert.equal(summary.unsupported_assumptions,0);
});

test('early-morning canary changes from forced clarify to grounded-read attempt without inventing time',()=>{
  const c=cases.find(x=>x.id==='temporal-early');
  assert.equal(scoreCurrentV3Case(c).outcome,'CLARIFY');
  assert.equal(scorePrototypeCase(c).outcome,'NEEDS_BROADER_READ');
  const withFacts=scorePrototypeCase(c,{grounding:{slots:[{local_start:'2026-09-16T07:30:00',service_id:'svc'}]}});
  assert.equal(withFacts.outcome,'GROUNDED_OPTIONS');
});

test('prototype architecture removes all benchmark-marked forced-grounding clarifications',()=>{
  const current=summarizeBenchmark(cases.map(c=>scoreCurrentV3Case(c)));
  const proposed=summarizeBenchmark(cases.map(c=>scorePrototypeCase(c)));
  assert.ok(current.unnecessary_clarifications>0);
  assert.equal(proposed.unnecessary_clarifications,0);
});
