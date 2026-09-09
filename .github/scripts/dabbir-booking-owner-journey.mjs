import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The existing OIDC cleanup checks the complete business name against this label.
const QA_LABEL = /^DABBIR AI QA [A-Za-z0-9-]{6,90}$/;
const fail = (condition, code) => { if (!condition) throw new Error(code); };
const endpoint = (path, query) => `${path}?${new URLSearchParams(query)}`;

function accepted(result, code) {
  fail(result?.ok && result.json?.ok === true, `${code}_HTTP_${Number(result?.status || 0)}`);
  return result.json;
}

function denied(result, status, code) {
  fail(result?.status === status && !result.ok && result.json?.ok === false && result.json?.error === code,
    `BOOKING_EXPECTED_${code}_HTTP_${Number(result?.status || 0)}`);
}

function dayKey(stamp, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDay(day, days) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/**
 * Opt-in API journey for the existing disposable QA owner/employee sessions.
 * No requests run on import. The caller owns cleanup in its outer finally block;
 * every returned tenant ID is registered before validation or any further request.
 * No phone, integration, external-message or calendar-sync endpoint is used.
 */
export async function runBookingOwnerJourney({
  ownerSession, employeeSession, runLabel, registerBusinessCleanup, now = Date.now,
}) {
  fail(QA_LABEL.test(String(runLabel || '')), 'BOOKING_QA_RUN_LABEL_REQUIRED');
  fail(typeof registerBusinessCleanup === 'function', 'BOOKING_CLEANUP_REGISTRY_REQUIRED');
  fail(typeof ownerSession?.request === 'function' && typeof employeeSession?.request === 'function'
    && ownerSession !== employeeSession, 'BOOKING_DISTINCT_QA_SESSIONS_REQUIRED');

  const get = (session, path, query) => session.request(endpoint(path, query), { retry: false });
  const post = (session, path, body, headers = {}) => session.request(path, {
    method: 'POST', body, headers, retry: false,
  });
  async function createQaBusiness() {
    // Business creation has no idempotency contract: never let Session retry it.
    const response = await post(ownerSession, '/api/gcc-create-business', {
      action: 'create_business', name: runLabel, business_type: 'services', country_code: 'AE', locale: 'ar-AE',
    });
    const id = response?.json?.business_id;
    if (UUID.test(String(id || ''))) await registerBusinessCleanup(id);
    const created = accepted(response, 'BOOKING_QA_BUSINESS_CREATE');
    fail(UUID.test(String(id || '')), 'BOOKING_QA_BUSINESS_ID_REQUIRED');
    fail(created.business?.id === id && created.business.country_code === 'AE' && created.business.currency_code === 'AED'
      && created.business.timezone === 'Asia/Dubai' && created.business.locale === 'ar-AE', 'BOOKING_QA_MARKET_PROFILE_UNVERIFIED');
    const saved = accepted(await get(ownerSession, '/api/dabbir-runtime-fast', { business_id: id, summary: '1' }), 'BOOKING_QA_BUSINESS_READ');
    fail(saved.business?.id === id && saved.business.name === runLabel && saved.business.business_type === 'services'
      && saved.business.demo_mode === false && saved.membership?.role === 'owner', 'BOOKING_QA_BUSINESS_SCOPE_UNVERIFIED');
    const context = accepted(await get(ownerSession, '/api/branch-context', { business_id: id }), 'BOOKING_BRANCH_CONTEXT');
    fail(context.business_id === id && context.role === 'owner' && context.all_allowed === true,
      'BOOKING_OWNER_BRANCH_SCOPE_UNVERIFIED');
    fail(Array.isArray(context.branches) && context.branches.length === 1,
      'BOOKING_FRESH_QA_PRIMARY_BRANCH_REQUIRED');
    const branch = context.branches[0];
    fail(UUID.test(String(branch?.id || '')) && branch.business_id === id && branch.status === 'active',
      'BOOKING_BRANCH_TENANT_MISMATCH');
    return { id, branch };
  }

  const business = await createQaBusiness();
  // A second disposable tenant proves rejection of a real foreign branch, rather
  // than treating an arbitrary nonexistent UUID as evidence of tenant isolation.
  const foreign = await createQaBusiness();
  fail(foreign.id !== business.id && foreign.branch.id !== business.branch.id, 'BOOKING_FOREIGN_QA_SCOPE_REQUIRED');

  const start = new Date(now() + 3600_000);
  start.setUTCSeconds(37, 0); // Nonzero seconds detect accidental minute truncation.
  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + 45 * 60_000).toISOString();
  const createBody = {
    business_id: business.id, branch_id: business.branch.id, idempotency_key: randomUUID(),
    customer_name: `QA Booking ${runLabel.slice('DABBIR AI QA '.length)}`, starts_at: startsAt,
    details: { status: 'requested', duration: 45, notes: 'Disposable CI booking; no external delivery.' },
  };
  const create = (session, body) => post(session, '/api/adaptive-appointment', body, { 'x-dabbir-client': 'web' });

  denied(await create(employeeSession, { ...createBody, idempotency_key: randomUUID() }), 403, 'BUSINESS_ACCESS_DENIED');
  denied(await create(ownerSession, { ...createBody, branch_id: foreign.branch.id, idempotency_key: randomUUID() }), 404, 'BRANCH_NOT_FOUND');

  const created = accepted(await create(ownerSession, createBody), 'BOOKING_CREATE');
  const appointmentId = created.appointment?.id, customerId = created.appointment?.customer_id;
  fail(UUID.test(String(appointmentId || '')) && UUID.test(String(customerId || '')), 'BOOKING_ENTITY_IDS_REQUIRED');
  function verifyAppointment(row, expectedStatus) {
    fail(row?.id === appointmentId && row.customer_id === customerId && row.business_id === business.id
      && row.branch_id === business.branch.id, 'BOOKING_PERSISTED_ENTITY_SCOPE_MISMATCH');
    fail(row.status === expectedStatus && row.simulated === false, 'BOOKING_PERSISTED_STATUS_MISMATCH');
    fail(Date.parse(row.starts_at) === Date.parse(startsAt) && Date.parse(row.ends_at) === Date.parse(endsAt),
      'BOOKING_TIME_OR_DURATION_CHANGED');
    fail(new Date(row.starts_at).getUTCSeconds() === 37 && new Date(row.ends_at).getUTCSeconds() === 37,
      'BOOKING_SECONDS_TRUNCATED');
  }
  verifyAppointment(created.appointment, 'requested');
  const replay = accepted(await create(ownerSession, createBody), 'BOOKING_REPLAY');
  fail(replay.idempotent_replay === true, 'BOOKING_IDEMPOTENT_REPLAY_UNVERIFIED');
  verifyAppointment(replay.appointment, 'requested');

  const scope = { business_id: business.id, branch_id: business.branch.id };
  const from = dayKey(startsAt, business.branch.timezone || 'Asia/Dubai'), to = shiftDay(from, 1);
  const readBookings = async (view, dates = { from, to }) => {
    const data = accepted(await get(ownerSession, '/api/appointment-management', { ...scope, scope: view, ...dates }), 'BOOKING_READ');
    fail(data.business_id === business.id && data.branch_id === business.branch.id && data.scope === view
      && Array.isArray(data.appointments) && Array.isArray(data.customers), 'BOOKING_READ_SCOPE_UNVERIFIED');
    return data;
  };
  const verifyOnlyBooking = (data, status) => {
    fail(data.appointments.length === 1 && data.total === 1 && data.has_more === false, 'BOOKING_DUPLICATE_OR_MISSING_RECORD');
    verifyAppointment(data.appointments[0], status);
    fail(data.customers.length === 1 && data.customers[0].id === customerId
      && data.customers[0].display_name === createBody.customer_name, 'BOOKING_CUSTOMER_LINK_UNVERIFIED');
  };
  const verifyExactBooking = async (view, status) => {
    const data = accepted(await get(ownerSession, '/api/appointment-management', {
      ...scope, appointment_id: appointmentId, scope: view, from, to,
    }), 'BOOKING_EXACT_READ');
    fail(data.business_id === business.id && data.branch_id === business.branch.id && data.scope === view,
      'BOOKING_EXACT_READ_SCOPE_UNVERIFIED');
    verifyAppointment(data.appointment, status);
    fail(Array.isArray(data.customers) && data.customers.length === 1 && data.customers[0].id === customerId
      && data.customers[0].display_name === createBody.customer_name, 'BOOKING_EXACT_CUSTOMER_LINK_UNVERIFIED');
  };
  verifyOnlyBooking(await readBookings('current'), 'requested');
  await verifyExactBooking('current', 'requested');

  const verifyPriorities = async present => {
    for (const branch of ['all', business.branch.id]) {
      const data = accepted(await get(ownerSession, '/api/owner-action-center', { business_id: business.id, branch_id: branch }), 'BOOKING_PRIORITIES_READ');
      fail(data.business_id === business.id && data.branch_scope?.mode === (branch === 'all' ? 'all' : 'selected')
        && data.branch_scope.branch_id === (branch === 'all' ? null : branch)
        && Array.isArray(data.items), 'BOOKING_PRIORITIES_SCOPE_UNVERIFIED');
      const matches = data.items.filter(item => item.type === 'appointment' && item.entity_id === appointmentId);
      fail(matches.length === (present ? 1 : 0), present ? 'BOOKING_PRIORITY_MISSING' : 'BOOKING_COMPLETED_PRIORITY_STALE');
      if (present) fail(matches[0].target === 'appointments' && Date.parse(matches[0].due_at) === Date.parse(startsAt), 'BOOKING_PRIORITY_DESTINATION_UNVERIFIED');
    }
  };
  await verifyPriorities(true);
  denied(await get(employeeSession, '/api/owner-action-center', scope), 403, 'BUSINESS_ACCESS_DENIED');
  denied(await get(ownerSession, '/api/owner-action-center', { ...scope, branch_id: foreign.branch.id }), 404, 'BRANCH_NOT_FOUND');

  const updateBody = { action: 'update', ...scope, appointment_id: appointmentId };
  denied(await post(employeeSession, '/api/appointment-management', { ...updateBody, status: 'confirmed' }), 403, 'BUSINESS_ACCESS_DENIED');
  denied(await post(ownerSession, '/api/appointment-management', { ...updateBody, branch_id: foreign.branch.id, status: 'confirmed' }), 403, 'APPOINTMENT_BRANCH_MISMATCH');
  for (const status of ['confirmed', 'in_progress', 'completed']) {
    // Status-only edits must preserve both timestamps and the original duration.
    const result = accepted(await post(ownerSession, '/api/appointment-management', { ...updateBody, status }), 'BOOKING_STATUS_UPDATE');
    fail(result.state === 'VERIFIED_PERSISTED' && result.truth?.entity_id === appointmentId, 'BOOKING_STATUS_WRITE_UNVERIFIED');
    verifyAppointment(result.appointment, status);
    verifyOnlyBooking(await readBookings(status === 'completed' ? 'history' : 'current'), status);
  }
  await verifyExactBooking('history', 'completed');
  const current = await readBookings('current');
  fail(current.appointments.length === 0 && current.total === 0, 'BOOKING_COMPLETED_STILL_CURRENT');
  const previousDay = await readBookings('history', { from: shiftDay(from, -1), to: from });
  fail(previousDay.appointments.length === 0 && previousDay.total === 0, 'BOOKING_HISTORY_DATE_FILTER_IGNORED');
  await verifyPriorities(false);

  return {
    status: 200,
    detail: 'Disposable services booking: one appointment/customer after replay; employee and foreign branch denied; both priority scopes verified; confirm, start and complete persisted without changing seconds or duration; history date filter verified and completed priority removed.',
    checks: {
      idempotency: 'PASS', tenant_and_branch_isolation: 'PASS', priorities_all_and_selected: 'PASS',
      status_persistence: 'PASS', exact_record_current_and_history: 'PASS', exact_time_and_duration: 'PASS', history_date_filter: 'PASS', completed_priority_removed: 'PASS',
    },
  };
}
