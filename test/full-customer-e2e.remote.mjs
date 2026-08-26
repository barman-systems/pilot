import crypto from 'node:crypto';
import fs from 'node:fs';

const PILOT_ORIGIN = 'https://pilot-taupe.vercel.app';
const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3';
const MAIL_API = 'https://api.mail.tm';
const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const report = {
  run_id: runId,
  target: PILOT_ORIGIN,
  synthetic_only: true,
  started_at: new Date().toISOString(),
  steps: [],
  cleanup: { user_ids: [], business_ids: [] },
};

function safeError(error) {
  return String(error?.message || error || 'unknown_error').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
}

function addStep(name, ok, details = {}) {
  report.steps.push({ name, ok, ...details });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${details.status ? ` [${details.status}]` : ''}`);
}

async function check(name, fn, { fatal = false } = {}) {
  try {
    const details = await fn();
    addStep(name, true, details && typeof details === 'object' ? details : {});
    return details;
  } catch (error) {
    addStep(name, false, { error: safeError(error) });
    if (fatal) throw error;
    return null;
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

class CookieJar {
  constructor() { this.cookies = new Map(); }
  absorb(response) {
    let values = [];
    if (typeof response.headers.getSetCookie === 'function') values = response.headers.getSetCookie();
    else {
      const raw = response.headers.get('set-cookie');
      if (raw) values = raw.split(/,(?=\s*__Host-)/g);
    }
    for (const line of values) {
      const pair = line.split(';', 1)[0];
      const i = pair.indexOf('=');
      if (i < 0) continue;
      const key = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value) this.cookies.set(key, value); else this.cookies.delete(key);
    }
  }
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  get(name) { const v = this.cookies.get(name); return v ? decodeURIComponent(v) : null; }
}

async function pilotRequest(path, { method = 'GET', body, jar, origin = PILOT_ORIGIN } = {}) {
  const headers = { accept: 'application/json', origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar?.header()) headers.cookie = jar.header();
  const response = await fetch(`${PILOT_ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  jar?.absorb(response);
  const payload = await readJson(response);
  return { response, payload };
}

async function supabaseRest(accessToken, resource, { method = 'GET', body, prefer = 'return=representation' } = {}) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers.prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readJson(response);
  return { response, payload };
}

async function mailFetch(path, options = {}, token = null) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${MAIL_API}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`mail_api_${response.status}_${path}`);
  return { response, payload: await readJson(response) };
}

async function createMailbox(label) {
  const { payload: domains } = await mailFetch('/domains?page=1');
  const list = domains?.['hydra:member'] || domains?.member || [];
  const domain = list.find(d => d.isActive !== false && d.isPrivate !== true)?.domain || list.find(d => d.isActive !== false)?.domain;
  must(domain, 'mail_domain_unavailable');
  const local = `pilot-e2e-${label}-${crypto.randomBytes(5).toString('hex')}`.slice(0, 50);
  const address = `${local}@${domain}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const { payload: account } = await mailFetch('/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
  const { payload: tokenPayload } = await mailFetch('/token', { method: 'POST', body: JSON.stringify({ address, password }) });
  must(account?.id && tokenPayload?.token, 'mailbox_creation_failed');
  return { id: account.id, address, password, token: tokenPayload.token };
}

function extractVerificationLink(message) {
  const raw = JSON.stringify({ html: message?.html, text: message?.text, intro: message?.intro });
  const normalized = raw.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const urls = normalized.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return urls.map(u => u.replace(/[\\,}\]]+$/g, '')).find(u => u.includes('/auth/v1/verify') || u.includes('token_hash=')) || null;
}

async function confirmMailbox(mailbox) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const { payload } = await mailFetch('/messages?page=1', {}, mailbox.token);
    const messages = payload?.['hydra:member'] || payload?.member || [];
    for (const summary of messages) {
      const { payload: message } = await mailFetch(`/messages/${summary.id}`, {}, mailbox.token);
      const link = extractVerificationLink(message);
      if (!link) continue;
      const response = await fetch(link, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 400) return true;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('verification_email_timeout');
}

async function deleteMailbox(mailbox) {
  try { await mailFetch(`/accounts/${mailbox.id}`, { method: 'DELETE' }, mailbox.token); } catch {}
}

async function createVerifiedPilotUser(label) {
  const mailbox = await createMailbox(label);
  const password = `P!${crypto.randomBytes(24).toString('base64url')}`;
  const signupJar = new CookieJar();
  const signup = await pilotRequest('/api/auth/signup', { method: 'POST', body: { email: mailbox.address, password }, jar: signupJar });
  must([201, 202].includes(signup.response.status), `signup_status_${signup.response.status}`);
  must(signup.payload?.ok === true, 'signup_not_ok');
  if (!signup.payload?.authenticated) await confirmMailbox(mailbox);

  const jar = new CookieJar();
  const login = await pilotRequest('/api/auth/login', { method: 'POST', body: { email: mailbox.address, password }, jar });
  must(login.response.status === 200 && login.payload?.authenticated === true, `login_failed_${login.response.status}`);
  const session = await pilotRequest('/api/auth/session', { jar });
  must(session.response.status === 200 && session.payload?.authenticated === true && session.payload?.user?.id, 'session_failed');
  report.cleanup.user_ids.push(session.payload.user.id);
  return { mailbox, password, jar, user: session.payload.user, accessToken: jar.get('__Host-pilot_access') };
}

async function logoutAndRelogin(user) {
  const logout = await pilotRequest('/api/auth/logout', { method: 'POST', body: {}, jar: user.jar });
  must(logout.response.status === 200 && logout.payload?.authenticated === false, 'logout_failed');
  const after = await pilotRequest('/api/auth/session', { jar: user.jar });
  must(after.response.status === 401 && after.payload?.authenticated === false, 'session_survived_logout');
  const login = await pilotRequest('/api/auth/login', { method: 'POST', body: { email: user.mailbox.address, password: user.password }, jar: user.jar });
  must(login.response.status === 200 && login.payload?.authenticated === true, 'relogin_failed');
  user.accessToken = user.jar.get('__Host-pilot_access');
}

function one(payload, label) {
  must(Array.isArray(payload) && payload.length === 1, `${label}_representation_missing`);
  return payload[0];
}

let owner, employee, outsider, businessA, businessB, customer, service, conversation, channel;
let fatalError = null;

try {
  await check('AUTH unauthenticated session returns 401', async () => {
    const { response, payload } = await pilotRequest('/api/auth/session');
    must(response.status === 401 && payload?.authenticated === false, `unexpected_${response.status}`);
    return { status: response.status };
  });

  await check('AUTH invalid credentials fail closed', async () => {
    const { response } = await pilotRequest('/api/auth/login', { method: 'POST', body: { email: `missing-${runId}@example.invalid`, password: 'not-a-real-password-123!' } });
    must(response.status === 401, `unexpected_${response.status}`);
    return { status: response.status };
  });

  owner = await check('AUTH owner signup + email verification + login + session', async () => createVerifiedPilotUser('owner'), { fatal: true });
  employee = await check('AUTH employee signup + verification + login', async () => createVerifiedPilotUser('employee'), { fatal: true });
  outsider = await check('AUTH outsider signup + verification + login', async () => createVerifiedPilotUser('outsider'), { fatal: true });

  await check('AUTH refresh rotation works', async () => {
    const before = owner.jar.get('__Host-pilot_refresh');
    const { response, payload } = await pilotRequest('/api/auth/refresh', { method: 'POST', body: {}, jar: owner.jar });
    const after = owner.jar.get('__Host-pilot_refresh');
    must(response.status === 200 && payload?.authenticated === true && after, `refresh_${response.status}`);
    must(before !== after, 'refresh_token_not_rotated');
    owner.accessToken = owner.jar.get('__Host-pilot_access');
    return { status: response.status, rotated: true };
  });

  businessA = await check('OWNER creates business', async () => {
    const r = await supabaseRest(owner.accessToken, 'pilot_businesses', { method: 'POST', body: {
      slug: `e2e-a-${runId}`.replace(/[^a-z0-9-]/g, '').slice(0, 60), name: 'PILOT E2E Business A', business_type: 'services', owner_id: owner.user.id, locale: 'ar-AE', demo_mode: true,
    }});
    must(r.response.status === 201, `business_insert_${r.response.status}`);
    const row = one(r.payload, 'business'); report.cleanup.business_ids.push(row.id); return row;
  }, { fatal: true });

  await check('OWNER claims owner membership', async () => {
    const r = await supabaseRest(owner.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: businessA.id, user_id: owner.user.id, role: 'owner' } });
    must(r.response.status === 201, `owner_membership_${r.response.status}`); return { status: r.response.status };
  }, { fatal: true });

  businessB = await check('OUTSIDER creates separate tenant', async () => {
    const r = await supabaseRest(outsider.accessToken, 'pilot_businesses', { method: 'POST', body: {
      slug: `e2e-b-${runId}`.replace(/[^a-z0-9-]/g, '').slice(0, 60), name: 'PILOT E2E Business B', business_type: 'services', owner_id: outsider.user.id, locale: 'en', demo_mode: true,
    }});
    must(r.response.status === 201, `business_b_${r.response.status}`);
    const row = one(r.payload, 'business_b'); report.cleanup.business_ids.push(row.id);
    const m = await supabaseRest(outsider.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: row.id, user_id: outsider.user.id, role: 'owner' } });
    must(m.response.status === 201, `business_b_owner_${m.response.status}`); return row;
  }, { fatal: true });

  await check('TENANT owner cannot read foreign tenant', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_businesses?id=eq.${businessB.id}&select=id`);
    must(r.response.status === 200 && Array.isArray(r.payload) && r.payload.length === 0, 'cross_tenant_read_visible'); return { isolated: true };
  });

  await check('OWNER session exposes only own memberships', async () => {
    const s = await pilotRequest('/api/auth/session', { jar: owner.jar });
    must(s.response.status === 200 && s.payload.memberships.some(m => m.business_id === businessA.id && m.role === 'owner'), 'owner_membership_missing');
    must(!s.payload.memberships.some(m => m.business_id === businessB.id), 'foreign_membership_visible'); return { membership_count: s.payload.memberships.length };
  });

  await check('OWNER updates business settings', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_businesses?id=eq.${businessA.id}`, { method: 'PATCH', body: { name: 'PILOT E2E Business A Updated', locale: 'en' } });
    must(r.response.status === 200 && one(r.payload, 'business_update').locale === 'en', `business_update_${r.response.status}`); return { status: r.response.status };
  });

  service = await check('OWNER creates and edits service', async () => {
    let r = await supabaseRest(owner.accessToken, 'pilot_services', { method: 'POST', body: { business_id: businessA.id, name: 'E2E Service', duration_minutes: 30, active: true, metadata: { synthetic: true } } });
    must(r.response.status === 201, `service_create_${r.response.status}`); let row = one(r.payload, 'service');
    r = await supabaseRest(owner.accessToken, `pilot_services?id=eq.${row.id}`, { method: 'PATCH', body: { duration_minutes: 45 } });
    must(r.response.status === 200 && one(r.payload, 'service_update').duration_minutes === 45, `service_update_${r.response.status}`); return row;
  });

  customer = await check('OWNER creates and edits customer', async () => {
    let r = await supabaseRest(owner.accessToken, 'pilot_customers', { method: 'POST', body: { business_id: businessA.id, display_name: 'Synthetic Customer', channel_handle: `e2e-${runId}`, lead_status: 'new', metadata: { synthetic: true } } });
    must(r.response.status === 201, `customer_create_${r.response.status}`); let row = one(r.payload, 'customer');
    r = await supabaseRest(owner.accessToken, `pilot_customers?id=eq.${row.id}`, { method: 'PATCH', body: { lead_status: 'qualified' } });
    must(r.response.status === 200 && one(r.payload, 'customer_update').lead_status === 'qualified', `customer_update_${r.response.status}`); return row;
  });

  conversation = await check('OWNER creates conversation and message', async () => {
    let r = await supabaseRest(owner.accessToken, 'pilot_conversations', { method: 'POST', body: { business_id: businessA.id, customer_id: customer.id, channel_type: 'web', state: 'ai_active', demo_mode: true } });
    must(r.response.status === 201, `conversation_create_${r.response.status}`); const c = one(r.payload, 'conversation');
    r = await supabaseRest(owner.accessToken, 'pilot_messages', { method: 'POST', body: { business_id: businessA.id, conversation_id: c.id, sender_type: 'customer', body: 'ابا موعد باجر العصر', intent: 'APPOINTMENT_REQUEST', simulated: true } });
    must(r.response.status === 201, `message_create_${r.response.status}`); const msg = one(r.payload, 'message');
    const denied = await supabaseRest(owner.accessToken, `pilot_messages?id=eq.${msg.id}`, { method: 'PATCH', body: { body: 'tampered' } });
    must(denied.response.status >= 400, 'message_update_was_allowed'); return c;
  });

  await check('OWNER creates and cancels appointment', async () => {
    let r = await supabaseRest(owner.accessToken, 'pilot_appointments', { method: 'POST', body: { business_id: businessA.id, customer_id: customer.id, service_id: service.id, starts_at: new Date(Date.now() + 86400000).toISOString(), status: 'requested', simulated: true } });
    must(r.response.status === 201, `appointment_create_${r.response.status}`); const row = one(r.payload, 'appointment');
    r = await supabaseRest(owner.accessToken, `pilot_appointments?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
    must(r.response.status === 200 && one(r.payload, 'appointment_update').status === 'cancelled', `appointment_cancel_${r.response.status}`); return { status: r.response.status };
  });

  await check('OWNER creates automation follow-up', async () => {
    const r = await supabaseRest(owner.accessToken, 'pilot_followups', { method: 'POST', body: { business_id: businessA.id, conversation_id: conversation.id, customer_id: customer.id, channel_type: 'web', reason: 'E2E follow-up', status: 'CANDIDATE', confidence: 0.9, policy_state: 'NOT_CHECKED', consent_state: 'UNKNOWN', channel_policy_state: 'UNKNOWN', quiet_hours_state: 'UNKNOWN', metadata: { synthetic: true } } });
    must(r.response.status === 201, `followup_create_${r.response.status}`); return { status: r.response.status };
  });

  channel = await check('OWNER configures channel truth state', async () => {
    const r = await supabaseRest(owner.accessToken, 'pilot_channels', { method: 'POST', body: { business_id: businessA.id, channel_type: 'web', status: 'configured', metadata: { synthetic: true } } });
    must(r.response.status === 201, `channel_create_${r.response.status}`); return one(r.payload, 'channel');
  });

  await check('SECURITY client cannot self-declare channel CONNECTED', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_channels?id=eq.${channel.id}`, { method: 'PATCH', body: { status: 'connected' } });
    must(r.response.status >= 400 || (Array.isArray(r.payload) && r.payload.length === 0), 'client_can_falsify_connected_state'); return { denied: true };
  });

  await check('PRIVACY owner submits export request but cannot complete it', async () => {
    let r = await supabaseRest(owner.accessToken, 'pilot_privacy_requests', { method: 'POST', body: { business_id: businessA.id, request_type: 'BUSINESS_EXPORT', status: 'REQUESTED', requested_by: owner.user.id, correlation_id: `e2e:${runId}`, request_scope: { synthetic: true } } });
    must(r.response.status === 201, `privacy_request_${r.response.status}`); const row = one(r.payload, 'privacy');
    r = await supabaseRest(owner.accessToken, `pilot_privacy_requests?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'COMPLETED' } });
    must(r.response.status >= 400 || (Array.isArray(r.payload) && r.payload.length === 0), 'client_completed_privacy_request'); return { protected: true };
  });

  await check('OWNER adds employee as STAFF', async () => {
    const r = await supabaseRest(owner.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: businessA.id, user_id: employee.user.id, role: 'staff' } });
    must(r.response.status === 201, `staff_add_${r.response.status}`); return { status: r.response.status };
  });

  await check('STAFF sees assigned membership', async () => {
    const s = await pilotRequest('/api/auth/session', { jar: employee.jar });
    must(s.response.status === 200 && s.payload.memberships.some(m => m.business_id === businessA.id && m.role === 'staff'), 'staff_membership_missing'); return { role: 'staff' };
  });

  await check('STAFF can manage appointment', async () => {
    const r = await supabaseRest(employee.accessToken, 'pilot_appointments', { method: 'POST', body: { business_id: businessA.id, customer_id: customer.id, service_id: service.id, starts_at: new Date(Date.now() + 172800000).toISOString(), status: 'requested', simulated: true } });
    must(r.response.status === 201, `staff_appointment_${r.response.status}`); return { allowed: true };
  });

  await check('STAFF cannot manage team', async () => {
    const r = await supabaseRest(employee.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: businessA.id, user_id: outsider.user.id, role: 'viewer' } });
    must(r.response.status >= 400, 'staff_team_write_allowed'); return { denied: true };
  });

  await check('STAFF cannot manage integrations', async () => {
    const r = await supabaseRest(employee.accessToken, `pilot_channels?id=eq.${channel.id}`, { method: 'PATCH', body: { status: 'failed' } });
    must(r.response.status >= 400 || (Array.isArray(r.payload) && r.payload.length === 0), 'staff_integration_write_allowed'); return { denied: true };
  });

  await check('OWNER changes employee to VIEWER', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.user.id}`, { method: 'PATCH', body: { role: 'viewer' } });
    must(r.response.status === 200 && one(r.payload, 'viewer_role').role === 'viewer', `viewer_role_${r.response.status}`); return { role: 'viewer' };
  });

  await check('VIEWER can read but cannot create customer', async () => {
    const read = await supabaseRest(employee.accessToken, `pilot_customers?id=eq.${customer.id}&select=id`);
    must(read.response.status === 200 && read.payload.length === 1, 'viewer_read_denied');
    const write = await supabaseRest(employee.accessToken, 'pilot_customers', { method: 'POST', body: { business_id: businessA.id, display_name: 'Should Fail', lead_status: 'new' } });
    must(write.response.status >= 400, 'viewer_customer_write_allowed'); return { read: true, write_denied: true };
  });

  await check('OWNER changes employee to MANAGER', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.user.id}`, { method: 'PATCH', body: { role: 'manager' } });
    must(r.response.status === 200 && one(r.payload, 'manager_role').role === 'manager', `manager_role_${r.response.status}`); return { role: 'manager' };
  });

  await check('MANAGER manages service but cannot manage team', async () => {
    const svc = await supabaseRest(employee.accessToken, 'pilot_services', { method: 'POST', body: { business_id: businessA.id, name: 'Manager Service', duration_minutes: 15, active: true, metadata: { synthetic: true } } });
    must(svc.response.status === 201, `manager_service_${svc.response.status}`);
    const team = await supabaseRest(employee.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: businessA.id, user_id: outsider.user.id, role: 'viewer' } });
    must(team.response.status >= 400, 'manager_team_write_allowed'); return { service_allowed: true, team_denied: true };
  });

  await check('OWNER changes employee to ADMIN', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.user.id}`, { method: 'PATCH', body: { role: 'admin' } });
    must(r.response.status === 200 && one(r.payload, 'admin_role').role === 'admin', `admin_role_${r.response.status}`); return { role: 'admin' };
  });

  await check('ADMIN can add VIEWER but cannot elevate OWNER', async () => {
    let r = await supabaseRest(employee.accessToken, 'pilot_memberships', { method: 'POST', body: { business_id: businessA.id, user_id: outsider.user.id, role: 'viewer' } });
    must(r.response.status === 201, `admin_add_viewer_${r.response.status}`);
    r = await supabaseRest(employee.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${outsider.user.id}`, { method: 'PATCH', body: { role: 'owner' } });
    must(r.response.status >= 400 || (Array.isArray(r.payload) && r.payload.length === 0), 'admin_elevated_owner');
    const del = await supabaseRest(employee.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${outsider.user.id}`, { method: 'DELETE' });
    must([200, 204].includes(del.response.status), `admin_remove_viewer_${del.response.status}`); return { team_management: true, owner_protected: true };
  });

  await check('OWNER cannot delete own owner membership', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${owner.user.id}`, { method: 'DELETE' });
    must(r.response.status >= 400, 'owner_membership_deletion_allowed'); return { protected: true };
  });

  await check('TENANT employee cannot read outsider tenant', async () => {
    const r = await supabaseRest(employee.accessToken, `pilot_businesses?id=eq.${businessB.id}&select=id`);
    must(r.response.status === 200 && Array.isArray(r.payload) && r.payload.length === 0, 'employee_cross_tenant_visible'); return { isolated: true };
  });

  await check('AUTH logout clears session and relogin succeeds', async () => { await logoutAndRelogin(owner); return { cleared_and_restored: true }; });

  await check('OWNER removes employee membership', async () => {
    const r = await supabaseRest(owner.accessToken, `pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.user.id}`, { method: 'DELETE' });
    must([200, 204].includes(r.response.status), `remove_employee_${r.response.status}`); return { removed: true };
  });

  await check('EMPLOYEE session no longer has removed business', async () => {
    const s = await pilotRequest('/api/auth/session', { jar: employee.jar });
    must(s.response.status === 200 && !s.payload.memberships.some(m => m.business_id === businessA.id), 'removed_membership_still_visible'); return { removed: true };
  });
} catch (error) {
  fatalError = error;
} finally {
  for (const user of [owner, employee, outsider]) if (user?.mailbox) await deleteMailbox(user.mailbox);
  report.finished_at = new Date().toISOString();
  report.summary = {
    passed: report.steps.filter(s => s.ok).length,
    failed: report.steps.filter(s => !s.ok).length,
    fatal: fatalError ? safeError(fatalError) : null,
  };
  fs.writeFileSync('e2e-report.json', JSON.stringify(report, null, 2));
  console.log(`E2E_REPORT_JSON=${JSON.stringify(report)}`);
}

if (fatalError || report.summary.failed > 0) process.exitCode = 1;
