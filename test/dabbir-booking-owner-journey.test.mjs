import test from 'node:test';
import assert from 'node:assert/strict';
import { runBookingOwnerJourney } from '../.github/scripts/dabbir-booking-owner-journey.mjs';

const RUN_LABEL = 'DABBIR AI QA 20260908-booking-ci';
const NOW = Date.parse('2026-09-08T19:59:59.123Z'); // The future booking is on the next Dubai date.
const BUSINESS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const BRANCH = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const APPOINTMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json });
const denial = (error, status) => response({ ok: false, error }, status);

// This fixture tests the helper's request sequence and failure/cleanup contract.
// It deliberately does not import or emulate the database implementation.
function harness({ throwAt, mutateResponse } = {}) {
  const events = [], created = [], registered = [], cleaned = [], requests = [];
  let appointment = null, customerName = null, idempotencyKey = null;
  function answer(actor, url, options) {
    const { pathname, searchParams: query } = new URL(url, 'https://fixture.invalid');
    const body = options.body;
    if (pathname === '/api/gcc-create-business' && body?.action === 'create_business') {
      assert.equal(actor, 'owner');assert.equal(body.name, RUN_LABEL);assert.equal(body.business_type, 'services');
      assert.equal(body.country_code, 'AE');assert.equal(body.locale, 'ar-AE');
      const id = BUSINESS[created.length];assert.ok(id, 'only two disposable tenants are created');created.push(id);
      return response({ ok: true, business_id: id,
        business: { id, country_code: 'AE', currency_code: 'AED', timezone: 'Asia/Dubai', locale: 'ar-AE' } });
    }
    if (pathname === '/api/dabbir-runtime-fast') {
      const id = query.get('business_id');assert.ok(created.includes(id));
      return response({ ok: true, business: { id, name: RUN_LABEL, business_type: 'services', demo_mode: false }, membership: { role: 'owner' } });
    }
    if (pathname === '/api/branch-context') {
      const index = BUSINESS.indexOf(query.get('business_id'));assert.notEqual(index, -1);
      return response({ ok: true, business_id: BUSINESS[index], role: 'owner', all_allowed: true,
        branches: [{ id: BRANCH[index], business_id: BUSINESS[index], status: 'active', timezone: 'Asia/Dubai' }] });
    }
    if (pathname === '/api/adaptive-appointment') {
      if (actor === 'employee') return denial('BUSINESS_ACCESS_DENIED', 403);
      if (body.branch_id !== BRANCH[0]) return denial('BRANCH_NOT_FOUND', 404);
      const replay = body.idempotency_key === idempotencyKey;
      if (!replay) {
        assert.equal(appointment, null, 'unexpected extra booking creation');
        idempotencyKey = body.idempotency_key;customerName = body.customer_name;
        appointment = { id: APPOINTMENT, business_id: BUSINESS[0], branch_id: BRANCH[0], customer_id: CUSTOMER,
          starts_at: body.starts_at, ends_at: new Date(Date.parse(body.starts_at) + 45 * 60_000).toISOString(),
          status: 'requested', simulated: false };
      }
      return response({ ok: true, appointment: { ...appointment }, idempotent_replay: replay });
    }
    if (pathname === '/api/appointment-management') {
      if (options.method === 'POST') {
        if (actor === 'employee') return denial('BUSINESS_ACCESS_DENIED', 403);
        if (body.branch_id !== BRANCH[0]) return denial('APPOINTMENT_BRANCH_MISMATCH', 403);
        appointment.status = body.status;
        return response({ ok: true, appointment: { ...appointment }, state: 'VERIFIED_PERSISTED', truth: { entity_id: APPOINTMENT } });
      }
      const view = query.get('scope');
      const included = query.get('from') === '2026-09-09' && query.get('to') === '2026-09-10'
        && (view === 'history' ? appointment.status === 'completed' : appointment.status !== 'completed');
      if (query.has('appointment_id')) {
        assert.equal(query.get('appointment_id'), APPOINTMENT);
        if (!included) return denial('APPOINTMENT_NOT_FOUND', 404);
        return response({ ok: true, business_id: BUSINESS[0], branch_id: BRANCH[0], scope: view,
          appointment: { ...appointment }, customers: [{ id: CUSTOMER, display_name: customerName }] });
      }
      return response({ ok: true, business_id: BUSINESS[0], branch_id: BRANCH[0], scope: view,
        appointments: included ? [{ ...appointment }] : [], total: included ? 1 : 0, has_more: false,
        customers: included ? [{ id: CUSTOMER, display_name: customerName }] : [] });
    }
    if (pathname === '/api/owner-action-center') {
      if (actor === 'employee') return denial('BUSINESS_ACCESS_DENIED', 403);
      const branch = query.get('branch_id');
      if (![BRANCH[0], 'all'].includes(branch)) return denial('BRANCH_NOT_FOUND', 404);
      return response({ ok: true, business_id: BUSINESS[0], branch_scope: { mode: branch === 'all' ? 'all' : 'selected', branch_id: branch === 'all' ? null : branch },
        items: appointment.status === 'completed' ? [] : [{ type: 'appointment', entity_id: APPOINTMENT, target: 'appointments', due_at: appointment.starts_at }] });
    }
    assert.fail(`Unexpected endpoint: ${pathname}`);
  }
  const session = actor => ({
    async request(path, options) {
      const call = { kind: 'request', actor, path, ...structuredClone(options) };
      requests.push(call);events.push(call);
      if (requests.length === throwAt) throw new Error('FIXTURE_NETWORK_FAILURE');
      const result = answer(actor, path, options);
      return mutateResponse?.(call, result) || result;
    },
  });
  const options = { ownerSession: session('owner'), employeeSession: session('employee'), runLabel: RUN_LABEL,
    now: () => NOW, async registerBusinessCleanup(id) { registered.push(id);events.push({ kind: 'register', id }); } };
  async function runWithCallerCleanup() {
    try { return await runBookingOwnerJourney(options); }
    finally { for (const id of registered) cleaned.push(id); }
  }
  return { options, events, requests, created, registered, cleaned, runWithCallerCleanup };
}

test('booking helper registers each tenant immediately and makes only the intended disposable API journey', async () => {
  const h = harness(), result = await h.runWithCallerCleanup();
  assert.equal(result.status, 200);assert.equal(result.checks.completed_priority_removed, 'PASS');
  assert.deepEqual(h.created, BUSINESS);assert.deepEqual(h.registered, BUSINESS);assert.deepEqual(h.cleaned, BUSINESS);
  h.events.forEach((event, index) => {
    if (event.kind === 'request' && event.body?.action === 'create_business') {
      assert.equal(h.events[index + 1].kind, 'register', 'no read or validation can delay cleanup registration');
    }
  });
  assert.ok(h.requests.every(call => call.retry === false), 'business creation and status changes cannot be retried invisibly');
  const creations = h.requests.filter(call => call.path === '/api/adaptive-appointment');
  assert.equal(creations.length, 4);
  assert.equal(creations[0].actor, 'employee');assert.equal(creations[1].body.branch_id, BRANCH[1]);
  assert.deepEqual(creations[2].body, creations[3].body, 'replay must send exactly the same payload');
  for (const request of creations) {
    assert.match(request.body.idempotency_key, UUID);assert.equal(request.headers['x-dabbir-client'], 'web');
    assert.equal(request.body.details.phone, undefined);assert.equal(request.body.customer_id, undefined);
  }
  assert.equal(new Set(creations.map(call => call.body.idempotency_key)).size, 3);
  assert.equal(creations[2].body.starts_at, '2026-09-08T20:59:37.000Z');
  const updates = h.requests.filter(call => call.path === '/api/appointment-management' && call.method === 'POST'
    && call.actor === 'owner' && call.body.branch_id === BRANCH[0]);
  assert.deepEqual(updates.map(call => call.body.status), ['confirmed', 'in_progress', 'completed']);
  for (const update of updates) { assert.equal(update.body.starts_at, undefined);assert.equal(update.body.ends_at, undefined); }
  assert.equal(h.requests.at(-1).path, `/api/owner-action-center?business_id=${BUSINESS[0]}&branch_id=${BRANCH[0]}`);
  assert.ok(h.requests.some(call => call.path.includes('scope=history&from=2026-09-08&to=2026-09-09')));
  const exactReads = h.requests.filter(call => call.path.includes(`appointment_id=${APPOINTMENT}`));
  assert.equal(exactReads.length, 2);
  assert.match(exactReads[0].path, /scope=current/);assert.match(exactReads[1].path, /scope=history/);
  assert.equal(result.checks.exact_record_current_and_history, 'PASS');
});

test('a failure at any request stops the sequence and the caller can clean every created tenant', async () => {
  const baseline = harness();await baseline.runWithCallerCleanup();
  for (let throwAt = 1; throwAt <= baseline.requests.length; throwAt++) {
    const h = harness({ throwAt });
    await assert.rejects(h.runWithCallerCleanup(), /FIXTURE_NETWORK_FAILURE/);
    assert.equal(h.requests.length, throwAt, 'do not continue mutating after a failed verification');
    assert.deepEqual(h.registered, h.created, `cleanup registration missing at request ${throwAt}`);
    assert.deepEqual(h.cleaned, h.created, `caller cleanup missing at request ${throwAt}`);
  }
});

test('even an unsuccessful create response containing its tenant ID registers cleanup before failing', async () => {
  const h = harness({ mutateResponse(call, result) {
    if (call.body?.action === 'create_business') return { ...result, ok: false, status: 502, json: { ...result.json, ok: false } };
  } });
  await assert.rejects(h.runWithCallerCleanup(), /BOOKING_QA_BUSINESS_CREATE_HTTP_502/);
  assert.equal(h.requests.length, 1);assert.deepEqual(h.cleaned, [BUSINESS[0]]);
});

test('unsafe label, absent cleanup registration or shared sessions fail before any request', async () => {
  for (const change of [{ runLabel: 'Real customer business' }, { runLabel: RUN_LABEL + ' bookings' },
    { registerBusinessCleanup: undefined }, { employeeSession: null }]) {
    const h = harness();Object.assign(h.options, change);
    await assert.rejects(h.runWithCallerCleanup(), /BOOKING_/);assert.equal(h.requests.length, 0);
  }
  const h = harness();h.options.employeeSession = h.options.ownerSession;
  await assert.rejects(h.runWithCallerCleanup(), /BOOKING_DISTINCT_QA_SESSIONS_REQUIRED/);assert.equal(h.requests.length, 0);
});

test('wrong replay identity and an accepted unauthorized write fail closed with cleanup retained', async () => {
  for (const mode of ['replay', 'permission']) {
    const h = harness({ mutateResponse(call, result) {
      if (mode === 'replay' && result.json.idempotent_replay) result.json.appointment.customer_id = BRANCH[1];
      if (mode === 'permission' && call.path === '/api/adaptive-appointment' && call.actor === 'employee') return response({ ok: true });
    } });
    await assert.rejects(h.runWithCallerCleanup(), mode === 'replay' ? /BOOKING_PERSISTED_ENTITY_SCOPE_MISMATCH/ : /BOOKING_EXPECTED_BUSINESS_ACCESS_DENIED/);
    assert.deepEqual(h.cleaned, BUSINESS);
    assert.equal(h.requests.some(call => call.path === '/api/appointment-management' && call.method === 'POST'), false);
  }
});

test('false status success, minute truncation and a stale completed priority never produce PASS', async () => {
  for (const mode of ['status', 'seconds', 'priority']) {
    let completed = false;
    const h = harness({ mutateResponse(call, result) {
      if (call.path === '/api/appointment-management' && call.method === 'POST' && result.ok) {
        if (mode === 'status') result.json.appointment.status = 'requested';
        if (mode === 'seconds') result.json.appointment.starts_at = '2026-09-08T20:59:00.000Z';
        if (call.body.status === 'completed') completed = true;
      }
      if (mode === 'priority' && completed && call.path.startsWith('/api/owner-action-center?')) {
        result.json.items.push({ type: 'appointment', entity_id: APPOINTMENT });
      }
    } });
    await assert.rejects(h.runWithCallerCleanup(), mode === 'status' ? /BOOKING_PERSISTED_STATUS_MISMATCH/
      : mode === 'seconds' ? /BOOKING_TIME_OR_DURATION_CHANGED/ : /BOOKING_COMPLETED_PRIORITY_STALE/);
    assert.deepEqual(h.cleaned, BUSINESS);
  }
});

test('an exact record read returning a different appointment fails before any status change', async () => {
  const h = harness({ mutateResponse(call, result) {
    if (call.path.includes(`appointment_id=${APPOINTMENT}`)) result.json.appointment.id = BRANCH[1];
  } });
  await assert.rejects(h.runWithCallerCleanup(), /BOOKING_PERSISTED_ENTITY_SCOPE_MISMATCH/);
  assert.deepEqual(h.cleaned, BUSINESS);
  assert.equal(h.requests.some(call => call.path === '/api/appointment-management' && call.method === 'POST'), false);
});
