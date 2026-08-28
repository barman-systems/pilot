import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

const sendRoute = read('api/dabbir-tiktok-send.js');
const statusRoute = read('api/dabbir-tiktok-status.js');
const pilotPage = read('api/dabbir-tiktok-pilot.js');
const apiFiles = fs.readdirSync(new URL('api/', root)).filter(name => name.endsWith('.js'));

test('TikTok live send route is fail-closed until durable duplicate safety exists', () => {
  assert.match(sendRoute, /TIKTOK_SEND_SAFETY_GATE_REQUIRED/);
  assert.match(sendRoute, /state:\s*'SAFETY_BLOCKED'/);
  assert.match(sendRoute, /live_send_enabled:\s*false/);
  assert.match(sendRoute, /external_side_effects:\s*false/);
  assert.doesNotMatch(sendRoute, /sendTikTokText/);
});

test('TikTok status cannot advertise send readiness while the safety gate is blocked', () => {
  assert.match(statusRoute, /messaging_send_scope:\s*status\.messaging_send === true/);
  assert.match(statusRoute, /messaging_send:\s*false/);
  assert.match(statusRoute, /messaging_ready:\s*false/);
  assert.match(statusRoute, /live_send_enabled:\s*false/);
  assert.match(statusRoute, /send_blocker:\s*SEND_SAFETY_BLOCKER/);
  assert.match(pilotPage, /disabled=!st\.messaging_send/);
});

test('no HTTP route invokes TikTok live send while containment is active', () => {
  const callers = apiFiles
    .filter(name => !name.startsWith('_'))
    .filter(name => read(`api/${name}`).includes('sendTikTokText'));
  assert.deepEqual(callers, []);
});
