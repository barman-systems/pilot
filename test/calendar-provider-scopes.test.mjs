import test from 'node:test';
import assert from 'node:assert/strict';
import { providerConfig } from '../api/_calendar-core.js';

const GOOGLE_ID = ['DABBIR','GOOGLE','CALENDAR','CLIENT','ID'].join('_');
const GOOGLE_SECRET = ['DABBIR','GOOGLE','CALENDAR','CLIENT','SECRET'].join('_');
const MICROSOFT_ID = ['DABBIR','MICROSOFT','CALENDAR','CLIENT','ID'].join('_');
const MICROSOFT_SECRET = ['DABBIR','MICROSOFT','CALENDAR','CLIENT','SECRET'].join('_');
const keys = [GOOGLE_ID, GOOGLE_SECRET, MICROSOFT_ID, MICROSOFT_SECRET];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
for (const key of keys) process.env[key] = 'configured-for-scope-test';

test.after(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

const req = { headers: { host: 'dabbir.bmalman.com', 'x-forwarded-proto': 'https' } };

test('Google calendar OAuth requests event read/write without full calendar administration', () => {
  const config = providerConfig('google', req);
  assert.equal(config.configured, true);
  assert.ok(config.scopes.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(!config.scopes.includes('https://www.googleapis.com/auth/calendar'));
});

test('Microsoft calendar OAuth retains delegated event read/write access', () => {
  const config = providerConfig('outlook', req);
  assert.equal(config.configured, true);
  assert.ok(config.scopes.includes('Calendars.ReadWrite'));
});
