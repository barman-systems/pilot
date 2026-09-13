import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueHarness } from './fixtures/understanding/dialogue-harness.mjs';
import { ids } from './fixtures/understanding/cases.mjs';

const service = (id, name, price, extra = {}) => ({
  id, business_id: ids.business, branch_id: ids.branch,
  name_ar: name, name_en: name, price, duration_minutes: 35, ...extra,
});
const second = '60000000-0000-4000-8000-000000000002';
const foreign = '60000000-0000-4000-8000-000000000003';

test('live service presentation uses current tenant facts and persists receipt-bound choices', async () => {
  const h = dialogueHarness({ services: [service(ids.service, 'Custom Alpha', 41), service(second, 'Custom Beta', 87)] });
  const r = await h.turn('what services do you have?');
  assert.equal(r.result.action, 'SERVICE_MENU');
  assert.match(r.reply, /Custom Alpha.*41 AED/);
  assert.match(r.reply, /Custom Beta.*87 AED/);
  const writes = h.calls.filter(c => c.name === 'dabbir_semantic_set_pending_v2');
  assert.deepEqual(writes.map(c => c.args.p_payload.presented), [false, true]);
  assert.equal(writes[1].args.p_payload.provider_message_id, 'receipt-1');
  assert.deepEqual(writes[1].args.p_payload.services.map(s => s.id), [ids.service, second]);
  assert.ok(writes.every(c => c.args.p_version === 1 && c.args.p_lock_token === 'lock'));
});

test('foreign tenant and foreign branch services never enter presented choices', async () => {
  const h = dialogueHarness({ services: [
    service(ids.service, 'Allowed', 41),
    service(second, 'Foreign tenant', 87, { business_id: ids.other }),
    service(foreign, 'Foreign branch', 123, { branch_id: ids.other }),
  ] });
  const r = await h.turn('شو عندكم');
  assert.match(r.reply, /Allowed/);
  assert.doesNotMatch(r.reply, /Foreign tenant|Foreign branch/);
  for (const c of h.calls.filter(c => c.name === 'dabbir_semantic_set_pending_v2')) {
    assert.deepEqual(c.args.p_payload.services.map(s => s.id), [ids.service]);
  }
});

test('ordinal selection uses the displayed service and asks the activity-required fact before booking', async () => {
  const h = dialogueHarness();
  await h.turn('شو عندكم');
  const r = await h.turn('الثاني');
  assert.equal(r.state.entities.service.value, second);
  assert.equal(r.result.action, 'CLARIFY');
  assert.match(r.reply, /السيارة/);
  assert.equal(h.calls.some(c => c.name === 'dabbir_semantic_execute_v2'), false);
});

test('a removed displayed service cannot silently shift its ordinal onto another service', async () => {
  const h = dialogueHarness({ services: [service(ids.service, 'First', 41), service(second, 'Second', 87), service(foreign, 'Third', 123)] });
  await h.turn('شو عندكم');
  h.c.services = h.c.services.filter(s => s.id !== second);
  const r = await h.turn('الثاني');
  assert.notEqual(r.state.entities.service?.value, foreign);
  assert.equal(h.calls.some(c => c.name === 'dabbir_semantic_execute_v2'), false);
});

test('price discovery stays read-only and uses persisted business prices', async () => {
  const h = dialogueHarness();
  await h.turn('شو عندكم');
  const r = await h.turn('كم سعر الخارجي؟');
  assert.match(r.reply, /40 AED/);
  assert.match(r.reply, /100 AED/);
  assert.equal(h.calls.some(c => c.name === 'dabbir_semantic_execute_v2'), false);
});
